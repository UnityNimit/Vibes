<script lang="ts">
  import TopBar from '$lib/components/TopBar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import SearchView from '$lib/components/SearchView.svelte';
  import LikedView from '$lib/components/LikedView.svelte';
  import CacheView from '$lib/components/CacheView.svelte';
  import ExploreView from '$lib/components/ExploreView.svelte';
  import LyricsModal from '$lib/components/LyricsModal.svelte';
  import { player } from '$lib/player.svelte';

  let currentTab = $state<'search' | 'liked' | 'cache' | 'explore'>('search');

  function handleKeyDown(e: KeyboardEvent) {
    // Avoid hijacking when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      player.togglePlay();
    } else if (e.code === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault();
      player.next();
    } else if (e.code === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault();
      player.prev();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      player.seek(player.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      player.seek(player.currentTime - 5);
    } else if (e.key === 'l' || e.key === 'L') {
      player.showLyrics = !player.showLyrics;
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="w-screen h-screen flex flex-col bg-[#09090b] text-neutral-200 overflow-hidden font-sans select-none border border-white/5">
  <!-- Custom Monochromatic Window Titlebar -->
  <TopBar />

  <!-- Body: Sidebar + Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar -->
    <Sidebar
      {currentTab}
      onSelectTab={(tab: 'search' | 'liked' | 'cache' | 'explore') => (currentTab = tab)}
    />

    <!-- Main Content Area -->
    <main class="flex-1 h-full flex flex-col relative overflow-hidden bg-[#0a0a0c]">
      {#if currentTab === 'search'}
        <SearchView />
      {:else if currentTab === 'liked'}
        <LikedView />
      {:else if currentTab === 'cache'}
        <CacheView />
      {:else if currentTab === 'explore'}
        <ExploreView />
      {/if}
    </main>
  </div>

  <!-- Synchronized Lyrics Modal -->
  <LyricsModal />
</div>
