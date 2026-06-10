<script setup lang="ts">
import { computed } from "vue";
import { useWatermarkStore } from "@/stores/watermark";
import { useFontLoader } from "@/composables/useFontLoader";
import { rgbToHex, hexToRgb } from "@/utils/colorConvert";

const watermarkStore = useWatermarkStore();
const { fontError, onFontSelect } = useFontLoader();

// ── Color hex bindings ──

const fillColorHex = computed({
  get: () => rgbToHex(watermarkStore.textConfig.color.slice(0, 3) as [number, number, number]),
  set: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    watermarkStore.textConfig.color[0] = r;
    watermarkStore.textConfig.color[1] = g;
    watermarkStore.textConfig.color[2] = b;
  },
});

const strokeColorHex = computed({
  get: () => rgbToHex(watermarkStore.textConfig.stroke_color),
  set: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    watermarkStore.textConfig.stroke_color = [r, g, b];
  },
});
</script>

<template>
  <div class="config-group">
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
        min="0.5"
        max="20"
        step="0.1"
        v-model.number="watermarkStore.textConfig.font_size"
      />
      <span class="range-val">{{ watermarkStore.textConfig.font_size }}%</span>
    </label>
    <label class="color-label">
      文字颜色
      <div class="color-row">
        <input type="color" v-model="fillColorHex" class="color-input" />
        <span class="color-hex">{{ fillColorHex }}</span>
      </div>
    </label>
    <label>
      描边宽度
      <input
        type="range"
        min="0"
        max="20"
        step="0.5"
        v-model.number="watermarkStore.textConfig.stroke_width"
      />
      <span class="range-val">{{ watermarkStore.textConfig.stroke_width }}px</span>
    </label>
    <label v-if="watermarkStore.textConfig.stroke_width > 0" class="color-label">
      描边颜色
      <div class="color-row">
        <input type="color" v-model="strokeColorHex" class="color-input" />
        <span class="color-hex">{{ strokeColorHex }}</span>
      </div>
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
      <span class="range-val">{{ Math.round(watermarkStore.textConfig.pos_x * 100) }}%</span>
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
      <span class="range-val">{{ Math.round(watermarkStore.textConfig.pos_y * 100) }}%</span>
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
</template>
