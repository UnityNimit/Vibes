use crate::models::{CacheItem, CacheStats, Song};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

pub fn get_app_dir() -> PathBuf {
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
            if metadata.len() > 100_000 {
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

pub async fn auto_cache_song(song: Song, stream_url: String) {
    let video_id = song.id.clone();
    let cache_dir = get_cache_dir();
    let audio_path = cache_dir.join(format!("{}.m4a", video_id));
    let tmp_path = cache_dir.join(format!("{}.m4a.tmp", video_id));

    // If already fully cached, skip download
    if audio_path.exists() {
        if let Ok(meta) = fs::metadata(&audio_path) {
            if meta.len() > 100_000 {
                let _ = save_song_metadata(&song);
                return;
            }
        }
    }

    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let resp = match client.get(&stream_url).send().await {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[Cache Error] Failed to fetch stream for {}: {}", video_id, e);
                return;
            }
        };

        if !resp.status().is_success() {
            eprintln!("[Cache Error] Bad HTTP status {}: {}", resp.status(), video_id);
            return;
        }

        let mut file = match fs::File::create(&tmp_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[Cache Error] Failed to create temp cache file: {}", e);
                return;
            }
        };

        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[Cache Error] Stream read error {}: {}", video_id, e);
                let _ = fs::remove_file(&tmp_path);
                return;
            }
        };

        if let Err(e) = file.write_all(&bytes) {
            eprintln!("[Cache Error] Failed to write cache {}: {}", video_id, e);
            let _ = fs::remove_file(&tmp_path);
            return;
        }

        drop(file);

        if let Err(e) = fs::rename(&tmp_path, &audio_path) {
            eprintln!("[Cache Error] Failed to finalize cache {}: {}", video_id, e);
        } else {
            let _ = save_song_metadata(&song);
            println!("[Cache Saved] Successfully cached: {} ({})", song.title, video_id);
        }
    });
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
                    if meta.len() > 100_000 {
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
    let meta_path = cache_dir.join(format!("{}.json", video_id));

    let _ = fs::remove_file(audio_path);
    let _ = fs::remove_file(meta_path);
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
