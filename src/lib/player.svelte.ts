import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Song, StreamResult, LyricLine, PlaybackContext, PlaybackSourceType } from './types';
import { parseDurationToSeconds } from './utils';
import { settings } from './settings.svelte';
import { savedStore } from './savedStore.svelte';
import { likedStore } from './likedStore.svelte';
import { feedStore } from './feedStore.svelte';

class PlayerState {
  currentSong = $state<Song | null>(null);
  isPlaying = $state<boolean>(false);
  currentTime = $state<number>(0);
  duration = $state<number>(0);
  volume = $state<number>(0.8);
  isMuted = $state<boolean>(false);
  isCached = $state<boolean>(false);
  isDownloading = $state<boolean>(false);
  isLiked = $state<boolean>(false);
  isLoading = $state<boolean>(false);

  // Playback Context Architecture
  currentContext = $state<PlaybackContext>({
    type: 'search',
    title: 'Search & Explore',
    songs: [],
  });

  queue = $state<Song[]>([]);
  queueIndex = $state<number>(-1);
  repeatMode = $state<'off' | 'one' | 'shuffle'>('off');

  get isShuffle(): boolean {
    return this.repeatMode === 'shuffle';
  }

  showLyrics = $state<boolean>(false);
  lyrics = $state<{ synced: string | null; plain: string | null }>({ synced: null, plain: null });
  parsedLyrics = $state<LyricLine[]>([]);
  activeLyricIndex = $state<number>(-1);
  isLoadingLyrics = $state<boolean>(false);

  audio: HTMLAudioElement | null = null;
  onPlaybackChange: ((type: 'play' | 'pause' | 'seek', payload: any) => void) | null = null;
  jamDelegate: {
    isGuest: () => boolean;
    getClockOffset?: () => number;
    getHardwareCalibration?: () => number;
    onUserPlay?: (song: Song, context?: PlaybackContext) => boolean;
    onUserToggle?: () => boolean;
    onUserNext?: () => boolean;
    onUserPrev?: () => boolean;
    onUserSeek?: (pos: number) => boolean;
    onUserAddQueue?: (song: Song) => boolean;
    onHostQueueChanged?: (queue: Song[], index: number) => void;
  } | null = null;

  // Ultra-fast in-memory stream cache & lookahead pre-fetcher
  private streamCache = new Map<string, { result: StreamResult; timestamp: number }>();
  private autoCachedCurrent = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedVol = localStorage.getItem('vibes_volume');
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed)) this.volume = Math.max(0, Math.min(1, parsed));
      }

      const savedMute = localStorage.getItem('vibes_muted');
      if (savedMute !== null) {
        this.isMuted = savedMute === 'true';
      }

      const savedRepeat = localStorage.getItem('vibes_repeat_mode');
      if (savedRepeat === 'off' || savedRepeat === 'one' || savedRepeat === 'shuffle') {
        this.repeatMode = savedRepeat;
      } else if (savedRepeat === 'all') {
        this.repeatMode = 'shuffle';
      } else {
        const savedShuffle = localStorage.getItem('vibes_shuffle');
        if (savedShuffle === 'true') {
          this.repeatMode = 'shuffle';
        }
      }

      this.initAudio();
      this.initMediaBridge();
      listen<string>('cache-updated', (event) => {
        if (this.currentSong && event.payload === this.currentSong.id) {
          this.isCached = true;
        }
      });
    }
  }

  private initAudio() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio) {
        this.currentTime = this.audio.currentTime;
        this.updateActiveLyric();

        // 1. Delayed auto-cache: only starts after 15s of uninterrupted listening
        if (!this.autoCachedCurrent && this.currentTime >= 15 && settings.autoSave && !this.isCached && this.currentSong) {
          this.autoCachedCurrent = true;
          invoke('trigger_auto_cache', { song: this.currentSong }).catch(() => {});
        }

        // 2. Queue lookahead prefetch when approaching end of song
        if (this.duration > 0 && this.currentTime >= this.duration - 15) {
          if (this.queueIndex >= 0 && this.queueIndex + 1 < this.queue.length) {
            this.prefetchStream(this.queue[this.queueIndex + 1]);
          }
        }
      }
    });

    this.audio.addEventListener('durationchange', () => {
      if (this.audio && !isNaN(this.audio.duration)) {
        this.duration = this.audio.duration;
        this.syncMediaNotification('metadata');
      }
    });

    this.audio.addEventListener('playing', () => {
      this.isPlaying = true;
      this.isLoading = false;
      if (this.currentSong) {
        feedStore.recordPlay(this.currentSong);
      }
      this.syncMediaNotification('state');
      // Predictive prefetch of next track in queue for instant 0ms transition
      if (this.queueIndex >= 0 && this.queueIndex + 1 < this.queue.length) {
        this.prefetchStream(this.queue[this.queueIndex + 1]);
      }
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.syncMediaNotification('state');
    });

    this.audio.addEventListener('waiting', () => {
      this.isLoading = true;
    });

    this.audio.addEventListener('canplay', () => {
      this.isLoading = false;
    });

    this.audio.addEventListener('ended', () => {
      this.handleSongEnd();
    });

    this.audio.addEventListener('error', (e) => {
      const audioErr = this.audio?.error;
      console.error('[Audio Error]', e, 'Code:', audioErr?.code, 'Message:', audioErr?.message);
      this.isLoading = false;
      this.isPlaying = false;
    });
  }

  private updateActiveLyric() {
    if (this.parsedLyrics.length === 0) {
      if (this.activeLyricIndex !== -1) {
        this.activeLyricIndex = -1;
      }
      return;
    }
    const ct = this.currentTime;
    let idx = -1;
    for (let i = 0; i < this.parsedLyrics.length; i++) {
      if (ct >= this.parsedLyrics[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    if (this.activeLyricIndex !== idx) {
      this.activeLyricIndex = idx;
    }
  }

  private parseLyrics(synced: string): LyricLine[] {
    const lines = synced.split('\n');
    const result: LyricLine[] = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const fraction = parseFloat('0.' + match[3]);
        const time = minutes * 60 + seconds + fraction;
        const text = match[4].trim();
        if (text) {
          result.push({ time, text });
        }
      }
    }
    return result;
  }

  async prefetchStream(song: Song | null | undefined) {
    if (!song || !song.id) return;
    if (savedStore.isSaved(song.id)) return;
    const cached = this.streamCache.get(song.id);
    if (cached && Date.now() - cached.timestamp < 3.5 * 60 * 60 * 1000) {
      return;
    }
    try {
      const res = await invoke<StreamResult>('prefetch_stream', { song });
      this.streamCache.set(song.id, { result: res, timestamp: Date.now() });
    } catch {
      // Background prefetch ignore
    }
  }

  async play(
    song: Song,
    context?: { type: PlaybackSourceType; title: string; playlistId?: string; songs?: Song[] },
    startIndex?: number,
    fromSync = false,
    syncTargetHostTime?: number,
    syncStartPosition?: number
  ) {
    if (!fromSync && this.jamDelegate?.isGuest()) {
      const intercepted = this.jamDelegate.onUserPlay?.(
        song,
        context
          ? {
              type: context.type,
              title: context.title,
              playlistId: context.playlistId,
              songs: context.songs || [song],
            }
          : undefined
      );
      if (intercepted) return;
    }

    if (!this.audio) this.initAudio();
    if (!this.audio) return;

    // Update context & queue if explicitly provided
    if (context) {
      const songsList = context.songs && context.songs.length > 0 ? [...context.songs] : [song];
      this.currentContext = {
        type: context.type,
        title: context.title,
        playlistId: context.playlistId,
        songs: songsList,
      };
      this.queue = songsList;
      if (startIndex !== undefined && startIndex >= 0 && startIndex < songsList.length) {
        this.queueIndex = startIndex;
      } else {
        const foundIdx = this.queue.findIndex((s) => s.id === song.id);
        this.queueIndex = foundIdx !== -1 ? foundIdx : 0;
      }
      if (!fromSync) {
        this.jamDelegate?.onHostQueueChanged?.(this.queue, this.queueIndex);
      }
    } else {
      // Retain current context & queue
      const existingIdx = this.queue.findIndex((s) => s.id === song.id);
      if (existingIdx !== -1) {
        this.queueIndex = existingIdx;
      } else {
        this.queue.push(song);
        this.queueIndex = this.queue.length - 1;
        if (this.currentContext.type === 'search') {
          this.currentContext.songs.push(song);
        }
      }
      if (!fromSync) {
        this.jamDelegate?.onHostQueueChanged?.(this.queue, this.queueIndex);
      }
    }

    // Check if clicked the same song
    if (this.currentSong?.id === song.id && this.audio.src) {
      this.audio.play();
      this.isPlaying = true;
      this.syncMediaNotification('state');
      return;
    }

    this.currentSong = song;
    this.syncMediaNotification('metadata');
    this.isLoading = true;
    this.autoCachedCurrent = false;
    this.currentTime = 0;
    this.duration = 0;
    this.activeLyricIndex = -1;
    this.parsedLyrics = [];
    this.lyrics = { synced: null, plain: null };

    // Initialize cached status from local saved store & liked status from liked store
    this.isCached = savedStore.isSaved(song.id);
    this.isLiked = likedStore.isLiked(song.id);

    // Fetch lyrics in background
    this.isLoadingLyrics = true;
    invoke<{ synced: string | null; plain: string | null }>('get_song_lyrics', {
      title: song.title,
      artist: song.artist,
      durationSecs: null
    }).then(res => {
      this.lyrics = res;
      if (res.synced) {
        this.parsedLyrics = this.parseLyrics(res.synced);
      }
      this.isLoadingLyrics = false;
    }).catch(err => {
      console.log('Lyrics not found:', err);
      this.isLoadingLyrics = false;
    });

    try {
      // 1. Check ultra-fast in-memory stream cache
      let streamRes: StreamResult | null = null;
      const cached = this.streamCache.get(song.id);
      if (cached && Date.now() - cached.timestamp < 3.5 * 60 * 60 * 1000) {
        streamRes = cached.result;
      }

      if (!streamRes) {
        streamRes = await invoke<StreamResult>('get_stream', { 
          song, 
          autoSave: false 
        });
        this.streamCache.set(song.id, { result: streamRes, timestamp: Date.now() });
      }

      this.isCached = streamRes.is_cached;

      if (streamRes.is_cached && streamRes.local_path) {
        // High-performance Range-enabled native asset streaming
        this.audio.src = convertFileSrc(streamRes.local_path);
      } else {
        // Direct stream from Google CDN
        this.audio.src = streamRes.url;
      }

      if (fromSync && syncTargetHostTime !== undefined) {
        const offset = this.jamDelegate?.getClockOffset?.() || 0;
        const cal = this.jamDelegate?.getHardwareCalibration?.() || 0;
        const hostNow = performance.now() + offset;
        const elapsedSec = Math.max(0, (hostNow - syncTargetHostTime - cal) / 1000);
        const targetPos = (syncStartPosition || 0) + elapsedSec;
        this.audio.currentTime = targetPos;
        this.currentTime = targetPos;
      }

      await this.audio.play();
      this.isPlaying = true;
      if (!fromSync && this.onPlaybackChange && this.currentSong) {
        this.onPlaybackChange('play', { song: this.currentSong, context: this.currentContext, position: 0 });
      }
    } catch (err) {
      console.error('Failed to get stream:', err);
      this.isLoading = false;
    }
  }

  playQueue(
    songs: Song[],
    startIndex = 0,
    context?: { type: PlaybackSourceType; title: string; playlistId?: string }
  ) {
    if (!songs || songs.length === 0) return;
    const validIdx = Math.max(0, Math.min(startIndex, songs.length - 1));
    this.play(
      songs[validIdx],
      {
        type: context?.type ?? 'search',
        title: context?.title ?? 'Queue',
        playlistId: context?.playlistId,
        songs,
      },
      validIdx
    );
  }

  togglePlay() {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserToggle?.()) return;
    }
    if (!this.audio || !this.currentSong) return;
    if (this.isPlaying) {
      this.audio.pause();
      if (this.onPlaybackChange) {
        this.onPlaybackChange('pause', { position: this.currentTime });
      }
    } else {
      this.audio.play();
      if (this.onPlaybackChange) {
        this.onPlaybackChange('play', { song: this.currentSong, context: this.currentContext, position: this.currentTime });
      }
    }
  }

  seek(seconds: number, fromSync = false) {
    if (!fromSync && this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserSeek?.(seconds)) return;
    }
    if (!this.audio) return;
    this.audio.currentTime = seconds;
    this.currentTime = seconds;
    this.syncMediaNotification('state');
    if (!fromSync && this.onPlaybackChange) {
      this.onPlaybackChange('seek', { position: seconds });
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_volume', String(this.volume));
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audio) {
      this.audio.muted = this.isMuted;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_muted', String(this.isMuted));
    }
  }

  async toggleLike() {
    if (!this.currentSong) return;
    const newState = await likedStore.toggleLike(this.currentSong);
    this.isLiked = newState;
  }

  async toggleDownload() {
    if (!this.currentSong || this.isDownloading) return;

    if (this.isCached || savedStore.isSaved(this.currentSong.id)) {
      try {
        await invoke('delete_cache', { id: this.currentSong.id });
        this.isCached = false;
        await savedStore.refresh();
      } catch (err) {
        console.error('Failed to remove cache:', err);
      }
      return;
    }

    this.isDownloading = true;
    try {
      await invoke('download_song', { song: this.currentSong });
      this.isCached = true;
      await savedStore.refresh();
    } catch (err) {
      console.error('Failed to download song:', err);
    } finally {
      this.isDownloading = false;
    }
  }

  addToQueue(song: Song) {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserAddQueue?.(song)) return;
    }
    const exists = this.queue.some((s) => s.id === song.id);
    if (!exists) {
      this.queue.push(song);
      if (this.queue.length === 1 && !this.currentSong) {
        this.play(song);
      } else {
        this.jamDelegate?.onHostQueueChanged?.(this.queue, this.queueIndex);
      }
    }
  }

  setQueueFromSync(newQueue: Song[], newIndex: number) {
    this.queue = newQueue;
    this.queueIndex = newIndex;
  }

  next() {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserNext?.()) return;
    }
    if (this.queue.length === 0) return;
    if (this.isShuffle) {
      if (this.queue.length === 1) {
        this.seek(0);
        this.audio?.play();
        return;
      }
      let nextIdx = Math.floor(Math.random() * this.queue.length);
      if (nextIdx === this.queueIndex) {
        nextIdx = (nextIdx + 1) % this.queue.length;
      }
      this.play(this.queue[nextIdx]);
    } else if (this.queueIndex < this.queue.length - 1) {
      this.play(this.queue[this.queueIndex + 1]);
    }
  }

  prev() {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserPrev?.()) return;
    }
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }
    if (this.isShuffle && this.queue.length > 1) {
      let prevIdx = Math.floor(Math.random() * this.queue.length);
      if (prevIdx === this.queueIndex) {
        prevIdx = (prevIdx + this.queue.length - 1) % this.queue.length;
      }
      this.play(this.queue[prevIdx]);
    } else if (this.queueIndex > 0) {
      this.play(this.queue[this.queueIndex - 1]);
    } else {
      this.seek(0);
    }
  }

  private handleSongEnd() {
    if (this.jamDelegate?.isGuest()) {
      // Guest lets Host orchestrate track progression
      return;
    }
    if (this.repeatMode === 'one') {
      this.seek(0);
      this.audio?.play();
    } else {
      this.next();
    }
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') this.repeatMode = 'one';
    else if (this.repeatMode === 'one') this.repeatMode = 'shuffle';
    else this.repeatMode = 'off';
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_repeat_mode', this.repeatMode);
      localStorage.setItem('vibes_shuffle', String(this.repeatMode === 'shuffle'));
    }
  }

  toggleShuffle() {
    this.repeatMode = this.repeatMode === 'shuffle' ? 'off' : 'shuffle';
    if (typeof window !== 'undefined') {
      localStorage.setItem('vibes_repeat_mode', this.repeatMode);
      localStorage.setItem('vibes_shuffle', String(this.repeatMode === 'shuffle'));
    }
  }

  private initMediaBridge() {
    if (typeof window === 'undefined') return;

    // Direct bridge for Native Android MediaSession and Notification controls
    (window as any).__onAndroidMediaAction = (action: string, arg?: number) => {
      if (action === 'play') {
        if (!this.isPlaying) this.togglePlay();
      } else if (action === 'pause') {
        if (this.isPlaying) this.togglePlay();
      } else if (action === 'toggle') {
        this.togglePlay();
      } else if (action === 'next') {
        this.next();
      } else if (action === 'prev') {
        this.prev();
      } else if (action === 'seek' && typeof arg === 'number') {
        this.seek(arg);
      }
    };

    // Standard web navigator.mediaSession (Supports Windows SMTC & desktop media hotkeys)
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (!this.isPlaying) this.togglePlay();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          if (this.isPlaying) this.togglePlay();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          this.prev();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          this.next();
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            this.seek(details.seekTime);
          }
        });
      } catch (e) {
        console.warn('Navigator mediaSession registration error:', e);
      }
    }
  }

  syncMediaNotification(type: 'metadata' | 'state') {
    if (typeof window === 'undefined') return;

    let durationSec = this.duration || 0;
    if (!durationSec && this.currentSong?.duration) {
      durationSec = parseDurationToSeconds(this.currentSong.duration);
    }

    // 1. Sync standard navigator.mediaSession
    if ('mediaSession' in navigator && this.currentSong) {
      try {
        if (type === 'metadata') {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: this.currentSong.title,
            artist: this.currentSong.artist,
            artwork: this.currentSong.thumb
              ? [{ src: this.currentSong.thumb, sizes: '512x512', type: 'image/jpeg' }]
              : []
          });
        }
        navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';
      } catch (_) {}
    }

    // 2. Sync native Android Foreground Media Notification & MediaSession
    const bridge = (window as any).AndroidMediaNotification;
    if (bridge && this.currentSong) {
      try {
        if (type === 'metadata') {
          bridge.updateMetadata(
            this.currentSong.title,
            this.currentSong.artist,
            this.currentSong.thumb || '',
            durationSec
          );
        }
        bridge.updatePlaybackState(this.isPlaying, this.currentTime || 0);
      } catch (err) {
        console.error('[AndroidMediaBridge] Notification update failed:', err);
      }
    }
  }
}

export const player = new PlayerState();
