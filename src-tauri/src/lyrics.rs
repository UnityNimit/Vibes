use crate::models::LyricsResult;
use serde_json::Value;

pub async fn fetch_lyrics(title: &str, artist: &str, duration_secs: Option<u64>) -> Result<LyricsResult, String> {
    let client = reqwest::Client::new();
    let mut url = format!(
        "https://lrclib.net/api/get?track_name={}&artist_name={}",
        urlencoding::encode(title),
        urlencoding::encode(artist)
    );

    if let Some(dur) = duration_secs {
        url.push_str(&format!("&duration={}", dur));
    }

    let resp = client
        .get(&url)
        .header("User-Agent", "VibesMusicApp/1.0 (https://github.com)")
        .send()
        .await
        .map_err(|e| format!("Failed to request lyrics: {}", e))?;

    if !resp.status().is_success() {
        return Ok(LyricsResult {
            synced: None,
            plain: None,
        });
    }

    let json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse lyrics json: {}", e))?;

    let synced = json.get("syncedLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
    let plain = json.get("plainLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());

    Ok(LyricsResult { synced, plain })
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
