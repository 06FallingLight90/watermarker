use ab_glyph::{Font, PxScale};
use image::{Rgba, RgbaImage};
use imageproc::drawing::draw_text_mut;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TextWatermarkConfig {
    pub text: String,
    pub font_size: f32,
    #[serde(default = "default_color")]
    pub color: [u8; 4],
    pub rotation: f32,
    pub pos_x: f32,
    pub pos_y: f32,
    pub opacity: f32,
    pub tile_spacing: f32,
}

fn default_color() -> [u8; 4] {
    [255, 255, 255, 200]
}

/// Apply text watermark using the given font data (TTF/OTC bytes).
pub fn apply_text_watermark(
    img: &image::DynamicImage,
    config: &TextWatermarkConfig,
    font_data: &[u8],
) -> Result<(Vec<u8>, u32, u32), String> {
    let mut rgba: RgbaImage = img.to_rgba8();
    let (img_w, img_h) = rgba.dimensions();

    let font = ab_glyph::FontRef::try_from_slice(font_data)
        .map_err(|_| "Failed to parse font data".to_string())?;

    let scale = PxScale::from(config.font_size);

    let mut alpha = config.color[3];
    if config.opacity > 0.0 {
        alpha = (config.opacity * 255.0).clamp(0.0, 255.0) as u8;
    }
    let color = Rgba([config.color[0], config.color[1], config.color[2], alpha]);

    let px = (config.pos_x.clamp(0.0, 1.0) * img_w as f32) as i32;
    let py = (config.pos_y.clamp(0.0, 1.0) * img_h as f32) as i32;

    if config.tile_spacing > 0.0 {
        let spacing = config.tile_spacing.max(50.0) as i32;
        draw_tiled_text(&mut rgba, &config.text, scale, &font, color, spacing);
    } else {
        draw_text_mut(&mut rgba, color, px, py, scale, &font, &config.text);
    }

    let (w, h) = rgba.dimensions();
    let raw = rgba.into_raw();
    Ok((raw, w, h))
}

fn draw_tiled_text(
    canvas: &mut RgbaImage,
    text: &str,
    scale: PxScale,
    font: &impl Font,
    color: Rgba<u8>,
    spacing: i32,
) {
    let (w, h) = canvas.dimensions();
    let (tw, _) = imageproc::drawing::text_size(scale, font, text);
    let step_x = (tw as i32 + spacing).max(1);
    let th = scale.y as i32;
    let step_y = (th + spacing).max(1);

    let mut row = 0;
    while row < h as i32 + th {
        let mut col = 0;
        while col < w as i32 + tw as i32 {
            draw_text_mut(canvas, color, col, row, scale, font, text);
            col += step_x;
        }
        row += step_y;
    }
}
