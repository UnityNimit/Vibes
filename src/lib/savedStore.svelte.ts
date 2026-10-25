import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CacheItem } from './types';

class SavedStore {
  items = $state<CacheItem[]>([]);
  savedMap = $derived(new Map<string, CacheItem>(this.items.map(i => [i.id, i])));

  constructor() {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.refresh();
        try {
          if ((window as any).__TAURI_INTERNALS__) {
            listen('cache-updated', () => {
              this.refresh();
            }).catch(() => {});
          }
        } catch (_) {}
      }, 50);
    }
  }

  async refresh() {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        this.items = await invoke<CacheItem[]>('get_all_cached');
      }
    } catch (e) {
      console.error('Failed to load saved items:', e);
    }
  }

  isSaved(id: string): boolean {
    return this.savedMap.has(id);
  }

  getSize(id: string): number | null {
    const item = this.savedMap.get(id);
    return item ? item.file_size_bytes : null;
  }
}

export const savedStore = new SavedStore();
