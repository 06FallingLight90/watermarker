/** Watermark configuration shared between frontend and backend */

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  base64: string;
}

/** Raw image data (original file bytes, no re-encoding). Used for logo loading. */
export interface RawImageData {
  base64: string;
  format: string; // "png" | "jpeg"
}

export interface ExifData {
  camera_make: string | null;
  camera_model: string | null;
  lens_model: string | null;
  focal_length: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  iso: string | null;
  date_taken: string | null;
  exposure_comp: string | null;
  gps_latitude: string | null;
  gps_longitude: string | null;
  image_width: string | null;
  image_height: string | null;
}

export interface TextWatermarkConfig {
  text: string;
  font_size: number;
  color: [number, number, number, number];
  rotation: number;
  pos_x: number;
  pos_y: number;
  opacity: number;
  tile_spacing: number;
  stroke_color: [number, number, number];
  stroke_width: number;
}

export interface LogoWatermarkConfig {
  logo_base64: string;
  opacity: number;
  scale: number;
  pos_x: number;
  pos_y: number;
  rotation: number;
}

/** Visibility toggles for EXIF metadata fields shown in watermark */
export interface ExifFieldVisibility {
  camera_model: boolean;
  lens_model: boolean;
  focal_length: boolean;
  aperture: boolean;
  shutter_speed: boolean;
  iso: boolean;
  date_taken: boolean;
  gps: boolean;
}

/** Per-field style settings used in independent layout mode */
export interface ExifFieldStyle {
  font_size: number;
  color: [number, number, number, number];
  opacity: number;
  stroke_color: [number, number, number];
  stroke_width: number;
  pos_x: number;
  pos_y: number;
  rotation: number;
}

/** Keys identifying EXIF field groups for per-field styling */
export type ExifFieldGroup = "camera_model" | "lens_model" | "date_taken" | "gps" | "inline";

export interface ExifWatermarkConfig {
  font_size: number;
  color: [number, number, number, number];
  rotation: number;
  pos_x: number;
  pos_y: number;
  opacity: number;
  tile_spacing: number;
  stroke_color: [number, number, number];
  stroke_width: number;
  layout_mode: "unified" | "independent";
  fields: ExifFieldVisibility;
  field_styles: Record<ExifFieldGroup, ExifFieldStyle>;
  /** Replace camera_model text with manufacturer trade mark logo (Canon/Nikon/Sony) */
  trade_mark_enabled: boolean;
  /** Trade mark logo size as percentage of photo width (1–100) */
  trade_mark_scale: number;
}

export interface WatermarkResult {
  base64: string;
  width: number;
  height: number;
}

export interface BatchProgress {
  current: number;
  total: number;
  file_name: string;
  status: "processing" | "done" | "error";
  error: string | null;
}

/** Complete watermark configuration snapshot for a single batch file */
export interface BatchWatermarkConfig {
  watermarkType: WatermarkType;
  textConfig: TextWatermarkConfig;
  logoConfig: LogoWatermarkConfig;
  exifConfig: ExifWatermarkConfig;
  logoFormat: string;
  fontFamily: string;
  fontPath: string;
  enabled: boolean;
}

/** A single entry in the batch processing queue */
export interface BatchFileEntry {
  path: string;
  config: BatchWatermarkConfig;
}

export interface BatchConfig {
  watermark_type: "text" | "logo" | "exif";
  text_config: TextWatermarkConfig | null;
  logo_config: LogoWatermarkConfig | null;
  font_path: string | null;
  output_dir: string;
}

export interface FontEntry {
  path: string;
  name: string;
}

export type WatermarkType = "text" | "logo" | "exif";
