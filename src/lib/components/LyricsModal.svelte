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
  <div class="fixed inset-0 z-50 bg-[#09090b]/98 backdrop-blur-xl flex flex-col p-6 transition-opacity">
    <!-- Top Bar -->
    <div class="flex items-center justify-between pb-4 border-b border-white/5">
      <div class="flex items-center gap-3">
        {#if player.currentSong?.thumb}
          <img src={player.currentSong.thumb} alt="" class="w-8 h-8 rounded object-cover grayscale-20" />
        {/if}
        <div>
          <h2 class="text-xs font-semibold text-white truncate">{player.currentSong?.title}</h2>
          <p class="text-[11px] text-neutral-500 truncate">{player.currentSong?.artist}</p>
        </div>
      </div>

      <button
        onclick={() => (player.showLyrics = false)}
        class="p-1.5 rounded-md hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
        title="Close"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Lyrics Content -->
    <div bind:this={containerEl} class="flex-1 overflow-y-auto py-12 flex flex-col items-center gap-5 text-center select-none">
      {#if player.parsedLyrics.length > 0}
        {#each player.parsedLyrics as line, i}
          <button
            data-lyric-index={i}
            onclick={() => jumpToLyric(line.time)}
            class="text-lg sm:text-xl md:text-2xl font-bold transition-all duration-200 max-w-xl px-3 py-1.5 rounded-lg {player.activeLyricIndex === i ? 'text-white font-extrabold' : 'text-neutral-600 hover:text-neutral-400'}"
          >
            {line.text}
          </button>
        {/each}
      {:else if player.lyrics.plain}
        <div class="whitespace-pre-line text-sm text-neutral-300 max-w-lg leading-relaxed font-mono">
          {player.lyrics.plain}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center my-auto text-neutral-600">
          <p class="text-xs font-mono">NO LYRICS AVAILABLE</p>
        </div>
      {/if}
    </div>
  </div>
{/if}
