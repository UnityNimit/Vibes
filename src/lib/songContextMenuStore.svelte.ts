import { playlistStore } from './playlistStore.svelte';
import { likedStore } from './likedStore.svelte';
import { player } from './player.svelte';
import { navigationStore } from './navigationStore.svelte';
import type { Song } from './types';

class SongContextMenuStore {
  isOpen = $state<boolean>(false);
  song = $state<Song | null>(null);
  position = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  isTouch = $state<boolean>(false);
  isCreating = $state<boolean>(false);
  newPlaylistName = $state<string>('');

  open(song: Song, opts?: { x?: number; y?: number; isTouch?: boolean }) {
    this.song = song;
    this.position = { x: opts?.x ?? 0, y: opts?.y ?? 0 };
    this.isTouch = opts?.isTouch ?? false;
    this.isCreating = false;
    this.newPlaylistName = '';
    this.isOpen = true;

    // Ensure latest playlists from backend
    playlistStore.refresh();
  }

  close() {
    this.isOpen = false;
    this.song = null;
    this.isCreating = false;
    this.newPlaylistName = '';
  }

  async togglePlaylist(playlistId: string) {
    if (!this.song) return;
    await playlistStore.toggleSong(playlistId, this.song);
  }

  async createPlaylist(): Promise<void> {
    const name = this.newPlaylistName.trim();
    if (!name || !this.song) return;
    const pl = await playlistStore.create(name);
    if (pl && this.song) {
      await playlistStore.toggleSong(pl.id, this.song);
    }
    this.newPlaylistName = '';
    this.isCreating = false;
  }

  async toggleLike() {
    if (!this.song) return;
    await likedStore.toggleLike(this.song);
    if (player.currentSong?.id === this.song.id) {
      player.isLiked = likedStore.isLiked(this.song.id);
    }
  }

  addToQueue() {
    if (!this.song) return;
    player.addToUserQueue(this.song);
    navigationStore.showToastNotification('Added to queue');
    this.close();
  }

  playNext() {
    if (!this.song) return;
    player.playNext(this.song);
    navigationStore.showToastNotification('Playing next');
    this.close();
  }

  playNow() {
    if (!this.song) return;
    player.play(this.song);
    this.close();
  }
}

export const songContextMenuStore = new SongContextMenuStore();

/**
 * Svelte Action to attach right-click (desktop) and hold/long-press (mobile)
 * to any song item across any song list.
 */
export function songContextMenu(node: HTMLElement, song: Song) {
  let currentSong = song;
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let didLongPress = false;
  let suppressClickUntil = 0;

  function clearTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleContextMenu(e: MouseEvent) {
    if (!currentSong) return;
    e.preventDefault();
    e.stopPropagation();
    songContextMenuStore.open(currentSong, {
      x: e.clientX,
      y: e.clientY,
      isTouch: false
    });
  }

  function handleTouchStart(e: TouchEvent) {
    if (!currentSong || e.touches.length !== 1) {
      clearTimer();
      return;
    }
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    didLongPress = false;
    clearTimer();

    // 400ms threshold for intentional long press
    longPressTimer = setTimeout(() => {
      didLongPress = true;
      suppressClickUntil = Date.now() + 500;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(25);
        } catch (_) {}
      }
      songContextMenuStore.open(currentSong, {
        x: touchStartX,
        y: touchStartY,
        isTouch: true
      });
    }, 400);
  }

  function handleTouchMove(e: TouchEvent) {
    if (!longPressTimer || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    // If finger moves more than 8px, user is scrolling: cancel long press immediately
    if (Math.hypot(dx, dy) > 8) {
      clearTimer();
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    clearTimer();
    if (didLongPress) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      suppressClickUntil = Date.now() + 500;
      didLongPress = false;
    }
  }

  function handleTouchCancel() {
    clearTimer();
    didLongPress = false;
  }

  function handleClickCapture(e: MouseEvent) {
    // If long press just fired, suppress synthetic click so song isn't played
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }

  node.addEventListener('contextmenu', handleContextMenu);
  node.addEventListener('touchstart', handleTouchStart, { passive: true });
  node.addEventListener('touchmove', handleTouchMove, { passive: true });
  node.addEventListener('touchend', handleTouchEnd);
  node.addEventListener('touchcancel', handleTouchCancel);
  node.addEventListener('click', handleClickCapture, true);

  return {
    update(newSong: Song) {
      currentSong = newSong;
    },
    destroy() {
      clearTimer();
      node.removeEventListener('contextmenu', handleContextMenu);
      node.removeEventListener('touchstart', handleTouchStart);
      node.removeEventListener('touchmove', handleTouchMove);
      node.removeEventListener('touchend', handleTouchEnd);
      node.removeEventListener('touchcancel', handleTouchCancel);
      node.removeEventListener('click', handleClickCapture, true);
    }
  };
}
