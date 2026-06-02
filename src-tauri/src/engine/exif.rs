use exif::{Reader, Tag};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct ExifData {
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<String>,
    pub aperture: Option<String>,
    pub shutter_speed: Option<String>,
    pub iso: Option<String>,
    pub date_taken: Option<String>,
    pub exposure_comp: Option<String>,
    pub gps_latitude: Option<String>,
    pub gps_longitude: Option<String>,
    pub image_width: Option<String>,
    pub image_height: Option<String>,
}

pub struct ExifReader;

impl ExifReader {
    pub fn read(file_path: &str) -> Result<ExifData, String> {
        let file = std::fs::File::open(file_path)
            .map_err(|e| format!("Failed to read file for EXIF: {e}"))?;
        let mut reader = std::io::BufReader::new(&file);
        let exif = Reader::new()
            .read_from_container(&mut reader)
            .map_err(|e| format!("EXIF parse error: {e}"))?;

        let mut data = ExifData::default();

        for field in exif.fields() {
            let value = field.display_value().with_unit(&exif).to_string();
            let tag = field.tag;

            match tag {
                Tag::Make => data.camera_make = Some(value),
                Tag::Model => data.camera_model = Some(value),
                Tag::LensModel => data.lens_model = Some(value),
                Tag::FocalLength => data.focal_length = Some(value),
                Tag::FNumber => data.aperture = Some(format_f_stop(&value)),
                Tag::ExposureTime => data.shutter_speed = Some(format_exposure(&value)),
                Tag::PhotographicSensitivity => data.iso = Some(value),
                Tag::DateTimeOriginal => data.date_taken = Some(value),
                Tag::ExposureBiasValue => data.exposure_comp = Some(value),
                Tag::GPSLatitude => data.gps_latitude = Some(value),
                Tag::GPSLongitude => data.gps_longitude = Some(value),
                Tag::ImageWidth => data.image_width = Some(value),
                Tag::ImageLength => data.image_height = Some(value),
                _ => {}
            }
        }

        Ok(data)
    }
}

fn format_f_stop(value: &str) -> String {
    if let Ok(v) = value.parse::<f64>() {
        format!("f/{v:.1}")
    } else {
        value.to_string()
    }
}

fn format_exposure(value: &str) -> String {
    if let Ok(v) = value.parse::<f64>() {
        if v >= 1.0 {
            format!("{v:.0}s")
        } else {
            format!("1/{}s", (1.0 / v).round() as u32)
        }
    } else {
        value.to_string()
    }
}
