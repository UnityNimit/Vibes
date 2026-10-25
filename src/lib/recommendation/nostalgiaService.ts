import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import { tasteProfile } from './tasteProfile.svelte';
import { likedStore } from '../likedStore.svelte';
import { savedStore } from '../savedStore.svelte';

interface ScoredOldie {
  song: Song;
  score: number;
}

export class NostalgiaService {
  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  /**
   * Generates a super-addictive "Your Old Ones" repeat & nostalgic memory lane feed.
   * Leverages heavy rotation play counts, explicit likes, offline saves, and
   * time-decay nostalgia curves to surface user's absolute favorite anthems.
   */
  async generateOldOnes(force = false): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const playCounts = tasteProfile.playCounts || {};
    const history = tasteProfile.history || [];
    const liked = likedStore.songs || [];
    const saved = savedStore.items || [];

    const historyMap = new Map<string, { song: Song; playCount: number; playedAt: number }>();
    for (const h of history) {
      if (h.song?.id) {
        historyMap.set(h.song.id, h);
      }
    }

    const likedSet = new Set(liked.map(s => s.id));
    const savedSet = new Set(saved.map(s => s.id));

    const candidateMap = new Map<string, ScoredOldie>();

    const evaluateSong = (song: Song) => {
      if (!song || !song.id || candidateMap.has(song.id)) return;

      const plays = playCounts[song.id] || historyMap.get(song.id)?.playCount || 1;
      const isLiked = likedSet.has(song.id);
      const isSaved = savedSet.has(song.id);

      // Only qualify if song was repeated (plays >= 2) OR explicitly liked OR downloaded offline
      if (plays < 2 && !isLiked && !isSaved) return;

      // 1. Heavy Rotation Factor (Play Count)
      let score = Math.min(120, plays * 12);

      // 2. Explicit User Commitment
      if (isLiked) score += 40;
      if (isSaved) score += 35;

      // 3. Nostalgic Time Curve (The "Haven't heard this in a few days" dopamine kick)
      const lastPlayed = historyMap.get(song.id)?.playedAt || 0;
      if (lastPlayed > 0) {
        const daysAgo = (Date.now() - lastPlayed) / (1000 * 60 * 60 * 24);
        if (daysAgo >= 2 && daysAgo <= 45) {
          // Sweet spot for nostalgic replay value
          score += Math.min(35, daysAgo * 3);
        } else if (daysAgo < 0.1) {
          // Just played within the last 2 hours: slight cooldown
          score -= 15;
        }
      }

      candidateMap.set(song.id, {
        song: { ...song, thumb: this.sanitizeThumb(song.thumb) },
        score
      });
    };

    // Evaluate history items
    for (const h of history) {
      evaluateSong(h.song);
    }

    // Evaluate liked tracks
    for (const s of liked) {
      evaluateSong(s);
    }

    // Evaluate saved offline tracks
    for (const item of saved) {
      evaluateSong({
        id: item.id,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        thumb: item.thumb
      });
    }

    // Enrichment: If user has fewer than 10 repeat tracks, supplement with
    // all-time throwback classics from the user's TOP affinity artists!
    if (candidateMap.size < 10) {
      const topArtists = tasteProfile.getTopArtists(3);
      const queries: Promise<Song[]>[] = [];

      if (topArtists.length > 0) {
        for (const artist of topArtists) {
          queries.push(
            invoke<SearchPage>('search_music', { query: `${artist} Greatest Hits Classics Throwback` })
              .then(r => r.songs || [])
              .catch(() => [])
          );
        }
      } else {
        queries.push(
          invoke<SearchPage>('search_music', { query: 'All Time Greatest Classic Hits Throwback Anthems' })
            .then(r => r.songs || [])
            .catch(() => [])
        );
      }

      const enrichResults = await Promise.allSettled(queries);
      for (const res of enrichResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          for (let i = 0; i < res.value.length; i++) {
            const raw = res.value[i];
            if (raw && raw.id && !candidateMap.has(raw.id)) {
              candidateMap.set(raw.id, {
                song: { ...raw, thumb: this.sanitizeThumb(raw.thumb) },
                score: Math.max(5, 30 - i)
              });
            }
          }
        }
      }
    }

    // Sort by Nostalgia Score
    const sorted = Array.from(candidateMap.values())
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.song);

    return {
      songs: sorted.slice(0, 50),
      continuationToken: null
    };
  }
}

export const nostalgiaService = new NostalgiaService();
