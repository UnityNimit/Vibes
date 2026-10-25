<script lang="ts">
  import { jamStore } from '../jamStore.svelte';
  import { player } from '../player.svelte';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import JamIcon from './JamIcon.svelte';

  let joinCodeInput = $state<string>('');
  let isCopied = $state<boolean>(false);
  let isHosting = $state<boolean>(false);
  let isJoining = $state<boolean>(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function handleStartHost() {
    if (isHosting) return;
    isHosting = true;
    try {
      await jamStore.hostJam();
    } finally {
      isHosting = false;
    }
  }

  async function handleJoin() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code || isJoining) return;
    isJoining = true;
    try {
      const success = await jamStore.joinJam(code);
      if (success) {
        joinCodeInput = '';
      }
    } finally {
      isJoining = false;
    }
  }

  function handleCopyCode() {
    if (!jamStore.roomCode) return;
    navigator.clipboard.writeText(jamStore.roomCode);
    isCopied = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      isCopied = false;
    }, 2000);
  }

  function handleLeave() {
    jamStore.leaveJam();
  }
</script>

<div class="flex-1 h-full overflow-y-auto px-3 sm:px-6 pt-2 sm:pt-3 pb-28 flex flex-col gap-4 select-none font-sans bg-black w-full smooth-scroll-container">
  {#if jamStore.status === 'connecting'}
    <!-- Connecting State: Ultra-Minimalist Spin Pulse & Cancel Only -->
    <div class="flex-1 flex flex-col items-center justify-center min-h-[260px] sm:min-h-[300px] gap-5 sm:gap-6 my-auto">
      <div class="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border-2 border-accent/20 animate-ping"></div>
        <div class="w-9 h-9 sm:w-10 sm:h-10 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
      <button
        type="button"
        onclick={handleLeave}
        class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
        aria-label="Cancel"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {:else if jamStore.status === 'error'}
    <!-- Error State: Minimal Alert Icon & Dismiss Button Only -->
    <div class="flex-1 flex flex-col items-center justify-center min-h-[260px] sm:min-h-[300px] gap-4 sm:gap-5 my-auto">
      <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
        <svg class="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <button
        type="button"
        onclick={handleLeave}
        class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
        aria-label="Dismiss"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  {:else if jamStore.status === 'connected'}
    <!-- Connected State: Ultra-Minimalist Hub (Zero Text Labels/Descriptions) -->
    <div class="flex flex-col gap-3 sm:gap-4 w-full max-w-xl mx-auto my-auto py-2 sm:py-4">
      <!-- Top Bar: Live Dot + Peer Count on Left, Disconnect on Right -->
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/[0.03] border border-white/5 text-xs font-mono">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="text-white font-semibold">{jamStore.peerCount}</span>
        </div>

        <button
          type="button"
          onclick={handleLeave}
          class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 flex items-center justify-center transition-all cursor-pointer"
          aria-label="Disconnect"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Room Code Banner: Monospace Code & Copy Button Only -->
      <div class="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 sm:gap-4 w-full">
        <span class="text-2xl sm:text-4xl md:text-5xl font-black font-mono tracking-[0.2em] sm:tracking-[0.3em] text-white select-all">
          {jamStore.roomCode}
        </span>

        <button
          type="button"
          onclick={handleCopyCode}
          class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
          aria-label="Copy"
        >
          {#if isCopied}
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          {:else}
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          {/if}
        </button>
      </div>

      <!-- Synced Track Display (No "Now Jamming" header label) -->
      {#if player.currentSong}
        <div class="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 sm:gap-3.5 w-full">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 relative">
              <TrackImage src={player.currentSong.thumb} alt={player.currentSong.title} class="w-full h-full object-cover" />
            </div>
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                {#if player.isPlaying}
                  <PlayingEqualizer isPlaying={player.isPlaying} />
                {/if}
                <h4 class="text-xs sm:text-sm font-semibold text-white truncate">{player.currentSong.title}</h4>
              </div>
              <p class="text-[11px] text-neutral-400 truncate mt-0.5">{player.currentSong.artist}</p>
            </div>
          </div>

          {#if player.currentSong.duration}
            <span class="text-xs font-mono text-neutral-500 flex-shrink-0">
              {player.currentSong.duration}
            </span>
          {/if}
        </div>
      {/if}

      <!-- Host Controls: Tune Icon & Minimal Toggle Only -->
      {#if jamStore.role === 'host'}
        <div class="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between w-full">
          <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white/5 flex items-center justify-center text-neutral-400">
            <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Toggle guest controls"
            aria-checked={jamStore.allowGuestControls}
            onclick={() => jamStore.toggleGuestControls()}
            class="w-9 h-5 rounded-full transition-all duration-200 relative flex-shrink-0 cursor-pointer p-0.5 flex items-center {jamStore.allowGuestControls ? 'bg-accent/20 border border-accent/40' : 'bg-white/10 border border-white/10'}"
          >
            <span
              class="w-3.5 h-3.5 rounded-full transition-transform duration-200 ease-out {jamStore.allowGuestControls ? 'translate-x-4 bg-accent' : 'translate-x-0 bg-neutral-500'}"
            ></span>
          </button>
        </div>
      {/if}

      <!-- Connected Device Icons (Emoji + Host Star Only, Zero Text) -->
      {#if jamStore.members.length > 0}
        <div class="flex items-center flex-wrap gap-2 w-full pt-1">
          {#each jamStore.members as m}
            <div class="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl bg-white/[0.02] border border-white/5">
              <span class="text-xs sm:text-sm">
                {#if m.device === 'android'}
                  📱
                {:else if m.device === 'windows'}
                  💻
                {:else}
                  🌐
                {/if}
              </span>
              {#if m.isHost}
                <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Idle State: 2 Ultra-Minimalist Icon Tiles Side-by-Side (Mobile & Desktop Matching Perfection) -->
    <div class="grid grid-cols-2 gap-2.5 sm:gap-4 w-full max-w-xl mx-auto my-auto py-4 sm:py-8">
      <!-- Tile 1: Host Button (Broadcast Icon + Interactive Dot, Zero Text) -->
      <button
        type="button"
        onclick={handleStartHost}
        disabled={isHosting}
        class="group flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-12 rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/5 hover:border-accent/40 hover:bg-accent/[0.02] active:scale-[0.98] transition-all duration-300 cursor-pointer disabled:opacity-50 min-h-[145px] sm:min-h-[200px]"
        aria-label="Host"
      >
        <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-110 group-hover:bg-accent/20 transition-all duration-300">
          {#if isHosting}
            <div class="w-5 h-5 sm:w-6 sm:h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
          {:else}
            <JamIcon active={false} class="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.8} />
          {/if}
        </div>
        <div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-neutral-600 group-hover:bg-accent group-hover:scale-125 transition-all"></div>
      </button>

      <!-- Tile 2: Join Form Tile (Link Icon + Dots Placeholder + Arrow Button, Zero Text) -->
      <div class="flex flex-col items-center justify-center gap-3 sm:gap-5 p-4 sm:p-12 rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/5 min-h-[145px] sm:min-h-[200px]">
        <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/5 text-neutral-300 flex items-center justify-center">
          <svg class="w-6 h-6 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>

        <form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} class="relative flex items-center w-full max-w-[124px] sm:max-w-xs">
          <input
            type="text"
            maxlength="8"
            bind:value={joinCodeInput}
            oninput={() => { joinCodeInput = joinCodeInput.toUpperCase(); }}
            placeholder="••••••"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            class="w-full bg-white/[0.04] border border-white/10 rounded-xl sm:rounded-2xl pl-2 sm:pl-4 pr-7 sm:pr-11 py-1.5 sm:py-2.5 text-center text-xs sm:text-sm text-white uppercase font-mono tracking-wider sm:tracking-[0.3em] placeholder-neutral-600 focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!joinCodeInput.trim() || isJoining}
            class="absolute right-1 w-5 h-5 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-20 disabled:pointer-events-none text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            aria-label="Join"
          >
            {#if isJoining}
              <div class="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            {:else}
              <svg class="w-2.5 h-2.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            {/if}
          </button>
        </form>
      </div>
    </div>
  {/if}
</div>
