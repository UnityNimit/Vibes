<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { isMobile } from '../platform';
  import { player } from '../player.svelte';
  import { savedStore } from '../savedStore.svelte';
  import { feedStore } from '../feedStore.svelte';
  import { searchStore } from '../searchStore.svelte';
  import { cleanArtistName, formatSongSize } from '../utils';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import type { SearchPage, Song } from '../types';
  import { REGION_OPTIONS, type MoodOption } from '../recommendation';

  const TRENDING_MOODS: MoodOption[] = [
    { id: 'all', label: 'Trending Now', icon: '⚡', description: 'Live breaking hits' },
    { id: 'charts', label: 'Top Charts', icon: '🏆', description: 'Official Top 100 Charts' },
    { id: 'circadian', label: 'Smart Vibe', icon: '✨', description: 'Ambient rhythm' },
    { id: 'viral', label: 'Viral 50', icon: '💥', description: 'Fastest rising' },
    { id: 'late_night', label: 'Midnight Flow', icon: '🌙', description: 'Dark pop & synthwave' },
    { id: 'chill', label: 'Chill & Relax', icon: '🧘', description: 'Peaceful acoustic & lofi' },
    { id: 'energy', label: 'High Energy', icon: '🔥', description: 'Workout & phonk bass' },
    { id: 'party', label: 'Weekend Party', icon: '🎉', description: 'Club anthems & dance' }
  ];

  let showRegionMenu = $state<boolean>(false);
  let selectedRegionOption = $derived(
    REGION_OPTIONS.find(r => r.code === feedStore.trendingRegion) || REGION_OPTIONS[0]
  );

  let query = $derived(searchStore.query);
  let results = $derived(searchStore.results);
  let continuationToken = $derived(searchStore.continuationToken);
  let isSearching = $derived(searchStore.isSearching);
  let isLoadingMore = $derived(searchStore.isLoadingMore);
  let hasSearched = $derived(searchStore.hasSearched);
  let scrollContainerEl = $state<HTMLDivElement | null>(null);
  let isMobileView = $state(isMobile());

  // Containers for horizontal carousels
  let recommendedContainerEl = $state<HTMLDivElement | null>(null);
  let trendingContainerEl = $state<HTMLDivElement | null>(null);
  let newContainerEl = $state<HTMLDivElement | null>(null);
  let oldContainerEl = $state<HTMLDivElement | null>(null);

  // Mouse drag-to-scroll interaction for desktop (Touch devices use native hardware compositor momentum)
  let isPointerDown = false;
  let dragStartX = 0;
  let dragScrollLeft = 0;
  let activeDragEl: HTMLElement | null = null;
  let didDrag = false;

  let historyTouchTimer: ReturnType<typeof setTimeout> | null = null;
  let activeHistoryItem = $state<string | null>(null);

  function handleHistoryTouchStart(item: string) {
    if (historyTouchTimer) clearTimeout(historyTouchTimer);
    historyTouchTimer = setTimeout(() => {
      activeHistoryItem = item;
    }, 350);
  }

  function handleHistoryTouchEnd() {
    if (historyTouchTimer) {
      clearTimeout(historyTouchTimer);
      historyTouchTimer = null;
    }
  }

  onMount(() => {
    isMobileView = isMobile();
    if (feedStore.recommendedSongs.length === 0) {
      feedStore.refreshAllFeeds();
    }
    if (scrollContainerEl && searchStore.scrollTop > 0) {
      requestAnimationFrame(() => {
        if (scrollContainerEl) {
          scrollContainerEl.scrollTop = searchStore.scrollTop;
        }
      });
    }
    return () => {
      if (historyTouchTimer) clearTimeout(historyTouchTimer);
    };
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

  // Flawless Wheel Handling:
  // - Shift + Wheel: horizontal carousel scroll
  // - Trackpad horizontal swipe: native horizontal scroll
  // - Normal vertical mouse wheel: ALWAYS forwards directly to parent scrollContainerEl,
  //   guaranteeing vertical scrolling never gets trapped or stuck over horizontal lists!
  function handleHorizontalWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el) return;

    // 1. Shift key + Wheel -> scroll carousel horizontally
    if (e.shiftKey && e.deltaY !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      return;
    }

    // 2. Trackpad / Tilt horizontal gesture -> let carousel scroll horizontally
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      return;
    }

    // 3. Normal vertical wheel -> forward directly to parent scrollContainerEl
    if (scrollContainerEl && e.deltaY !== 0) {
      e.preventDefault();
      scrollContainerEl.scrollBy({ top: e.deltaY, behavior: 'auto' });
    }
  }

  let dragStartY = 0;

  // High-performance pointer drag-to-scroll handlers (Mouse only, no interference with mobile touch)
  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    isPointerDown = true;
    activeDragEl = e.currentTarget as HTMLElement;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragScrollLeft = activeDragEl.scrollLeft;
    didDrag = false;
    // NOTE: Do NOT setPointerCapture on pointerdown! Setting pointer capture immediately
    // hijacks all child click events in Chromium/WebView2, breaking card clickability.
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isPointerDown || !activeDragEl || e.pointerType !== 'mouse') return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    // Only engage drag if user clearly moved horizontally > 10px
    if (!didDrag && Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      didDrag = true;
      try {
        activeDragEl.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    if (didDrag) {
      activeDragEl.scrollLeft = dragScrollLeft - deltaX;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    if (activeDragEl && didDrag) {
      try {
        activeDragEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    isPointerDown = false;
    activeDragEl = null;

    if (didDrag) {
      setTimeout(() => {
        didDrag = false;
      }, 60);
    } else {
      didDrag = false;
    }
  }

  function handleCardClick(song: Song, sectionTitle: string, songList?: Song[], index?: number) {
    if (didDrag) return;
    player.play(song, { type: 'search', title: sectionTitle, songs: songList ?? [song] }, index);
  }

  function handleInput(e: Event) {
    searchStore.query = (e.target as HTMLInputElement).value;
  }

  async function search(searchQuery?: string) {
    await searchStore.search(searchQuery);
    if (scrollContainerEl) {
      scrollContainerEl.scrollTop = 0;
    }
  }

  async function loadMore() {
    await searchStore.loadMore();
  }

  function handleScroll(e: Event) {
    const el = e.target as HTMLElement;
    if (!el) return;
    searchStore.scrollTop = el.scrollTop;
    if (!continuationToken || isLoadingMore || isSearching) return;
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
    searchStore.clear();
  }
</script>

{#snippet songCard(song: Song, sectionTitle = 'Explore', songList?: Song[], index?: number)}
  <div
    role="button"
    tabindex="0"
    onpointerenter={() => player.prefetchStream(song)}
    onclick={() => handleCardClick(song, sectionTitle, songList, index)}
    onkeydown={(e) => { if (e.key === 'Enter') handleCardClick(song, sectionTitle, songList, index); }}
    class="group flex flex-col gap-2 cursor-pointer text-left w-36 sm:w-40 md:w-44 flex-shrink-0 select-none virtual-carousel-card"
    style="touch-action: pan-x pan-y;"
  >
    <!-- Standalone Artwork Tile -->
    <div class="relative aspect-square w-full rounded-xl overflow-hidden bg-[#111114] shadow-md pointer-events-none flex-shrink-0">
      <TrackImage
        src={song.thumb}
        alt={song.title}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
        iconClass="w-8 h-8 text-neutral-600"
      />

      <!-- Play Overlay -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div class="w-10 h-10 rounded-full bg-accent text-accent-contrast flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform pointer-events-none">
          <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>

    <!-- Title & Details directly below tile -->
    <div class="flex flex-col min-w-0 px-0.5 pointer-events-none">
      <h3 class="text-xs sm:text-sm font-medium text-white truncate group-hover:text-accent transition-colors pointer-events-none" title={song.title}>
        {song.title}
      </h3>
      <p class="text-[11px] sm:text-xs text-neutral-400 font-normal truncate mt-0.5 pointer-events-none" title={song.artist}>
        {song.artist}
      </p>
    </div>
  </div>
{/snippet}

<div
  bind:this={scrollContainerEl}
  onscroll={handleScroll}
  class="flex-1 h-full overflow-y-auto px-3 sm:px-6 pt-2 sm:pt-3 pb-28 flex flex-col gap-5 sm:gap-6 select-none font-sans bg-black w-full smooth-scroll-container"
>
  <!-- Search Input Bar & Recommendations -->
  <div class="flex flex-col gap-3 w-full">
    <div class="relative w-full h-10">
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
        class="w-full h-10 bg-[#0e0e11] text-white pl-10 pr-10 rounded-xl border-none outline-none focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none text-xs sm:text-sm font-normal transition-colors placeholder:text-neutral-500 font-sans shadow-none"
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

    <!-- Recent Search History Pills (Sleek, minimal pills; cross button layered directly over text) -->
    {#if feedStore.recentSearches.length > 0}
      <div class="flex flex-wrap gap-1.5 items-center pt-0.5">
        {#each feedStore.recentSearches.slice(0, 10) as item}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="relative inline-flex items-center rounded-lg bg-[#0e0e11] hover:bg-[#16161c] text-xs text-neutral-300 hover:text-white transition-colors group select-none"
            ontouchstart={() => handleHistoryTouchStart(item)}
            ontouchend={handleHistoryTouchEnd}
            ontouchcancel={handleHistoryTouchEnd}
          >
            <button
              type="button"
              onclick={() => search(item)}
              class="px-2.5 py-1 text-xs text-neutral-300 group-hover:text-white border-none bg-transparent font-normal cursor-pointer"
            >
              {item}
            </button>
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                feedStore.removeSearch(item);
                if (activeHistoryItem === item) activeHistoryItem = null;
              }}
              class="absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer border border-white/10 shadow-sm text-[9px] z-10 active:scale-90 {activeHistoryItem === item ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'}"
              title={`Remove ${item} from history`}
              aria-label={`Remove ${item}`}
            >
              ✕
            </button>
          </div>
        {/each}
        <button
          type="button"
          onclick={() => {
            activeHistoryItem = null;
            feedStore.clearRecentSearches();
          }}
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
    <!-- Active Search Results -->
    <div class="flex flex-col gap-1 w-full pt-1">
      {#if !isMobileView}
        <!-- Desktop Grid Column Header -->
        <div class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 pb-2 text-xs text-neutral-500 font-mono w-full select-none">
          <span class="text-center">#</span>
          <span class="font-sans text-left">Track</span>
          <span class="text-right">Size</span>
          <span class="text-left">Artist</span>
          <span class="text-right">Time</span>
          <span></span>
        </div>
      {/if}

      <!-- Result Rows -->
      {#each results as song, i}
        {#if isMobileView}
          <!-- Android Mobile Track Row: Pure Track (Art + Title/Artist) + Time (Duration / Equalizer) -->
          <div
            role="button"
            tabindex="0"
            onpointerenter={() => player.prefetchStream(song)}
            onclick={() => player.play(song, { type: 'search', title: query ? `Search: "${query}"` : 'Search Results', songs: results }, i)}
            onkeydown={(e) => { if (e.key === 'Enter') player.play(song, { type: 'search', title: query ? `Search: "${query}"` : 'Search Results', songs: results }, i); }}
            class="flex items-center justify-between gap-3 px-2.5 py-2.5 rounded-xl transition-colors cursor-pointer w-full group active:bg-white/[0.08] {player.currentSong?.id === song.id ? 'bg-accent/15' : ''}"
          >
            <!-- Track: Thumbnail + Title & Artist -->
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="w-12 h-12 rounded-lg bg-[#111114] overflow-hidden flex-shrink-0 relative">
                <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" iconClass="w-5 h-5 text-neutral-500" />
              </div>
              <div class="flex flex-col min-w-0 flex-1">
                <h3 class="text-sm font-medium truncate {player.currentSong?.id === song.id ? 'text-accent' : 'text-neutral-100'}">
                  {song.title}
                </h3>
                <p class="text-xs text-neutral-400 font-normal truncate mt-0.5">
                  {song.artist}
                </p>
              </div>
            </div>

            <!-- Time or Active Equalizer -->
            <div class="flex items-center justify-end flex-shrink-0 pl-2">
              {#if player.currentSong?.id === song.id && player.isPlaying}
                <PlayingEqualizer isPlaying={player.isPlaying} />
              {:else}
                <span class="text-xs text-neutral-500 font-mono">
                  {song.duration}
                </span>
              {/if}
            </div>
          </div>
        {:else}
          <!-- Desktop Grid Row (Unchanged) -->
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
        {/if}
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
          <h2 class="text-sm sm:text-base font-semibold text-white tracking-tight">Recommended for You</h2>
          <div class="flex items-center gap-1.5">
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
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerUp}
            class="horizontal-carousel flex gap-4 pb-3 pt-1 select-none cursor-grab active:cursor-grabbing"
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

      <!-- 2. Trending (Super Legendary Multi-Chart & Mood Engine) -->
      <div class="flex flex-col gap-3 w-full">
        <!-- Header with Title, Active Mood Badge, Region Switcher & Navigation -->
        <div class="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div class="flex items-center gap-2 min-w-0">
            <h2 class="text-sm sm:text-base font-semibold text-white tracking-tight">Trending</h2>
            {#if feedStore.trendingMood === 'circadian'}
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium flex items-center gap-1 truncate">
                <span>{feedStore.circadianInfo.icon}</span>
                <span class="truncate">{feedStore.circadianInfo.label}</span>
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-2 relative">
            <!-- Sleek Region Selector Pill -->
            <div class="relative">
              <button
                type="button"
                onclick={() => showRegionMenu = !showRegionMenu}
                class="px-2.5 py-1 rounded-full bg-[#111114] hover:bg-[#1a1a20] text-neutral-300 hover:text-white flex items-center gap-1.5 text-xs transition-colors cursor-pointer border border-white/5 active:scale-95"
                title="Select charts country/region"
                aria-label="Select charts region"
              >
                <span class="text-xs">{selectedRegionOption.flag}</span>
                <span class="font-normal text-[11px] sm:text-xs">{selectedRegionOption.code === 'AUTO' ? 'Auto' : selectedRegionOption.code}</span>
                <svg class="w-2.5 h-2.5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </button>

              {#if showRegionMenu}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="fixed inset-0 z-40" onclick={() => showRegionMenu = false}></div>

                <div class="absolute right-0 top-full mt-1.5 w-48 bg-[#141418] border border-white/10 rounded-xl shadow-2xl py-1 z-50 max-h-64 overflow-y-auto select-none backdrop-blur-md">
                  <div class="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500 border-b border-white/5">
                    Charts Region
                  </div>
                  {#each REGION_OPTIONS as opt}
                    <button
                      type="button"
                      onclick={() => {
                        feedStore.setTrendingRegion(opt.code);
                        showRegionMenu = false;
                      }}
                      class="w-full px-3 py-1.5 text-xs flex items-center justify-between text-left transition-colors cursor-pointer border-none bg-transparent hover:bg-white/[0.08] {feedStore.trendingRegion === opt.code ? 'text-accent font-medium bg-accent/10' : 'text-neutral-300'}"
                    >
                      <span class="flex items-center gap-2 truncate">
                        <span>{opt.flag}</span>
                        <span class="truncate">{opt.label}</span>
                      </span>
                      {#if feedStore.trendingRegion === opt.code}
                        <span class="text-accent text-xs flex-shrink-0">✓</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Scroll carousel arrows -->
            <button
              type="button"
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
              type="button"
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

        <!-- Sleek Horizontal Mood & Pattern Chips -->
        <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 select-none" style="touch-action: pan-x;">
          {#each TRENDING_MOODS as moodOpt}
            <button
              type="button"
              onclick={() => feedStore.setTrendingMood(moodOpt.id)}
              class="px-2.5 sm:px-3 py-1 rounded-full text-xs flex items-center gap-1.5 transition-all duration-150 cursor-pointer flex-shrink-0 border-none select-none {feedStore.trendingMood === moodOpt.id ? 'bg-white text-black font-semibold shadow-sm scale-[1.02]' : 'bg-[#0e0e11] hover:bg-[#16161c] text-neutral-400 hover:text-white font-normal'}"
              title={moodOpt.description}
            >
              <span class="text-xs">{moodOpt.id === 'circadian' ? feedStore.circadianInfo.icon : moodOpt.icon}</span>
              <span>{moodOpt.id === 'circadian' ? feedStore.circadianInfo.label : moodOpt.label}</span>
            </button>
          {/each}
        </div>

        <!-- Carousel / Loading State -->
        {#if feedStore.isTrendingLoading && feedStore.trendingSongs.length === 0}
          <div class="flex gap-4 overflow-hidden pb-3 pt-1">
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
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerUp}
            class="horizontal-carousel flex gap-4 pb-3 pt-1 select-none cursor-grab active:cursor-grabbing {feedStore.isTrendingLoading ? 'opacity-60 transition-opacity' : ''}"
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
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerUp}
            class="horizontal-carousel flex gap-4 pb-3 pt-1 select-none cursor-grab active:cursor-grabbing"
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
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerUp}
            class="horizontal-carousel flex gap-4 pb-3 pt-1 select-none cursor-grab active:cursor-grabbing"
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
