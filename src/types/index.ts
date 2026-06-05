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
}

export interface LogoWatermarkConfig {
  logo_base64: string;
  opacity: number;
  scale: number;
  pos_x: number;
  pos_y: number;
  rotation: number;
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

export interface BatchConfig {
  watermark_type: "text" | "logo";
  text_config: TextWatermarkConfig | null;
  logo_config: LogoWatermarkConfig | null;
  font_path: string | null;
  output_dir: string;
}

export interface FontEntry {
  path: string;
  name: string;
}

export type WatermarkType = "text" | "logo";
