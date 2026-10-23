use crate::models::LyricsResult;
use serde_json::Value;

fn clean_lyrics_title(title: &str) -> String {
    let mut t = title.to_string();
    let patterns = [
        "(official video)", "[official video]",
        "(official music video)", "[official music video]",
        "(official audio)", "[official audio]",
        "(music video)", "[music video]",
        "(lyric video)", "[lyric video]",
        "(lyrics)", "[lyrics]",
        "(audio)", "[audio]",
        "(visualizer)", "[visualizer]",
        "(video)", "[video]",
        "(hd)", "[hd]",
        "(4k)", "[4k]",
    ];
    let lower = t.to_lowercase();
    for p in &patterns {
        if let Some(pos) = lower.find(p) {
            t = t[..pos].trim().to_string();
            break;
        }
    }
    t.trim().to_string()
}

fn clean_lyrics_artist(artist: &str) -> String {
    let a = artist.replace(" - Topic", "");
    a.trim().to_string()
}

pub async fn fetch_lyrics(title: &str, artist: &str, duration_secs: Option<u64>) -> Result<LyricsResult, String> {
    let client = reqwest::Client::new();
    let clean_title = clean_lyrics_title(title);
    let clean_artist = clean_lyrics_artist(artist);

    // 1. Try exact match /api/get
    let mut url = format!(
        "https://lrclib.net/api/get?track_name={}&artist_name={}",
        urlencoding::encode(&clean_title),
        urlencoding::encode(&clean_artist)
    );

    if let Some(dur) = duration_secs {
        url.push_str(&format!("&duration={}", dur));
    }

    if let Ok(resp) = client
        .get(&url)
        .header("User-Agent", "VibesMusicApp/1.0 (https://github.com)")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<Value>().await {
                let synced = json.get("syncedLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                let plain = json.get("plainLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                if synced.is_some() || plain.is_some() {
                    return Ok(LyricsResult { synced, plain });
                }
            }
        }
    }

    // 2. Fallback to /api/search?q=
    let search_q = format!("{} {}", clean_title, clean_artist);
    let search_url = format!(
        "https://lrclib.net/api/search?q={}",
        urlencoding::encode(search_q.trim())
    );

    if let Ok(resp) = client
        .get(&search_url)
        .header("User-Agent", "VibesMusicApp/1.0 (https://github.com)")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(items) = resp.json::<Vec<Value>>().await {
                for item in items {
                    let synced = item.get("syncedLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let plain = item.get("plainLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if synced.is_some() || plain.is_some() {
                        return Ok(LyricsResult { synced, plain });
                    }
                }
            }
        }
    }

    Ok(LyricsResult {
        synced: None,
        plain: None,
    })
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut encoded = String::new();
        for byte in s.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    encoded.push(byte as char);
                }
                _ => {
                    encoded.push_str(&format!("%{:02X}", byte));
                }
            }
        }
        encoded
    }
}
