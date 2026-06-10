<script setup lang="ts">
import { ref } from "vue";
import { useImageStore } from "@/stores/image";
import { useBatchStore } from "@/stores/batch";
import { useWatermarkStore } from "@/stores/watermark";
import { useTauriCommands } from "@/composables/useTauriCommands";
import { renderFullRes, type ExportFormat } from "@/composables/useCanvas";

const imageStore = useImageStore();
const batchStore = useBatchStore();
const watermarkStore = useWatermarkStore();
const { exportFile } = useTauriCommands();

const exporting = ref(false);
const exportError = ref("");
const exportFormat = ref<ExportFormat>("png");

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
    batchStore.addFiles([imageStore.filePath], watermarkStore.snapshotConfig());
  }
}
</script>

<template>
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
</template>

<style scoped>
.export-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
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
</style>
