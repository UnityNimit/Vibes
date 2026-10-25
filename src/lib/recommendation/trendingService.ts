import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import type { TrendingMood, RegionCode } from './types';
import { resolveEffectiveCountryCode } from './location';

interface CacheEntry {
  songs: Song[];
  timestamp: number;
}

const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes cache per mood & region

class TrendingService {
  private cache = new Map<string, CacheEntry>();

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

  async fetchTrending(mood: TrendingMood = 'all', region: RegionCode = 'AUTO', force = false): Promise<Song[]> {
    const key = this.getCacheKey(mood, region);
    const cached = this.cache.get(key);

    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.songs.length > 0) {
      return cached.songs;
    }

    const countryCode = resolveEffectiveCountryCode(region);

    try {
      // 1. Try our high-power native Rust multi-chart aggregator
      const res = await invoke<SearchPage>('get_trending_feed', {
        countryCode: countryCode || null,
        mood: mood || null
      });

      if (res && res.songs && res.songs.length > 0) {
        const cleaned = res.songs.map(s => ({
          ...s,
          thumb: this.sanitizeThumb(s.thumb)
        }));

        this.cache.set(key, { songs: cleaned, timestamp: Date.now() });
        return cleaned;
      }
    } catch (err) {
      console.warn('[TrendingService] get_trending_feed failed, falling back to search:', err);
    }

    // 2. Fallback query if native InnerTube browse endpoint encounters network barrier
    try {
      const fallbackQuery = mood === 'charts'
        ? `Top 100 Songs Global Chart 2026`
        : `Trending Hits ${countryCode} 2026`;

      const fallbackRes = await invoke<SearchPage>('search_music', { query: fallbackQuery });
      if (fallbackRes && fallbackRes.songs && fallbackRes.songs.length > 0) {
        const cleaned = fallbackRes.songs.map(s => ({
          ...s,
          thumb: this.sanitizeThumb(s.thumb)
        }));
        this.cache.set(key, { songs: cleaned, timestamp: Date.now() });
        return cleaned;
      }
    } catch (fallbackErr) {
      console.error('[TrendingService] Fallback also failed:', fallbackErr);
    }

    return cached?.songs || [];
  }

  clearCache() {
    this.cache.clear();
  }
}

export const trendingService = new TrendingService();
