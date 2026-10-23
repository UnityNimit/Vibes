<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { player } from '../player.svelte';
  import { formatBytes } from '../utils';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
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

  function playCacheSong(item: CacheItem, index: number) {
    const allCachedSongs: Song[] = cachedItems.map(i => ({
      id: i.id,
      title: i.title,
      artist: i.artist,
      album: i.album,
      duration: i.duration,
      thumb: i.thumb,
    }));
    const song = allCachedSongs[index] ?? {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      thumb: item.thumb,
    };
    player.play(song, { type: 'saved', title: 'Saved Tracks', songs: allCachedSongs }, index);
  }
</script>

<div class="flex-1 h-full overflow-y-auto px-6 pt-3 pb-28 flex flex-col gap-5 select-none font-sans bg-black w-full smooth-scroll-container">
  <!-- Minimalist Header (Full Width, Zero Partition Line) -->
  <div class="flex items-center justify-between -mb-2 w-full select-none">
    <p class="text-xs text-neutral-500 font-mono">
      {stats.total_songs} {stats.total_songs === 1 ? 'track' : 'tracks'} • {stats.total_size_mb.toFixed(1)} MB
    </p>
  </div>

  <!-- Content: Strict CSS Grid Alignment & Full Horizontal Expansion -->
  {#if isLoading}
    <div class="flex items-center justify-center py-20">
      <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if cachedItems.length > 0}
    <div class="flex flex-col gap-1 w-full">
      <!-- Grid Column Header -->
      <div class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 pb-2 text-xs text-neutral-500 font-mono w-full select-none">
        <span class="text-center">#</span>
        <span class="font-sans text-left">Track</span>
        <span class="text-right">Size</span>
        <span class="text-left">Artist / Album</span>
        <span class="text-right">Time</span>
        <span></span>
      </div>

      <!-- Result Rows -->
      {#each cachedItems as item, i}
        <div
          role="button"
          tabindex="0"
          onclick={() => playCacheSong(item, i)}
          onkeydown={(e) => { if (e.key === 'Enter') playCacheSong(item, i); }}
          class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 py-2 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors w-full group virtual-scroll-item {player.currentSong?.id === item.id ? 'bg-accent/10' : ''}"
        >
          <!-- 1. Index or Pulse Equalizer -->
          <div class="text-xs text-neutral-500 group-hover:text-white font-mono flex items-center justify-center">
            {#if player.currentSong?.id === item.id && player.isPlaying}
              <PlayingEqualizer isPlaying={player.isPlaying} />
            {:else}
              <span class="group-hover:hidden">{i + 1}</span>
              <svg class="w-3.5 h-3.5 hidden group-hover:block fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            {/if}
          </div>

          <!-- 2. Track: Thumbnail + Title -->
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 aspect-square rounded-lg bg-[#111114] overflow-hidden flex-shrink-0">
              <TrackImage src={item.thumb} alt={item.title} class="w-full h-full object-cover" iconClass="w-4 h-4 text-neutral-500" />
            </div>
            <div class="flex flex-col min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <h3 class="text-xs sm:text-sm font-medium truncate {player.currentSong?.id === item.id ? 'text-accent' : 'text-neutral-200 group-hover:text-white'}">
                  {item.title}
                </h3>
              </div>
              <p class="text-xs text-neutral-400 font-normal truncate mt-0.5 md:hidden">
                {item.artist}
              </p>
            </div>
          </div>

          <!-- 3. Disk Size -->
          <div class="text-right text-xs text-neutral-400 font-mono">
            {formatBytes(item.file_size_bytes)}
          </div>

          <!-- 4. Artist / Album -->
          <div class="text-xs text-neutral-400 font-normal truncate text-left" title={item.album || item.artist}>
            {item.album || item.artist}
          </div>

          <!-- 5. Duration -->
          <div class="text-right text-xs text-neutral-400 font-mono">
            {item.duration}
          </div>

          <!-- 6. Delete Action Button -->
          <div class="flex items-center justify-end">
            <button
              onclick={(e) => deleteItem(item.id, e)}
              class="p-1.5 text-neutral-600 hover:text-white transition-colors cursor-pointer"
              title="Delete from saved"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="py-24 text-center flex flex-col items-center gap-2">
      <p class="text-xs font-mono text-neutral-500">NO SAVED TRACKS YET</p>
    </div>
  {/if}
</div>
