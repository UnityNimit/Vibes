export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  thumb: string;
}

export interface StreamResult {
  url: string;
  is_cached: boolean;
  local_path?: string;
}

export interface LyricsResult {
  synced: string | null;
  plain: string | null;
}

export interface CacheItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  thumb: string;
  file_size_bytes: number;
  cached_at: string;
}

export interface CacheStats {
  total_songs: number;
  total_size_mb: number;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}
