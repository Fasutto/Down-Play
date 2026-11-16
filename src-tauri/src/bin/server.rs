use axum::{
    Router,
    body::Body,
    extract::Query,
    http::{HeaderMap, StatusCode, header},
    response::{
        IntoResponse, Json, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    convert::Infallible,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Stdio,
    sync::OnceLock,
    time::UNIX_EPOCH,
};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::CorsLayer;

const MAX_CHUNK_SIZE: u64 = 2 * 1024 * 1024;

#[derive(Deserialize)]
struct InfoQuery {
    url: Option<String>,
}

#[derive(Deserialize)]
struct LibraryQuery {
    dir: Option<String>,
}

#[derive(Deserialize)]
struct StreamQuery {
    path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadRequest {
    url: String,
    format: Option<String>,
    quality: Option<String>,
    codec: Option<String>,
    output_dir: Option<String>,
    speed_limit: Option<String>,
    auto_organize: Option<bool>,
    embed_metadata: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoFormat {
    format_id: String,
    resolution: String,
    ext: String,
    has_video: bool,
    has_audio: bool,
    filesize_approx: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoMetadata {
    id: String,
    title: String,
    thumbnail: String,
    duration: f64,
    uploader: String,
    formats: Vec<VideoFormat>,
}

fn resolve_bin(name: &str) -> PathBuf {
    let exe = if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    for candidate in [
        PathBuf::from("bin").join(&exe),
        PathBuf::from("..").join("bin").join(&exe),
    ] {
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(name)
}

fn new_cmd(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8");
    cmd
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

async fn info(Query(q): Query<InfoQuery>) -> Response {
    let Some(url) = q.url.filter(|u| !u.trim().is_empty()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "URL is required" })),
        )
            .into_response();
    };

    let yt_dlp = resolve_bin("yt-dlp");
    let output = match new_cmd(&yt_dlp)
        .args(["--dump-single-json", "--no-warnings", "--no-playlist", &url])
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("No se pudo ejecutar yt-dlp: {e}") })),
            )
                .into_response();
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": stderr.trim().to_string() })),
        )
            .into_response();
    }

    let Ok(raw) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Error procesando metadatos del video" })),
        )
            .into_response();
    };

    let formats = raw["formats"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|f| VideoFormat {
                    format_id: f["format_id"].as_str().unwrap_or_default().to_string(),
                    resolution: f["resolution"]
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| f["height"].as_u64().map(|h| format!("{h}p")))
                        .unwrap_or_else(|| "audio".to_string()),
                    ext: f["ext"].as_str().unwrap_or_default().to_string(),
                    has_video: f["vcodec"].as_str().unwrap_or("none") != "none",
                    has_audio: f["acodec"].as_str().unwrap_or("none") != "none",
                    filesize_approx: f["filesize"]
                        .as_u64()
                        .or_else(|| f["filesize_approx"].as_u64()),
                })
                .collect()
        })
        .unwrap_or_default();

    Json(VideoMetadata {
        id: raw["id"].as_str().unwrap_or_default().to_string(),
        title: raw["title"].as_str().unwrap_or_default().to_string(),
        thumbnail: raw["thumbnail"].as_str().unwrap_or_default().to_string(),
        duration: raw["duration"].as_f64().unwrap_or(0.0),
        uploader: raw["uploader"].as_str().unwrap_or("YouTube").to_string(),
        formats,
    })
    .into_response()
}

fn progress_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"\[download\]\s+([\d.]+)%\s+of\s+~?[\d.]+\w+\s+at\s+([\d.]+\w+/s)\s+ETA\s+([\d:]+)",
        )
        .expect("valid regex")
    })
}

async fn download(Json(req): Json<DownloadRequest>) -> impl IntoResponse {
    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(32);

    tokio::spawn(async move {
        let yt_dlp = resolve_bin("yt-dlp");
        let ffmpeg = resolve_bin("ffmpeg");
        let target_dir = req
            .output_dir
            .filter(|d| !d.is_empty() && Path::new(d).exists())
            .unwrap_or_else(|| ".".to_string());

        let template = if req.auto_organize.unwrap_or(false) {
            Path::new(&target_dir)
                .join("%(uploader)s")
                .join("%(title)s.%(ext)s")
        } else {
            Path::new(&target_dir).join("%(title)s.%(ext)s")
        };

        let mut args = vec![
            "--newline".to_string(),
            "--progress".to_string(),
            "--no-playlist".to_string(),
            "--windows-filenames".to_string(),
            "--restrict-filenames".to_string(),
            "--output".to_string(),
            template.to_string_lossy().to_string(),
            "--ffmpeg-location".to_string(),
            ffmpeg.to_string_lossy().to_string(),
        ];

        if let Some(limit) = req.speed_limit.as_deref() {
            if !limit.is_empty() && limit != "unlimited" {
                args.push("--limit-rate".to_string());
                args.push(limit.to_string());
            }
        }
        if req.embed_metadata.unwrap_or(false) {
            args.push("--embed-metadata".to_string());
            args.push("--embed-thumbnail".to_string());
        }

        if req.format.as_deref() == Some("audio") {
            args.extend([
                "-x".into(),
                "--audio-format".into(),
                "mp3".into(),
                "--audio-quality".into(),
                "0".into(),
            ]);
        } else {
            let quality = req.quality.as_deref().unwrap_or("720");
            let filter = if quality == "best" {
                "bestvideo+bestaudio/best".to_string()
            } else {
                format!("bestvideo[height<={quality}]+bestaudio/best[height<={quality}]")
            };
            args.extend([
                "-f".into(),
                filter,
                "--merge-output-format".into(),
                "mp4".into(),
            ]);
        }
        args.push(req.url);

        let Ok(mut child) = new_cmd(&yt_dlp)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        else {
            let _ = tx
                .send(Ok(Event::default().data(
                    r#"{"type":"error","error":"No se pudo iniciar yt-dlp"}"#,
                )))
                .await;
            return;
        };

        let mut last_path = String::new();
        if let Some(so) = child.stdout.take() {
            let mut lines = BufReader::new(so).lines();
            let re = progress_re();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(caps) = re.captures(&line) {
                    if let Ok(progress) = caps[1].parse::<f64>() {
                        let payload = serde_json::json!({
                            "type": "progress",
                            "progress": progress,
                            "speed": &caps[2],
                            "eta": &caps[3],
                        });
                        let _ = tx
                            .send(Ok(Event::default().data(payload.to_string())))
                            .await;
                    }
                }
                if let Some(dest) = line
                    .strip_prefix("[download] Destination: ")
                    .or_else(|| line.strip_prefix("[Merger] Merging formats into "))
                {
                    last_path = dest.trim().trim_matches('"').to_string();
                }
            }
        }

        let status = child.wait().await;
        match status {
            Ok(s) if s.success() => {
                let payload = serde_json::json!({
                    "type": "complete",
                    "filePath": if last_path.is_empty() { target_dir } else { last_path }
                });
                let _ = tx
                    .send(Ok(Event::default().data(payload.to_string())))
                    .await;
            }
            _ => {
                let _ = tx
                    .send(Ok(
                        Event::default().data(r#"{"type":"error","error":"Error en la descarga"}"#)
                    ))
                    .await;
            }
        }
    });

    Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default())
}

async fn library(Query(q): Query<LibraryQuery>) -> impl IntoResponse {
    let Some(dir_path) = q.dir.filter(|d| !d.is_empty()) else {
        return Json(Vec::<serde_json::Value>::new());
    };
    let Ok(entries) = std::fs::read_dir(&dir_path) else {
        return Json(Vec::<serde_json::Value>::new());
    };

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let is_video = matches!(ext.as_str(), "mp4" | "mkv" | "webm" | "avi" | "mov");
        let is_audio = matches!(ext.as_str(), "mp3" | "m4a" | "wav" | "flac" | "aac" | "ogg");
        if !is_video && !is_audio {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let created_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        items.push(serde_json::json!({
            "id": format!("local_{created_at}_{}", items.len()),
            "title": path.file_stem().and_then(|s| s.to_str()).unwrap_or_default(),
            "fileName": path.file_name().and_then(|s| s.to_str()).unwrap_or_default(),
            "filePath": path.to_string_lossy(),
            "format": if is_video { "video" } else { "audio" },
            "ext": ext.to_uppercase(),
            "sizeBytes": meta.len(),
            "createdAt": created_at,
        }));
    }
    Json(items)
}

async fn stream(Query(q): Query<StreamQuery>, headers: HeaderMap) -> Response {
    let Some(path_str) = q.path else {
        return (StatusCode::BAD_REQUEST, "Missing path").into_response();
    };
    let path = Path::new(&path_str);
    let is_media = matches!(
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
    );
    if !is_media {
        return (StatusCode::FORBIDDEN, "Forbidden file type").into_response();
    }
    let Ok(mut file) = File::open(path) else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let Ok(meta) = file.metadata() else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let total = meta.len();

    if let Some(range_val) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some((s_str, e_str)) = range_val
            .strip_prefix("bytes=")
            .and_then(|s| s.split_once('-'))
        {
            if let Ok(start) = s_str.parse::<u64>() {
                let end = e_str
                    .parse::<u64>()
                    .unwrap_or(start + MAX_CHUNK_SIZE - 1)
                    .min(total.saturating_sub(1))
                    .min(start + MAX_CHUNK_SIZE - 1);
                if start < total && start <= end {
                    let len = (end - start + 1) as usize;
                    let mut buf = vec![0u8; len];
                    if file.seek(SeekFrom::Start(start)).is_ok()
                        && file.read_exact(&mut buf).is_ok()
                    {
                        return Response::builder()
                            .status(StatusCode::PARTIAL_CONTENT)
                            .header(header::CONTENT_LENGTH, len.to_string())
                            .header(
                                header::CONTENT_RANGE,
                                format!("bytes {start}-{end}/{total}"),
                            )
                            .header(header::ACCEPT_RANGES, "bytes")
                            .body(Body::from(buf))
                            .unwrap_or_default();
                    }
                }
            }
        }
    }

    let mut buf = Vec::with_capacity(total as usize);
    if file.read_to_end(&mut buf).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Read error").into_response();
    }
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_LENGTH, total.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from(buf))
        .unwrap_or_default()
}

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "4000".to_string());
    let addr = format!("0.0.0.0:{port}");

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/info", get(info))
        .route("/api/download", post(download))
        .route("/api/library", get(library))
        .route("/api/stream", get(stream))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind port");
    println!("YouTube Downloader Rust Server corriendo en http://{addr}");
    axum::serve(listener, app).await.expect("serve");
}
