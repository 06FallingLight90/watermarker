<script setup lang="ts">
import { ref } from "vue";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import { useBatchStore } from "@/stores/batch";
import { useTauriCommands } from "@/composables/useTauriCommands";
import { renderFullRes, type ExportFormat } from "@/composables/useCanvas";

const imageStore = useImageStore();
const watermarkStore = useWatermarkStore();
const batchStore = useBatchStore();
const { exportFile } = useTauriCommands();

const exporting = ref(false);
const exportError = ref("");
const exportFormat = ref<ExportFormat>("png");

const watermarkTypes = [
  { label: "文字水印", value: "text" as const },
  { label: "Logo 水印", value: "logo" as const },
];

async function selectLogo() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }],
    });
    if (selected) {
      const path = selected as string;
      const { invoke } = await import("@tauri-apps/api/core");
      const info = await invoke<{ base64: string }>("load_image", { path });
      watermarkStore.logoConfig.logo_base64 = info.base64;
    }
  } catch (e) {
    console.error("Failed to load logo:", e);
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
        字体大小
        <input
          type="range"
          min="12"
          max="200"
          v-model.number="watermarkStore.textConfig.font_size"
        />
        <span class="range-val">{{ watermarkStore.textConfig.font_size }}px</span>
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
        缩放
        <input
          type="range"
          min="0.1"
          max="2"
          step="0.05"
          v-model.number="watermarkStore.logoConfig.scale"
        />
        <span class="range-val">{{ Math.round(watermarkStore.logoConfig.scale * 100) }}%</span>
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
