<script lang="ts">
  import { jamStore } from '../jamStore.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let joinCodeInput = $state<string>('');
  let isCopied = $state<boolean>(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

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

  function adjustCalibration(deltaMs: number) {
    const next = Math.max(-100, Math.min(100, jamStore.hardwareCalibrationMs + deltaMs));
    jamStore.setHardwareCalibration(next);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop (Clicking anywhere outside closes automatically) -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={onClose}
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150 select-none font-sans"
  >
    <!-- Modal Card -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onclick={(e) => e.stopPropagation()}
      class="w-full max-w-[280px] bg-[#0d0d10] border border-white/10 rounded-2xl shadow-2xl p-3.5 flex flex-col gap-2.5 relative text-white"
    >
      {#if jamStore.status === 'idle'}
        <button
          type="button"
          onclick={handleStartHost}
          class="w-full py-2.5 px-3 bg-accent text-accent-contrast rounded-xl text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center"
        >
          Start Jam
        </button>

        <form onsubmit={(e) => { e.preventDefault(); handleJoin(); }} class="flex items-center gap-1.5">
          <input
            type="text"
            maxlength="8"
            bind:value={joinCodeInput}
            placeholder="Enter group code..."
            class="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono tracking-wider placeholder:tracking-normal placeholder:normal-case placeholder-neutral-500 focus:outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={!joinCodeInput.trim()}
            class="py-2 px-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-medium text-white transition-colors cursor-pointer flex-shrink-0"
          >
            Join
          </button>
        </form>
      {:else if jamStore.status === 'connecting'}
        <div class="flex flex-col items-center justify-center py-4 gap-2">
          <div class="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
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
          <span class="text-xs text-red-400 font-mono">{jamStore.errorMessage || 'Failed'}</span>
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
            <span class="text-base font-bold font-mono tracking-widest text-white">{jamStore.roomCode}</span>
            <button
              type="button"
              onclick={handleCopyCode}
              class="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono text-neutral-300 transition-colors cursor-pointer"
            >
              {isCopied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <!-- Minimal Status Indicator -->
          <div class="flex items-center justify-between px-1 text-[11px] font-mono text-neutral-400">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full {Math.abs(jamStore.driftMs) <= 10 ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
              <span class="text-white capitalize">{jamStore.role}</span>
              <span>•</span>
              <span>{jamStore.peerCount} {jamStore.peerCount === 1 ? 'peer' : 'peers'}</span>
            </div>
            {#if jamStore.driftMs !== 0}
              <span class="text-neutral-500">{jamStore.driftMs > 0 ? '+' : ''}{jamStore.driftMs}ms</span>
            {/if}
          </div>

          <!-- Micro Delay Steppers -->
          <div class="flex items-center justify-between gap-1 p-1.5 rounded-xl bg-white/[0.03] border border-white/5">
            <span class="text-[10px] font-mono text-neutral-500 px-1">Delay</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onclick={() => adjustCalibration(-5)}
                class="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-neutral-300 cursor-pointer"
              >-5</button>
              <button
                type="button"
                onclick={() => adjustCalibration(-1)}
                class="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-neutral-300 cursor-pointer"
              >-1</button>
              <button
                type="button"
                onclick={() => jamStore.setHardwareCalibration(0)}
                class="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono {jamStore.hardwareCalibrationMs === 0 ? 'text-neutral-400' : 'text-accent font-semibold'} cursor-pointer"
              >
                {jamStore.hardwareCalibrationMs >= 0 ? '+' : ''}{jamStore.hardwareCalibrationMs}ms
              </button>
              <button
                type="button"
                onclick={() => adjustCalibration(1)}
                class="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-neutral-300 cursor-pointer"
              >+1</button>
              <button
                type="button"
                onclick={() => adjustCalibration(5)}
                class="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] font-mono text-neutral-300 cursor-pointer"
              >+5</button>
            </div>
          </div>

          <!-- Leave / End Jam -->
          <button
            type="button"
            onclick={handleLeave}
            class="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-mono transition-colors cursor-pointer mt-0.5"
          >
            {jamStore.role === 'host' ? 'End Jam' : 'Leave Jam'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
