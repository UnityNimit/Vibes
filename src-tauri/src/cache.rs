use crate::models::{CacheItem, CacheStats, Song};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

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
            // Valid complete audio tracks are >= 50KB
            if metadata.len() >= 50_000 {
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

    // 1. If already completely downloaded, ensure metadata exists and return
    if audio_path.exists() {
        if let Ok(meta) = fs::metadata(&audio_path) {
            if meta.len() >= 50_000 {
                let _ = save_song_metadata(&song);
                return Ok(());
            }
        }
    }

    // Clean up any stale temp file from an interrupted prior download
    let _ = fs::remove_file(&temp_path);

    // 2. Resolve direct audio stream URL
    let mut stream_url = crate::youtube::resolve_stream_url(&video_id).await?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

    // 3. Probe with Range 0-0 to obtain total file size & verify stream validity
    let mut probe_resp = client
        .get(&stream_url)
        .header("Range", "bytes=0-0")
        .header("Origin", "https://www.youtube.com")
        .header("Referer", "https://www.youtube.com/")
        .header("User-Agent", user_agent)
        .send()
        .await;

    // If stream URL is expired or forbidden (403), re-resolve a fresh URL directly
    if let Ok(ref r) = probe_resp {
        if r.status() == reqwest::StatusCode::FORBIDDEN || !r.status().is_success() {
            if let Ok(fresh_url) = crate::youtube::resolve_stream_url_innertube(&video_id).await {
                stream_url = fresh_url;
                probe_resp = client
                    .get(&stream_url)
                    .header("Range", "bytes=0-0")
                    .header("Origin", "https://www.youtube.com")
                    .header("Referer", "https://www.youtube.com/")
                    .header("User-Agent", user_agent)
                    .send()
                    .await;
            }
        }
    }

    let probe_resp = probe_resp.map_err(|e| format!("Download network probe error: {}", e))?;
    if !probe_resp.status().is_success() && probe_resp.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(format!("Download probe HTTP error: {}", probe_resp.status()));
    }

    // Extract total size from Content-Range header e.g. "bytes 0-0/4557665"
    let total_size: usize = probe_resp
        .headers()
        .get("content-range")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.split('/').last())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&temp_path)
        .map_err(|e| format!("Failed to create temporary cache file: {}", e))?;

    if total_size >= 50_000 {
        // High-speed chunked range download (512 KB chunks bypass YouTube real-time throttling)
        let chunk_size: usize = 512 * 1024;
        let mut offset: usize = 0;

        while offset < total_size {
            let end = (offset + chunk_size - 1).min(total_size - 1);
            let range_hdr = format!("bytes={}-{}", offset, end);

            let mut chunk_bytes: Option<Vec<u8>> = None;
            for retry in 0..3 {
                let c_resp = client
                    .get(&stream_url)
                    .header("Range", &range_hdr)
                    .header("Origin", "https://www.youtube.com")
                    .header("Referer", "https://www.youtube.com/")
                    .header("User-Agent", user_agent)
                    .send()
                    .await;

                match c_resp {
                    Ok(r) if r.status().is_success() || r.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                        if let Ok(b) = r.bytes().await {
                            if !b.is_empty() {
                                chunk_bytes = Some(b.to_vec());
                                break;
                            }
                        }
                    }
                    _ => {
                        if retry < 2 {
                            tokio::time::sleep(Duration::from_millis(200 * (retry + 1))).await;
                        }
                    }
                }
            }

            let b = chunk_bytes.ok_or_else(|| {
                let _ = fs::remove_file(&temp_path);
                format!("Failed downloading audio chunk {} after retries", range_hdr)
            })?;

            offset += b.len();
            file.write_all(&b).map_err(|e| {
                let _ = fs::remove_file(&temp_path);
                format!("Failed writing chunk to disk: {}", e)
            })?;
        }
    } else {
        // Fallback for non-ranged streams: stream directly into file
        let full_resp = client
            .get(&stream_url)
            .header("Origin", "https://www.youtube.com")
            .header("Referer", "https://www.youtube.com/")
            .header("User-Agent", user_agent)
            .send()
            .await
            .map_err(|e| format!("Download stream error: {}", e))?;

        if !full_resp.status().is_success() {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Download stream HTTP error: {}", full_resp.status()));
        }

        let full_bytes = full_resp.bytes().await.map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            format!("Failed reading audio bytes: {}", e)
        })?;

        file.write_all(&full_bytes).map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            format!("Failed writing cache file: {}", e)
        })?;
    }

    file.flush().map_err(|e| format!("Failed flushing cache file: {}", e))?;
    drop(file);

    // Verify written file size
    let final_len = fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);
    if final_len < 50_000 {
        let _ = fs::remove_file(&temp_path);
        return Err("Downloaded audio file too small".to_string());
    }

    // Atomically finalize: remove existing audio_path first to guarantee rename succeeds on Windows & Android
    let _ = fs::remove_file(&audio_path);
    fs::rename(&temp_path, &audio_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        format!("Failed finalizing cache file: {}", e)
    })?;

    save_song_metadata(&song)?;
    println!("[Cache Saved] Downloaded: {} ({}) [{} KB]", song.title, video_id, final_len / 1024);
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
                    if meta.len() >= 50_000 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_full_download_pipeline() {
        let song = Song {
            id: "kJQP7kiw5Fk".to_string(),
            title: "Despacito".to_string(),
            artist: "Luis Fonsi".to_string(),
            album: "Vida".to_string(),
            duration: "3:48".to_string(),
            thumb: "".to_string(),
        };

        // Test download
        let res = download_song_async(song.clone()).await;
        assert!(res.is_ok(), "Download failed: {:?}", res.err());

        // Verify cached file exists and is readable
        let cached = get_cached_file(&song.id);
        assert!(cached.is_some(), "Cached file not found");

        // Verify it appears in get_cached_songs()
        let songs = get_cached_songs().unwrap();
        assert!(songs.iter().any(|s| s.id == song.id), "Song not in cached list");

        // Clean up test cache
        let _ = delete_cache_item(&song.id);
    }
}


