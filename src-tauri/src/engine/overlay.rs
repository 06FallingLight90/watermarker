use image::RgbaImage;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LogoWatermarkConfig {
    /// Base64-encoded logo image data
    pub logo_base64: String,
    pub opacity: f32,
    pub scale: f32,
    pub pos_x: f32,
    pub pos_y: f32,
    pub rotation: f32,
}

/// Overlay a logo image onto the main image. Returns new image data (RGBA8 bytes).
pub fn apply_logo_watermark(
    img: &image::DynamicImage,
    config: &LogoWatermarkConfig,
) -> Result<(Vec<u8>, u32, u32), String> {
    use base64::Engine as _;

    let logo_bytes = base64::engine::general_purpose::STANDARD
        .decode(&config.logo_base64)
        .map_err(|e| format!("Failed to decode logo base64: {e}"))?;

    let logo = image::load_from_memory(&logo_bytes)
        .map_err(|e| format!("Failed to load logo image: {e}"))?;

    let mut base: RgbaImage = img.to_rgba8();
    let (base_w, base_h) = base.dimensions();

    // Scale logo
    let new_w = (logo.width() as f32 * config.scale) as u32;
    let new_h = (logo.height() as f32 * config.scale) as u32;
    let logo = logo.resize_exact(new_w.max(1), new_h.max(1), image::imageops::FilterType::Lanczos3);
    let logo_rgba = logo.to_rgba8();
    let (logo_w, logo_h) = logo_rgba.dimensions();

    // Calculate position
    let px = ((config.pos_x * base_w as f32) as i32 - logo_w as i32 / 2).max(0) as u32;
    let py = ((config.pos_y * base_h as f32) as i32 - logo_h as i32 / 2).max(0) as u32;

    let opacity = (config.opacity * 255.0).clamp(0.0, 255.0) as u8;

    // Alpha blend logo onto base
    for dy in 0..logo_h.min(base_h.saturating_sub(py)) {
        for dx in 0..logo_w.min(base_w.saturating_sub(px)) {
            let logo_px = logo_rgba.get_pixel(dx, dy);
            let base_px = base.get_pixel_mut(px + dx, py + dy);

            let logo_alpha = ((logo_px[3] as u16 * opacity as u16) / 255) as u8;
            let inv_alpha = 255u16 - logo_alpha as u16;

            for c in 0..3 {
                base_px[c] = ((logo_px[c] as u16 * logo_alpha as u16
                    + base_px[c] as u16 * inv_alpha)
                    / 255) as u8;
            }
            base_px[3] = 255;
        }
    }

    let (w, h) = base.dimensions();
    let raw = base.into_raw();
    Ok((raw, w, h))
}
