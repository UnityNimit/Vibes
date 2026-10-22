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

<div class="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-5">
  <!-- Minimalist Header -->
  <div class="flex items-center justify-between border-b border-white/5 pb-4">
    <div>
      <h1 class="text-base font-semibold text-white tracking-tight">Offline Cache</h1>
      <p class="text-xs text-neutral-500 font-mono mt-0.5">
        {stats.total_songs} {stats.total_songs === 1 ? 'track' : 'tracks'} • {stats.total_size_mb.toFixed(1)} MB stored locally
      </p>
    </div>

    {#if cachedItems.length > 0}
      <button
        onclick={playAllCached}
        class="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-medium transition-colors flex items-center gap-1.5"
      >
        <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <span>Play All</span>
      </button>
    {/if}
  </div>

  <!-- Content -->
  {#if isLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-5 h-5 border border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if cachedItems.length > 0}
    <div class="flex flex-col gap-1 max-w-4xl">
      {#each cachedItems as item, i}
        <div
          role="button"
          tabindex="0"
          onclick={() => playCacheSong(item)}
          onkeydown={(e) => { if (e.key === 'Enter') playCacheSong(item); }}
          class="group flex items-center gap-3.5 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors {player.currentSong?.id === item.id ? 'bg-white/10' : ''}"
        >
          <!-- Index or Wave -->
          <div class="w-7 text-[11px] text-neutral-600 group-hover:text-white font-mono flex items-center justify-center">
            {#if player.currentSong?.id === item.id && player.isPlaying}
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
            <img src={item.thumb} alt="" class="w-full h-full object-cover grayscale-20" />
          </div>

          <!-- Title & Artist -->
          <div class="flex-1 min-w-0">
            <h3 class="text-xs font-medium truncate {player.currentSong?.id === item.id ? 'text-white font-semibold' : 'text-neutral-200'}">
              {item.title}
            </h3>
            <p class="text-[11px] text-neutral-500 truncate mt-0.5">
              {item.artist}
            </p>
          </div>

          <!-- Disk Size -->
          <div class="text-[11px] text-neutral-400 font-mono">
            {formatBytes(item.file_size_bytes)}
          </div>

          <!-- Duration -->
          <div class="text-[11px] text-neutral-500 font-mono px-2">
            {item.duration}
          </div>

          <!-- Delete Cache Action -->
          <button
            onclick={(e) => deleteItem(item.id, e)}
            class="p-1.5 text-neutral-600 hover:text-white transition-colors"
            title="Delete from cache"
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
      <p class="text-xs text-neutral-500 font-mono">CACHE EMPTY</p>
    </div>
  {/if}
</div>
