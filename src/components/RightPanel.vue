<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import { useBatchStore } from "@/stores/batch";
import { useTauriCommands } from "@/composables/useTauriCommands";
import { renderFullRes, type ExportFormat } from "@/composables/useCanvas";

const imageStore = useImageStore();
const watermarkStore = useWatermarkStore();
const batchStore = useBatchStore();
const { exportFile, loadImageRaw, listSystemFonts } = useTauriCommands();

// Load system fonts on mount
onMounted(async () => {
  if (watermarkStore.fontsLoaded) return;
  try {
    watermarkStore.systemFonts = await listSystemFonts();
    watermarkStore.fontsLoaded = true;
  } catch (e) {
    console.error("Failed to list system fonts:", e);
  }
});

const exporting = ref(false);
const exportError = ref("");
const exportFormat = ref<ExportFormat>("png");
const logoError = ref("");
const fontError = ref("");

const watermarkTypes = [
  { label: "文字水印", value: "text" as const },
  { label: "Logo 水印", value: "logo" as const },
];

async function selectLogo() {
  logoError.value = "";
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }],
    });
    if (selected) {
      const path = selected as string;
      const raw = await loadImageRaw(path);
      watermarkStore.logoConfig.logo_base64 = raw.base64;
      watermarkStore.logoFormat = raw.format;
    }
  } catch (e) {
    logoError.value = `Logo 加载失败: ${e}`;
    console.error("Failed to load logo:", e);
  }
}

async function loadFontFromPath(path: string) {
  // Read font file as raw bytes
  const raw = await loadImageRaw(path);

  // Determine MIME from extension
  const ext = path.split(".").pop()?.toLowerCase();
  const mime = ext === "otf" ? "font/otf" : "font/ttf";

  // Derive font family name from filename
  const fileName = path.split(/[\\/]/).pop() ?? "CustomFont";
  const familyName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, " ");

  // Register font via FontFace API
  const fontFace = new FontFace(familyName, `url(data:${mime};base64,${raw.base64})`);
  await fontFace.load();
  document.fonts.add(fontFace);

  watermarkStore.fontFamily = familyName;
  watermarkStore.fontPath = path;
}

async function selectFont() {
  fontError.value = "";
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Fonts", extensions: ["ttf", "otf", "ttc"] }],
    });
    if (!selected) return;
    await loadFontFromPath(selected as string);
  } catch (e) {
    fontError.value = `字体加载失败: ${e}`;
    console.error("Failed to load font:", e);
  }
}

async function onFontSelect(e: Event) {
  fontError.value = "";
  const path = (e.target as HTMLSelectElement).value;
  if (!path) {
    // Reset to system default
    watermarkStore.fontFamily = "Arial, sans-serif";
    return;
  }
  if (path === "__browse__") {
    await selectFont();
    return;
  }
  try {
    await loadFontFromPath(path);
  } catch (err) {
    fontError.value = `字体加载失败: ${err}`;
    console.error("Failed to load font:", err);
  }
}

async function handleExport() {
  if (!imageStore.currentImage) return;

  exporting.value = true;
  exportError.value = "";

  try {
    const ext = exportFormat.value;
    const { save } = await import("@tauri-apps/plugin-dialog");
    const savePath = await save({
      filters: [
        { name: ext === "png" ? "PNG (无损)" : "JPEG", extensions: [ext] },
      ],
      defaultPath: `watermarked.${ext}`,
    });

    if (!savePath) {
      exporting.value = false;
      return;
    }

    // Render at full original resolution with chosen format
    const result = await renderFullRes(exportFormat.value);
    await exportFile(result, savePath);

    alert(`导出成功: ${savePath}`);
  } catch (e) {
    exportError.value = `导出失败: ${e}`;
  } finally {
    exporting.value = false;
  }
}

function addToBatch() {
  if (imageStore.filePath) {
    batchStore.addFiles([imageStore.filePath]);
  }
}
</script>

<template>
  <div class="right-panel">
    <h3 class="panel-title">水印设置</h3>

    <div class="type-tabs">
      <button
        v-for="wt in watermarkTypes"
        :key="wt.value"
        :class="['tab-btn', { active: watermarkStore.watermarkType === wt.value }]"
        @click="watermarkStore.setType(wt.value)"
      >
        {{ wt.label }}
      </button>
    </div>

    <label class="toggle-label">
      <input type="checkbox" v-model="watermarkStore.enabled" />
      启用水印
    </label>

    <!-- Text watermark settings -->
    <div v-if="watermarkStore.watermarkType === 'text'" class="config-group">
      <label>
        文字内容
        <input type="text" v-model="watermarkStore.textConfig.text" class="input" />
      </label>
      <label>
        字体
        <select class="font-select" @change="onFontSelect">
          <option value="">Arial (系统默认)</option>
          <option
            v-for="f in watermarkStore.systemFonts"
            :key="f.path"
            :value="f.path"
          >{{ f.name }}</option>
          <option value="__browse__">手动选择字体文件...</option>
        </select>
        <span class="font-current">{{ watermarkStore.fontFamily }}</span>
        <p v-if="fontError" class="error-msg">{{ fontError }}</p>
      </label>
      <label>
        字体大小
        <input
          type="range"
          min="12"
          max="500"
          v-model.number="watermarkStore.textConfig.font_size"
        />
        <span class="range-val">{{ watermarkStore.textConfig.font_size }}px</span>
      </label>
      <label>
        旋转角度
        <input
          type="range"
          min="0"
          max="360"
          step="1"
          v-model.number="watermarkStore.textConfig.rotation"
        />
        <span class="range-val">{{ watermarkStore.textConfig.rotation }}°</span>
      </label>
      <label>
        透明度
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          v-model.number="watermarkStore.textConfig.opacity"
        />
        <span class="range-val">{{ Math.round(watermarkStore.textConfig.opacity * 100) }}%</span>
      </label>
      <label>
        水平位置
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="watermarkStore.textConfig.pos_x"
        />
      </label>
      <label>
        垂直位置
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="watermarkStore.textConfig.pos_y"
        />
      </label>
      <label>
        平铺间距 (0=不平铺)
        <input
          type="range"
          min="0"
          max="400"
          step="10"
          v-model.number="watermarkStore.textConfig.tile_spacing"
        />
        <span class="range-val">{{ watermarkStore.textConfig.tile_spacing }}px</span>
      </label>
    </div>

    <!-- Logo watermark settings -->
    <div v-if="watermarkStore.watermarkType === 'logo'" class="config-group">
      <button class="btn btn-sm" @click="selectLogo">选择 Logo 图片</button>
      <p v-if="watermarkStore.logoConfig.logo_base64" class="logo-loaded">Logo 已加载</p>
      <p v-if="logoError" class="error-msg">{{ logoError }}</p>
      <label>
        透明度
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          v-model.number="watermarkStore.logoConfig.opacity"
        />
        <span class="range-val">{{ Math.round(watermarkStore.logoConfig.opacity * 100) }}%</span>
      </label>
      <label>
        缩放（占照片宽度百分比）
        <div class="scale-row">
          <input
            type="range"
            min="5"
            max="100"
            step="1"
            v-model.number="watermarkStore.logoConfig.scale"
            class="scale-slider"
          />
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            v-model.number="watermarkStore.logoConfig.scale"
            class="scale-input"
          />
          <span class="range-val">{{ watermarkStore.logoConfig.scale }}%</span>
        </div>
      </label>
      <label>
        水平位置
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="watermarkStore.logoConfig.pos_x"
        />
      </label>
      <label>
        垂直位置
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="watermarkStore.logoConfig.pos_y"
        />
      </label>
    </div>

    <!-- Export -->
    <div class="export-section">
      <h4>导出</h4>

      <div class="format-select">
        <label class="radio-label">
          <input type="radio" value="png" v-model="exportFormat" />
          PNG (无损)
        </label>
        <label class="radio-label">
          <input type="radio" value="jpeg" v-model="exportFormat" />
          JPEG
        </label>
      </div>

      <button class="btn btn-primary" @click="handleExport" :disabled="!imageStore.hasImage || exporting">
        {{ exporting ? "导出中..." : "导出单张图片" }}
      </button>
      <button class="btn" @click="addToBatch" :disabled="!imageStore.filePath">
        加入批处理队列
      </button>
      <div v-if="exportError" class="error-msg">{{ exportError }}</div>
    </div>
  </div>
</template>

<style scoped>
.right-panel {
  width: 260px;
  min-width: 220px;
  padding: 12px;
  border-left: 1px solid #333;
  overflow-y: auto;
}

.type-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.tab-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid #444;
  background: #1a1a1a;
  color: #ccc;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}

.tab-btn.active {
  background: #2a5a3a;
  border-color: #3a7a4a;
  color: #fff;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  cursor: pointer;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-group label {
  font-size: 13px;
  color: #aaa;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input {
  background: #1e1e1e;
  border: 1px solid #444;
  color: #ddd;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
}

input[type="range"] {
  width: 100%;
  accent-color: #4a9;
}

.font-select {
  background: #1e1e1e;
  border: 1px solid #444;
  color: #ddd;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 100%;
}
.font-current {
  font-size: 12px;
  color: #4a9;
}

.font-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.font-name {
  font-size: 12px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scale-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.scale-slider {
  flex: 1;
}
.scale-input {
  width: 62px;
  background: #1e1e1e;
  border: 1px solid #444;
  color: #ddd;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.range-val {
  font-size: 12px;
  color: #888;
}

.logo-loaded {
  color: #4a9;
  font-size: 12px;
}

.export-section {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-section h4 {
  margin: 0;
  font-size: 14px;
}

.format-select {
  display: flex;
  gap: 16px;
  margin-bottom: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #ccc;
}
</style>
