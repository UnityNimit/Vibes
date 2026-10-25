import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import { tasteProfile } from './tasteProfile.svelte';
import { likedStore } from '../likedStore.svelte';
import { savedStore } from '../savedStore.svelte';

interface ScoredCandidate {
  song: Song;
  score: number;
  seedHits: number;
}

export class RecommendedService {
  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  /**
   * Gathers up to 4-5 diverse, high-affinity seeds across:
   * - All-time most played songs in history
   * - Most recent repeat plays
   * - Liked tracks
   * - Saved/downloaded offline tracks
   */
  private pickDiverseSeeds(): Song[] {
    const seeds: Song[] = [];
    const usedIds = new Set<string>();

    const addSeed = (s?: Song | null) => {
      if (!s || !s.id || usedIds.has(s.id)) return;
      usedIds.add(s.id);
      seeds.push(s);
    };

    // 1. All-time highest played song
    const allHistory = tasteProfile.history;
    if (allHistory.length > 0) {
      const topPlayed = [...allHistory].sort((a, b) => b.playCount - a.playCount);
      addSeed(topPlayed[0]?.song);
    }

    // 2. Loved track from Liked songs
    const liked = likedStore.songs || [];
    if (liked.length > 0) {
      // Pick a random liked song from top 10
      const randomLiked = liked[Math.floor(Math.random() * Math.min(10, liked.length))];
      addSeed(randomLiked);
    }

    // 3. Recent repeat obsession (played recently with > 1 plays)
    const recentRepeats = allHistory
      .slice(0, 15)
      .filter(h => h.playCount >= 2 && !usedIds.has(h.song.id));
    if (recentRepeats.length > 0) {
      addSeed(recentRepeats[0].song);
    }

    // 4. Saved/Offline track with high affinity
    const saved = savedStore.items || [];
    if (saved.length > 0) {
      const randomSaved = saved[Math.floor(Math.random() * Math.min(10, saved.length))];
      if (randomSaved) {
        addSeed({
          id: randomSaved.id,
          title: randomSaved.title,
          artist: randomSaved.artist,
          album: randomSaved.album,
          duration: randomSaved.duration,
          thumb: randomSaved.thumb
        });
      }
    }

    // 5. Fallback seed from history if we still have < 3 seeds
    for (const h of allHistory) {
      if (seeds.length >= 4) break;
      addSeed(h.song);
    }

    return seeds;
  }

  /**
   * Generates a super-addictive recommended feed combining multi-seed co-listening graphs,
   * collaborative filtering, view counts, and artist affinity weighting.
   */
  async generateRecommended(force = false): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const seeds = this.pickDiverseSeeds();
    const candidateMap = new Map<string, ScoredCandidate>();
    const userTopArtists = new Set(tasteProfile.getTopArtists(8).map(a => a.toLowerCase()));
    const playCounts = tasteProfile.playCounts || {};

    let continuationToken: string | null = null;

    // A. If user has listening history seeds: query YouTube Music co-listening graphs in parallel
    if (seeds.length > 0) {
      const queries = seeds.map(async (seed, index) => {
        try {
          const res = await invoke<SearchPage>('get_similar_songs', { videoId: seed.id });
          if (res && res.songs) {
            // Save token from primary top seed
            if (index === 0 && res.continuation_token) {
              continuationToken = res.continuation_token;
            }
            return res.songs;
          }
        } catch (_) {}
        return [];
      });

      // Also query radio mix for top artist
      const topArtists = tasteProfile.getTopArtists(2);
      if (topArtists.length > 0) {
        queries.push(
          invoke<SearchPage>('search_music', { query: `${topArtists[0]} Radio Mix Hits` })
            .then(r => r.songs || [])
            .catch(() => [])
        );
      }

      const results = await Promise.allSettled(queries);

      for (const res of results) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          for (let rank = 0; rank < res.value.length; rank++) {
            const rawSong = res.value[rank];
            if (!rawSong || !rawSong.id) continue;

            const song: Song = {
              ...rawSong,
              thumb: this.sanitizeThumb(rawSong.thumb)
            };

            const existing = candidateMap.get(song.id);
            if (existing) {
              // High co-occurrence boost: Song appeared in multiple seed radios!
              // People who like different songs in user's history ALL listen to this track.
              existing.seedHits += 1;
              existing.score += 80;
            } else {
              // Base score by position rank (top tracks in radio have higher YouTube watch probability)
              let score = Math.max(10, 100 - rank * 3);

              // 1. Artist affinity boost
              const cleanArt = song.artist.toLowerCase();
              if (userTopArtists.has(cleanArt)) {
                score += 45;
              }

              // 2. Novelty balance:
              // Songs played >= 4 times are penalized so Recommended stays fresh
              // (frequent plays already live in "Your Old Ones")
              const plays = playCounts[song.id] || 0;
              if (plays >= 4) {
                score -= 60;
              } else if (plays === 0) {
                // Fresh discovery bonus!
                score += 25;
              }

              candidateMap.set(song.id, {
                song,
                score,
                seedHits: 1
              });
            }
          }
        }
      }
    }

    // B. Cold start fallback if candidateMap has too few tracks (< 15)
    if (candidateMap.size < 15) {
      try {
        const fallbackRes = await invoke<SearchPage>('search_music', {
          query: 'Top Viral Hits Global Music 2026'
        });
        if (fallbackRes && fallbackRes.songs) {
          if (!continuationToken) continuationToken = fallbackRes.continuation_token ?? null;
          for (let i = 0; i < fallbackRes.songs.length; i++) {
            const s = fallbackRes.songs[i];
            if (!candidateMap.has(s.id)) {
              candidateMap.set(s.id, {
                song: { ...s, thumb: this.sanitizeThumb(s.thumb) },
                score: 50 - i,
                seedHits: 1
              });
            }
          }
        }
      } catch (_) {}
    }

    // C. Sort candidates by Addiction Score
    const scoredList = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);

    // D. Harmonious Interleaving & Artist Anti-Clustering
    // Prevent more than 2 consecutive songs by the exact same artist for seamless flow
    const finalSongs: Song[] = [];
    const remaining = [...scoredList];
    let lastArtist = '';
    let consecutiveArtistCount = 0;

    while (remaining.length > 0 && finalSongs.length < 50) {
      let pickIndex = 0;

      // Find first candidate that doesn't violate consecutive artist threshold
      for (let i = 0; i < remaining.length; i++) {
        const candidateArtist = remaining[i].song.artist.toLowerCase();
        if (candidateArtist !== lastArtist || consecutiveArtistCount < 2) {
          pickIndex = i;
          break;
        }
      }

      const [chosen] = remaining.splice(pickIndex, 1);
      const chosenArtist = chosen.song.artist.toLowerCase();

      if (chosenArtist === lastArtist) {
        consecutiveArtistCount++;
      } else {
        lastArtist = chosenArtist;
        consecutiveArtistCount = 1;
      }

      finalSongs.push(chosen.song);
    }

    return {
      songs: finalSongs,
      continuationToken
    };
  }
}

export const recommendedService = new RecommendedService();
