<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import type { Song } from '../types';

  let trendingSongs = $state<Song[]>([]);
  let isLoading = $state(true);
  let activeCategory = $state<'trending' | 'chill' | 'workout' | 'lofi'>('trending');

  const categories = [
    { id: 'trending', label: 'Trending', query: 'Top Hits Global' },
    { id: 'chill', label: 'Chill', query: 'Chill Acoustic Vibes' },
    { id: 'workout', label: 'Gym', query: 'Phonk Workout Motivation' },
    { id: 'lofi', label: 'Lofi', query: 'Lofi Beats to relax study to' },
  ];

  async function loadCategory(catId: 'trending' | 'chill' | 'workout' | 'lofi') {
    activeCategory = catId;
    isLoading = true;
    const item = categories.find(c => c.id === catId);
    if (!item) return;

    try {
      const res = await invoke<Song[]>('search_music', { query: item.query });
      trendingSongs = res.slice(0, 15);
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    loadCategory('trending');
  });
</script>

<div class="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-5">
  <!-- Minimalist Header & Category Selector -->
  <div class="flex items-center justify-between border-b border-white/5 pb-4">
    <h1 class="text-base font-semibold text-white tracking-tight">Explore</h1>

    <div class="flex items-center gap-1.5">
      {#each categories as cat}
        <button
          onclick={() => loadCategory(cat.id as any)}
          class="px-3 py-1 rounded-md text-xs transition-colors {activeCategory === cat.id ? 'bg-white text-black font-semibold' : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'}"
        >
          {cat.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Content Grid -->
  {#if isLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-5 h-5 border border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if trendingSongs.length > 0}
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {#each trendingSongs as song}
        <div
          role="button"
          tabindex="0"
          onclick={() => player.play(song)}
          onkeydown={(e) => { if (e.key === 'Enter') player.play(song); }}
          class="group bg-[#121214] hover:bg-[#1a1a1d] p-2.5 rounded-lg border border-white/5 cursor-pointer transition-colors flex flex-col gap-2.5"
        >
          <!-- Thumbnail with Overlay Play Button -->
          <div class="relative w-full aspect-square rounded bg-neutral-900 overflow-hidden">
            <img src={song.thumb} alt="" class="w-full h-full object-cover grayscale-20" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <div class="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow">
                <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>

          <!-- Metadata -->
          <div class="min-w-0 flex flex-col">
            <h3 class="text-xs font-medium text-neutral-200 truncate group-hover:text-white transition-colors" title={song.title}>
              {song.title}
            </h3>
            <p class="text-[11px] text-neutral-500 truncate mt-0.5" title={song.artist}>
              {song.artist}
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
