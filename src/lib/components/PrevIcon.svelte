<script lang="ts">
  import { onDestroy } from 'svelte';
  import { cancelAnimations, runGpuAnim } from '../iconAnim';

  interface Props {
    /** Icon width and height in px (or CSS unit) */
    size?: number | string;
    /** Additional CSS classes */
    class?: string;
    /** Whether an impulse animation should fire (e.g. on click/track skip) */
    active?: boolean;
  }

  let {
    size = 20,
    class: className = '',
    active = false
  }: Props = $props();

  let triEl = $state<SVGSVGElement | null>(null);
  let barEl = $state<SVGSVGElement | null>(null);
  const activeAnims: Animation[] = [];

  export function triggerPulse() {
    cancelAnimations(activeAnims);

    // Triangle leftward strike -> impact squash against left stopper bar -> crisp spring rebound
    runGpuAnim(
      activeAnims,
      triEl,
      [
        { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
        { transform: 'translate3d(1.1px, 0, 0) scale(0.95, 1.03)', offset: 0.14 },
        { transform: 'translate3d(-2.1px, 0, 0) scale(0.90, 1.12)', offset: 0.34 },
        { transform: 'translate3d(0.6px, 0, 0) scale(1.04, 0.97)', offset: 0.68 },
        { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
      ],
      { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      () => {
        if (triEl) triEl.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
      }
    );

    runGpuAnim(
      activeAnims,
      barEl,
      [
        { transform: 'translate3d(0, 0, 0) scaleY(1)' },
        { transform: 'translate3d(-1.7px, 0, 0) scaleY(0.93)', offset: 0.36 },
        { transform: 'translate3d(0.45px, 0, 0) scaleY(1.02)', offset: 0.7 },
        { transform: 'translate3d(0, 0, 0) scaleY(1)' }
      ],
      { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      () => {
        if (barEl) barEl.style.transform = 'translate3d(0, 0, 0) scaleY(1)';
      }
    );
  }

  let prevActive: boolean | null = null;
  $effect(() => {
    const currentActive = active;
    if (prevActive === null) {
      prevActive = currentActive;
      return;
    }
    if (currentActive && !prevActive) {
      triggerPulse();
    }
    prevActive = currentActive;
  });

  onDestroy(() => {
    cancelAnimations(activeAnims);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="prev-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  onclick={() => triggerPulse()}
  aria-label="Previous track"
>
  <svg
    bind:this={barEl}
    viewBox="0 0 24 24"
    fill="none"
    class="prev-layer absolute inset-0 z-10 w-full h-full overflow-visible"
  >
    <path
      d="M 6.80 6.80 L 6.80 17.20"
      stroke="currentColor"
      stroke-width="2.1"
      stroke-linecap="round"
    />
  </svg>

  <svg
    bind:this={triEl}
    viewBox="0 0 24 24"
    fill="none"
    class="prev-layer absolute inset-0 z-10 w-full h-full overflow-visible"
  >
    <path
      d="M 9.35 12.00 L 16.60 6.60 L 16.60 17.40 Z"
      fill="currentColor"
      stroke="currentColor"
      stroke-width="2.0"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</div>

<style>
  .prev-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .prev-layer {
    transform-origin: center center;
    will-change: transform;
    pointer-events: none;
  }
</style>
