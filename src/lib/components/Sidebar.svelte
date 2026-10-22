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

<aside class="w-80 h-screen bg-[#0f111a] border-r border-white/5 flex flex-col justify-between select-none p-4 flex-shrink-0">
  <!-- Top: Logo & Navigation -->
  <div class="flex flex-col gap-6">
    <!-- Branding -->
    <div class="flex items-center gap-3 px-2 pt-2">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-400 flex items-center justify-center shadow-lg shadow-pink-500/20">
        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <div>
        <h1 class="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          Vibes
          <span class="text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30">
            PRO
          </span>
        </h1>
        <p class="text-xs text-neutral-400">Zero Lag • Ad-Free</p>
      </div>
    </div>

    <!-- Navigation Menu -->
    <nav class="flex flex-col gap-1.5">
      <!-- Search Tab -->
      <button
        onclick={() => onSelectTab('search')}
        class="flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all {currentTab === 'search' ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/30 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>Search</span>
      </button>

      <!-- Liked Songs Tab -->
      <button
        onclick={() => onSelectTab('liked')}
        class="flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all {currentTab === 'liked' ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/30 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        <span>Liked Songs</span>
      </button>

      <!-- Offline Cache Tab -->
      <button
        onclick={() => onSelectTab('cache')}
        class="flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all {currentTab === 'cache' ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/30 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span class="flex-1 text-left">Offline Cache</span>
        <span class="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">Auto</span>
      </button>

      <!-- Explore / Quick Picks Tab -->
      <button
        onclick={() => onSelectTab('explore')}
        class="flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all {currentTab === 'explore' ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/30 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Explore Picks</span>
      </button>
    </nav>
  </div>

  <!-- Bottom: Integrated Sidebar Music Player -->
  <div class="mt-auto pt-4 border-t border-white/5 flex flex-col gap-3">
    {#if player.currentSong}
      <!-- Now Playing Card -->
      <div class="bg-[#181a24] p-3 rounded-2xl border border-white/5 flex flex-col gap-3 shadow-xl">
        <!-- Thumbnail & Metadata -->
        <div class="flex items-center gap-3">
          <div class="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-800 flex-shrink-0 group">
            {#if player.currentSong.thumb}
              <img src={player.currentSong.thumb} alt={player.currentSong.title} class="w-full h-full object-cover" />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-neutral-500">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              </div>
            {/if}
            {#if player.isLoading}
              <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div class="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>

          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-semibold text-white truncate leading-tight" title={player.currentSong.title}>
              {player.currentSong.title}
            </h4>
            <p class="text-xs text-neutral-400 truncate mt-0.5" title={player.currentSong.artist}>
              {player.currentSong.artist}
            </p>
          </div>

          <!-- Like Toggle -->
          <button
            onclick={() => player.toggleLike()}
            class="p-2 rounded-lg hover:bg-white/5 transition-colors {player.isLiked ? 'text-pink-500' : 'text-neutral-500 hover:text-white'}"
            title={player.isLiked ? 'Unlike' : 'Like'}
          >
            <svg class="w-5 h-5 {player.isLiked ? 'fill-current' : 'fill-none'}" viewBox="0 0 24 24" stroke="currentColor">
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
            class="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400"
          />
          <div class="flex justify-between text-[11px] text-neutral-400 px-0.5">
            <span>{formatTime(isDraggingSeek ? seekVal : player.currentTime)}</span>
            <span>{formatTime(player.duration)}</span>
          </div>
        </div>

        <!-- Player Controls -->
        <div class="flex items-center justify-between px-1">
          <!-- Lyrics Toggle -->
          <button
            onclick={() => (player.showLyrics = !player.showLyrics)}
            class="p-1.5 rounded-lg text-xs font-bold transition-colors {player.showLyrics ? 'bg-pink-500/20 text-pink-400' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
            title="Lyrics"
          >
            LRC
          </button>

          <!-- Prev -->
          <button
            onclick={() => player.prev()}
            class="p-1.5 text-neutral-300 hover:text-white transition-colors"
            title="Previous"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <!-- Play / Pause -->
          <button
            onclick={() => player.togglePlay()}
            class="w-10 h-10 rounded-full bg-pink-500 hover:bg-pink-400 text-white flex items-center justify-center shadow-lg shadow-pink-500/30 transition-transform active:scale-95"
            title={player.isPlaying ? 'Pause' : 'Play'}
          >
            {#if player.isPlaying}
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            {:else}
              <svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </button>

          <!-- Next -->
          <button
            onclick={() => player.next()}
            class="p-1.5 text-neutral-300 hover:text-white transition-colors"
            title="Next"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>

          <!-- Repeat Mode -->
          <button
            onclick={() => player.toggleRepeat()}
            class="p-1.5 text-xs transition-colors {player.repeatMode !== 'off' ? 'text-pink-400' : 'text-neutral-400 hover:text-white'}"
            title="Repeat"
          >
            {#if player.repeatMode === 'one'}
              🔂
            {:else}
              🔁
            {/if}
          </button>
        </div>

        <!-- Volume & Cache Tag -->
        <div class="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
          <div class="flex items-center gap-1.5 text-neutral-400">
            <button onclick={() => player.toggleMute()} class="hover:text-white">
              {#if player.isMuted || player.volume === 0}
                🔇
              {:else}
                🔊
              {/if}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={player.volume}
              oninput={(e) => player.setVolume(parseFloat((e.target as HTMLInputElement).value))}
              class="w-16 h-1 bg-neutral-700 rounded appearance-none cursor-pointer accent-pink-500"
            />
          </div>

          <!-- Auto Cache Status -->
          <div class="flex items-center gap-1 px-2 py-0.5 rounded-full {player.isCached ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'} font-medium">
            {#if player.isCached}
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Cached ⚡</span>
            {:else}
              <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
              <span>Streaming 🌐</span>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- Standby Player Box -->
      <div class="bg-[#181a24]/50 border border-white/5 p-4 rounded-2xl flex flex-col items-center justify-center text-center gap-2">
        <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-neutral-400">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <div>
          <p class="text-xs font-medium text-neutral-300">No Track Playing</p>
          <p class="text-[11px] text-neutral-500">Pick any song to start</p>
        </div>
      </div>
    {/if}
  </div>
</aside>
