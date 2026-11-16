use regex::Regex;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader as StdBufReader};
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoFormat {
    pub format_id: String,
    pub resolution: String,
    pub ext: String,
    pub has_video: bool,
    pub has_audio: bool,
    pub filesize_approx: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub id: String,
    pub title: String,
    pub thumbnail: String,
    pub duration: f64,
    pub uploader: String,
    pub channel_avatar: Option<String>,
    pub upload_date: Option<String>,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    pub task_id: String,
    pub url: String,
    pub output_dir: String,
    pub format: String,
    pub quality: String,
    pub codec: Option<String>,
    pub speed_limit: Option<String>,
    pub auto_organize: Option<bool>,
    pub embed_metadata: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
    pub task_id: String,
    pub progress: f64,
    pub speed: String,
    pub eta: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCompletePayload {
    pub task_id: String,
    pub file_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadErrorPayload {
    pub task_id: String,
    pub error: String,
}

/// Resolves the path to a bundled binary (yt-dlp, ffmpeg) in prod or dev, falling back to PATH.
pub fn resolve_binary_path(app: &AppHandle, binary_name: &str) -> PathBuf {
    let exe_name = if cfg!(target_os = "windows") {
        format!("{binary_name}.exe")
    } else {
        binary_name.to_string()
    };

    if let Ok(res_dir) = app.path().resource_dir() {
        let candidates = [
            res_dir.join("bin").join(&exe_name),
            res_dir.join("_up_").join("bin").join(&exe_name),
            res_dir.join(&exe_name),
        ];
        for path in candidates {
            if path.exists() {
                return path;
            }
        }
    }

    let dev_candidates = [
        PathBuf::from("bin").join(&exe_name),
        PathBuf::from("..").join("bin").join(&exe_name),
    ];
    for path in dev_candidates {
        if path.exists() {
            return path;
        }
    }

    PathBuf::from(binary_name)
}

fn new_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

fn new_std_command(program: &Path) -> StdCommand {
    let mut cmd = StdCommand::new(program);
    cmd.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Updates `yt-dlp` in place using `yt-dlp -U`.
pub async fn update_yt_dlp(app: &AppHandle) -> Result<String, String> {
    let yt_dlp = resolve_binary_path(app, "yt-dlp");
    let output = new_command(&yt_dlp)
        .args(["-U"])
        .output()
        .await
        .map_err(|e| format!("No se pudo ejecutar yt-dlp -U: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("yt-dlp -U finalizó con código {:?}", output.status.code())
        };
        return Err(msg);
    }

    if stdout.contains("is up to date") {
        Ok("yt-dlp ya está en la última versión.".to_string())
    } else if !stdout.is_empty() {
        let last_line = stdout.lines().last().unwrap_or(&stdout);
        Ok(last_line.to_string())
    } else {
        Ok("yt-dlp actualizado correctamente.".to_string())
    }
}

/// Fetches video metadata using `yt-dlp --dump-single-json`.
pub async fn fetch_info(app: &AppHandle, url: &str) -> Result<VideoMetadata, String> {
    let yt_dlp = resolve_binary_path(app, "yt-dlp");
    let output = new_command(&yt_dlp)
        .args(["--dump-single-json", "--no-warnings", "--no-playlist", url])
        .output()
        .await
        .map_err(|e| format!("No se pudo ejecutar yt-dlp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("yt-dlp finalizó con código {:?}", output.status.code())
        };
        return Err(msg);
    }

    let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Error al procesar metadatos del video: {e}"))?;

    let formats = raw["formats"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|f| {
                    let resolution = f["resolution"]
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| f["height"].as_u64().map(|h| format!("{h}p")))
                        .unwrap_or_else(|| "audio".to_string());

                    VideoFormat {
                        format_id: f["format_id"].as_str().unwrap_or_default().to_string(),
                        resolution,
                        ext: f["ext"].as_str().unwrap_or_default().to_string(),
                        has_video: f["vcodec"].as_str().unwrap_or("none") != "none",
                        has_audio: f["acodec"].as_str().unwrap_or("none") != "none",
                        filesize_approx: f["filesize"]
                            .as_u64()
                            .or_else(|| f["filesize_approx"].as_u64()),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let upload_date = raw["upload_date"].as_str().map(|d| {
        if d.len() == 8 {
            format!("{}/{}/{}", &d[6..8], &d[4..6], &d[0..4])
        } else {
            d.to_string()
        }
    });

    let channel_avatar = raw["channel_thumbnail"]
        .as_str()
        .or_else(|| raw["uploader_thumbnail"].as_str())
        .map(|s| s.to_string());

    Ok(VideoMetadata {
        id: raw["id"].as_str().unwrap_or_default().to_string(),
        title: raw["title"].as_str().unwrap_or_default().to_string(),
        thumbnail: raw["thumbnail"].as_str().unwrap_or_default().to_string(),
        duration: raw["duration"].as_f64().unwrap_or(0.0),
        uploader: raw["uploader"].as_str().unwrap_or("YouTube").to_string(),
        channel_avatar,
        upload_date,
        formats,
    })
}

fn build_format_filter(quality: &str, codec: &str) -> String {
    let codec_prefix = match codec {
        "H264" => Some("avc1"),
        "VP9" => Some("vp9"),
        "AV1" => Some("av01"),
        _ => None,
    };

    if quality == "best" {
        return match codec_prefix {
            Some(c) => format!("bestvideo[vcodec^={c}]+bestaudio/bestvideo+bestaudio/best"),
            None => "bestvideo+bestaudio/best".to_string(),
        };
    }

    let h: u32 = quality.parse().unwrap_or(720);
    match codec_prefix {
        Some(c) => format!(
            "bestvideo[vcodec^={c}][height<={h}]+bestaudio/bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
        ),
        None => format!(
            "bestvideo[height<={h}]+bestaudio/bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
        ),
    }
}

fn normalize_speed_limit(limit: &str) -> String {
    let trimmed = limit.trim();
    let lower = trimmed.to_lowercase();
    if lower.ends_with("mb") {
        format!("{}M", &trimmed[..trimmed.len() - 2])
    } else if lower.ends_with("kb") {
        format!("{}K", &trimmed[..trimmed.len() - 2])
    } else {
        trimmed.to_string()
    }
}

fn progress_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"\[download\]\s+([\d.]+)%\s+of\s+~?[\d.]+\w+\s+at\s+([\d.]+\w+/s)\s+ETA\s+([\d:]+)",
        )
        .expect("valid progress regex")
    })
}

fn parse_destination_path(line: &str) -> Option<String> {
    let prefixes = [
        "[download] Destination: ",
        "[Merger] Merging formats into ",
        "[ExtractAudio] Destination: ",
    ];
    for prefix in prefixes {
        if let Some(rest) = line.strip_prefix(prefix) {
            return Some(rest.trim().trim_matches('"').to_string());
        }
    }
    if let Some(rest) = line.strip_prefix("[download] ") {
        if let Some(path_part) = rest.strip_suffix(" has already been downloaded") {
            return Some(path_part.trim().trim_matches('"').to_string());
        }
    }
    None
}

fn find_newest_media_file(output_dir: &str) -> Option<String> {
    let entries = std::fs::read_dir(output_dir).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;

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
        if !matches!(
            ext.as_str(),
            "mp4" | "mkv" | "webm" | "avi" | "mp3" | "m4a" | "wav" | "flac"
        ) {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(mtime) = meta.modified() {
                if best.as_ref().map_or(true, |(b_time, _)| mtime > *b_time) {
                    best = Some((mtime, path));
                }
            }
        }
    }

    best.map(|(_, p)| p.to_string_lossy().to_string())
}

fn resolve_unique_output_template(
    yt_dlp: &Path,
    template: &str,
    url: &str,
    is_audio: bool,
) -> String {
    let mut probe_args = vec![
        "--no-warnings",
        "--no-playlist",
        "--windows-filenames",
        "--restrict-filenames",
        "--trim-filenames",
        "150",
        "--get-filename",
        "-o",
        template,
    ];
    if is_audio {
        probe_args.extend(["-x", "--audio-format", "mp3"]);
    }
    probe_args.push(url);

    let Ok(out) = new_std_command(yt_dlp)
        .args(&probe_args)
        .stdin(Stdio::null())
        .output()
    else {
        return template.to_string();
    };

    if !out.status.success() {
        return template.to_string();
    }

    let raw_path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if raw_path.is_empty() {
        return template.to_string();
    }

    let candidate = PathBuf::from(&raw_path);
    let check_path = if is_audio {
        candidate.with_extension("mp3")
    } else {
        candidate.with_extension("mp4")
    };

    if !check_path.exists() && !candidate.exists() {
        return template.to_string();
    }

    let parent = candidate.parent().unwrap_or_else(|| Path::new("."));
    let stem = candidate
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");

    for n in 1..=999 {
        let numbered_mp4 = parent.join(format!("{stem} ({n}).mp4"));
        let numbered_mp3 = parent.join(format!("{stem} ({n}).mp3"));
        if !numbered_mp4.exists() && !numbered_mp3.exists() {
            return parent
                .join(format!("{stem} ({n}).%(ext)s"))
                .to_string_lossy()
                .to_string();
        }
    }

    template.to_string()
}

/// Spawns `yt-dlp` in the background and streams progress/completion/error events to the frontend.
pub fn start_download(app: AppHandle, options: DownloadOptions) {
    tauri::async_runtime::spawn(async move {
        let yt_dlp = resolve_binary_path(&app, "yt-dlp");
        let ffmpeg = resolve_binary_path(&app, "ffmpeg");

        let output_dir = if options.output_dir.trim().is_empty() {
            app.path()
                .download_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        } else {
            options.output_dir.clone()
        };
        let _ = std::fs::create_dir_all(&output_dir);

        let raw_template = if options.auto_organize.unwrap_or(false) {
            Path::new(&output_dir)
                .join("%(uploader)s")
                .join("%(title)s.%(ext)s")
        } else {
            Path::new(&output_dir).join("%(title)s.%(ext)s")
        };

        let is_audio = options.format == "audio";
        let unique_template = resolve_unique_output_template(
            &yt_dlp,
            &raw_template.to_string_lossy(),
            &options.url,
            is_audio,
        );

        let mut args: Vec<String> = vec![
            "--no-warnings".into(),
            "--newline".into(),
            "--progress".into(),
            "--no-playlist".into(),
            "--concurrent-fragments".into(),
            "4".into(),
            "--windows-filenames".into(),
            "--restrict-filenames".into(),
            "--trim-filenames".into(),
            "150".into(),
            "--output".into(),
            unique_template,
            "--ffmpeg-location".into(),
            ffmpeg.to_string_lossy().to_string(),
        ];

        if let Some(limit) = options.speed_limit.as_deref() {
            if !limit.is_empty() && limit != "unlimited" {
                args.push("--limit-rate".into());
                args.push(normalize_speed_limit(limit));
            }
        }

        if options.embed_metadata.unwrap_or(false) {
            args.push("--embed-metadata".into());
            args.push("--embed-thumbnail".into());
        }

        if options.format == "audio" {
            args.extend([
                "-x".into(),
                "--audio-format".into(),
                "mp3".into(),
                "--audio-quality".into(),
                "0".into(),
            ]);
        } else {
            let codec = options.codec.as_deref().unwrap_or("H264");
            let filter = build_format_filter(&options.quality, codec);
            args.extend([
                "-f".into(),
                filter,
                "--merge-output-format".into(),
                "mp4".into(),
            ]);
        }

        args.push(options.url.clone());

        let app_clone = app.clone();
        let task_id = options.task_id.clone();
        let output_dir_clone = output_dir.clone();

        let _ = tokio::task::spawn_blocking(move || {
            let mut child = match new_std_command(&yt_dlp)
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(c) => c,
                Err(e) => {
                    let _ = app_clone.emit(
                        "download-error",
                        DownloadErrorPayload {
                            task_id,
                            error: format!("No se pudo iniciar yt-dlp: {e}"),
                        },
                    );
                    return;
                }
            };

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let stderr_handle = std::thread::spawn(move || {
                let mut err_buf = String::new();
                if let Some(se) = stderr {
                    for line in StdBufReader::new(se).lines().map_while(Result::ok) {
                        if !line.contains("WARNING:") {
                            err_buf.push_str(&line);
                            err_buf.push('\n');
                        }
                    }
                }
                err_buf
            });

            let mut last_file_path = String::new();
            if let Some(so) = stdout {
                let re = progress_regex();
                for line in StdBufReader::new(so).lines().map_while(Result::ok) {
                    if let Some(caps) = re.captures(&line) {
                        if let Ok(progress) = caps[1].parse::<f64>() {
                            let _ = app_clone.emit(
                                "download-progress",
                                DownloadProgressPayload {
                                    task_id: task_id.clone(),
                                    progress,
                                    speed: caps[2].to_string(),
                                    eta: caps[3].to_string(),
                                },
                            );
                        }
                    }
                    if let Some(dest) = parse_destination_path(&line) {
                        last_file_path = dest;
                    }
                }
            }

            let status = child.wait();
            let stderr_text = stderr_handle.join().unwrap_or_default();

            match status {
                Ok(s) if s.success() => {
                    let mut final_path = last_file_path;
                    let p = Path::new(&final_path);
                    if final_path.is_empty() || !p.exists() || p.is_dir() {
                        if let Some(newest) = find_newest_media_file(&output_dir_clone) {
                            final_path = newest;
                        } else {
                            final_path = output_dir_clone;
                        }
                    }
                    let _ = app_clone.emit(
                        "download-complete",
                        DownloadCompletePayload {
                            task_id,
                            file_path: final_path,
                        },
                    );
                }
                Ok(s) => {
                    let msg = if stderr_text.trim().is_empty() {
                        format!("Descarga finalizó con código {:?}", s.code())
                    } else {
                        stderr_text.trim().to_string()
                    };
                    let _ = app_clone.emit(
                        "download-error",
                        DownloadErrorPayload {
                            task_id,
                            error: msg,
                        },
                    );
                }
                Err(e) => {
                    let _ = app_clone.emit(
                        "download-error",
                        DownloadErrorPayload {
                            task_id,
                            error: e.to_string(),
                        },
                    );
                }
            }
        })
        .await;
    });
}
