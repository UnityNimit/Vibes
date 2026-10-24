<script lang="ts">
  import { jamStore } from '../jamStore.svelte';
  import { player } from '../player.svelte';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';

  let joinCodeInput = $state<string>('');
  let isCopied = $state<boolean>(false);
  let isHosting = $state<boolean>(false);
  let isJoining = $state<boolean>(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function handleStartHost() {
    isHosting = true;
    try {
      await jamStore.hostJam();
    } finally {
      isHosting = false;
    }
  }

  async function handleJoin() {
    if (!joinCodeInput.trim()) return;
    isJoining = true;
    try {
      const success = await jamStore.joinJam(joinCodeInput);
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

<div class="flex-1 h-full overflow-y-auto px-3 sm:px-6 pt-2 sm:pt-3 pb-28 flex flex-col gap-6 select-none font-sans bg-black w-full smooth-scroll-container">
  <!-- Minimalist Header (Full Width, Zero Partition Line, Aligned with Sidebar) -->
  <div class="flex items-center justify-between min-h-10 -mb-2 w-full select-none">
    {#if jamStore.status === 'connected'}
      <div class="flex items-center gap-2 text-xs font-mono">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-white capitalize font-semibold">{jamStore.role}</span>
        <span class="text-neutral-500">•</span>
        <span class="text-neutral-400">{jamStore.peerCount} {jamStore.peerCount === 1 ? 'device' : 'devices'} connected</span>
        {#if jamStore.rttMs > 0}
          <span class="text-neutral-500">• {jamStore.rttMs}ms ping</span>
        {/if}
      </div>

      <button
        type="button"
        onclick={handleLeave}
        class="text-xs font-mono text-red-400/80 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <span>✕</span>
        <span>{jamStore.role === 'host' ? 'END JAM' : 'LEAVE JAM'}</span>
      </button>
    {:else}
      <p class="text-xs text-neutral-500 font-mono tracking-wider uppercase">
        {#if jamStore.status === 'connecting'}
          CONNECTING TO SESSION...
        {:else if jamStore.status === 'error'}
          CONNECTION FAILED
        {:else}
          CROSS-PLATFORM SYNC
        {/if}
      </p>
    {/if}
  </div>

  {#if jamStore.status === 'connecting'}
    <!-- Connecting State Card -->
    <div class="flex flex-col items-center justify-center py-16 gap-3 bg-white/[0.02] border border-white/5 rounded-2xl w-full text-center">
      <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      <p class="text-sm font-medium text-white">Connecting to Jam Session...</p>
      <p class="text-xs text-neutral-500 font-mono">Establishing peer-to-peer data channel</p>
      <button
        type="button"
        onclick={handleLeave}
        class="mt-2 px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer font-mono"
      >
        Cancel
      </button>
    </div>
  {:else if jamStore.status === 'error'}
    <!-- Error State Notice -->
    <div class="flex flex-col items-center justify-center py-10 gap-3 bg-red-500/[0.04] border border-red-500/20 rounded-2xl p-6 w-full text-center">
      <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p class="text-sm font-medium text-red-400 font-mono">{jamStore.errorMessage || 'Connection failed'}</p>
      <button
        type="button"
        onclick={handleLeave}
        class="mt-1 px-4 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs text-red-300 transition-colors cursor-pointer font-mono"
      >
        Dismiss / Try Again
      </button>
    </div>
  {:else if jamStore.status === 'connected'}
    <!-- Active Session View (Modeled like Playlists detail view) -->
    <div class="flex flex-col gap-5 w-full">
      <!-- Room Code Hero Banner -->
      <div class="p-5 sm:p-6 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div class="flex flex-col gap-1">
          <span class="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Jam Room Code</span>
          <div class="flex items-center gap-3">
            <span class="text-3xl sm:text-4xl font-extrabold font-mono tracking-widest text-white">{jamStore.roomCode}</span>
          </div>
          <span class="text-xs text-neutral-500 font-sans mt-0.5">Share this code with friends to join in lockstep</span>
        </div>

        <button
          type="button"
          onclick={handleCopyCode}
          class="self-start sm:self-center px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-mono text-white flex items-center gap-2 transition-all cursor-pointer active:scale-95"
        >
          {#if isCopied}
            <svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-emerald-400 font-semibold">Copied!</span>
          {:else}
            <svg class="w-4 h-4 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Copy Code</span>
          {/if}
        </button>
      </div>

      <!-- Now Jamming Track (If song playing) -->
      {#if player.currentSong}
        <div class="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-4 w-full">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 shadow-lg relative">
              <TrackImage src={player.currentSong.thumb} alt={player.currentSong.title} class="w-full h-full object-cover" />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] font-mono uppercase tracking-widest text-accent font-semibold flex items-center gap-1.5">
                {#if player.isPlaying}
                  <PlayingEqualizer isPlaying={player.isPlaying} />
                {/if}
                Now Jamming
              </span>
              <h4 class="text-sm sm:text-base font-semibold text-white truncate mt-0.5">{player.currentSong.title}</h4>
              <p class="text-xs text-neutral-400 truncate mt-0.5">{player.currentSong.artist}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="text-xs font-mono text-neutral-500">
              {player.currentSong.duration || ''}
            </span>
          </div>
        </div>
      {/if}

      <!-- Host DJ Controls Setting (Host Only) -->
      {#if jamStore.role === 'host'}
        <div class="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-4 w-full">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs sm:text-sm font-medium text-white">Guest DJ Controls</span>
            <span class="text-[11px] text-neutral-500">Allow connected guests to skip, pause/play, and add songs</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Toggle guest controls"
            aria-checked={jamStore.allowGuestControls}
            onclick={() => jamStore.toggleGuestControls()}
            class="w-8 h-4 rounded-full transition-all duration-200 relative flex-shrink-0 cursor-pointer p-0.5 flex items-center {jamStore.allowGuestControls ? 'bg-accent/20 border border-accent/40' : 'bg-white/10 border border-white/10'}"
          >
            <span
              class="w-3 h-3 rounded-full transition-transform duration-200 ease-out {jamStore.allowGuestControls ? 'translate-x-4 bg-accent' : 'translate-x-0 bg-neutral-500'}"
            ></span>
          </button>
        </div>
      {/if}

      <!-- Connected Devices Section -->
      {#if jamStore.members.length > 0}
        <div class="flex flex-col gap-3 w-full">
          <div class="flex items-center justify-between px-1">
            <h3 class="text-sm font-semibold text-white tracking-tight">Connected Devices</h3>
            <span class="text-xs font-mono text-neutral-500">{jamStore.members.length} {jamStore.members.length === 1 ? 'device' : 'devices'}</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 w-full">
            {#each jamStore.members as m}
              <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-sm">
                    {#if m.device === 'android'}
                      📱
                    {:else if m.device === 'windows'}
                      💻
                    {:else}
                      🌐
                    {/if}
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="text-xs font-medium text-white truncate font-mono">{m.name}</span>
                    <span class="text-[10px] text-neutral-500 uppercase font-mono">{m.device}</span>
                  </div>
                </div>

                {#if m.isHost}
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/20 text-accent font-semibold flex-shrink-0">HOST</span>
                {:else}
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 flex-shrink-0">GUEST</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Leave Session Action -->
      <div class="pt-2">
        <button
          type="button"
          onclick={handleLeave}
          class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-mono transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <span>{jamStore.role === 'host' ? 'End Jam Session' : 'Leave Jam Session'}</span>
        </button>
      </div>
    </div>
  {:else}
    <!-- Idle State: 2 Clean Cards (Host & Join, modeled like Playlists) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      <!-- Card 1: Host a Session -->
      <div class="flex flex-col justify-between gap-5 p-5 sm:p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
        <div class="flex flex-col gap-3">
          <div class="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894a9.75 9.75 0 010-13.788m13.788 0a9.75 9.75 0 010 13.788M12 12h.008v.008H12V12z" />
            </svg>
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-semibold text-white tracking-tight">Host a Session</h3>
            <p class="text-xs sm:text-sm text-neutral-400 font-normal mt-1 leading-relaxed">
              Create a room and invite your friends. Everyone hears the same song at the same second across Windows and Android.
            </p>
          </div>
        </div>

        <button
          type="button"
          onclick={handleStartHost}
          disabled={isHosting}
          class="w-full py-3 px-4 bg-accent text-accent-contrast rounded-xl text-xs sm:text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50"
        >
          {#if isHosting}
            <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            <span>Starting Jam...</span>
          {:else}
            <span>Start Jam Session</span>
          {/if}
        </button>
      </div>

      <!-- Card 2: Join a Session -->
      <div class="flex flex-col justify-between gap-5 p-5 sm:p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors">
        <div class="flex flex-col gap-3">
          <div class="w-11 h-11 rounded-xl bg-white/10 text-white flex items-center justify-center">
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-semibold text-white tracking-tight">Join a Session</h3>
            <p class="text-xs sm:text-sm text-neutral-400 font-normal mt-1 leading-relaxed">
              Enter the 6-character room code from your host to immediately connect and sync audio playback.
            </p>
          </div>
        </div>

        <form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} class="flex flex-col sm:flex-row items-stretch gap-2 w-full">
          <input
            type="text"
            maxlength="8"
            bind:value={joinCodeInput}
            placeholder="Enter code (e.g. A7B9X2)"
            class="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs sm:text-sm text-white uppercase font-mono tracking-widest placeholder:tracking-normal placeholder:normal-case placeholder-neutral-500 focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!joinCodeInput.trim() || isJoining}
            class="py-3 px-5 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs sm:text-sm font-medium text-white transition-all cursor-pointer font-mono flex items-center justify-center gap-2 active:scale-[0.98] flex-shrink-0"
          >
            {#if isJoining}
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Joining...</span>
            {:else}
              <span>Join</span>
            {/if}
          </button>
        </form>
      </div>
    </div>
  {/if}
</div>
