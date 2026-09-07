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

/// Copy the EXIF profile from a source image into an exported image.
/// The frontend Canvas export re-encodes pixels only and drops all metadata;
/// this re-attaches the original EXIF (camera parameters, GPS, etc.).
/// Returns None if the source has no EXIF or the output format is unsupported.
pub fn copy_exif_from(source_data: &[u8], output_data: &[u8]) -> Option<Vec<u8>> {
    let mut exif = extract_exif(source_data)?;
    // The export pipeline already physically applies the EXIF orientation,
    // so keep the tag but reset it to 1 to avoid double-rotation in viewers.
    reset_exif_orientation(&mut exif);
    inject_exif_into_image(output_data, &exif)
}

/// Extract the raw EXIF profile (TIFF payload, without the JPEG "Exif\0\0" prefix)
/// from a JPEG (APP1 segment) or PNG (eXIf chunk) source.
fn extract_exif(data: &[u8]) -> Option<Vec<u8>> {
    if data.starts_with(&[0xFF, 0xD8]) {
        extract_exif_from_jpeg(data)
    } else if data.starts_with(&[0x89, b'P', b'N', b'G']) {
        extract_exif_from_png(data)
    } else {
        None
    }
}

/// JPEG: scan markers for an APP1 (0xE1) segment with the "Exif\0\0" signature.
fn extract_exif_from_jpeg(data: &[u8]) -> Option<Vec<u8>> {
    let mut i = 2;
    while i + 4 <= data.len() {
        if data[i] != 0xFF {
            return None;
        }
        let marker = data[i + 1];
        // Standalone markers and restart intervals carry no length field
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            i += 2;
            continue;
        }
        // SOS / EOI — no metadata segments beyond this point
        if marker == 0xDA || marker == 0xD9 {
            return None;
        }
        if i + 4 > data.len() {
            return None;
        }
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        if len < 2 || i + 2 + len > data.len() {
            return None;
        }
        if marker == 0xE1 && len >= 8 && &data[i + 4..i + 10] == b"Exif\x00\x00" {
            return Some(data[i + 10..i + 2 + len].to_vec());
        }
        i += 2 + len;
    }
    None
}

/// PNG: scan chunks (len(4) + type(4) + data + crc(4)) for an `eXIf` chunk.
fn extract_exif_from_png(data: &[u8]) -> Option<Vec<u8>> {
    let mut i = 8;
    while i + 8 <= data.len() {
        let len = u32::from_be_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]) as usize;
        let ctype = &data[i + 4..i + 8];
        if ctype == b"IEND" {
            break;
        }
        if i + 8 + len + 4 > data.len() {
            return None;
        }
        if ctype == b"eXIf" {
            return Some(data[i + 8..i + 8 + len].to_vec());
        }
        i += 8 + len + 4;
    }
    None
}

/// Set the EXIF Orientation tag (0x0112) to 1 (normal) in place.
/// The preview/export pipeline already physically rotates the pixels, so a
/// stale orientation value would make viewers rotate the image a second time.
fn reset_exif_orientation(exif: &mut [u8]) {
    if exif.len() < 8 {
        return;
    }
    let little_endian = match &exif[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return,
    };
    let magic_ok = match &exif[2..4] {
        [0x2A, 0x00] | [0x00, 0x2A] => true,
        _ => false,
    };
    if !magic_ok {
        return;
    }
    let read_u16 = |d: &[u8], off: usize| -> u16 {
        if little_endian {
            u16::from_le_bytes([d[off], d[off + 1]])
        } else {
            u16::from_be_bytes([d[off], d[off + 1]])
        }
    };
    let read_u32 = |d: &[u8], off: usize| -> u32 {
        if little_endian {
            u32::from_le_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]])
        } else {
            u32::from_be_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]])
        }
    };
    let ifd0 = read_u32(exif, 4) as usize;
    if ifd0 + 2 > exif.len() {
        return;
    }
    let count = read_u16(exif, ifd0) as usize;
    for n in 0..count {
        let entry = ifd0 + 2 + n * 12;
        if entry + 12 > exif.len() {
            return;
        }
        if read_u16(exif, entry) == 0x0112 {
            // Orientation is a SHORT stored inline at offset 8 within the entry
            if little_endian {
                exif[entry + 8] = 1;
                exif[entry + 9] = 0;
            } else {
                exif[entry + 8] = 0;
                exif[entry + 9] = 1;
            }
            return;
        }
    }
}

/// Inject EXIF data into an exported image: JPEG gets an APP1 segment,
/// PNG gets an `eXIf` chunk.
fn inject_exif_into_image(image_data: &[u8], exif: &[u8]) -> Option<Vec<u8>> {
    if image_data.starts_with(&[0xFF, 0xD8]) {
        inject_exif_into_jpeg(image_data, exif)
    } else if image_data.starts_with(&[0x89, b'P', b'N', b'G']) {
        inject_exif_into_png(image_data, exif)
    } else {
        None
    }
}

/// JPEG: SOI (FF D8) + new APP1 (FF E1, length, "Exif\0\0", payload) + original rest.
fn inject_exif_into_jpeg(jpeg: &[u8], exif: &[u8]) -> Option<Vec<u8>> {
    let seg_len = exif.len() + 2 + 6; // length field + "Exif\0\0" signature + payload
    if seg_len > u16::MAX as usize {
        return None;
    }
    let mut out = Vec::with_capacity(jpeg.len() + seg_len);
    out.extend_from_slice(&jpeg[..2]);
    out.push(0xFF);
    out.push(0xE1);
    out.extend_from_slice(&(seg_len as u16).to_be_bytes());
    out.extend_from_slice(b"Exif\x00\x00");
    out.extend_from_slice(exif);
    out.extend_from_slice(&jpeg[2..]);
    Some(out)
}

/// PNG: insert an eXIf chunk right after the mandatory IHDR chunk.
/// PNG requires IHDR to be the first chunk; eXIf must precede IDAT.
fn inject_exif_into_png(png: &[u8], exif: &[u8]) -> Option<Vec<u8>> {
    // Signature(8) + len(4) + "IHDR"(4) + data(13) + crc(4)
    if png.len() < 8 + 8 + 13 + 4 || &png[12..16] != b"IHDR" {
        return None;
    }
    let ihdr_len = u32::from_be_bytes([png[8], png[9], png[10], png[11]]) as usize;
    let insert_at = 8 + 4 + 4 + ihdr_len + 4;
    if insert_at > png.len() {
        return None;
    }
    let mut out = Vec::with_capacity(png.len() + exif.len() + 12);
    out.extend_from_slice(&png[..insert_at]);
    out.extend_from_slice(&(exif.len() as u32).to_be_bytes());
    out.extend_from_slice(b"eXIf");
    out.extend_from_slice(exif);
    let mut crc_input = Vec::with_capacity(exif.len() + 4);
    crc_input.extend_from_slice(b"eXIf");
    crc_input.extend_from_slice(exif);
    out.extend_from_slice(&crc32(&crc_input).to_be_bytes());
    out.extend_from_slice(&png[insert_at..]);
    Some(out)
}

/// Standard PNG CRC-32 (reflected polynomial 0xEDB88320).
fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &b in data {
        crc ^= b as u32;
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
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
