<script lang="ts">
  import { jamStore } from '../jamStore.svelte';

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
        <div class="flex items-center justify-between px-1">
          <span class="text-xs font-semibold text-neutral-300">Jam Session</span>
          <span class="text-[10px] font-mono text-neutral-500">Cross-Platform</span>
        </div>

        <button
          type="button"
          onclick={handleStartHost}
          class="w-full py-2.5 px-3 bg-accent text-accent-contrast rounded-xl text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center shadow-lg shadow-accent/20"
        >
          Start Jam (Host)
        </button>

        <form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} class="flex items-center gap-1.5 mt-1">
          <input
            type="text"
            maxlength="8"
            bind:value={joinCodeInput}
            placeholder="Enter room code..."
            class="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono tracking-wider placeholder:tracking-normal placeholder:normal-case placeholder-neutral-500 focus:outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={!joinCodeInput.trim()}
            class="py-2 px-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-medium text-white transition-colors cursor-pointer flex-shrink-0 font-mono"
          >
            Join
          </button>
        </form>
      {:else if jamStore.status === 'connecting'}
        <div class="flex flex-col items-center justify-center py-4 gap-2">
          <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          <span class="text-xs font-mono text-neutral-400">Connecting to Jam...</span>
          <button
            type="button"
            onclick={handleLeave}
            class="text-[11px] font-mono text-neutral-500 hover:text-white transition-colors cursor-pointer mt-1"
          >
            Cancel
          </button>
        </div>
      {:else if jamStore.status === 'error'}
        <div class="flex flex-col items-center justify-center py-3 gap-2 text-center">
          <span class="text-xs text-red-400 font-mono">{jamStore.errorMessage || 'Connection failed'}</span>
          <button
            type="button"
            onclick={handleLeave}
            class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white transition-colors cursor-pointer font-mono"
          >
            Retry
          </button>
        </div>
      {:else if jamStore.status === 'connected'}
        <!-- Active Session View -->
        <div class="flex flex-col gap-2.5">
          <!-- Room Code Banner -->
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
            <div class="flex flex-col">
              <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Jam Room Code</span>
              <span class="text-base font-bold font-mono tracking-widest text-white">{jamStore.roomCode}</span>
            </div>
            <button
              type="button"
              onclick={handleCopyCode}
              class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono text-neutral-300 transition-colors cursor-pointer"
            >
              {isCopied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <!-- Status Indicator -->
          <div class="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span class="text-white capitalize">{jamStore.role}</span>
              <span>•</span>
              <span>{jamStore.peerCount} {jamStore.peerCount === 1 ? 'device' : 'devices'}</span>
            </div>
            {#if jamStore.rttMs > 0}
              <span class="text-neutral-500">{jamStore.rttMs}ms ping</span>
            {:else}
              <span class="text-neutral-500">Connected</span>
            {/if}
          </div>

          <!-- Connected Members List -->
          {#if jamStore.members.length > 0}
            <div class="flex flex-col gap-1 p-2 rounded-xl bg-white/[0.03] border border-white/5 max-h-24 overflow-y-auto">
              <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-wider px-0.5">Connected Devices</span>
              {#each jamStore.members as m}
                <div class="flex items-center justify-between text-xs py-0.5 px-1 rounded hover:bg-white/[0.02]">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="text-xs">
                      {#if m.device === 'android'}
                        📱
                      {:else if m.device === 'windows'}
                        💻
                      {:else}
                        🌐
                      {/if}
                    </span>
                    <span class="text-neutral-300 text-[11px] truncate font-mono">{m.name}</span>
                  </div>
                  {#if m.isHost}
                    <span class="text-[9px] font-mono px-1 py-0.2 rounded bg-accent/20 text-accent font-semibold">Host</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Host Options -->
          {#if jamStore.role === 'host'}
            <label class="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5 cursor-pointer">
              <span class="text-[11px] text-neutral-300 font-mono">Guest Controls (DJ)</span>
              <input
                type="checkbox"
                checked={jamStore.allowGuestControls}
                onchange={() => jamStore.toggleGuestControls()}
                class="accent-accent w-3.5 h-3.5 rounded cursor-pointer"
              />
            </label>
          {/if}

          <!-- Leave / End Jam -->
          <button
            type="button"
            onclick={handleLeave}
            class="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-mono transition-colors cursor-pointer mt-0.5"
          >
            {jamStore.role === 'host' ? 'End Jam Session' : 'Leave Jam Session'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
