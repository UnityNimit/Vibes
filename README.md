# 🎵 Vibes - Super Legendary YouTube Music Client for Windows

A blazing-fast, lightweight, ad-free music player for Windows inspired by **ViMusic**, built with **Tauri v2 (Rust)** and **Svelte 5**.

---

## ⚡ The 4 Core Pillars

| # | Requirement | Implementation |
|---|---|---|
| **1** | **All Music from YouTube** | Direct YouTube Music (InnerTube) search, suggestions, and audio streaming with zero ad interruptions. |
| **2** | **No Lags** | Svelte 5 fine-grained runes reactivity (`$state`, `$derived`, `$effect`) with zero virtual DOM overhead + asynchronous Rust audio stream piping. |
| **3** | **Super Lightweight** | Native Windows WebView2 runtime backed by Rust. Consumes ~40–50 MB RAM (vs 400MB+ on Electron). Fast cold startup. |
| **4** | **Offline Automatic Cache Save** | Dual-pipe streaming engine: as a song plays, chunks stream to your speakers and save silently to `%APPDATA%/Vibes/cache/<videoId>.m4a`. Replaying songs uses **0 KB network data** and works 100% offline. |

---

## 🚀 Features

- **Left Sidebar Hub:** Minimalist layout featuring instant Search, Liked Songs library, and an Offline Cache management hub with live disk space tracking.
- **Integrated Sidebar Player:** ViMusic-style audio player right in the sidebar with scrubber, volume, loop/repeat, and shuffle.
- **Synchronized Karaoke Lyrics:** Timed LRC karaoke lyrics that scroll automatically with playback (powered by LRCLIB). Click any line to seek directly to that moment.
- **Offline Cache Manager:** Shows total disk space cached, track counts, play-offline button, and individual track deletion.
- **Keyboard Shortcuts:**
  - `Space`: Play / Pause
  - `ArrowLeft` / `ArrowRight`: Skip backward / forward 5 seconds
  - `Ctrl + ArrowLeft` / `Ctrl + ArrowRight`: Previous / Next track in queue
  - `L`: Toggle Synced Karaoke Lyrics

---

## 🛠️ Development & Running

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust & Cargo](https://rustup.rs/) (MSVC toolchain)
- Python with `yt-dlp` installed (`pip install yt-dlp`)

### Start in Development Mode
```bash
npm run tauri dev
```

### Build Production Release Binary
```bash
npm run tauri build
```
The compiled standalone `.exe` will be generated in `src-tauri/target/release/`.
