import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import type { TextWatermarkConfig, LogoWatermarkConfig, ExifWatermarkConfig, ExifFieldVisibility, ExifFieldStyle, ExifFieldGroup, ExifData, RawImageData } from "@/types";

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
  await renderWatermarkStatic(ctx, canvas, 1.0, watermarkStore, imageStore.exifData);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "png" ? undefined : 1.0;
  return canvas.toDataURL(mime, quality).split(",")[1] ?? "";
}

/** Render a single file given its base64 data. Used by batch processing. */
export async function renderOffscreen(
  imageBase64: string,
  format: ExportFormat,
  watermarkStore: ReturnType<typeof useWatermarkStore>,
  sourceMime?: string,
  exifData?: ExifData | null
): Promise<string> {
  const mainImg = await loadImageFromBase64(imageBase64, sourceMime);
  const { width: w, height: h } = mainImg;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(mainImg, 0, 0);
  await renderWatermarkStatic(ctx, canvas, 1.0, watermarkStore, exifData ?? null);

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
  watermarkStore: ReturnType<typeof useWatermarkStore>,
  exifData: ExifData | null
): Promise<void> {
  if (!watermarkStore.enabled) return;

  if (watermarkStore.watermarkType === "text") {
    drawTextWatermarkStatic(ctx, canvas, watermarkStore.textConfig, scale, watermarkStore.fontFamily);
  } else if (
    watermarkStore.watermarkType === "logo" &&
    watermarkStore.logoConfig.logo_base64
  ) {
    await drawLogoWatermarkStatic(ctx, canvas, watermarkStore.logoConfig, scale, watermarkStore.logoFormat);
  } else if (watermarkStore.watermarkType === "exif") {
    drawExifWatermarkStatic(ctx, canvas, watermarkStore.exifConfig, scale, watermarkStore.fontFamily, exifData);
  }
}

function drawTextWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: TextWatermarkConfig,
  scale: number,
  fontFamily = "Arial, sans-serif"
): void {
  const { text, font_size, color, pos_x, pos_y, opacity, tile_spacing, rotation, stroke_color, stroke_width } = config;
  const [r, g, b, a] = color;
  const alpha = opacity > 0 ? opacity : a / 255;

  const scaledSize = (font_size / 100) * canvas.width;
  ctx.font = `${scaledSize}px "${fontFamily}", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = pos_x * canvas.width;
  const y = pos_y * canvas.height;
  const angle = (rotation ?? 0) * Math.PI / 180;
  const hasStroke = stroke_width > 0;

  /** Draw text at (tx, ty) with current transform */
  function drawTextAt(tx: number, ty: number): void {
    if (hasStroke) {
      const [sr, sg, sb] = stroke_color;
      ctx.strokeStyle = `rgb(${sr},${sg},${sb})`;
      ctx.lineWidth = stroke_width * scale;
      ctx.strokeText(text, tx, ty);
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillText(text, tx, ty);
  }

  if (tile_spacing > 0) {
    const ts = Math.max(tile_spacing * scale, 50);
    const textW = ctx.measureText(text).width;
    for (let row = 0; row < canvas.height + scaledSize; row += ts + scaledSize) {
      for (let col = 0; col < canvas.width + textW; col += ts + textW) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(col, row);
        if (angle !== 0) ctx.rotate(angle);
        drawTextAt(0, 0);
        ctx.restore();
      }
    }
  } else {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (angle !== 0) ctx.rotate(angle);
    drawTextAt(0, 0);
    ctx.restore();
  }
}

// ── EXIF watermark drawing ──

function getExifFieldValue(key: keyof ExifFieldVisibility, exif: ExifData): string | null {
  if (key === "gps") {
    if (exif.gps_latitude || exif.gps_longitude) {
      return [exif.gps_latitude, exif.gps_longitude].filter(Boolean).join(", ");
    }
    return null;
  }
  const val = exif[key as keyof ExifData];
  return typeof val === "string" ? val : null;
}

/** Fields that are combined into a single line in unified mode */
const INLINE_FIELDS: (keyof ExifFieldVisibility)[] = [
  "focal_length", "aperture", "shutter_speed", "iso",
];

/** Remaining fields displayed as separate lines, in display order */
const BLOCK_FIELDS: (keyof ExifFieldVisibility)[] = [
  "camera_model", "lens_model", "date_taken", "gps",
];

function buildExifTexts(
  fields: ExifFieldVisibility,
  exif: ExifData
): { text: string; group: ExifFieldGroup }[] {
  const items: { text: string; group: ExifFieldGroup }[] = [];

  // Block fields: one per line
  for (const key of BLOCK_FIELDS) {
    if (!fields[key]) continue;
    const value = getExifFieldValue(key, exif);
    if (value) items.push({ text: value, group: key as ExifFieldGroup });
  }

  // Inline fields: combined into a single space-separated line
  const inlineParts: string[] = [];
  for (const key of INLINE_FIELDS) {
    if (!fields[key]) continue;
    const value = getExifFieldValue(key, exif);
    if (value) inlineParts.push(value);
  }
  if (inlineParts.length > 0) {
    items.push({ text: inlineParts.join(" "), group: "inline" });
  }

  return items;
}

function drawExifWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: ExifWatermarkConfig,
  scale: number,
  fontFamily = "Arial, sans-serif",
  exifData: ExifData | null
): void {
  if (!exifData) return;

  const items = buildExifTexts(config.fields, exifData);
  if (items.length === 0) return;

  const { layout_mode } = config;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  /** Apply a style object to ctx and draw text at (tx, ty). Does NOT save/restore. */
  function drawStyledText(text: string, tx: number, ty: number, style: ExifFieldStyle): void {
    ctx.font = `${(style.font_size / 100) * canvas.width}px "${fontFamily}", Arial, sans-serif`;
    const [r, g, b, a] = style.color;
    ctx.globalAlpha = style.opacity > 0 ? style.opacity : a / 255;
    if (style.stroke_width > 0) {
      const [sr, sg, sb] = style.stroke_color;
      ctx.strokeStyle = `rgb(${sr},${sg},${sb})`;
      ctx.lineWidth = style.stroke_width * scale;
      ctx.strokeText(text, tx, ty);
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillText(text, tx, ty);
  }

  if (layout_mode === "unified") {
    // ── Unified mode: use top-level config style ──
    const {
      font_size, color, pos_x, pos_y, opacity,
      tile_spacing, rotation, stroke_color, stroke_width,
    } = config;
    const unifiedStyle: ExifFieldStyle = {
      font_size, color, opacity, stroke_color, stroke_width,
      pos_x, pos_y, rotation,
    };
    const scaledSize = (font_size / 100) * canvas.width;
    const lineHeight = scaledSize * 1.6;
    const angle = (rotation ?? 0) * Math.PI / 180;
    const textLines = items.map((it) => it.text);
    const totalHeight = textLines.length * lineHeight;
    const x = pos_x * canvas.width;
    const y = pos_y * canvas.height;
    const startY = y - totalHeight / 2 + lineHeight / 2;

    if (tile_spacing > 0) {
      const ts = Math.max(tile_spacing * scale, 50);
      let maxW = 0;
      for (const tl of textLines) {
        const w = ctx.measureText(tl).width;
        if (w > maxW) maxW = w;
      }
      for (let row = 0; row < canvas.height + totalHeight; row += ts + totalHeight) {
        for (let col = 0; col < canvas.width + maxW; col += ts + maxW) {
          ctx.save();
          ctx.translate(col, row);
          if (angle !== 0) ctx.rotate(angle);
          for (let i = 0; i < textLines.length; i++) {
            drawStyledText(textLines[i], 0, startY + i * lineHeight, unifiedStyle);
          }
          ctx.restore();
        }
      }
    } else {
      ctx.save();
      ctx.translate(x, y);
      if (angle !== 0) ctx.rotate(angle);
      for (let i = 0; i < textLines.length; i++) {
        drawStyledText(textLines[i], 0, i * lineHeight - totalHeight / 2 + lineHeight / 2, unifiedStyle);
      }
      ctx.restore();
    }
  } else {
    // ── Independent mode: each field group uses its own style ──
    for (const item of items) {
      const style = config.field_styles[item.group];
      const lx = style.pos_x * canvas.width;
      const ly = style.pos_y * canvas.height;
      const angle = (style.rotation ?? 0) * Math.PI / 180;

      if (config.tile_spacing > 0) {
        const ss = (style.font_size / 100) * canvas.width;
        const ts = Math.max(config.tile_spacing * scale, 50);
        const textW = ctx.measureText(item.text).width;
        for (let row = 0; row < canvas.height + ss; row += ts + ss) {
          for (let col = 0; col < canvas.width + textW; col += ts + textW) {
            ctx.save();
            ctx.translate(col, row);
            if (angle !== 0) ctx.rotate(angle);
            drawStyledText(item.text, 0, 0, style);
            ctx.restore();
          }
        }
      } else {
        ctx.save();
        ctx.translate(lx, ly);
        if (angle !== 0) ctx.rotate(angle);
        drawStyledText(item.text, 0, 0, style);
        ctx.restore();
      }
    }
  }
}

// ── Logo watermark drawing ──

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
    await renderWatermarkStatic(ctx, canvas, scale, watermarkStore, imageStore.exifData);

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
