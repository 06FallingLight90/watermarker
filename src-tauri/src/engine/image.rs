use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use exif::{Reader as ExifReader, Tag as ExifTag};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::imageops;
use image::ImageEncoder;
use std::io::Cursor;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RawImageData {
    pub base64: String,
    /// MIME type suffix, e.g. "png" or "jpeg"
    pub format: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    /// Base64-encoded image data (for frontend preview)
    pub base64: String,
}

impl ImageInfo {
    pub fn from_file(path: &str, quality: u8) -> Result<Self, String> {
        let path = Path::new(path);
        let mut img = image::open(path).map_err(|e| format!("Failed to open image: {e}"))?;

        // Read EXIF Orientation tag and apply the transform.
        // Digital cameras always store raw pixels in landscape orientation;
        // without this, portrait photos appear rotated 90° in the preview.
        let orientation = read_orientation(path);
        apply_orientation(&mut img, orientation);

        let (width, height) = (img.width(), img.height());
        let format = detect_format(path);

        // Encode to base64 JPEG for preview.
        // JPEG does not support RGBA; convert to RGB first.
        let mut buf = Cursor::new(Vec::new());
        let rgb = img.to_rgb8();
        JpegEncoder::new_with_quality(&mut buf, quality)
            .write_image(
                rgb.as_raw(),
                width,
                height,
                image::ExtendedColorType::Rgb8,
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

/// Read EXIF Orientation tag from the given file.
/// Returns the orientation value (1–8), defaulting to 1 (normal) if not found.
fn read_orientation(path: &Path) -> u32 {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut reader = std::io::BufReader::new(&file);
    let exif = match ExifReader::new().read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    for field in exif.fields() {
        if field.tag == ExifTag::Orientation {
            if let Some(v) = field.value.get_uint(0) {
                return v as u32;
            }
            break;
        }
    }
    1
}

/// Apply the EXIF orientation transform to a DynamicImage.
/// See: <https://exiftool.org/TagNames/EXIF.html> (Orientation tag)
fn apply_orientation(img: &mut image::DynamicImage, orientation: u32) {
    *img = match orientation {
        2 => image::DynamicImage::ImageRgba8(imageops::flip_horizontal(img)),   // Mirror horizontal
        3 => image::DynamicImage::ImageRgba8(imageops::rotate180(img)),          // Rotate 180°
        4 => image::DynamicImage::ImageRgba8(imageops::flip_vertical(img)),     // Mirror vertical
        5 => {                                                                    // Rotate 90° CW + mirror horizontal
            let rotated = imageops::rotate90(img);
            image::DynamicImage::ImageRgba8(imageops::flip_horizontal(&rotated))
        }
        6 => image::DynamicImage::ImageRgba8(imageops::rotate90(img)),           // Rotate 90° CW (portrait)
        7 => {                                                                    // Rotate 90° CW + mirror vertical
            let rotated = imageops::rotate90(img);
            image::DynamicImage::ImageRgba8(imageops::flip_vertical(&rotated))
        }
        8 => image::DynamicImage::ImageRgba8(imageops::rotate270(img)),          // Rotate 270° CW (90° CCW)
        _ => return, // 1 or unknown — keep as-is
    };
}

/// Read raw file bytes and base64-encode them without any image re-encoding.
/// Preserves the original format (including PNG alpha channel).
pub fn load_raw(path: &str) -> Result<RawImageData, String> {
    let path = Path::new(path);
    let data = std::fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let base64 = BASE64.encode(&data);
    let format = detect_format(path);
    Ok(RawImageData { base64, format })
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FontEntry {
    pub path: String,
    pub name: String,
}

/// Scan system font directories for .ttf / .otf / .ttc files.
/// Name is derived from the filename for display purposes.
pub fn list_system_fonts() -> Vec<FontEntry> {
    let font_dirs: &[&str] = if cfg!(target_os = "windows") {
        &["C:\\Windows\\Fonts"]
    } else if cfg!(target_os = "macos") {
        &["/System/Library/Fonts", "/Library/Fonts"]
    } else {
        &["/usr/share/fonts/truetype", "/usr/local/share/fonts"]
    };

    let mut fonts = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for dir in font_dirs {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(ext) = path.extension().and_then(|e| e.to_str()) else { continue };
            let ext_lower = ext.to_lowercase();
            if ext_lower != "ttf" && ext_lower != "otf" && ext_lower != "ttc" {
                continue;
            }
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
            // Deduplicate by display name
            let key = name.to_lowercase();
            if seen.contains(&key) { continue; }
            seen.insert(key);
            fonts.push(FontEntry {
                path: path.to_string_lossy().to_string(),
                name,
            });
        }
    }

    fonts.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    fonts
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
