<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobile } from '../platform';
  import { songContextMenuStore } from '../songContextMenuStore.svelte';
  import { playlistStore } from '../playlistStore.svelte';
  import { likedStore } from '../likedStore.svelte';
  import { navigationStore } from '../navigationStore.svelte';
  import TrackImage from './TrackImage.svelte';
  import HeartIcon from './HeartIcon.svelte';

  let isMobileView = $state<boolean>(false);
  let createInputDesktopEl = $state<HTMLInputElement | null>(null);
  let createInputMobileEl = $state<HTMLInputElement | null>(null);
  let menuDesktopEl = $state<HTMLDivElement | null>(null);

  let menuX = $state<number>(0);
  let menuY = $state<number>(0);

  onMount(() => {
    isMobileView = isMobile();
  });

  let song = $derived(songContextMenuStore.song);
  let isOpen = $derived(songContextMenuStore.isOpen && !!song);
  let isLiked = $derived(song ? likedStore.isLiked(song.id) : false);

  $effect(() => {
    if (songContextMenuStore.isCreating) {
      return navigationStore.register('ctx_create', 60, () => {
        songContextMenuStore.isCreating = false;
        return true;
      });
    }
  });

  $effect(() => {
    if (isOpen) {
      return navigationStore.register('ctx_menu', 50, () => {
        songContextMenuStore.close();
        return true;
      });
    }
  });

  // Smart desktop position clamping so the menu never renders off-screen
  $effect(() => {
    if (isOpen && !isMobileView && !songContextMenuStore.isTouch) {
      const x = songContextMenuStore.position.x;
      const y = songContextMenuStore.position.y;
      const menuWidth = 280;
      const menuHeight = 340;

      const maxX = Math.max(12, (window.innerWidth || 800) - menuWidth - 16);
      const maxY = Math.max(12, (window.innerHeight || 600) - menuHeight - 16);

      menuX = Math.min(Math.max(12, x), maxX);
      // If clicking near the bottom of viewport, flip upwards
      if (y > maxY) {
        menuY = Math.max(12, y - menuHeight);
      } else {
        menuY = Math.max(12, y);
      }
    }
  });

  function startCreate() {
    songContextMenuStore.isCreating = true;
    requestAnimationFrame(() => {
      createInputDesktopEl?.focus();
      createInputMobileEl?.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      songContextMenuStore.close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && song}
  {#if isMobileView || songContextMenuStore.isTouch}
    <!-- ===================================================================== -->
    <!-- MOBILE BOTTOM SHEET                                                   -->
    <!-- ===================================================================== -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center transition-opacity duration-200"
      onclick={() => songContextMenuStore.close()}
    >
      <div
        class="w-full max-w-md bg-[#121216] border-t border-white/10 rounded-t-3xl p-5 pb-8 flex flex-col gap-4 max-h-[80vh] shadow-[0_-16px_48px_rgba(0,0,0,0.95)] anim-slide-up"
        style="padding-bottom: max(2rem, env(safe-area-inset-bottom, 2rem));"
        onclick={(e) => e.stopPropagation()}
      >
        <!-- Top Pill Drag Indicator -->
        <div class="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-0.5"></div>

        <!-- Song Overview Header -->
        <div class="flex items-center gap-3.5 pb-2 border-b border-white/[0.08]">
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-neutral-900 flex-shrink-0 relative shadow-md">
            <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold text-white truncate" title={song.title}>
              {song.title}
            </h3>
            <p class="text-xs text-neutral-400 font-normal truncate mt-0.5">
              {song.artist}
            </p>
          </div>

          <!-- Quick Like Button -->
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onclick={() => songContextMenuStore.toggleLike()}
              class="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center transition-all cursor-pointer {isLiked ? 'text-accent' : 'text-neutral-400 hover:text-white'}"
              title={isLiked ? 'Unlike' : 'Like'}
              aria-label="Like"
            >
              <HeartIcon {isLiked} size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        <!-- Action Row: Add to Queue & Play Next -->
        <div class="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onclick={() => songContextMenuStore.addToQueue()}
            class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-95 text-xs font-medium text-white transition-all cursor-pointer"
          >
            <svg class="w-4 h-4 text-accent stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h16M4 12h10M4 18h6m4-3v6m3-3h-6" />
            </svg>
            <span>Add to Queue</span>
          </button>
          <button
            type="button"
            onclick={() => songContextMenuStore.playNext()}
            class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-95 text-xs font-medium text-white transition-all cursor-pointer"
          >
            <svg class="w-4 h-4 text-neutral-300 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h10M4 12h10M4 18h6m8-6 4 4-4 4m4-4h-8"/>
            </svg>
            <span>Play Next</span>
          </button>
        </div>

        <!-- Add to Playlist Header -->
        <div class="flex items-center justify-between w-full pt-1">
          <span class="text-[11px] font-mono tracking-wider text-neutral-400 uppercase font-semibold">
            Add to Playlist
          </span>
          <button
            type="button"
            onclick={startCreate}
            class="text-xs text-accent hover:underline flex items-center gap-1 font-medium cursor-pointer active:scale-95 transition-all"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Playlist
          </button>
        </div>

        <!-- Inline New Playlist Creator -->
        {#if songContextMenuStore.isCreating}
          <form
            onsubmit={(e) => { e.preventDefault(); songContextMenuStore.createPlaylist(); }}
            class="flex items-center gap-2 pt-1"
          >
            <input
              bind:this={createInputMobileEl}
              type="text"
              bind:value={songContextMenuStore.newPlaylistName}
              placeholder="Playlist name..."
              class="flex-1 bg-white/[0.07] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-accent font-sans"
            />
            <button
              type="submit"
              disabled={!songContextMenuStore.newPlaylistName.trim()}
              class="px-4 py-2.5 rounded-xl bg-accent text-accent-contrast font-semibold text-xs active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer font-sans"
            >
              Add
            </button>
          </form>
        {/if}

        <!-- Playlists List -->
        <div class="flex-1 overflow-y-auto flex flex-col gap-1 max-h-60 no-scrollbar pt-1">
          {#if playlistStore.playlists.length === 0}
            <div class="flex flex-col items-center justify-center py-8 text-neutral-500 gap-1.5">
              <p class="text-xs font-mono tracking-wider">NO PLAYLISTS YET</p>
              <button
                type="button"
                onclick={startCreate}
                class="text-xs text-accent hover:underline mt-1 cursor-pointer font-medium"
              >
                Create your first playlist
              </button>
            </div>
          {:else}
            {#each playlistStore.playlists as pl}
              {@const inPl = playlistStore.isSongInPlaylist(pl.id, song.id)}
              <button
                type="button"
                onclick={() => songContextMenuStore.togglePlaylist(pl.id)}
                class="flex items-center justify-between w-full px-3.5 py-3 rounded-2xl hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors cursor-pointer text-left {inPl ? 'bg-white/[0.06]' : ''}"
              >
                <div class="flex items-center gap-3 min-w-0 flex-1 pr-3">
                  <div class="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-neutral-400">
                    <svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium {inPl ? 'text-accent' : 'text-white'} truncate">{pl.name}</p>
                    <p class="text-[11px] font-mono text-neutral-500 mt-0.5">{pl.songs.length} {pl.songs.length === 1 ? 'track' : 'tracks'}</p>
                  </div>
                </div>

                <!-- Checkbox / Toggle Indicator -->
                <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors {inPl ? 'bg-accent text-accent-contrast' : 'border border-white/20'}">
                  {#if inPl}
                    <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                    </svg>
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <!-- ===================================================================== -->
    <!-- DESKTOP CONTEXT MENU (ANCHORED AT CURSOR WITH VIEWPORT SAFETY)         -->
    <!-- ===================================================================== -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-50 bg-transparent"
      onclick={() => songContextMenuStore.close()}
      oncontextmenu={(e) => { e.preventDefault(); songContextMenuStore.close(); }}
    >
      <div
        bind:this={menuDesktopEl}
        class="fixed z-50 w-72 bg-[#121216]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-3.5 flex flex-col gap-2.5 overflow-hidden anim-scale-up select-none"
        style="left: {menuX}px; top: {menuY}px;"
        onclick={(e) => e.stopPropagation()}
      >
        <!-- Mini Header: Artwork + Title + Quick Actions -->
        <div class="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
          <div class="w-10 h-10 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0 relative shadow-sm">
            <TrackImage src={song.thumb} alt={song.title} class="w-full h-full object-cover" />
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-semibold text-white truncate" title={song.title}>
              {song.title}
            </h4>
            <p class="text-[11px] text-neutral-400 font-normal truncate mt-0.5">
              {song.artist}
            </p>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onclick={() => songContextMenuStore.toggleLike()}
              class="w-7 h-7 rounded-lg hover:bg-white/[0.08] active:scale-95 flex items-center justify-center transition-colors cursor-pointer {isLiked ? 'text-accent' : 'text-neutral-400 hover:text-white'}"
              title={isLiked ? 'Unlike' : 'Like'}
              aria-label="Like"
            >
              <HeartIcon {isLiked} size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        <!-- Action Options: Add to Queue & Play Next -->
        <div class="flex flex-col gap-0.5 pt-0.5">
          <button
            type="button"
            onclick={() => songContextMenuStore.addToQueue()}
            class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] text-xs font-medium text-white transition-colors cursor-pointer group"
          >
            <svg class="w-3.5 h-3.5 text-accent stroke-current fill-none transition-transform group-hover:scale-105" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h16M4 12h10M4 18h6m4-3v6m3-3h-6" />
            </svg>
            <span>Add to Queue</span>
          </button>
          <button
            type="button"
            onclick={() => songContextMenuStore.playNext()}
            class="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] text-xs font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer group"
          >
            <svg class="w-3.5 h-3.5 text-neutral-400 group-hover:text-white stroke-current fill-none transition-colors" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h10M4 12h10M4 18h6m8-6 4 4-4 4m4-4h-8"/>
            </svg>
            <span>Play Next</span>
          </button>
        </div>

        <div class="border-t border-white/[0.08] my-0.5"></div>

        <!-- Section Title & Create Button -->
        <div class="flex items-center justify-between w-full">
          <span class="text-[10px] font-mono tracking-wider text-neutral-400 uppercase font-semibold">
            Add to Playlist
          </span>
          <button
            type="button"
            onclick={startCreate}
            class="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New
          </button>
        </div>

        <!-- Inline New Playlist Creator -->
        {#if songContextMenuStore.isCreating}
          <form
            onsubmit={(e) => { e.preventDefault(); songContextMenuStore.createPlaylist(); }}
            class="flex items-center gap-1.5"
          >
            <input
              bind:this={createInputDesktopEl}
              type="text"
              bind:value={songContextMenuStore.newPlaylistName}
              placeholder="Playlist name..."
              class="flex-1 bg-white/[0.07] border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-accent font-sans"
            />
            <button
              type="submit"
              disabled={!songContextMenuStore.newPlaylistName.trim()}
              class="px-2.5 py-1 rounded-lg bg-accent text-accent-contrast font-semibold text-xs active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer font-sans"
            >
              Add
            </button>
          </form>
        {/if}

        <!-- Playlists List -->
        <div class="flex-1 overflow-y-auto flex flex-col gap-0.5 max-h-52 no-scrollbar">
          {#if playlistStore.playlists.length === 0}
            <div class="py-5 text-center text-[11px] font-mono text-neutral-500">
              NO PLAYLISTS YET
            </div>
          {:else}
            {#each playlistStore.playlists as pl}
              {@const inPl = playlistStore.isSongInPlaylist(pl.id, song.id)}
              <button
                type="button"
                onclick={() => songContextMenuStore.togglePlaylist(pl.id)}
                class="flex items-center justify-between w-full px-2.5 py-2 rounded-xl hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors cursor-pointer text-left {inPl ? 'bg-white/[0.04]' : ''}"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                  <svg class="w-3.5 h-3.5 text-neutral-500 flex-shrink-0 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                  <span class="text-xs font-medium {inPl ? 'text-accent' : 'text-neutral-200'} truncate">
                    {pl.name}
                  </span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="text-[10px] font-mono text-neutral-500">
                    {pl.songs.length}
                  </span>
                  <div class="w-4 h-4 rounded flex items-center justify-center {inPl ? 'text-accent' : 'opacity-0'}">
                    <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                    </svg>
                  </div>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  @keyframes scaleUp {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .anim-scale-up {
    animation: scaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .anim-slide-up {
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
