<script setup lang="ts">
import { ref, computed } from "vue";
import type { ExifFieldGroup } from "@/types";
import { useWatermarkStore } from "@/stores/watermark";
import { rgbToHex, hexToRgb } from "@/utils/colorConvert";

const props = defineProps<{
  groupKey: ExifFieldGroup;
  groupLabel: string;
}>();

const watermarkStore = useWatermarkStore();
const expanded = ref(false);

function toggle() {
  expanded.value = !expanded.value;
}

const colorHex = computed({
  get: () => rgbToHex(
    watermarkStore.exifConfig.field_styles[props.groupKey].color.slice(0, 3) as [number, number, number]
  ),
  set: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    const c = watermarkStore.exifConfig.field_styles[props.groupKey].color;
    c[0] = r; c[1] = g; c[2] = b;
  },
});

const strokeColorHex = computed({
  get: () => rgbToHex(watermarkStore.exifConfig.field_styles[props.groupKey].stroke_color),
  set: (hex: string) => {
    watermarkStore.exifConfig.field_styles[props.groupKey].stroke_color = hexToRgb(hex);
  },
});

const style = computed(() => watermarkStore.exifConfig.field_styles[props.groupKey]);
</script>

<template>
  <div class="field-style-panel">
    <div class="field-style-header" @click="toggle">
      <span class="arrow">{{ expanded ? '▼' : '▶' }}</span>
      <span>{{ groupLabel }}</span>
    </div>
    <div v-if="expanded" class="field-style-body">
      <label>
        水平位置
        <input type="range" min="0" max="1" step="0.01" v-model.number="style.pos_x" />
        <span class="range-val">{{ Math.round(style.pos_x * 100) }}%</span>
      </label>
      <label>
        垂直位置
        <input type="range" min="0" max="1" step="0.01" v-model.number="style.pos_y" />
        <span class="range-val">{{ Math.round(style.pos_y * 100) }}%</span>
      </label>
      <label>
        字体大小
        <input type="range" min="0.5" max="15" step="0.1" v-model.number="style.font_size" />
        <span class="range-val">{{ style.font_size }}%</span>
      </label>
      <label class="color-label">
        文字颜色
        <div class="color-row">
          <input type="color" v-model="colorHex" class="color-input" />
          <span class="color-hex">{{ colorHex }}</span>
        </div>
      </label>
      <label>
        透明度
        <input type="range" min="0" max="1" step="0.05" v-model.number="style.opacity" />
        <span class="range-val">{{ Math.round(style.opacity * 100) }}%</span>
      </label>
      <label>
        描边宽度
        <input type="range" min="0" max="20" step="0.5" v-model.number="style.stroke_width" />
        <span class="range-val">{{ style.stroke_width }}px</span>
      </label>
      <label v-if="style.stroke_width > 0" class="color-label">
        描边颜色
        <div class="color-row">
          <input type="color" v-model="strokeColorHex" class="color-input" />
          <span class="color-hex">{{ strokeColorHex }}</span>
        </div>
      </label>
      <label>
        旋转角度
        <input type="range" min="0" max="360" step="1" v-model.number="style.rotation" />
        <span class="range-val">{{ style.rotation }}°</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.field-styles-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.field-style-panel {
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.field-style-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: #1a1a1a;
  cursor: pointer;
  font-size: 12px;
  color: #ccc;
  user-select: none;
}

.field-style-header:hover {
  background: #222;
}

.field-style-header .arrow {
  font-size: 10px;
  width: 12px;
  text-align: center;
  color: #888;
}

.field-style-body {
  padding: 4px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: #141414;
}
</style>
