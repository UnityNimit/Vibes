import { invoke } from '@tauri-apps/api/core';
import type { Song } from './types';

class LikedStore {
  songs = $state<Song[]>([]);
  isLoading = $state<boolean>(false);
  likedSet = $derived(new Set<string>(this.songs.map((s) => s.id)));

  constructor() {
    if (typeof window !== 'undefined') {
      setTimeout(() => this.refresh(), 50);
    }
  }

  async refresh() {
    this.isLoading = true;
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        this.songs = await invoke<Song[]>('get_liked_songs');
      }
    } catch (e) {
      console.error('Failed to load liked songs:', e);
    } finally {
      this.isLoading = false;
    }
  }

  isLiked(id: string): boolean {
    return this.likedSet.has(id);
  }

  async toggleLike(song: Song): Promise<boolean> {
    try {
      const isNowLiked = await invoke<boolean>('toggle_like', { song });
      await this.refresh();
      // Dynamically import feedStore to avoid circular module initialization
      const { feedStore } = await import('./feedStore.svelte');
      feedStore.recordLike(song, isNowLiked);
      return isNowLiked;
    } catch (e) {
      console.error('Failed to toggle like:', e);
      return false;
    }
  }
}

export const likedStore = new LikedStore();
