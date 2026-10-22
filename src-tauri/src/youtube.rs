use crate::models::Song;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use serde_json::{json, Value};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub async fn search_songs(query: &str) -> Result<Vec<Song>, String> {
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
        "query": query
    });

    let resp = client
        .post("https://music.youtube.com/youtubei/v1/search")
        .headers(headers)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to query YouTube Music: {}", e))?;

    let json_data: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let mut songs = Vec::new();
    extract_songs(&json_data, &mut songs);

    Ok(songs)
}

fn extract_songs(val: &Value, out: &mut Vec<Song>) {
    if let Value::Object(map) = val {
        if let Some(item) = map.get("musicResponsiveListItemRenderer") {
            if let Some(flex) = item.get("flexColumns").and_then(|v| v.as_array()) {
                let title = flex
                    .get(0)
                    .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();

                let mut artist = String::new();
                let mut album = String::new();
                let mut duration = String::new();

                if let Some(runs) = flex
                    .get(1)
                    .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs"))
                    .and_then(|r| r.as_array())
                {
                    let parts: Vec<&str> = runs
                        .iter()
                        .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                        .filter(|t| !t.trim().is_empty() && *t != " • ")
                        .collect();

                    if !parts.is_empty() {
                        artist = parts[0].to_string();
                    }
                    if parts.len() > 1 {
                        album = parts[1].to_string();
                    }
                    if parts.len() > 2 {
                        duration = parts[2].to_string();
                    }
                }

                let video_id = item
                    .pointer("/playlistItemData/videoId")
                    .or_else(|| item.pointer("/doubleTapCommand/watchEndpoint/videoId"))
                    .or_else(|| item.pointer("/navigationEndpoint/watchEndpoint/videoId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let thumb = item
                    .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                    .and_then(|t| t.as_array())
                    .and_then(|arr| arr.last())
                    .and_then(|th| th.get("url"))
                    .and_then(|u| u.as_str())
                    .unwrap_or("")
                    .to_string();

                if !title.is_empty() && !video_id.is_empty() {
                    // Check if not duplicate
                    if !out.iter().any(|s| s.id == video_id) {
                        out.push(Song {
                            id: video_id,
                            title,
                            artist,
                            album,
                            duration,
                            thumb,
                        });
                    }
                }
            }
        }

        for (_, v) in map {
            extract_songs(v, out);
        }
    } else if let Value::Array(arr) = val {
        for v in arr {
            extract_songs(v, out);
        }
    }
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
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("yt-dlp");
        cmd.args(["-f", "ba[ext=m4a]/ba", "-g", &url]);

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
    .map_err(|e| format!("Task join error: {}", e))?
}
