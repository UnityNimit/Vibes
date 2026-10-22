<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import Logo from './Logo.svelte';

  async function handleMouseDown(e: MouseEvent) {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button')) {
      try {
        await invoke('start_drag');
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function minimize() {
    try {
      await invoke('minimize_window');
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleMaximize() {
    try {
      await invoke('toggle_maximize_window');
    } catch (e) {
      console.error(e);
    }
  }

  async function close() {
    try {
      await invoke('close_window');
    } catch (e) {
      console.error(e);
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  data-tauri-drag-region
  onmousedown={handleMouseDown}
  ondblclick={toggleMaximize}
  class="h-9 w-full bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between px-3 select-none z-50 flex-shrink-0 cursor-default"
>
  <!-- Left: Official Vector Logo & Title -->
  <div data-tauri-drag-region class="flex items-center gap-2.5 pointer-events-none">
    <Logo class="w-4 h-4 text-white" />
    <span class="text-xs font-semibold tracking-wider text-neutral-300 font-sans">VIBES</span>
  </div>

  <!-- Middle: Drag area spacer -->
  <div data-tauri-drag-region class="flex-1 h-full"></div>

  <!-- Right: Window Controls -->
  <div class="flex items-center h-full -mr-3" data-tauri-drag-region="false">
    <!-- Minimize -->
    <button
      type="button"
      onclick={minimize}
      class="h-full px-3.5 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
      title="Minimize"
      aria-label="Minimize"
    >
      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
      </svg>
    </button>

    <!-- Maximize / Restore -->
    <button
      type="button"
      onclick={toggleMaximize}
      class="h-full px-3.5 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
      title="Maximize"
      aria-label="Maximize"
    >
      <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" />
      </svg>
    </button>

    <!-- Close -->
    <button
      type="button"
      onclick={close}
      class="h-full px-4 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-red-600/90 transition-colors"
      title="Close"
      aria-label="Close"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</header>
