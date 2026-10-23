mod cache;
mod library;
mod lyrics;
mod models;
mod youtube;

use cache::{
    auto_cache_song, clear_all_cache_files, delete_cache_item, download_song_async, get_cache_dir,
    get_cached_file, get_cached_songs, get_cache_stats,
};
use library::{
    create_playlist as lib_create_playlist, delete_playlist as lib_delete_playlist, get_favorites,
    get_playlists as lib_get_playlists, is_favorite,
    remove_from_playlist as lib_remove_from_playlist, rename_playlist as lib_rename_playlist,
    toggle_favorite, toggle_in_playlist as lib_toggle_in_playlist,
};
use lyrics::fetch_lyrics;
use models::{CacheItem, CacheStats, LyricsResult, Playlist, SearchPage, Song, StreamResult};
use youtube::{
    get_more_similar_songs as fetch_more_similar_songs,
    get_similar_songs as fetch_similar_songs,
    get_suggestions, resolve_stream_url, search_continuation, search_songs,
};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
async fn search_music(query: String) -> Result<SearchPage, String> {
    search_songs(&query).await
}

#[tauri::command]
async fn search_more(continuation_token: String) -> Result<SearchPage, String> {
    search_continuation(&continuation_token).await
}

#[tauri::command]
async fn get_similar_songs(video_id: String) -> Result<SearchPage, String> {
    fetch_similar_songs(&video_id).await
}

#[tauri::command]
async fn get_more_similar_songs(continuation_token: String) -> Result<SearchPage, String> {
    fetch_more_similar_songs(&continuation_token).await
}

#[tauri::command]
async fn get_search_suggestions(query: String) -> Result<Vec<String>, String> {
    get_suggestions(&query).await
}

#[tauri::command]
async fn get_stream(song: Song, auto_save: Option<bool>) -> Result<StreamResult, String> {
    // 1. Check if already cached locally
    if let Some(cached_path) = get_cached_file(&song.id) {
        let path_str = cached_path.to_string_lossy().to_string();
        return Ok(StreamResult {
            url: path_str.clone(),
            is_cached: true,
            local_path: Some(path_str),
        });
    }

    // 2. Resolve stream URL from YouTube for instant playback (checks in-memory cache first)
    let stream_url = resolve_stream_url(&song.id).await?;

    // 3. Trigger automatic background cache if explicitly requested
    if auto_save.unwrap_or(false) {
        let song_clone = song.clone();
        tokio::spawn(async move {
            auto_cache_song(song_clone).await;
        });
    }

    Ok(StreamResult {
        url: stream_url,
        is_cached: false,
        local_path: None,
    })
}

#[tauri::command]
async fn prefetch_stream(song: Song) -> Result<StreamResult, String> {
    get_stream(song, Some(false)).await
}

#[tauri::command]
async fn trigger_auto_cache(song: Song) -> Result<(), String> {
    let song_clone = song.clone();
    tokio::spawn(async move {
        auto_cache_song(song_clone).await;
    });
    Ok(())
}

#[tauri::command]
async fn download_song(song: Song) -> Result<bool, String> {
    download_song_async(song).await?;
    Ok(true)
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
fn clear_cache() -> Result<(), String> {
    clear_all_cache_files()
}

#[tauri::command]
fn open_cache_dir() -> Result<(), String> {
    let dir = get_cache_dir();
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let mut cmd = Command::new("explorer");
        cmd.arg(&dir);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = cmd.spawn().map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    Ok(())
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
fn get_playlists() -> Result<Vec<Playlist>, String> {
    lib_get_playlists()
}

#[tauri::command]
fn create_playlist(name: String) -> Result<Playlist, String> {
    lib_create_playlist(name)
}

#[tauri::command]
fn delete_playlist(id: String) -> Result<(), String> {
    lib_delete_playlist(&id)
}

#[tauri::command]
fn rename_playlist(id: String, name: String) -> Result<(), String> {
    lib_rename_playlist(&id, name)
}

#[tauri::command]
fn toggle_in_playlist(playlist_id: String, song: Song) -> Result<bool, String> {
    lib_toggle_in_playlist(&playlist_id, song)
}

#[tauri::command]
fn remove_from_playlist(playlist_id: String, song_id: String) -> Result<(), String> {
    lib_remove_from_playlist(&playlist_id, &song_id)
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
fn toggle_maximize_window(window: tauri::Window) -> bool {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
            false
        } else {
            let _ = window.maximize();
            true
        }
    } else {
        false
    }
}

#[tauri::command]
fn is_window_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
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
        .setup(|app| {
            if let Some(icon) = app.default_window_icon() {
                for (_label, window) in app.webview_windows() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_music,
            search_more,
            get_similar_songs,
            get_more_similar_songs,
            get_search_suggestions,
            get_stream,
            prefetch_stream,
            trigger_auto_cache,
            download_song,
            get_all_cached,
            delete_cache,
            clear_cache,
            open_cache_dir,
            get_stats,
            get_liked_songs,
            toggle_like,
            check_is_liked,
            get_playlists,
            create_playlist,
            delete_playlist,
            rename_playlist,
            toggle_in_playlist,
            remove_from_playlist,
            get_song_lyrics,
            minimize_window,
            toggle_maximize_window,
            is_window_maximized,
            close_window,
            start_drag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
