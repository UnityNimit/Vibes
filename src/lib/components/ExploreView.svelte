<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import type { Song } from '../types';

  let trendingSongs = $state<Song[]>([]);
  let isLoading = $state(true);
  let activeCategory = $state<'trending' | 'chill' | 'workout' | 'lofi'>('trending');

  const categories = [
    { id: 'trending', label: '🔥 Top Trending', query: 'Top Hits Global 2026' },
    { id: 'chill', label: '☕ Chill Vibes', query: 'Chill Acoustic Vibes' },
    { id: 'workout', label: '⚡ Gym & Phonk', query: 'Phonk Workout Motivation' },
    { id: 'lofi', label: '🌙 Lofi Sleep / Study', query: 'Lofi Beats to relax study to' },
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

<div class="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-6">
  <!-- Header -->
  <div class="flex flex-col gap-2 border-b border-white/5 pb-6">
    <h1 class="text-2xl font-bold text-white tracking-tight">Explore Quick Picks</h1>
    <p class="text-xs text-neutral-400">Stream or cache instantly from YouTube's top picks</p>

    <!-- Category Pills -->
    <div class="flex items-center gap-2 pt-2">
      {#each categories as cat}
        <button
          onclick={() => loadCategory(cat.id as any)}
          class="px-4 py-2 rounded-xl text-xs font-semibold transition-all {activeCategory === cat.id ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/30' : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'}"
        >
          {cat.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Content Grid -->
  {#if isLoading}
    <div class="flex items-center justify-center py-24 text-neutral-400 text-sm">
      <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if trendingSongs.length > 0}
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {#each trendingSongs as song}
        <div
          onclick={() => player.play(song)}
          class="group bg-[#151722] hover:bg-neutral-800 p-3 rounded-2xl border border-white/5 hover:border-pink-500/30 cursor-pointer transition-all flex flex-col gap-3 shadow-lg"
        >
          <!-- Thumbnail with Play Button Overlay -->
          <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-neutral-800">
            <img src={song.thumb} alt={song.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <div class="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-500/50 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                <svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </div>

          <!-- Metadata -->
          <div class="min-w-0 flex flex-col">
            <h3 class="text-sm font-semibold text-white truncate group-hover:text-pink-400 transition-colors" title={song.title}>
              {song.title}
            </h3>
            <p class="text-xs text-neutral-400 truncate mt-0.5" title={song.artist}>
              {song.artist}
            </p>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
