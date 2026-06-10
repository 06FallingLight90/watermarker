import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { TextWatermarkConfig, LogoWatermarkConfig, ExifWatermarkConfig, ExifFieldVisibility, ExifFieldStyle, ExifFieldGroup, WatermarkType, FontEntry, BatchWatermarkConfig } from "@/types";

const STORAGE_KEY = "watermarker-config";

const defaultExifFields = (): ExifFieldVisibility => ({
  camera_model: true,
  lens_model: true,
  focal_length: true,
  aperture: true,
  shutter_speed: true,
  iso: true,
  date_taken: true,
  gps: true,
});

const EXIF_STYLE_GROUPS: ExifFieldGroup[] = [
  "camera_model", "lens_model", "date_taken", "gps", "inline",
];

function defaultFieldStyle(py: number): ExifFieldStyle {
  return {
    font_size: 3.5,
    color: [255, 255, 255, 200],
    opacity: 0.8,
    stroke_color: [0, 0, 0],
    stroke_width: 0,
    pos_x: 0.5,
    pos_y: py,
    rotation: 0,
  };
}

function defaultFieldStyles(): Record<ExifFieldGroup, ExifFieldStyle> {
  return {
    camera_model: defaultFieldStyle(0.15),
    lens_model: defaultFieldStyle(0.30),
    date_taken: defaultFieldStyle(0.45),
    gps: defaultFieldStyle(0.60),
    inline: defaultFieldStyle(0.75),
  };
}

export const useWatermarkStore = defineStore("watermark", () => {
  const watermarkType = ref<WatermarkType>("text");

  const textConfig = ref<TextWatermarkConfig>({
    text: "Watermark",
    font_size: 5,
    color: [255, 255, 255, 200],
    rotation: 0,
    pos_x: 0.5,
    pos_y: 0.5,
    opacity: 0.8,
    tile_spacing: 0,
    stroke_color: [0, 0, 0],
    stroke_width: 0,
  });

  const logoConfig = ref<LogoWatermarkConfig>({
    logo_base64: "",
    opacity: 0.8,
    scale: 30, // percentage of photo width (1–100)
    pos_x: 0.5,
    pos_y: 0.5,
    rotation: 0,
  });

  const exifConfig = ref<ExifWatermarkConfig>({
    font_size: 3.5,
    color: [255, 255, 255, 200],
    rotation: 0,
    pos_x: 0.5,
    pos_y: 0.5,
    opacity: 0.8,
    tile_spacing: 0,
    stroke_color: [0, 0, 0],
    stroke_width: 0,
    layout_mode: "unified",
    fields: defaultExifFields(),
    field_styles: defaultFieldStyles(),
    trade_mark_enabled: true,
    trade_mark_scale: 15,
  });

  /// MIME format of the loaded logo image ("png" | "jpeg"), used to decode raw base64
  const logoFormat = ref<string>("png");

  /// CSS font-family name loaded from a user-selected font file
  const fontFamily = ref<string>("Arial, sans-serif");

  /// System-installed fonts detected on app launch
  const systemFonts = ref<FontEntry[]>([]);

  /// Whether system font list has been loaded
  const fontsLoaded = ref(false);

  function detectDefaultFont(): string {
    const p = navigator.platform.toLowerCase();
    if (p.includes("win")) return "C:/Windows/Fonts/arial.ttf";
    if (p.includes("mac")) return "/System/Library/Fonts/Helvetica.ttf";
    return "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  }

  const fontPath = ref<string>(detectDefaultFont());

  const enabled = ref(true);

  const currentConfig = computed(() => {
    switch (watermarkType.value) {
      case "text": return textConfig.value;
      case "logo": return logoConfig.value;
      case "exif": return exifConfig.value;
    }
  });

  function setType(type: WatermarkType) {
    watermarkType.value = type;
  }

  // ── Batch per-image config support ──

  /** When true, saveToStorage() is skipped (used during batch-config loading) */
  const suppressSave = ref(false);

  // Timer handle for debounced auto-save (also referenced by loadSnapshot)
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Export the current watermark configuration as a complete snapshot */
  function snapshotConfig(): BatchWatermarkConfig {
    return JSON.parse(JSON.stringify({
      watermarkType: watermarkType.value,
      textConfig: textConfig.value,
      logoConfig: logoConfig.value,
      exifConfig: exifConfig.value,
      logoFormat: logoFormat.value,
      fontFamily: fontFamily.value,
      fontPath: fontPath.value,
      enabled: enabled.value,
    }));
  }

  /** Load a BatchWatermarkConfig snapshot into the store (suppresses persistence) */
  function loadSnapshot(config: BatchWatermarkConfig) {
    // Clear any pending auto-save so it doesn't fire after we re-enable
    if (saveTimer) clearTimeout(saveTimer);
    suppressSave.value = true;

    watermarkType.value = config.watermarkType;
    Object.assign(textConfig.value, config.textConfig);
    Object.assign(logoConfig.value, config.logoConfig);
    // Deep merge exifConfig
    if (config.exifConfig.fields) {
      Object.assign(exifConfig.value.fields, config.exifConfig.fields);
      delete (config.exifConfig as unknown as Record<string, unknown>).fields;
    }
    if (config.exifConfig.field_styles) {
      for (const key of EXIF_STYLE_GROUPS) {
        if ((config.exifConfig.field_styles as Record<string, ExifFieldStyle>)[key]) {
          Object.assign(
            exifConfig.value.field_styles[key],
            (config.exifConfig.field_styles as Record<string, ExifFieldStyle>)[key]
          );
        }
      }
      delete (config.exifConfig as unknown as Record<string, unknown>).field_styles;
    }
    Object.assign(exifConfig.value, config.exifConfig);
    logoFormat.value = config.logoFormat;
    fontFamily.value = config.fontFamily;
    fontPath.value = config.fontPath;
    enabled.value = config.enabled;

    // Re-enable persistence after the debounce window passes
    setTimeout(() => {
      suppressSave.value = false;
    }, 500);
  }

  // ── Persistence ──

  function saveToStorage() {
    if (suppressSave.value) return;
    // Deep-copy field_styles (nested reactive objects with arrays)
    const stylesCopy: Record<string, ExifFieldStyle> = {};
    for (const key of EXIF_STYLE_GROUPS) {
      stylesCopy[key] = { ...exifConfig.value.field_styles[key] };
    }
    const data: Record<string, unknown> = {
      watermarkType: watermarkType.value,
      textConfig: { ...textConfig.value },
      exifConfig: {
        ...exifConfig.value,
        fields: { ...exifConfig.value.fields },
        field_styles: stylesCopy,
      },
      enabled: enabled.value,
      fontPath: fontPath.value,
      fontFamily: fontFamily.value,
      logoFormat: logoFormat.value,
    };
    // Exclude logo_base64 — can be MB in size
    data.logoConfig = (({ logo_base64: _, ...rest }) => rest)(logoConfig.value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save watermark config:", e);
    }
  }

  /** Migrate absolute-px font_size (>30) to relative percentage (≈ old/10) */
  function migrateFontSize(obj: Record<string, unknown> | undefined, key = "font_size") {
    if (!obj) return;
    const v = obj[key];
    if (typeof v === "number" && v > 30) {
      obj[key] = Math.round((v / 10) * 10) / 10;
    }
  }

  function restoreFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      // Migrate old absolute font_size values to relative %
      migrateFontSize(data.textConfig);
      migrateFontSize(data.exifConfig);
      if (data.exifConfig?.field_styles) {
        for (const key of EXIF_STYLE_GROUPS) {
          migrateFontSize(data.exifConfig.field_styles[key]);
        }
      }

      if (data.watermarkType) watermarkType.value = data.watermarkType;
      if (data.textConfig) Object.assign(textConfig.value, data.textConfig);
      if (data.exifConfig) {
        if (data.exifConfig.fields) {
          Object.assign(exifConfig.value.fields, data.exifConfig.fields);
          delete data.exifConfig.fields;
        }
        if (data.exifConfig.field_styles) {
          for (const key of EXIF_STYLE_GROUPS) {
            if (data.exifConfig.field_styles[key]) {
              Object.assign(exifConfig.value.field_styles[key], data.exifConfig.field_styles[key]);
            }
          }
          delete data.exifConfig.field_styles;
        }
        Object.assign(exifConfig.value, data.exifConfig);
      }
      if (data.enabled !== undefined) enabled.value = data.enabled;
      if (data.fontPath) fontPath.value = data.fontPath;
      if (data.fontFamily) fontFamily.value = data.fontFamily;
      if (data.logoFormat) logoFormat.value = data.logoFormat;
      if (data.logoConfig) {
        // Restore logo params but clear base64 — user must re-select the file
        Object.assign(logoConfig.value, data.logoConfig, { logo_base64: "" });
      }
    } catch (e) {
      console.warn("Failed to restore watermark config:", e);
    }
  }

  restoreFromStorage();

  // Debounced auto-save on any config change
  watch(
    [watermarkType, textConfig, logoConfig, exifConfig, enabled, fontPath, fontFamily, logoFormat],
    () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToStorage, 300);
    },
    { deep: true }
  );

  return {
    watermarkType,
    textConfig,
    logoConfig,
    exifConfig,
    logoFormat,
    fontFamily,
    fontPath,
    systemFonts,
    fontsLoaded,
    enabled,
    currentConfig,
    setType,
    snapshotConfig,
    loadSnapshot,
  };
});
