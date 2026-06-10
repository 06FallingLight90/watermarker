<script setup lang="ts">
import { ref } from "vue";
import { useWatermarkStore } from "@/stores/watermark";
import { useTauriCommands } from "@/composables/useTauriCommands";

const watermarkStore = useWatermarkStore();
const { loadImageRaw } = useTauriCommands();

const logoError = ref("");

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
</script>

<template>
  <div class="config-group">
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
      <span class="range-val">{{ Math.round(watermarkStore.logoConfig.pos_x * 100) }}%</span>
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
      <span class="range-val">{{ Math.round(watermarkStore.logoConfig.pos_y * 100) }}%</span>
    </label>
  </div>
</template>
