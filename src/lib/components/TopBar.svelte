<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { isAndroid } from '$lib/platform';
  import Logo from './Logo.svelte';

  interface Props {
    currentTab?: 'search' | 'liked' | 'saved' | 'playlists' | 'settings' | 'now_playing';
  }

  let { currentTab = 'search' }: Props = $props();

  let isMaximized = $state(false);
  let isMobileAndroid = $state(false);

  const TAB_TITLES: Record<string, string> = {
    search: 'Search',
    liked: 'Liked Songs',
    saved: 'Saved',
    playlists: 'Playlists',
    settings: 'Settings',
    now_playing: 'Now Playing'
  };

  let currentTitle = $derived(TAB_TITLES[currentTab] ?? 'Search');

  async function checkMaximized() {
    try {
      isMaximized = await invoke<boolean>('is_window_maximized');
    } catch {
      // ignore
    }
  }

  onMount(() => {
    isMobileAndroid = isAndroid();
    if (!isMobileAndroid) {
      checkMaximized();
    }
  });

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
      isMaximized = await invoke<boolean>('toggle_maximize_window');
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

<svelte:window onresize={checkMaximized} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  data-tauri-drag-region
  onmousedown={handleMouseDown}
  ondblclick={toggleMaximize}
  class="h-16 w-full bg-black border-none flex items-center justify-between select-none z-50 flex-shrink-0 cursor-default relative"
>
  <!-- Left: Centered Logo precisely aligned with sidebar icon column (w-16, x-center = 32px) -->
  <div data-tauri-drag-region class="w-16 h-full flex items-center justify-center pointer-events-none flex-shrink-0">
    <Logo class="w-7 h-7 text-white" />
  </div>

  <!-- Dynamic Active Tab Title (Aligned with page content left margin at x = 88px) -->
  <div data-tauri-drag-region class="pl-6 flex items-center pointer-events-none flex-shrink-0">
    <h1 class="text-2xl sm:text-[26px] font-bold text-white tracking-tight font-sans select-none leading-none">
      {currentTitle}
    </h1>
  </div>

  <!-- Middle: Drag area spacer (padded on right for absolute window buttons on desktop) -->
  <div data-tauri-drag-region class="flex-1 h-full cursor-default {isMobileAndroid ? '' : 'pr-36'}"></div>

  {#if !isMobileAndroid}
  <!-- Right: Window Controls (Pinned flush to top-right corner, ZERO margin from top) -->
  <div class="absolute top-0 right-0 flex items-center h-10 sm:h-11 flex-shrink-0 z-20" data-tauri-drag-region="false">
    <!-- Minimize -->
    <button
      type="button"
      onclick={minimize}
      class="w-12 h-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors duration-150 cursor-pointer"
      title="Minimize"
      aria-label="Minimize"
    >
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M2.5 8h11" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    </button>

    <!-- Maximize / Restore -->
    <button
      type="button"
      onclick={toggleMaximize}
      class="w-12 h-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors duration-150 cursor-pointer"
      title={isMaximized ? "Restore Down" : "Maximize"}
      aria-label={isMaximized ? "Restore Down" : "Maximize"}
    >
      {#if isMaximized}
        <!-- Restore: Double overlapping window icon -->
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path
            d="M5 3.5V2.5C5 1.94772 5.44772 1.5 6 1.5H13.5C14.0523 1.5 14.5 1.94772 14.5 2.5V10C14.5 10.5523 14.0523 11 13.5 11H12.5"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <rect x="1.5" y="4.5" width="10" height="10" rx="1.2" stroke-width="1.3" />
        </svg>
      {:else}
        <!-- Maximize: Single window / fullscreen icon -->
        <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.2" stroke-width="1.3" />
        </svg>
      {/if}
    </button>

    <!-- Close -->
    <button
      type="button"
      onclick={close}
      class="w-12 h-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#e81123] active:bg-[#c4101f] transition-colors duration-150 cursor-pointer"
      title="Close"
      aria-label="Close"
    >
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    </button>
  </div>
  {/if}
</header>
