import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import type { TrendingMood, RegionCode, CircadianInfo, PersistentFeedData } from './types';
import { getCircadianInfo } from './circadian';
import { getStoredRegionPreference, saveStoredRegionPreference } from './location';
import { tasteProfile } from './tasteProfile.svelte';
import { trendingService } from './trendingService';
import { likedStore } from '../likedStore.svelte';
import { savedStore } from '../savedStore.svelte';

const FEED_STORAGE_KEY = 'vibes_persistent_feed_v3';

export class RecommendationEngine {
  // --- Trending Section State ---
  trendingSongs = $state<Song[]>([]);
  trendingToken = $state<string | null>(null);
  trendingMood = $state<TrendingMood>('all');
  trendingRegion = $state<RegionCode>('AUTO');
  isTrendingLoading = $state<boolean>(false);
  isLoadingMoreTrending = $state<boolean>(false);

  // --- Recommended For You Section State ---
  recommendedSongs = $state<Song[]>([]);
  recommendedToken = $state<string | null>(null);
  isRecommendedLoading = $state<boolean>(false);
  isLoadingMoreRecommended = $state<boolean>(false);

  // --- New To You Discovery Section State ---
  newSongs = $state<Song[]>([]);
  newToken = $state<string | null>(null);
  isNewLoading = $state<boolean>(false);
  isLoadingMoreNew = $state<boolean>(false);

  // --- Your Old Ones Section State ---
  oldSongs = $state<Song[]>([]);
  oldToken = $state<string | null>(null);
  isOldLoading = $state<boolean>(false);
  isLoadingMoreOld = $state<boolean>(false);

  // --- Dynamic Search Tags & Sync Meta ---
  recommendedSearches = $state<string[]>([]);
  lastUpdated = $state<number>(0);

  // Circadian state (re-computed)
  circadianInfo = $derived(getCircadianInfo());

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRefreshingAll = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.trendingRegion = getStoredRegionPreference();
      this.hydrateFromStorage();

      // If feed is empty or stale (> 3 hours), trigger background refresh
      const isStale = Date.now() - this.lastUpdated > 3 * 60 * 60 * 1000;
      if (this.trendingSongs.length === 0 || this.recommendedSongs.length === 0 || isStale) {
        setTimeout(() => this.refreshAllFeeds(), 100);
      }
    }
  }

  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  private hydrateFromStorage() {
    try {
      const rawFeed = localStorage.getItem(FEED_STORAGE_KEY);
      if (rawFeed) {
        const feed: PersistentFeedData = JSON.parse(rawFeed);
        this.recommendedSongs = (feed.recommendedSongs || []).map(s => ({ ...s, thumb: this.sanitizeThumb(s.thumb) }));
        this.recommendedToken = feed.recommendedToken || null;
        this.trendingSongs = (feed.trendingSongs || []).map(s => ({ ...s, thumb: this.sanitizeThumb(s.thumb) }));
        this.trendingToken = feed.trendingToken || null;
        this.newSongs = (feed.newSongs || []).map(s => ({ ...s, thumb: this.sanitizeThumb(s.thumb) }));
        this.newToken = feed.newToken || null;
        this.oldSongs = (feed.oldSongs || []).map(s => ({ ...s, thumb: this.sanitizeThumb(s.thumb) }));
        this.oldToken = feed.oldToken || null;
        this.recommendedSearches = feed.recommendedSearches || [];
        this.lastUpdated = feed.lastUpdated || 0;
        if (feed.trendingMood) this.trendingMood = feed.trendingMood;
      }
    } catch (e) {
      console.error('[RecommendationEngine] Hydration error:', e);
    }
  }

  persistFeed() {
    if (typeof window === 'undefined') return;
    try {
      const data: PersistentFeedData = {
        recommendedSongs: this.recommendedSongs.slice(0, 50),
        recommendedToken: this.recommendedToken,
        trendingSongs: this.trendingSongs.slice(0, 50),
        trendingToken: this.trendingToken,
        newSongs: this.newSongs.slice(0, 50),
        newToken: this.newToken,
        oldSongs: this.oldSongs.slice(0, 50),
        oldToken: this.oldToken,
        recommendedSearches: this.recommendedSearches,
        lastUpdated: Date.now(),
        trendingMood: this.trendingMood,
        trendingRegion: this.trendingRegion
      };
      localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(data));
      this.lastUpdated = data.lastUpdated;
    } catch (e) {
      console.error('[RecommendationEngine] Persist error:', e);
    }
  }

  // --- TRENDING REVOLUTION: MOOD & REGION SWITCHING ---

  async setTrendingMood(mood: TrendingMood) {
    if (this.trendingMood === mood) return;
    this.trendingMood = mood;
    await this.refreshTrending(true);
  }

  async setTrendingRegion(region: RegionCode) {
    if (this.trendingRegion === region) return;
    this.trendingRegion = region;
    saveStoredRegionPreference(region);
    await this.refreshTrending(true);
  }

  async refreshTrending(force = false) {
    if (this.isTrendingLoading) return;
    this.isTrendingLoading = true;
    try {
      const effectiveMood = this.trendingMood === 'circadian'
        ? this.circadianInfo.queryKeyword as TrendingMood
        : this.trendingMood;

      const songs = await trendingService.fetchTrending(effectiveMood, this.trendingRegion, force);
      if (songs && songs.length > 0) {
        this.trendingSongs = songs;
        this.persistFeed();
      }
    } catch (err) {
      console.error('[RecommendationEngine] refreshTrending error:', err);
    } finally {
      this.isTrendingLoading = false;
    }
  }

  async loadMoreTrending() {
    if (this.isLoadingMoreTrending || this.isTrendingLoading) return;
    this.isLoadingMoreTrending = true;
    try {
      if (this.trendingToken) {
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: this.trendingToken });
        if (page && page.songs && page.songs.length > 0) {
          const existing = new Set(this.trendingSongs.map(s => s.id));
          const additions = page.songs.filter(s => !existing.has(s.id));
          this.trendingSongs = [...this.trendingSongs, ...additions];
          this.trendingToken = page.continuation_token ?? null;
          this.persistFeed();
        }
      }
    } catch (err) {
      console.error('[RecommendationEngine] loadMoreTrending error:', err);
    } finally {
      this.isLoadingMoreTrending = false;
    }
  }

  // --- RECOMMENDED FOR YOU ---

  async refreshRecommended(force = false) {
    if (this.recommendedSongs.length > 0 && !force) return;
    this.isRecommendedLoading = true;
    try {
      const topSeed = tasteProfile.getFavoriteSeedSong();
      const topArtists = tasteProfile.getTopArtists(2);

      let res: SearchPage | null = null;
      if (topSeed && topSeed.id) {
        try {
          res = await invoke<SearchPage>('get_similar_songs', { videoId: topSeed.id });
        } catch {
          // fallback
        }
      }

      if (!res || !res.songs || res.songs.length === 0) {
        const query = topArtists.length > 0 ? `${topArtists[0]} Radio Mix` : 'Top Hits Global';
        res = await invoke<SearchPage>('search_music', { query });
      }

      if (res && res.songs && res.songs.length > 0) {
        this.recommendedSongs = res.songs.map(s => ({ ...s, thumb: this.sanitizeThumb(s.thumb) }));
        this.recommendedToken = res.continuation_token ?? null;
        this.persistFeed();
      }
    } catch (e) {
      console.error('[RecommendationEngine] Error in refreshRecommended:', e);
    } finally {
      this.isRecommendedLoading = false;
    }
  }

  async loadMoreRecommended() {
    if (!this.recommendedToken || this.isLoadingMoreRecommended || this.isRecommendedLoading) return;
    this.isLoadingMoreRecommended = true;
    try {
      const existing = new Set(this.recommendedSongs.map(s => s.id));
      let newBatch: Song[] = [];
      let token: string | null = this.recommendedToken;
      let depth = 0;

      while (token && newBatch.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('get_more_similar_songs', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existing.has(s.id)) {
            existing.add(s.id);
            newBatch.push({ ...s, thumb: this.sanitizeThumb(s.thumb) });
          }
        }
      }

      if (newBatch.length > 0) {
        this.recommendedSongs = [...this.recommendedSongs, ...newBatch];
      }
      this.recommendedToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[RecommendationEngine] Error in loadMoreRecommended:', e);
    } finally {
      this.isLoadingMoreRecommended = false;
    }
  }

  // --- NEW TO YOU (DISCOVERY) ---

  async refreshNewToYou(force = false) {
    if (this.newSongs.length > 0 && !force) return;
    this.isNewLoading = true;
    try {
      const topArtists = tasteProfile.getTopArtists(2);
      const query = topArtists.length > 0
        ? `${topArtists.join(' ')} New Releases Discovery`
        : 'New Music Discovery Breakthrough Releases';

      const res = await invoke<SearchPage>('search_music', { query });
      if (res && res.songs) {
        const playedIds = new Set(Object.keys(tasteProfile.playCounts));
        const filtered = res.songs.filter(s => !playedIds.has(s.id));
        this.newSongs = (filtered.length > 0 ? filtered : res.songs).map(s => ({
          ...s,
          thumb: this.sanitizeThumb(s.thumb)
        }));
        this.newToken = res.continuation_token ?? null;
        this.persistFeed();
      }
    } catch (e) {
      console.error('[RecommendationEngine] Error in refreshNewToYou:', e);
    } finally {
      this.isNewLoading = false;
    }
  }

  async loadMoreNew() {
    if (!this.newToken || this.isLoadingMoreNew || this.isNewLoading) return;
    this.isLoadingMoreNew = true;
    try {
      const existing = new Set(this.newSongs.map(s => s.id));
      let newBatch: Song[] = [];
      let token: string | null = this.newToken;
      let depth = 0;

      while (token && newBatch.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existing.has(s.id)) {
            existing.add(s.id);
            newBatch.push({ ...s, thumb: this.sanitizeThumb(s.thumb) });
          }
        }
      }

      if (newBatch.length > 0) {
        this.newSongs = [...this.newSongs, ...newBatch];
      }
      this.newToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[RecommendationEngine] Error in loadMoreNew:', e);
    } finally {
      this.isLoadingMoreNew = false;
    }
  }

  // --- YOUR OLD ONES (REPEAT FAVORITES) ---

  async refreshOldOnes(force = false) {
    if (this.oldSongs.length > 0 && !force) return;
    this.isOldLoading = true;
    try {
      const liked = likedStore.songs || [];
      const saved = (savedStore.items || []).map(i => ({
        id: i.id,
        title: i.title,
        artist: i.artist,
        album: i.album,
        duration: i.duration,
        thumb: i.thumb
      }));

      const frequent = tasteProfile.history
        .filter(h => h.playCount >= 2)
        .map(h => h.song);

      const seen = new Set<string>();
      const combined: Song[] = [];

      for (const song of [...frequent, ...liked, ...saved]) {
        if (!seen.has(song.id)) {
          seen.add(song.id);
          combined.push({ ...song, thumb: this.sanitizeThumb(song.thumb) });
        }
      }

      if (combined.length < 8) {
        const res = await invoke<SearchPage>('search_music', { query: 'All Time Greatest Classic Hits Throwback' }).catch(() => null);
        if (res && res.songs) {
          for (const s of res.songs) {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              combined.push({ ...s, thumb: this.sanitizeThumb(s.thumb) });
            }
          }
        }
      }

      this.oldSongs = combined;
      this.persistFeed();
    } catch (e) {
      console.error('[RecommendationEngine] Error in refreshOldOnes:', e);
    } finally {
      this.isOldLoading = false;
    }
  }

  async loadMoreOld() {
    if (!this.oldToken || this.isLoadingMoreOld || this.isOldLoading) return;
    this.isLoadingMoreOld = true;
    try {
      const existing = new Set(this.oldSongs.map(s => s.id));
      let newBatch: Song[] = [];
      let token: string | null = this.oldToken;
      let depth = 0;

      while (token && newBatch.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existing.has(s.id)) {
            existing.add(s.id);
            newBatch.push({ ...s, thumb: this.sanitizeThumb(s.thumb) });
          }
        }
      }

      if (newBatch.length > 0) {
        this.oldSongs = [...this.oldSongs, ...newBatch];
      }
      this.oldToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[RecommendationEngine] Error in loadMoreOld:', e);
    } finally {
      this.isLoadingMoreOld = false;
    }
  }

  // --- DYNAMIC SEARCH TAGS & CONTINUOUS LEARNING TRIGGERS ---

  async updateRecommendedSearches() {
    const list: string[] = [];
    const seen = new Set<string>();

    const addTag = (tag: string) => {
      const clean = tag.trim();
      const lower = clean.toLowerCase();
      if (!clean || seen.has(lower) || clean.length < 2 || clean.length > 32) return;
      if (['song', 'video', 'music', 'unknown artist', 'various artists', 'topic', 'official'].includes(lower)) return;
      seen.add(lower);
      list.push(clean);
    };

    const topArtists = tasteProfile.getTopArtists(4);
    for (const art of topArtists) {
      addTag(art);
      addTag(`${art} Mix`);
    }

    for (const query of tasteProfile.recentSearches.slice(0, 3)) {
      addTag(query);
    }

    // Circadian tag
    addTag(this.circadianInfo.label);

    const defaultVibes = [
      'Top Hits Worldwide',
      'Trending Hits',
      'Late Night Vibes',
      'Chill Acoustic',
      'Lofi Beats',
      'Throwback Classics',
      'Workout Motivation',
      'Synthwave Melodies'
    ];
    for (const vibe of defaultVibes) {
      if (list.length >= 10) break;
      addTag(vibe);
    }

    this.recommendedSearches = list.slice(0, 10);
    this.persistFeed();
  }

  recordPlay(song: Song) {
    tasteProfile.recordPlay(song);
    const count = tasteProfile.playCounts[song.id] || 0;
    if (count >= 2 && !this.oldSongs.some(s => s.id === song.id)) {
      this.oldSongs = [song, ...this.oldSongs];
      this.persistFeed();
    }
    this.scheduleEvolveFeed();
  }

  recordLike(song: Song, isLiked: boolean) {
    tasteProfile.recordLike(song, isLiked);
    if (isLiked && !this.oldSongs.some(s => s.id === song.id)) {
      this.oldSongs = [song, ...this.oldSongs];
    }
    this.persistFeed();
    this.scheduleEvolveFeed();
  }

  recordSave(song: Song) {
    tasteProfile.recordSave(song);
    if (!this.oldSongs.some(s => s.id === song.id)) {
      this.oldSongs = [song, ...this.oldSongs];
      this.persistFeed();
    }
  }

  recordSearch(query: string) {
    tasteProfile.recordSearch(query);
    this.updateRecommendedSearches();
  }

  removeSearch(query: string) {
    tasteProfile.removeSearch(query);
    this.updateRecommendedSearches();
  }

  clearRecentSearches() {
    tasteProfile.clearRecentSearches();
    this.updateRecommendedSearches();
  }

  private scheduleEvolveFeed() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateRecommendedSearches();
      this.refreshOldOnes(true);
    }, 6000);
  }

  async refreshAllFeeds() {
    if (this.isRefreshingAll) return;
    this.isRefreshingAll = true;
    try {
      await Promise.allSettled([
        this.refreshTrending(true),
        this.refreshRecommended(),
        this.refreshNewToYou(),
        this.refreshOldOnes(),
        this.updateRecommendedSearches()
      ]);
      this.persistFeed();
    } finally {
      this.isRefreshingAll = false;
    }
  }
}

export const recommendationEngine = new RecommendationEngine();
