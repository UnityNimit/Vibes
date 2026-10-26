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
  private allPersonalCandidates: Song[] = [];
  private classicsQueries: string[] = [];
  private classicsQueryIndex = 0;

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

      // Qualify if song was repeated (plays >= 2) OR explicitly liked OR downloaded offline
      // Or even single-play history (will be scored lower, forming the deeper memory archive)
      let score = Math.min(120, plays * 12);

      // Explicit User Commitment
      if (isLiked) score += 40;
      if (isSaved) score += 35;

      // Nostalgic Time Curve (The "Haven't heard this in a few days" dopamine kick)
      const lastPlayed = historyMap.get(song.id)?.playedAt || 0;
      if (lastPlayed > 0) {
        const daysAgo = (Date.now() - lastPlayed) / (1000 * 60 * 60 * 24);
        if (daysAgo >= 2 && daysAgo <= 45) {
          score += Math.min(35, daysAgo * 3);
        } else if (daysAgo < 0.1) {
          // Just played within last 2 hours: slight cooldown
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

    // Prepare infinite throwback queries
    const topArtists = tasteProfile.getTopArtists(5);
    const classics: string[] = [];
    for (const a of topArtists) {
      classics.push(`${a} Greatest Hits Classics`);
      classics.push(`${a} Essential Anthems`);
    }
    classics.push(
      '2010s Nostalgia Pop Throwback Hits',
      '2000s Classic Nostalgia Anthems',
      '90s Greatest Classic Anthems',
      'All Time Greatest Classic Hits Throwback'
    );
    this.classicsQueries = classics;
    this.classicsQueryIndex = 0;

    // Sort all personal candidates by Nostalgia Score
    const sorted = Array.from(candidateMap.values())
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.song);

    this.allPersonalCandidates = sorted;

    return {
      songs: sorted.slice(0, 30),
      continuationToken: null
    };
  }

  /**
   * Infinite Loader for "Your Old Ones":
   * 1. First streams remaining personal favorites from user's full history & liked archive.
   * 2. Once personal archive is fully rendered, seamlessly branches into favorite artists'
   *    greatest classics & all-time nostalgic anthems!
   */
  async fetchMoreOld(
    currentToken: string | null,
    existingSongIds: Set<string>
  ): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const newSongs: Song[] = [];
    let nextToken: string | null = currentToken;

    // Phase 1: Check if unrendered songs exist in personal candidate archive
    for (const s of this.allPersonalCandidates) {
      if (!existingSongIds.has(s.id)) {
        existingSongIds.add(s.id);
        newSongs.push(s);
        if (newSongs.length >= 15) {
          return { songs: newSongs, continuationToken: null };
        }
      }
    }

    // Phase 2: If we had a web continuation token, try that
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

    // Phase 3: Query favorite artists classics and nostalgic decade hits
    let attempts = 0;
    while (newSongs.length < 15 && attempts < 3) {
      attempts++;
      if (this.classicsQueries.length === 0) {
        this.classicsQueries = [
          '2010s Nostalgia Pop Throwback Hits',
          '2000s Classic Nostalgia Anthems',
          '90s Greatest Classic Anthems',
          'All Time Greatest Classic Hits Throwback'
        ];
      }

      const query = this.classicsQueries[this.classicsQueryIndex % this.classicsQueries.length];
      this.classicsQueryIndex++;

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
}

export const nostalgiaService = new NostalgiaService();
