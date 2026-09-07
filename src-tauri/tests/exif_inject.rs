//! Integration tests for EXIF preservation (`copy_exif_from`).
//!
//! Run with:  cargo test --test exif_inject -- --nocapture

use std::io::Cursor;

use image::ImageEncoder;
use watermarker_lib::engine::image::copy_exif_from;

// ── Synthetic EXIF payloads (single Orientation tag, value = 6) ──

/// Little-endian TIFF payload: II*\0, IFD0 at offset 8, one Orientation (SHORT=6).
fn exif_payload_le() -> Vec<u8> {
    let mut p = Vec::new();
    p.extend_from_slice(b"II\x2A\x00"); // byte order + magic
    p.extend_from_slice(&[0x08, 0x00, 0x00, 0x00]); // IFD0 offset = 8
    p.extend_from_slice(&[0x01, 0x00]); // entry count = 1
    p.extend_from_slice(&[0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00]); // Orientation = 6
    p.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // next IFD = 0
    p
}

/// Big-endian TIFF payload: MM\0*, same single Orientation tag (value = 6).
fn exif_payload_be() -> Vec<u8> {
    let mut p = Vec::new();
    p.extend_from_slice(b"MM\x00\x2A");
    p.extend_from_slice(&[0x00, 0x00, 0x00, 0x08]);
    p.extend_from_slice(&[0x00, 0x01]);
    p.extend_from_slice(&[0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00]);
    p.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
    p
}

/// Expected payload after `reset_exif_orientation` (value patched to 1).
fn payload_orientation_1(payload: &[u8], little: bool) -> Vec<u8> {
    let mut p = payload.to_vec();
    // Value field of the Orientation entry sits at fixed offset 18 in our synthetic payloads
    if little {
        p[18] = 1;
        p[19] = 0;
    } else {
        p[18] = 0;
        p[19] = 1;
    }
    p
}

// ── Synthetic image containers ──

/// Minimal JPEG: SOI + APP1("Exif\0\0" + payload) + EOI.
fn jpeg_with_exif(payload: &[u8]) -> Vec<u8> {
    let seg_len = (payload.len() + 2 + 6) as u16; // length field + signature + payload
    let mut jpeg = Vec::new();
    jpeg.extend_from_slice(&[0xFF, 0xD8]); // SOI
    jpeg.extend_from_slice(&[0xFF, 0xE1]); // APP1
    jpeg.extend_from_slice(&seg_len.to_be_bytes());
    jpeg.extend_from_slice(b"Exif\x00\x00");
    jpeg.extend_from_slice(payload);
    jpeg.extend_from_slice(&[0xFF, 0xD9]); // EOI
    jpeg
}

/// Real encoded JPEG without any EXIF (4x4 RGB).
fn plain_jpeg() -> Vec<u8> {
    let rgb = image::RgbImage::from_pixel(4, 4, image::Rgb([10, 20, 30]));
    let mut buf = Cursor::new(Vec::new());
    let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90);
    enc.write_image(rgb.as_raw(), 4, 4, image::ExtendedColorType::Rgb8)
        .unwrap();
    buf.into_inner()
}

/// Real encoded PNG without EXIF (4x4 RGB).
fn plain_png() -> Vec<u8> {
    let rgb = image::RgbImage::from_pixel(4, 4, image::Rgb([10, 20, 30]));
    let mut buf = Cursor::new(Vec::new());
    image::codecs::png::PngEncoder::new(&mut buf)
        .write_image(rgb.as_raw(), 4, 4, image::ExtendedColorType::Rgb8)
        .unwrap();
    buf.into_inner()
}

// ── Verification helpers ──

/// Locate the "Exif\0\0" payload inside a JPEG (mirrors the engine's scan).
fn jpeg_exif_payload(data: &[u8]) -> Option<&[u8]> {
    let mut i = 2;
    while i + 4 <= data.len() {
        if data[i] != 0xFF {
            return None;
        }
        let marker = data[i + 1];
        if marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            i += 2;
            continue;
        }
        if marker == 0xDA || marker == 0xD9 {
            return None;
        }
        let len = u16::from_be_bytes([data[i + 2], data[i + 3]]) as usize;
        if marker == 0xE1 && len >= 8 && &data[i + 4..i + 10] == b"Exif\x00\x00" {
            return Some(&data[i + 10..i + 2 + len]);
        }
        i += 2 + len;
    }
    None
}

/// Locate the eXIf chunk payload inside a PNG.
fn png_exif_payload(data: &[u8]) -> Option<&[u8]> {
    let mut i = 8;
    while i + 8 <= data.len() {
        let len = u32::from_be_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]) as usize;
        if &data[i + 4..i + 8] == b"IEND" {
            break;
        }
        if &data[i + 4..i + 8] == b"eXIf" {
            return Some(&data[i + 8..i + 8 + len]);
        }
        i += 8 + len + 4;
    }
    None
}

// ── Tests ──

#[test]
fn jpeg_source_injects_app1_into_jpeg_output() {
    let src = jpeg_with_exif(&exif_payload_le());
    let out = copy_exif_from(&src, &plain_jpeg()).expect("EXIF should be copied");

    // Output remains a decodable JPEG
    assert!(out.starts_with(&[0xFF, 0xD8]));
    image::load_from_memory(&out).expect("injected JPEG must still decode");

    // EXIF payload present, Orientation reset to 1
    let payload = jpeg_exif_payload(&out).expect("APP1 Exif segment missing");
    assert_eq!(payload, payload_orientation_1(&exif_payload_le(), true));
}

#[test]
fn jpeg_source_injects_exif_chunk_into_png_output() {
    let src = jpeg_with_exif(&exif_payload_be());
    let out = copy_exif_from(&src, &plain_png()).expect("EXIF should be copied");

    // Output remains a decodable PNG
    assert!(out.starts_with(&[0x89, b'P', b'N', b'G']));
    image::load_from_memory(&out).expect("injected PNG must still decode");

    let payload = png_exif_payload(&out).expect("eXIf chunk missing");
    assert_eq!(payload, payload_orientation_1(&exif_payload_be(), false));
}

#[test]
fn png_exif_round_trip_through_png_output() {
    // Build a PNG that already contains an eXIf chunk (output of the previous path)
    let src_jpeg = jpeg_with_exif(&exif_payload_le());
    let png_with_exif = copy_exif_from(&src_jpeg, &plain_png()).expect("first injection failed");

    // Use it as the source for a second export
    let out = copy_exif_from(&png_with_exif, &plain_png()).expect("EXIF should round-trip");
    let payload = png_exif_payload(&out).expect("eXIf chunk missing");
    assert_eq!(payload, payload_orientation_1(&exif_payload_le(), true));
}

#[test]
fn source_without_exif_returns_none() {
    assert!(copy_exif_from(&plain_jpeg(), &plain_png()).is_none());
    assert!(copy_exif_from(&plain_png(), &plain_jpeg()).is_none());
}

#[test]
fn real_camera_jpeg_contains_injectable_exif() {
    // Real-world sanity check against a camera photo in the repo's test/ dir
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("test")
        .join("IMG_4986_CR.jpg");
    if !path.exists() {
        eprintln!("skipping: test image not found at {}", path.display());
        return;
    }
    let src = std::fs::read(&path).expect("failed to read test image");
    let out = copy_exif_from(&src, &plain_png()).expect("camera JPEG should carry EXIF");
    assert!(png_exif_payload(&out).is_some(), "eXIf chunk should be injected");
}
