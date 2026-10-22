<script lang="ts">
  import { player } from '../player.svelte';

  let containerEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (player.showLyrics && player.activeLyricIndex !== -1 && containerEl) {
      const activeNode = containerEl.querySelector(`[data-lyric-index="${player.activeLyricIndex}"]`);
      if (activeNode) {
        activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });

  function jumpToLyric(time: number) {
    player.seek(time);
  }
</script>

{#if player.showLyrics}
  <div class="fixed inset-0 z-50 bg-[#0c0d12]/95 backdrop-blur-2xl flex flex-col p-8 transition-opacity">
    <!-- Top Bar -->
    <div class="flex items-center justify-between pb-6 border-b border-white/5">
      <div class="flex items-center gap-3">
        {#if player.currentSong?.thumb}
          <img src={player.currentSong.thumb} alt="" class="w-10 h-10 rounded-xl object-cover shadow-lg" />
        {/if}
        <div>
          <h2 class="text-sm font-bold text-white truncate">{player.currentSong?.title}</h2>
          <p class="text-xs text-neutral-400 truncate">{player.currentSong?.artist}</p>
        </div>
      </div>

      <button
        onclick={() => (player.showLyrics = false)}
        class="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
        title="Close Lyrics"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Lyrics Content -->
    <div bind:this={containerEl} class="flex-1 overflow-y-auto py-12 flex flex-col items-center gap-6 text-center select-none">
      {#if player.parsedLyrics.length > 0}
        {#each player.parsedLyrics as line, i}
          <button
            data-lyric-index={i}
            onclick={() => jumpToLyric(line.time)}
            class="text-xl sm:text-2xl md:text-3xl font-bold transition-all duration-300 max-w-2xl px-4 py-2 rounded-2xl {player.activeLyricIndex === i ? 'text-pink-400 scale-105 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)]' : 'text-neutral-500 hover:text-neutral-300'}"
          >
            {line.text}
          </button>
        {/each}
      {:else if player.lyrics.plain}
        <div class="whitespace-pre-line text-lg text-neutral-300 max-w-xl leading-relaxed">
          {player.lyrics.plain}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center my-auto text-neutral-500 gap-2">
          <span class="text-3xl">🎵</span>
          <p class="text-sm">No lyrics found for this track</p>
        </div>
      {/if}
    </div>
  </div>
{/if}
