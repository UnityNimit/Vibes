import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Song, StreamResult, LyricLine, PlaybackContext, PlaybackSourceType, SearchPage } from './types';
import { parseDurationToSeconds, cleanArtistName, getHighQualityThumbCandidates } from './utils';
import { settings } from './settings.svelte';
import { savedStore } from './savedStore.svelte';
import { likedStore } from './likedStore.svelte';
import { feedStore } from './feedStore.svelte';
import { networkStore } from './networkStore.svelte';

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
  userQueue = $state<Song[]>([]);
  isUserQueuePlaying = $state<boolean>(false);
  repeatMode = $state<'off' | 'one' | 'shuffle'>('off');

  get isShuffle(): boolean {
    return this.repeatMode === 'shuffle';
  }

  showLyrics = $state<boolean>(false);
  lyrics = $state<{ synced: string | null; plain: string | null }>({ synced: null, plain: null });
  parsedLyrics = $state<LyricLine[]>([]);
  activeLyricIndex = $state<number>(-1);
  isLoadingLyrics = $state<boolean>(false);

  // Similar Songs Radio Queue (for continuous playback when playing from search)
  similarSongs = $state<Song[]>([]);
  similarContinuationToken = $state<string | null>(null);
  isLoadingSimilar = $state<boolean>(false);
  isLoadingMoreSimilar = $state<boolean>(false);
  private similarPromise: Promise<void> | null = null;

  audio: HTMLAudioElement | null = null;
  onPlaybackChange: ((type: 'play' | 'pause' | 'seek', payload: any) => void) | null = null;
  jamDelegate: {
    isGuest: () => boolean;
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
  private listenedSeconds = 0;
  private lastTimeUpdate = 0;
  private currentBlobUrl: string | null = null;
  private isRecoveringStream = false;
  private recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastKnownPosition = 0;
  private stalledCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private wasPlayingBeforeInterruption = false;

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

      window.addEventListener('online', () => {
        console.log('[Player Network] Online event');
        if (this.currentSong && !this.isCached) {
          if (this.isLoading || this.wasPlayingBeforeInterruption || (!this.isPlaying && this.lastKnownPosition > 0)) {
            console.log('[Player Network] Auto-recovering interrupted stream at position', this.lastKnownPosition);
            this.recoverStreamPlayback(this.lastKnownPosition);
          }
        }
        if (this.currentSong && (!this.lyrics.synced && !this.lyrics.plain)) {
          this.fetchLyrics(this.currentSong);
        }
      });

      window.addEventListener('offline', () => {
        console.warn('[Player Network] Offline event');
        if (this.isPlaying) {
          this.wasPlayingBeforeInterruption = true;
          this.lastKnownPosition = this.currentTime;
        }
      });

      window.addEventListener('vibes:network-online', () => {
        if (this.currentSong && !this.isCached && (this.isLoading || this.wasPlayingBeforeInterruption)) {
          this.recoverStreamPlayback(this.lastKnownPosition || this.currentTime);
        }
      });
      try {
        if ((window as any).__TAURI_INTERNALS__) {
          listen<string>('cache-updated', async () => {
            await savedStore.refresh();
            if (this.currentSong) {
              this.isCached = savedStore.isSaved(this.currentSong.id);
            }
          }).catch(() => {});
        }
      } catch (_) {}
    }
  }

  private initAudio() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio) {
        const now = this.audio.currentTime;
        const dt = now - this.lastTimeUpdate;
        this.lastTimeUpdate = now;

        // If audio was progressing forward normally, accumulate listened time
        if (dt > 0 && dt < 2.5 && !this.audio.paused) {
          this.listenedSeconds += dt;
        }

        this.currentTime = now;
        if (now > 0) {
          this.lastKnownPosition = now;
        }
        this.updateActiveLyric();

        // 1. Automatic download only happens when the complete song has been listened to
        // (listened to >= 85% of total song duration AND arrived at the very end of the track)
        if (
          !this.autoCachedCurrent &&
          settings.autoSave &&
          !this.isCached &&
          this.currentSong &&
          this.duration > 5 &&
          this.listenedSeconds >= this.duration * 0.85 &&
          this.currentTime >= this.duration - 1.5
        ) {
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
      this.wasPlayingBeforeInterruption = false;
      this.clearStallWatchdog();
      if (this.audio && !isNaN(this.audio.currentTime) && this.audio.currentTime > 0) {
        this.lastKnownPosition = this.audio.currentTime;
      }
      if (this.currentSong) {
        feedStore.recordPlay(this.currentSong);
      }
      this.syncMediaNotification('state');
      // Predictive prefetch of next track in queue for instant 0ms transition
      if (this.userQueue.length > 0) {
        this.prefetchStream(this.userQueue[0]);
      } else if (this.queueIndex >= 0 && this.queueIndex + 1 < this.queue.length) {
        this.prefetchStream(this.queue[this.queueIndex + 1]);
      }
    });

    this.audio.addEventListener('pause', () => {
      if (!this.isRecoveringStream) {
        this.isPlaying = false;
      }
      this.syncMediaNotification('state');
    });

    this.audio.addEventListener('waiting', () => {
      this.isLoading = true;
      this.armStallWatchdog();
    });

    this.audio.addEventListener('stalled', () => {
      this.isLoading = true;
      this.armStallWatchdog();
    });

    this.audio.addEventListener('canplay', () => {
      this.isLoading = false;
      this.clearStallWatchdog();
    });

    this.audio.addEventListener('ended', () => {
      this.handleSongEnd();
    });

    this.audio.addEventListener('error', async (e) => {
      const audioErr = this.audio?.error;
      console.error('[Audio Error]', e, 'Code:', audioErr?.code, 'Message:', audioErr?.message);
      this.clearStallWatchdog();

      // 1. If local asset playback fails, try loading direct bytes into a Blob URL
      if (this.currentSong && this.isCached && !this.currentBlobUrl) {
        try {
          const bytes = await invoke<number[]>('get_cached_audio_bytes', { videoId: this.currentSong.id });
          if (bytes && bytes.length > 0) {
            const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/mp4' });
            this.currentBlobUrl = URL.createObjectURL(blob);
            if (this.audio) {
              const pos = this.currentTime || this.lastKnownPosition;
              this.audio.src = this.currentBlobUrl;
              if (pos > 0) this.audio.currentTime = pos;
              await this.audio.play();
              this.isPlaying = true;
              this.isLoading = false;
              return;
            }
          }
        } catch (blobErr) {
          console.warn('[Cache Blob Recovery Failed]', blobErr);
        }
      }

      // 2. Automatic seamless stream recovery from same position
      if (this.currentSong) {
        console.warn('[Audio Recovery] Error on audio element. Seamlessly recovering from', this.currentTime || this.lastKnownPosition);
        this.wasPlayingBeforeInterruption = true;
        this.recoverStreamPlayback(this.currentTime || this.lastKnownPosition);
      } else {
        this.isLoading = false;
        this.isPlaying = false;
      }
    });
  }

  // Precision lead-time offset (compensates for audio buffer latency, vocal attack lead, and visual transition easing)
  private readonly LYRIC_OFFSET = 0.25;

  private updateActiveLyricWithPos(cur: number) {
    if (this.parsedLyrics.length === 0) {
      if (this.activeLyricIndex !== -1) {
        this.activeLyricIndex = -1;
      }
      return;
    }
    const ct = cur + this.LYRIC_OFFSET;
    const len = this.parsedLyrics.length;

    // Fast-path O(1): check current active line and immediate next line
    const curr = this.activeLyricIndex;
    if (curr >= 0 && curr < len) {
      const currTime = this.parsedLyrics[curr].time;
      const nextTime = curr + 1 < len ? this.parsedLyrics[curr + 1].time : Infinity;
      if (ct >= currTime && ct < nextTime) {
        return; // Still in current lyric line, zero allocation or loop
      }
      if (curr + 1 < len && ct >= nextTime) {
        const nextNextTime = curr + 2 < len ? this.parsedLyrics[curr + 2].time : Infinity;
        if (ct < nextNextTime) {
          this.activeLyricIndex = curr + 1;
          return;
        }
      }
    }

    // Binary search fallback for track skips or seeks: O(log n)
    let low = 0;
    let high = len - 1;
    let idx = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.parsedLyrics[mid].time <= ct) {
        idx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (this.activeLyricIndex !== idx) {
      this.activeLyricIndex = idx;
    }
  }

  private updateActiveLyric() {
    this.updateActiveLyricWithPos(this.currentTime);
  }

  tickLyricSync() {
    if (this.audio && this.isPlaying && this.parsedLyrics.length > 0) {
      const cur = this.audio.currentTime;
      this.updateActiveLyricWithPos(cur);
      // Throttle reactive Svelte 5 currentTime rune updates to ~12Hz (every ~80ms)
      // This completely eliminates high-frequency layout re-renders on 60Hz/120Hz screens
      if (Math.abs(cur - this.currentTime) >= 0.08) {
        this.currentTime = cur;
      }
    }
  }

  private parseLyrics(synced: string): LyricLine[] {
    const lines = synced.split('\n');
    const result: LyricLine[] = [];
    let offsetMs = 0;

    // 1. Detect [offset: +/-ms] metadata tag
    for (const line of lines) {
      const offsetMatch = line.match(/\[offset:\s*([+-]?\d+)\]/i);
      if (offsetMatch) {
        offsetMs = parseInt(offsetMatch[1], 10) || 0;
        break;
      }
    }

    const offsetSecs = offsetMs / 1000;
    const timestampRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip LRC metadata tags like [ar:...], [ti:...], [offset:...]
      if (/^\[(ti|ar|al|au|by|offset|length|re|ve):/i.test(trimmed)) {
        continue;
      }

      // 2. Support multiple timestamps per line (e.g. [00:12.30][00:45.10]Chorus line)
      const timestamps: number[] = [];
      let lastMatchIndex = 0;
      let match: RegExpExecArray | null;

      timestampRegex.lastIndex = 0;
      while ((match = timestampRegex.exec(trimmed)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        let fraction = 0;
        if (match[3]) {
          if (match[3].length === 1) {
            fraction = parseInt(match[3], 10) / 10;
          } else if (match[3].length === 2) {
            fraction = parseInt(match[3], 10) / 100;
          } else {
            fraction = parseInt(match[3].slice(0, 3), 10) / 1000;
          }
        }
        const time = Math.max(0, minutes * 60 + seconds + fraction - offsetSecs);
        timestamps.push(time);
        lastMatchIndex = timestampRegex.lastIndex;
      }

      if (timestamps.length > 0) {
        const text = trimmed.slice(lastMatchIndex).trim();
        for (const time of timestamps) {
          result.push({ time, text });
        }
      }
    }

    // 3. Sort ascending by time
    result.sort((a, b) => a.time - b.time);
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

  async loadSimilarQueue(songId: string) {
    if (!songId) return;
    this.isLoadingSimilar = true;
    this.similarContinuationToken = null;
    const currentPromise = (async () => {
      try {
        const res = await invoke<SearchPage>('get_similar_songs', { videoId: songId });
        const recs = (res.songs || []).filter((s) => s.id !== songId);
        this.similarSongs = recs;
        this.similarContinuationToken = res.continuation_token ?? null;

        // If in 'search' context and currently playing this song, queue the recommendations
        if (this.currentContext.type === 'search' && this.currentSong?.id === songId) {
          this.queue = [this.currentSong, ...recs];
          this.queueIndex = 0;
          this.currentContext.songs = [...this.queue];
          if (!this.jamDelegate?.isGuest()) {
            this.jamDelegate?.onHostQueueChanged?.(this.queue, this.queueIndex);
          }
        }

        // Prefetch stream for the very next recommended track
        if (recs.length > 0) {
          this.prefetchStream(recs[0]);
        }
      } catch (err) {
        console.error('[Similar Queue Error]', err);
        this.similarSongs = [];
      } finally {
        this.isLoadingSimilar = false;
      }
    })();
    this.similarPromise = currentPromise;
    await currentPromise;
  }

  async loadMoreSimilar() {
    if (!this.similarContinuationToken || this.isLoadingMoreSimilar || this.isLoadingSimilar) return;
    this.isLoadingMoreSimilar = true;
    try {
      const existing = new Set(this.queue.map((s) => s.id));
      let collected: Song[] = [];
      let token: string | null = this.similarContinuationToken;
      let depth = 0;

      while (token && collected.length < 16 && depth < 3) {
        depth++;
        const res: SearchPage = await invoke<SearchPage>('get_more_similar_songs', { continuationToken: token });
        token = res.continuation_token ?? null;
        for (const s of res.songs) {
          if (!existing.has(s.id)) {
            existing.add(s.id);
            collected.push(s);
          }
        }
      }

      if (collected.length > 0) {
        this.similarSongs = [...this.similarSongs, ...collected];
        if (this.currentContext.type === 'search') {
          this.queue = [...this.queue, ...collected];
          this.currentContext.songs = [...this.queue];
          if (!this.jamDelegate?.isGuest()) {
            this.jamDelegate?.onHostQueueChanged?.(this.queue, this.queueIndex);
          }
        }
      }
      this.similarContinuationToken = token;
    } catch (err) {
      console.error('[Load More Similar Error]', err);
    } finally {
      this.isLoadingMoreSimilar = false;
    }
  }

  async play(
    song: Song,
    context?: { type: PlaybackSourceType; title: string; playlistId?: string; songs?: Song[] },
    startIndex?: number,
    fromSync = false,
    syncStartPosition?: number,
    autoPlay = true,
    fromUserQueue = false
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
      this.isUserQueuePlaying = false;
      if (context.type === 'search') {
        // When played from search: Queue is seeded with current song and immediately populated with similar tracks!
        this.currentContext = {
          type: 'search',
          title: context.title || 'Search',
          songs: [song],
        };
        this.queue = [song];
        this.queueIndex = 0;
        this.loadSimilarQueue(song.id);
      } else {
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
      }
      if (!fromSync) {
        this.jamDelegate?.onHostQueueChanged?.(this.queue, this.queueIndex);
      }
    } else if (fromUserQueue) {
      this.isUserQueuePlaying = true;
      if (this.queue.length === 0) {
        this.queue = [song];
        this.queueIndex = 0;
      }
    } else {
      this.isUserQueuePlaying = false;
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
      if (this.audio.error || (this.isLoading && !this.isCached)) {
        this.recoverStreamPlayback(this.currentTime || this.lastKnownPosition);
        return;
      }
      if (syncStartPosition !== undefined && syncStartPosition > 0) {
        this.audio.currentTime = syncStartPosition;
        this.currentTime = syncStartPosition;
      }
      if (autoPlay) {
        this.audio.play().catch(() => {
          this.recoverStreamPlayback(this.currentTime || this.lastKnownPosition);
        });
        this.isPlaying = true;
      } else {
        this.audio.pause();
        this.isPlaying = false;
      }
      this.syncMediaNotification('state');
      if (!fromSync && this.onPlaybackChange) {
        this.onPlaybackChange(autoPlay ? 'play' : 'pause', {
          song: this.currentSong,
          context: this.currentContext,
          position: this.audio.currentTime,
        });
      }
      return;
    }

    const safeSong: Song = {
      id: song.id,
      title: song.title || 'Unknown Title',
      artist: song.artist || 'Unknown Artist',
      album: song.album || song.artist || '',
      duration: song.duration || '--:--',
      thumb: song.thumb || ''
    };

    this.currentSong = safeSong;
    this.syncMediaNotification('metadata');
    this.isLoading = true;
    this.autoCachedCurrent = false;
    this.listenedSeconds = 0;
    this.lastTimeUpdate = 0;
    this.currentTime = syncStartPosition && syncStartPosition > 0 ? syncStartPosition : 0;
    this.duration = 0;
    this.activeLyricIndex = -1;
    this.parsedLyrics = [];
    this.lyrics = { synced: null, plain: null };

    // Initialize cached status from local saved store & liked status from liked store
    this.isCached = savedStore.isSaved(safeSong.id);
    this.isLiked = likedStore.isLiked(safeSong.id);

    // Fetch lyrics in background
    this.fetchLyrics(safeSong);

    try {
      // 1. Check ultra-fast in-memory stream cache
      let streamRes: StreamResult | null = null;
      const cached = this.streamCache.get(safeSong.id);
      if (cached && Date.now() - cached.timestamp < 3.5 * 60 * 60 * 1000) {
        streamRes = cached.result;
      }

      if (!streamRes) {
        streamRes = await invoke<StreamResult>('get_stream', { 
          song: safeSong, 
          autoSave: false 
        });
        this.streamCache.set(safeSong.id, { result: streamRes, timestamp: Date.now() });
      }

      this.isCached = streamRes.is_cached;

      if (streamRes.is_cached) {
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
          this.currentBlobUrl = null;
        }
        if (streamRes.local_path) {
          this.audio.src = convertFileSrc(streamRes.local_path);
        } else {
          this.audio.src = streamRes.url;
        }
      } else {
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
          this.currentBlobUrl = null;
        }
        // Direct stream from Google CDN
        this.audio.src = streamRes.url;
      }

      if (syncStartPosition !== undefined && syncStartPosition > 0) {
        this.audio.currentTime = syncStartPosition;
        this.currentTime = syncStartPosition;
      }

      if (autoPlay) {
        try {
          await this.audio.play();
          this.isPlaying = true;
        } catch (playErr) {
          console.warn('[Audio Play Promise Rejected]', playErr);
          // If playback failed on a cached source, immediately recover via online stream
          if (this.isCached || this.currentBlobUrl) {
            this.isCached = false;
            if (this.currentBlobUrl) {
              URL.revokeObjectURL(this.currentBlobUrl);
              this.currentBlobUrl = null;
            }
            const freshRes = await invoke<StreamResult>('get_online_stream', { song });
            this.audio.src = freshRes.url;
            await this.audio.play();
            this.isPlaying = true;
          } else {
            throw playErr;
          }
        }
      } else {
        this.audio.pause();
        this.isPlaying = false;
      }

      this.syncMediaNotification('state');
      if (!fromSync && this.onPlaybackChange && this.currentSong) {
        this.onPlaybackChange('play', {
          song: this.currentSong,
          context: this.currentContext,
          position: this.currentTime,
        });
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

  pause(fromSync = false) {
    if (!fromSync && this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserToggle?.()) return;
    }
    if (!this.audio) return;
    this.audio.pause();
    this.isPlaying = false;
    this.syncMediaNotification('state');
    if (!fromSync && this.onPlaybackChange) {
      this.onPlaybackChange('pause', { position: this.currentTime });
    }
  }

  resume(fromSync = false) {
    if (!fromSync && this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserToggle?.()) return;
    }
    if (!this.audio || !this.currentSong) return;
    if (this.audio.error || (this.isLoading && !this.isCached)) {
      this.recoverStreamPlayback(this.currentTime || this.lastKnownPosition);
      return;
    }
    this.audio.play().catch((err) => {
      console.warn('Audio resume failed, recovering stream:', err);
      this.recoverStreamPlayback(this.currentTime || this.lastKnownPosition);
    });
    this.isPlaying = true;
    this.syncMediaNotification('state');
    if (!fromSync && this.onPlaybackChange) {
      this.onPlaybackChange('play', {
        song: this.currentSong,
        context: this.currentContext,
        position: this.currentTime,
      });
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.resume();
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

  addToUserQueue(song: Song) {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserAddQueue?.(song)) return;
    }
    if (!this.currentSong) {
      this.play(song);
      return;
    }
    this.userQueue.push(song);
    this.prefetchStream(song);
  }

  addToQueue(song: Song) {
    this.addToUserQueue(song);
  }

  playNext(song: Song) {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserAddQueue?.(song)) return;
    }
    if (!this.currentSong) {
      this.play(song);
      return;
    }
    const existingIdx = this.userQueue.findIndex((s) => s.id === song.id);
    if (existingIdx !== -1) {
      this.userQueue.splice(existingIdx, 1);
    }
    this.userQueue.unshift(song);
    this.prefetchStream(song);
  }

  removeFromUserQueue(index: number) {
    if (index >= 0 && index < this.userQueue.length) {
      this.userQueue.splice(index, 1);
    }
  }

  playFromUserQueue(index: number) {
    if (index >= 0 && index < this.userQueue.length) {
      const song = this.userQueue.splice(index, 1)[0];
      if (song) {
        this.play(song, undefined, undefined, false, undefined, true, true);
      }
    }
  }

  setQueueFromSync(newQueue: Song[], newIndex: number) {
    this.queue = newQueue;
    this.queueIndex = newIndex;
  }

  async next() {
    if (this.jamDelegate?.isGuest()) {
      if (this.jamDelegate.onUserNext?.()) return;
    }

    // 1. If user has explicit queued songs, play the next one!
    if (this.userQueue.length > 0) {
      const nextSong = this.userQueue.shift();
      if (nextSong) {
        this.play(nextSong, undefined, undefined, false, undefined, true, true);
        return;
      }
    }

    // If playing from search and similar queue is still loading, await the initial recommendations
    if (this.currentContext.type === 'search' && this.queue.length <= 1 && this.similarPromise) {
      await this.similarPromise;
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
      if (this.currentContext.type === 'search' && this.queueIndex >= this.queue.length - 3) {
        this.loadMoreSimilar();
      }
      this.play(this.queue[this.queueIndex + 1]);
    } else if (this.currentContext.type === 'search' && this.similarContinuationToken) {
      await this.loadMoreSimilar();
      if (this.queueIndex < this.queue.length - 1) {
        this.play(this.queue[this.queueIndex + 1]);
      }
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
    if (this.isUserQueuePlaying) {
      this.isUserQueuePlaying = false;
      if (this.queueIndex >= 0 && this.queueIndex < this.queue.length) {
        this.play(this.queue[this.queueIndex]);
        return;
      }
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
    // Automatic download only happens when the complete song has been listened to
    if (
      !this.autoCachedCurrent &&
      settings.autoSave &&
      !this.isCached &&
      this.currentSong &&
      (this.duration <= 5 || this.listenedSeconds >= Math.min(this.duration * 0.8, Math.max(10, this.duration - 4)))
    ) {
      this.autoCachedCurrent = true;
      invoke('trigger_auto_cache', { song: this.currentSong }).catch(() => {});
    }

    if (this.jamDelegate?.isGuest()) {
      // Guest lets Host orchestrate track progression
      return;
    }
    if (this.repeatMode === 'one') {
      this.seek(0);
      this.audio?.play().catch(() => {});
      this.isPlaying = true;
      if (this.onPlaybackChange && this.currentSong) {
        this.onPlaybackChange('play', {
          song: this.currentSong,
          context: this.currentContext,
          position: 0,
        });
      }
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


  fetchLyrics(safeSong: Song) {
    this.isLoadingLyrics = true;
    const durSecs = safeSong.duration ? parseDurationToSeconds(safeSong.duration) : null;
    const durationParam = durSecs && durSecs > 0 ? durSecs : null;
    invoke<{ synced: string | null; plain: string | null }>('get_song_lyrics', {
      title: safeSong.title,
      artist: safeSong.artist,
      durationSecs: durationParam
    }).then(res => {
      if (this.currentSong?.id === safeSong.id) {
        this.lyrics = res;
        if (res.synced) {
          this.parsedLyrics = this.parseLyrics(res.synced);
        }
      }
      this.isLoadingLyrics = false;
    }).catch(err => {
      console.log('Lyrics not found:', err);
      this.isLoadingLyrics = false;
    });
  }

  private armStallWatchdog() {
    if (this.stalledCheckTimer) return;
    this.stalledCheckTimer = setTimeout(() => {
      this.stalledCheckTimer = null;
      if (this.isLoading && (this.isPlaying || this.wasPlayingBeforeInterruption) && !this.isCached && this.currentSong) {
        console.warn('[Audio Watchdog] Stream stalled for 4.5s. Initiating auto-recovery at', this.currentTime || this.lastKnownPosition);
        this.recoverStreamPlayback(this.currentTime || this.lastKnownPosition);
      }
    }, 4500);
  }

  private clearStallWatchdog() {
    if (this.stalledCheckTimer) {
      clearTimeout(this.stalledCheckTimer);
      this.stalledCheckTimer = null;
    }
  }

  async recoverStreamPlayback(forcedPosition?: number) {
    if (!this.currentSong) return;
    if (this.isRecoveringStream) return;
    this.isRecoveringStream = true;

    const song = this.currentSong;
    const resumePos = forcedPosition !== undefined && forcedPosition >= 0
      ? forcedPosition
      : (this.currentTime > 0 ? this.currentTime : this.lastKnownPosition);

    console.log(`[Stream Recovery] Recovering "${song.title}" from ${resumePos.toFixed(2)}s`);
    this.isLoading = true;
    this.clearStallWatchdog();

    // Invalidate stale in-memory stream URLs
    this.streamCache.delete(song.id);
    try {
      await invoke('invalidate_stream', { videoId: song.id }).catch(() => {});
    } catch (_) {}

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        console.warn('[Stream Recovery] Device currently offline. Auto-recovery will fire upon reconnection.');
        this.isRecoveringStream = false;
        this.wasPlayingBeforeInterruption = true;
        return;
      }

      const freshRes = await invoke<StreamResult>('get_online_stream', {
        song,
        forceRefresh: true
      });

      if (!freshRes || !freshRes.url) {
        throw new Error('No stream URL received');
      }

      if (this.currentSong?.id !== song.id) {
        this.isRecoveringStream = false;
        return;
      }

      this.streamCache.set(song.id, { result: freshRes, timestamp: Date.now() });
      this.isCached = freshRes.is_cached;

      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
        this.currentBlobUrl = null;
      }

      if (!this.audio) {
        this.isRecoveringStream = false;
        return;
      }

      this.audio.src = freshRes.url;
      if (resumePos > 0) {
        try {
          this.audio.currentTime = resumePos;
          this.currentTime = resumePos;
          this.lastKnownPosition = resumePos;
        } catch (_) {}
      }

      const onCanPlay = async () => {
        this.audio?.removeEventListener('canplay', onCanPlay);
        try {
          if (this.audio && resumePos > 0 && Math.abs(this.audio.currentTime - resumePos) > 1.5) {
            this.audio.currentTime = resumePos;
          }
          await this.audio?.play();
          this.isPlaying = true;
          this.isLoading = false;
          this.isRecoveringStream = false;
          this.wasPlayingBeforeInterruption = false;
          this.syncMediaNotification('state');
          console.log(`[Stream Recovery Success] Resumed "${song.title}" at ${resumePos.toFixed(2)}s`);
        } catch (err) {
          console.warn('[Stream Recovery Playback Failed]', err);
          this.isRecoveringStream = false;
          this.scheduleStreamRecoveryRetry(resumePos);
        }
      };

      this.audio.addEventListener('canplay', onCanPlay, { once: true });
      this.audio.load();

      // Fallback timer if canplay doesn't fire within 4.5s
      setTimeout(async () => {
        if (this.isRecoveringStream && this.currentSong?.id === song.id) {
          this.audio?.removeEventListener('canplay', onCanPlay);
          try {
            if (this.audio) {
              if (resumePos > 0) this.audio.currentTime = resumePos;
              await this.audio.play();
              this.isPlaying = true;
              this.isLoading = false;
              this.isRecoveringStream = false;
              this.wasPlayingBeforeInterruption = false;
              this.syncMediaNotification('state');
            }
          } catch (_) {
            this.isRecoveringStream = false;
            this.scheduleStreamRecoveryRetry(resumePos);
          }
        }
      }, 4500);

    } catch (err) {
      console.error('[Stream Recovery Error]', err);
      this.isRecoveringStream = false;
      this.scheduleStreamRecoveryRetry(resumePos);
    }
  }

  private scheduleStreamRecoveryRetry(targetPos: number) {
    if (this.recoveryTimeout) clearTimeout(this.recoveryTimeout);
    this.recoveryTimeout = setTimeout(() => {
      if (this.currentSong && (this.isPlaying || this.wasPlayingBeforeInterruption || this.isLoading)) {
        this.recoverStreamPlayback(targetPos);
      }
    }, 2500);
  }

  syncMediaNotification(type: 'metadata' | 'state') {
    if (typeof window === 'undefined') return;

    let durationSec = this.duration || 0;
    if (!durationSec && this.currentSong?.duration) {
      durationSec = parseDurationToSeconds(this.currentSong.duration);
    }

    const cleanTitle = (() => {
      if (!this.currentSong) return 'Vibes';
      const t = (this.currentSong.title || '').trim();
      if (t.includes(' - ')) {
        const parts = t.split(' - ');
        if (parts.length === 2 && parts[1].trim()) return parts[1].trim();
      }
      return t || 'Vibes';
    })();

    const cleanArtist = this.currentSong
      ? cleanArtistName(this.currentSong.artist, this.currentSong.title, this.currentSong.album) || 'Playing music'
      : '';

    const candidates = this.currentSong
      ? getHighQualityThumbCandidates(this.currentSong.thumb, this.currentSong.id, true)
      : [];
    const thumbUrl = (candidates && candidates.length > 0 ? candidates[0] : this.currentSong?.thumb) || '';

    // 1. Sync standard navigator.mediaSession
    if ('mediaSession' in navigator && this.currentSong) {
      try {
        if (type === 'metadata') {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: cleanTitle,
            artist: cleanArtist,
            album: this.currentSong.album || cleanArtist || 'Vibes',
            artwork: candidates.length > 0
              ? candidates.map((src) => ({ src, sizes: '512x512', type: 'image/jpeg' }))
              : (thumbUrl ? [{ src: thumbUrl, sizes: '512x512', type: 'image/jpeg' }] : [])
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
            cleanTitle,
            cleanArtist,
            thumbUrl,
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
