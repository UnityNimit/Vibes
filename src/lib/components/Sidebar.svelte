<script lang="ts">
  import { player } from '../player.svelte';
  import { formatTime } from '../utils';

  interface Props {
    currentTab: 'search' | 'liked' | 'cache' | 'explore';
    onSelectTab: (tab: 'search' | 'liked' | 'cache' | 'explore') => void;
  }

  let { currentTab, onSelectTab }: Props = $props();

  let isDraggingSeek = $state(false);
  let seekVal = $state(0);

  function handleSeekInput(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    seekVal = val;
    isDraggingSeek = true;
  }

  function handleSeekChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    player.seek(val);
    isDraggingSeek = false;
  }
</script>

<aside class="w-72 h-full bg-[#0d0d0f] border-r border-white/5 flex flex-col justify-between select-none p-3.5 flex-shrink-0">
  <!-- Navigation Menu -->
  <div class="flex flex-col gap-5">
    <nav class="flex flex-col gap-1 pt-1">
      <!-- Search Tab -->
      <button
        onclick={() => onSelectTab('search')}
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-xs tracking-wide transition-all {currentTab === 'search' ? 'bg-white/10 text-white font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search</span>
      </button>

      <!-- Liked Songs Tab -->
      <button
        onclick={() => onSelectTab('liked')}
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-xs tracking-wide transition-all {currentTab === 'liked' ? 'bg-white/10 text-white font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <span>Liked Songs</span>
      </button>

      <!-- Offline Cache Tab -->
      <button
        onclick={() => onSelectTab('cache')}
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-xs tracking-wide transition-all {currentTab === 'cache' ? 'bg-white/10 text-white font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Offline Cache</span>
      </button>

      <!-- Explore Tab -->
      <button
        onclick={() => onSelectTab('explore')}
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-xs tracking-wide transition-all {currentTab === 'explore' ? 'bg-white/10 text-white font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span>Explore</span>
      </button>
    </nav>
  </div>

  <!-- Bottom: Integrated Minimalist Player -->
  <div class="mt-auto pt-3 border-t border-white/5 flex flex-col gap-2.5">
    {#if player.currentSong}
      <div class="bg-[#141416] p-3 rounded-xl border border-white/5 flex flex-col gap-2.5">
        <!-- Thumbnail & Metadata -->
        <div class="flex items-center gap-2.5">
          <div class="relative w-11 h-11 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0">
            {#if player.currentSong.thumb}
              <img src={player.currentSong.thumb} alt="" class="w-full h-full object-cover grayscale-25" />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-neutral-600">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              </div>
            {/if}
            {#if player.isLoading}
              <div class="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div class="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>

          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-semibold text-white truncate leading-tight" title={player.currentSong.title}>
              {player.currentSong.title}
            </h4>
            <p class="text-[11px] text-neutral-400 truncate mt-0.5" title={player.currentSong.artist}>
              {player.currentSong.artist}
            </p>
          </div>

          <!-- Like Toggle -->
          <button
            onclick={() => player.toggleLike()}
            class="p-1.5 rounded hover:bg-white/5 transition-colors {player.isLiked ? 'text-white' : 'text-neutral-500 hover:text-white'}"
            title={player.isLiked ? 'Unlike' : 'Like'}
          >
            <svg class="w-4 h-4 {player.isLiked ? 'fill-current' : 'fill-none'}" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>
        </div>

        <!-- Scrubber -->
        <div class="flex flex-col gap-1">
          <input
            type="range"
            min="0"
            max={player.duration || 100}
            step="0.1"
            value={isDraggingSeek ? seekVal : player.currentTime}
            oninput={handleSeekInput}
            onchange={handleSeekChange}
            class="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-white"
          />
          <div class="flex justify-between text-[10px] text-neutral-500 font-mono px-0.5">
            <span>{formatTime(isDraggingSeek ? seekVal : player.currentTime)}</span>
            <span>{formatTime(player.duration)}</span>
          </div>
        </div>

        <!-- Player Controls -->
        <div class="flex items-center justify-between px-1">
          <!-- Lyrics Toggle -->
          <button
            onclick={() => (player.showLyrics = !player.showLyrics)}
            class="p-1 rounded text-[11px] font-mono tracking-wider transition-colors {player.showLyrics ? 'text-white font-bold' : 'text-neutral-500 hover:text-white'}"
            title="Toggle Lyrics"
          >
            LRC
          </button>

          <!-- Prev -->
          <button
            onclick={() => player.prev()}
            class="p-1 text-neutral-400 hover:text-white transition-colors"
            title="Previous"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <!-- Play / Pause -->
          <button
            onclick={() => player.togglePlay()}
            class="w-8 h-8 rounded-full bg-white hover:bg-neutral-200 text-black flex items-center justify-center transition-all active:scale-95"
            title={player.isPlaying ? 'Pause' : 'Play'}
          >
            {#if player.isPlaying}
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            {:else}
              <svg class="w-3.5 h-3.5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </button>

          <!-- Next -->
          <button
            onclick={() => player.next()}
            class="p-1 text-neutral-400 hover:text-white transition-colors"
            title="Next"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>

          <!-- Repeat Mode -->
          <button
            onclick={() => player.toggleRepeat()}
            class="p-1 text-neutral-500 hover:text-white transition-colors {player.repeatMode !== 'off' ? 'text-white' : ''}"
            title="Repeat"
          >
            {#if player.repeatMode === 'one'}
              <span class="text-[10px] font-mono font-bold">1</span>
            {:else}
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            {/if}
          </button>
        </div>

        <!-- Volume & Cache Indicator -->
        <div class="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
          <div class="flex items-center gap-1.5 text-neutral-400">
            <button onclick={() => player.toggleMute()} class="hover:text-white">
              {#if player.isMuted || player.volume === 0}
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              {:else}
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              {/if}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={player.volume}
              oninput={(e) => player.setVolume(parseFloat((e.target as HTMLInputElement).value))}
              class="w-16 h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-white"
            />
          </div>

          <!-- Status Indicator: Monochromatic -->
          <div class="flex items-center gap-1.5 text-neutral-400 font-mono text-[10px] tracking-wider uppercase">
            <span class="w-1.5 h-1.5 rounded-full {player.isCached ? 'bg-white' : 'bg-neutral-600'}"></span>
            <span>{player.isCached ? 'CACHED' : 'STREAM'}</span>
          </div>
        </div>
      </div>
    {:else}
      <div class="bg-[#141416]/40 border border-white/5 p-3 rounded-xl flex items-center justify-center text-center">
        <p class="text-[11px] text-neutral-500 font-mono">STANDBY</p>
      </div>
    {/if}
  </div>
</aside>
