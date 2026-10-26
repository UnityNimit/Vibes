import { invoke } from '@tauri-apps/api/core';
import type { Song, SearchPage } from '../types';
import { tasteProfile } from './tasteProfile.svelte';
import { likedStore } from '../likedStore.svelte';
import { savedStore } from '../savedStore.svelte';
import { detectLocalRegionCode } from './location';

interface ScoredDiscovery {
  song: Song;
  score: number;
}

export class DiscoveryService {
  private discoveryQueries: string[] = [];
  private queryIndex = 0;

  private sanitizeThumb(url?: string): string {
    if (!url) return '';
    if (url.includes('/maxresdefault.jpg')) {
      return url.replace('/maxresdefault.jpg', '/hq720.jpg');
    }
    return url;
  }

  /**
   * Compiles strict novelty blocklist:
   * Any track user has played, liked, or saved is strictly excluded from "New to You".
   */
  private getNoveltyBlocklist(): Set<string> {
    const playedIds = new Set<string>(Object.keys(tasteProfile.playCounts || {}));
    for (const h of tasteProfile.history || []) {
      if (h.song?.id) playedIds.add(h.song.id);
    }
    for (const s of likedStore.songs || []) {
      if (s.id) playedIds.add(s.id);
    }
    for (const i of savedStore.items || []) {
      if (i.id) playedIds.add(i.id);
    }
    return playedIds;
  }

  /**
   * Generates a super-addictive "New to You" discovery feed.
   * Features genuine fresh drops from favorite artists & breakthrough releases,
   * strictly filtering out any track the user has already played, liked, or saved.
   */
  async generateNewToYou(force = false): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const playedIds = this.getNoveltyBlocklist();
    const topArtists = tasteProfile.getTopArtists(8);
    const topArtistsLower = new Set(topArtists.map(a => a.toLowerCase()));
    const countryCode = detectLocalRegionCode();

    const candidateMap = new Map<string, ScoredDiscovery>();
    let continuationToken: string | null = null;

    // Prepare infinite discovery queries for this and subsequent pagination
    const baseQueries: string[] = [];
    for (const artist of topArtists.slice(3)) {
      baseQueries.push(`${artist} Latest Single New Music 2026`);
    }
    baseQueries.push(
      'Indie Breakthrough New Music 2026',
      'Fresh Alternative Pop Drops 2026',
      'Emerging Underground R&B Soul 2026',
      'New Electronic Dance Releases 2026',
      'New Acoustic Folk Singer Songwriter 2026',
      'Fresh Melodic Hip Hop Drops 2026',
      'Global Breakthrough Emerging Artists 2026'
    );
    // Shuffle
    for (let i = baseQueries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baseQueries[i], baseQueries[j]] = [baseQueries[j], baseQueries[i]];
    }
    this.discoveryQueries = baseQueries;
    this.queryIndex = 0;

    const queries: Promise<Song[]>[] = [];

    // Source A: Official YouTube Music Explore New Releases (Fresh drops)
    queries.push(
      invoke<Song[]>('get_new_releases', { countryCode: countryCode || null })
        .then(songs => songs || [])
        .catch(() => [])
    );

    // Source B: Targeted fresh singles from user's top 3 affinity artists
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
        const fallback = await invoke<SearchPage>('search_music', {
          query: 'Top New Releases Breakthrough Worldwide 2026'
        });
        if (fallback && fallback.songs) {
          if (!continuationToken) continuationToken = fallback.continuation_token ?? null;
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

  /**
   * Infinite Loader for New to You discovery carousel:
   * 1. Consumes continuation token if present.
   * 2. When continuation token expires, rotates to the next fresh discovery stream
   *    (favorite artists' latest singles, emerging genres, underground gems),
   *    filtering strictly against songs the user has already played/liked/saved!
   */
  async fetchMoreNew(
    currentToken: string | null,
    existingSongIds: Set<string>
  ): Promise<{ songs: Song[]; continuationToken: string | null }> {
    const playedIds = this.getNoveltyBlocklist();
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
            if (!playedIds.has(s.id) && !existingSongIds.has(s.id)) {
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

    // Phase 2: Advance to next discovery query
    let attempts = 0;
    while (newSongs.length < 15 && attempts < 3) {
      attempts++;
      if (this.discoveryQueries.length === 0) {
        this.discoveryQueries = [
          'Indie Breakthrough New Music 2026',
          'Fresh Alternative Pop Drops 2026',
          'Emerging Underground R&B Soul 2026',
          'New Electronic Dance Releases 2026',
          'New Acoustic Folk Singer Songwriter 2026',
          'Fresh Melodic Hip Hop Drops 2026'
        ];
      }

      const query = this.discoveryQueries[this.queryIndex % this.discoveryQueries.length];
      this.queryIndex++;

      try {
        const page: SearchPage = await invoke<SearchPage>('search_music', { query });
        if (page && page.songs) {
          nextToken = page.continuation_token ?? null;
          for (const s of page.songs) {
            if (!playedIds.has(s.id) && !existingSongIds.has(s.id)) {
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

export const discoveryService = new DiscoveryService();
