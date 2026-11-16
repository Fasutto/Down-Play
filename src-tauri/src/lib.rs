mod downloader;
mod media_protocol;

use downloader::{DownloadOptions, VideoMetadata};
use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScanItem {
    pub id: String,
    pub title: String,
    pub file_name: String,
    pub file_path: String,
    pub thumbnail: String,
    pub format: String,
    pub quality: String,
    pub ext: String,
    pub size_bytes: u64,
    pub created_at: u64,
}

#[tauri::command]
async fn get_video_info(app: AppHandle, url: String) -> Result<VideoMetadata, String> {
    downloader::fetch_info(&app, &url).await
}

#[tauri::command]
async fn start_download(
    app: AppHandle,
    options: DownloadOptions,
) -> Result<serde_json::Value, String> {
    downloader::start_download(app, options);
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
fn get_default_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("No se pudo obtener la carpeta de descargas: {e}"))
}

#[tauri::command]
fn scan_library_folder(dir_path: String) -> Vec<LibraryScanItem> {
    if dir_path.is_empty() {
        return Vec::new();
    }
    let dir = Path::new(&dir_path);
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext_lower = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        let is_video = matches!(ext_lower.as_str(), "mp4" | "mkv" | "webm" | "avi" | "mov");
        let is_audio = matches!(
            ext_lower.as_str(),
            "mp3" | "m4a" | "wav" | "flac" | "aac" | "ogg"
        );
        if !is_video && !is_audio {
            continue;
        }

        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let created_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let clean_title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        let file_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();

        let mut thumb_url = String::new();
        for img_ext in ["jpg", "jpeg", "png", "webp"] {
            let candidate = dir.join(format!("{clean_title}.{img_ext}"));
            if candidate.exists() {
                thumb_url = media_protocol::to_local_media_url(&candidate);
                break;
            }
        }

        let ext_upper = ext_lower.to_uppercase();
        items.push(LibraryScanItem {
            id: format!("local_{created_at}_{}", items.len()),
            title: clean_title,
            file_name,
            file_path: path.to_string_lossy().to_string(),
            thumbnail: thumb_url,
            format: if is_video { "video" } else { "audio" }.to_string(),
            quality: if is_video {
                ext_upper.clone()
            } else {
                "Audio".to_string()
            },
            ext: ext_upper,
            size_bytes: meta.len(),
            created_at,
        });
    }

    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    items
}

#[tauri::command]
async fn update_yt_dlp(app: tauri::AppHandle) -> Result<String, String> {
    downloader::update_yt_dlp(&app).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {}))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("local-media", media_protocol::handle_request)
        .invoke_handler(tauri::generate_handler![
            get_video_info,
            start_download,
            get_default_dir,
            scan_library_folder,
            update_yt_dlp
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = downloader::update_yt_dlp(&handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
