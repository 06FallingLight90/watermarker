use crate::engine::exif::{ExifData, ExifReader};

#[tauri::command]
pub fn read_exif(path: String) -> Result<ExifData, String> {
    ExifReader::read(&path)
}
