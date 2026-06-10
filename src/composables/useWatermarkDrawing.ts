import { invoke } from "@tauri-apps/api/core";
import { useImageStore } from "@/stores/image";
import { useWatermarkStore } from "@/stores/watermark";
import { getTradeMarkImage } from "@/utils/tradeMarks";
import type {
  TextWatermarkConfig,
  LogoWatermarkConfig,
  ExifWatermarkConfig,
  ExifFieldVisibility,
  ExifFieldStyle,
  ExifFieldGroup,
  ExifData,
  RawImageData,
  BatchWatermarkConfig,
} from "@/types";

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

// ── Config-based rendering (for batch per-image watermark) ──

/**
 * Render watermark using a BatchWatermarkConfig snapshot (no store dependency).
 * This allows each batch file to use its own independent watermark config.
 */
export async function renderWatermarkFromConfig(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scale: number,
  config: BatchWatermarkConfig,
  exifData: ExifData | null
): Promise<void> {
  if (!config.enabled) return;

  if (config.watermarkType === "text") {
    drawTextWatermarkStatic(ctx, canvas, config.textConfig, scale, config.fontFamily);
  } else if (
    config.watermarkType === "logo" &&
    config.logoConfig.logo_base64
  ) {
    await drawLogoWatermarkStatic(ctx, canvas, config.logoConfig, scale, config.logoFormat);
  } else if (config.watermarkType === "exif") {
    // Look up trade mark logo for the current image's camera make
    const tradeMarkImg = getTradeMarkImage(exifData?.camera_make);
    drawExifWatermarkStatic(ctx, canvas, config.exifConfig, scale, config.fontFamily, exifData, tradeMarkImg);
  }
}

/**
 * Render a single file with a given BatchWatermarkConfig snapshot.
 * Used by batch processing so each file uses its own watermark settings.
 */
export async function renderOffscreenWithConfig(
  imageBase64: string,
  format: ExportFormat,
  config: BatchWatermarkConfig,
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
  await renderWatermarkFromConfig(ctx, canvas, 1.0, config, exifData ?? null);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "png" ? undefined : 1.0;
  return canvas.toDataURL(mime, quality).split(",")[1] ?? "";
}

// ── Shared watermark drawing ──

export async function renderWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  scale: number,
  watermarkStore: ReturnType<typeof useWatermarkStore>,
  exifData: ExifData | null
): Promise<void> {
  await renderWatermarkFromConfig(ctx, canvas, scale, {
    watermarkType: watermarkStore.watermarkType,
    textConfig: watermarkStore.textConfig,
    logoConfig: watermarkStore.logoConfig,
    exifConfig: watermarkStore.exifConfig,
    logoFormat: watermarkStore.logoFormat,
    fontFamily: watermarkStore.fontFamily,
    fontPath: watermarkStore.fontPath,
    enabled: watermarkStore.enabled,
  }, exifData);
}

// ── Text watermark drawing ──

export function drawTextWatermarkStatic(
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

export function getExifFieldValue(key: keyof ExifFieldVisibility, exif: ExifData): string | null {
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
export const INLINE_FIELDS: (keyof ExifFieldVisibility)[] = [
  "focal_length", "aperture", "shutter_speed", "iso",
];

/** Remaining fields displayed as separate lines, in display order */
export const BLOCK_FIELDS: (keyof ExifFieldVisibility)[] = [
  "camera_model", "lens_model", "date_taken", "gps",
];

export function buildExifTexts(
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

export function drawExifWatermarkStatic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: ExifWatermarkConfig,
  scale: number,
  fontFamily = "Arial, sans-serif",
  exifData: ExifData | null,
  tradeMarkImg: HTMLImageElement | null = null
): void {
  if (!exifData) return;

  const items = buildExifTexts(config.fields, exifData);
  if (items.length === 0) return;

  // Determine whether camera_model should render as a trade mark logo
  const useTradeMark = tradeMarkImg !== null && config.trade_mark_enabled;

  const { layout_mode } = config;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  /** Draw a trade mark logo image at (tx, ty) with the given style */
  function drawTradeMarkAt(tx: number, ty: number, style: ExifFieldStyle): void {
    if (!tradeMarkImg) return;
    const logoW = canvas.width * (config.trade_mark_scale / 100);
    const aspectRatio = tradeMarkImg.width / tradeMarkImg.height;
    const logoH = logoW / aspectRatio;
    ctx.globalAlpha = style.opacity;
    ctx.drawImage(tradeMarkImg, tx - logoW / 2, ty - logoH / 2, logoW, logoH);
  }

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
    const totalHeight = items.length * lineHeight;
    const x = pos_x * canvas.width;
    const y = pos_y * canvas.height;
    const startY = y - totalHeight / 2 + lineHeight / 2;

    if (tile_spacing > 0) {
      const ts = Math.max(tile_spacing * scale, 50);
      // Compute max tile width — trade mark logo uses trade_mark_scale
      let maxW = 0;
      for (const it of items) {
        let w: number;
        if (useTradeMark && it.group === "camera_model") {
          w = canvas.width * (config.trade_mark_scale / 100);
        } else {
          w = ctx.measureText(it.text).width;
        }
        if (w > maxW) maxW = w;
      }
      // Compute total tile height accounting for trade mark logo
      let tileH = 0;
      for (const it of items) {
        if (useTradeMark && it.group === "camera_model") {
          tileH += canvas.width * (config.trade_mark_scale / 100) * 0.85;
        } else {
          tileH += lineHeight;
        }
      }
      for (let row = 0; row < canvas.height + tileH; row += ts + tileH) {
        for (let col = 0; col < canvas.width + maxW; col += ts + maxW) {
          ctx.save();
          ctx.translate(col, row);
          if (angle !== 0) ctx.rotate(angle);
          let lineY = startY;
          for (let i = 0; i < items.length; i++) {
            if (useTradeMark && items[i].group === "camera_model") {
              const logoH = canvas.width * (config.trade_mark_scale / 100) * 0.5;
              drawTradeMarkAt(0, lineY + logoH, unifiedStyle);
              lineY += logoH * 1.7;
            } else {
              drawStyledText(items[i].text, 0, lineY, unifiedStyle);
              lineY += lineHeight;
            }
          }
          ctx.restore();
        }
      }
    } else {
      ctx.save();
      ctx.translate(x, y);
      if (angle !== 0) ctx.rotate(angle);
      let lineY = -totalHeight / 2 + lineHeight / 2;
      for (let i = 0; i < items.length; i++) {
        if (useTradeMark && items[i].group === "camera_model") {
          const logoH = canvas.width * (config.trade_mark_scale / 100) / 2;
          lineY += logoH;
          drawTradeMarkAt(0, lineY, unifiedStyle);
          lineY += logoH;
        } else {
          drawStyledText(items[i].text, 0, lineY, unifiedStyle);
          lineY += lineHeight;
        }
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

      const isCameraModelTradeMark = useTradeMark && item.group === "camera_model";

      if (config.tile_spacing > 0) {
        if (isCameraModelTradeMark) {
          // Tiled trade mark logo
          const logoW = canvas.width * (config.trade_mark_scale / 100);
          const logoH = logoW / (tradeMarkImg!.width / tradeMarkImg!.height);
          const ts = Math.max(config.tile_spacing * scale, 50);
          for (let row = 0; row < canvas.height + logoH; row += ts + logoH) {
            for (let col = 0; col < canvas.width + logoW; col += ts + logoW) {
              ctx.save();
              ctx.translate(col, row);
              if (angle !== 0) ctx.rotate(angle);
              drawTradeMarkAt(0, 0, style);
              ctx.restore();
            }
          }
        } else {
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
        }
      } else {
        ctx.save();
        ctx.translate(lx, ly);
        if (angle !== 0) ctx.rotate(angle);
        if (isCameraModelTradeMark) {
          drawTradeMarkAt(0, 0, style);
        } else {
          drawStyledText(item.text, 0, 0, style);
        }
        ctx.restore();
      }
    }
  }
}

// ── Logo watermark drawing ──

export async function drawLogoWatermarkStatic(
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
