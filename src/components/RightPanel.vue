<script setup lang="ts">
import { onMounted } from "vue";
import { useWatermarkStore } from "@/stores/watermark";
import { useFontLoader } from "@/composables/useFontLoader";
import { preloadTradeMarks } from "@/utils/tradeMarks";
import TextWatermarkPanel from "@/components/watermark/TextWatermarkPanel.vue";
import LogoWatermarkPanel from "@/components/watermark/LogoWatermarkPanel.vue";
import ExifWatermarkPanel from "@/components/watermark/ExifWatermarkPanel.vue";
import ExportSection from "@/components/export/ExportSection.vue";

const watermarkStore = useWatermarkStore();
const { loadSystemFonts } = useFontLoader();

// Load system font list and trade mark images on mount (once)
onMounted(() => {
  loadSystemFonts();
  preloadTradeMarks();
});

const watermarkTypes = [
  { label: "文字水印", value: "text" as const },
  { label: "Logo 水印", value: "logo" as const },
  { label: "EXIF 水印", value: "exif" as const },
];
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
    <TextWatermarkPanel v-if="watermarkStore.watermarkType === 'text'" />

    <!-- Logo watermark settings -->
    <LogoWatermarkPanel v-if="watermarkStore.watermarkType === 'logo'" />

    <!-- EXIF watermark settings -->
    <ExifWatermarkPanel v-if="watermarkStore.watermarkType === 'exif'" />

    <!-- Export -->
    <ExportSection />
  </div>
</template>

<style scoped>
.right-panel {
  width: 260px;
  min-width: 220px;
  padding: 12px;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
</style>
