use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::ImageEncoder;
use std::io::Cursor;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    /// Base64-encoded image data (for frontend preview)
    pub base64: String,
}

impl ImageInfo {
    pub fn from_file(path: &str) -> Result<Self, String> {
        let path = Path::new(path);
        let img = image::open(path).map_err(|e| format!("Failed to open image: {e}"))?;

        let (width, height) = (img.width(), img.height());
        let format = detect_format(path);

        // Encode to base64 JPEG for preview
        let mut buf = Cursor::new(Vec::new());
        JpegEncoder::new_with_quality(&mut buf, 90)
            .write_image(
                img.as_bytes(),
                width,
                height,
                img.color().into(),
            )
            .map_err(|e| format!("Failed to encode preview: {e}"))?;

        let base64 = BASE64.encode(buf.get_ref());

        Ok(ImageInfo {
            width,
            height,
            format,
            base64,
        })
    }
}

pub fn save_image(
    image_data: &[u8],
    width: u32,
    height: u32,
    output_path: &str,
    quality: u8,
) -> Result<(), String> {
    let path = Path::new(output_path);
    let format = detect_format(path);

    let mut buf = Cursor::new(Vec::new());

    if format == "png" {
        let encoder = PngEncoder::new(&mut buf);
        encoder
            .write_image(image_data, width, height, image::ColorType::Rgba8.into())
            .map_err(|e| format!("Failed to encode PNG: {e}"))?;
    } else {
        let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
        let rgb = rgba_to_rgb(image_data, width, height)?;
        encoder
            .write_image(&rgb, width, height, image::ExtendedColorType::Rgb8)
            .map_err(|e| format!("Failed to encode JPEG: {e}"))?;
    }

    std::fs::write(path, buf.get_ref()).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(())
}

/// Convert RGBA8 raw bytes to RGB8 (drop alpha channel)
pub fn rgba_to_rgb(raw: &[u8], w: u32, h: u32) -> Result<Vec<u8>, String> {
    let expected = (w * h * 4) as usize;
    if raw.len() != expected {
        return Err(format!(
            "RGBA data size mismatch: expected {} bytes ({}x{}x4), got {}",
            expected, w, h, raw.len()
        ));
    }
    let pixel_count = (w * h) as usize;
    let mut rgb = Vec::with_capacity(pixel_count * 3);
    for i in 0..pixel_count {
        let base = i * 4;
        rgb.push(raw[base]);
        rgb.push(raw[base + 1]);
        rgb.push(raw[base + 2]);
    }
    Ok(rgb)
}

fn detect_format(path: &Path) -> String {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => "png".to_string(),
        _ => "jpeg".to_string(),
    }
}
