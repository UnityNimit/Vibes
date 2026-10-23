use crate::cache::get_app_dir;
use crate::models::{Playlist, Song};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn get_fav_file() -> PathBuf {
    get_app_dir().join("favorites.json")
}

pub fn get_favorites() -> Result<Vec<Song>, String> {
    let file = get_fav_file();
    if !file.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read favorites: {}", e))?;
    let songs: Vec<Song> = serde_json::from_str(&content).unwrap_or_default();
    Ok(songs)
}

pub fn toggle_favorite(song: Song) -> Result<bool, String> {
    let mut songs = get_favorites().unwrap_or_default();
    let id = song.id.clone();
    let exists = songs.iter().position(|s| s.id == id);

    let is_fav = if let Some(index) = exists {
        songs.remove(index);
        false
    } else {
        songs.insert(0, song);
        true
    };

    let file = get_fav_file();
    let json_str = serde_json::to_string_pretty(&songs)
        .map_err(|e| format!("Failed to serialize favorites: {}", e))?;
    fs::write(file, json_str).map_err(|e| format!("Failed to save favorites: {}", e))?;

    Ok(is_fav)
}

pub fn is_favorite(id: &str) -> bool {
    let songs = get_favorites().unwrap_or_default();
    songs.iter().any(|s| s.id == id)
}

fn get_playlists_file() -> PathBuf {
    get_app_dir().join("playlists.json")
}

pub fn get_playlists() -> Result<Vec<Playlist>, String> {
    let file = get_playlists_file();
    if !file.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&file).map_err(|e| format!("Failed to read playlists: {}", e))?;
    let playlists: Vec<Playlist> = serde_json::from_str(&content).unwrap_or_default();
    Ok(playlists)
}

fn save_playlists(playlists: &[Playlist]) -> Result<(), String> {
    let file = get_playlists_file();
    let json_str = serde_json::to_string_pretty(playlists)
        .map_err(|e| format!("Failed to serialize playlists: {}", e))?;
    fs::write(file, json_str).map_err(|e| format!("Failed to write playlists: {}", e))?;
    Ok(())
}

pub fn create_playlist(name: String) -> Result<Playlist, String> {
    let mut playlists = get_playlists().unwrap_or_default();
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("Playlist name cannot be empty".to_string());
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let id = format!("pl_{}_{}", now, playlists.len() + 1);

    let playlist = Playlist {
        id,
        name: clean_name.to_string(),
        created_at: now,
        songs: Vec::new(),
    };
    playlists.push(playlist.clone());
    save_playlists(&playlists)?;
    Ok(playlist)
}

pub fn delete_playlist(id: &str) -> Result<(), String> {
    let mut playlists = get_playlists().unwrap_or_default();
    playlists.retain(|p| p.id != id);
    save_playlists(&playlists)?;
    Ok(())
}

pub fn rename_playlist(id: &str, new_name: String) -> Result<(), String> {
    let mut playlists = get_playlists().unwrap_or_default();
    let clean_name = new_name.trim();
    if clean_name.is_empty() {
        return Err("Playlist name cannot be empty".to_string());
    }
    if let Some(p) = playlists.iter_mut().find(|p| p.id == id) {
        p.name = clean_name.to_string();
        save_playlists(&playlists)?;
        Ok(())
    } else {
        Err("Playlist not found".to_string())
    }
}

pub fn toggle_in_playlist(playlist_id: &str, song: Song) -> Result<bool, String> {
    let mut playlists = get_playlists().unwrap_or_default();
    if let Some(p) = playlists.iter_mut().find(|p| p.id == playlist_id) {
        let exists_idx = p.songs.iter().position(|s| s.id == song.id);
        let added = if let Some(idx) = exists_idx {
            p.songs.remove(idx);
            false
        } else {
            p.songs.push(song);
            true
        };
        save_playlists(&playlists)?;
        Ok(added)
    } else {
        Err("Playlist not found".to_string())
    }
}

pub fn remove_from_playlist(playlist_id: &str, song_id: &str) -> Result<(), String> {
    let mut playlists = get_playlists().unwrap_or_default();
    if let Some(p) = playlists.iter_mut().find(|p| p.id == playlist_id) {
        p.songs.retain(|s| s.id != song_id);
        save_playlists(&playlists)?;
        Ok(())
    } else {
        Err("Playlist not found".to_string())
    }
}
