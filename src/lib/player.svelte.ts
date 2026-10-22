import { invoke } from '@tauri-apps/api/core';
import type { Song, StreamResult, LyricLine } from './types';

class PlayerState {
  currentSong = $state<Song | null>(null);
  isPlaying = $state<boolean>(false);
  currentTime = $state<number>(0);
  duration = $state<number>(0);
  volume = $state<number>(0.8);
  isMuted = $state<boolean>(false);
  isCached = $state<boolean>(false);
  isLiked = $state<boolean>(false);
  isLoading = $state<boolean>(false);

  queue = $state<Song[]>([]);
  queueIndex = $state<number>(-1);
  isShuffle = $state<boolean>(false);
  repeatMode = $state<'off' | 'all' | 'one'>('off');

  showLyrics = $state<boolean>(false);
  lyrics = $state<{ synced: string | null; plain: string | null }>({ synced: null, plain: null });
  parsedLyrics = $state<LyricLine[]>([]);
  activeLyricIndex = $state<number>(-1);

  audio: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAudio();
    }
  }

  private initAudio() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = this.volume;

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio) {
        this.currentTime = this.audio.currentTime;
        this.updateActiveLyric();
      }
    });

    this.audio.addEventListener('durationchange', () => {
      if (this.audio && !isNaN(this.audio.duration)) {
        this.duration = this.audio.duration;
      }
    });

    this.audio.addEventListener('playing', () => {
      this.isPlaying = true;
      this.isLoading = false;
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
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
      console.error('[Audio Error]', e);
      this.isLoading = false;
      this.isPlaying = false;
    });
  }

  private updateActiveLyric() {
    if (this.parsedLyrics.length === 0) {
      this.activeLyricIndex = -1;
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
    this.activeLyricIndex = idx;
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

  async play(song: Song) {
    if (!this.audio) this.initAudio();
    if (!this.audio) return;

    // Check if clicked the same song
    if (this.currentSong?.id === song.id && this.audio.src) {
      this.audio.play();
      this.isPlaying = true;
      return;
    }

    this.currentSong = song;
    this.isLoading = true;
    this.currentTime = 0;
    this.duration = 0;
    this.activeLyricIndex = -1;
    this.parsedLyrics = [];
    this.lyrics = { synced: null, plain: null };

    // Update queue if not already in queue
    const existingIdx = this.queue.findIndex(s => s.id === song.id);
    if (existingIdx !== -1) {
      this.queueIndex = existingIdx;
    } else {
      this.queue.push(song);
      this.queueIndex = this.queue.length - 1;
    }

    // Check liked status in background
    invoke<boolean>('check_is_liked', { id: song.id })
      .then(liked => { this.isLiked = liked; })
      .catch(() => {});

    // Fetch lyrics in background
    invoke<{ synced: string | null; plain: string | null }>('get_song_lyrics', {
      title: song.title,
      artist: song.artist,
      durationSecs: null
    }).then(res => {
      this.lyrics = res;
      if (res.synced) {
        this.parsedLyrics = this.parseLyrics(res.synced);
      }
    }).catch(err => console.log('Lyrics not found:', err));

    try {
      const streamRes = await invoke<StreamResult>('get_stream', { song });
      this.isCached = streamRes.is_cached;

      if (streamRes.is_cached) {
        // Stream from our high-performance local protocol
        this.audio.src = `vibes-audio://${song.id}`;
      } else {
        // Direct stream from Google CDN
        this.audio.src = streamRes.url;
      }

      await this.audio.play();
      this.isPlaying = true;
    } catch (err) {
      console.error('Failed to get stream:', err);
      this.isLoading = false;
    }
  }

  togglePlay() {
    if (!this.audio || !this.currentSong) return;
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      this.audio.play();
    }
  }

  seek(seconds: number) {
    if (!this.audio) return;
    this.audio.currentTime = seconds;
    this.currentTime = seconds;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audio) {
      this.audio.muted = this.isMuted;
    }
  }

  async toggleLike() {
    if (!this.currentSong) return;
    try {
      const newState = await invoke<boolean>('toggle_like', { song: this.currentSong });
      this.isLiked = newState;
    } catch (e) {
      console.error('Error toggling like:', e);
    }
  }

  next() {
    if (this.queue.length === 0) return;
    if (this.isShuffle) {
      const nextIdx = Math.floor(Math.random() * this.queue.length);
      this.play(this.queue[nextIdx]);
    } else if (this.queueIndex < this.queue.length - 1) {
      this.play(this.queue[this.queueIndex + 1]);
    } else if (this.repeatMode === 'all') {
      this.play(this.queue[0]);
    }
  }

  prev() {
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }
    if (this.queueIndex > 0) {
      this.play(this.queue[this.queueIndex - 1]);
    } else {
      this.seek(0);
    }
  }

  private handleSongEnd() {
    if (this.repeatMode === 'one') {
      this.seek(0);
      this.audio?.play();
    } else {
      this.next();
    }
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = 'off';
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
  }
}

export const player = new PlayerState();
