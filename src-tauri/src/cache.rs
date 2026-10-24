use crate::models::{CacheItem, CacheStats, Song};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init_app_dir(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let _ = APP_DATA_DIR.set(dir);
}

pub fn get_app_dir() -> PathBuf {
    if let Some(dir) = APP_DATA_DIR.get() {
        return dir.clone();
    }

    #[cfg(target_os = "android")]
    {
        for candidate in ["/data/user/0/com.vibes.music/files", "/data/data/com.vibes.music/files"] {
            let p = PathBuf::from(candidate);
            if p.exists() || fs::create_dir_all(&p).is_ok() {
                return p;
            }
        }
    }

    let mut base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.push("Vibes");
    let _ = fs::create_dir_all(&base);
    base
}

pub fn get_cache_dir() -> PathBuf {
    let mut dir = get_app_dir();
    dir.push("cache");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn get_cached_file(video_id: &str) -> Option<PathBuf> {
    let cache_dir = get_cache_dir();
    let audio_path = cache_dir.join(format!("{}.m4a", video_id));
    if audio_path.exists() {
        if let Ok(metadata) = fs::metadata(&audio_path) {
            // Valid complete tracks are generally > 300KB
            if metadata.len() > 300_000 {
                return Some(audio_path);
            }
        }
    }
    None
}

pub fn save_song_metadata(song: &Song) -> Result<(), String> {
    let cache_dir = get_cache_dir();
    let meta_path = cache_dir.join(format!("{}.json", song.id));
    let json_str = serde_json::to_string_pretty(song)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    fs::write(meta_path, json_str).map_err(|e| format!("Failed to save metadata: {}", e))?;
    Ok(())
}

pub async fn download_song_async(song: Song) -> Result<(), String> {
    let video_id = song.id.clone();
    let cache_dir = get_cache_dir();
    let audio_path = cache_dir.join(format!("{}.m4a", video_id));
    let temp_path = cache_dir.join(format!("{}.m4a.tmp", video_id));

    if audio_path.exists() {
        if let Ok(meta) = fs::metadata(&audio_path) {
            if meta.len() > 300_000 {
                let _ = save_song_metadata(&song);
                return Ok(());
            }
        }
    }

    // 1. Resolve direct audio stream URL
    let stream_url = crate::youtube::resolve_stream_url(&video_id).await?;

    // 2. Download audio bytes via reqwest with robust timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let resp = client
        .get(&stream_url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Download network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download stream HTTP error: {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed reading audio bytes: {}", e))?;

    if bytes.len() < 50_000 {
        return Err("Downloaded audio file too small".to_string());
    }

    // Write to .tmp first to guarantee atomic write
    if let Err(e) = fs::write(&temp_path, &bytes) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed writing cache file: {}", e));
    }

    // Rename temp file to actual file
    if let Err(e) = fs::rename(&temp_path, &audio_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed finalizing cache file: {}", e));
    }

    save_song_metadata(&song)?;
    println!("[Cache Saved] Downloaded: {} ({})", song.title, video_id);
    Ok(())
}

pub async fn auto_cache_song(song: Song) -> Result<(), String> {
    download_song_async(song).await
}

pub fn get_cached_songs() -> Result<Vec<CacheItem>, String> {
    let cache_dir = get_cache_dir();
    let mut items = Vec::new();

    let entries = fs::read_dir(&cache_dir).map_err(|e| format!("Failed to read cache dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let audio_path = cache_dir.join(format!("{}.m4a", file_stem));

            if audio_path.exists() {
                if let Ok(meta) = fs::metadata(&audio_path) {
                    if meta.len() > 300_000 {
                        if let Ok(content) = fs::read_to_string(&path) {
                            if let Ok(song) = serde_json::from_str::<Song>(&content) {
                                let cached_time = meta
                                    .modified()
                                    .map(|t| format!("{:?}", t))
                                    .unwrap_or_else(|_| "Recently".to_string());

                                items.push(CacheItem {
                                    id: song.id,
                                    title: song.title,
                                    artist: song.artist,
                                    album: song.album,
                                    duration: song.duration,
                                    thumb: song.thumb,
                                    file_size_bytes: meta.len(),
                                    cached_at: cached_time,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(items)
}

pub fn delete_cache_item(video_id: &str) -> Result<(), String> {
    let cache_dir = get_cache_dir();
    let audio_path = cache_dir.join(format!("{}.m4a", video_id));
    let temp_path = cache_dir.join(format!("{}.m4a.tmp", video_id));
    let meta_path = cache_dir.join(format!("{}.json", video_id));

    let _ = fs::remove_file(audio_path);
    let _ = fs::remove_file(temp_path);
    let _ = fs::remove_file(meta_path);
    Ok(())
}

pub fn clear_all_cache_files() -> Result<(), String> {
    let cache_dir = get_cache_dir();
    if let Ok(entries) = fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

pub fn get_cache_stats() -> Result<CacheStats, String> {
    let items = get_cached_songs()?;
    let total_songs = items.len();
    let total_bytes: u64 = items.iter().map(|i| i.file_size_bytes).sum();
    let total_size_mb = (total_bytes as f64) / (1024.0 * 1024.0);

    Ok(CacheStats {
        total_songs,
        total_size_mb,
    })
}
