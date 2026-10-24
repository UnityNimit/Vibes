<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobile } from '../platform';
  import { player } from '../player.svelte';
  import { savedStore } from '../savedStore.svelte';
  import { likedStore } from '../likedStore.svelte';
  import { formatSongSize } from '../utils';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import type { Song } from '../types';

  let isMobileView = $state(isMobile());

  onMount(() => {
    isMobileView = isMobile();
  });

  async function removeSong(song: Song, e: MouseEvent) {
    e.stopPropagation();
    try {
      await likedStore.toggleLike(song);
      if (player.currentSong?.id === song.id) {
        player.isLiked = false;
      }
    } catch (err) {
      console.error(err);
    }
  }
</script>

<div class="flex-1 h-full overflow-y-auto px-3 sm:px-6 pt-2 sm:pt-3 pb-28 flex flex-col gap-5 select-none font-sans bg-black w-full smooth-scroll-container">
  <!-- Minimalist Header (Full Width, Zero Partition Line) -->
  <div class="flex items-center justify-between min-h-10 -mb-2 w-full select-none">
    <p class="text-xs text-neutral-500 font-mono">
      {likedStore.songs.length} {likedStore.songs.length === 1 ? 'track' : 'tracks'}
    </p>
  </div>

  <!-- Content: Strict CSS Grid Alignment & Full Horizontal Expansion -->
  {#if likedStore.isLoading && likedStore.songs.length === 0}
    <div class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if likedStore.songs.length > 0}
    <div class="flex flex-col gap-1 w-full">
      {#if !isMobileView}
        <!-- Desktop Grid Column Header -->
        <div class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 pb-2 text-xs text-neutral-500 font-mono w-full select-none">
          <span class="text-center">#</span>
          <span class="font-sans text-left">Track</span>
          <span class="text-right">Size</span>
          <span class="text-left">Artist / Album</span>
          <span class="text-right">Time</span>
          <span></span>
        </div>
      {/if}

      <!-- Result Rows -->
      {#each likedStore.songs as song, i}
        {#if isMobileView}
          <!-- Android Mobile Track Row: Pure Track (Art + Title/Artist) + Time + Remove Action -->
          <div
            role="button"
            tabindex="0"
            onclick={() => player.play(song, { type: 'liked', title: 'Liked Songs', songs: likedStore.songs }, i)}
            onkeydown={(e) => { if (e.key === 'Enter') player.play(song, { type: 'liked', title: 'Liked Songs', songs: likedStore.songs }, i); }}
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

            <!-- Time + Remove Action -->
            <div class="flex items-center gap-2 flex-shrink-0 pl-2">
              {#if player.currentSong?.id === song.id && player.isPlaying}
                <PlayingEqualizer isPlaying={player.isPlaying} />
              {:else}
                <span class="text-xs text-neutral-500 font-mono">
                  {song.duration}
                </span>
              {/if}
              <button
                onclick={(e) => removeSong(song, e)}
                class="p-2 text-neutral-500 active:text-white transition-colors cursor-pointer"
                title="Remove from Liked"
                aria-label="Remove from Liked"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        {:else}
          <!-- Desktop Grid Row (Unchanged) -->
          <div
            role="button"
            tabindex="0"
            onclick={() => player.play(song, { type: 'liked', title: 'Liked Songs', songs: likedStore.songs }, i)}
            onkeydown={(e) => { if (e.key === 'Enter') player.play(song, { type: 'liked', title: 'Liked Songs', songs: likedStore.songs }, i); }}
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

            <!-- 4. Artist / Album -->
            <div class="text-xs text-neutral-400 font-normal truncate text-left" title={song.album || song.artist}>
              {song.album || song.artist}
            </div>

            <!-- 5. Duration -->
            <div class="text-right text-xs text-neutral-400 font-mono">
              {song.duration}
            </div>

            <!-- 6. Remove Like Action Button -->
            <div class="flex items-center justify-end">
              <button
                onclick={(e) => removeSong(song, e)}
                class="p-1.5 text-neutral-600 hover:text-white transition-colors cursor-pointer"
                title="Remove from Liked"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="py-24 text-center flex flex-col items-center gap-2">
      <p class="text-xs text-neutral-500 font-mono">NO LIKED SONGS YET</p>
    </div>
  {/if}
</div>
