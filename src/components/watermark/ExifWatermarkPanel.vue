<script setup lang="ts">
import { computed } from "vue";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import { useFontLoader } from "@/composables/useFontLoader";
import { rgbToHex, hexToRgb } from "@/utils/colorConvert";
import { getTradeMarkBrandName } from "@/utils/tradeMarks";
import ExifFieldStylePanel from "@/components/watermark/ExifFieldStylePanel.vue";

const imageStore = useImageStore();
const watermarkStore = useWatermarkStore();
const { fontError, onFontSelect } = useFontLoader();

/** Detected trade mark brand for the current image, or null */
const detectedBrand = computed(() =>
  getTradeMarkBrandName(imageStore.exifData?.camera_make)
);

// ── Color hex bindings ──

const exifColorHex = computed({
  get: () => rgbToHex(watermarkStore.exifConfig.color.slice(0, 3) as [number, number, number]),
  set: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    watermarkStore.exifConfig.color[0] = r;
    watermarkStore.exifConfig.color[1] = g;
    watermarkStore.exifConfig.color[2] = b;
  },
});

const exifStrokeColorHex = computed({
  get: () => rgbToHex(watermarkStore.exifConfig.stroke_color),
  set: (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    watermarkStore.exifConfig.stroke_color = [r, g, b];
  },
});

// ── Field definitions ──

const exifFieldDefs = [
  { key: "camera_model" as const, label: "相机型号" },
  { key: "lens_model" as const, label: "镜头" },
  { key: "focal_length" as const, label: "焦距" },
  { key: "aperture" as const, label: "光圈" },
  { key: "shutter_speed" as const, label: "快门" },
  { key: "iso" as const, label: "ISO" },
  { key: "date_taken" as const, label: "拍摄日期" },
  { key: "gps" as const, label: "GPS 位置" },
];

const fieldStyleGroups: { key: "camera_model" | "lens_model" | "date_taken" | "gps" | "inline"; label: string }[] = [
  { key: "camera_model", label: "相机型号" },
  { key: "lens_model", label: "镜头" },
  { key: "date_taken", label: "拍摄日期" },
  { key: "gps", label: "GPS 位置" },
  { key: "inline", label: "参数行 (焦距/光圈/快门/ISO)" },
];
</script>

<template>
  <div class="config-group">
    <p v-if="!imageStore.exifData" class="hint-msg">
      当前图片不含 EXIF 元数据，打开一张 JPEG 照片以使用此功能。
    </p>

    <div class="section-title">显示字段</div>
    <div class="checkbox-grid">
      <label
        v-for="fd in exifFieldDefs"
        :key="fd.key"
        class="checkbox-label"
      >
        <input
          type="checkbox"
          v-model="watermarkStore.exifConfig.fields[fd.key]"
        />
        {{ fd.label }}
      </label>
    </div>

    <!-- Trade mark logo replacement (camera model → manufacturer logo) -->
    <div v-if="detectedBrand" class="trade-mark-section">
      <div class="section-title">
        商标 Logo
        <span class="brand-badge">{{ detectedBrand }}</span>
      </div>
      <label class="checkbox-label">
        <input
          type="checkbox"
          v-model="watermarkStore.exifConfig.trade_mark_enabled"
        />
        将相机型号替换为 {{ detectedBrand }} 商标图片
      </label>
      <label v-if="watermarkStore.exifConfig.trade_mark_enabled">
        商标大小
        <input
          type="range"
          min="5"
          max="60"
          step="1"
          v-model.number="watermarkStore.exifConfig.trade_mark_scale"
        />
        <span class="range-val">{{ watermarkStore.exifConfig.trade_mark_scale }}%</span>
      </label>
    </div>
    <p v-else-if="imageStore.exifData" class="hint-msg">
      当前相机品牌（{{ imageStore.exifData.camera_make }}）无对应商标图片。支持: Canon、Nikon、Sony。
    </p>

    <div class="section-title">布局模式</div>
    <div class="layout-tabs">
      <label class="radio-label">
        <input
          type="radio"
          value="unified"
          v-model="watermarkStore.exifConfig.layout_mode"
        />
        统一布局
      </label>
      <label class="radio-label">
        <input
          type="radio"
          value="independent"
          v-model="watermarkStore.exifConfig.layout_mode"
        />
        独立布局
      </label>
    </div>

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
        max="15"
        step="0.1"
        v-model.number="watermarkStore.exifConfig.font_size"
      />
      <span class="range-val">{{ watermarkStore.exifConfig.font_size }}%</span>
    </label>
    <label class="color-label">
      文字颜色
      <div class="color-row">
        <input type="color" v-model="exifColorHex" class="color-input" />
        <span class="color-hex">{{ exifColorHex }}</span>
      </div>
    </label>
    <label>
      描边宽度
      <input
        type="range"
        min="0"
        max="20"
        step="0.5"
        v-model.number="watermarkStore.exifConfig.stroke_width"
      />
      <span class="range-val">{{ watermarkStore.exifConfig.stroke_width }}px</span>
    </label>
    <label v-if="watermarkStore.exifConfig.stroke_width > 0" class="color-label">
      描边颜色
      <div class="color-row">
        <input type="color" v-model="exifStrokeColorHex" class="color-input" />
        <span class="color-hex">{{ exifStrokeColorHex }}</span>
      </div>
    </label>
    <label>
      旋转角度
      <input
        type="range"
        min="0"
        max="360"
        step="1"
        v-model.number="watermarkStore.exifConfig.rotation"
      />
      <span class="range-val">{{ watermarkStore.exifConfig.rotation }}°</span>
    </label>
    <label>
      透明度
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        v-model.number="watermarkStore.exifConfig.opacity"
      />
      <span class="range-val">{{ Math.round(watermarkStore.exifConfig.opacity * 100) }}%</span>
    </label>

    <!-- Position controls — unified mode only -->
    <template v-if="watermarkStore.exifConfig.layout_mode === 'unified'">
      <label>
        水平位置
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="watermarkStore.exifConfig.pos_x"
        />
        <span class="range-val">{{ Math.round(watermarkStore.exifConfig.pos_x * 100) }}%</span>
      </label>
      <label>
        垂直位置
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="watermarkStore.exifConfig.pos_y"
        />
        <span class="range-val">{{ Math.round(watermarkStore.exifConfig.pos_y * 100) }}%</span>
      </label>
      <label>
        平铺间距 (0=不平铺)
        <input
          type="range"
          min="0"
          max="400"
          step="10"
          v-model.number="watermarkStore.exifConfig.tile_spacing"
        />
        <span class="range-val">{{ watermarkStore.exifConfig.tile_spacing }}px</span>
      </label>
    </template>

    <!-- Independent mode: per-field style panels -->
    <div v-else class="field-styles-section">
      <ExifFieldStylePanel
        v-for="g in fieldStyleGroups"
        :key="g.key"
        :group-key="g.key"
        :group-label="g.label"
      />
    </div>
  </div>
</template>

<style scoped>
.trade-mark-section {
  margin: 8px 0;
  padding: 8px;
  background: #1a2a1a;
  border: 1px solid #2a4a2a;
  border-radius: 4px;
}

.brand-badge {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  background: #3a6a3a;
  color: #cfc;
  border-radius: 3px;
  margin-left: 6px;
  font-weight: normal;
}
</style>
