<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import { savedStore } from '../savedStore.svelte';
  import { feedStore } from '../feedStore.svelte';
  import { cleanArtistName, formatSongSize } from '../utils';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import type { SearchPage, Song } from '../types';

  let query = $state('');
  let results = $state<Song[]>([]);
  let continuationToken = $state<string | null>(null);
  let isSearching = $state(false);
  let isLoadingMore = $state(false);
  let hasSearched = $state(false);
  let scrollContainerEl = $state<HTMLDivElement | null>(null);

  // Containers for horizontal carousels
  let recommendedContainerEl = $state<HTMLDivElement | null>(null);
  let trendingContainerEl = $state<HTMLDivElement | null>(null);
  let newContainerEl = $state<HTMLDivElement | null>(null);
  let oldContainerEl = $state<HTMLDivElement | null>(null);

  // Drag-to-scroll horizontal interaction state
  let isMouseDown = false;
  let dragStartX = 0;
  let dragScrollLeft = 0;
  let activeDragEl: HTMLElement | null = null;
  let didDrag = false;
  let dragRafId: number | null = null;

  onMount(() => {
    if (feedStore.recommendedSongs.length === 0) {
      feedStore.refreshAllFeeds();
    }
  });

  function handleHorizontalScroll(section: 'recommended' | 'trending' | 'new' | 'old', e: Event) {
    const el = e.target as HTMLElement;
    if (!el) return;
    const threshold = 1000;
    if (el.scrollWidth - el.scrollLeft - el.clientWidth <= threshold) {
      if (section === 'recommended') feedStore.loadMoreRecommended();
      else if (section === 'trending') feedStore.loadMoreTrending();
      else if (section === 'new') feedStore.loadMoreNew();
      else if (section === 'old') feedStore.loadMoreOld();
    }
  }

  function scrollHorizontal(section: 'recommended' | 'trending' | 'new' | 'old', direction: number) {
    let el: HTMLDivElement | null = null;
    if (section === 'recommended') el = recommendedContainerEl;
    else if (section === 'trending') el = trendingContainerEl;
    else if (section === 'new') el = newContainerEl;
    else if (section === 'old') el = oldContainerEl;
    if (!el) return;
    const scrollAmount = Math.max(380, el.clientWidth * 0.7);
    el.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
  }

  // Pure non-obstructive wheel handler: only scroll horizontally when user holds Shift
  function handleHorizontalWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el) return;
    if (e.shiftKey && e.deltaY !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
    // Normal wheel vertical delta is NOT prevented, allowing fluid, natural vertical page scroll at all times!
  }

  // High-refresh-rate GPU-synchronized mouse drag-to-scroll handlers
  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    isMouseDown = true;
    activeDragEl = target;
    dragStartX = e.pageX - target.offsetLeft;
    dragScrollLeft = target.scrollLeft;
    didDrag = false;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isMouseDown || !activeDragEl) return;
    const x = e.pageX - activeDragEl.offsetLeft;
    const walk = x - dragStartX;
    if (Math.abs(walk) > 4) {
      didDrag = true;
      if (!dragRafId) {
        dragRafId = requestAnimationFrame(() => {
          if (activeDragEl) {
            activeDragEl.scrollLeft = dragScrollLeft - walk;
          }
          dragRafId = null;
        });
      }
    }
  }

  function handleMouseUp() {
    isMouseDown = false;
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }
    activeDragEl = null;
    setTimeout(() => {
      didDrag = false;
    }, 80);
  }

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
  }

  async function search(searchQuery?: string) {
    const q = (searchQuery ?? query).trim();
    if (!q) return;
    query = q;
    isSearching = true;
    hasSearched = true;
    continuationToken = null;

    feedStore.recordSearch(q);

    try {
      const page = await invoke<SearchPage>('search_music', { query: q });
      results = page.songs;
      continuationToken = page.continuation_token ?? null;
      if (scrollContainerEl) {
        scrollContainerEl.scrollTop = 0;
      }
      if (results.length > 0) player.prefetchStream(results[0]);
      if (results.length > 1) player.prefetchStream(results[1]);
    } catch (e) {
      console.error(e);
      results = [];
    } finally {
      isSearching = false;
    }
  }

  async function loadMore() {
    if (!continuationToken || isLoadingMore || isSearching) return;
    isLoadingMore = true;
    try {
      const existingIds = new Set(results.map((s) => s.id));
      let collected: Song[] = [];
      let token: string | null = continuationToken;
      let depth = 0;

      while (token && collected.length < 16 && depth < 3) {
        depth++;
        const page: SearchPage = await invoke<SearchPage>('search_more', { continuationToken: token });
        token = page.continuation_token ?? null;
        for (const s of page.songs) {
          if (!existingIds.has(s.id)) {
            existingIds.add(s.id);
            collected.push(s);
          }
        }
      }

      if (collected.length > 0) {
        results = [...results, ...collected];
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
    if (!el || !continuationToken || isLoadingMore || isSearching) return;
    const threshold = 1000;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= threshold) {
      loadMore();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      search();
    }
  }

  function clearSearch() {
    query = '';
    results = [];
    continuationToken = null;
    hasSearched = false;
  }
</script>

{#snippet songCard(song: Song, sectionTitle = 'Explore', songList?: Song[], index?: number)}
  <div
    role="button"
    tabindex="0"
    onpointerenter={() => player.prefetchStream(song)}
    onclick={() => {
      if (!didDrag) player.play(song, { type: 'search', title: sectionTitle, songs: songList ?? [song] }, index);
    }}
    onkeydown={(e) => { if (e.key === 'Enter') player.play(song, { type: 'search', title: sectionTitle, songs: songList ?? [song] }, index); }}
    class="group flex flex-col gap-2 cursor-pointer text-left w-36 sm:w-40 md:w-44 flex-shrink-0 select-none virtual-carousel-card"
  >
    <!-- Standalone Artwork Tile -->
    <div class="relative aspect-square w-full rounded-xl overflow-hidden bg-[#111114] shadow-md pointer-events-none flex-shrink-0">
      <TrackImage
        src={song.thumb}
        alt={song.title}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        iconClass="w-8 h-8 text-neutral-600"
      />

      <!-- Play Overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div class="w-10 h-10 rounded-full bg-accent text-accent-contrast flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
          <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>

    <!-- Title & Details directly below tile -->
    <div class="flex flex-col min-w-0 px-0.5 pointer-events-none">
      <h3 class="text-xs sm:text-sm font-medium text-white truncate group-hover:text-accent transition-colors" title={song.title}>
        {song.title}
      </h3>
      <p class="text-[11px] sm:text-xs text-neutral-400 font-normal truncate mt-0.5" title={song.artist}>
        {song.artist}
      </p>
    </div>
  </div>
{/snippet}

<div
  bind:this={scrollContainerEl}
  onscroll={handleScroll}
  class="flex-1 h-full overflow-y-auto px-6 pt-3 pb-28 flex flex-col gap-6 select-none font-sans bg-black w-full smooth-scroll-container"
>
  <!-- Search Input Bar & Recommendations -->
  <div class="flex flex-col gap-3 w-full">
    <div class="relative w-full">
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
        class="w-full bg-[#0e0e11] text-white pl-10 pr-10 py-3 rounded-xl border-none outline-none focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none text-xs sm:text-sm font-normal transition-colors placeholder:text-neutral-500 font-sans shadow-none"
      />

      {#if query}
        <button
          onclick={clearSearch}
          class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-500 hover:text-white transition-colors cursor-pointer"
          title="Clear search"
          aria-label="Clear search"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Recent Search History Pills (Sleek, minimal pills; no popup needed) -->
    {#if feedStore.recentSearches.length > 0}
      <div class="flex flex-wrap gap-1.5 items-center pt-0.5">
        {#each feedStore.recentSearches.slice(0, 10) as item}
          <div class="inline-flex items-center rounded-lg bg-[#0e0e11] hover:bg-[#16161c] text-xs text-neutral-300 hover:text-white transition-colors group">
            <button
              onclick={() => search(item)}
              class="px-2.5 py-1 text-xs text-neutral-300 group-hover:text-white border-none bg-transparent font-normal cursor-pointer"
            >
              {item}
            </button>
            <button
              onclick={(e) => { e.stopPropagation(); feedStore.removeSearch(item); }}
              class="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white pr-2 pl-0.5 py-1 bg-transparent border-none cursor-pointer transition-opacity text-[11px]"
              title={`Remove ${item} from history`}
              aria-label={`Remove ${item}`}
            >
              ✕
            </button>
          </div>
        {/each}
        <button
          onclick={() => feedStore.clearRecentSearches()}
          class="px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-300 bg-transparent border-none cursor-pointer transition-colors"
          title="Clear all recent searches"
        >
          Clear
        </button>
      </div>
    {:else if !hasSearched && !query && feedStore.recommendedSearches.length > 0}
      <!-- Dynamic Recommended Searches (Updating according to recommendation system & current vibe) -->
      <div class="flex flex-wrap gap-2 items-center pt-0.5">
        {#each feedStore.recommendedSearches as tag}
          <button
            onclick={() => search(tag)}
            class="px-3 py-1.5 rounded-lg bg-[#0e0e11] hover:bg-[#16161c] text-xs text-neutral-300 hover:text-white border-none transition-all duration-200 font-normal cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            {tag}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Main View Area -->
  {#if isSearching}
    <div class="flex items-center justify-center py-24">
      <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if hasSearched && results.length > 0}
    <!-- Active Search Results: Strict CSS Grid Alignment & Full Horizontal Expansion with Infinite Scrolling -->
    <div class="flex flex-col gap-1 w-full pt-1">
      <!-- Grid Column Header -->
      <div class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 pb-2 text-xs text-neutral-500 font-mono w-full select-none">
        <span class="text-center">#</span>
        <span class="font-sans text-left">Track</span>
        <span class="text-right">Size</span>
        <span class="text-left">Artist</span>
        <span class="text-right">Time</span>
        <span></span>
      </div>

      <!-- Result Rows -->
      {#each results as song, i}
        <div
          role="button"
          tabindex="0"
          onpointerenter={() => player.prefetchStream(song)}
          onclick={() => player.play(song, { type: 'search', title: query ? `Search: "${query}"` : 'Search Results', songs: results }, i)}
          onkeydown={(e) => { if (e.key === 'Enter') player.play(song, { type: 'search', title: query ? `Search: "${query}"` : 'Search Results', songs: results }, i); }}
          class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 py-2 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors w-full group virtual-scroll-item {player.currentSong?.id === song.id ? 'bg-accent/10' : ''}"
        >
          <!-- 1. Index or Pulse Equalizer -->
          <div class="text-xs text-neutral-500 group-hover:text-white font-mono flex items-center justify-center">
            {#if player.currentSong?.id === song.id && player.isPlaying}
              <PlayingEqualizer isPlaying={player.isPlaying} />
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-3.5 h-3.5 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- 2. Track: Thumbnail + Title -->
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 aspect-square rounded-lg bg-[#111114] overflow-hidden flex-shrink-0">
              <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" iconClass="w-4 h-4 text-neutral-500" />
            </div>
            <div class="flex flex-col min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <h3 class="text-xs sm:text-sm font-medium truncate {player.currentSong?.id === song.id ? 'text-accent' : 'text-neutral-200 group-hover:text-white'}">
                  {song.title}
                </h3>
              </div>
              <p class="text-xs text-neutral-400 font-normal truncate mt-0.5 md:hidden">
                {song.artist}
              </p>
            </div>
          </div>

          <!-- 3. Size -->
          <div class="text-right text-xs text-neutral-400 font-mono">
            {formatSongSize(savedStore.getSize(song.id), song.duration)}
          </div>

          <!-- 4. Artist -->
          <div class="text-xs text-neutral-400 font-normal truncate text-left" title={song.artist}>
            {song.artist}
          </div>

          <!-- 5. Duration -->
          <div class="text-right text-xs text-neutral-400 font-mono">
            {song.duration}
          </div>

          <!-- 6. Spacer -->
          <div class="flex items-center justify-end"></div>
        </div>
      {/each}

      <!-- Infinite Scroll Loading Spinner -->
      {#if isLoadingMore}
        <div class="py-6 flex items-center justify-center w-full">
          <div class="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
        </div>
      {/if}
    </div>
  {:else if hasSearched}
    <!-- No Results -->
    <div class="py-24 text-center flex flex-col items-center gap-2">
      <p class="text-xs text-neutral-500 font-mono">NO RESULTS FOUND</p>
      <button
        onclick={clearSearch}
        class="text-xs text-neutral-400 hover:text-white underline underline-offset-4 cursor-pointer"
      >
        Clear and return to Home
      </button>
    </div>
  {:else}
    <!-- 4 Horizontally Scrolling Infinite Sections (Pitch black, container-free, smooth navigation) -->
    <div class="flex flex-col gap-8 w-full pt-1">
      <!-- 1. Recommended for You -->
      <div class="flex flex-col gap-3.5 w-full">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <h2 class="text-sm sm:text-base font-semibold text-white tracking-tight">Recommended for You</h2>
            {#if player.currentSong}
              <span class="text-[11px] font-mono text-neutral-500 uppercase truncate max-w-[200px]">
                • Based on {player.currentSong.title}
              </span>
            {/if}
          </div>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => feedStore.refreshRecommended(true)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none mr-1"
              title="Refresh recommendations"
              aria-label="Refresh recommendations"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontal('recommended', -1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll left"
              aria-label="Scroll left"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontal('recommended', 1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll right"
              aria-label="Scroll right"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {#if feedStore.isRecommendedLoading && feedStore.recommendedSongs.length === 0}
          <div class="flex gap-4 overflow-hidden pb-3">
            {#each Array(6) as _}
              <div class="flex flex-col gap-2 w-36 sm:w-40 md:w-44 flex-shrink-0 animate-pulse">
                <div class="aspect-square bg-[#111114] rounded-xl"></div>
                <div class="h-3.5 bg-[#111114] rounded w-3/4 mt-2"></div>
                <div class="h-2.5 bg-[#111114] rounded w-1/2 mt-1"></div>
              </div>
            {/each}
          </div>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            bind:this={recommendedContainerEl}
            role="region"
            aria-label="Recommended songs carousel"
            onscroll={(e) => handleHorizontalScroll('recommended', e)}
            onwheel={handleHorizontalWheel}
            onmousedown={handleMouseDown}
            onmousemove={handleMouseMove}
            onmouseup={handleMouseUp}
            onmouseleave={handleMouseUp}
            class="flex gap-4 overflow-x-auto pb-3 pt-1 no-scrollbar select-none cursor-grab active:cursor-grabbing smooth-scroll-container"
          >
            {#each feedStore.recommendedSongs as song, i}
              {@render songCard(song, 'Recommended for You', feedStore.recommendedSongs, i)}
            {/each}
            {#if feedStore.isLoadingMoreRecommended}
              <div class="w-20 flex-shrink-0 flex items-center justify-center">
                <div class="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- 2. Trending -->
      <div class="flex flex-col gap-3.5 w-full">
        <div class="flex items-center justify-between">
          <h2 class="text-sm sm:text-base font-semibold text-white tracking-tight">Trending</h2>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => scrollHorizontal('trending', -1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll left"
              aria-label="Scroll left"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontal('trending', 1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll right"
              aria-label="Scroll right"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {#if feedStore.isTrendingLoading && feedStore.trendingSongs.length === 0}
          <div class="flex gap-4 overflow-hidden pb-3">
            {#each Array(6) as _}
              <div class="flex flex-col gap-2 w-36 sm:w-40 md:w-44 flex-shrink-0 animate-pulse">
                <div class="aspect-square bg-[#111114] rounded-xl"></div>
                <div class="h-3.5 bg-[#111114] rounded w-3/4 mt-2"></div>
                <div class="h-2.5 bg-[#111114] rounded w-1/2 mt-1"></div>
              </div>
            {/each}
          </div>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            bind:this={trendingContainerEl}
            role="region"
            aria-label="Trending songs carousel"
            onscroll={(e) => handleHorizontalScroll('trending', e)}
            onwheel={handleHorizontalWheel}
            onmousedown={handleMouseDown}
            onmousemove={handleMouseMove}
            onmouseup={handleMouseUp}
            onmouseleave={handleMouseUp}
            class="flex gap-4 overflow-x-auto pb-3 pt-1 no-scrollbar select-none cursor-grab active:cursor-grabbing smooth-scroll-container"
          >
            {#each feedStore.trendingSongs as song, i}
              {@render songCard(song, 'Trending', feedStore.trendingSongs, i)}
            {/each}
            {#if feedStore.isLoadingMoreTrending}
              <div class="w-20 flex-shrink-0 flex items-center justify-center">
                <div class="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- 3. New to You -->
      <div class="flex flex-col gap-3.5 w-full">
        <div class="flex items-center justify-between">
          <h2 class="text-sm sm:text-base font-semibold text-white tracking-tight">New to You</h2>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => scrollHorizontal('new', -1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll left"
              aria-label="Scroll left"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontal('new', 1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll right"
              aria-label="Scroll right"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {#if feedStore.isNewLoading && feedStore.newSongs.length === 0}
          <div class="flex gap-4 overflow-hidden pb-3">
            {#each Array(6) as _}
              <div class="flex flex-col gap-2 w-36 sm:w-40 md:w-44 flex-shrink-0 animate-pulse">
                <div class="aspect-square bg-[#111114] rounded-xl"></div>
                <div class="h-3.5 bg-[#111114] rounded w-3/4 mt-2"></div>
                <div class="h-2.5 bg-[#111114] rounded w-1/2 mt-1"></div>
              </div>
            {/each}
          </div>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            bind:this={newContainerEl}
            role="region"
            aria-label="New to you songs carousel"
            onscroll={(e) => handleHorizontalScroll('new', e)}
            onwheel={handleHorizontalWheel}
            onmousedown={handleMouseDown}
            onmousemove={handleMouseMove}
            onmouseup={handleMouseUp}
            onmouseleave={handleMouseUp}
            class="flex gap-4 overflow-x-auto pb-3 pt-1 no-scrollbar select-none cursor-grab active:cursor-grabbing smooth-scroll-container"
          >
            {#each feedStore.newSongs as song, i}
              {@render songCard(song, 'New to You', feedStore.newSongs, i)}
            {/each}
            {#if feedStore.isLoadingMoreNew}
              <div class="w-20 flex-shrink-0 flex items-center justify-center">
                <div class="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- 4. Your Old Ones -->
      <div class="flex flex-col gap-3.5 w-full">
        <div class="flex items-center justify-between">
          <h2 class="text-sm sm:text-base font-semibold text-white tracking-tight">Your Old Ones</h2>
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => scrollHorizontal('old', -1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll left"
              aria-label="Scroll left"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onclick={() => scrollHorizontal('old', 1)}
              class="w-7 h-7 rounded-full bg-[#111114] hover:bg-[#1c1c22] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer border-none"
              title="Scroll right"
              aria-label="Scroll right"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {#if feedStore.isOldLoading && feedStore.oldSongs.length === 0}
          <div class="flex gap-4 overflow-hidden pb-3">
            {#each Array(6) as _}
              <div class="flex flex-col gap-2 w-36 sm:w-40 md:w-44 flex-shrink-0 animate-pulse">
                <div class="aspect-square bg-[#111114] rounded-xl"></div>
                <div class="h-3.5 bg-[#111114] rounded w-3/4 mt-2"></div>
                <div class="h-2.5 bg-[#111114] rounded w-1/2 mt-1"></div>
              </div>
            {/each}
          </div>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            bind:this={oldContainerEl}
            role="region"
            aria-label="Your old ones songs carousel"
            onscroll={(e) => handleHorizontalScroll('old', e)}
            onwheel={handleHorizontalWheel}
            onmousedown={handleMouseDown}
            onmousemove={handleMouseMove}
            onmouseup={handleMouseUp}
            onmouseleave={handleMouseUp}
            class="flex gap-4 overflow-x-auto pb-3 pt-1 no-scrollbar select-none cursor-grab active:cursor-grabbing smooth-scroll-container"
          >
            {#each feedStore.oldSongs as song, i}
              {@render songCard(song, 'Your Old Ones', feedStore.oldSongs, i)}
            {/each}
            {#if feedStore.isLoadingMoreOld}
              <div class="w-20 flex-shrink-0 flex items-center justify-center">
                <div class="w-5 h-5 border-2 border-white/20 border-t-accent rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
