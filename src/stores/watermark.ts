import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { TextWatermarkConfig, LogoWatermarkConfig, WatermarkType } from "@/types";

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
    scale: 1.0,
    pos_x: 0.5,
    pos_y: 0.5,
    rotation: 0,
  });

  function detectDefaultFont(): string {
    // Navigator-based platform detection for the frontend default
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

  return {
    watermarkType,
    textConfig,
    logoConfig,
    fontPath,
    enabled,
    currentConfig,
    setType,
  };
});
