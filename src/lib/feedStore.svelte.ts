import { invoke } from '@tauri-apps/api/core';
import type { SearchPage, Song } from './types';
import { cleanArtistName } from './utils';
import { likedStore } from './likedStore.svelte';
import { savedStore } from './savedStore.svelte';

export interface HistoryItem {
  song: Song;
  playedAt: number;
  playCount: number;
}

export interface ArtistAffinity {
  artist: string;
  score: number;
  playCount: number;
  likeCount: number;
  lastInteracted: number;
}

export interface UserTasteProfile {
  history: HistoryItem[];
  playCounts: Record<string, number>;
  artistAffinities: Record<string, ArtistAffinity>;
  recentSearches: string[];
}

export interface PersistentFeedData {
  recommendedSongs: Song[];
  recommendedToken: string | null;
  trendingSongs: Song[];
  trendingToken: string | null;
  newSongs: Song[];
  newToken: string | null;
  oldSongs: Song[];
  oldToken: string | null;
  recommendedSearches: string[];
  lastUpdated: number;
}

const FEED_STORAGE_KEY = 'vibes_persistent_feed_v2';
const TASTE_STORAGE_KEY = 'vibes_user_taste_v2';

class FeedStore {
  // Feed state (hydrated synchronously from localStorage)
  recommendedSongs = $state<Song[]>([]);
  recommendedToken = $state<string | null>(null);
  isRecommendedLoading = $state<boolean>(false);
  isLoadingMoreRecommended = $state<boolean>(false);

  trendingSongs = $state<Song[]>([]);
  trendingToken = $state<string | null>(null);
  isTrendingLoading = $state<boolean>(false);
  isLoadingMoreTrending = $state<boolean>(false);

  newSongs = $state<Song[]>([]);
  newToken = $state<string | null>(null);
  isNewLoading = $state<boolean>(false);
  isLoadingMoreNew = $state<boolean>(false);

  oldSongs = $state<Song[]>([]);
  oldToken = $state<string | null>(null);
  isOldLoading = $state<boolean>(false);
  isLoadingMoreOld = $state<boolean>(false);

  recommendedSearches = $state<string[]>([]);
  lastUpdated = $state<number>(0);

  // User taste profile state
  history = $state<HistoryItem[]>([]);
  playCounts = $state<Record<string, number>>({});
  artistAffinities = $state<Record<string, ArtistAffinity>>({});
  recentSearches = $state<string[]>([]);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRefreshingAll = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.hydrateFromStorage();
      // If feed is empty or stale (> 4 hours), trigger background refresh
      const isStale = Date.now() - this.lastUpdated > 4 * 60 * 60 * 1000;
      if (this.recommendedSongs.length === 0 || isStale) {
        setTimeout(() => this.refreshAllFeeds(), 100);
      }
    }
  }

  // --- STORAGE HYDRATION & PERSISTENCE ---

  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  private hydrateFromStorage() {
    try {
      // 1. Load User Taste Profile
      const rawTaste = localStorage.getItem(TASTE_STORAGE_KEY);
      if (rawTaste) {
        const parsed: UserTasteProfile = JSON.parse(rawTaste);
        this.history = (parsed.history || []).map(h => ({
          ...h,
          song: h.song ? { ...h.song, thumb: this.sanitizeThumb(h.song.thumb) } : h.song
        }));
        this.playCounts = parsed.playCounts || {};
        this.artistAffinities = parsed.artistAffinities || {};
        this.recentSearches = parsed.recentSearches || [];
      }

      // 2. Load Persistent Feed
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
      }
    } catch (e) {
      console.error('[FeedStore] Storage parse error:', e);
    }
  }

  private persistFeed() {
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
        lastUpdated: Date.now()
      };
      localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify(data));
      this.lastUpdated = data.lastUpdated;
    } catch (e) {
      console.error('[FeedStore] Failed to persist feed:', e);
    }
  }

  private persistTasteProfile() {
    if (typeof window === 'undefined') return;
    try {
      const taste: UserTasteProfile = {
        history: this.history.slice(0, 300),
        playCounts: this.playCounts,
        artistAffinities: this.artistAffinities,
        recentSearches: this.recentSearches.slice(0, 20)
      };
      localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(taste));
    } catch (e) {
      console.error('[FeedStore] Failed to persist taste profile:', e);
    }
  }

  // --- CONTINUOUS LEARNING: TRACK USER ACTIONS ---

  recordPlay(song: Song) {
    if (!song || !song.id) return;

    // 1. Update Play Counts
    const currentCount = (this.playCounts[song.id] || 0) + 1;
    this.playCounts[song.id] = currentCount;

    // 2. Update History
    const existingIdx = this.history.findIndex(h => h.song.id === song.id);
    if (existingIdx !== -1) {
      this.history[existingIdx].playedAt = Date.now();
      this.history[existingIdx].playCount = currentCount;
      // Move to front
      const [item] = this.history.splice(existingIdx, 1);
      this.history.unshift(item);
    } else {
      this.history.unshift({
        song,
        playedAt: Date.now(),
        playCount: currentCount
      });
    }

    // 3. Update Artist Affinity
    const cleanArt = cleanArtistName(song.artist, song.title, song.album);
    if (cleanArt) {
      const key = cleanArt.toLowerCase();
      const existing = this.artistAffinities[key] || {
        artist: cleanArt,
        score: 0,
        playCount: 0,
        likeCount: 0,
        lastInteracted: Date.now()
      };
      existing.score += 2;
      existing.playCount += 1;
      existing.lastInteracted = Date.now();
      this.artistAffinities[key] = existing;
    }

    this.persistTasteProfile();

    // 4. Update Old Ones in real time if repeated
    if (currentCount >= 2 && !this.oldSongs.some(s => s.id === song.id)) {
      this.oldSongs = [song, ...this.oldSongs];
      this.persistFeed();
    }

    // 5. Debounce smart feed evolution
    this.scheduleEvolveFeed();
  }

  recordLike(song: Song, isLiked: boolean) {
    if (!song) return;
    const cleanArt = cleanArtistName(song.artist, song.title, song.album);
    if (cleanArt) {
      const key = cleanArt.toLowerCase();
      const existing = this.artistAffinities[key] || {
        artist: cleanArt,
        score: 0,
        playCount: 0,
        likeCount: 0,
        lastInteracted: Date.now()
      };
      existing.score += isLiked ? 5 : -3;
      existing.likeCount += isLiked ? 1 : -1;
      existing.lastInteracted = Date.now();
      this.artistAffinities[key] = existing;
      this.persistTasteProfile();
    }

    // Update oldSongs pool with liked tracks
    if (isLiked) {
      if (!this.oldSongs.some(s => s.id === song.id)) {
        this.oldSongs = [song, ...this.oldSongs];
      }
    }
    this.persistFeed();
    this.scheduleEvolveFeed();
  }

  recordSave(song: Song) {
    if (!song) return;
    const cleanArt = cleanArtistName(song.artist, song.title, song.album);
    if (cleanArt) {
      const key = cleanArt.toLowerCase();
      const existing = this.artistAffinities[key] || {
        artist: cleanArt,
        score: 0,
        playCount: 0,
        likeCount: 0,
        lastInteracted: Date.now()
      };
      existing.score += 4;
      existing.lastInteracted = Date.now();
      this.artistAffinities[key] = existing;
      this.persistTasteProfile();
    }
    if (!this.oldSongs.some(s => s.id === song.id)) {
      this.oldSongs = [song, ...this.oldSongs];
      this.persistFeed();
    }
  }

  recordSearch(query: string) {
    const clean = query.trim();
    if (!clean || clean.length < 2) return;
    this.recentSearches = [clean, ...this.recentSearches.filter(q => q.toLowerCase() !== clean.toLowerCase())].slice(0, 20);
    this.persistTasteProfile();
    this.updateRecommendedSearches();
  }

  removeSearch(query: string) {
    const clean = query.trim().toLowerCase();
    this.recentSearches = this.recentSearches.filter(q => q.toLowerCase() !== clean);
    this.persistTasteProfile();
    this.updateRecommendedSearches();
  }

  clearRecentSearches() {
    this.recentSearches = [];
    this.persistTasteProfile();
    this.updateRecommendedSearches();
  }

  // --- INTELLIGENT FEED EVOLUTION & GENERATION ---

  getTopArtists(limit = 5): string[] {
    return Object.values(this.artistAffinities)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(a => a.artist);
  }

  getFavoriteSeedSong(): Song | null {
    if (this.history.length > 0) {
      // Pick highest played song in recent history
      const sorted = [...this.history.slice(0, 30)].sort((a, b) => b.playCount - a.playCount);
      if (sorted.length > 0) return sorted[0].song;
    }
    return null;
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
        this.refreshRecommended(),
        this.refreshTrending(),
        this.refreshNewToYou(),
        this.refreshOldOnes(),
        this.updateRecommendedSearches()
      ]);
      this.persistFeed();
    } finally {
      this.isRefreshingAll = false;
    }
  }

  // 1. Recommended for You (Evolving with user's top artist & seed)
  async refreshRecommended(force = false) {
    if (this.recommendedSongs.length > 0 && !force) return;
    this.isRecommendedLoading = true;
    try {
      const topSeed = this.getFavoriteSeedSong();
      const topArtists = this.getTopArtists(2);

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
        this.recommendedSongs = res.songs;
        this.recommendedToken = res.continuation_token ?? null;
        this.persistFeed();
      }
    } catch (e) {
      console.error('[FeedStore] Error in refreshRecommended:', e);
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
            newBatch.push(s);
          }
        }
      }

      if (newBatch.length > 0) {
        this.recommendedSongs = [...this.recommendedSongs, ...newBatch];
      }
      this.recommendedToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[FeedStore] Error in loadMoreRecommended:', e);
    } finally {
      this.isLoadingMoreRecommended = false;
    }
  }

  // 2. Trending
  async refreshTrending(force = false) {
    if (this.trendingSongs.length > 0 && !force) return;
    this.isTrendingLoading = true;
    try {
      const res = await invoke<SearchPage>('search_music', { query: 'Trending Hits Global Music' });
      if (res && res.songs && res.songs.length > 0) {
        this.trendingSongs = res.songs;
        this.trendingToken = res.continuation_token ?? null;
        this.persistFeed();
      }
    } catch (e) {
      console.error('[FeedStore] Error in refreshTrending:', e);
    } finally {
      this.isTrendingLoading = false;
    }
  }

  async loadMoreTrending() {
    if (!this.trendingToken || this.isLoadingMoreTrending || this.isTrendingLoading) return;
    this.isLoadingMoreTrending = true;
    try {
      const existing = new Set(this.trendingSongs.map(s => s.id));
      let newBatch: Song[] = [];
      let token: string | null = this.trendingToken;
      let depth = 0;

      while (token && newBatch.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existing.has(s.id)) {
            existing.add(s.id);
            newBatch.push(s);
          }
        }
      }

      if (newBatch.length > 0) {
        this.trendingSongs = [...this.trendingSongs, ...newBatch];
      }
      this.trendingToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[FeedStore] Error in loadMoreTrending:', e);
    } finally {
      this.isLoadingMoreTrending = false;
    }
  }

  // 3. New to You (Tailored discover releases, strictly filtering songs already played)
  async refreshNewToYou(force = false) {
    if (this.newSongs.length > 0 && !force) return;
    this.isNewLoading = true;
    try {
      const topArtists = this.getTopArtists(2);
      const query = topArtists.length > 0
        ? `${topArtists.join(' ')} New Releases Discovery`
        : 'New Music Discovery Breakthrough Releases';

      const res = await invoke<SearchPage>('search_music', { query });
      if (res && res.songs) {
        // Exclude songs already in user history or liked
        const playedIds = new Set(Object.keys(this.playCounts));
        const filtered = res.songs.filter(s => !playedIds.has(s.id));
        this.newSongs = filtered.length > 0 ? filtered : res.songs;
        this.newToken = res.continuation_token ?? null;
        this.persistFeed();
      }
    } catch (e) {
      console.error('[FeedStore] Error in refreshNewToYou:', e);
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
            newBatch.push(s);
          }
        }
      }

      if (newBatch.length > 0) {
        this.newSongs = [...this.newSongs, ...newBatch];
      }
      this.newToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[FeedStore] Error in loadMoreNew:', e);
    } finally {
      this.isLoadingMoreNew = false;
    }
  }

  // 4. Your Old Ones (True repeat favorites & history)
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

      // Songs with multiple plays from history
      const frequent = this.history
        .filter(h => h.playCount >= 2)
        .map(h => h.song);

      const seen = new Set<string>();
      const combined: Song[] = [];

      for (const song of [...frequent, ...liked, ...saved]) {
        if (!seen.has(song.id)) {
          seen.add(song.id);
          combined.push(song);
        }
      }

      if (combined.length < 8) {
        // Supplement with classic favorites
        const res = await invoke<SearchPage>('search_music', { query: 'All Time Greatest Classic Hits Throwback' }).catch(() => null);
        if (res && res.songs) {
          for (const s of res.songs) {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              combined.push(s);
            }
          }
        }
      }

      this.oldSongs = combined;
      this.persistFeed();
    } catch (e) {
      console.error('[FeedStore] Error in refreshOldOnes:', e);
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
            newBatch.push(s);
          }
        }
      }

      if (newBatch.length > 0) {
        this.oldSongs = [...this.oldSongs, ...newBatch];
      }
      this.oldToken = token;
      this.persistFeed();
    } catch (e) {
      console.error('[FeedStore] Error in loadMoreOld:', e);
    } finally {
      this.isLoadingMoreOld = false;
    }
  }

  // --- DYNAMIC SEARCH TAGS / PILLS ---

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

    // 1. User's top artists by affinity score
    const topArtists = this.getTopArtists(4);
    for (const art of topArtists) {
      addTag(art);
      addTag(`${art} Mix`);
    }

    // 2. Recent searches
    for (const query of this.recentSearches.slice(0, 3)) {
      addTag(query);
    }

    // 3. Fallback vibes filler
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
}

export const feedStore = new FeedStore();
