import { invoke } from '@tauri-apps/api/core';
import { feedStore } from './feedStore.svelte';
import { player } from './player.svelte';
import type { SearchPage, Song } from './types';

class SearchStore {
  query = $state<string>('');
  results = $state<Song[]>([]);
  continuationToken = $state<string | null>(null);
  hasSearched = $state<boolean>(false);
  isSearching = $state<boolean>(false);
  isLoadingMore = $state<boolean>(false);
  scrollTop = $state<number>(0);

  // High-performance in-memory search query LRU cache (0ms instant repeat searches)
  private queryCache = new Map<string, { page: SearchPage; timestamp: number }>();
  private pendingSearches = new Map<string, Promise<SearchPage>>();
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;

  // Horizontal scroll offsets for explore carousels
  carouselScrolls = $state<{
    recommended: number;
    trending: number;
    new: number;
    old: number;
  }>({
    recommended: 0,
    trending: 0,
    new: 0,
    old: 0,
  });

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('vibes:network-online', () => {
        if (this.hasSearched && this.results.length === 0 && this.query.trim()) {
          console.log('[SearchStore] Auto-retrying search upon network reconnection:', this.query);
          this.search(this.query);
        }
      });
    }
  }

  onQueryInput(val: string) {
    this.query = val;
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
    const trimmed = val.trim();
    if (trimmed.length >= 2) {
      this.prefetchTimer = setTimeout(() => {
        this.prefetch(trimmed);
      }, 260);
    }
  }

  prefetch(queryToPrefetch: string) {
    const q = queryToPrefetch.trim();
    if (!q) return;
    const cacheKey = q.toLowerCase();
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return;
    }
    if (this.pendingSearches.has(cacheKey)) {
      return;
    }

    const p = invoke<SearchPage>('search_music', { query: q })
      .then((page) => {
        if (this.queryCache.size >= 50) {
          const oldestKey = this.queryCache.keys().next().value;
          if (oldestKey) this.queryCache.delete(oldestKey);
        }
        this.queryCache.set(cacheKey, { page, timestamp: Date.now() });
        this.pendingSearches.delete(cacheKey);
        return page;
      })
      .catch((e) => {
        this.pendingSearches.delete(cacheKey);
        throw e;
      });

    this.pendingSearches.set(cacheKey, p);
  }

  async search(searchQuery?: string) {
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
    const q = (searchQuery ?? this.query).trim();
    if (!q) return;
    this.query = q;
    this.isSearching = true;
    this.hasSearched = true;
    this.continuationToken = null;

    feedStore.recordSearch(q);

    const cacheKey = q.toLowerCase();
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      this.results = cached.page.songs || [];
      this.continuationToken = cached.page.continuation_token ?? null;
      this.scrollTop = 0;
      this.isSearching = false;
      if (this.results.length > 0) player.prefetchStream(this.results[0]);
      if (this.results.length > 1) player.prefetchStream(this.results[1]);
      return;
    }

    try {
      let page: SearchPage;
      if (this.pendingSearches.has(cacheKey)) {
        page = await this.pendingSearches.get(cacheKey)!;
      } else {
        page = await invoke<SearchPage>('search_music', { query: q });
        if (this.queryCache.size >= 50) {
          const oldestKey = this.queryCache.keys().next().value;
          if (oldestKey) this.queryCache.delete(oldestKey);
        }
        this.queryCache.set(cacheKey, { page, timestamp: Date.now() });
      }

      this.results = page.songs || [];
      this.continuationToken = page.continuation_token ?? null;
      this.scrollTop = 0;

      if (this.results.length > 0) player.prefetchStream(this.results[0]);
      if (this.results.length > 1) player.prefetchStream(this.results[1]);
    } catch (e) {
      console.error('Search error:', e);
      this.results = [];
    } finally {
      this.isSearching = false;
    }
  }

  async loadMore() {
    if (!this.continuationToken || this.isLoadingMore || this.isSearching) return;
    this.isLoadingMore = true;
    try {
      const existingIds = new Set(this.results.map((s) => s.id));
      let collected: Song[] = [];
      let token: string | null = this.continuationToken;
      let depth = 0;

      while (token && collected.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existingIds.has(s.id)) {
            existingIds.add(s.id);
            collected.push(s);
          }
        }
      }

      if (collected.length > 0) {
        this.results = [...this.results, ...collected];
      }
      this.continuationToken = token;
    } catch (e) {
      console.error('Load more search error:', e);
    } finally {
      this.isLoadingMore = false;
    }
  }

  clear() {
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
    this.query = '';
    this.results = [];
    this.continuationToken = null;
    this.hasSearched = false;
    this.isSearching = false;
    this.isLoadingMore = false;
    this.scrollTop = 0;
  }
}

export const searchStore = new SearchStore();
