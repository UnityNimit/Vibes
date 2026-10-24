use crate::models::LyricsResult;
use serde_json::Value;

fn clean_lyrics_title(title: &str) -> String {
    let mut t = title.to_string();
    // 1. Truncate pipe or double slash descriptors (e.g. "Song | Official Music Video")
    if let Some(pos) = t.find('|') {
        t = t[..pos].trim().to_string();
    }
    if let Some(pos) = t.find("//") {
        t = t[..pos].trim().to_string();
    }

    let patterns = [
        "(official music video)", "[official music video]",
        "(official video)", "[official video]",
        "(official audio)", "[official audio]",
        "(official lyric video)", "[official lyric video]",
        "(official)", "[official]",
        "(music video)", "[music video]",
        "(lyric video)", "[lyric video]",
        "(lyrics video)", "[lyrics video]",
        "(lyrics)", "[lyrics]",
        "(audio visualizer)", "[audio visualizer]",
        "(visualizer)", "[visualizer]",
        "(audio)", "[audio]",
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

    // 2. Remove featured artist tags like (feat. X) or [ft. X] for cleaner search
    let feat_patterns = ["(feat.", "[feat.", "(ft.", "[ft."];
    let lower_feat = t.to_lowercase();
    for fp in &feat_patterns {
        if let Some(pos) = lower_feat.find(fp) {
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

    // 1. Try exact match /api/get with duration if available
    if let Some(dur) = duration_secs {
        let url = format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}&duration={}",
            urlencoding::encode(&clean_title),
            urlencoding::encode(&clean_artist),
            dur
        );

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
    }

    // 2. Try exact match /api/get without duration
    let url_no_dur = format!(
        "https://lrclib.net/api/get?track_name={}&artist_name={}",
        urlencoding::encode(&clean_title),
        urlencoding::encode(&clean_artist)
    );

    if let Ok(resp) = client
        .get(&url_no_dur)
        .header("User-Agent", "VibesMusicApp/1.0 (https://github.com)")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<Value>().await {
                let synced = json.get("syncedLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                let plain = json.get("plainLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                if synced.is_some() {
                    return Ok(LyricsResult { synced, plain });
                }
            }
        }
    }

    // 3. Fallback to /api/search?q= with smart candidate ranking
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
                let mut best_synced: Option<(i64, String, Option<String>)> = None;
                let mut first_plain: Option<String> = None;

                for item in items {
                    let synced = item.get("syncedLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let plain = item.get("plainLyrics").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let item_dur = item.get("duration").and_then(|v| v.as_f64()).map(|d| d as i64);

                    if let Some(s) = synced {
                        let diff = if let (Some(target), Some(actual)) = (duration_secs, item_dur) {
                            (target as i64 - actual).abs()
                        } else {
                            0
                        };

                        if let Some((best_diff, _, _)) = &best_synced {
                            if diff < *best_diff {
                                best_synced = Some((diff, s, plain));
                            }
                        } else {
                            best_synced = Some((diff, s, plain));
                        }
                    } else if first_plain.is_none() && plain.is_some() {
                        first_plain = plain;
                    }
                }

                if let Some((_, synced, plain)) = best_synced {
                    return Ok(LyricsResult {
                        synced: Some(synced),
                        plain,
                    });
                }

                if let Some(plain) = first_plain {
                    return Ok(LyricsResult {
                        synced: None,
                        plain: Some(plain),
                    });
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
