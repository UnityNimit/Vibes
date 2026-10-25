use crate::models::{SearchPage, Song};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{LazyLock, RwLock};
use std::time::{Duration, Instant};

static STREAM_CACHE: LazyLock<RwLock<HashMap<String, (String, Instant)>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

struct VisitorSession {
    visitor_id: String,
    cookies: String,
    timestamp: Instant,
}

static VISITOR_SESSION: LazyLock<RwLock<Option<VisitorSession>>> =
    LazyLock::new(|| RwLock::new(None));

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
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

async fn get_or_refresh_visitor_session(client: &reqwest::Client, force_refresh: bool) -> Result<(String, String), String> {
    if !force_refresh {
        if let Ok(guard) = VISITOR_SESSION.read() {
            if let Some(session) = guard.as_ref() {
                if session.timestamp.elapsed() < Duration::from_secs(3 * 3600) {
                    return Ok((session.visitor_id.clone(), session.cookies.clone()));
                }
            }
        }
    }

    let resp = client
        .get("https://www.youtube.com/")
        .header(
            USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to YouTube: {}", e))?;

    let mut cookie_parts = Vec::new();
    for val in resp.headers().get_all(reqwest::header::SET_COOKIE) {
        if let Ok(s) = val.to_str() {
            if let Some(part) = s.split(';').next() {
                let trimmed = part.trim();
                if trimmed.contains('=') {
                    cookie_parts.push(trimmed.to_string());
                }
            }
        }
    }
    let cookies_str = cookie_parts.join("; ");

    let html = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read YouTube response: {}", e))?;

    let visitor_id = if let Some(pos) = html.find("\"VISITOR_DATA\":") {
        let rest = &html[pos + 15..];
        let rest_trimmed = rest.trim_start();
        if rest_trimmed.starts_with('"') {
            let after_quote = &rest_trimmed[1..];
            if let Some(end_quote) = after_quote.find('"') {
                after_quote[..end_quote].to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    if visitor_id.is_empty() {
        return Err("Could not extract visitor token from YouTube".to_string());
    }

    let session = VisitorSession {
        visitor_id: visitor_id.clone(),
        cookies: cookies_str.clone(),
        timestamp: Instant::now(),
    };

    if let Ok(mut guard) = VISITOR_SESSION.write() {
        *guard = Some(session);
    }

    Ok((visitor_id, cookies_str))
}

async fn resolve_stream_url_innertube(video_id: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    for attempt in 0..2 {
        let force_refresh = attempt > 0;
        let (visitor_id, cookies_str) = match get_or_refresh_visitor_session(&client, force_refresh).await {
            Ok(v) => v,
            Err(e) => {
                if attempt == 0 {
                    continue;
                }
                return Err(e);
            }
        };

        let payload = json!({
            "context": {
                "client": {
                    "clientName": "VISIONOS",
                    "clientVersion": "1.02",
                    "deviceMake": "Apple",
                    "deviceModel": "RealityDevice17,1",
                    "osName": "visionOS",
                    "osVersion": "26.5.23O471",
                    "hl": "en",
                    "timeZone": "UTC",
                    "utcOffsetMinutes": 0
                }
            },
            "videoId": video_id,
            "playbackContext": {
                "contentPlaybackContext": {
                    "html5Preference": "HTML5_PREF_WANTS"
                }
            },
            "contentCheckOk": true,
            "racyCheckOk": true
        });

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("X-Youtube-Client-Name", HeaderValue::from_static("101"));
        headers.insert("X-Youtube-Client-Version", HeaderValue::from_static("1.02"));
        headers.insert("Origin", HeaderValue::from_static("https://www.youtube.com"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
            ),
        );
        if let Ok(v_header) = HeaderValue::from_str(&visitor_id) {
            headers.insert("X-Goog-Visitor-Id", v_header);
        }
        if !cookies_str.is_empty() {
            if let Ok(c_header) = HeaderValue::from_str(&cookies_str) {
                headers.insert("Cookie", c_header);
            }
        }

        let resp = match client
            .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .headers(headers)
            .json(&payload)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                if attempt == 0 {
                    continue;
                }
                return Err(format!("Player request failed: {}", e));
            }
        };

        let data: Value = match resp.json().await {
            Ok(d) => d,
            Err(e) => {
                if attempt == 0 {
                    continue;
                }
                return Err(format!("Failed to parse player JSON: {}", e));
            }
        };

        let status = data
            .pointer("/playabilityStatus/status")
            .and_then(|s| s.as_str())
            .unwrap_or("");

        if status != "OK" {
            if attempt == 0 {
                continue;
            }
            let reason = data
                .pointer("/playabilityStatus/reason")
                .and_then(|r| r.as_str())
                .unwrap_or(status);
            return Err(format!("Video not playable: {}", reason));
        }

        let adaptive_formats = data
            .pointer("/streamingData/adaptiveFormats")
            .and_then(|f| f.as_array());

        if let Some(formats) = adaptive_formats {
            let mut audio_streams: Vec<(&Value, i64)> = formats
                .iter()
                .filter(|f| {
                    let mime = f.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
                    let has_url = f.get("url").and_then(|u| u.as_str()).is_some();
                    mime.starts_with("audio/") && has_url
                })
                .map(|f| {
                    let bitrate = f.get("bitrate").and_then(|b| b.as_i64()).unwrap_or(0);
                    let mime = f.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
                    let bonus = if mime.contains("mp4a") || mime.contains("audio/mp4") {
                        50_000
                    } else {
                        0
                    };
                    (f, bitrate + bonus)
                })
                .collect();

            audio_streams.sort_by(|a, b| b.1.cmp(&a.1));

            if let Some((best, _)) = audio_streams.first() {
                if let Some(url) = best.get("url").and_then(|u| u.as_str()) {
                    return Ok(url.to_string());
                }
            }
        }
    }

    Err("No direct audio streams returned".to_string())
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

    // 2. Try native ultra-fast InnerTube stream extractor first (works everywhere, zero external dependencies)
    match resolve_stream_url_innertube(video_id).await {
        Ok(stream_url) => {
            if let Ok(mut cache) = STREAM_CACHE.write() {
                cache.insert(video_id.to_string(), (stream_url.clone(), Instant::now()));
            }
            return Ok(stream_url);
        }
        Err(err) => {
            eprintln!("[Native Stream Warning] {}. Falling back...", err);
        }
    }

    // 3. Desktop fallback: yt-dlp on Windows if available
    #[cfg(target_os = "windows")]
    {
        let video_id_owned = video_id.to_string();
        let url = format!("https://www.youtube.com/watch?v={}", video_id_owned);

        let stream_url = tokio::task::spawn_blocking(move || {
            let mut cmd = Command::new("yt-dlp");
            cmd.env("PYTHONHTTPSVERIFY", "0");
            cmd.args(["--no-playlist", "--no-warnings", "-f", "ba[ext=m4a]/ba", "-g", &url]);
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

        if let Ok(mut cache) = STREAM_CACHE.write() {
            cache.insert(video_id.to_string(), (stream_url.clone(), Instant::now()));
        }

        return Ok(stream_url);
    }

    #[cfg(not(target_os = "windows"))]
    Err("Failed to resolve audio stream URL".to_string())
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

fn parse_music_responsive_list_item(r: &Value) -> Option<Song> {
    let id = r
        .pointer("/playlistItemData/videoId")
        .or_else(|| {
            r.pointer(
                "/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/watchEndpoint/videoId",
            )
        })
        .or_else(|| r.pointer("/navigationEndpoint/watchEndpoint/videoId"))
        .or_else(|| {
            r.pointer(
                "/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId",
            )
        })
        .and_then(|v| v.as_str())?;

    if id.is_empty() {
        return None;
    }

    let raw_title = r
        .pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
        .or_else(|| r.pointer("/title/runs/0/text"))
        .or_else(|| r.pointer("/title/simpleText"))
        .and_then(|t| t.as_str())
        .unwrap_or("");

    let raw_artist = r
        .pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
        .or_else(|| r.pointer("/subtitle/runs/0/text"))
        .and_then(|t| t.as_str())
        .unwrap_or("");

    let (title, artist) = clean_title_and_artist(raw_title, raw_artist);

    let duration = r
        .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
        .or_else(|| {
            r.pointer(
                "/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/2/text",
            )
        })
        .or_else(|| {
            r.pointer(
                "/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/4/text",
            )
        })
        .or_else(|| r.pointer("/lengthText/runs/0/text"))
        .and_then(|d| d.as_str())
        .unwrap_or("--:--")
        .trim()
        .to_string();

    let raw_thumb = r
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| r.pointer("/thumbnail/thumbnails"))
        .and_then(|t| t.as_array())
        .and_then(|arr| arr.last())
        .and_then(|th| th.get("url"))
        .and_then(|u| u.as_str())
        .unwrap_or("");
    let thumb = optimize_thumbnail_url(raw_thumb);

    if !title.is_empty() {
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

pub async fn get_charts_feed(country_code: Option<&str>) -> Result<Vec<Song>, String> {
    let gl = match country_code {
        Some(c)
            if !c.trim().is_empty()
                && c.to_uppercase() != "GLOBAL"
                && c.to_uppercase() != "AUTO" =>
        {
            c.trim().to_uppercase()
        }
        _ => "US".to_string(),
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

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": gl
            }
        },
        "browseId": "FEmusic_charts"
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/browse")
        .headers(headers.clone())
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Charts request failed: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Charts JSON parse failed: {}", e))?;

    let mut songs = Vec::new();
    let mut playlist_id: Option<String> = None;

    if let Some(contents) = json_data
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .and_then(|c| c.as_array())
    {
        for section in contents {
            if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
                if let Some(items) = carousel.get("contents").and_then(|i| i.as_array()) {
                    for it in items {
                        if playlist_id.is_none() {
                            if let Some(browse_id) = it
                                .pointer("/musicTwoRowItemRenderer/navigationEndpoint/browseEndpoint/browseId")
                                .and_then(|b| b.as_str())
                            {
                                playlist_id = Some(browse_id.to_string());
                                break;
                            }
                        }
                    }
                }
            }
            if playlist_id.is_some() {
                break;
            }
        }
    }

    let target_playlist = playlist_id.unwrap_or_else(|| "VLPL4fGSI1pDJn6O1LS0XSdF3RyO0Rq_LDeI".to_string());

    let playlist_payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": gl
            }
        },
        "browseId": target_playlist
    });

    if let Ok(pl_resp) = client
        .post("https://music.youtube.com/youtubei/v1/browse")
        .headers(headers)
        .json(&playlist_payload)
        .send()
        .await
    {
        if let Ok(pl_json) = pl_resp.json::<Value>().await {
            if let Some(items) = pl_json
                .pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents")
                .or_else(|| pl_json.pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents"))
                .and_then(|c| c.as_array())
            {
                for it in items {
                    if let Some(r) = it.get("musicResponsiveListItemRenderer") {
                        if let Some(song) = parse_music_responsive_list_item(r) {
                            if !songs.iter().any(|s: &Song| s.id == song.id) {
                                songs.push(song);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(songs)
}

pub async fn get_explore_trending(country_code: Option<&str>) -> Result<Vec<Song>, String> {
    let gl = match country_code {
        Some(c)
            if !c.trim().is_empty()
                && c.to_uppercase() != "GLOBAL"
                && c.to_uppercase() != "AUTO" =>
        {
            c.trim().to_uppercase()
        }
        _ => "US".to_string(),
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

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": gl
            }
        },
        "browseId": "FEmusic_explore"
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/browse")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Explore request failed: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Explore JSON parse failed: {}", e))?;

    let mut songs = Vec::new();

    if let Some(sections) = json_data
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .and_then(|c| c.as_array())
    {
        for s in sections {
            if let Some(carousel) = s.get("musicCarouselShelfRenderer") {
                let title = carousel
                    .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("");

                if title.to_lowercase().contains("trending") {
                    if let Some(items) = carousel.get("contents").and_then(|i| i.as_array()) {
                        for it in items {
                            if let Some(r) = it.get("musicResponsiveListItemRenderer") {
                                if let Some(song) = parse_music_responsive_list_item(r) {
                                    if !songs.iter().any(|s: &Song| s.id == song.id) {
                                        songs.push(song);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(songs)
}

pub async fn get_trending_feed(country_code: Option<&str>, mood: Option<&str>) -> Result<SearchPage, String> {
    let mut songs = Vec::new();
    let mood_str = mood.unwrap_or("all").trim().to_lowercase();

    if mood_str == "charts" {
        if let Ok(chart_songs) = get_charts_feed(country_code).await {
            songs.extend(chart_songs);
        }
    } else if mood_str == "viral" || mood_str == "all" {
        if let Ok(explore_songs) = get_explore_trending(country_code).await {
            for s in explore_songs {
                if !songs.iter().any(|ex: &Song| ex.id == s.id) {
                    songs.push(s);
                }
            }
        }
        if let Ok(chart_songs) = get_charts_feed(country_code).await {
            for s in chart_songs {
                if !songs.iter().any(|ex: &Song| ex.id == s.id) {
                    songs.push(s);
                }
            }
        }
    } else {
        let query = match mood_str.as_str() {
            "late_night" => "Late Night Vibes Dark Pop Lo-Fi Melodies 2026",
            "chill" => "Chill Acoustic Relaxing Peaceful Vibes 2026",
            "energy" => "High Energy Workout Gym Motivation Bass Phonk 2026",
            "party" => "Party Hits Viral Club Dance Anthems 2026",
            "early_morning" => "Morning Acoustic Warm Sunshine Uplifting Chill 2026",
            "morning" => "Deep Focus Modern Energy Pop Hits 2026",
            "afternoon" => "Trending Midday Hits Global Pop 2026",
            "evening" => "Sunset Golden Hour Indie R&B Chill 2026",
            _ => "Trending Music Hits 2026",
        };

        if let Ok(search_res) = search_songs(query).await {
            songs.extend(search_res.songs);
        }
    }

    if songs.len() < 10 {
        let fallback_query = format!("Top Trending Hits {} 2026", country_code.unwrap_or("Global"));
        if let Ok(page) = search_songs(&fallback_query).await {
            for s in page.songs {
                if !songs.iter().any(|ex: &Song| ex.id == s.id) {
                    songs.push(s);
                }
            }
        }
    }

    Ok(SearchPage {
        songs,
        continuation_token: None,
    })
}

fn parse_music_two_row_item(r: &Value) -> Option<Song> {
    let id = r
        .pointer("/navigationEndpoint/watchEndpoint/videoId")
        .or_else(|| r.pointer("/title/runs/0/navigationEndpoint/watchEndpoint/videoId"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            r.pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails/0/url")
                .and_then(|u| u.as_str())
                .and_then(|u| {
                    if let Some(pos) = u.find("/vi/") {
                        let sub = &u[pos + 4..];
                        if let Some(slash) = sub.find('/') {
                            return Some(&sub[..slash]);
                        }
                    }
                    None
                })
        })?;

    if id.is_empty() {
        return None;
    }

    let raw_title = r
        .pointer("/title/runs/0/text")
        .or_else(|| r.pointer("/title/simpleText"))
        .and_then(|t| t.as_str())
        .unwrap_or("");

    let raw_artist = r
        .pointer("/subtitle/runs/0/text")
        .or_else(|| r.pointer("/subtitle/simpleText"))
        .and_then(|t| t.as_str())
        .unwrap_or("");

    let (title, artist) = clean_title_and_artist(raw_title, raw_artist);

    let raw_thumb = r
        .pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| r.pointer("/thumbnail/thumbnails"))
        .and_then(|t| t.as_array())
        .and_then(|arr| arr.last())
        .and_then(|th| th.get("url"))
        .and_then(|u| u.as_str())
        .unwrap_or("");
    let thumb = optimize_thumbnail_url(raw_thumb);

    if !title.is_empty() {
        Some(Song {
            id: id.to_string(),
            title,
            artist: artist.clone(),
            album: artist,
            duration: "--:--".to_string(),
            thumb,
        })
    } else {
        None
    }
}

pub async fn get_new_releases(country_code: Option<&str>) -> Result<Vec<Song>, String> {
    let gl = match country_code {
        Some(c)
            if !c.trim().is_empty()
                && c.to_uppercase() != "GLOBAL"
                && c.to_uppercase() != "AUTO" =>
        {
            c.trim().to_uppercase()
        }
        _ => "US".to_string(),
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

    let payload = json!({
        "context": {
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": "1.20240101.01.00",
                "hl": "en",
                "gl": gl
            }
        },
        "browseId": "FEmusic_explore"
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/browse")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("New releases request failed: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("New releases parse failed: {}", e))?;

    let mut songs = Vec::new();

    if let Some(sections) = json_data
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .and_then(|c| c.as_array())
    {
        for s in sections {
            if let Some(carousel) = s.get("musicCarouselShelfRenderer") {
                let title = carousel
                    .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_lowercase();

                if title.contains("new music videos") || title.contains("new albums & singles") {
                    if let Some(items) = carousel.get("contents").and_then(|i| i.as_array()) {
                        for it in items {
                            if let Some(r) = it.get("musicResponsiveListItemRenderer") {
                                if let Some(song) = parse_music_responsive_list_item(r) {
                                    if !songs.iter().any(|s: &Song| s.id == song.id) {
                                        songs.push(song);
                                    }
                                }
                            } else if let Some(r) = it.get("musicTwoRowItemRenderer") {
                                if let Some(song) = parse_music_two_row_item(r) {
                                    if !songs.iter().any(|s: &Song| s.id == song.id) {
                                        songs.push(song);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(songs)
}
