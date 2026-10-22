<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import type { Song } from '../types';

  let query = $state('');
  let results = $state<Song[]>([]);
  let suggestions = $state<string[]>([]);
  let isSearching = $state(false);
  let hasSearched = $state(false);

  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    query = val;

    clearTimeout(debounceTimer);
    if (val.trim().length > 1) {
      debounceTimer = setTimeout(async () => {
        try {
          const suggs = await invoke<string[]>('get_search_suggestions', { query: val.trim() });
          suggestions = suggs.slice(0, 8);
        } catch (e) {
          console.error(e);
        }
      }, 250);
    } else {
      suggestions = [];
    }
  }

  async function search(searchQuery?: string) {
    const q = (searchQuery ?? query).trim();
    if (!q) return;
    query = q;
    suggestions = [];
    isSearching = true;
    hasSearched = true;

    try {
      const res = await invoke<Song[]>('search_music', { query: q });
      results = res;
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      isSearching = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      search();
    }
  }

  function clearSearch() {
    query = '';
    suggestions = [];
    results = [];
    hasSearched = false;
  }
</script>

<div class="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-5">
  <!-- Search Input Bar -->
  <div class="flex flex-col gap-2.5 max-w-2xl">
    <div class="relative">
      <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <input
        type="text"
        placeholder="Search track, artist, album..."
        value={query}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        class="w-full bg-[#121214] text-white pl-10 pr-10 py-2.5 rounded-lg border border-white/5 focus:border-white/20 focus:outline-none text-xs transition-colors placeholder:text-neutral-600"
      />

      {#if query}
        <button
          onclick={clearSearch}
          class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-500 hover:text-white"
          title="Clear search"
          aria-label="Clear search"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Suggestion Pills -->
    {#if suggestions.length > 0}
      <div class="flex flex-wrap gap-1.5 pt-0.5">
        {#each suggestions as sugg}
          <button
            onclick={() => search(sugg)}
            class="px-2.5 py-1 rounded bg-[#18181b] hover:bg-white/10 text-[11px] text-neutral-400 hover:text-white border border-white/5 transition-colors"
          >
            {sugg}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Loading State -->
  {#if isSearching}
    <div class="flex items-center justify-center py-20">
      <div class="w-5 h-5 border border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if results.length > 0}
    <!-- Results List -->
    <div class="flex flex-col gap-1 max-w-4xl">
      <div class="flex items-center justify-between text-[10px] text-neutral-600 uppercase tracking-wider font-mono px-3 pb-2 border-b border-white/5">
        <span class="w-7">#</span>
        <span class="flex-1">Track</span>
        <span class="w-32 hidden md:block">Info</span>
        <span class="w-16 text-right">Time</span>
      </div>

      {#each results as song, i}
        <div
          role="button"
          tabindex="0"
          onclick={() => player.play(song)}
          onkeydown={(e) => { if (e.key === 'Enter') player.play(song); }}
          class="group flex items-center gap-3.5 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors {player.currentSong?.id === song.id ? 'bg-white/10' : ''}"
        >
          <!-- Index or Play Indicator -->
          <div class="w-7 text-[11px] text-neutral-600 group-hover:text-white font-mono flex items-center justify-center">
            {#if player.currentSong?.id === song.id && player.isPlaying}
              <div class="flex items-end gap-0.5 h-2.5">
                <span class="w-0.5 h-full bg-white animate-pulse"></span>
                <span class="w-0.5 h-2/3 bg-white animate-pulse delay-75"></span>
                <span class="w-0.5 h-4/5 bg-white animate-pulse delay-150"></span>
              </div>
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-3 h-3 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- Thumbnail -->
          <div class="w-9 h-9 rounded bg-neutral-900 overflow-hidden flex-shrink-0">
            <img src={song.thumb} alt="" class="w-full h-full object-cover grayscale-20" />
          </div>

          <!-- Title & Artist -->
          <div class="flex-1 min-w-0">
            <h3 class="text-xs font-medium truncate {player.currentSong?.id === song.id ? 'text-white font-semibold' : 'text-neutral-200'}">
              {song.title}
            </h3>
            <p class="text-[11px] text-neutral-500 truncate mt-0.5">
              {song.artist}
            </p>
          </div>

          <!-- Album / Views -->
          <div class="w-32 text-[11px] text-neutral-500 truncate hidden md:block font-mono">
            {song.album}
          </div>

          <!-- Duration -->
          <div class="w-16 text-right text-[11px] text-neutral-500 font-mono">
            {song.duration}
          </div>
        </div>
      {/each}
    </div>
  {:else if hasSearched}
    <div class="py-20 text-center text-neutral-600 text-xs font-mono">
      NO RESULTS FOUND
    </div>
  {:else}
    <!-- Clean Minimal Quick Searches -->
    <div class="flex flex-col gap-3 py-6 max-w-2xl">
      <p class="text-xs text-neutral-500 uppercase tracking-wider font-mono">Quick Queries</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {#each ['Top Hits Global', 'Lofi Beats', 'Arijit Singh', 'The Weeknd', 'Taylor Swift', 'Gym Motivation', 'Acoustic Chill', 'Synthwave', 'Indie Radio'] as tag}
          <button
            onclick={() => search(tag)}
            class="p-2.5 rounded-lg bg-[#121214] hover:bg-white/5 border border-white/5 text-left transition-colors text-xs text-neutral-300 hover:text-white"
          >
            {tag}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
