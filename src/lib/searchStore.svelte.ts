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

  async search(searchQuery?: string) {
    const q = (searchQuery ?? this.query).trim();
    if (!q) return;
    this.query = q;
    this.isSearching = true;
    this.hasSearched = true;
    this.continuationToken = null;

    feedStore.recordSearch(q);

    try {
      const page = await invoke<SearchPage>('search_music', { query: q });
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
