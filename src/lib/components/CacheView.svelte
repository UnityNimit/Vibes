<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import { formatBytes } from '../utils';
  import type { CacheItem, CacheStats, Song } from '../types';

  let cachedItems = $state<CacheItem[]>([]);
  let stats = $state<CacheStats>({ total_songs: 0, total_size_mb: 0 });
  let isLoading = $state(true);

  async function loadCache() {
    isLoading = true;
    try {
      const [items, s] = await Promise.all([
        invoke<CacheItem[]>('get_all_cached'),
        invoke<CacheStats>('get_stats'),
      ]);
      cachedItems = items;
      stats = s;
    } catch (e) {
      console.error(e);
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    loadCache();
  });

  async function deleteItem(id: string, e: MouseEvent) {
    e.stopPropagation();
    try {
      await invoke('delete_cache', { id });
      await loadCache();
    } catch (err) {
      console.error(err);
    }
  }

  function playCacheSong(item: CacheItem) {
    const song: Song = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      thumb: item.thumb,
    };
    player.play(song);
  }

  function playAllCached() {
    if (cachedItems.length === 0) return;
    const songs: Song[] = cachedItems.map(i => ({
      id: i.id,
      title: i.title,
      artist: i.artist,
      album: i.album,
      duration: i.duration,
      thumb: i.thumb,
    }));
    player.queue = songs;
    player.play(songs[0]);
  }
</script>

<div class="flex-1 h-screen overflow-y-auto p-8 flex flex-col gap-6">
  <!-- Header Banner -->
  <div class="flex items-end justify-between border-b border-white/5 pb-6">
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-xl shadow-emerald-600/30">
        <svg class="w-8 h-8 fill-none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-white tracking-tight">Offline Automatic Cache</h1>
          <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
            Rule #4 Active
          </span>
        </div>
        <p class="text-xs text-neutral-400 mt-1 font-mono">
          {stats.total_songs} {stats.total_songs === 1 ? 'track' : 'tracks'} saved • {stats.total_size_mb.toFixed(1)} MB stored locally on disk
        </p>
      </div>
    </div>

    <!-- Actions -->
    {#if cachedItems.length > 0}
      <button
        onclick={playAllCached}
        class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2"
      >
        <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <span>Play Offline</span>
      </button>
    {/if}
  </div>

  <!-- Offline Guarantee Banner -->
  <div class="bg-gradient-to-r from-emerald-950/40 to-teal-950/20 border border-emerald-500/20 p-4 rounded-2xl flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
        ⚡
      </div>
      <div>
        <p class="text-xs font-semibold text-emerald-300">Automatic Stream-Through Caching</p>
        <p class="text-[11px] text-neutral-400 mt-0.5">Every song you listen to is silently saved locally. Replaying them uses 0 KB network data and works completely offline.</p>
      </div>
    </div>
  </div>

  <!-- Cached List -->
  {#if isLoading}
    <div class="flex items-center justify-center py-24 text-neutral-400 text-sm">
      <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if cachedItems.length > 0}
    <div class="flex flex-col gap-2 max-w-4xl">
      {#each cachedItems as item, i}
        <div
          onclick={() => playCacheSong(item)}
          class="group flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-white/5 {player.currentSong?.id === item.id ? 'bg-emerald-500/10 border-emerald-500/20' : ''}"
        >
          <!-- Index -->
          <div class="w-8 text-xs text-neutral-500 group-hover:text-emerald-400 font-mono flex items-center justify-center">
            {#if player.currentSong?.id === item.id && player.isPlaying}
              <div class="flex items-end gap-0.5 h-3">
                <span class="w-0.5 h-full bg-emerald-500 animate-pulse"></span>
                <span class="w-0.5 h-2/3 bg-emerald-500 animate-pulse delay-75"></span>
                <span class="w-0.5 h-4/5 bg-emerald-500 animate-pulse delay-150"></span>
              </div>
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-4 h-4 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- Thumbnail -->
          <div class="w-11 h-11 rounded-xl overflow-hidden bg-neutral-800 flex-shrink-0">
            <img src={item.thumb} alt={item.title} class="w-full h-full object-cover" />
          </div>

          <!-- Title & Artist -->
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold truncate {player.currentSong?.id === item.id ? 'text-emerald-400' : 'text-white'}">
              {item.title}
            </h3>
            <p class="text-xs text-neutral-400 truncate mt-0.5">
              {item.artist}
            </p>
          </div>

          <!-- Disk Size -->
          <div class="text-xs text-emerald-400/80 font-mono">
            {formatBytes(item.file_size_bytes)}
          </div>

          <!-- Duration -->
          <div class="text-xs text-neutral-400 font-mono px-2">
            {item.duration}
          </div>

          <!-- Delete Cache Action -->
          <button
            onclick={(e) => deleteItem(item.id, e)}
            class="p-2 text-neutral-500 hover:text-red-400 transition-colors"
            title="Delete from Offline Cache"
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
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </div>
      <div>
        <h3 class="text-base font-semibold text-white">Cache is currently empty</h3>
        <p class="text-xs text-neutral-400 mt-1">Play any song from the Search tab and it will be cached here automatically</p>
      </div>
    </div>
  {/if}
</div>
