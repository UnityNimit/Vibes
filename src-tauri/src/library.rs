use crate::cache::get_app_dir;
use crate::models::Song;
use std::fs;
use std::path::PathBuf;

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
