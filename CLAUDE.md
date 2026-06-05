# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

每次修改代码后，同步更新docs/CHANGELOG.md

测试文件放入test/目录下

## Build & Development Commands

```bash
npm install              # Install frontend dependencies
npm run dev              # Vite dev server only (no Tauri commands)
npm run tauri dev        # Full Tauri app with HMR (use this for development)
npm run build            # TypeScript type check + Vite production build
npm run tauri build      # Build platform-native release package

# Tests
npm run tauri test       # Run Rust integration tests (debug)
cargo test --manifest-path src-tauri/Cargo.toml --test bench_batch --release -- --nocapture               # Performance benchmark
cargo test --manifest-path src-tauri/Cargo.toml --test bench_batch --release -- --ignored --nocapture     # Full suite (incl. logo)
```

Frontend dev server runs on `http://localhost:1420`. Rust changes auto-recompile; frontend changes HMR.

## Architecture

**Tauri v2 + Vue 3 + TypeScript** desktop app. Rust backend handles file I/O and image codec operations; Vue frontend owns the Canvas-based watermark rendering. This split is intentional — see "WYSIWYG consistency" below.

### Layout (App.vue)
- **LeftPanel** — File open, EXIF display
- **CenterCanvas** — Live Canvas preview, provides `renderPreview` via `provide/inject`
- **RightPanel** — Watermark settings (text/logo), single export
- **BatchPanel** — Batch file queue and processing

### Rendering Pipeline (critical design decision)

**Preview and export share the same Canvas drawing code.** This ensures WYSIWYG.

1. `useCanvas.ts` `renderPreview()` — draws to the visible canvas at container-scale
2. `useCanvas.ts` `renderFullRes()` — draws to an offscreen canvas at scale=1.0 for single-image export
3. `useCanvas.ts` `renderOffscreen()` — same as above but takes arbitrary base64 input, used by batch processing
4. All three call the shared `renderWatermarkStatic()` → `drawTextWatermarkStatic()` / `drawLogoWatermarkStatic()`
5. Exported base64 goes to Rust `export_file` which just writes raw bytes to disk

The Rust `commands/watermark.rs` and `commands/batch.rs` (using engine/text.rs and engine/overlay.rs) exist as a **fallback/alternative rendering path**. The app currently uses the frontend Canvas path exclusively.

### Pinia Stores
- `imageStore` — `currentImage`, `exifData`, `filePath`, `renderedBase64`
- `watermarkStore` — `watermarkType`, `textConfig`, `logoConfig`, `logoFormat`, `fontFamily`, `fontPath`, `systemFonts`, `fontsLoaded`, `enabled`
- `batchStore` — `files`, `progressList`, `isProcessing`

Reactivity: `CenterCanvas` deep-watches `watermarkStore.$state` — any config change triggers `renderPreview()`.

Config persistence: `watermarkStore` auto-saves to localStorage on change (300ms debounce), restores on init. `logo_base64` is excluded from persistence (too large).

### Tauri Commands (src-tauri/src/lib.rs registers all commands)

| Command | Role |
|---------|------|
| `load_image` | Decode image → base64 JPEG preview (quality 75) |
| `load_image_raw` | Read original file bytes → base64 (preserves alpha, used for logos + export) |
| `list_system_fonts` | Scan system font dirs → `[{path, name}]` for font dropdown |
| `export_file` | Write base64 bytes to disk (primary export path) |
| `read_exif` | Parse EXIF metadata via kamadak-exif |
| `apply_text_watermark` | Rust-side text watermark (backup) |
| `apply_logo_watermark` | Rust-side logo watermark (backup) |
| `process_batch` | Rust-side batch processing (backup) |

`engine` module is `pub` so integration tests can access it directly.

### Key Rust crates
`image` 0.25, `imageproc` 0.25, `ab_glyph` 0.2 (text rendering), `kamadak-exif` 0.6 (EXIF parsing), `base64` 0.22.

### Format detection
`detect_format()` in `src-tauri/src/engine/image.rs` — only `.png` extension → `"png"`, everything else → `"jpeg"`.

### JPEG encoding constraint
JPEG encoder only accepts RGB8 (3 channels). `rgba_to_rgb()` strips alpha before JPEG encoding. PNG export goes directly through `canvas.toDataURL("image/png")` on the frontend.

### Cross-platform font paths
- Windows: `C:/Windows/Fonts/`
- macOS: `/System/Library/Fonts/`, `/Library/Fonts/`
- Linux: `/usr/share/fonts/truetype/`, `/usr/local/share/fonts/`

Default font: Arial (Win) / Helvetica (macOS) / DejaVuSans (Linux). Detected via `navigator.platform` (frontend) or `cfg!(target_os)` (Rust).

System fonts are enumerated on app launch via `list_system_fonts` and displayed in a dropdown. Custom fonts are loaded via `FontFace` API + `load_image_raw` (reads TTF/OTF bytes → base64 data URL). Canvas uses CSS font-family name, not file path.

### Logo scale
Logo size = `canvas.width * (config.scale / 100)`. Since `canvas.width` differs between preview (scaled) and export (original), the percentage is inherently WYSIWYG — no `renderScale` multiplier needed.

## CI/CD

`.github/workflows/build.yml` — triggers on `v*` tags or manual `workflow_dispatch`. Builds Windows NSIS installer and macOS DMG via `tauri-action@v0`. macOS uses ad-hoc signing (`signingIdentity: "-"`).

## TypeScript & Path Aliases

Strict mode with `noUnusedLocals`/`noUnusedParameters`. `@/*` maps to `src/*` via Vite alias.
