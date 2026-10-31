<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobile } from '$lib/platform';
  import TopBar from '$lib/components/TopBar.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import SearchView from '$lib/components/SearchView.svelte';
  import LikedView from '$lib/components/LikedView.svelte';
  import CacheView from '$lib/components/CacheView.svelte';
  import NowPlayingView from '$lib/components/NowPlayingView.svelte';
  import SettingsView from '$lib/components/SettingsView.svelte';
  import PlaylistsView from '$lib/components/PlaylistsView.svelte';
  import JamView from '$lib/components/JamView.svelte';
  import BottomPlayer from '$lib/components/BottomPlayer.svelte';
  import SongContextMenuModal from '$lib/components/SongContextMenuModal.svelte';
  import { navigationStore } from '$lib/navigationStore.svelte';
  import { player } from '$lib/player.svelte';

  type Tab = 'search' | 'liked' | 'saved' | 'playlists' | 'jam' | 'settings' | 'now_playing';

  let currentTab = $derived(navigationStore.currentTab as Tab);
  let isMobileView = $state(isMobile());

  onMount(() => {
    isMobileView = isMobile();
    if (isMobileView) {
      document.documentElement.classList.add('is-mobile');
    }
  });

  $effect(() => {
    if (currentTab === 'now_playing') {
      return navigationStore.register('now_playing_fullscreen', 30, () => {
        toggleNowPlaying();
        return true;
      });
    }
  });

  function handleSelectTab(tab: Tab) {
    navigationStore.recordTab(tab);
  }

  function toggleNowPlaying() {
    navigationStore.toggleNowPlaying();
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Avoid hijacking when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (navigationStore.handleBack() === 'handled') {
        e.preventDefault();
        return;
      }
    }

    if (e.code === 'Space') {
      e.preventDefault();
      player.togglePlay();
    } else if (e.code === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      player.next();
    } else if (e.code === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      player.prev();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      player.seek(player.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      player.seek(player.currentTime - 5);
    } else if (e.key === 'l' || e.key === 'L') {
      if (currentTab === 'now_playing') {
        player.showLyrics = !player.showLyrics;
      } else {
        navigationStore.recordTab('now_playing');
        player.showLyrics = true;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="w-screen h-screen flex flex-col bg-black text-neutral-200 overflow-hidden font-sans select-none border-none relative"
  style={isMobileView ? 'padding-top: env(safe-area-inset-top, 0px);' : ''}
>
  <!-- Custom Monochromatic Window Titlebar (No bottom border, pure black) -->
  <TopBar {currentTab} />

  <!-- Body: Sidebar + Main Content (No partition border lines) -->
  <div class="flex-1 flex overflow-hidden bg-black relative">
    <!-- Shrunk Icon-Only Sidebar -->
    <Sidebar
      {currentTab}
      onSelectTab={handleSelectTab}
    />

    <!-- Main Content Area (Pure black, no borders, preserved view state) -->
    <main class="flex-1 h-full flex flex-col relative overflow-hidden bg-black">
      <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'search' ? '' : 'hidden'}">
        <SearchView />
      </div>
      <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'liked' ? '' : 'hidden'}">
        <LikedView />
      </div>
      <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'saved' ? '' : 'hidden'}">
        <CacheView />
      </div>
      <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'playlists' ? '' : 'hidden'}">
        <PlaylistsView />
      </div>
      <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'jam' ? '' : 'hidden'}">
        <JamView />
      </div>
      <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'settings' ? '' : 'hidden'}">
        <SettingsView />
      </div>
      {#if !isMobileView}
        <div class="flex-1 h-full flex flex-col overflow-hidden {currentTab === 'now_playing' ? '' : 'hidden'}">
          <NowPlayingView onClose={toggleNowPlaying} />
        </div>
      {/if}
    </main>
  </div>

  <!-- Bottom Floating Player (Stretching from left edge to right edge, floating on top) -->
  <BottomPlayer
    {currentTab}
    onToggleNowPlaying={toggleNowPlaying}
    onSelectTab={handleSelectTab}
  />

  {#if isMobileView}
    <!-- Full-Screen Animated Bigger Player on Mobile (Android & iOS) -->
    <div
      class="fixed inset-0 z-50 bg-black transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] {currentTab === 'now_playing' ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'}"
    >
      <NowPlayingView onClose={toggleNowPlaying} />
    </div>
  {/if}

  <!-- Global Song Context Menu & Playlist Selector (Desktop Right-Click & Mobile Long-Press) -->
  <SongContextMenuModal />

  {#if navigationStore.showToast}
    <div
      class="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-900/95 text-white border border-white/10 text-xs font-medium shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-xl pointer-events-none transition-all duration-200 anim-toast-up select-none tracking-wide"
    >
      {#if navigationStore.toastMessage.toLowerCase().includes('queue') || navigationStore.toastMessage.toLowerCase().includes('added') || navigationStore.toastMessage.toLowerCase().includes('playing')}
        <svg class="w-3.5 h-3.5 text-accent stroke-current fill-none flex-shrink-0" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      {/if}
      <span>{navigationStore.toastMessage}</span>
    </div>
  {/if}
</div>

<style>
  @keyframes toastUp {
    from {
      opacity: 0;
      transform: translate(-50%, 8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }
  .anim-toast-up {
    animation: toastUp 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
