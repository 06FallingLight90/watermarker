use crate::engine::image::rgba_to_rgb;
use crate::engine::overlay::{apply_logo_watermark as engine_apply_logo, LogoWatermarkConfig};
use crate::engine::text::{apply_text_watermark as engine_apply_text, TextWatermarkConfig};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::ImageEncoder;
use std::io::Cursor;

#[derive(serde::Serialize)]
pub struct WatermarkResult {
    pub base64: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn apply_text_watermark(
    image_base64: String,
    config: TextWatermarkConfig,
    font_path: String,
) -> Result<WatermarkResult, String> {
    let image_bytes = BASE64
        .decode(&image_base64)
        .map_err(|e| format!("Failed to decode image: {e}"))?;

    let img = image::load_from_memory(&image_bytes)
        .map_err(|e| format!("Failed to load image: {e}"))?;

    let font_data =
        std::fs::read(&font_path).map_err(|e| format!("Failed to read font file '{font_path}': {e}"))?;

    let (raw, w, h) = engine_apply_text(&img, &config, &font_data)?;

    let mut buf = Cursor::new(Vec::new());
    let rgb = rgba_to_rgb(&raw, w, h)?;
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 95)
        .write_image(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("Failed to encode result: {e}"))?;

    let base64 = BASE64.encode(buf.get_ref());

    Ok(WatermarkResult {
        base64,
        width: w,
        height: h,
    })
}

#[tauri::command]
pub fn apply_logo_watermark(
    image_base64: String,
    config: LogoWatermarkConfig,
) -> Result<WatermarkResult, String> {
    let image_bytes = BASE64
        .decode(&image_base64)
        .map_err(|e| format!("Failed to decode image: {e}"))?;

    let img = image::load_from_memory(&image_bytes)
        .map_err(|e| format!("Failed to load image: {e}"))?;

    let (raw, w, h) = engine_apply_logo(&img, &config)?;

    let mut buf = Cursor::new(Vec::new());
    let rgb = rgba_to_rgb(&raw, w, h)?;
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 95)
        .write_image(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("Failed to encode result: {e}"))?;

    let base64 = BASE64.encode(buf.get_ref());

    Ok(WatermarkResult {
        base64,
        width: w,
        height: h,
    })
}
