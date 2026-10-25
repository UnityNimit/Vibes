<script lang="ts">
  import { jamStore } from '../jamStore.svelte';
  import JamIcon from './JamIcon.svelte';
  import HeartIcon from './HeartIcon.svelte';

  interface Props {
    currentTab: 'search' | 'liked' | 'saved' | 'playlists' | 'jam' | 'settings' | 'now_playing';
    onSelectTab: (tab: 'search' | 'liked' | 'saved' | 'playlists' | 'jam' | 'settings' | 'now_playing') => void;
  }

  let { currentTab, onSelectTab }: Props = $props();
</script>

<aside class="w-12 sm:w-16 h-full bg-black border-none flex flex-col items-center pt-2 sm:pt-3 pb-28 select-none flex-shrink-0 font-sans z-30">
  <!-- Navigation Icons (Icon-Only, Clean Color-Only Selection, No Containers) -->
  <nav class="flex flex-col items-center gap-2.5 sm:gap-3 w-full px-1 sm:px-2">
    <!-- Search Tab -->
    <button
      onclick={() => onSelectTab('search')}
      class="w-10 h-10 flex items-center justify-center transition-colors duration-150 cursor-pointer {currentTab === 'search' ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
      title="Search & Explore"
      aria-label="Search"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </button>

    <!-- Liked Songs Tab -->
    <button
      onclick={() => onSelectTab('liked')}
      class="w-10 h-10 flex items-center justify-center transition-colors duration-150 cursor-pointer {currentTab === 'liked' ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
      title="Liked Songs"
      aria-label="Liked Songs"
    >
      <HeartIcon isLiked={currentTab === 'liked'} size={20} strokeWidth={2} />
    </button>

    <!-- Saved Tab -->
    <button
      onclick={() => onSelectTab('saved')}
      class="w-10 h-10 flex items-center justify-center transition-colors duration-150 cursor-pointer {currentTab === 'saved' ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
      title="Saved Offline Tracks"
      aria-label="Saved"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    </button>

    <!-- Playlists Tab -->
    <button
      onclick={() => onSelectTab('playlists')}
      class="w-10 h-10 flex items-center justify-center transition-colors duration-150 cursor-pointer {currentTab === 'playlists' ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
      title="Playlists"
      aria-label="Playlists"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    </button>

    <!-- Jam Session Action (Main View Tab) -->
    <button
      type="button"
      onclick={() => onSelectTab('jam')}
      class="relative w-10 h-10 flex items-center justify-center transition-colors duration-150 cursor-pointer overflow-visible {currentTab === 'jam' || jamStore.status === 'connected' ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
      title={jamStore.status === 'connected' ? `Jamming in Room ${jamStore.roomCode}` : 'Jam Session'}
      aria-label="Jam Session"
    >
      <JamIcon
        active={jamStore.status === 'connected'}
        size={20}
        strokeWidth={2}
      />
    </button>

    <!-- Settings Tab (Directly below Jam) -->
    <button
      onclick={() => onSelectTab('settings')}
      class="w-10 h-10 flex items-center justify-center transition-colors duration-150 cursor-pointer {currentTab === 'settings' ? 'text-accent' : 'text-neutral-500 hover:text-white'}"
      title="Settings"
      aria-label="Settings"
    >
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
  </nav>
</aside>
