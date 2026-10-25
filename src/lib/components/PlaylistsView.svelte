<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobile } from '../platform';
  import { playlistStore } from '../playlistStore.svelte';
  import { player } from '../player.svelte';
  import { savedStore } from '../savedStore.svelte';
  import { formatSongSize } from '../utils';
  import TrackImage from './TrackImage.svelte';
  import PlayingEqualizer from './PlayingEqualizer.svelte';
  import BackIcon from './BackIcon.svelte';
  import type { Playlist, Song } from '../types';

  let isCreating = $state<boolean>(false);
  let newName = $state<string>('');
  let createInputEl = $state<HTMLInputElement | null>(null);

  let isRenaming = $state<boolean>(false);
  let renameValue = $state<string>('');
  let renameInputEl = $state<HTMLInputElement | null>(null);
  let isMobileView = $state(isMobile());

  onMount(() => {
    isMobileView = isMobile();
  });

  let selectedPlaylist = $derived<Playlist | null>(
    playlistStore.playlists.find((p) => p.id === playlistStore.selectedPlaylistId) ?? null
  );

  function startCreate() {
    isCreating = true;
    newName = '';
    requestAnimationFrame(() => {
      createInputEl?.focus();
    });
  }

  async function submitCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      isCreating = false;
      return;
    }
    const pl = await playlistStore.create(trimmed);
    isCreating = false;
    newName = '';
    if (pl) {
      playlistStore.selectedPlaylistId = pl.id;
    }
  }

  function startRename() {
    if (!selectedPlaylist) return;
    isRenaming = true;
    renameValue = selectedPlaylist.name;
    requestAnimationFrame(() => {
      renameInputEl?.focus();
      renameInputEl?.select();
    });
  }

  async function submitRename() {
    if (!selectedPlaylist) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== selectedPlaylist.name) {
      await playlistStore.rename(selectedPlaylist.id, trimmed);
    }
    isRenaming = false;
  }

  async function deleteCurrentPlaylist() {
    if (!selectedPlaylist) return;
    const id = selectedPlaylist.id;
    playlistStore.selectedPlaylistId = null;
    await playlistStore.delete(id);
  }

  function playPlaylist(pl: Playlist, startIndex = 0) {
    if (!pl.songs || pl.songs.length === 0) return;
    player.play(
      pl.songs[startIndex],
      { type: 'playlist', title: pl.name, playlistId: pl.id, songs: pl.songs },
      startIndex
    );
  }

  function shufflePlaylist(pl: Playlist) {
    if (!pl.songs || pl.songs.length === 0) return;
    const shuffled = [...pl.songs].sort(() => Math.random() - 0.5);
    player.play(
      shuffled[0],
      { type: 'playlist', title: pl.name, playlistId: pl.id, songs: shuffled },
      0
    );
  }

  function computeTotalDuration(songs: Song[]): string {
    let totalSecs = 0;
    for (const s of songs) {
      if (!s.duration) continue;
      const parts = s.duration.split(':').map((p) => parseInt(p, 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        totalSecs += parts[0] * 60 + parts[1];
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        totalSecs += parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    if (hrs > 0) {
      return `${hrs} hr ${mins} min`;
    }
    return `${mins} min`;
  }
</script>

<div class="flex-1 h-full overflow-y-auto px-3 sm:px-6 pt-2 sm:pt-3 pb-28 flex flex-col gap-5 select-none font-sans bg-black w-full smooth-scroll-container">
  {#if selectedPlaylist}
    <!-- Detail View: Single Playlist -->
    <div class="flex flex-col gap-6 w-full">
      <!-- Back Navigation Bar -->
      <div class="flex items-center justify-between min-h-10 w-full">
        <button
          onclick={() => { playlistStore.selectedPlaylistId = null; isRenaming = false; }}
          class="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <BackIcon size={16} strokeWidth={2.2} direction="left" />
          <span class="font-mono text-neutral-400">PLAYLISTS</span>
        </button>

        <button
          onclick={deleteCurrentPlaylist}
          class="text-xs text-neutral-500 hover:text-red-400 transition-colors cursor-pointer font-mono"
          title="Delete playlist"
        >
          DELETE PLAYLIST
        </button>
      </div>

      <!-- Playlist Header / Banner -->
      <div class="flex flex-col sm:flex-row items-start sm:items-end gap-5">
        <!-- Cover Art or Mosaic -->
        <div class="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl bg-neutral-900 overflow-hidden flex-shrink-0 shadow-2xl relative border border-white/5">
          {#if selectedPlaylist.songs.length >= 4}
            <div class="grid grid-cols-2 grid-rows-2 w-full h-full">
              {#each selectedPlaylist.songs.slice(0, 4) as s}
                <TrackImage src={s.thumb} alt={s.title} class="w-full h-full object-cover" />
              {/each}
            </div>
          {:else if selectedPlaylist.songs.length > 0}
            <TrackImage src={selectedPlaylist.songs[0].thumb} alt={selectedPlaylist.songs[0].title} class="w-full h-full object-cover" />
          {:else}
            <div class="w-full h-full flex items-center justify-center text-neutral-700">
              <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </div>
          {/if}
        </div>

        <!-- Meta & Actions -->
        <div class="flex-1 min-w-0 flex flex-col justify-end gap-3">
          <div>
            {#if isRenaming}
              <form onsubmit={(e) => { e.preventDefault(); submitRename(); }} class="flex items-center gap-2">
                <input
                  bind:this={renameInputEl}
                  bind:value={renameValue}
                  onblur={submitRename}
                  onkeydown={(e) => { if (e.key === 'Escape') isRenaming = false; }}
                  class="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-xl sm:text-2xl font-medium text-white focus:outline-none focus:border-accent max-w-md w-full"
                />
              </form>
            {:else}
              <button
                onclick={startRename}
                class="text-left group cursor-pointer"
                title="Click to rename"
              >
                <h1 class="text-xl sm:text-2xl md:text-3xl font-medium text-white group-hover:text-neutral-200 truncate">
                  {selectedPlaylist.name}
                </h1>
              </button>
            {/if}

            <p class="text-xs text-neutral-500 font-mono mt-1">
              {selectedPlaylist.songs.length} {selectedPlaylist.songs.length === 1 ? 'track' : 'tracks'}
              {#if selectedPlaylist.songs.length > 0}
                • {computeTotalDuration(selectedPlaylist.songs)}
              {/if}
            </p>
          </div>

          <!-- Play / Shuffle Controls -->
          {#if selectedPlaylist.songs.length > 0}
            <div class="flex items-center gap-3">
              <button
                onclick={() => selectedPlaylist && playPlaylist(selectedPlaylist, 0)}
                class="px-5 py-2 rounded-full bg-accent text-accent-contrast text-xs font-medium flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
              >
                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </button>

              <button
                onclick={() => selectedPlaylist && shufflePlaylist(selectedPlaylist)}
                class="p-2 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="Shuffle playlist"
                aria-label="Shuffle playlist"
              >
                <svg class="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/>
                  <path d="m18 2 4 4-4 4"/>
                  <path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l2.8 4"/>
                  <path d="m15.5 13.7 1.3 1.8c.7 1.1 2 1.7 3.3 1.7H22"/>
                  <path d="m18 14 4 4-4 4"/>
                </svg>
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Songs Table (Matching Liked & Saved views) -->
      {#if selectedPlaylist.songs.length > 0}
        <div class="flex flex-col gap-1 w-full mt-2">
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
          {#each selectedPlaylist.songs as song, i}
            {#if isMobileView}
              <!-- Android Mobile Track Row: Pure Track (Art + Title/Artist) + Time + Remove Action -->
              <div
                role="button"
                tabindex="0"
                onclick={() => selectedPlaylist && playPlaylist(selectedPlaylist, i)}
                onkeydown={(e) => { if (e.key === 'Enter' && selectedPlaylist) playPlaylist(selectedPlaylist, i); }}
                class="flex items-center justify-between gap-3 px-2.5 py-2.5 rounded-xl transition-colors cursor-pointer w-full group active:bg-white/[0.08] {player.currentSong?.id === song.id ? 'bg-accent/15' : ''}"
              >
                <!-- Track: Thumbnail + Title & Artist -->
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <div class="w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0 relative">
                    <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
                  </div>
                  <div class="flex flex-col min-w-0 flex-1">
                    <p class="text-sm font-medium truncate {player.currentSong?.id === song.id ? 'text-accent' : 'text-white'}" title={song.title}>
                      {song.title}
                    </p>
                    <p class="text-xs text-neutral-400 font-normal truncate mt-0.5">
                      {song.artist || song.album || 'Unknown'}
                    </p>
                  </div>
                </div>

                <!-- Time + Remove Action -->
                <div class="flex items-center gap-2 flex-shrink-0 pl-2">
                  {#if player.currentSong?.id === song.id && player.isPlaying}
                    <PlayingEqualizer isPlaying={player.isPlaying} />
                  {:else}
                    <span class="text-xs text-neutral-500 font-mono">
                      {song.duration || '—'}
                    </span>
                  {/if}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      if (selectedPlaylist) playlistStore.removeSong(selectedPlaylist.id, song.id);
                    }}
                    class="p-2 text-neutral-500 active:text-white transition-colors cursor-pointer"
                    title="Remove from playlist"
                    aria-label="Remove from playlist"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            {:else}
              <!-- Desktop Grid Row (Unchanged) -->
              <div
                role="button"
                tabindex="0"
                onclick={() => selectedPlaylist && playPlaylist(selectedPlaylist, i)}
                onkeydown={(e) => { if (e.key === 'Enter' && selectedPlaylist) playPlaylist(selectedPlaylist, i); }}
                class="grid grid-cols-[32px_minmax(180px,1.6fr)_80px_minmax(140px,1.2fr)_64px_36px] items-center gap-4 px-3 py-2 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors w-full group virtual-scroll-item {player.currentSong?.id === song.id ? 'bg-accent/10' : ''}"
              >
                <!-- 1. Index or Pulse Equalizer -->
                <div class="text-xs text-neutral-500 group-hover:text-white font-mono flex items-center justify-center">
                  {#if player.currentSong?.id === song.id && player.isPlaying}
                    <PlayingEqualizer isPlaying={player.isPlaying} />
                  {:else}
                    <span class="group-hover:hidden">{i + 1}</span>
                    <svg class="w-3.5 h-3.5 fill-current hidden group-hover:block" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  {/if}
                </div>

                <!-- 2. Track Title & Thumbnail -->
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-10 h-10 aspect-square rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0">
                    <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-xs sm:text-sm font-medium text-white truncate group-hover:text-accent transition-colors" title={song.title}>
                      {song.title}
                    </p>
                  </div>
                </div>

                <!-- 3. Size -->
                <div class="text-right text-xs text-neutral-500 font-mono truncate">
                  {savedStore.isSaved(song.id) ? formatSongSize(savedStore.getSize(song.id)) : '—'}
                </div>

                <!-- 4. Artist / Album -->
                <div class="text-left text-xs text-neutral-400 font-normal truncate">
                  {song.artist || song.album || 'Unknown'}
                </div>

                <!-- 5. Time -->
                <div class="text-right text-xs text-neutral-500 font-mono">
                  {song.duration || '—'}
                </div>

                <!-- 6. Remove Action -->
                <div class="flex items-center justify-center">
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      if (selectedPlaylist) playlistStore.removeSong(selectedPlaylist.id, song.id);
                    }}
                    class="p-1.5 text-neutral-600 hover:text-white transition-colors cursor-pointer"
                    title="Remove from playlist"
                    aria-label="Remove from playlist"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center py-24 text-center">
          <p class="text-xs font-mono text-neutral-500 tracking-wider">EMPTY PLAYLIST</p>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Overview: Grid of Playlists -->
    <div class="flex items-center justify-between min-h-10 -mb-2 w-full select-none">
      <p class="text-xs text-neutral-500 font-mono">
        {playlistStore.playlists.length} {playlistStore.playlists.length === 1 ? 'playlist' : 'playlists'}
      </p>

      {#if !isCreating}
        <button
          onclick={startCreate}
          class="text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <span>+</span>
          <span>NEW PLAYLIST</span>
        </button>
      {/if}
    </div>

    <!-- Inline Creator Bar if active -->
    {#if isCreating}
      <form
        onsubmit={(e) => { e.preventDefault(); submitCreate(); }}
        class="flex items-center gap-2 p-3 bg-white/[0.04] border border-white/10 rounded-xl max-w-md w-full"
      >
        <input
          bind:this={createInputEl}
          bind:value={newName}
          placeholder="Playlist name..."
          onkeydown={(e) => { if (e.key === 'Escape') isCreating = false; }}
          class="flex-1 bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          class="px-3 py-1 bg-accent text-accent-contrast text-xs font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
        >
          Create
        </button>
        <button
          type="button"
          onclick={() => (isCreating = false)}
          class="px-2 py-1 text-neutral-400 hover:text-white text-xs cursor-pointer"
        >
          ✕
        </button>
      </form>
    {/if}

    <!-- Grid Cards -->
    {#if playlistStore.playlists.length > 0}
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {#each playlistStore.playlists as pl}
          <div
            role="button"
            tabindex="0"
            onclick={() => (playlistStore.selectedPlaylistId = pl.id)}
            onkeydown={(e) => { if (e.key === 'Enter') playlistStore.selectedPlaylistId = pl.id; }}
            class="flex flex-col gap-2 p-2.5 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group virtual-carousel-card"
          >
            <!-- Card Cover Art -->
            <div class="aspect-square rounded-xl bg-neutral-900 overflow-hidden relative border border-white/5 shadow-md">
              {#if pl.songs.length >= 4}
                <div class="grid grid-cols-2 grid-rows-2 w-full h-full">
                  {#each pl.songs.slice(0, 4) as s}
                    <TrackImage src={s.thumb} alt={s.title} class="w-full h-full object-cover" />
                  {/each}
                </div>
              {:else if pl.songs.length > 0}
                <TrackImage src={pl.songs[0].thumb} alt={pl.songs[0].title} class="w-full h-full object-cover" />
              {:else}
                <div class="w-full h-full flex items-center justify-center text-neutral-700">
                  <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                  </svg>
                </div>
              {/if}

              <!-- Hover Play Button Overlay -->
              {#if pl.songs.length > 0}
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onclick={(e) => { e.stopPropagation(); playPlaylist(pl, 0); }}
                    class="w-10 h-10 rounded-full bg-accent text-accent-contrast flex items-center justify-center shadow-xl cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                    title="Play"
                    aria-label="Play playlist"
                  >
                    <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
              {/if}
            </div>

            <!-- Card Info -->
            <div class="min-w-0">
              <h3 class="text-xs sm:text-sm font-medium text-white truncate group-hover:text-accent transition-colors">
                {pl.name}
              </h3>
              <p class="text-[11px] text-neutral-500 font-mono mt-0.5">
                {pl.songs.length} {pl.songs.length === 1 ? 'track' : 'tracks'}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {:else if !isCreating}
      <div class="flex flex-col items-center justify-center py-28 text-center gap-3">
        <p class="text-xs font-mono text-neutral-500 tracking-wider">NO PLAYLISTS CREATED</p>
        <button
          onclick={startCreate}
          class="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-mono text-neutral-300 hover:text-white transition-colors cursor-pointer"
        >
          CREATE FIRST PLAYLIST
        </button>
      </div>
    {/if}
  {/if}
</div>
