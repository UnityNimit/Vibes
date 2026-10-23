import { invoke } from '@tauri-apps/api/core';
import type { Playlist, Song } from './types';

class PlaylistStore {
  playlists = $state<Playlist[]>([]);
  isLoading = $state<boolean>(false);

  constructor() {
    if (typeof window !== 'undefined') {
      this.refresh();
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
      return pl;
    } catch (e) {
      console.error('Failed to create playlist:', e);
      return null;
    }
  }

  async delete(id: string) {
    try {
      await invoke('delete_playlist', { id });
      await this.refresh();
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
    } catch (e) {
      console.error('Failed to rename playlist:', e);
    }
  }

  async toggleSong(playlistId: string, song: Song): Promise<boolean> {
    try {
      const added = await invoke<boolean>('toggle_in_playlist', { playlistId, song });
      await this.refresh();
      return added;
    } catch (e) {
      console.error('Failed to toggle song in playlist:', e);
      return false;
    }
  }

  async removeSong(playlistId: string, songId: string) {
    try {
      await invoke('remove_from_playlist', { playlistId, songId });
      await this.refresh();
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
