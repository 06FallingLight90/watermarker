<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { ExifFieldGroup } from "@/types";
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

// ── Color helpers: convert between hex string (#rrggbb) and [r,g,b] tuple ──

function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

// ── Text watermark color bindings ──

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

// ── EXIF watermark color bindings ──

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

// ── EXIF field definitions ──

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

// ── Independent mode: per-field style panels ──

const fieldStyleGroups: { key: ExifFieldGroup; label: string }[] = [
  { key: "camera_model", label: "相机型号" },
  { key: "lens_model", label: "镜头" },
  { key: "date_taken", label: "拍摄日期" },
  { key: "gps", label: "GPS 位置" },
  { key: "inline", label: "参数行 (焦距/光圈/快门/ISO)" },
];

const expandedStylePanel = ref<string>("");

function toggleStylePanel(key: string) {
  expandedStylePanel.value = expandedStylePanel.value === key ? "" : key;
}

// Pre-generate color hex bindings for each field group
function makeFieldColorHex(groupKey: ExifFieldGroup) {
  return computed({
    get: () => rgbToHex(
      watermarkStore.exifConfig.field_styles[groupKey].color.slice(0, 3) as [number, number, number]
    ),
    set: (hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      const c = watermarkStore.exifConfig.field_styles[groupKey].color;
      c[0] = r; c[1] = g; c[2] = b;
    },
  });
}

function makeFieldStrokeColorHex(groupKey: ExifFieldGroup) {
  return computed({
    get: () => rgbToHex(watermarkStore.exifConfig.field_styles[groupKey].stroke_color),
    set: (hex: string) => {
      watermarkStore.exifConfig.field_styles[groupKey].stroke_color = hexToRgb(hex);
    },
  });
}

const fieldColorHexes: Record<string, ReturnType<typeof makeFieldColorHex>> = {};
const fieldStrokeColorHexes: Record<string, ReturnType<typeof makeFieldStrokeColorHex>> = {};

for (const g of fieldStyleGroups) {
  fieldColorHexes[g.key] = makeFieldColorHex(g.key);
  fieldStrokeColorHexes[g.key] = makeFieldStrokeColorHex(g.key);
}

const watermarkTypes = [
  { label: "文字水印", value: "text" as const },
  { label: "Logo 水印", value: "logo" as const },
  { label: "EXIF 水印", value: "exif" as const },
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

    <!-- EXIF watermark settings -->
    <div v-if="watermarkStore.watermarkType === 'exif'" class="config-group">
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
        <div
          v-for="g in fieldStyleGroups"
          :key="g.key"
          class="field-style-panel"
        >
          <div class="field-style-header" @click="toggleStylePanel(g.key)">
            <span class="arrow">{{ expandedStylePanel === g.key ? '▼' : '▶' }}</span>
            <span>{{ g.label }}</span>
          </div>
          <div v-if="expandedStylePanel === g.key" class="field-style-body">
            <label>
              水平位置
              <input
                type="range" min="0" max="1" step="0.01"
                v-model.number="watermarkStore.exifConfig.field_styles[g.key].pos_x"
              />
            </label>
            <label>
              垂直位置
              <input
                type="range" min="0" max="1" step="0.01"
                v-model.number="watermarkStore.exifConfig.field_styles[g.key].pos_y"
              />
            </label>
            <label>
              字体大小
              <input
                type="range" min="0.5" max="15" step="0.1"
                v-model.number="watermarkStore.exifConfig.field_styles[g.key].font_size"
              />
              <span class="range-val">{{ watermarkStore.exifConfig.field_styles[g.key].font_size }}%</span>
            </label>
            <label class="color-label">
              文字颜色
              <div class="color-row">
                <input type="color" v-model="fieldColorHexes[g.key]" class="color-input" />
                <span class="color-hex">{{ fieldColorHexes[g.key] }}</span>
              </div>
            </label>
            <label>
              透明度
              <input
                type="range" min="0" max="1" step="0.05"
                v-model.number="watermarkStore.exifConfig.field_styles[g.key].opacity"
              />
              <span class="range-val">{{ Math.round(watermarkStore.exifConfig.field_styles[g.key].opacity * 100) }}%</span>
            </label>
            <label>
              描边宽度
              <input
                type="range" min="0" max="20" step="0.5"
                v-model.number="watermarkStore.exifConfig.field_styles[g.key].stroke_width"
              />
              <span class="range-val">{{ watermarkStore.exifConfig.field_styles[g.key].stroke_width }}px</span>
            </label>
            <label v-if="watermarkStore.exifConfig.field_styles[g.key].stroke_width > 0" class="color-label">
              描边颜色
              <div class="color-row">
                <input type="color" v-model="fieldStrokeColorHexes[g.key]" class="color-input" />
                <span class="color-hex">{{ fieldStrokeColorHexes[g.key] }}</span>
              </div>
            </label>
            <label>
              旋转角度
              <input
                type="range" min="0" max="360" step="1"
                v-model.number="watermarkStore.exifConfig.field_styles[g.key].rotation"
              />
              <span class="range-val">{{ watermarkStore.exifConfig.field_styles[g.key].rotation }}°</span>
            </label>
          </div>
        </div>
      </div>
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

.config-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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

/* ── Color picker styles ── */

.color-label {
  flex-direction: column;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.color-input {
  width: 32px;
  height: 28px;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 1px;
  background: #1e1e1e;
  cursor: pointer;
}

.color-hex {
  font-size: 12px;
  color: #888;
  font-family: monospace;
}

/* ── EXIF field checkboxes ── */

.section-title {
  font-size: 13px;
  color: #aaa;
  font-weight: 600;
  padding-top: 4px;
  border-top: 1px solid #2a2a2a;
}

.checkbox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #ccc;
  cursor: pointer;
  flex-direction: row !important;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #4a9;
  width: auto;
}

/* ── Layout mode radio ── */

.layout-tabs {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #ccc;
}

.hint-msg {
  font-size: 12px;
  color: #888;
  font-style: italic;
  margin: 0;
}

/* ── Per-field style panels (independent mode) ── */

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

/* ── Export section ── */

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
