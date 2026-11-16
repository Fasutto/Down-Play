use percent_encoding::{NON_ALPHANUMERIC, percent_decode_str, utf8_percent_encode};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::http::{Request, Response, StatusCode, header};

const MAX_CHUNK_SIZE: u64 = 2 * 1024 * 1024; // 2 MB per range chunk

pub fn to_local_media_url(file_path: &Path) -> String {
    let encoded = utf8_percent_encode(&file_path.to_string_lossy(), NON_ALPHANUMERIC).to_string();
    #[cfg(target_os = "windows")]
    {
        format!("http://local-media.localhost/file/{encoded}")
    }
    #[cfg(not(target_os = "windows"))]
    {
        format!("local-media://file/{encoded}")
    }
}

fn is_allowed_media_ext(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref(),
        Some(
            "mp4"
                | "m4v"
                | "webm"
                | "mkv"
                | "mov"
                | "avi"
                | "mp3"
                | "m4a"
                | "aac"
                | "wav"
                | "flac"
                | "ogg"
                | "opus"
                | "jpg"
                | "jpeg"
                | "png"
                | "webp"
        )
    )
}

fn mime_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        Some("mp3") => "audio/mpeg",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("wav") => "audio/wav",
        Some("flac") => "audio/flac",
        Some("ogg" | "opus") => "audio/ogg",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

fn extract_file_path(uri: &tauri::http::Uri) -> Option<PathBuf> {
    let path = uri.path().trim_start_matches('/');
    let encoded_path = path.strip_prefix("file/").unwrap_or(path);
    let decoded = percent_decode_str(encoded_path).decode_utf8().ok()?;
    Some(PathBuf::from(decoded.as_ref()))
}

fn parse_range(range_header: &str, total: u64) -> Option<(u64, u64)> {
    let spec = range_header.strip_prefix("bytes=")?;
    let (start_str, end_str) = spec.split_once('-')?;

    if start_str.is_empty() {
        let suffix: u64 = end_str.parse().ok()?;
        let start = total.saturating_sub(suffix);
        return Some((start, total.saturating_sub(1)));
    }

    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        (start + MAX_CHUNK_SIZE - 1).min(total.saturating_sub(1))
    } else {
        end_str
            .parse::<u64>()
            .ok()?
            .min(total.saturating_sub(1))
            .min(start + MAX_CHUNK_SIZE - 1)
    };

    if start >= total || start > end {
        return None;
    }
    Some((start, end))
}

fn cors_builder(status: StatusCode) -> tauri::http::response::Builder {
    Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "*")
}

pub fn handle_request<R: tauri::Runtime>(
    _ctx: tauri::UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() == tauri::http::Method::OPTIONS {
        return cors_builder(StatusCode::NO_CONTENT)
            .body(Vec::new())
            .unwrap_or_default();
    }

    let Some(file_path) = extract_file_path(request.uri()) else {
        return cors_builder(StatusCode::BAD_REQUEST)
            .body(b"Invalid path".to_vec())
            .unwrap_or_default();
    };

    if !is_allowed_media_ext(&file_path) {
        return cors_builder(StatusCode::FORBIDDEN)
            .body(b"Forbidden file type".to_vec())
            .unwrap_or_default();
    }

    let Ok(mut file) = File::open(&file_path) else {
        return cors_builder(StatusCode::NOT_FOUND)
            .body(b"Not found".to_vec())
            .unwrap_or_default();
    };

    let Ok(meta) = file.metadata() else {
        return cors_builder(StatusCode::NOT_FOUND)
            .body(b"Not found".to_vec())
            .unwrap_or_default();
    };

    if !meta.is_file() {
        return cors_builder(StatusCode::NOT_FOUND)
            .body(b"Not a file".to_vec())
            .unwrap_or_default();
    }

    let total = meta.len();
    let content_type = mime_type_for(&file_path);

    if request.method() == tauri::http::Method::HEAD {
        return cors_builder(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::CONTENT_LENGTH, total.to_string())
            .header(header::ACCEPT_RANGES, "bytes")
            .body(Vec::new())
            .unwrap_or_default();
    }

    if let Some(range_val) = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
    {
        let Some((start, end)) = parse_range(range_val, total) else {
            return cors_builder(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{total}"))
                .body(Vec::new())
                .unwrap_or_default();
        };

        let len = (end - start + 1) as usize;
        let mut buf = vec![0u8; len];
        if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut buf).is_err() {
            return cors_builder(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Vec::new())
                .unwrap_or_default();
        }

        return cors_builder(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::CONTENT_LENGTH, len.to_string())
            .header(
                header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{total}"),
            )
            .header(header::ACCEPT_RANGES, "bytes")
            .body(buf)
            .unwrap_or_default();
    }

    let mut buf = Vec::with_capacity(total as usize);
    if file.read_to_end(&mut buf).is_err() {
        return cors_builder(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Vec::new())
            .unwrap_or_default();
    }

    cors_builder(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, total.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(buf)
        .unwrap_or_default()
}
