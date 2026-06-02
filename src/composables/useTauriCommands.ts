import { invoke } from "@tauri-apps/api/core";
import type {
  ImageInfo,
  ExifData,
  TextWatermarkConfig,
  LogoWatermarkConfig,
  WatermarkResult,
} from "@/types";

export function useTauriCommands() {
  async function loadImage(path: string): Promise<ImageInfo> {
    return invoke<ImageInfo>("load_image", { path });
  }

  async function saveImage(
    imageData: Uint8Array,
    width: number,
    height: number,
    outputPath: string,
    quality?: number
  ): Promise<void> {
    return invoke("save_image", {
      imageData: Array.from(imageData),
      width,
      height,
      outputPath,
      quality,
    });
  }

  async function readExif(path: string): Promise<ExifData> {
    return invoke<ExifData>("read_exif", { path });
  }

  async function applyTextWatermark(
    imageBase64: string,
    config: TextWatermarkConfig,
    fontPath: string
  ): Promise<WatermarkResult> {
    return invoke<WatermarkResult>("apply_text_watermark", {
      imageBase64,
      config,
      fontPath,
    });
  }

  async function applyLogoWatermark(
    imageBase64: string,
    config: LogoWatermarkConfig
  ): Promise<WatermarkResult> {
    return invoke<WatermarkResult>("apply_logo_watermark", {
      imageBase64,
      config,
    });
  }

  async function exportFile(base64: string, outputPath: string): Promise<void> {
    return invoke("export_file", { base64, outputPath });
  }

  return { loadImage, saveImage, readExif, applyTextWatermark, applyLogoWatermark, exportFile };
}
