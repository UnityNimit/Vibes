<script lang="ts">
  import { jamStore } from '../jamStore.svelte';
  import JamIcon from './JamIcon.svelte';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = false, onClose = () => {} }: Props = $props();

  let joinCodeInput = $state<string>('');
  let isCopied = $state<boolean>(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  let shouldShow = $derived(isOpen || jamStore.isModalOpen);

  function closeAll() {
    onClose();
    jamStore.close();
  }

  async function handleStartHost() {
    await jamStore.hostJam();
  }

  async function handleJoin() {
    if (!joinCodeInput.trim()) return;
    const success = await jamStore.joinJam(joinCodeInput);
    if (success) {
      joinCodeInput = '';
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && shouldShow) {
      closeAll();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if shouldShow}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={closeAll}
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 select-none font-sans"
  >
    <!-- Modal Card -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onclick={(e) => e.stopPropagation()}
      class="w-full max-w-[300px] bg-[#0d0d10] border border-white/10 rounded-2xl shadow-2xl p-3.5 flex flex-col gap-2.5 relative text-white"
    >
      {#if jamStore.status === 'idle'}
        <!-- 2 Ultra-Minimalist Dual Tiles Side-by-Side -->
        <div class="grid grid-cols-2 gap-2.5 w-full py-1">
          <!-- Tile 1: Host Button -->
          <button
            type="button"
            onclick={handleStartHost}
            class="group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-accent/40 active:scale-95 transition-all cursor-pointer min-h-[120px]"
            aria-label="Host Jam"
          >
            <div class="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <JamIcon active={false} size={20} strokeWidth={1.8} />
            </div>
            <div class="w-1.5 h-1.5 rounded-full bg-neutral-600 group-hover:bg-accent transition-colors"></div>
          </button>

          <!-- Tile 2: Join Form Tile -->
          <div class="flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-white/[0.03] border border-white/5 min-h-[120px]">
            <div class="w-10 h-10 rounded-xl bg-white/5 text-neutral-300 flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} class="relative flex items-center w-full max-w-[110px]">
              <input
                type="text"
                maxlength="8"
                bind:value={joinCodeInput}
                oninput={() => { joinCodeInput = joinCodeInput.toUpperCase(); }}
                placeholder="••••••"
                autocapitalize="characters"
                autocorrect="off"
                spellcheck="false"
                class="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-2 pr-6 py-1.5 text-center text-xs text-white uppercase font-mono tracking-wider placeholder-neutral-600 focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={!joinCodeInput.trim()}
                class="absolute right-1 w-4 h-4 rounded bg-white/10 hover:bg-white/20 active:scale-95 disabled:opacity-20 disabled:pointer-events-none text-white flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
                aria-label="Join"
              >
                <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      {:else if jamStore.status === 'connecting'}
        <div class="flex flex-col items-center justify-center py-6 gap-4">
          <div class="relative w-12 h-12 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-2 border-accent/20 animate-ping"></div>
            <div class="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
          <button
            type="button"
            onclick={handleLeave}
            class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Cancel"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {:else if jamStore.status === 'error'}
        <div class="flex flex-col items-center justify-center py-5 gap-3 text-center">
          <div class="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <button
            type="button"
            onclick={handleLeave}
            class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
            aria-label="Dismiss"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {:else if jamStore.status === 'connected'}
        <!-- Active Session View -->
        <div class="flex flex-col gap-2.5">
          <!-- Room Code Banner -->
          <div class="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <span class="text-xl font-black font-mono tracking-[0.2em] text-white select-all">{jamStore.roomCode}</span>
            <button
              type="button"
              onclick={handleCopyCode}
              class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-neutral-300 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Copy"
            >
              {#if isCopied}
                <svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              {:else}
                <svg class="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              {/if}
            </button>
          </div>

          <!-- Status Indicator -->
          <div class="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span class="text-white font-semibold">{jamStore.peerCount}</span>
            </div>
            <button
              type="button"
              onclick={handleLeave}
              class="w-7 h-7 rounded-full bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 flex items-center justify-center transition-all cursor-pointer"
              aria-label="Disconnect"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Connected Members List -->
          {#if jamStore.members.length > 0}
            <div class="flex items-center flex-wrap gap-1.5 p-2 rounded-xl bg-white/[0.03] border border-white/5 max-h-24 overflow-y-auto">
              {#each jamStore.members as m}
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.02]">
                  <span class="text-xs">
                    {#if m.device === 'android'}
                      📱
                    {:else if m.device === 'windows'}
                      💻
                    {:else}
                      🌐
                    {/if}
                  </span>
                  {#if m.isHost}
                    <svg class="w-3 h-3 text-accent" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Host Options -->
          {#if jamStore.role === 'host'}
            <div class="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5">
              <div class="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-neutral-400">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Toggle guest controls"
                aria-checked={jamStore.allowGuestControls}
                onclick={() => jamStore.toggleGuestControls()}
                class="w-8 h-4.5 rounded-full transition-all duration-200 relative flex-shrink-0 cursor-pointer p-0.5 flex items-center {jamStore.allowGuestControls ? 'bg-accent/20 border border-accent/40' : 'bg-white/10 border border-white/10'}"
              >
                <span
                  class="w-3 h-3 rounded-full transition-transform duration-200 ease-out {jamStore.allowGuestControls ? 'translate-x-3.5 bg-accent' : 'translate-x-0 bg-neutral-500'}"
                ></span>
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
