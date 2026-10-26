import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import type { TrendingMood, RegionCode } from './types';
import { resolveEffectiveCountryCode } from './location';

interface CacheEntry {
  songs: Song[];
  continuationToken: string | null;
  timestamp: number;
}

const CACHE_TTL_MS = 6 * 60 * 1000; // 6 minutes cache per mood & region

const MOOD_QUERY_STREAMS: Record<string, string[]> = {
  all: [
    'Top 50 Global Hits 2026',
    'Billboard Hot 100 Singles 2026',
    'Viral Music Worldwide 2026',
    'Spotify Top 50 Global 2026',
    'TikTok Viral Trending Songs 2026',
    'Trending Global Dance & Pop Anthems 2026',
    'Apple Music Global Top 100 2026',
    'International Hit Anthems 2026'
  ],
  charts: [
    'Billboard Hot 100 Chart Toppers 2026',
    'Official UK Singles Chart Top 40 2026',
    'Top 50 Worldwide Music Charts 2026',
    'Global Viral 50 Songs 2026',
    'Top 100 Worldwide Music Hits 2026'
  ],
  viral: [
    'Viral TikTok Trends Music 2026',
    'Breakthrough Viral Music Global 2026',
    'Top Viral Streaming Hits 2026',
    'Trending Internet Music Viral Hits 2026'
  ],
  chill: [
    'Chill Acoustic Relaxing Peaceful Vibes 2026',
    'Chillout Sunset Acoustic Melodies 2026',
    'Cozy Ambient Lofi Chill 2026',
    'Peaceful Acoustic Singer Songwriter 2026'
  ],
  energy: [
    'High Energy Workout Gym Motivation Bass 2026',
    'Phonk & Bass Energy Boost 2026',
    'High BPM Workout Bangers 2026',
    'Adrenaline Rush Electronic Beats 2026'
  ],
  party: [
    'Party Hits Viral Club Dance Anthems 2026',
    'EDM Festival Hits Dance Bangers 2026',
    'Global Club Anthems 2026',
    'Weekend Party Bangers 2026'
  ],
  late_night: [
    'Late Night Vibes Dark Pop Lo-Fi Melodies 2026',
    'Midnight Drive R&B Chill Melodies 2026',
    'Dark Aesthetic Midnight Synthwave 2026',
    'Late Night Melodic Beats 2026'
  ],
  early_morning: [
    'Sunrise Awakening Acoustic Morning Coffee 2026',
    'Peaceful Acoustic Morning Chill 2026',
    'Warm Sunshine Folk Melodies 2026'
  ],
  morning: [
    'Deep Focus Modern Energy Pop Hits 2026',
    'Productive Morning Melodic Beats 2026',
    'Upbeat Morning Motivation 2026'
  ],
  afternoon: [
    'Midday Trending Hits Global Pop 2026',
    'Feel Good Afternoon Anthems 2026',
    'Sunny Day Groove Anthems 2026'
  ],
  evening: [
    'Sunset Golden Hour Indie R&B 2026',
    'Twilight Chilldown Melodies 2026',
    'Dusk Acoustic Chill 2026'
  ]
};

class TrendingService {
  private cache = new Map<string, CacheEntry>();
  private moodQueryIndices = new Map<string, number>();

  private getCacheKey(mood: TrendingMood, region: RegionCode): string {
    return `${mood}:${region}`;
  }

  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  async fetchTrending(
    mood: TrendingMood = 'all',
    region: RegionCode = 'AUTO',
    force = false
  ): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const key = this.getCacheKey(mood, region);
    const cached = this.cache.get(key);

    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.songs.length > 0) {
      return { songs: cached.songs, continuationToken: cached.continuationToken };
    }

    const countryCode = resolveEffectiveCountryCode(region);
    let songs: Song[] = [];
    let continuationToken: string | null = null;

    try {
      // 1. Native Rust multi-chart aggregator
      const res = await invoke<SearchPage>('get_trending_feed', {
        countryCode: countryCode || null,
        mood: mood || null
      });

      if (res && res.songs && res.songs.length > 0) {
        songs = res.songs.map(s => ({
          ...s,
          thumb: this.sanitizeThumb(s.thumb)
        }));
        continuationToken = res.continuation_token ?? null;
      }
    } catch (err) {
      console.warn('[TrendingService] get_trending_feed failed, falling back to search:', err);
    }

    // 2. Fallback query if native InnerTube browse endpoint returns empty
    if (songs.length < 10) {
      try {
        const stream = MOOD_QUERY_STREAMS[mood] || MOOD_QUERY_STREAMS.all;
        const fallbackQuery = countryCode ? `${stream[0]} ${countryCode}` : stream[0];

        const fallbackRes = await invoke<SearchPage>('search_music', { query: fallbackQuery });
        if (fallbackRes && fallbackRes.songs && fallbackRes.songs.length > 0) {
          const cleaned = fallbackRes.songs.map(s => ({
            ...s,
            thumb: this.sanitizeThumb(s.thumb)
          }));
          continuationToken = fallbackRes.continuation_token ?? null;
          // Deduplicate
          const existing = new Set(songs.map(s => s.id));
          for (const s of cleaned) {
            if (!existing.has(s.id)) {
              songs.push(s);
            }
          }
        }
      } catch (fallbackErr) {
        console.error('[TrendingService] Fallback also failed:', fallbackErr);
      }
    }

    this.moodQueryIndices.set(mood, 1);
    this.cache.set(key, { songs, continuationToken, timestamp: Date.now() });

    return { songs, continuationToken };
  }

  /**
   * Infinite loader for Trending carousel:
   * 1. Consumes continuation token if present.
   * 2. When continuation token exhausts, rotates to the next curated trending chart query
   *    matching the current mood and region, ensuring limitless scrolling!
   */
  async fetchMoreTrending(
    mood: TrendingMood,
    region: RegionCode,
    currentToken: string | null,
    existingSongIds: Set<string>
  ): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const newSongs: Song[] = [];
    let nextToken: string | null = currentToken;

    // Phase 1: Try current continuation token
    if (nextToken) {
      try {
        const page: SearchPage = await invoke<SearchPage>('search_more', {
          continuationToken: nextToken
        });
        if (page && page.songs && page.songs.length > 0) {
          for (const s of page.songs) {
            if (!existingSongIds.has(s.id)) {
              existingSongIds.add(s.id);
              newSongs.push({ ...s, thumb: this.sanitizeThumb(s.thumb) });
            }
          }
          nextToken = page.continuation_token ?? null;
          if (newSongs.length >= 8) {
            return { songs: newSongs, continuationToken: nextToken };
          }
        } else {
          nextToken = null;
        }
      } catch (_) {
        nextToken = null;
      }
    }

    // Phase 2: Advance to next curated chart stream query for this mood
    const stream = MOOD_QUERY_STREAMS[mood] || MOOD_QUERY_STREAMS.all;
    let idx = this.moodQueryIndices.get(mood) || 0;
    let attempts = 0;

    while (newSongs.length < 15 && attempts < 3) {
      attempts++;
      const query = stream[idx % stream.length];
      idx++;
      this.moodQueryIndices.set(mood, idx);

      try {
        const page: SearchPage = await invoke<SearchPage>('search_music', { query });
        if (page && page.songs) {
          nextToken = page.continuation_token ?? null;
          for (const s of page.songs) {
            if (!existingSongIds.has(s.id)) {
              existingSongIds.add(s.id);
              newSongs.push({ ...s, thumb: this.sanitizeThumb(s.thumb) });
            }
          }
        }
      } catch (_) {}
    }

    return { songs: newSongs, continuationToken: nextToken };
  }

  clearCache() {
    this.cache.clear();
    this.moodQueryIndices.clear();
  }
}

export const trendingService = new TrendingService();
