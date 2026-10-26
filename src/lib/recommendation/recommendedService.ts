import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import { tasteProfile } from './tasteProfile.svelte';
import { likedStore } from '../likedStore.svelte';
import { savedStore } from '../savedStore.svelte';
import { getCircadianInfo } from './circadian';

interface ScoredCandidate {
  song: Song;
  score: number;
  seedHits: number;
}

type InfiniteSeed =
  | { type: 'song'; id: string; title: string; artist: string }
  | { type: 'query'; query: string };

export class RecommendedService {
  private recentTopIds = new Set<string>();
  private infiniteSeedQueue: InfiniteSeed[] = [];
  private seedQueueIndex = 0;

  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  /**
   * Weighted random sampling helper.
   * Higher weight = higher probability of selection.
   */
  private weightedSample<T>(items: { item: T; weight: number }[]): T | null {
    if (items.length === 0) return null;
    const totalWeight = items.reduce((acc, curr) => acc + Math.max(0.1, curr.weight), 0);
    let rand = Math.random() * totalWeight;
    for (const entry of items) {
      rand -= Math.max(0.1, entry.weight);
      if (rand <= 0) return entry.item;
    }
    return items[0].item;
  }

  /**
   * Dynamically gathers diverse, high-affinity seeds across:
   * - Weighted random sampling of top played songs in history
   * - Recent listening trajectory (last 10 played tracks)
   * - Random liked songs
   * - Random saved / offline tracks
   * - Top favorite artists
   */
  private pickDiverseSeeds(): { seeds: Song[]; unusedSeeds: InfiniteSeed[] } {
    const seeds: Song[] = [];
    const usedIds = new Set<string>();
    const unusedSeeds: InfiniteSeed[] = [];

    const addSeed = (s?: Song | null): boolean => {
      if (!s || !s.id || usedIds.has(s.id)) return false;
      usedIds.add(s.id);
      seeds.push(s);
      return true;
    };

    const allHistory = tasteProfile.history || [];

    // 1. Weighted random pick from Top 15 most-played songs (prevents #1 song lock-in!)
    if (allHistory.length > 0) {
      const topPlayed = [...allHistory]
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 15);
      
      const weightedList = topPlayed.map(h => ({
        item: h.song,
        weight: Math.sqrt(h.playCount) + Math.random() * 2
      }));

      const chosenTop = this.weightedSample(weightedList);
      if (chosenTop) addSeed(chosenTop);

      // Save others as secondary infinite seeds
      for (const h of topPlayed) {
        if (h.song && !usedIds.has(h.song.id)) {
          unusedSeeds.push({
            type: 'song',
            id: h.song.id,
            title: h.song.title,
            artist: h.song.artist
          });
        }
      }
    }

    // 2. Recent listening trajectory (from last 10 played songs)
    const recentPlays = allHistory.slice(0, 10).map(h => h.song);
    if (recentPlays.length > 0) {
      const randomRecent = recentPlays[Math.floor(Math.random() * recentPlays.length)];
      if (randomRecent) addSeed(randomRecent);
    }

    // 3. Random Liked track
    const liked = likedStore.songs || [];
    if (liked.length > 0) {
      const randomLiked = liked[Math.floor(Math.random() * liked.length)];
      if (randomLiked) addSeed(randomLiked);

      // Queue other liked songs for infinite scrolling
      for (const s of liked) {
        if (!usedIds.has(s.id)) {
          unusedSeeds.push({ type: 'song', id: s.id, title: s.title, artist: s.artist });
        }
      }
    }

    // 4. Random Saved / Offline track
    const saved = savedStore.items || [];
    if (saved.length > 0) {
      const randomSaved = saved[Math.floor(Math.random() * saved.length)];
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

    // 5. Additional top artist radio seeds
    const topArtists = tasteProfile.getTopArtists(5);
    for (const art of topArtists) {
      unusedSeeds.push({ type: 'query', query: `${art} Radio Mix Hits` });
    }

    // Fill up to 4 seeds if still needed
    for (const h of allHistory) {
      if (seeds.length >= 4) break;
      addSeed(h.song);
    }

    // Shuffle unused seeds so infinite scrolling delivers varied discoveries
    for (let i = unusedSeeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unusedSeeds[i], unusedSeeds[j]] = [unusedSeeds[j], unusedSeeds[i]];
    }

    return { seeds, unusedSeeds };
  }

  /**
   * Generates a dynamic, continuously evolving recommended feed combining
   * multi-seed co-listening graphs, collaborative filtering, artist affinity weighting,
   * freshness jitter, and anti-repetition decay.
   */
  async generateRecommended(force = false): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const { seeds, unusedSeeds } = this.pickDiverseSeeds();
    this.infiniteSeedQueue = unusedSeeds;
    this.seedQueueIndex = 0;

    const candidateMap = new Map<string, ScoredCandidate>();
    const userTopArtists = new Set(tasteProfile.getTopArtists(8).map(a => a.toLowerCase()));
    const playCounts = tasteProfile.playCounts || {};

    let continuationToken: string | null = null;

    // A. Query YouTube Music co-listening graphs in parallel
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

      // Also query radio mix for a rotating top artist
      const topArtists = tasteProfile.getTopArtists(3);
      if (topArtists.length > 0) {
        const randomArtist = topArtists[Math.floor(Math.random() * topArtists.length)];
        queries.push(
          invoke<SearchPage>('search_music', { query: `${randomArtist} Radio Mix Hits` })
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
              existing.seedHits += 1;
              existing.score += 75;
            } else {
              // Base rank score
              let score = Math.max(10, 100 - rank * 3);

              // 1. Artist affinity boost
              const cleanArt = song.artist.toLowerCase();
              if (userTopArtists.has(cleanArt)) {
                score += 45;
              }

              // 2. Novelty balance
              const plays = playCounts[song.id] || 0;
              if (plays >= 4) {
                // Frequent repeat plays already live in "Your Old Ones"
                score -= 50;
              } else if (plays === 0) {
                // Fresh discovery bonus!
                score += 25;
              }

              // 3. Impression fatigue decay:
              // If this song was just in the top 10 last refresh, slightly cool it down
              // so other exceptional tracks get spotlight
              if (this.recentTopIds.has(song.id)) {
                score -= 25;
              }

              // 4. Dynamic exploration jitter:
              // Adds organic entropy so refreshes produce fresh rankings
              score += (Math.random() * 16 - 8);

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

    // B. Cold start or supplementary fallback if candidateMap has too few tracks (< 15)
    if (candidateMap.size < 15) {
      try {
        const circadian = getCircadianInfo();
        const coldStartPools: Record<string, string[]> = {
          early_morning: [
            'Sunrise Acoustic Warm Sunshine Chill 2026',
            'Morning Coffee Acoustic Melodies 2026',
            'Peaceful Morning Indie Folk 2026'
          ],
          morning: [
            'Deep Focus Productive Pop Energy Hits 2026',
            'Uplifting Melodic Hits 2026',
            'Morning Modern Pop Beats 2026'
          ],
          afternoon: [
            'Top Worldwide Viral Hits 2026',
            'Feel Good Modern Pop Anthems 2026',
            'Midday Trending Grooves 2026'
          ],
          evening: [
            'Sunset Golden Hour Indie R&B 2026',
            'Twilight Synthwave Melodies 2026',
            'Warm Evening Soul Acoustic 2026'
          ],
          late_night: [
            'Late Night Vibes Dark Pop Lo-Fi Melodies 2026',
            'Midnight Drive Chill R&B 2026',
            'Atmospheric Midnight Lo-Fi Beats 2026'
          ]
        };

        const pool = coldStartPools[circadian.period] || coldStartPools.afternoon;
        const selectedQuery = pool[Math.floor(Math.random() * pool.length)];

        const fallbackRes = await invoke<SearchPage>('search_music', { query: selectedQuery });
        if (fallbackRes && fallbackRes.songs) {
          if (!continuationToken) continuationToken = fallbackRes.continuation_token ?? null;
          for (let i = 0; i < fallbackRes.songs.length; i++) {
            const s = fallbackRes.songs[i];
            if (!candidateMap.has(s.id)) {
              candidateMap.set(s.id, {
                song: { ...s, thumb: this.sanitizeThumb(s.thumb) },
                score: 50 - i + (Math.random() * 10 - 5),
                seedHits: 1
              });
            }
          }
        }
      } catch (_) {}
    }

    // C. Sort candidates by final score
    const scoredList = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);

    // D. Harmonious Interleaving & Anti-Clustering (max 2 consecutive by same artist)
    const finalSongs: Song[] = [];
    const remaining = [...scoredList];
    let lastArtist = '';
    let consecutiveArtistCount = 0;

    while (remaining.length > 0 && finalSongs.length < 50) {
      let pickIndex = 0;
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

    // Track top 12 impressions for next refresh's anti-fatigue cycle
    this.recentTopIds = new Set(finalSongs.slice(0, 12).map(s => s.id));

    return {
      songs: finalSongs,
      continuationToken
    };
  }

  /**
   * Seamless Infinite Loader for Recommended section.
   * 1. Consumes current YouTube continuation token if available.
   * 2. When continuation token expires, seamlessly pops the next seed from the infinite
   *    seed queue (user's history, liked songs, favorite artists radio, circadian pools)
   *    and queries fresh similar songs or radio mixes.
   */
  async fetchNextBatch(
    existingSongIds: Set<string>,
    currentToken: string | null
  ): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const newSongs: Song[] = [];
    let nextToken: string | null = currentToken;

    // Phase 1: Try YouTube continuation token if available
    if (nextToken) {
      try {
        const page: SearchPage = await invoke<SearchPage>('get_more_similar_songs', {
          continuationToken: nextToken
        });
        if (page && page.songs && page.songs.length > 0) {
          for (const raw of page.songs) {
            if (!existingSongIds.has(raw.id)) {
              existingSongIds.add(raw.id);
              newSongs.push({ ...raw, thumb: this.sanitizeThumb(raw.thumb) });
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

    // Phase 2: Refill infinite seed queue if running dry
    if (this.seedQueueIndex >= this.infiniteSeedQueue.length) {
      const topArtists = tasteProfile.getTopArtists(8);
      const fallbackSeeds: InfiniteSeed[] = [];
      for (const a of topArtists) {
        fallbackSeeds.push({ type: 'query', query: `${a} Radio Mix Hits 2026` });
        fallbackSeeds.push({ type: 'query', query: `Songs like ${a} Trending` });
      }
      fallbackSeeds.push(
        { type: 'query', query: 'Global Viral Breakthrough Hits 2026' },
        { type: 'query', query: 'Top Modern Pop & R&B Melodies' },
        { type: 'query', query: 'Essential Chill Acoustic Songs' },
        { type: 'query', query: 'Synthwave & Electronic Vibes 2026' }
      );
      // Shuffle
      for (let i = fallbackSeeds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fallbackSeeds[i], fallbackSeeds[j]] = [fallbackSeeds[j], fallbackSeeds[i]];
      }
      this.infiniteSeedQueue.push(...fallbackSeeds);
    }

    // Phase 3: Pop next seed from queue and query fresh tracks
    let attempts = 0;
    while (newSongs.length < 15 && this.seedQueueIndex < this.infiniteSeedQueue.length && attempts < 3) {
      attempts++;
      const seed = this.infiniteSeedQueue[this.seedQueueIndex++];

      try {
        let page: SearchPage | null = null;
        if (seed.type === 'song') {
          page = await invoke<SearchPage>('get_similar_songs', { videoId: seed.id });
        } else {
          page = await invoke<SearchPage>('search_music', { query: seed.query });
        }

        if (page && page.songs) {
          nextToken = page.continuation_token ?? null;
          for (const raw of page.songs) {
            if (!existingSongIds.has(raw.id)) {
              existingSongIds.add(raw.id);
              newSongs.push({ ...raw, thumb: this.sanitizeThumb(raw.thumb) });
            }
          }
        }
      } catch (_) {}
    }

    return {
      songs: newSongs,
      continuationToken: nextToken
    };
  }
}

export const recommendedService = new RecommendedService();
