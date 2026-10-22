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

<div class="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-6">
  <!-- Search Header & Input Bar -->
  <div class="flex flex-col gap-3 max-w-3xl">
    <div class="relative">
      <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <input
        type="text"
        placeholder="Search any song, artist, album, remix on YouTube..."
        value={query}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        class="w-full bg-[#151722] text-white pl-12 pr-12 py-3.5 rounded-2xl border border-white/5 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 text-sm shadow-inner transition-all placeholder:text-neutral-500"
      />

      {#if query}
        <button
          onclick={clearSearch}
          class="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-white"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Suggestion Chips -->
    {#if suggestions.length > 0}
      <div class="flex flex-wrap gap-2 pt-1">
        {#each suggestions as sugg}
          <button
            onclick={() => search(sugg)}
            class="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs text-neutral-300 hover:text-white border border-white/5 transition-all flex items-center gap-1.5"
          >
            <svg class="w-3 h-3 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>{sugg}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Loading Indicator -->
  {#if isSearching}
    <div class="flex flex-col items-center justify-center py-24 gap-3 text-neutral-400">
      <div class="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-sm">Fetching YouTube catalog...</p>
    </div>
  {:else if results.length > 0}
    <!-- Results List -->
    <div class="flex flex-col gap-2 max-w-4xl">
      <div class="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wider font-semibold px-4 pb-2 border-b border-white/5">
        <span class="w-8">#</span>
        <span class="flex-1">Title</span>
        <span class="w-32 hidden md:block">Album / Views</span>
        <span class="w-20 text-right">Duration</span>
      </div>

      {#each results as song, i}
        <div
          onclick={() => player.play(song)}
          class="group flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-white/5 {player.currentSong?.id === song.id ? 'bg-pink-500/10 border-pink-500/20' : ''}"
        >
          <!-- Index or Play Graphic -->
          <div class="w-8 text-xs text-neutral-500 group-hover:text-pink-400 font-mono flex items-center justify-center">
            {#if player.currentSong?.id === song.id && player.isPlaying}
              <div class="flex items-end gap-0.5 h-3">
                <span class="w-0.5 h-full bg-pink-500 animate-pulse"></span>
                <span class="w-0.5 h-2/3 bg-pink-500 animate-pulse delay-75"></span>
                <span class="w-0.5 h-4/5 bg-pink-500 animate-pulse delay-150"></span>
              </div>
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-4 h-4 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- Thumbnail -->
          <div class="w-11 h-11 rounded-xl overflow-hidden bg-neutral-800 flex-shrink-0 relative">
            <img src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
          </div>

          <!-- Title & Artist -->
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold truncate {player.currentSong?.id === song.id ? 'text-pink-400' : 'text-white'}">
              {song.title}
            </h3>
            <p class="text-xs text-neutral-400 truncate mt-0.5">
              {song.artist}
            </p>
          </div>

          <!-- Album / Views -->
          <div class="w-32 text-xs text-neutral-400 truncate hidden md:block">
            {song.album}
          </div>

          <!-- Duration -->
          <div class="w-20 text-right text-xs text-neutral-400 font-mono">
            {song.duration}
          </div>
        </div>
      {/each}
    </div>
  {:else if hasSearched}
    <div class="py-24 text-center text-neutral-500 text-sm">
      No music found matching "{query}". Try a different search term.
    </div>
  {:else}
    <!-- Initial Blank State with Suggested Trending Searches -->
    <div class="flex flex-col gap-6 py-12 max-w-3xl">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight">Popular Quick Searches</h2>
        <p class="text-xs text-neutral-400 mt-1">Tap any query to explore YouTube's library instantly</p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {#each ['Top Hits Global', 'Lofi Hip Hop Beats', 'Arijit Singh', 'The Weeknd', 'Taylor Swift', 'Phonk Workout', 'Hindi Chill Mix', 'Synthwave 80s', 'Anime Openings'] as tag}
          <button
            onclick={() => search(tag)}
            class="p-4 rounded-2xl bg-[#141620] hover:bg-neutral-800 border border-white/5 hover:border-pink-500/30 text-left transition-all group flex flex-col justify-between h-20 shadow-lg"
          >
            <span class="text-xs text-neutral-400 font-mono">#search</span>
            <span class="text-sm font-semibold text-neutral-200 group-hover:text-pink-400 transition-colors">{tag}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
