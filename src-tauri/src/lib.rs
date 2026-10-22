mod cache;
mod library;
mod lyrics;
mod models;
mod youtube;

use cache::{auto_cache_song, delete_cache_item, get_cached_file, get_cached_songs, get_cache_stats};
use library::{get_favorites, is_favorite, toggle_favorite};
use lyrics::fetch_lyrics;
use models::{CacheItem, CacheStats, LyricsResult, Song, StreamResult};
use youtube::{get_suggestions, resolve_stream_url, search_songs};

#[tauri::command]
async fn search_music(query: String) -> Result<Vec<Song>, String> {
    search_songs(&query).await
}

#[tauri::command]
async fn get_search_suggestions(query: String) -> Result<Vec<String>, String> {
    get_suggestions(&query).await
}

#[tauri::command]
async fn get_stream(song: Song) -> Result<StreamResult, String> {
    // 1. Check if already cached locally
    if let Some(cached_path) = get_cached_file(&song.id) {
        let path_str = cached_path.to_string_lossy().to_string();
        return Ok(StreamResult {
            url: format!("vibes-cache://{}", song.id),
            is_cached: true,
            local_path: Some(path_str),
        });
    }

    // 2. Resolve stream URL from YouTube
    let stream_url = resolve_stream_url(&song.id).await?;

    // 3. Trigger automatic background cache
    auto_cache_song(song, stream_url.clone()).await;

    Ok(StreamResult {
        url: stream_url,
        is_cached: false,
        local_path: None,
    })
}

#[tauri::command]
fn get_all_cached() -> Result<Vec<CacheItem>, String> {
    get_cached_songs()
}

#[tauri::command]
fn delete_cache(id: String) -> Result<(), String> {
    delete_cache_item(&id)
}

#[tauri::command]
fn get_stats() -> Result<CacheStats, String> {
    get_cache_stats()
}

#[tauri::command]
fn get_liked_songs() -> Result<Vec<Song>, String> {
    get_favorites()
}

#[tauri::command]
fn toggle_like(song: Song) -> Result<bool, String> {
    toggle_favorite(song)
}

#[tauri::command]
fn check_is_liked(id: String) -> Result<bool, String> {
    Ok(is_favorite(&id))
}

#[tauri::command]
async fn get_song_lyrics(title: String, artist: String, duration_secs: Option<u64>) -> Result<LyricsResult, String> {
    fetch_lyrics(&title, &artist, duration_secs).await
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
fn start_drag(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("vibes-audio", |_app, request| {
            let uri = request.uri().to_string();
            // uri: "vibes-audio://34Na4j8AVgA" or "vibes-audio://localhost/34Na4j8AVgA"
            let video_id = uri
                .trim_start_matches("vibes-audio://")
                .trim_start_matches("localhost/")
                .trim_matches('/');

            if let Some(path) = cache::get_cached_file(video_id) {
                if let Ok(bytes) = std::fs::read(&path) {
                    return tauri::http::Response::builder()
                        .header("Content-Type", "audio/mp4")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap();
                }
            }

            tauri::http::Response::builder()
                .status(404)
                .body(Vec::new())
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            search_music,
            get_search_suggestions,
            get_stream,
            get_all_cached,
            delete_cache,
            get_stats,
            get_liked_songs,
            toggle_like,
            check_is_liked,
            get_song_lyrics,
            minimize_window,
            toggle_maximize_window,
            close_window,
            start_drag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
