<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    /** Whether media is currently playing (true = shows Pause icon, false = shows Play icon) */
    isPlaying?: boolean;
    /** Whether media is currently buffering/loading */
    isLoading?: boolean;
    /** Icon width and height in px (or CSS unit) */
    size?: number | string;
    /** SVG stroke width for rounded corners */
    strokeWidth?: number | string;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    isPlaying = false,
    isLoading = false,
    size = 20,
    strokeWidth = 2,
    class: className = ''
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // GEOMETRY & ANIMATION LATTICE
  // Play (t = 0): Two halves join seamlessly into a right-pointing triangle.
  // Pause (t = 1): Two halves smoothly split and morph into 2 parallel vertical bars.
  // ---------------------------------------------------------------------------

  // Bar A (Top Half in Play <-> Left Bar in Pause)
  // [x0, y0,  x1, y1,  x2, y2,  x3, y3]
  const BAR_A_PLAY  = [7.5, 5.5,  19.0, 12.0,  19.0, 12.0,  7.5, 12.0];
  const BAR_A_PAUSE = [7.0, 5.5,  10.0,  5.5,  10.0, 18.5,  7.0, 18.5];

  // Bar B (Bottom Half in Play <-> Right Bar in Pause)
  // [x0, y0,  x1, y1,  x2, y2,  x3, y3]
  const BAR_B_PLAY  = [7.5, 12.0,  19.0, 12.0,  19.0, 12.0,  7.5, 18.5];
  const BAR_B_PAUSE = [14.0, 5.5,  17.0,  5.5,  17.0, 18.5, 14.0, 18.5];

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function toPolygonPath(pts: number[]): string {
    return `M ${pts[0].toFixed(2)} ${pts[1].toFixed(2)} L ${pts[2].toFixed(2)} ${pts[3].toFixed(2)} L ${pts[4].toFixed(2)} ${pts[5].toFixed(2)} L ${pts[6].toFixed(2)} ${pts[7].toFixed(2)} Z`;
  }

  // Reactive state for SVG paths and dynamic transforms
  let pathA = $state<string>(toPolygonPath(BAR_A_PLAY));
  let pathB = $state<string>(toPolygonPath(BAR_B_PLAY));
  let opticalNudgeX = $state<number>(0.8);
  let bounceScale = $state<number>(1);

  let rafId: number | null = null;
  let currentProgress = 0;
  let targetProgress = 0;
  let animStartTime = 0;
  let animStartProgress = 0;
  const ANIM_DURATION = 280; // ms (smooth, snappy 120/144/240Hz morph)

  function tick(now: number) {
    const elapsed = now - animStartTime;
    const t = clamp(elapsed / ANIM_DURATION, 0, 1);

    // Ultra-fluid quartic deceleration ease
    const ease = 1 - Math.pow(1 - t, 4);
    currentProgress = lerp(animStartProgress, targetProgress, ease);

    // Interpolate Bar A
    const curA: number[] = [];
    for (let i = 0; i < 8; i++) {
      curA[i] = lerp(BAR_A_PLAY[i], BAR_A_PAUSE[i], currentProgress);
    }

    // Interpolate Bar B
    const curB: number[] = [];
    for (let i = 0; i < 8; i++) {
      curB[i] = lerp(BAR_B_PLAY[i], BAR_B_PAUSE[i], currentProgress);
    }

    pathA = toPolygonPath(curA);
    pathB = toPolygonPath(curB);

    // Optical centering: Play triangle center is slightly to the right of geometric center
    opticalNudgeX = Number(lerp(0.8, 0, currentProgress).toFixed(3));

    // Subtle tactile scale bounce during morph transition
    bounceScale = Number((1.0 - 0.08 * Math.sin(t * Math.PI)).toFixed(3));

    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      currentProgress = targetProgress;
      bounceScale = 1;
      rafId = null;
    }
  }

  function startAnimation(toPlaying: boolean) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    targetProgress = toPlaying ? 1 : 0;
    animStartProgress = currentProgress;
    animStartTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  let wasPlaying: boolean | null = null;

  $effect(() => {
    const isNowPlaying = isPlaying;
    if (wasPlaying === null) {
      wasPlaying = isNowPlaying;
      currentProgress = isNowPlaying ? 1 : 0;
      targetProgress = currentProgress;
      pathA = toPolygonPath(isNowPlaying ? BAR_A_PAUSE : BAR_A_PLAY);
      pathB = toPolygonPath(isNowPlaying ? BAR_B_PAUSE : BAR_B_PLAY);
      opticalNudgeX = isNowPlaying ? 0 : 0.8;
      bounceScale = 1;
    } else if (wasPlaying !== isNowPlaying) {
      wasPlaying = isNowPlaying;
      startAnimation(isNowPlaying);
    }
  });

  onDestroy(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<div
  class="play-pause-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isPlaying ? 'Pause' : 'Play'}
>
  {#if isLoading}
    <!-- Buffering Spinner -->
    <div
      class="play-pause-spinner absolute inset-0 border-2 border-current border-t-transparent rounded-full animate-spin pointer-events-none"
      aria-hidden="true"
    ></div>
  {:else}
    <!-- Morphing Play / Pause Vector SVG -->
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linejoin="round"
      stroke-linecap="round"
      class="play-pause-svg relative z-10 w-full h-full overflow-visible transition-transform"
      style="transform: translateX({opticalNudgeX}px) scale({bounceScale});"
    >
      <path d={pathA} class="play-pause-segment" />
      <path d={pathB} class="play-pause-segment" />
    </svg>
  {/if}
</div>

<style>
  /* -------------------------------------------------------------------------- */
  /* PLAY / PAUSE BUTTON ANIMATIONS & STYLING                                   */
  /* Edit this section freely to fine-tune your animations to perfection!       */
  /* -------------------------------------------------------------------------- */

  .play-pause-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .play-pause-svg {
    transform-origin: center center;
    will-change: transform;
  }

  .play-pause-segment {
    transition: opacity 0.15s ease;
  }
</style>
