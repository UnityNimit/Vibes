<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { isAndroid } from '../platform';
  import { player } from '../player.svelte';
  import { playlistStore } from '../playlistStore.svelte';
  import { likedStore } from '../likedStore.svelte';
  import { savedStore } from '../savedStore.svelte';
  import { formatTime } from '../utils';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import RepeatIcon from './RepeatIcon.svelte';
  import WaveProgressBar from './WaveProgressBar.svelte';
  import type { SearchPage, Song } from '../types';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  let isMobileAndroid = $state(isAndroid());

  onMount(() => {
    isMobileAndroid = isAndroid();
  });

  let showSimilarMobile = $state(false);
  let showMobilePlaylistMenu = $state(false);
  let isCreatingPlaylist = $state(false);
  let newPlaylistInput = $state('');

  let isCurrentSongInAnyPlaylist = $derived(
    player.currentSong ? playlistStore.isSongInAnyPlaylist(player.currentSong.id) : false
  );

  async function handleCreatePlaylistMobile() {
    const name = newPlaylistInput.trim();
    if (!name) return;
    const pl = await playlistStore.create(name);
    if (pl && player.currentSong) {
      await playlistStore.toggleSong(pl.id, player.currentSong);
    }
    newPlaylistInput = '';
  }

  let lyricsContainerEl = $state<HTMLDivElement | null>(null);
  let lastActiveIndex = $state<number>(-1);
  let lastShowLyrics = $state<boolean>(false);

  // Marquee overflow detection for Title and Artist
  let titleContainerEl = $state<HTMLDivElement | null>(null);
  let measureTitleSpanEl = $state<HTMLSpanElement | null>(null);
  let isTitleOverflowing = $state<boolean>(false);
  let marqueeTitleDuration = $state<number>(10);

  let artistContainerEl = $state<HTMLDivElement | null>(null);
  let measureArtistSpanEl = $state<HTMLSpanElement | null>(null);
  let isArtistOverflowing = $state<boolean>(false);
  let marqueeArtistDuration = $state<number>(10);

  // Similar Songs State (Split view slide animation & infinite pagination)
  let showSimilar = $state<boolean>(false);
  let similarSongs = $state<Song[]>([]);
  let similarContinuationToken = $state<string | null>(null);
  let isLoadingSimilar = $state<boolean>(false);
  let isLoadingMoreSimilar = $state<boolean>(false);
  let similarScrollEl = $state<HTMLDivElement | null>(null);

  function getCleanArtist(song: { title: string; artist: string; album?: string }): string {
    const art = (song.artist || '').trim();
    if (!art || art.toLowerCase() === 'song' || art.toLowerCase() === 'unknown artist') {
      if (song.title.includes(' - ')) {
        const p0 = song.title.split(' - ')[0].trim();
        if (p0) return p0;
      }
      if (song.album && song.album.toLowerCase() !== 'song') {
        return song.album;
      }
      return 'Unknown Artist';
    }
    return art;
  }

  function getCleanTitle(song: { title: string; artist: string }): string {
    const t = (song.title || '').trim();
    if (t.includes(' - ')) {
      const parts = t.split(' - ');
      if (parts.length === 2 && parts[1].trim()) {
        return parts[1].trim();
      }
    }
    return t;
  }

  let cleanTitle = $derived(player.currentSong ? getCleanTitle(player.currentSong) : '');
  let cleanArtist = $derived(player.currentSong ? getCleanArtist(player.currentSong) : '');

  function checkOverflow() {
    if (titleContainerEl && measureTitleSpanEl && player.currentSong) {
      const textW = measureTitleSpanEl.offsetWidth;
      const contW = titleContainerEl.clientWidth;
      if (contW > 0 && textW > contW) {
        isTitleOverflowing = true;
        marqueeTitleDuration = Math.max(6, (textW + 32) / 35);
      } else {
        isTitleOverflowing = false;
      }
    }
    if (artistContainerEl && measureArtistSpanEl && player.currentSong) {
      const artW = measureArtistSpanEl.offsetWidth;
      const contW = artistContainerEl.clientWidth;
      if (contW > 0 && artW > contW) {
        isArtistOverflowing = true;
        marqueeArtistDuration = Math.max(6, (artW + 32) / 30);
      } else {
        isArtistOverflowing = false;
      }
    }
  }

  $effect(() => {
    if (cleanTitle) {
      requestAnimationFrame(() => {
        checkOverflow();
      });
    }
  });

  $effect(() => {
    if (!titleContainerEl) return;
    const ro = new ResizeObserver(() => {
      checkOverflow();
    });
    ro.observe(titleContainerEl);
    return () => ro.disconnect();
  });

  async function loadSimilarSongs(songId: string) {
    if (!songId) return;
    isLoadingSimilar = true;
    similarContinuationToken = null;
    try {
      const res = await invoke<SearchPage>('get_similar_songs', { videoId: songId });
      similarSongs = res.songs;
      similarContinuationToken = res.continuation_token ?? null;
    } catch (err) {
      console.error(err);
      similarSongs = [];
    } finally {
      isLoadingSimilar = false;
    }
  }

  async function loadMoreSimilar() {
    if (!similarContinuationToken || isLoadingMoreSimilar || isLoadingSimilar) return;
    isLoadingMoreSimilar = true;
    try {
      const existing = new Set(similarSongs.map((s) => s.id));
      let collected: Song[] = [];
      let token: string | null = similarContinuationToken;
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
        similarSongs = [...similarSongs, ...collected];
      }
      similarContinuationToken = token;
    } catch (err) {
      console.error(err);
    } finally {
      isLoadingMoreSimilar = false;
    }
  }

  let displayedSongs = $derived.by<Song[]>(() => {
    if (player.currentContext.type === 'playlist') {
      const pl = playlistStore.playlists.find((p) => p.id === player.currentContext.playlistId);
      return pl ? pl.songs : player.currentContext.songs;
    }
    if (player.currentContext.type === 'liked') {
      return likedStore.songs;
    }
    if (player.currentContext.type === 'saved') {
      return savedStore.items.map((i) => ({
        id: i.id,
        title: i.title,
        artist: i.artist,
        album: i.album,
        duration: i.duration,
        thumb: i.thumb,
      }));
    }
    return similarSongs;
  });

  function handleSimilarScroll(e: Event) {
    if (player.currentContext.type !== 'search') return;
    const el = e.target as HTMLElement;
    if (!el || !similarContinuationToken || isLoadingMoreSimilar || isLoadingSimilar) return;
    const threshold = 1000;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= threshold) {
      loadMoreSimilar();
    }
  }

  $effect(() => {
    if (player.currentContext.type === 'search' && player.currentSong?.id) {
      loadSimilarSongs(player.currentSong.id);
    }
  });

  $effect(() => {
    if (showSimilar && player.currentContext.type !== 'search' && player.currentSong?.id) {
      requestAnimationFrame(() => {
        if (!similarScrollEl) return;
        const activeNode = similarScrollEl.querySelector(`[data-song-id="${player.currentSong?.id}"]`) as HTMLElement;
        if (activeNode) {
          activeNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  });

  function playRightColumnSong(song: Song, index: number) {
    if (player.currentContext.type === 'search') {
      player.play(song, { type: 'search', title: 'Similar Vibes', songs: similarSongs }, index);
    } else {
      player.play(song, { ...player.currentContext, songs: displayedSongs }, index);
    }
  }

  function toggleLyrics() {
    player.showLyrics = !player.showLyrics;
  }

  function jumpToLyric(time: number) {
    player.seek(time);
  }

  let scrollAnimId: number | null = null;
  let isUserScrollingLyrics = false;
  let userScrollTimeout: ReturnType<typeof setTimeout> | null = null;

  function onUserLyricsWheel() {
    isUserScrollingLyrics = true;
    if (userScrollTimeout) clearTimeout(userScrollTimeout);
    userScrollTimeout = setTimeout(() => {
      isUserScrollingLyrics = false;
      if (player.showLyrics && player.activeLyricIndex !== -1) {
        scrollToActiveLyric(player.activeLyricIndex, false);
      }
    }, 2500);
  }

  // Quintic ease-out interpolation engine: adapts smoothly to 60Hz, 120Hz, 144Hz, 240Hz+ displays
  function smoothScrollLyricsTo(targetY: number, durationMs = 450) {
    if (!lyricsContainerEl) return;
    if (scrollAnimId !== null) {
      cancelAnimationFrame(scrollAnimId);
      scrollAnimId = null;
    }

    const startY = lyricsContainerEl.scrollTop;
    const diff = targetY - startY;
    if (Math.abs(diff) < 1) return;

    const startTime = performance.now();

    function easeOutQuint(x: number): number {
      return 1 - Math.pow(1 - x, 5);
    }

    function step(now: number) {
      if (!lyricsContainerEl) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const ease = easeOutQuint(progress);

      lyricsContainerEl.scrollTop = startY + diff * ease;

      if (progress < 1) {
        scrollAnimId = requestAnimationFrame(step);
      } else {
        scrollAnimId = null;
      }
    }

    scrollAnimId = requestAnimationFrame(step);
  }

  function scrollToActiveLyric(idx: number, immediate = false) {
    if (!lyricsContainerEl || idx < 0) return;
    const activeNode = lyricsContainerEl.querySelector(`[data-lyric-index="${idx}"]`) as HTMLElement;
    if (!activeNode) return;

    const containerRect = lyricsContainerEl.getBoundingClientRect();
    const nodeRect = activeNode.getBoundingClientRect();
    const containerHeight = lyricsContainerEl.clientHeight;
    const nodeHeight = activeNode.offsetHeight;
    
    // Precise screen-space delta calculation independent of offsetParent or CSS transforms
    const currentVisualOffset = (nodeRect.top - containerRect.top) - (containerHeight / 2) + (nodeHeight / 2);
    const targetY = Math.max(0, lyricsContainerEl.scrollTop + currentVisualOffset);

    if (immediate) {
      if (scrollAnimId !== null) {
        cancelAnimationFrame(scrollAnimId);
        scrollAnimId = null;
      }
      lyricsContainerEl.scrollTop = targetY;
    } else {
      smoothScrollLyricsTo(targetY, 450);
    }
  }

  $effect(() => {
    const isShowing = player.showLyrics;
    const currentIdx = player.activeLyricIndex;

    if (isShowing && lyricsContainerEl && currentIdx !== -1) {
      const isFirstOpen = !lastShowLyrics;
      lastShowLyrics = true;

      if (currentIdx !== lastActiveIndex || isFirstOpen) {
        lastActiveIndex = currentIdx;

        if (isUserScrollingLyrics && !isFirstOpen) return;

        requestAnimationFrame(() => {
          scrollToActiveLyric(currentIdx, isFirstOpen);
        });
      }
    } else if (!isShowing) {
      lastShowLyrics = false;
      if (scrollAnimId !== null) {
        cancelAnimationFrame(scrollAnimId);
        scrollAnimId = null;
      }
    }
  });
</script>

{#if player.currentSong}
  <!-- Hidden measuring elements to detect exact title & artist overflow in pixels -->
  <span
    bind:this={measureTitleSpanEl}
    class="text-base sm:text-lg md:text-xl font-medium whitespace-nowrap pointer-events-none"
    style="position: fixed; top: -9999px; left: -9999px; visibility: hidden; opacity: 0;"
  >
    {cleanTitle}
  </span>
  <span
    bind:this={measureArtistSpanEl}
    class="text-xs sm:text-sm font-normal whitespace-nowrap pointer-events-none"
    style="position: fixed; top: -9999px; left: -9999px; visibility: hidden; opacity: 0;"
  >
    {cleanArtist}
  </span>
{/if}

{#if isMobileAndroid}
  {#if player.currentSong}
    <div
      class="w-full h-full flex flex-col justify-between items-center select-none font-sans bg-black px-5 pb-8 relative overflow-hidden"
      style="padding-top: max(env(safe-area-inset-top, 36px), 36px);"
    >
      <!-- Top Action Row: Top-Left Down Chevron, Top-Center Context, Top-Right Similar Songs Arrow -->
      <div class="w-full flex items-center justify-between flex-shrink-0 z-20">
        <!-- Top Left: Down Chevron / Close Arrow -->
        <button
          type="button"
          onclick={onClose}
          class="w-10 h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white active:scale-90 transition-all cursor-pointer -ml-2"
          aria-label="Close bigger player"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- Top Center: Playing Context -->
        <div class="flex flex-col items-center justify-center min-w-0 px-2 text-center">
          <span class="text-[10px] font-mono tracking-widest uppercase text-neutral-500">PLAYING FROM</span>
          <span class="text-xs font-medium text-neutral-200 truncate max-w-[180px]">
            {player.currentContext.title || 'Vibes'}
          </span>
        </div>

        <!-- Top Right: Arrow to Open Similar Songs List -->
        <button
          type="button"
          onclick={() => (showSimilarMobile = true)}
          class="w-10 h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white active:scale-90 transition-all cursor-pointer -mr-2"
          aria-label="Open similar songs"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>

      <!-- Main Art in the Centre (Tap for Synced Lyrics) -->
      <div class="flex-1 w-full flex flex-col items-center justify-center min-h-0 my-auto py-2">
        <div
          role="button"
          tabindex="0"
          onclick={toggleLyrics}
          onkeydown={(e) => { if (e.key === 'Enter') toggleLyrics(); }}
          class="relative w-[76vw] max-w-[300px] aspect-square rounded-2xl overflow-hidden bg-[#0c0c0e] shadow-[0_16px_48px_rgba(0,0,0,0.9)] flex-shrink-0 cursor-pointer"
        >
          <!-- Album Art Image -->
          <div class="w-full h-full {player.showLyrics ? 'brightness-[0.35] blur-md scale-105' : 'brightness-100 blur-0 scale-100'} transition-all duration-500 ease-out">
            <TrackImage
              src={player.currentSong.thumb}
              songId={player.currentSong.id}
              alt={player.currentSong.title}
              class="w-full h-full object-cover select-none pointer-events-none"
              iconClass="w-20 h-20 text-neutral-600"
              highQuality={true}
            />
          </div>

          {#if player.isLoading}
            <div class="absolute inset-0 bg-black/70 flex items-center justify-center z-30">
              <div class="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          {/if}

          <!-- Synchronized Lyrics Overlay -->
          <div
            class="absolute inset-0 z-20 flex flex-col justify-center items-center transition-opacity duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] {player.showLyrics ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
          >
            <div
              bind:this={lyricsContainerEl}
              onwheel={onUserLyricsWheel}
              class="w-full h-full overflow-y-auto px-6 py-24 flex flex-col items-center text-center gap-3 select-none no-scrollbar"
              style="-webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%);"
            >
              {#if player.parsedLyrics.length > 0}
                {#each player.parsedLyrics as line, i}
                  <button
                    data-lyric-index={i}
                    onclick={(e) => { e.stopPropagation(); jumpToLyric(line.time); }}
                    class="w-full px-3 py-1.5 rounded-xl text-center leading-relaxed cursor-pointer transition-[color,opacity,filter] duration-300 text-sm font-normal tracking-wide {player.activeLyricIndex === i ? 'text-white opacity-100 drop-shadow-[0_2px_12px_rgba(255,255,255,0.45)]' : 'text-white/35 opacity-70 hover:opacity-100 hover:text-white/80'}"
                  >
                    {line.text.trim() || '• • •'}
                  </button>
                {/each}
              {:else if player.lyrics.plain}
                <div class="whitespace-pre-line text-xs text-neutral-300 max-w-full px-4 leading-relaxed font-normal my-auto">
                  {player.lyrics.plain}
                </div>
              {:else if player.isLoadingLyrics}
                <div class="flex flex-col items-center justify-center my-auto gap-2 text-neutral-400">
                  <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                  <span class="text-xs font-mono">LOADING LYRICS...</span>
                </div>
              {:else}
                <div class="flex items-center justify-center my-auto text-neutral-400">
                  <p class="text-xs font-mono tracking-wider">NO LYRICS AVAILABLE</p>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- Below Art: Song Name & Artist on Left, Download Button on Right Edge -->
      <div class="w-full max-w-sm px-4 flex items-center justify-between min-w-0 flex-shrink-0">
        <!-- Title & Artist -->
        <div class="flex-1 min-w-0 pr-3 flex flex-col items-start">
          <!-- Song Name -->
          <div class="relative w-full overflow-hidden">
            {#if isTitleOverflowing}
              <div
                class="flex items-center gap-8 whitespace-nowrap marquee-track"
                style="animation-duration: {marqueeTitleDuration}s;"
              >
                <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">{cleanTitle}</h2>
                <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">{cleanTitle}</h2>
              </div>
            {:else}
              <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight truncate w-full leading-tight">
                {cleanTitle}
              </h2>
            {/if}
          </div>

          <!-- Artist Name -->
          <div class="relative w-full overflow-hidden mt-1">
            {#if isArtistOverflowing}
              <div
                class="flex items-center gap-8 whitespace-nowrap marquee-track"
                style="animation-duration: {marqueeArtistDuration}s;"
              >
                <p class="text-sm font-medium text-neutral-400 leading-tight">{cleanArtist}</p>
                <p class="text-sm font-medium text-neutral-400 leading-tight">{cleanArtist}</p>
              </div>
            {:else}
              <p class="text-sm font-medium text-neutral-400 truncate w-full leading-tight">
                {cleanArtist}
              </p>
            {/if}
          </div>
        </div>

        <!-- Download Button on the Right Edge -->
        <button
          type="button"
          onclick={() => player.toggleDownload()}
          disabled={player.isDownloading}
          class="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all cursor-pointer active:scale-90 {player.isCached ? 'text-accent' : 'text-neutral-400 hover:text-white'}"
          aria-label="Download song"
        >
          {#if player.isDownloading}
            <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          {:else if player.isCached}
            <svg class="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {:else}
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          {/if}
        </button>
      </div>

      <!-- Below Artist: Animated Wave Progress Bar & Time Stamps -->
      <div class="w-full max-w-sm px-4 mt-3 flex flex-col gap-1.5 flex-shrink-0">
        <WaveProgressBar
          height={24}
          amplitude={3.0}
          wavelength={24}
          thumbRadius={5}
          class="w-full"
        />

        <!-- Below Progress Line: Time Stamps -->
        <div class="flex items-center justify-between text-xs font-mono text-neutral-400 select-none px-0.5">
          <span>{formatTime(player.currentTime)}</span>
          <span>{formatTime(player.duration)}</span>
        </div>
      </div>

      <!-- Below Time Stamps: Main 5 Controls -->
      <div class="w-full max-w-sm px-4 mt-2 flex items-center justify-between select-none flex-shrink-0">
        <!-- 1. Heart / Like -->
        <button
          onclick={() => player.toggleLike()}
          class="w-11 h-11 rounded-full flex items-center justify-center text-neutral-400 active:scale-90 transition-all cursor-pointer {player.isLiked ? 'text-accent' : ''}"
          aria-label={player.isLiked ? 'Unlike' : 'Like'}
        >
          <svg class="w-6 h-6 {player.isLiked ? 'fill-current' : 'fill-none'}" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>

        <!-- 2. Previous Track -->
        <button
          onclick={() => player.prev()}
          class="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
          aria-label="Previous track"
        >
          <svg class="w-7 h-7 fill-current" viewBox="0 0 24 24">
            <path d="M7 6a1 1 0 0 0-1 1v10a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1zm11.3 1.3a1 1 0 0 0-1.6-.8l-7 5a1 1 0 0 0 0 1.6l7 5a1 1 0 0 0 1.6-.8v-10z"/>
          </svg>
        </button>

        <!-- 3. Play / Pause (Large Center Button) -->
        <button
          onclick={() => player.togglePlay()}
          class="relative w-16 h-16 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition-all cursor-pointer shadow-xl flex-shrink-0"
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
        >
          {#if player.isLoading}
            <div class="w-7 h-7 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          {:else if player.isPlaying}
            <svg class="w-7 h-7 fill-current" viewBox="0 0 24 24">
              <path d="M8 6a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-3 0v-9A1.5 1.5 0 0 1 8 6zm8 0a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-3 0v-9A1.5 1.5 0 0 1 16 6z"/>
            </svg>
          {:else}
            <svg class="w-7 h-7 fill-current ml-1" viewBox="0 0 24 24">
              <path d="M8.5 5.5a1.5 1.5 0 0 0-2.25 1.3v10.4a1.5 1.5 0 0 0 2.25 1.3l9-5.2a1.5 1.5 0 0 0 0-2.6l-9-5.2z"/>
            </svg>
          {/if}
        </button>

        <!-- 4. Next Track -->
        <button
          onclick={() => player.next()}
          class="w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 transition-all cursor-pointer"
          aria-label="Next track"
        >
          <svg class="w-7 h-7 fill-current" viewBox="0 0 24 24">
            <path d="M17 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm-11.3 1.3a1 1 0 0 1 1.6-.8l7 5a1 1 0 0 1 0 1.6l-7 5a1 1 0 0 1-1.6-.8v-10z"/>
          </svg>
        </button>

        <!-- 5. Repeat / Shuffle Mode -->
        <button
          onclick={() => player.toggleRepeat()}
          class="w-11 h-11 rounded-full flex items-center justify-center text-neutral-400 active:scale-90 transition-all cursor-pointer {player.repeatMode !== 'off' ? 'text-accent' : ''}"
          aria-label="Toggle repeat or shuffle mode"
        >
          <RepeatIcon mode={player.repeatMode} size={22} />
        </button>
      </div>

      <!-- Bottom Center: Playlist Button -->
      <div class="w-full max-w-xs mt-3 flex items-center justify-center select-none flex-shrink-0">
        <button
          type="button"
          onclick={() => (showMobilePlaylistMenu = true)}
          class="w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 {isCurrentSongInAnyPlaylist ? 'text-accent' : 'text-neutral-400 hover:text-white'}"
          aria-label="Add to playlist"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </button>
      </div>

      <!-- Slide-over Similar Songs List (Sliding in from Right with Pure Black Background) -->
      <div
        class="absolute inset-0 bg-black z-40 flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] {showSimilarMobile ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}"
        style="padding-top: max(env(safe-area-inset-top, 36px), 36px);"
      >
        <!-- Header with Back Button -->
        <div class="w-full flex items-center justify-between px-5 pt-3 pb-3 border-b border-white/10 flex-shrink-0">
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => (showSimilarMobile = false)}
              class="p-2 -ml-2 text-neutral-400 hover:text-white active:scale-90 transition-all cursor-pointer"
              aria-label="Back to player"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span class="text-base font-semibold text-white">Similar Vibes</span>
          </div>
          <span class="text-xs font-mono text-neutral-500">
            {displayedSongs.length} tracks
          </span>
        </div>

        <!-- Scrollable Similar Songs List -->
        <div
          bind:this={similarScrollEl}
          onscroll={handleSimilarScroll}
          class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5 no-scrollbar"
        >
          {#if player.currentContext.type === 'search' && isLoadingSimilar}
            <div class="flex flex-col items-center justify-center py-24 gap-3 text-neutral-500">
              <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs font-mono tracking-wider">TUNING INTO SIMILAR VIBES...</span>
            </div>
          {:else if displayedSongs.length > 0}
            {#each displayedSongs as song, i}
              {@const isPlayingThis = player.currentSong?.id === song.id}
              <div
                role="button"
                tabindex="0"
                data-song-id={song.id}
                onclick={() => playRightColumnSong(song, i)}
                onkeydown={(e) => { if (e.key === 'Enter') playRightColumnSong(song, i); }}
                class="flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group {isPlayingThis ? 'bg-accent/15' : 'active:bg-white/10'}"
              >
                <div class="w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0 relative">
                  <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-sm font-medium truncate {isPlayingThis ? 'text-accent' : 'text-white'}">
                    {song.title}
                  </h4>
                  <p class="text-xs text-neutral-400 truncate mt-0.5">
                    {song.artist}
                  </p>
                </div>
                {#if isPlayingThis && player.isPlaying}
                  <PlayingEqualizer isPlaying={player.isPlaying} />
                {:else}
                  <span class="text-xs text-neutral-500 font-mono flex-shrink-0">
                    {song.duration}
                  </span>
                {/if}
              </div>
            {/each}
            {#if player.currentContext.type === 'search' && isLoadingMoreSimilar}
              <div class="py-4 flex items-center justify-center w-full">
                <div class="w-4 h-4 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </div>
            {/if}
          {:else}
            <div class="py-20 text-center text-xs font-mono text-neutral-500">
              NO TRACKS FOUND
            </div>
          {/if}
        </div>
      </div>

      <!-- Mobile Playlist Bottom Sheet (Smooth Slide-Up Card with Pure Black Background) -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center transition-opacity duration-300 {showMobilePlaylistMenu ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
        onclick={() => { showMobilePlaylistMenu = false; isCreatingPlaylist = false; }}
      >
        <div
          class="w-full max-w-md bg-black border-t border-white/10 rounded-t-3xl p-5 pb-8 flex flex-col gap-3 max-h-[70vh] shadow-[0_-16px_48px_rgba(0,0,0,0.9)] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] {showMobilePlaylistMenu ? 'translate-y-0' : 'translate-y-full'}"
          onclick={(e) => e.stopPropagation()}
        >
          <!-- Minimalist Top Bar: Just the Plus Button to add a new playlist -->
          <div class="flex items-center justify-end w-full">
            <button
              type="button"
              onclick={() => (isCreatingPlaylist = !isCreatingPlaylist)}
              class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white transition-all cursor-pointer"
              aria-label="Add new playlist"
            >
              <svg class="w-5 h-5 transition-transform duration-200 {isCreatingPlaylist ? 'rotate-45' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>

          {#if isCreatingPlaylist}
            <form
              onsubmit={(e) => { e.preventDefault(); handleCreatePlaylistMobile(); isCreatingPlaylist = false; }}
              class="flex items-center gap-2"
            >
              <input
                type="text"
                bind:value={newPlaylistInput}
                placeholder="Playlist name..."
                class="flex-1 bg-white/[0.07] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/40 font-sans"
              />
              <button
                type="submit"
                disabled={!newPlaylistInput.trim()}
                class="px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-xs active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer font-sans"
              >
                Add
              </button>
            </form>
          {/if}

          <!-- Playlists List -->
          <div class="flex-1 overflow-y-auto flex flex-col gap-1 max-h-60 no-scrollbar">
            {#if playlistStore.playlists.length === 0}
              <p class="text-center py-6 text-xs font-mono text-neutral-600">NO PLAYLISTS YET</p>
            {:else}
              {#each playlistStore.playlists as pl}
                {@const inPl = player.currentSong ? playlistStore.isSongInPlaylist(pl.id, player.currentSong.id) : false}
                <button
                  type="button"
                  onclick={() => player.currentSong && playlistStore.toggleSong(pl.id, player.currentSong)}
                  class="flex items-center justify-between w-full px-3.5 py-3 rounded-2xl hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left {inPl ? 'bg-white/[0.06]' : ''}"
                >
                  <div class="flex-1 min-w-0 pr-3">
                    <p class="text-sm font-medium {inPl ? 'text-accent' : 'text-white'} truncate">{pl.name}</p>
                    <p class="text-[11px] font-mono text-neutral-500 mt-0.5">{pl.songs.length} tracks</p>
                  </div>
                  {#if inPl}
                    <svg class="w-5 h-5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="my-auto flex flex-col items-center justify-center text-center gap-2">
      <p class="text-xs font-mono text-neutral-500">NO TRACK SELECTED</p>
    </div>
  {/if}
{:else}
  <!-- Desktop Windows Layout (100% Intact) -->
  <div class="flex-1 h-full overflow-hidden px-6 pt-2 pb-28 md:px-8 flex flex-col justify-between items-center select-none w-full font-sans bg-black relative">
  {#if player.currentSong}
    <!-- Top Bar Action Row: Now Playing Context Indicator on Left, Pure Arrow Icon on Right -->
    <div class="w-full flex items-center justify-between px-2 pt-1 flex-shrink-0 z-30">
      <!-- Now Playing Context Indicator -->
      <div class="flex items-center gap-1.5 text-xs font-mono text-neutral-400 select-none min-w-0 pr-4">
        <span class="text-neutral-500 uppercase tracking-wider text-[10px] sm:text-xs flex-shrink-0">PLAYING FROM</span>
        <span class="text-white font-medium truncate text-xs sm:text-sm">
          {player.currentContext.title}
        </span>
      </div>

      <button
        type="button"
        onclick={() => (showSimilar = !showSimilar)}
        class="p-2 text-neutral-500 hover:text-white transition-colors cursor-pointer flex-shrink-0"
        title={showSimilar ? 'Hide list' : 'Show list'}
        aria-label="Toggle song list"
      >
        <svg
          class="w-5 h-5 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] {showSimilar ? 'rotate-180 text-white' : 'text-neutral-500 hover:text-white'}"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </button>
    </div>

    <!-- Main Content Area: Slides Art to Left, Reveals Similar Songs on Right -->
    <div class="flex-1 w-full flex items-center justify-center overflow-hidden py-2 min-h-0 gap-6 md:gap-10 lg:gap-16">
      <!-- Left Column: Album Art + Lyrics + Info (Smoothly glides left on toggle) -->
      <div
        class="flex flex-col items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] gap-6 flex-shrink-0 {showSimilar ? 'max-w-[48%] -translate-x-2' : 'w-full max-w-lg translate-x-0'}"
      >
        <!-- Album Artwork / ViMusic-style Synced Lyrics (Click to toggle smoothly) -->
        <div
          role="button"
          tabindex="0"
          onclick={toggleLyrics}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLyrics(); } }}
          class="relative aspect-square rounded-2xl overflow-hidden bg-[#0c0c0e] shadow-2xl flex-shrink-0 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] {showSimilar ? 'w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 lg:w-80 lg:h-80' : 'w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-[420px] lg:h-[420px]'}"
        >
          <!-- Album Art Image (Pure smooth GPU blur & subtle darkening) -->
          <div
            class="w-full h-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[filter,transform] {player.showLyrics ? 'brightness-[0.38] blur-md scale-[1.04]' : 'brightness-100 blur-0 scale-100'}"
          >
            <TrackImage
              src={player.currentSong.thumb}
              songId={player.currentSong.id}
              alt={player.currentSong.title}
              class="w-full h-full object-cover"
              iconClass="w-24 h-24 text-neutral-600"
              highQuality={true}
            />
          </div>

          {#if player.isLoading}
            <div class="absolute inset-0 bg-black/70 flex items-center justify-center z-30">
              <div class="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          {/if}

          <!-- Synchronized Lyrics Overlay (Smoothly fades in with NO badges, NO icons, NO headers) -->
          <div
            class="absolute inset-0 z-20 flex flex-col justify-center items-center transition-opacity duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[opacity] {player.showLyrics ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}"
          >
            <!-- Scrollable Lyrics Container with smooth vertical gradient mask -->
            <div
              bind:this={lyricsContainerEl}
              onwheel={onUserLyricsWheel}
              class="w-full h-full overflow-y-auto px-6 py-28 sm:py-36 flex flex-col items-center text-center gap-3 select-none no-scrollbar"
              style="-webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%);"
            >
              {#if player.parsedLyrics.length > 0}
                {#each player.parsedLyrics as line, i}
                  <button
                    data-lyric-index={i}
                    onclick={(e) => { e.stopPropagation(); jumpToLyric(line.time); }}
                    class="w-full max-w-sm sm:max-w-md px-3 py-1.5 rounded-xl text-center leading-relaxed cursor-pointer transition-[color,opacity,filter] duration-300 text-sm sm:text-base font-normal tracking-wide {player.activeLyricIndex === i ? 'text-white opacity-100 drop-shadow-[0_2px_12px_rgba(255,255,255,0.45)]' : 'text-white/35 opacity-70 hover:opacity-100 hover:text-white/80'}"
                  >
                    {line.text.trim() || '• • •'}
                  </button>
                {/each}
              {:else if player.lyrics.plain}
                <div class="whitespace-pre-line text-xs sm:text-sm text-neutral-300 max-w-full px-4 leading-relaxed font-normal my-auto">
                  {player.lyrics.plain}
                </div>
              {:else if player.isLoadingLyrics}
                <div class="flex flex-col items-center justify-center my-auto gap-2 text-neutral-400">
                  <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                  <span class="text-xs font-mono">LOADING LYRICS...</span>
                </div>
              {:else}
                <div class="flex items-center justify-center my-auto text-neutral-400">
                  <p class="text-xs font-mono tracking-wider">NO LYRICS AVAILABLE</p>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- Title, Artist & Like (Directly below art with Highest Refresh Rate Smooth Marquee) -->
        <div class="flex items-center justify-between w-full max-w-md sm:max-w-lg px-2 gap-4">
          <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
            <div class="flex items-center gap-2 w-full">
              <div
                bind:this={titleContainerEl}
                class="relative w-full overflow-hidden"
                style={isTitleOverflowing ? "-webkit-mask-image: linear-gradient(90deg, black 0%, black 85%, transparent 100%); mask-image: linear-gradient(90deg, black 0%, black 85%, transparent 100%);" : ""}
              >
                {#if isTitleOverflowing}
                  <div
                    class="flex items-center gap-8 whitespace-nowrap marquee-track"
                    style="animation-duration: {marqueeTitleDuration}s;"
                  >
                    <h2 class="text-base sm:text-lg md:text-xl font-medium text-white">{cleanTitle}</h2>
                    <h2 class="text-base sm:text-lg md:text-xl font-medium text-white">{cleanTitle}</h2>
                  </div>
                {:else}
                  <h2 class="text-base sm:text-lg md:text-xl font-medium text-white truncate block leading-tight" title={cleanTitle}>
                    {cleanTitle}
                  </h2>
                {/if}
              </div>
            </div>

            <div
              bind:this={artistContainerEl}
              class="relative w-full overflow-hidden mt-0.5"
              style={isArtistOverflowing ? "-webkit-mask-image: linear-gradient(90deg, black 0%, black 85%, transparent 100%); mask-image: linear-gradient(90deg, black 0%, black 85%, transparent 100%);" : ""}
            >
              {#if isArtistOverflowing}
                <div
                  class="flex items-center gap-8 whitespace-nowrap marquee-track"
                  style="animation-duration: {marqueeArtistDuration}s;"
                >
                  <p class="text-xs sm:text-sm text-neutral-400 font-normal">{cleanArtist}</p>
                  <p class="text-xs sm:text-sm text-neutral-400 font-normal">{cleanArtist}</p>
                </div>
              {:else}
                <p class="text-xs sm:text-sm text-neutral-400 font-normal truncate block leading-tight" title={cleanArtist}>
                  {cleanArtist}
                </p>
              {/if}
            </div>
          </div>

          <!-- Like Action -->
          <button
            onclick={() => player.toggleLike()}
            class="p-2 transition-colors flex-shrink-0 cursor-pointer {player.isLiked ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
            title={player.isLiked ? 'Unlike' : 'Like'}
            aria-label="Like track"
          >
            <svg class="w-5 h-5 {player.isLiked ? 'fill-current' : 'fill-none'}" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Right Column: Queue / Songs List (No headings, no separators, seamless animation) -->
      <div
        class="flex flex-col justify-center h-full max-h-[75vh] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden {showSimilar ? 'flex-1 max-w-md lg:max-w-lg opacity-100 translate-x-0' : 'w-0 max-w-0 opacity-0 translate-x-12 pointer-events-none'}"
      >
        <div
          bind:this={similarScrollEl}
          onscroll={handleSimilarScroll}
          class="flex-1 overflow-y-auto pr-1 flex flex-col gap-1 select-none border-none no-scrollbar smooth-scroll-container"
        >
          {#if player.currentContext.type === 'search' && isLoadingSimilar}
            <div class="flex flex-col items-center justify-center py-24 gap-3 text-neutral-500">
              <div class="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              <span class="text-xs font-mono tracking-wider">TUNING INTO SIMILAR VIBES...</span>
            </div>
          {:else if displayedSongs.length > 0}
            {#each displayedSongs as song, i}
              {@const isPlayingThis = player.currentSong?.id === song.id}
              <div
                role="button"
                tabindex="0"
                data-song-id={song.id}
                onpointerenter={() => player.prefetchStream(song)}
                onclick={() => playRightColumnSong(song, i)}
                onkeydown={(e) => { if (e.key === 'Enter') playRightColumnSong(song, i); }}
                class="flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group border-none virtual-scroll-item {isPlayingThis ? 'bg-accent/15' : 'hover:bg-white/[0.05]'}"
              >
                <div class="w-11 h-11 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0 relative">
                  <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
                  <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <svg class="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="text-xs sm:text-sm font-medium truncate transition-colors {isPlayingThis ? 'text-accent' : 'text-white group-hover:text-neutral-200'}">
                    {song.title}
                  </h4>
                  <p class="text-[11px] sm:text-xs text-neutral-400 truncate mt-0.5">
                    {song.artist}
                  </p>
                </div>
                {#if isPlayingThis && player.isPlaying}
                  <PlayingEqualizer isPlaying={player.isPlaying} />
                {:else}
                  <span class="text-xs text-neutral-500 font-mono flex-shrink-0">
                    {song.duration}
                  </span>
                {/if}
              </div>
            {/each}

            {#if player.currentContext.type === 'search' && isLoadingMoreSimilar}
              <div class="py-4 flex items-center justify-center w-full">
                <div class="w-4 h-4 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </div>
            {/if}
          {:else}
            <div class="py-20 text-center text-xs font-mono text-neutral-500">
              {player.currentContext.type === 'search' ? 'NO SIMILAR TRACKS FOUND' : 'NO TRACKS IN THIS CONTEXT'}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="my-auto flex flex-col items-center justify-center text-center gap-2">
      <p class="text-xs font-mono text-neutral-500">NO TRACK SELECTED</p>
    </div>
  {/if}
</div>
{/if}

<style>
  @keyframes marquee {
    0% {
      transform: translate3d(0, 0, 0);
    }
    100% {
      transform: translate3d(-50%, 0, 0);
    }
  }

  .marquee-track {
    animation: marquee 10s linear infinite;
    will-change: transform;
  }
</style>
