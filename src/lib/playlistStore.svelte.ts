import { invoke } from '@tauri-apps/api/core';
import { navigationStore } from './navigationStore.svelte';
import type { Playlist, Song } from './types';

class PlaylistStore {
  playlists = $state<Playlist[]>([]);
  isLoading = $state<boolean>(false);
  selectedPlaylistId = $state<string | null>(null);

  constructor() {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        try {
          if ((window as any).__TAURI_INTERNALS__) {
            this.refresh();
          }
        } catch (_) {}
      }, 50);
    }
  }

  async refresh() {
    this.isLoading = true;
    try {
      this.playlists = await invoke<Playlist[]>('get_playlists');
    } catch (e) {
      console.error('Failed to load playlists:', e);
    } finally {
      this.isLoading = false;
    }
  }

  async create(name: string): Promise<Playlist | null> {
    const clean = name.trim();
    if (!clean) return null;
    try {
      const pl = await invoke<Playlist>('create_playlist', { name: clean });
      await this.refresh();
      navigationStore.showToastNotification(`Created playlist "${clean}"`);
      return pl;
    } catch (e) {
      console.error('Failed to create playlist:', e);
      return null;
    }
  }

  async importFromUrl(url: string): Promise<Playlist | null> {
    const clean = url.trim();
    if (!clean) return null;
    this.isLoading = true;
    try {
      const pl = await invoke<Playlist>('import_external_playlist', { url: clean });
      await this.refresh();
      navigationStore.showToastNotification(`Imported "${pl.name}" (${pl.songs.length} tracks)`);
      return pl;
    } catch (e: any) {
      console.error('Failed to import playlist:', e);
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  async delete(id: string) {
    try {
      const pl = this.playlists.find((p) => p.id === id);
      const plName = pl?.name ?? 'playlist';
      await invoke('delete_playlist', { id });
      await this.refresh();
      navigationStore.showToastNotification(`Deleted "${plName}"`);
    } catch (e) {
      console.error('Failed to delete playlist:', e);
    }
  }

  async rename(id: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    try {
      await invoke('rename_playlist', { id, name: clean });
      await this.refresh();
      navigationStore.showToastNotification(`Renamed to "${clean}"`);
    } catch (e) {
      console.error('Failed to rename playlist:', e);
    }
  }

  async toggleSong(playlistId: string, song: Song): Promise<boolean> {
    try {
      const pl = this.playlists.find((p) => p.id === playlistId);
      const plName = pl?.name ?? 'playlist';
      const added = await invoke<boolean>('toggle_in_playlist', { playlistId, song });
      await this.refresh();
      navigationStore.showToastNotification(added ? `Added to "${plName}"` : `Removed from "${plName}"`);
      return added;
    } catch (e) {
      console.error('Failed to toggle song in playlist:', e);
      return false;
    }
  }

  async removeSong(playlistId: string, songId: string) {
    try {
      const pl = this.playlists.find((p) => p.id === playlistId);
      const plName = pl?.name ?? 'playlist';
      await invoke('remove_from_playlist', { playlistId, songId });
      await this.refresh();
      navigationStore.showToastNotification(`Removed from "${plName}"`);
    } catch (e) {
      console.error('Failed to remove song from playlist:', e);
    }
  }

  isSongInPlaylist(playlistId: string, songId: string): boolean {
    const pl = this.playlists.find((p) => p.id === playlistId);
    return pl ? pl.songs.some((s) => s.id === songId) : false;
  }

  isSongInAnyPlaylist(songId: string): boolean {
    if (!songId) return false;
    return this.playlists.some((p) => p.songs.some((s) => s.id === songId));
  }
}

export const playlistStore = new PlaylistStore();
