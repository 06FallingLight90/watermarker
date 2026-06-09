//! Batch processing benchmark tests.
//!
//! Run with:  cargo test --test bench_batch --release -- --nocapture
//! Or:        cargo test --test bench_batch --release -- --nocapture --ignored
//!
//! The `--release` flag is essential: debug builds are orders of magnitude slower
//! and do not represent real-world performance.

use std::path::PathBuf;
use std::time::Instant;
use image::ImageEncoder;

use watermarker_lib::engine::image as engine_image;
use watermarker_lib::engine::overlay as engine_overlay;
use watermarker_lib::engine::text as engine_text;

// ── Helpers ──

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn test_images_dir() -> PathBuf {
    project_root().parent().unwrap().join("test")
}

fn arial_font() -> Vec<u8> {
    let font_path = if cfg!(target_os = "windows") {
        "C:/Windows/Fonts/arial.ttf"
    } else if cfg!(target_os = "macos") {
        "/System/Library/Fonts/Helvetica.ttf"
    } else {
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    };
    std::fs::read(font_path).expect("Failed to read system font")
}

fn file_stem(path: &std::path::Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string()
}

/// Print a formatted timing line
#[allow(dead_code)]
fn print_time(label: &str, duration: std::time::Duration, count: u32) {
    let ms = duration.as_secs_f64() * 1000.0;
    let per = ms / count as f64;
    println!("  {:<28} {:>8.1} ms  ({:.1} ms/item)", label, ms, per);
}

// ── Benchmark functions ──

struct BenchResult {
    name: String,
    width: u32,
    height: u32,
    open_ms: f64,
    watermark_ms: f64,
    encode_ms: f64,
    total_ms: f64,
    output_kb: f64,
}

fn bench_single_image(
    path: &std::path::Path,
    config: &engine_text::TextWatermarkConfig,
    font_data: &[u8],
) -> Result<BenchResult, String> {
    let name = file_stem(path);

    // Step 1: Open & decode
    let t0 = Instant::now();
    let img = image::open(path).map_err(|e| format!("open: {e}"))?;
    let open_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let (w, h) = (img.width(), img.height());

    // Step 2: Apply text watermark
    let t1 = Instant::now();
    let (raw, pw, ph) = engine_text::apply_text_watermark(&img, config, font_data)?;
    assert_eq!((pw, ph), (w, h), "dimensions changed");
    let watermark_ms = t1.elapsed().as_secs_f64() * 1000.0;

    // Step 3: JPEG encode (simulates save)
    let t2 = Instant::now();
    let rgb = engine_image::rgba_to_rgb(&raw, w, h)?;
    let mut buf = std::io::Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90)
        .write_image(
            &rgb,
            w,
            h,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("encode: {e}"))?;
    let encode_ms = t2.elapsed().as_secs_f64() * 1000.0;

    let total_ms = open_ms + watermark_ms + encode_ms;

    Ok(BenchResult {
        name,
        width: w,
        height: h,
        open_ms,
        watermark_ms,
        encode_ms,
        total_ms,
        output_kb: buf.get_ref().len() as f64 / 1024.0,
    })
}

fn bench_single_logo(
    path: &std::path::Path,
    _logo_path: &std::path::Path,
    config: &engine_overlay::LogoWatermarkConfig,
) -> Result<BenchResult, String> {
    let name = file_stem(path);

    // Step 1: Open & decode
    let t0 = Instant::now();
    let img = image::open(path).map_err(|e| format!("open: {e}"))?;
    let open_ms = t0.elapsed().as_secs_f64() * 1000.0;
    let (w, h) = (img.width(), img.height());

    // Step 2: Apply logo watermark
    let t1 = Instant::now();
    let (raw, pw, ph) = engine_overlay::apply_logo_watermark(&img, config)?;
    assert_eq!((pw, ph), (w, h), "dimensions changed");
    let watermark_ms = t1.elapsed().as_secs_f64() * 1000.0;

    // Step 3: JPEG encode
    let t2 = Instant::now();
    let rgb = engine_image::rgba_to_rgb(&raw, w, h)?;
    let mut buf = std::io::Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90)
        .write_image(&rgb, w, h, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("encode: {e}"))?;
    let encode_ms = t2.elapsed().as_secs_f64() * 1000.0;

    let total_ms = open_ms + watermark_ms + encode_ms;

    Ok(BenchResult {
        name,
        width: w,
        height: h,
        open_ms,
        watermark_ms,
        encode_ms,
        total_ms,
        output_kb: buf.get_ref().len() as f64 / 1024.0,
    })
}

fn print_results(results: &[BenchResult]) {
    println!();
    println!(
        " {:<30} {:>6} x {:<6} {:>8} {:>10} {:>9} {:>9} {:>9}",
        "file", "width", "height", "open", "watermark", "encode", "total", "output"
    );
    println!(
        " {:-<30} {:-<13} {:-<8} {:-<10} {:-<9} {:-<9} {:-<9}",
        "", "", "", "", "", "", ""
    );

    let mut total_open = 0.0;
    let mut total_wm = 0.0;
    let mut total_enc = 0.0;
    let mut total_all = 0.0;

    for r in results {
        println!(
            " {:<30} {:>6} x {:<6} {:>7.1}ms {:>9.1}ms {:>8.1}ms {:>8.1}ms {:>7.1}KB",
            r.name,
            r.width,
            r.height,
            r.open_ms,
            r.watermark_ms,
            r.encode_ms,
            r.total_ms,
            r.output_kb,
        );
        total_open += r.open_ms;
        total_wm += r.watermark_ms;
        total_enc += r.encode_ms;
        total_all += r.total_ms;
    }

    let n = results.len();
    println!(" {:-<30} {:-<13} {:-<8} {:-<10} {:-<9} {:-<9} {:-<9}", "", "", "", "", "", "", "");
    println!(
        " {:<30} {:>13} {:>8.1}ms {:>9.1}ms {:>8.1}ms {:>8.1}ms",
        format!("TOTAL ({n} files)", n = n),
        "",
        total_open,
        total_wm,
        total_enc,
        total_all,
    );
    if n > 0 {
        println!(
            " {:<30} {:>13} {:>8.1}ms {:>9.1}ms {:>8.1}ms {:>8.1}ms",
            "AVERAGE", "", total_open / n as f64, total_wm / n as f64, total_enc / n as f64, total_all / n as f64,
        );
    }
}

// ── Tests ──

#[test]
fn bench_text_watermark_single_tile() {
    let dir = test_images_dir();
    if !dir.exists() {
        eprintln!("Skipping: test/ directory not found");
        return;
    }

    let font_data = arial_font();
    let config = engine_text::TextWatermarkConfig {
        text: "Watermark".into(),
        font_size: 64.0,
        color: [255, 255, 255, 128],
        rotation: 0.0,
        pos_x: 0.5,
        pos_y: 0.5,
        opacity: 0.5,
        tile_spacing: 0.0,
        stroke_color: [0, 0, 0],
        stroke_width: 0.0,
    };

    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("jpg" | "jpeg" | "png" | "bmp" | "webp") => {}
            _ => continue,
        }
        match bench_single_image(&path, &config, &font_data) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(&path)),
        }
    }

    println!("\n━━━ Text Watermark (single, no tile) ━━━");
    print_results(&results);
}

#[test]
fn bench_text_watermark_tiled() {
    let dir = test_images_dir();
    if !dir.exists() {
        eprintln!("Skipping: test/ directory not found");
        return;
    }

    let font_data = arial_font();
    let config = engine_text::TextWatermarkConfig {
        text: "CONFIDENTIAL".into(),
        font_size: 48.0,
        color: [255, 0, 0, 60],
        rotation: 315.0,
        pos_x: 0.5,
        pos_y: 0.5,
        opacity: 0.3,
        tile_spacing: 150.0,
        stroke_color: [0, 0, 0],
        stroke_width: 0.0,
    };

    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("jpg" | "jpeg" | "png" | "bmp" | "webp") => {}
            _ => continue,
        }
        match bench_single_image(&path, &config, &font_data) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(&path)),
        }
    }

    println!("\n━━━ Text Watermark (tiled, rotated) ━━━");
    print_results(&results);
}

#[test]
fn bench_text_watermark_with_stroke() {
    let dir = test_images_dir();
    if !dir.exists() {
        eprintln!("Skipping: test/ directory not found");
        return;
    }

    let font_data = arial_font();
    let config = engine_text::TextWatermarkConfig {
        text: "Watermark".into(),
        font_size: 64.0,
        color: [255, 255, 255, 220],
        rotation: 0.0,
        pos_x: 0.5,
        pos_y: 0.5,
        opacity: 0.8,
        tile_spacing: 0.0,
        stroke_color: [0, 0, 0],
        stroke_width: 2.0,
    };

    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("jpg" | "jpeg" | "png" | "bmp" | "webp") => {}
            _ => continue,
        }
        match bench_single_image(&path, &config, &font_data) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(&path)),
        }
    }

    println!("\n━━━ Text Watermark (with 2px stroke) ━━━");
    print_results(&results);
}

#[test]
#[ignore = "requires a logo image in test/"]
fn bench_logo_watermark() {
    let dir = test_images_dir();
    if !dir.exists() {
        eprintln!("Skipping: test/ directory not found");
        return;
    }

    // Find a PNG to use as logo (use the first one found)
    let mut logo_path = None;
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("png") {
            logo_path = Some(p);
            break;
        }
    }
    let logo_path = match logo_path {
        Some(p) => p,
        None => {
            eprintln!("Skipping: no PNG logo found in test/");
            return;
        }
    };

    // Load and base64-encode the logo
    let logo_bytes = std::fs::read(&logo_path).expect("read logo");
    let logo_base64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &logo_bytes,
    );

    let config = engine_overlay::LogoWatermarkConfig {
        logo_base64,
        opacity: 0.5,
        scale: 0.3, // 30% of image width
        pos_x: 0.5,
        pos_y: 0.5,
        rotation: 0.0,
    };

    println!("\nUsing logo: {}", logo_path.file_name().unwrap().to_string_lossy());

    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Skip the logo file itself (don't watermark it with itself)
        if path == logo_path {
            continue;
        }
        match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("jpg" | "jpeg" | "png" | "bmp" | "webp") => {}
            _ => continue,
        }
        match bench_single_logo(&path, &logo_path, &config) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(&path)),
        }
    }

    println!("\n━━━ Logo Watermark (30% overlay) ━━━");
    print_results(&results);
}

/// Run ALL benchmarks at once (convenience test, always run with --ignored)
#[test]
#[ignore = "run with: cargo test --test bench_batch --release -- --ignored --nocapture"]
fn bench_full_suite() {
    println!("\n╔══════════════════════════════════════════════╗");
    println!("║   Watermarker Batch Performance Benchmarks   ║");
    println!("╚══════════════════════════════════════════════╝");

    // Manually run all three scenarios
    let dir = test_images_dir();
    if !dir.exists() {
        panic!("test/ directory not found — create one with sample images");
    }

    let font_data = arial_font();

    // Collect all image paths
    let mut image_paths: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(&dir).unwrap().flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
            Some("jpg" | "jpeg" | "png" | "bmp" | "webp") => image_paths.push(path),
            _ => {}
        }
    }
    println!("\nFound {} test image(s)\n", image_paths.len());

    // Scenario 1: single text watermark with stroke
    let config1 = engine_text::TextWatermarkConfig {
        text: "Watermark".into(),
        font_size: 64.0,
        color: [255, 255, 255, 200],
        rotation: 0.0,
        pos_x: 0.5,
        pos_y: 0.5,
        opacity: 0.8,
        tile_spacing: 0.0,
        stroke_color: [0, 0, 0],
        stroke_width: 2.0,
    };
    println!("━━━ Scenario 1: Text watermark with stroke ━━━");
    let mut results = Vec::new();
    for p in &image_paths {
        match bench_single_image(p, &config1, &font_data) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(p)),
        }
    }
    print_results(&results);

    // Scenario 2: tiled text watermark
    let config2 = engine_text::TextWatermarkConfig {
        text: "CONFIDENTIAL".into(),
        font_size: 48.0,
        color: [255, 0, 0, 60],
        rotation: 315.0,
        pos_x: 0.5,
        pos_y: 0.5,
        opacity: 0.3,
        tile_spacing: 150.0,
        stroke_color: [0, 0, 0],
        stroke_width: 0.0,
    };
    println!("\n━━━ Scenario 2: Tiled text watermark ━━━");
    let mut results = Vec::new();
    for p in &image_paths {
        match bench_single_image(p, &config2, &font_data) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(p)),
        }
    }
    print_results(&results);

    // Scenario 3: logo overlay
    println!("\n━━━ Scenario 3: Logo watermark ━━━");
    if let Some(logo_path) = image_paths.iter().find(|p| {
        p.extension().and_then(|e| e.to_str()) == Some("png")
    }) {
        let logo_bytes = std::fs::read(logo_path).expect("read logo");
        let logo_base64 = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &logo_bytes,
        );
        let config3 = engine_overlay::LogoWatermarkConfig {
            logo_base64,
            opacity: 0.5,
            scale: 0.3,
            pos_x: 0.5,
            pos_y: 0.5,
            rotation: 0.0,
        };
        let mut results = Vec::new();
        for p in &image_paths {
            if p == logo_path { continue; }
            match bench_single_logo(p, logo_path, &config3) {
                Ok(r) => results.push(r),
                Err(e) => eprintln!("  SKIP {}: {e}", file_stem(p)),
            }
        }
        print_results(&results);
    } else {
        println!("  Skipped — no PNG in test/ to use as logo");
    }

    // Scenario 4: EXIF-style multiline text with stroke
    println!("\n━━━ Scenario 4: EXIF-style multiline text ━━━");
    let exif_text = "Canon EOS 70D\nEF 24-70mm f/2.8L\n200mm f/8.0 1/250s ISO 100";
    let config4 = engine_text::TextWatermarkConfig {
        text: exif_text.into(),
        font_size: 36.0,
        color: [255, 255, 255, 220],
        rotation: 0.0,
        pos_x: 0.02,
        pos_y: 0.95,
        opacity: 0.85,
        tile_spacing: 0.0,
        stroke_color: [0, 0, 0],
        stroke_width: 2.0,
    };
    let mut results = Vec::new();
    for p in &image_paths {
        match bench_single_image(p, &config4, &font_data) {
            Ok(r) => results.push(r),
            Err(e) => eprintln!("  SKIP {}: {e}", file_stem(p)),
        }
    }
    print_results(&results);

    println!("\n✓ Full benchmark suite complete");
}
