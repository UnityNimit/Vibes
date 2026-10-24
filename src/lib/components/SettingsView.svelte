<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { settings, THEMES } from '../settings.svelte';
  import { savedStore } from '../savedStore.svelte';
  import type { CacheStats } from '../types';

  let stats = $state<CacheStats>({ total_songs: 0, total_size_mb: 0 });
  let isClearing = $state(false);

  async function loadStats() {
    try {
      const s = await invoke<CacheStats>('get_stats');
      stats = s;
    } catch (e) {
      console.error(e);
    }
  }

  $effect(() => {
    loadStats();
  });

  async function openFolder() {
    try {
      await invoke('open_cache_dir');
    } catch (e) {
      console.error(e);
    }
  }

  async function handleClear() {
    isClearing = true;
    try {
      await invoke('clear_cache');
      await Promise.all([loadStats(), savedStore.refresh()]);
    } catch (e) {
      console.error(e);
    } finally {
      isClearing = false;
    }
  }
</script>

<div class="flex-1 h-full overflow-y-auto px-3 sm:px-6 pt-2 sm:pt-3 pb-28 flex flex-col gap-4 select-none font-sans w-full bg-black">
  <!-- Settings List (Unboxed, Container-Free, No Partition Lines, Direct on Pitch-Black Canvas) -->
  <div class="flex flex-col gap-1 w-full">
    <!-- Setting Row: Accent Theme -->
    <div class="py-2.5 min-h-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
      <span class="text-sm font-medium text-white">Accent Theme</span>

      <!-- Colorful circles with selected indicator, NO text -->
      <div class="flex items-center gap-3 flex-wrap">
        {#each THEMES as theme}
          <button
            type="button"
            onclick={() => settings.setAccentTheme(theme.id)}
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer hover:scale-110 active:scale-95 {settings.accentTheme === theme.id ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105 shadow-sm' : 'opacity-70 hover:opacity-100'}"
            style="background-color: {theme.bg};"
            title={theme.name}
            aria-label={theme.name}
          >
            {#if settings.accentTheme === theme.id}
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={theme.contrast} stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Setting Row: Auto-Save -->
    <div class="py-2.5 min-h-10 flex items-center justify-between gap-6 w-full">
      <span class="text-sm font-medium text-white">Auto-Save Tracks</span>

      <button
        type="button"
        role="switch"
        aria-label="Toggle auto-save"
        aria-checked={settings.autoSave}
        onclick={() => settings.toggleAutoSave()}
        class="w-8 h-4 rounded-full transition-all duration-200 relative flex-shrink-0 cursor-pointer p-0.5 flex items-center {settings.autoSave ? 'bg-accent/20 border border-accent/40' : 'bg-white/10 border border-white/10'}"
      >
        <span
          class="w-3 h-3 rounded-full transition-transform duration-200 ease-out {settings.autoSave ? 'translate-x-4 bg-accent' : 'translate-x-0 bg-neutral-500'}"
        ></span>
      </button>
    </div>

    <!-- Setting Row: Storage -->
    <div class="py-2.5 min-h-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
      <div class="flex flex-col gap-0.5">
        <span class="text-sm font-medium text-white">Offline Storage</span>
        <span class="text-xs text-neutral-500 font-mono">
          {stats.total_size_mb.toFixed(1)} MB
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={openFolder}
          class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          title="Open in Explorer"
          aria-label="Open in Explorer"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>

        <button
          type="button"
          onclick={handleClear}
          disabled={isClearing || stats.total_songs === 0}
          class="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          title="Clear all saved files"
          aria-label="Clear all saved files"
        >
          {#if isClearing}
            <div class="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
          {:else}
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>
