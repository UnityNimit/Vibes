<script lang="ts">
  interface Props {
    isPlaying?: boolean;
    class?: string;
  }

  let { isPlaying = true, class: className = '' }: Props = $props();
</script>

<div
  class="flex items-end justify-center gap-[2px] h-3.5 w-3.5 flex-shrink-0 select-none pointer-events-none {className}"
  aria-label="Playing equalizer"
>
  <span
    class="w-[2.5px] h-full bg-accent rounded-full {isPlaying ? 'animate-eq-1' : 'scale-y-[0.3] origin-bottom'}"
  ></span>
  <span
    class="w-[2.5px] h-full bg-accent rounded-full {isPlaying ? 'animate-eq-2' : 'scale-y-[0.75] origin-bottom'}"
  ></span>
  <span
    class="w-[2.5px] h-full bg-accent rounded-full {isPlaying ? 'animate-eq-3' : 'scale-y-[0.4] origin-bottom'}"
  ></span>
</div>
