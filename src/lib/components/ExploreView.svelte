<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import TrackImage from './TrackImage.svelte';
  import type { SearchPage, Song } from '../types';

  let trendingSongs = $state<Song[]>([]);
  let continuationToken = $state<string | null>(null);
  let isLoading = $state(true);
  let isLoadingMore = $state(false);
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
    continuationToken = null;
    const item = categories.find(c => c.id === catId);
    if (!item) return;

    try {
      const page = await invoke<SearchPage>('search_music', { query: item.query });
      trendingSongs = page.songs || [];
      continuationToken = page.continuation_token ?? null;
    } catch (e) {
      console.error(e);
      trendingSongs = [];
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (!continuationToken || isLoadingMore || isLoading) return;
    isLoadingMore = true;
    try {
      const existing = new Set(trendingSongs.map(s => s.id));
      let collected: Song[] = [];
      let token: string | null = continuationToken;
      let depth = 0;

      while (token && collected.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existing.has(s.id)) {
            existing.add(s.id);
            collected.push(s);
          }
        }
      }

      if (collected.length > 0) {
        trendingSongs = [...trendingSongs, ...collected];
      }
      continuationToken = token;
    } catch (e) {
      console.error(e);
    } finally {
      isLoadingMore = false;
    }
  }

  function handleScroll(e: Event) {
    const el = e.target as HTMLElement;
    if (!el || !continuationToken || isLoadingMore || isLoading) return;
    const threshold = 1000;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= threshold) {
      loadMore();
    }
  }

  $effect(() => {
    loadCategory('trending');
  });
</script>

<div
  onscroll={handleScroll}
  class="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-5 smooth-scroll-container"
>
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
      {#each trendingSongs as song, i}
        <div
          role="button"
          tabindex="0"
          onpointerenter={() => player.prefetchStream(song)}
          onclick={() => player.play(song, { type: 'search', title: `Explore: ${activeCategory}`, songs: trendingSongs }, i)}
          onkeydown={(e) => { if (e.key === 'Enter') player.play(song, { type: 'search', title: `Explore: ${activeCategory}`, songs: trendingSongs }, i); }}
          class="group bg-[#121214] hover:bg-[#1a1a1d] p-2.5 rounded-lg border border-white/5 cursor-pointer transition-colors flex flex-col gap-2.5 virtual-carousel-card"
        >
          <!-- Thumbnail with Overlay Play Button -->
          <div class="relative w-full aspect-square rounded-lg bg-neutral-900 overflow-hidden flex-shrink-0">
            <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
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

    {#if isLoadingMore}
      <div class="flex items-center justify-center py-6">
        <div class="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
      </div>
    {/if}
  {/if}
</div>
