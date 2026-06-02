mod commands;
mod engine;

use commands::{batch, exif, image, watermark};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            image::load_image,
            image::save_image,
            image::export_file,
            exif::read_exif,
            watermark::apply_text_watermark,
            watermark::apply_logo_watermark,
            batch::process_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
