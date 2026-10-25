import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import { tasteProfile } from './tasteProfile.svelte';
import { likedStore } from '../likedStore.svelte';
import { savedStore } from '../savedStore.svelte';
import { resolveEffectiveCountryCode, detectLocalRegionCode } from './location';

interface ScoredDiscovery {
  song: Song;
  score: number;
}

export class DiscoveryService {
  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  /**
   * Generates a super-addictive "New to You" discovery feed.
   * Features genuine fresh drops from favorite artists & breakthrough releases,
   * strictly filtering out any track the user has already played, liked, or saved.
   */
  async generateNewToYou(force = false): Promise<{ songs: Song[]; continuationToken: string | null }> {
    // 1. Compile strict novelty blocklist
    const playedIds = new Set<string>(Object.keys(tasteProfile.playCounts));
    for (const h of tasteProfile.history) {
      if (h.song?.id) playedIds.add(h.song.id);
    }
    for (const s of likedStore.songs || []) {
      if (s.id) playedIds.add(s.id);
    }
    for (const i of savedStore.items || []) {
      if (i.id) playedIds.add(i.id);
    }

    const topArtists = tasteProfile.getTopArtists(6);
    const topArtistsLower = new Set(topArtists.map(a => a.toLowerCase()));
    const countryCode = detectLocalRegionCode();

    const candidateMap = new Map<string, ScoredDiscovery>();
    let continuationToken: string | null = null;

    const queries: Promise<Song[]>[] = [];

    // Source A: Official YouTube Music Explore New Releases (Fresh drops)
    queries.push(
      invoke<Song[]>('get_new_releases', { countryCode: countryCode || null })
        .then(songs => songs || [])
        .catch(() => [])
    );

    // Source B: Targeted fresh singles from user's top affinity artists
    for (const artist of topArtists.slice(0, 3)) {
      queries.push(
        invoke<SearchPage>('search_music', { query: `${artist} Latest New Single Official 2026` })
          .then(res => {
            if (res && res.continuation_token && !continuationToken) {
              continuationToken = res.continuation_token;
            }
            return res.songs || [];
          })
          .catch(() => [])
      );
    }

    // Source C: Breakthrough new discoveries matching taste vibe
    const discoveryQuery = topArtists.length > 0
      ? `${topArtists.slice(0, 2).join(' ')} New Music Discovery Breakthrough 2026`
      : 'Breakthrough New Music Hits Global 2026';

    queries.push(
      invoke<SearchPage>('search_music', { query: discoveryQuery })
        .then(res => res.songs || [])
        .catch(() => [])
    );

    const results = await Promise.allSettled(queries);

    for (const res of results) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        for (let rank = 0; rank < res.value.length; rank++) {
          const rawSong = res.value[rank];
          if (!rawSong || !rawSong.id) continue;

          // STRICT NOVELTY: If user has heard/liked/saved this song, skip completely!
          if (playedIds.has(rawSong.id)) continue;

          const song: Song = {
            ...rawSong,
            thumb: this.sanitizeThumb(rawSong.thumb)
          };

          const existing = candidateMap.get(song.id);
          if (existing) {
            existing.score += 40;
          } else {
            let score = Math.max(10, 90 - rank * 3);

            // High boost if by an artist the user loves
            const cleanArt = song.artist.toLowerCase();
            if (topArtistsLower.has(cleanArt)) {
              score += 65;
            } else {
              // Partial artist match (e.g. features or collaborations)
              for (const a of topArtistsLower) {
                if (cleanArt.includes(a)) {
                  score += 35;
                  break;
                }
              }
            }

            candidateMap.set(song.id, { song, score });
          }
        }
      }
    }

    // Fallback if candidate pool is too small (< 12)
    if (candidateMap.size < 12) {
      try {
        const fallback = await invoke<SearchPage>('search_music', { query: 'Top New Releases Breakthrough Worldwide' });
        if (fallback && fallback.songs) {
          for (const s of fallback.songs) {
            if (!playedIds.has(s.id) && !candidateMap.has(s.id)) {
              candidateMap.set(s.id, {
                song: { ...s, thumb: this.sanitizeThumb(s.thumb) },
                score: 30
              });
            }
          }
        }
      } catch (_) {}
    }

    // Sort candidates by Discovery Score
    const sorted = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);

    // Harmonious Interleaving (anti-clustering: max 2 songs by same artist in a row)
    const finalSongs: Song[] = [];
    const remaining = [...sorted];
    let lastArtist = '';
    let consecutiveCount = 0;

    while (remaining.length > 0 && finalSongs.length < 50) {
      let pickIndex = 0;
      for (let i = 0; i < remaining.length; i++) {
        const a = remaining[i].song.artist.toLowerCase();
        if (a !== lastArtist || consecutiveCount < 2) {
          pickIndex = i;
          break;
        }
      }

      const [chosen] = remaining.splice(pickIndex, 1);
      const chosenArtist = chosen.song.artist.toLowerCase();

      if (chosenArtist === lastArtist) {
        consecutiveCount++;
      } else {
        lastArtist = chosenArtist;
        consecutiveCount = 1;
      }

      finalSongs.push(chosen.song);
    }

    return {
      songs: finalSongs,
      continuationToken
    };
  }
}

export const discoveryService = new DiscoveryService();
