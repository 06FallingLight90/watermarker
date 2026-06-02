use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use crate::engine::image::{save_image as engine_save, ImageInfo};

#[tauri::command]
pub fn load_image(path: String) -> Result<ImageInfo, String> {
    ImageInfo::from_file(&path)
}

#[tauri::command]
pub fn save_image(
    image_data: Vec<u8>,
    width: u32,
    height: u32,
    output_path: String,
    quality: Option<u8>,
) -> Result<(), String> {
    engine_save(&image_data, width, height, &output_path, quality.unwrap_or(90))
}

/// Write base64-encoded image data directly to a file (bypasses pixel re-encoding)
#[tauri::command]
pub fn export_file(base64: String, output_path: String) -> Result<(), String> {
    let data = BASE64
        .decode(&base64)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;
    std::fs::write(&output_path, &data)
        .map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(())
}
