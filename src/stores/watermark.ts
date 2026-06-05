import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { TextWatermarkConfig, LogoWatermarkConfig, WatermarkType, FontEntry } from "@/types";

const STORAGE_KEY = "watermarker-config";

export const useWatermarkStore = defineStore("watermark", () => {
  const watermarkType = ref<WatermarkType>("text");

  const textConfig = ref<TextWatermarkConfig>({
    text: "Watermark",
    font_size: 48,
    color: [255, 255, 255, 200],
    rotation: 0,
    pos_x: 0.5,
    pos_y: 0.5,
    opacity: 0.8,
    tile_spacing: 0,
  });

  const logoConfig = ref<LogoWatermarkConfig>({
    logo_base64: "",
    opacity: 0.8,
    scale: 30, // percentage of photo width (1–100)
    pos_x: 0.5,
    pos_y: 0.5,
    rotation: 0,
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

  const currentConfig = computed(() =>
    watermarkType.value === "text" ? textConfig.value : logoConfig.value
  );

  function setType(type: WatermarkType) {
    watermarkType.value = type;
  }

  // ── Persistence ──

  function saveToStorage() {
    const data: Record<string, unknown> = {
      watermarkType: watermarkType.value,
      textConfig: { ...textConfig.value },
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

  function restoreFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.watermarkType) watermarkType.value = data.watermarkType;
      if (data.textConfig) Object.assign(textConfig.value, data.textConfig);
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
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    [watermarkType, textConfig, logoConfig, enabled, fontPath, fontFamily, logoFormat],
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
    logoFormat,
    fontFamily,
    fontPath,
    systemFonts,
    fontsLoaded,
    enabled,
    currentConfig,
    setType,
  };
});
