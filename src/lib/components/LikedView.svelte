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

<div class="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-6">
  <!-- Header Banner -->
  <div class="flex items-end justify-between border-b border-white/5 pb-6">
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-400 flex items-center justify-center text-white shadow-xl shadow-pink-600/30">
        <svg class="w-8 h-8 fill-current" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </div>
      <div>
        <h1 class="text-2xl font-bold text-white tracking-tight">Liked Songs</h1>
        <p class="text-xs text-neutral-400 mt-1 font-mono">
          {likedSongs.length} {likedSongs.length === 1 ? 'song' : 'songs'} in your personal favorites
        </p>
      </div>
    </div>

    <!-- Play All & Shuffle Buttons -->
    {#if likedSongs.length > 0}
      <div class="flex items-center gap-3">
        <button
          onclick={shufflePlay}
          class="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold border border-white/5 transition-all flex items-center gap-2"
        >
          <span>🔀</span>
          <span>Shuffle</span>
        </button>

        <button
          onclick={playAll}
          class="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-lg shadow-pink-600/30 transition-all flex items-center gap-2"
        >
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span>Play All</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Content -->
  {#if isLoading}
    <div class="flex items-center justify-center py-24 text-neutral-400 text-sm">
      <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if likedSongs.length > 0}
    <div class="flex flex-col gap-2 max-w-4xl">
      {#each likedSongs as song, i}
        <div
          onclick={() => player.play(song)}
          class="group flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-white/5 {player.currentSong?.id === song.id ? 'bg-pink-500/10 border-pink-500/20' : ''}"
        >
          <!-- Index or Wave -->
          <div class="w-8 text-xs text-neutral-500 group-hover:text-pink-400 font-mono flex items-center justify-center">
            {#if player.currentSong?.id === song.id && player.isPlaying}
              <div class="flex items-end gap-0.5 h-3">
                <span class="w-0.5 h-full bg-pink-500 animate-pulse"></span>
                <span class="w-0.5 h-2/3 bg-pink-500 animate-pulse delay-75"></span>
                <span class="w-0.5 h-4/5 bg-pink-500 animate-pulse delay-150"></span>
              </div>
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-4 h-4 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- Thumbnail -->
          <div class="w-11 h-11 rounded-xl overflow-hidden bg-neutral-800 flex-shrink-0">
            <img src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
          </div>

          <!-- Title & Artist -->
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold truncate {player.currentSong?.id === song.id ? 'text-pink-400' : 'text-white'}">
              {song.title}
            </h3>
            <p class="text-xs text-neutral-400 truncate mt-0.5">
              {song.artist}
            </p>
          </div>

          <!-- Duration -->
          <div class="text-xs text-neutral-400 font-mono pr-2">
            {song.duration}
          </div>

          <!-- Delete Like Action -->
          <button
            onclick={(e) => removeSong(song, e)}
            class="p-2 text-neutral-500 hover:text-red-400 transition-colors"
            title="Remove from Liked"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center py-28 text-center gap-3">
      <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-neutral-500">
        <svg class="w-8 h-8 fill-none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </div>
      <div>
        <h3 class="text-base font-semibold text-white">No liked songs yet</h3>
        <p class="text-xs text-neutral-400 mt-1">Click the heart icon on any song to save it here</p>
      </div>
    </div>
  {/if}
</div>
