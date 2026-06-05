import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import type { TextWatermarkConfig, LogoWatermarkConfig, RawImageData } from "@/types";

export type ExportFormat = "png" | "jpeg";

// ── Module-level export helpers (no DOM-ref dependency) ──

/**
 * Render at full original resolution to an offscreen canvas.
 * Returns base64 data (without data-URI prefix).
 * Callable from any component; uses Pinia stores directly.
 */
export async function renderFullRes(format: ExportFormat): Promise<string> {
  const imageStore = useImageStore();
  const watermarkStore = useWatermarkStore();
  const filePath = imageStore.filePath;
  if (!filePath) throw new Error("No image loaded");

  // Load original file bytes (no re-encoding loss) for full-resolution export
  const raw = await invoke<RawImageData>("load_image_raw", { path: filePath });
  const sourceMime = `image/${raw.format || "jpeg"}`;
  const mainImg = await loadImageFromBase64(raw.base64, sourceMime);
  const w = mainImg.width;
  const h = mainImg.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(mainImg, 0, 0);
  await renderWatermarkStatic(ctx, canvas, 1.0, watermarkStore);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "png" ? undefined : 1.0;
  return canvas.toDataURL(mime, quality).split(",")[1] ?? "";
}

/** Render a single file given its base64 data. Used by batch processing. */
export async function renderOffscreen(
  imageBase64: string,
  format: ExportFormat,
  watermarkStore: ReturnType<typeof useWatermarkStore>,
  sourceMime?: string
): Promise<string> {
  const mainImg = await loadImageFromBase64(imageBase64, sourceMime);
  const { width: w, height: h } = mainImg;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(mainImg, 0, 0);
  await renderWatermarkStatic(ctx, canvas, 1.0, watermarkStore);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "png" ? undefined : 1.0;
  return canvas.toDataURL(mime, quality).split(",")[1] ?? "";
}

/** Helper: load an Image from a base64 string (without data-URI prefix) */
export function loadImageFromBase64(
  base64: string,
  mime = "image/jpeg"
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = `data:${mime};base64,${base64}`;
  });
}

// ── Shared watermark drawing (used by both composable & module functions) ──

async function renderWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scale: number,
  watermarkStore: ReturnType<typeof useWatermarkStore>
): Promise<void> {
  if (!watermarkStore.enabled) return;

  if (watermarkStore.watermarkType === "text") {
    drawTextWatermarkStatic(ctx, canvas, watermarkStore.textConfig, scale, watermarkStore.fontFamily);
  } else if (
    watermarkStore.watermarkType === "logo" &&
    watermarkStore.logoConfig.logo_base64
  ) {
    await drawLogoWatermarkStatic(ctx, canvas, watermarkStore.logoConfig, scale, watermarkStore.logoFormat);
  }
}

function drawTextWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: TextWatermarkConfig,
  scale: number,
  fontFamily = "Arial, sans-serif"
): void {
  const { text, font_size, color, pos_x, pos_y, opacity, tile_spacing, rotation } = config;
  const [r, g, b, a] = color;
  const alpha = opacity > 0 ? opacity : a / 255;

  const scaledSize = font_size * scale;
  ctx.font = `${scaledSize}px "${fontFamily}", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = pos_x * canvas.width;
  const y = pos_y * canvas.height;
  const angle = (rotation ?? 0) * Math.PI / 180;

  if (tile_spacing > 0) {
    const spacing = Math.max(tile_spacing * scale, 50);
    const textW = ctx.measureText(text).width;
    for (let row = 0; row < canvas.height + scaledSize; row += spacing + scaledSize) {
      for (let col = 0; col < canvas.width + textW; col += spacing + textW) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.translate(col, row);
        if (angle !== 0) ctx.rotate(angle);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }
  } else {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.translate(x, y);
    if (angle !== 0) ctx.rotate(angle);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

async function drawLogoWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: LogoWatermarkConfig,
  _renderScale: number,
  format = "png"
): Promise<void> {
  const { logo_base64, opacity, scale, pos_x, pos_y } = config;
  const mime = `image/${format}`;
  const logoImg = await loadImageFromBase64(logo_base64, mime);

  // scale is now a percentage of the photo's width (1–100).
  // canvas.width embeds the current render scale, so this works for both preview and export.
  const logoW = canvas.width * (scale / 100);
  const aspectRatio = logoImg.width / logoImg.height;
  const logoH = logoW / aspectRatio;
  const x = pos_x * canvas.width - logoW / 2;
  const y = pos_y * canvas.height - logoH / 2;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(logoImg, x, y, logoW, logoH);
  ctx.restore();
}

// ── Composable (for the visible preview canvas + reactivity) ──

export function useCanvas() {
  const imageStore = useImageStore();
  const watermarkStore = useWatermarkStore();

  const isLoading = ref(false);
  const canvasRef = ref<HTMLCanvasElement | null>(null);

  async function renderPreview(): Promise<void> {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = imageStore.currentImage;
    if (!img) return;

    isLoading.value = true;

    const mainImg = await loadImageFromBase64(img.base64);

    const container = canvas.parentElement;
    const maxW = container?.clientWidth ?? 1280;
    const maxH = container?.clientHeight ?? 720;
    const scale = Math.min(maxW / mainImg.width, maxH / mainImg.height, 1.0);
    canvas.width = mainImg.width * scale;
    canvas.height = mainImg.height * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(mainImg, 0, 0, canvas.width, canvas.height);
    await renderWatermarkStatic(ctx, canvas, scale, watermarkStore);

    imageStore.renderedBase64 =
      canvas.toDataURL("image/jpeg", 0.95).split(",")[1] ?? "";

    isLoading.value = false;
  }

  watch(
    () => imageStore.currentImage,
    () => {
      if (imageStore.hasImage) renderPreview();
    }
  );
  watch(
    () => watermarkStore.$state,
    () => {
      if (imageStore.hasImage) renderPreview();
    },
    { deep: true }
  );

  return { renderPreview, canvasRef, isLoading };
}
