export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function parseDurationToSeconds(duration: string): number {
  if (!duration || duration === '--:--') return 0;
  const parts = duration.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

export function formatSongSize(savedBytes?: number | null, duration?: string | null): string {
  if (savedBytes && savedBytes > 0) {
    return formatBytes(savedBytes);
  }
  if (duration) {
    const secs = parseDurationToSeconds(duration);
    if (secs > 0) {
      // 160 kbps Opus/AAC stream = ~20 KB per second
      return formatBytes(secs * 20 * 1024);
    }
  }
  return '—';
}

export function cleanArtistName(artist?: string, title?: string, album?: string): string {
  let art = (artist || '').trim();
  const invalidArtists = ['song', 'video', 'episode', 'podcast', 'artist', 'album', 'channel', 'topic', 'unknown artist', 'various artists'];
  if (!art || invalidArtists.includes(art.toLowerCase())) {
    if (title && title.includes(' - ')) {
      const p0 = title.split(' - ')[0].trim();
      if (p0 && !invalidArtists.includes(p0.toLowerCase())) return p0;
    }
    if (album && !invalidArtists.includes(album.toLowerCase())) {
      return album.trim();
    }
    return '';
  }
  return art;
}

export function getHighQualityThumbCandidates(
  src?: string | null,
  songId?: string | null,
  highQuality: boolean = false
): string[] {
  if (!src && !songId) return [];

  const candidates: string[] = [];
  const raw = (src || '').trim();

  // 1. Google User Content / YouTube Music album art (high quality square crop)
  if (raw.includes('googleusercontent.com')) {
    const size = highQuality ? 'w1200-h1200' : 'w544-h544';
    const upgraded = raw
      .replace(/=w\d+-h\d+[^?#]*/, `=${size}-l90-rj`)
      .replace(/=s\d+[^?#]*/, `=${size}`);
    if (upgraded !== raw) {
      candidates.push(upgraded);
    }
    candidates.push(raw);
    return candidates;
  }

  // 2. Clean raw URL (strip downsampling query parameters like ?sqp=...)
  const cleanRaw = raw ? raw.split('?')[0] : '';

  // 3. Extract YouTube video ID
  let vid = songId || '';
  if (!vid && raw) {
    const match = raw.match(/\/vi\/([a-zA-Z0-9_-]{11})\//) || raw.match(/vi_webp\/([a-zA-Z0-9_-]{11})\//);
    if (match) {
      vid = match[1];
    }
  }

  // 4. If high quality requested (NowPlayingView / BottomPlayer):
  if (highQuality && vid) {
    candidates.push(`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`);
    candidates.push(`https://i.ytimg.com/vi/${vid}/hq720.jpg`);
  }

  // 5. Always include the clean original URL from YouTube first for normal cards, or fallback for highQuality
  if (cleanRaw && !candidates.includes(cleanRaw)) {
    candidates.push(cleanRaw);
  }
  if (raw && !candidates.includes(raw)) {
    candidates.push(raw);
  }

  // 6. Safe universal fallbacks if original was somehow unavailable
  if (vid) {
    const hq = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    if (!candidates.includes(hq)) candidates.push(hq);
    const mq = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
    if (!candidates.includes(mq)) candidates.push(mq);
  }

  return candidates;
}
