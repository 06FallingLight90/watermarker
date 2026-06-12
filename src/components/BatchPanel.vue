<script setup lang="ts">
import { ref } from "vue";
import { useBatchStore } from "@/stores/batch";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import { useTauriCommands } from "@/composables/useTauriCommands";
import { renderOffscreenWithConfig, type ExportFormat } from "@/composables/useWatermarkDrawing";

const batchStore = useBatchStore();
const imageStore = useImageStore();
const watermarkStore = useWatermarkStore();
const { exportFile, loadImage: loadImageCmd, loadImageRaw, readExif } = useTauriCommands();

const expanded = ref(false);
const outputDir = ref("");
const batchFormat = ref<ExportFormat>("png");

async function selectFiles() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "bmp", "webp"] }],
    });
    if (selected) {
      const files = Array.isArray(selected) ? selected : [selected as string];
      // All files get the current watermark config as their default
      batchStore.addFiles(files, watermarkStore.snapshotConfig());

      // Auto-load the first file into preview if no image is currently displayed
      if (!imageStore.hasImage) {
        await openBatchFile(0);
      }
    }
  } catch (e) {
    console.error("Failed to select files:", e);
  }
}

/** Click a file in the queue — save previous config, load new image + config */
async function openBatchFile(idx: number) {
  // Already viewing this file — no-op
  if (batchStore.activeIndex === idx) return;

  // Save current watermark config to previously active entry
  if (batchStore.activeIndex !== null && batchStore.activeIndex !== idx) {
    batchStore.updateEntryConfig(batchStore.activeIndex, watermarkStore.snapshotConfig());
  }

  batchStore.setActive(idx);
  const entry = batchStore.entries[idx];

  try {
    // 1. Load watermark config FIRST (so renderPreview uses correct config)
    watermarkStore.loadSnapshot(entry.config);

    // 2. Load EXIF BEFORE image (so image-change watcher renders with correct EXIF)
    try {
      const exif = await readExif(entry.path);
      imageStore.setExif(exif);
    } catch {
      // EXIF is optional — clear stale EXIF from previous image
      imageStore.setExif(null);
    }

    // 3. Load image (watchers in useCanvas auto-trigger renderPreview with correct EXIF)
    const info = await loadImageCmd(entry.path);
    imageStore.setImage(info, entry.path);
  } catch (e) {
    console.error("Failed to open batch file:", e);
  }
}

async function selectOutputDir() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择输出目录",
    });
    if (selected) {
      outputDir.value = selected as string;
    }
  } catch (e) {
    console.error("Failed to select output dir:", e);
  }
}

async function startBatch() {
  if (batchStore.entries.length === 0) return;
  if (!outputDir.value) {
    await selectOutputDir();
    if (!outputDir.value) return;
  }

  // Save current config to active entry before processing
  if (batchStore.activeIndex !== null) {
    batchStore.updateEntryConfig(batchStore.activeIndex, watermarkStore.snapshotConfig());
  }

  batchStore.setProcessing(true);
  batchStore.progressList.length = 0;

  const total = batchStore.entries.length;
  let completed = 0;

  for (let i = 0; i < batchStore.entries.length; i++) {
    const entry = batchStore.entries[i];
    const fileName = entry.path.split(/[\\/]/).pop() ?? entry.path;

    batchStore.updateProgress({
      current: i + 1,
      total,
      file_name: fileName,
      status: "processing",
      error: null,
    });

    try {
      const raw = await loadImageRaw(entry.path);
      const sourceMime = `image/${raw.format || "jpeg"}`;

      // Read EXIF data if watermark type is exif
      let exif = null;
      if (entry.config.watermarkType === "exif") {
        try {
          exif = await readExif(entry.path);
        } catch {
          // EXIF is optional — proceed without it
        }
      }

      const base64 = await renderOffscreenWithConfig(
        raw.base64, batchFormat.value, entry.config, sourceMime, exif
      );

      const ext = batchFormat.value;
      const outPath = `${outputDir.value}/watermarked_${fileName.replace(/\.[^.]+$/, "")}.${ext}`;
      await exportFile(base64, outPath);

      batchStore.updateProgress({
        current: i + 1,
        total,
        file_name: fileName,
        status: "done",
        error: null,
      });
      completed++;
    } catch (e) {
      batchStore.updateProgress({
        current: i + 1,
        total,
        file_name: fileName,
        status: "error",
        error: String(e),
      });
    }
  }

  batchStore.setProcessing(false);
  alert(`批处理完成: ${completed}/${total} 张图片已处理`);
}

/** Apply the current preview watermark config to all files in the queue */
function applyCurrentConfigToAll() {
  if (batchStore.entries.length === 0) return;
  const config = watermarkStore.snapshotConfig();
  batchStore.applyConfigToAll(config);
}

function removeFile(index: number) {
  batchStore.removeFile(index);
}
</script>

<template>
  <div class="batch-panel" :class="{ expanded }">
    <div class="batch-header" @click="expanded = !expanded">
      <span>批处理队列 ({{ batchStore.totalFiles }} 个文件)</span>
      <span class="toggle-icon">{{ expanded ? "▼" : "▲" }}</span>
    </div>

    <div v-if="expanded" class="batch-body">
      <div class="batch-actions">
        <button class="btn btn-sm" @click="selectFiles">添加文件</button>
        <button class="btn btn-sm" @click="selectOutputDir">
          {{ outputDir ? "输出: " + outputDir.split(/[\\/]/).pop() : "选择输出目录" }}
        </button>

        <button
          class="btn btn-sm"
          @click="applyCurrentConfigToAll"
          :disabled="batchStore.totalFiles === 0 || batchStore.isProcessing"
          title="将当前预览中的水印设置应用到队列中所有图片"
        >
          应用当前设置到全部
        </button>

        <div class="format-select">
          <label class="radio-label">
            <input type="radio" value="png" v-model="batchFormat" :disabled="batchStore.isProcessing" />
            PNG
          </label>
          <label class="radio-label">
            <input type="radio" value="jpeg" v-model="batchFormat" :disabled="batchStore.isProcessing" />
            JPEG
          </label>
        </div>

        <button
          class="btn btn-sm btn-primary"
          @click="startBatch"
          :disabled="batchStore.totalFiles === 0 || batchStore.isProcessing"
        >
          {{ batchStore.isProcessing ? "处理中..." : "开始批处理" }}
        </button>
      </div>

      <div v-if="batchStore.isProcessing" class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: (batchStore.completedFiles / batchStore.totalFiles * 100) + '%' }"
        />
        <span class="progress-text">
          {{ batchStore.completedFiles + batchStore.errorFiles }} / {{ batchStore.totalFiles }}
        </span>
      </div>

      <ul v-if="batchStore.entries.length > 0" class="file-list">
        <li
          v-for="(entry, idx) in batchStore.entries"
          :key="entry.path"
          class="file-item"
          :class="{ active: batchStore.activeIndex === idx }"
        >
          <span
            class="file-name"
            @click="openBatchFile(idx)"
            :title="'点击预览: ' + entry.path"
          >
            {{ entry.path.split(/[\\/]/).pop() }}
          </span>
          <span
            v-if="batchStore.progressList[idx]?.status === 'done'"
            class="status done"
          >OK</span>
          <span
            v-else-if="batchStore.progressList[idx]?.status === 'error'"
            class="status error"
            :title="batchStore.progressList[idx]?.error ?? ''"
          >ERR</span>
          <button class="btn-remove" @click="removeFile(idx)">x</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.batch-panel {
  border-top: 1px solid #333;
  background: #121212;
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
}

.batch-header:hover {
  background: #1a1a1a;
}

.batch-body {
  padding: 0 16px 12px;
}

.batch-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.format-select {
  display: flex;
  gap: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
}

.progress-bar {
  height: 22px;
  background: #222;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: #3a7a4a;
  transition: width 0.3s;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  color: #fff;
}

.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 13px;
  border-bottom: 1px solid #1a1a1a;
  border-radius: 3px;
  transition: background 0.15s;
}

.file-item:hover {
  background: #1e1e1e;
}

.file-item.active {
  background: #1a3a2a;
  border-left: 3px solid #3a7a4a;
  padding-left: 3px;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: #ccc;
}

.file-item.active .file-name {
  color: #4a9;
}

.status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
}

.status.done {
  background: #2a5a2a;
  color: #8f8;
}

.status.error {
  background: #5a2a2a;
  color: #f88;
}

.btn-remove {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}

.btn-remove:hover {
  color: #f44;
}
</style>
