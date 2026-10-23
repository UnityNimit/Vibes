use crate::models::{SearchPage, Song};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{LazyLock, RwLock};
use std::time::{Duration, Instant};

static STREAM_CACHE: LazyLock<RwLock<HashMap<String, (String, Instant)>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

fn is_valid_duration(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() || s.len() > 9 {
        return false;
    }
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return false;
    }
    parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

fn extract_artist_from_value(v: &Value) -> String {
    let candidate_paths = [
        "/ownerText/runs",
        "/longBylineText/runs",
        "/shortBylineText/runs",
        "/bylineText/runs",
    ];

    for path in candidate_paths {
        if let Some(runs) = v.pointer(path).and_then(|r| r.as_array()) {
            for r in runs {
                if let Some(t) = r.get("text").and_then(|t| t.as_str()) {
                    let trimmed = t.trim();
                    let lower = trimmed.to_lowercase();
                    if trimmed.is_empty()
                        || trimmed == "•"
                        || trimmed == "·"
                        || trimmed == "|"
                        || trimmed == ","
                        || trimmed == "&"
                        || lower == "song"
                        || lower == "video"
                        || lower == "episode"
                        || lower == "podcast"
                        || lower == "artist"
                        || lower == "album"
                        || lower.ends_with("views")
                        || lower.ends_with("plays")
                        || is_valid_duration(trimmed)
                    {
                        continue;
                    }
                    return trimmed.to_string();
                }
            }
        }
    }

    let simple_paths = [
        "/ownerText/simpleText",
        "/longBylineText/simpleText",
        "/shortBylineText/simpleText",
        "/metadata/lockupMetadataViewModel/metadata/contentMetadataViewModel/metadataRows/0/metadataParts/0/text/content",
    ];
    for path in simple_paths {
        if let Some(t) = v.pointer(path).and_then(|t| t.as_str()) {
            let trimmed = t.trim();
            let lower = trimmed.to_lowercase();
            if !trimmed.is_empty() && lower != "song" && lower != "video" && lower != "episode" {
                return trimmed.to_string();
            }
        }
    }

    String::new()
}

fn clean_title_and_artist(raw_title: &str, raw_artist: &str) -> (String, String) {
    let mut title = raw_title.trim().to_string();
    let mut artist = raw_artist.trim().to_string();

    let invalid_artists = [
        "song", "video", "episode", "podcast", "artist", "album", "channel", "topic",
    ];
    if invalid_artists.contains(&artist.to_lowercase().as_str()) {
        artist = String::new();
    }

    let patterns = [
        "(Official Music Video)",
        "[Official Music Video]",
        "(Official Video)",
        "[Official Video]",
        "(Official Audio)",
        "[Official Audio]",
        "(Official Lyric Video)",
        "[Official Lyric Video]",
        "(Lyric Video)",
        "[Lyric Video]",
        "(Visualizer)",
        "[Visualizer]",
        "(Lyrics)",
        "[Lyrics]",
        "(Audio)",
        "[Audio]",
        "(Remastered)",
        "[Remastered]",
        "(HD)",
        "[HD]",
        "(4K)",
        "[4K]",
    ];

    for pat in patterns {
        if let Some(pos) = title.to_lowercase().rfind(&pat.to_lowercase()) {
            title.replace_range(pos..pos + pat.len(), "");
            title = title.trim().to_string();
        }
    }

    if let Some((p0, p1)) = title.split_once(" - ") {
        let p0_trimmed = p0.trim();
        let p1_trimmed = p1.trim();
        let lower_artist = artist.to_lowercase();
        let is_label = lower_artist.contains("records")
            || lower_artist.contains("music")
            || lower_artist.contains("t-series")
            || lower_artist.contains("vevo")
            || lower_artist.contains("official")
            || lower_artist.contains("label")
            || lower_artist.contains("company")
            || artist.is_empty();

        if (is_label
            || (!artist.is_empty()
                && (p0_trimmed.to_lowercase().contains(&lower_artist)
                    || lower_artist.contains(&p0_trimmed.to_lowercase()))))
            && !p0_trimmed.is_empty()
            && !p1_trimmed.is_empty()
        {
            artist = p0_trimmed.to_string();
            title = p1_trimmed.to_string();
        }
    }

    if artist.is_empty() {
        artist = "Unknown Artist".to_string();
    }
    if title.is_empty() {
        title = raw_title.trim().to_string();
    }

    (title, artist)
}

fn optimize_thumbnail_url(raw_url: &str) -> String {
    let raw = raw_url.trim();
    if raw.is_empty() {
        return String::new();
    }

    if raw.contains("googleusercontent.com") {
        if let Some(idx) = raw.find("=w") {
            return format!("{}=w800-h800-l90-rj", &raw[..idx]);
        } else if let Some(idx) = raw.find("=s") {
            return format!("{}=s800", &raw[..idx]);
        }
    }

    // Strip downsampling query parameters if present, keeping the real thumbnail URL
    if let Some(idx) = raw.find('?') {
        return raw[..idx].to_string();
    }

    raw.to_string()
}

fn parse_video_item(v: &Value) -> Option<Song> {
    let video_id = v
        .get("videoId")
        .or_else(|| v.pointer("/itemPlayback/inlinePlayerData/onSelect/innertubeCommand/watchEndpoint/videoId"))
        .or_else(|| v.pointer("/rendererContext/commandContext/onTap/innertubeCommand/watchEndpoint/videoId"))
        .and_then(|id| id.as_str())?
        .to_string();

    if video_id.is_empty() {
        return None;
    }

    let raw_title = v
        .pointer("/title/runs/0/text")
        .or_else(|| v.pointer("/title/simpleText"))
        .or_else(|| v.pointer("/metadata/lockupMetadataViewModel/title/content"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let raw_artist = extract_artist_from_value(v);
    let (title, artist) = clean_title_and_artist(&raw_title, &raw_artist);

    let duration = v
        .pointer("/lengthText/simpleText")
        .or_else(|| v.pointer("/lengthText/runs/0/text"))
        .and_then(|t| t.as_str())
        .unwrap_or("--:--")
        .trim()
        .to_string();

    let raw_thumb = v
        .pointer("/thumbnail/thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|arr| arr.last())
        .and_then(|th| th.get("url"))
        .or_else(|| {
            v.pointer("/contentImage/collectionThumbnailViewModel/primaryThumbnail/thumbnailViewModel/image/sources/0/url")
        })
        .or_else(|| {
            v.pointer("/contentImage/thumbnailViewModel/image/sources/0/url")
        })
        .and_then(|u| u.as_str())
        .unwrap_or("");
    let thumb = optimize_thumbnail_url(raw_thumb);

    Some(Song {
        id: video_id,
        title,
        artist: artist.clone(),
        album: artist,
        duration,
        thumb,
    })
}

fn extract_videos_from_value(val: &Value, songs: &mut Vec<Song>) {
    // 1. Direct videoRenderer or compactVideoRenderer
    if let Some(v) = val.get("videoRenderer").or_else(|| val.get("compactVideoRenderer")) {
        if let Some(song) = parse_video_item(v) {
            if !songs.iter().any(|s: &Song| s.id == song.id) {
                songs.push(song);
            }
        }
    }
    // 2. Modern lockupViewModel
    if let Some(v) = val.get("lockupViewModel") {
        if let Some(song) = parse_video_item(v) {
            if !songs.iter().any(|s: &Song| s.id == song.id) {
                songs.push(song);
            }
        }
    }
    // 3. Shelves & vertical list items
    if let Some(shelf_items) = val
        .pointer("/shelfRenderer/content/verticalListRenderer/items")
        .or_else(|| val.pointer("/shelfRenderer/content/expandedShelfContentsRenderer/items"))
        .and_then(|i| i.as_array())
    {
        for it in shelf_items {
            extract_videos_from_value(it, songs);
        }
    }
}

pub async fn search_songs(query: &str) -> Result<SearchPage, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ),
    );

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "query": query
    });

    let resp = client
        .post("https://www.youtube.com/youtubei/v1/search")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to query YouTube: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let mut songs = Vec::new();
    let mut continuation_token = None;

    if let Some(contents) = json_data
        .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents")
        .and_then(|c| c.as_array())
    {
        for section in contents {
            if let Some(items) = section.pointer("/itemSectionRenderer/contents").and_then(|i| i.as_array()) {
                for item in items {
                    extract_videos_from_value(item, &mut songs);
                }
            } else {
                extract_videos_from_value(section, &mut songs);
            }

            if continuation_token.is_none() {
                if let Some(token) = section
                    .pointer("/continuationItemRenderer/continuationEndpoint/continuationCommand/token")
                    .or_else(|| section.pointer("/itemSectionRenderer/continuations/0/nextContinuationData/continuation"))
                    .and_then(|t| t.as_str())
                {
                    continuation_token = Some(token.to_string());
                }
            }
        }
    }

    Ok(SearchPage {
        songs,
        continuation_token,
    })
}

pub async fn search_continuation(token: &str) -> Result<SearchPage, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ),
    );

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "continuation": token
    });

    let resp = client
        .post("https://www.youtube.com/youtubei/v1/search")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to query YouTube continuation: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse continuation response: {}", e))?;

    let mut songs = Vec::new();
    let mut next_token = None;

    if let Some(actions) = json_data.pointer("/onResponseReceivedCommands").and_then(|a| a.as_array()) {
        for action in actions {
            if let Some(items) = action
                .pointer("/appendContinuationItemsAction/continuationItems")
                .and_then(|c| c.as_array())
            {
                for item in items {
                    extract_videos_from_value(item, &mut songs);
                    if let Some(contents) = item.pointer("/itemSectionRenderer/contents").and_then(|c| c.as_array()) {
                        for it in contents {
                            extract_videos_from_value(it, &mut songs);
                        }
                    }
                    if next_token.is_none() {
                        if let Some(tok) = item
                            .pointer("/continuationItemRenderer/continuationEndpoint/continuationCommand/token")
                            .or_else(|| item.pointer("/itemSectionRenderer/continuations/0/nextContinuationData/continuation"))
                            .and_then(|t| t.as_str())
                        {
                            next_token = Some(tok.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(SearchPage {
        songs,
        continuation_token: next_token,
    })
}

pub async fn get_suggestions(query: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ),
    );

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "input": query
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/music/get_search_suggestions")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to get suggestions: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse suggestions: {}", e))?;

    let mut suggestions = Vec::new();
    extract_suggestions(&json_data, &mut suggestions);

    Ok(suggestions)
}

fn extract_suggestions(val: &Value, out: &mut Vec<String>) {
    if let Value::Object(map) = val {
        if let Some(item) = map.get("searchSuggestionRenderer") {
            if let Some(runs) = item.pointer("/suggestion/runs").and_then(|r| r.as_array()) {
                let text: String = runs
                    .iter()
                    .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                    .collect();
                if !text.is_empty() && !out.contains(&text) {
                    out.push(text);
                }
            }
        }
        for (_, v) in map {
            extract_suggestions(v, out);
        }
    } else if let Value::Array(arr) = val {
        for v in arr {
            extract_suggestions(v, out);
        }
    }
}

pub async fn resolve_stream_url(video_id: &str) -> Result<String, String> {
    // 1. Check ultra-fast in-memory stream cache
    if let Ok(cache) = STREAM_CACHE.read() {
        if let Some((cached_url, instant)) = cache.get(video_id) {
            if instant.elapsed() < Duration::from_secs(4 * 3600) {
                return Ok(cached_url.clone());
            }
        }
    }

    let video_id_owned = video_id.to_string();
    let url = format!("https://www.youtube.com/watch?v={}", video_id_owned);

    let stream_url = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("yt-dlp");
        cmd.env("PYTHONHTTPSVERIFY", "0");
        cmd.args(["--no-playlist", "--no-warnings", "-f", "ba[ext=m4a]/ba", "-g", &url]);

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute stream resolver: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Stream extractor error: {}", err));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stream_url = stdout
            .lines()
            .find(|line| line.starts_with("http"))
            .ok_or_else(|| "No valid audio stream URL returned".to_string())?
            .trim()
            .to_string();

        Ok(stream_url)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // 2. Store in in-memory cache for 0ms subsequent access
    if let Ok(mut cache) = STREAM_CACHE.write() {
        cache.insert(video_id.to_string(), (stream_url.clone(), Instant::now()));
    }

    Ok(stream_url)
}

fn parse_playlist_panel_video(r: &Value, skip_id: Option<&str>) -> Option<Song> {
    let id = r.get("videoId").and_then(|i| i.as_str())?;
    if let Some(skip) = skip_id {
        if id == skip {
            return None;
        }
    }

    let raw_title = r
        .pointer("/title/runs/0/text")
        .or_else(|| r.pointer("/title/simpleText"))
        .and_then(|t| t.as_str())
        .unwrap_or("");
    let raw_artist = extract_artist_from_value(r);
    let (title, artist) = clean_title_and_artist(raw_title, &raw_artist);

    let duration = r
        .pointer("/lengthText/runs/0/text")
        .or_else(|| r.pointer("/lengthText/simpleText"))
        .and_then(|t| t.as_str())
        .unwrap_or("--:--")
        .trim()
        .to_string();

    let raw_thumb = r
        .pointer("/thumbnail/thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|arr| arr.last())
        .and_then(|th| th.get("url"))
        .and_then(|u| u.as_str())
        .unwrap_or("");
    let thumb = optimize_thumbnail_url(raw_thumb);

    if !id.is_empty() && !title.is_empty() {
        Some(Song {
            id: id.to_string(),
            title,
            artist: artist.clone(),
            album: artist,
            duration,
            thumb,
        })
    } else {
        None
    }
}

pub async fn get_similar_songs(video_id: &str) -> Result<SearchPage, String> {
    let seed_id = if video_id.trim().is_empty() {
        // High-engagement global track to kickstart addictive recommendations
        "kJQP7kiw5Fk"
    } else {
        video_id.trim()
    };

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ),
    );

    let playlist_id = format!("RDAMVM{}", seed_id);
    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "videoId": seed_id,
        "playlistId": playlist_id
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/next")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch recommendations: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse recommendations JSON: {}", e))?;

    let mut songs = Vec::new();

    if let Some(queue) = json_data
        .pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs/0/tabRenderer/content/musicQueueRenderer/content/playlistPanelRenderer/contents")
        .and_then(|c| c.as_array())
    {
        for item in queue {
            if let Some(r) = item.get("playlistPanelVideoRenderer") {
                let filter = if video_id.trim().is_empty() { None } else { Some(seed_id) };
                if let Some(song) = parse_playlist_panel_video(r, filter) {
                    if !songs.iter().any(|s: &Song| s.id == song.id) {
                        songs.push(song);
                    }
                }
            }
        }
    }

    let mut continuation_token = json_data
        .pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs/0/tabRenderer/content/musicQueueRenderer/content/playlistPanelRenderer/continuations/0/nextRadioContinuationData/continuation")
        .or_else(|| json_data.pointer("/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs/0/tabRenderer/content/musicQueueRenderer/content/playlistPanelRenderer/continuations/0/nextContinuationData/continuation"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    if songs.is_empty() {
        if let Ok(page) = search_songs("Top Hits Global").await {
            songs = page.songs;
            continuation_token = page.continuation_token;
        }
    }

    Ok(SearchPage {
        songs,
        continuation_token,
    })
}

pub async fn get_more_similar_songs(token: &str) -> Result<SearchPage, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        ),
    );

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": "US"
            }
        },
        "continuation": token
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/next")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch continuation recommendations: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse continuation JSON: {}", e))?;

    let mut songs = Vec::new();

    if let Some(contents) = json_data
        .pointer("/continuationContents/playlistPanelContinuation/contents")
        .and_then(|c| c.as_array())
    {
        for item in contents {
            if let Some(r) = item.get("playlistPanelVideoRenderer") {
                if let Some(song) = parse_playlist_panel_video(r, None) {
                    if !songs.iter().any(|s: &Song| s.id == song.id) {
                        songs.push(song);
                    }
                }
            }
        }
    }

    let next_token = json_data
        .pointer("/continuationContents/playlistPanelContinuation/continuations/0/nextRadioContinuationData/continuation")
        .or_else(|| json_data.pointer("/continuationContents/playlistPanelContinuation/continuations/0/nextContinuationData/continuation"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    Ok(SearchPage {
        songs,
        continuation_token: next_token,
    })
}
