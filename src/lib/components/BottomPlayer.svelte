<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobile } from '../platform';
  import { player } from '../player.svelte';
  import { playlistStore } from '../playlistStore.svelte';
  import { jamStore } from '../jamStore.svelte';
  import { formatTime } from '../utils';
  import WaveProgressBar from './WaveProgressBar.svelte';
  import TrackImage from './TrackImage.svelte';
  import RepeatIcon from './RepeatIcon.svelte';

  interface Props {
    currentTab?: 'search' | 'liked' | 'saved' | 'playlists' | 'jam' | 'settings' | 'now_playing';
    onToggleNowPlaying: () => void;
    onSelectTab?: (tab: 'search' | 'liked' | 'saved' | 'playlists' | 'jam' | 'settings' | 'now_playing') => void;
  }

  let { currentTab, onToggleNowPlaying, onSelectTab }: Props = $props();

  let isMobilePlayer = $state(isMobile());

  onMount(() => {
    isMobilePlayer = isMobile();
  });

  let showPlaylistMenu = $state(false);
  let showCreateInput = $state(false);
  let newPlaylistInput = $state('');
  let playlistPopupEl = $state<HTMLDivElement | null>(null);
  let playlistButtonEl = $state<HTMLButtonElement | null>(null);
  let createInputEl = $state<HTMLInputElement | null>(null);

  let isCurrentSongInAnyPlaylist = $derived(
    player.currentSong ? playlistStore.isSongInAnyPlaylist(player.currentSong.id) : false
  );

  function toggleCreateInput() {
    showCreateInput = !showCreateInput;
    if (showCreateInput) {
      requestAnimationFrame(() => {
        createInputEl?.focus();
      });
    }
  }

  function onWindowClick(e: MouseEvent) {
    if (
      showPlaylistMenu &&
      playlistPopupEl &&
      !playlistPopupEl.contains(e.target as Node) &&
      !playlistButtonEl?.contains(e.target as Node)
    ) {
      showPlaylistMenu = false;
      showCreateInput = false;
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && showPlaylistMenu) {
      showPlaylistMenu = false;
      showCreateInput = false;
    }
  }

  async function handleCreatePlaylistInMenu() {
    const name = newPlaylistInput.trim();
    if (!name) return;
    const pl = await playlistStore.create(name);
    if (pl && player.currentSong) {
      await playlistStore.toggleSong(pl.id, player.currentSong);
    }
    newPlaylistInput = '';
    showCreateInput = false;
  }

  let titleContainerEl = $state<HTMLDivElement | null>(null);
  let measureSpanEl = $state<HTMLSpanElement | null>(null);
  let isTitleOverflowing = $state<boolean>(false);
  let marqueeDuration = $state<number>(10);

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

  function checkTitleOverflow() {
    if (!titleContainerEl || !measureSpanEl || !player.currentSong) {
      isTitleOverflowing = false;
      return;
    }
    const textWidth = measureSpanEl.offsetWidth;
    const containerWidth = titleContainerEl.clientWidth;
    if (containerWidth > 0 && textWidth > containerWidth) {
      isTitleOverflowing = true;
      // Constant velocity scrolling: ~35px per second
      marqueeDuration = Math.max(6, (textWidth + 32) / 35);
    } else {
      isTitleOverflowing = false;
    }
  }

  $effect(() => {
    const title = player.currentSong ? getCleanTitle(player.currentSong) : '';
    if (title) {
      requestAnimationFrame(() => {
        checkTitleOverflow();
      });
    }
  });

  $effect(() => {
    if (!titleContainerEl) return;
    const ro = new ResizeObserver(() => {
      checkTitleOverflow();
    });
    ro.observe(titleContainerEl);
    return () => ro.disconnect();
  });
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

{#if player.currentSong}
  <!-- Hidden measuring element to detect exact title overflow in pixels -->
  <span
    bind:this={measureSpanEl}
    class="text-xs sm:text-sm font-medium whitespace-nowrap pointer-events-none"
    style="position: fixed; top: -9999px; left: -9999px; visibility: hidden; opacity: 0;"
  >
    {getCleanTitle(player.currentSong)}
  </span>

  <div
    class="fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-2xl px-4 sm:px-6 flex items-center justify-between select-none shadow-2xl transition-all duration-300 font-sans overflow-visible"
    style="height: {isMobilePlayer ? 'calc(5rem + env(safe-area-inset-bottom, 0px))' : '5rem'}; padding-bottom: env(safe-area-inset-bottom, 0px);"
  >
    {#if isMobilePlayer}
      <!-- Top Edge Animated Wave Progress Bar for Mobile (Starts at 84px to avoid the poked-out vinyl disc) -->
      <div
        class="absolute top-0 right-0 h-4 -translate-y-2 flex items-center z-30 select-none overflow-hidden"
        style="left: 84px;"
      >
        <WaveProgressBar
          height={16}
          amplitude={2.0}
          wavelength={18}
          thumbRadius={3.5}
          class="w-full"
        />
      </div>

      <!-- Android Mobile Bottom Player Layout -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onclick={onToggleNowPlaying}
        class="flex items-center justify-between w-full h-full relative cursor-pointer"
      >
        <!-- Left: Vinyl Disc + Title + Artist (flexible width) -->
        <div class="flex items-center gap-3 min-w-0 flex-1 pr-3">
          <!-- Floating Borderless Vinyl/CD Artwork Poking Out of the Bottom Player Bar -->
          <div
            class="relative w-16 h-16 -translate-y-3 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_8px_24px_rgba(0,0,0,0.85)] hover:scale-105 transition-transform duration-200"
            aria-label="Open Now Playing"
          >
            <!-- The Spinning Circular Disc -->
            <div class="relative w-full h-full rounded-full overflow-hidden cd-disc {player.isPlaying ? '' : 'cd-paused'} border border-white/20">
              <TrackImage
                src={player.currentSong.thumb}
                songId={player.currentSong.id}
                alt={player.currentSong.title}
                class="w-full h-full object-cover select-none pointer-events-none"
                iconClass="w-6 h-6 text-neutral-500"
                highQuality={true}
              />

              <!-- Iridescent Vinyl/CD Grooves & Radial Reflection -->
              <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-white/15 via-transparent to-white/20 pointer-events-none"></div>

              <!-- Concentric Vinyl Groove Rings -->
              <div class="absolute inset-2 rounded-full border border-white/10 pointer-events-none"></div>
              <div class="absolute inset-4 rounded-full border border-white/[0.07] pointer-events-none"></div>

              <!-- Center Spindle Hole / Ring of the CD -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="w-4 h-4 rounded-full bg-black/95 border border-white/40 flex items-center justify-center shadow-lg">
                  <div class="w-1.5 h-1.5 rounded-full bg-neutral-200 shadow-sm"></div>
                </div>
              </div>
            </div>

            {#if player.isLoading}
              <div class="absolute inset-0 bg-black/70 rounded-full flex items-center justify-center z-10">
                <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>

          <!-- Title & Artist -->
          <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
            <div class="flex items-center min-w-0">
              <div
                bind:this={titleContainerEl}
                class="flex-1 min-w-0 overflow-hidden relative"
                style={isTitleOverflowing ? 'mask-image: linear-gradient(to right, black calc(100% - 16px), transparent 100%); -webkit-mask-image: linear-gradient(to right, black calc(100% - 16px), transparent 100%);' : ''}
              >
                {#if isTitleOverflowing}
                  <div
                    class="inline-flex marquee-track will-change-transform cursor-pointer"
                    style="animation-duration: {marqueeDuration}s;"
                  >
                    <span class="pr-8 whitespace-nowrap text-sm font-medium text-white">{getCleanTitle(player.currentSong)}</span>
                    <span class="pr-8 whitespace-nowrap text-sm font-medium text-white" aria-hidden="true">{getCleanTitle(player.currentSong)}</span>
                  </div>
                {:else}
                  <p class="text-sm font-medium text-white truncate text-left block w-full">
                    {getCleanTitle(player.currentSong)}
                  </p>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-2 mt-0.5 min-w-0">
              <p class="text-xs text-neutral-400 font-normal truncate">
                {getCleanArtist(player.currentSong)}
              </p>
              {#if jamStore.status === 'connected'}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); onSelectTab ? onSelectTab('jam') : jamStore.open(); }}
                  class="flex items-center gap-1.5 text-[9px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 flex-shrink-0 cursor-pointer"
                  title="Jam"
                  aria-label="Jam"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
                  <span>{jamStore.peerCount}</span>
                </button>
              {/if}
            </div>
          </div>
        </div>

        <!-- Right: Play/Pause & Next Song Only -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="flex items-center gap-2.5 flex-shrink-0" onclick={(e) => e.stopPropagation()}>
          <!-- Play / Pause -->
          <button
            onclick={(e) => { e.stopPropagation(); player.togglePlay(); }}
            class="relative w-11 h-11 rounded-full bg-accent text-accent-contrast flex items-center justify-center hover:opacity-90 active:scale-95 transition-all duration-150 cursor-pointer shadow-md overflow-hidden flex-shrink-0"
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
          >
            {#if player.isLoading}
              <div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            {:else if player.isPlaying}
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M8 6a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-3 0v-9A1.5 1.5 0 0 1 8 6zm8 0a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-3 0v-9A1.5 1.5 0 0 1 16 6z"/>
              </svg>
            {:else}
              <svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                <path d="M8.5 5.5a1.5 1.5 0 0 0-2.25 1.3v10.4a1.5 1.5 0 0 0 2.25 1.3l9-5.2a1.5 1.5 0 0 0 0-2.6l-9-5.2z"/>
              </svg>
            {/if}
          </button>

          <!-- Next -->
          <button
            onclick={(e) => { e.stopPropagation(); player.next(); }}
            class="w-10 h-10 rounded-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150 cursor-pointer flex-shrink-0"
            aria-label="Next track"
          >
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M17 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm-11.3 1.3a1 1 0 0 1 1.6-.8l7 5a1 1 0 0 1 0 1.6l-7 5a1 1 0 0 1-1.6-.8v-10z"/>
            </svg>
          </button>
        </div>
      </div>
    {:else}
      <!-- Left Section: Track Artwork & Info (Expanded width for song name) -->
      <div class="flex items-center gap-4 min-w-0 w-72 sm:w-80 md:w-96 flex-shrink-0">
      <!-- Floating Borderless Vinyl/CD Artwork Poking Out of the Bottom Player Bar -->
      <button
        onclick={onToggleNowPlaying}
        class="relative w-16 h-16 sm:w-[72px] sm:h-[72px] -translate-y-3 sm:-translate-y-4 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer group shadow-[0_8px_24px_rgba(0,0,0,0.85)] hover:scale-105 transition-transform duration-200"
        title="Open Now Playing"
      >
        <!-- The Spinning Circular Disc (No outer container box) -->
        <div class="relative w-full h-full rounded-full overflow-hidden cd-disc {player.isPlaying ? '' : 'cd-paused'} border border-white/20">
          <TrackImage
            src={player.currentSong.thumb}
            songId={player.currentSong.id}
            alt={player.currentSong.title}
            class="w-full h-full object-cover select-none pointer-events-none"
            iconClass="w-6 h-6 text-neutral-500"
            highQuality={true}
          />

          <!-- Iridescent Vinyl/CD Grooves & Radial Reflection -->
          <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-white/15 via-transparent to-white/20 pointer-events-none"></div>

          <!-- Concentric Vinyl Groove Rings -->
          <div class="absolute inset-2 rounded-full border border-white/10 pointer-events-none"></div>
          <div class="absolute inset-4 rounded-full border border-white/[0.07] pointer-events-none"></div>

          <!-- Center Spindle Hole / Ring of the CD -->
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="w-4 h-4 rounded-full bg-black/95 border border-white/40 flex items-center justify-center shadow-lg">
              <div class="w-1.5 h-1.5 rounded-full bg-neutral-200 shadow-sm"></div>
            </div>
          </div>
        </div>

        {#if player.isLoading}
          <div class="absolute inset-0 bg-black/70 rounded-full flex items-center justify-center z-10">
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        {/if}

        <!-- Hover Overlay -->
        <div class="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 pointer-events-none">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </div>
      </button>

      <!-- Metadata with Wide Space & Smooth Marquee for Long Names -->
      <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
        <div class="flex items-center gap-1.5 min-w-0">
          <div
            bind:this={titleContainerEl}
            class="flex-1 min-w-0 overflow-hidden relative"
            style={isTitleOverflowing ? 'mask-image: linear-gradient(to right, black calc(100% - 16px), transparent 100%); -webkit-mask-image: linear-gradient(to right, black calc(100% - 16px), transparent 100%);' : ''}
          >
            {#if isTitleOverflowing}
              <div
                class="inline-flex marquee-track will-change-transform cursor-pointer"
                style="animation-duration: {marqueeDuration}s;"
                onclick={onToggleNowPlaying}
                role="button"
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleNowPlaying(); }}
                title={getCleanTitle(player.currentSong)}
              >
                <span class="pr-8 whitespace-nowrap text-xs sm:text-sm font-medium text-white">{getCleanTitle(player.currentSong)}</span>
                <span class="pr-8 whitespace-nowrap text-xs sm:text-sm font-medium text-white" aria-hidden="true">{getCleanTitle(player.currentSong)}</span>
              </div>
            {:else}
              <button
                onclick={onToggleNowPlaying}
                class="text-xs sm:text-sm font-medium text-white truncate text-left hover:underline cursor-pointer block w-full"
                title={getCleanTitle(player.currentSong)}
              >
                {getCleanTitle(player.currentSong)}
              </button>
            {/if}
          </div>
        </div>
        <div class="flex items-center gap-2 mt-0.5 min-w-0">
          <p class="text-xs text-neutral-400 font-normal truncate" title={getCleanArtist(player.currentSong)}>
            {getCleanArtist(player.currentSong)}
          </p>
          {#if jamStore.status === 'connected'}
            <button
              type="button"
              onclick={() => onSelectTab ? onSelectTab('jam') : jamStore.open()}
              class="flex items-center gap-1.5 text-[9px] font-mono px-2 py-0.5 rounded-full bg-accent/15 hover:bg-accent/25 text-accent border border-accent/25 flex-shrink-0 cursor-pointer transition-colors"
              title="Jam"
              aria-label="Jam"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
              <span>{jamStore.peerCount}</span>
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Center Section: Playback Controls & Wave Scrubber -->
    <div class="flex-1 max-w-2xl px-4 flex flex-col items-center gap-1">
      <!-- Controls Row (Unified, Ergonomic Button Spacing & Sizing) -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Like / Heart Button (Placed where shuffle used to be) -->
        <button
          onclick={() => player.toggleLike()}
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150 cursor-pointer {player.isLiked ? 'text-accent' : ''}"
          title={player.isLiked ? 'Unlike' : 'Like'}
          aria-label={player.isLiked ? 'Unlike' : 'Like'}
        >
          <svg class="w-5 h-5 {player.isLiked ? 'fill-current' : 'fill-none'}" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>

        <!-- Prev -->
        <button
          onclick={() => player.prev()}
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150 cursor-pointer"
          title="Previous track"
          aria-label="Previous track"
        >
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M7 6a1 1 0 0 0-1 1v10a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1zm11.3 1.3a1 1 0 0 0-1.6-.8l-7 5a1 1 0 0 0 0 1.6l7 5a1 1 0 0 0 1.6-.8v-10z"/>
          </svg>
        </button>

        <!-- Play / Pause -->
        <button
          onclick={() => player.togglePlay()}
          class="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-accent text-accent-contrast flex items-center justify-center hover:opacity-90 active:scale-95 transition-opacity duration-150 cursor-pointer shadow-md overflow-hidden flex-shrink-0"
          title={player.isPlaying ? 'Pause' : 'Play'}
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
        >
          {#if player.isLoading}
            <div class="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          {:else if player.isPlaying}
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M8 6a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-3 0v-9A1.5 1.5 0 0 1 8 6zm8 0a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-3 0v-9A1.5 1.5 0 0 1 16 6z"/>
            </svg>
          {:else}
            <svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8.5 5.5a1.5 1.5 0 0 0-2.25 1.3v10.4a1.5 1.5 0 0 0 2.25 1.3l9-5.2a1.5 1.5 0 0 0 0-2.6l-9-5.2z"/>
            </svg>
          {/if}
        </button>

        <!-- Next -->
        <button
          onclick={() => player.next()}
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150 cursor-pointer"
          title="Next track"
          aria-label="Next track"
        >
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M17 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm-11.3 1.3a1 1 0 0 1 1.6-.8l7 5a1 1 0 0 1 0 1.6l-7 5a1 1 0 0 1-1.6-.8v-10z"/>
          </svg>
        </button>

        <!-- Repeat / Shuffle (Custom Morphing Icon: Line -> Circle -> 8 Loop Shuffle -> Line) -->
        <button
          onclick={() => player.toggleRepeat()}
          class="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150 cursor-pointer {player.repeatMode !== 'off' ? 'text-accent' : ''}"
          title={player.repeatMode === 'one' ? 'Repeat One (Click for Shuffle)' : player.repeatMode === 'shuffle' ? 'Shuffle (Click for Off)' : 'Sequential (Click for Repeat One)'}
          aria-label="Toggle repeat or shuffle mode"
        >
          <RepeatIcon mode={player.repeatMode} size={20} />
        </button>
      </div>

      <!-- Scrubber Row -->
      <div class="flex items-center gap-2.5 w-full">
        <span class="text-xs text-neutral-500 font-mono w-9 text-right flex-shrink-0">
          {formatTime(player.currentTime)}
        </span>
        <div class="flex-1 flex flex-col justify-center">
          <WaveProgressBar
            height={20}
            amplitude={2.5}
            wavelength={20}
            thumbRadius={4}
          />
        </div>
        <span class="text-xs text-neutral-500 font-mono w-9 text-left flex-shrink-0">
          {formatTime(player.duration)}
        </span>
      </div>
    </div>

    <!-- Right Section: Playlist, Download/Saved, Like, Mute & Volume Controls -->
    <div class="flex items-center justify-end gap-2 sm:gap-3 w-60 sm:w-72 flex-shrink-0 text-neutral-400 relative">
      <!-- Playlist Popover -->
      {#if showPlaylistMenu}
        <div
          bind:this={playlistPopupEl}
          class="absolute bottom-14 right-20 sm:right-28 w-60 bg-[#0e0e11] border border-white/10 rounded-2xl shadow-2xl p-3 z-50 flex flex-col gap-2.5 backdrop-blur-xl"
        >
          <!-- Header: Clean Plus on Top Left (No Container), Title "Playlists", No Cross Button -->
          <div class="flex items-center gap-2 px-1">
            <button
              type="button"
              onclick={toggleCreateInput}
              class="text-neutral-400 hover:text-white transition-colors cursor-pointer p-0.5 flex items-center justify-center"
              title="New playlist"
              aria-label="New playlist"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <span class="text-xs font-mono tracking-wider text-neutral-400 select-none">Playlists</span>
          </div>

          <!-- Quick Create Inline Input -->
          {#if showCreateInput}
            <div class="px-1">
              <input
                bind:this={createInputEl}
                type="text"
                bind:value={newPlaylistInput}
                onkeydown={(e) => {
                  if (e.key === 'Enter') handleCreatePlaylistInMenu();
                  if (e.key === 'Escape') showCreateInput = false;
                }}
                placeholder="Playlist name..."
                class="w-full bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-accent"
              />
            </div>
          {/if}

          <!-- Playlists List -->
          <div class="max-h-48 overflow-y-auto flex flex-col gap-1 no-scrollbar pr-0.5">
            {#if playlistStore.playlists.length === 0}
              <p class="text-center py-4 text-[11px] font-mono text-neutral-500">NO PLAYLISTS YET</p>
            {:else}
              {#each playlistStore.playlists as pl}
                {@const inPl = player.currentSong ? playlistStore.isSongInPlaylist(pl.id, player.currentSong.id) : false}
                <button
                  type="button"
                  onclick={() => player.currentSong && playlistStore.toggleSong(pl.id, player.currentSong)}
                  class="flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer text-left group"
                >
                  <div class="flex-1 min-w-0 pr-2">
                    <p class="text-xs font-medium text-white truncate">{pl.name}</p>
                    <p class="text-[10px] font-mono text-neutral-500">{pl.songs.length} {pl.songs.length === 1 ? 'track' : 'tracks'}</p>
                  </div>
                  {#if inPl}
                    <svg class="w-4 h-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      <!-- Add to Playlist Action (Just left to the download button) -->
      <button
        bind:this={playlistButtonEl}
        type="button"
        onclick={() => (showPlaylistMenu = !showPlaylistMenu)}
        class="p-1.5 transition-colors cursor-pointer flex-shrink-0 {isCurrentSongInAnyPlaylist ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
        title="Playlists"
        aria-label="Playlists"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>

      <!-- Download / Saved Status (Just left to the heart like icon) -->
      <button
        onclick={() => player.toggleDownload()}
        disabled={player.isDownloading}
        class="p-1.5 transition-colors cursor-pointer flex-shrink-0 {player.isCached ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
        title={player.isDownloading ? 'Downloading...' : player.isCached ? 'Saved offline (click to remove)' : 'Download for offline playback'}
        aria-label="Download or remove song"
      >
        {#if player.isDownloading}
          <div class="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        {:else if player.isCached}
          <!-- Saved Tick Icon -->
          <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <!-- Download Icon -->
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        {/if}
      </button>



      <!-- Mute Toggle -->
      <button onclick={() => player.toggleMute()} class="hover:text-white transition-colors cursor-pointer" title="Mute">
        {#if player.isMuted || player.volume === 0}
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        {/if}
      </button>

      <!-- Volume Bar (Identical 3px Thickness, Centered, Non-Clipping 18px Hitbox) -->
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={player.volume}
        oninput={(e) => player.setVolume(parseFloat((e.target as HTMLInputElement).value))}
        style="background: linear-gradient(to right, var(--accent) 0%, var(--accent) {player.volume * 100}%, rgba(255,255,255,0.12) {player.volume * 100}%, rgba(255,255,255,0.12) 100%); background-size: 100% 3px; background-position: center; background-repeat: no-repeat;"
        class="w-20 sm:w-28 h-[18px] appearance-none cursor-pointer"
        title="Volume"
      />
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

  @keyframes cd-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .cd-disc {
    animation: cd-spin 12s linear infinite;
    will-change: transform;
  }

  .cd-paused {
    animation-play-state: paused;
  }
</style>
