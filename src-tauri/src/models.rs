use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: String,
    pub thumb: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamResult {
    pub url: String,
    pub is_cached: bool,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsResult {
    pub synced: Option<String>,
    pub plain: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheItem {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: String,
    pub thumb: String,
    pub file_size_bytes: u64,
    pub cached_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_songs: usize,
    pub total_size_mb: f64,
}
