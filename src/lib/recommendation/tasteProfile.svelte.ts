import type { HistoryItem, ArtistAffinity, UserTasteProfile } from './types';
import type { Song } from '../types';
import { cleanArtistName } from '../utils';

const TASTE_STORAGE_KEY = 'vibes_user_taste_v2';

export class TasteProfileStore {
  history = $state<HistoryItem[]>([]);
  playCounts = $state<Record<string, number>>({});
  artistAffinities = $state<Record<string, ArtistAffinity>>({});
  recentSearches = $state<string[]>([]);

  constructor() {
    if (typeof window !== 'undefined') {
      this.hydrate();
    }
  }

  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  hydrate() {
    try {
      const raw = localStorage.getItem(TASTE_STORAGE_KEY);
      if (raw) {
        const parsed: UserTasteProfile = JSON.parse(raw);
        this.history = (parsed.history || []).map(h => ({
          ...h,
          song: h.song ? { ...h.song, thumb: this.sanitizeThumb(h.song.thumb) } : h.song
        }));
        this.playCounts = parsed.playCounts || {};
        this.artistAffinities = parsed.artistAffinities || {};
        this.recentSearches = parsed.recentSearches || [];
      }
    } catch (e) {
      console.error('[TasteProfile] Hydration error:', e);
    }
  }

  persist() {
    if (typeof window === 'undefined') return;
    try {
      const data: UserTasteProfile = {
        history: this.history.slice(0, 300),
        playCounts: this.playCounts,
        artistAffinities: this.artistAffinities,
        recentSearches: this.recentSearches.slice(0, 20)
      };
      localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[TasteProfile] Persist error:', e);
    }
  }

  recordPlay(song: Song) {
    if (!song || !song.id) return;

    // 1. Update play count
    const count = (this.playCounts[song.id] || 0) + 1;
    this.playCounts[song.id] = count;

    // 2. Update history
    const existingIdx = this.history.findIndex(h => h.song.id === song.id);
    if (existingIdx !== -1) {
      this.history[existingIdx].playedAt = Date.now();
      this.history[existingIdx].playCount = count;
      const [item] = this.history.splice(existingIdx, 1);
      this.history.unshift(item);
    } else {
      this.history.unshift({
        song,
        playedAt: Date.now(),
        playCount: count
      });
    }

    // 3. Update artist affinity score (+2)
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

    this.persist();
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
      this.persist();
    }
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
      this.persist();
    }
  }

  recordSearch(query: string) {
    const clean = query.trim();
    if (!clean || clean.length < 2) return;
    this.recentSearches = [clean, ...this.recentSearches.filter(q => q.toLowerCase() !== clean.toLowerCase())].slice(0, 20);
    this.persist();
  }

  removeSearch(query: string) {
    const clean = query.trim().toLowerCase();
    this.recentSearches = this.recentSearches.filter(q => q.toLowerCase() !== clean);
    this.persist();
  }

  clearRecentSearches() {
    this.recentSearches = [];
    this.persist();
  }

  getTopArtists(limit = 5): string[] {
    return Object.values(this.artistAffinities)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(a => a.artist);
  }

  getFavoriteSeedSong(): Song | null {
    if (this.history.length > 0) {
      const sorted = [...this.history.slice(0, 30)].sort((a, b) => b.playCount - a.playCount);
      if (sorted.length > 0) return sorted[0].song;
    }
    return null;
  }
}

export const tasteProfile = new TasteProfileStore();
