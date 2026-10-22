<script lang="ts">
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

<main class="w-screen h-screen flex bg-[#0c0d12] text-neutral-100 overflow-hidden font-sans select-none">
  <!-- Left Sidebar with Navigation & Built-in Player -->
  <Sidebar
    {currentTab}
    onSelectTab={(tab: 'search' | 'liked' | 'cache' | 'explore') => (currentTab = tab)}
  />

  <!-- Main View Area -->
  <section class="flex-1 h-screen flex flex-col relative overflow-hidden bg-gradient-to-b from-[#10121a] to-[#0c0d12]">
    {#if currentTab === 'search'}
      <SearchView />
    {:else if currentTab === 'liked'}
      <LikedView />
    {:else if currentTab === 'cache'}
      <CacheView />
    {:else if currentTab === 'explore'}
      <ExploreView />
    {/if}
  </section>

  <!-- Synchronized Lyrics Overlay -->
  <LyricsModal />
</main>
