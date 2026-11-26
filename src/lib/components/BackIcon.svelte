<script lang="ts">
  import { onDestroy } from 'svelte';
  import { cancelAnimations, runGpuAnim } from '../iconAnim';

  interface Props {
    /** Icon width and height in px (or CSS unit) */
    size?: number | string;
    /** SVG stroke width */
    strokeWidth?: number | string;
    /** Direction of back indicator: 'left' (default back navigation) or 'down' (collapse sheet) */
    direction?: 'left' | 'down';
    /** Additional CSS classes */
    class?: string;
    /** Whether an impulse animation should fire */
    active?: boolean;
  }

  let {
    size = 24,
    strokeWidth = 2.2,
    direction = 'left',
    class: className = '',
    active = false
  }: Props = $props();

  let svgEl = $state<SVGSVGElement | null>(null);
  const activeAnims: Animation[] = [];

  export function triggerPulse() {
    cancelAnimations(activeAnims);

    const keyframes: Keyframe[] =
      direction === 'left'
        ? [
            { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
            { transform: 'translate3d(-3px, 0, 0) scale(1.08, 0.92)', offset: 0.28 },
            { transform: 'translate3d(1px, 0, 0) scale(0.96, 1.04)', offset: 0.68 },
            { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
          ]
        : [
            { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
            { transform: 'translate3d(0, 3px, 0) scale(0.92, 1.08)', offset: 0.28 },
            { transform: 'translate3d(0, -1px, 0) scale(1.04, 0.96)', offset: 0.68 },
            { transform: 'translate3d(0, 0, 0) scale(1, 1)' }
          ];

    runGpuAnim(
      activeAnims,
      svgEl,
      keyframes,
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      () => {
        if (svgEl) svgEl.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
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
  class="back-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  onclick={() => triggerPulse()}
>
  <svg
    bind:this={svgEl}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="back-svg relative z-10 w-full h-full overflow-visible"
  >
    <path d={direction === 'left' ? 'M 15 5 L 8 12 L 15 19' : 'M 5 9 L 12 16 L 19 9'} class="pointer-events-none" />
  </svg>
</div>

<style>
  .back-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .back-svg {
    transform-origin: center center;
    will-change: transform;
  }
</style>
