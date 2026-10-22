<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import type { Song } from '../types';

  let likedSongs = $state<Song[]>([]);
  let isLoading = $state(true);

  async function loadLikedSongs() {
    isLoading = true;
    try {
      likedSongs = await invoke<Song[]>('get_liked_songs');
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    loadLikedSongs();
  });

  async function removeSong(song: Song, e: MouseEvent) {
    e.stopPropagation();
    try {
      await invoke('toggle_like', { song });
      await loadLikedSongs();
      if (player.currentSong?.id === song.id) {
        player.isLiked = false;
      }
    } catch (err) {
      console.error(err);
    }
  }

  function playAll() {
    if (likedSongs.length === 0) return;
    player.queue = [...likedSongs];
    player.play(likedSongs[0]);
  }

  function shufflePlay() {
    if (likedSongs.length === 0) return;
    const shuffled = [...likedSongs].sort(() => Math.random() - 0.5);
    player.queue = shuffled;
    player.play(shuffled[0]);
  }
</script>

<div class="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-5">
  <!-- Minimalist Header -->
  <div class="flex items-center justify-between border-b border-white/5 pb-4">
    <div>
      <h1 class="text-base font-semibold text-white tracking-tight">Liked Songs</h1>
      <p class="text-xs text-neutral-500 font-mono mt-0.5">
        {likedSongs.length} {likedSongs.length === 1 ? 'track' : 'tracks'}
      </p>
    </div>

    {#if likedSongs.length > 0}
      <div class="flex items-center gap-2">
        <button
          onclick={shufflePlay}
          class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs border border-white/5 transition-colors flex items-center gap-1.5"
          title="Shuffle"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span>Shuffle</span>
        </button>

        <button
          onclick={playAll}
          class="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span>Play All</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Content -->
  {#if isLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-5 h-5 border border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if likedSongs.length > 0}
    <div class="flex flex-col gap-1 max-w-4xl">
      {#each likedSongs as song, i}
        <div
          role="button"
          tabindex="0"
          onclick={() => player.play(song)}
          onkeydown={(e) => { if (e.key === 'Enter') player.play(song); }}
          class="group flex items-center gap-3.5 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors {player.currentSong?.id === song.id ? 'bg-white/10' : ''}"
        >
          <!-- Index or Wave -->
          <div class="w-7 text-[11px] text-neutral-600 group-hover:text-white font-mono flex items-center justify-center">
            {#if player.currentSong?.id === song.id && player.isPlaying}
              <div class="flex items-end gap-0.5 h-2.5">
                <span class="w-0.5 h-full bg-white animate-pulse"></span>
                <span class="w-0.5 h-2/3 bg-white animate-pulse delay-75"></span>
                <span class="w-0.5 h-4/5 bg-white animate-pulse delay-150"></span>
              </div>
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-3 h-3 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- Thumbnail -->
          <div class="w-9 h-9 rounded bg-neutral-900 overflow-hidden flex-shrink-0">
            <img src={song.thumb} alt="" class="w-full h-full object-cover grayscale-20" />
          </div>

          <!-- Title & Artist -->
          <div class="flex-1 min-w-0">
            <h3 class="text-xs font-medium truncate {player.currentSong?.id === song.id ? 'text-white font-semibold' : 'text-neutral-200'}">
              {song.title}
            </h3>
            <p class="text-[11px] text-neutral-500 truncate mt-0.5">
              {song.artist}
            </p>
          </div>

          <!-- Duration -->
          <div class="text-[11px] text-neutral-500 font-mono pr-2">
            {song.duration}
          </div>

          <!-- Delete Like Action -->
          <button
            onclick={(e) => removeSong(song, e)}
            class="p-1.5 text-neutral-600 hover:text-white transition-colors"
            title="Remove from Liked"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center py-24 text-center">
      <p class="text-xs text-neutral-500 font-mono">NO LIKED TRACKS</p>
    </div>
  {/if}
</div>
