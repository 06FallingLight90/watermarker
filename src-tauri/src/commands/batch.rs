use crate::engine::image::rgba_to_rgb;
use crate::engine::overlay::{apply_logo_watermark as engine_apply_logo, LogoWatermarkConfig};
use crate::engine::text::{apply_text_watermark as engine_apply_text, TextWatermarkConfig};
use image::codecs::jpeg::JpegEncoder;
use image::ImageEncoder;
use std::io::Cursor;
use tauri::Emitter;

#[derive(serde::Serialize, Clone)]
pub struct BatchProgress {
    pub current: usize,
    pub total: usize,
    pub file_name: String,
    pub status: String,
    pub error: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct BatchConfig {
    pub watermark_type: String,
    pub text_config: Option<TextWatermarkConfig>,
    pub logo_config: Option<LogoWatermarkConfig>,
    pub font_path: Option<String>,
    pub output_dir: String,
}

#[tauri::command]
pub async fn process_batch(
    app: tauri::AppHandle,
    files: Vec<String>,
    config: BatchConfig,
) -> Result<Vec<String>, String> {
    let total = files.len();
    let mut output_paths = Vec::new();

    let font_data = if config.watermark_type == "text" {
        let fp = config
            .font_path
            .as_deref()
            .unwrap_or({
                if cfg!(target_os = "windows") {
                    "C:/Windows/Fonts/arial.ttf"
                } else if cfg!(target_os = "macos") {
                    "/System/Library/Fonts/Helvetica.ttf"
                } else {
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
                }
            });
        Some(
            std::fs::read(fp)
                .map_err(|e| format!("Failed to read font '{fp}': {e}"))?,
        )
    } else {
        None
    };

    for (i, file_path) in files.iter().enumerate() {
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let _ = app.emit(
            "batch-progress",
            BatchProgress {
                current: i + 1,
                total,
                file_name: file_name.clone(),
                status: "processing".into(),
                error: None,
            },
        );

        match process_single(file_path, &config, font_data.as_deref()) {
            Ok((raw_data, w, h)) => {
                let out_name = format!(
                    "watermarked_{}",
                    std::path::Path::new(file_path)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                );
                let out_path = std::path::Path::new(&config.output_dir).join(&out_name);

                let mut buf = Cursor::new(Vec::new());
                let rgb = rgba_to_rgb(&raw_data, w, h)?;
                JpegEncoder::new_with_quality(&mut buf, 90)
                    .write_image(&rgb, w, h, image::ExtendedColorType::Rgb8)
                    .ok();

                if let Err(e) = std::fs::write(&out_path, buf.get_ref()) {
                    let _ = app.emit(
                        "batch-progress",
                        BatchProgress {
                            current: i + 1,
                            total,
                            file_name: file_name.clone(),
                            status: "error".into(),
                            error: Some(format!("Save error: {e}")),
                        },
                    );
                    continue;
                }

                let _ = app.emit(
                    "batch-progress",
                    BatchProgress {
                        current: i + 1,
                        total,
                        file_name: file_name.clone(),
                        status: "done".into(),
                        error: None,
                    },
                );
                output_paths.push(out_path.to_string_lossy().to_string());
            }
            Err(e) => {
                let _ = app.emit(
                    "batch-progress",
                    BatchProgress {
                        current: i + 1,
                        total,
                        file_name: file_name.clone(),
                        status: "error".into(),
                        error: Some(e),
                    },
                );
            }
        }
    }

    Ok(output_paths)
}

fn process_single(
    file_path: &str,
    config: &BatchConfig,
    font_data: Option<&[u8]>,
) -> Result<(Vec<u8>, u32, u32), String> {
    let img = image::open(file_path).map_err(|e| format!("Failed to open: {e}"))?;

    match config.watermark_type.as_str() {
        "text" => {
            let tc = config
                .text_config
                .as_ref()
                .ok_or("Missing text watermark config")?;
            let fd = font_data.ok_or("Missing font data")?;
            engine_apply_text(&img, tc, fd)
        }
        "logo" => {
            let lc = config
                .logo_config
                .as_ref()
                .ok_or("Missing logo watermark config")?;
            engine_apply_logo(&img, lc)
        }
        _ => Err("Unknown watermark type".into()),
    }
}
