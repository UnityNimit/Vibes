<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import { playlistStore } from '../playlistStore.svelte';
  import { likedStore } from '../likedStore.svelte';
  import { savedStore } from '../savedStore.svelte';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import type { SearchPage, Song } from '../types';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

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
