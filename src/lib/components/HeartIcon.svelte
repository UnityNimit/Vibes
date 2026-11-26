<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { cancelAnimations, runGpuAnim } from '../iconAnim';

  interface Props {
    /** Whether the item is liked / active */
    isLiked?: boolean;
    /** Icon width and height in px (or CSS unit) */
    size?: number | string;
    /** SVG stroke width */
    strokeWidth?: number | string;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    isLiked = false,
    size = 20,
    strokeWidth = 2,
    class: className = ''
  }: Props = $props();

  // Exact canonical 6-segment Cubic-Bezier Heart outline matching rest geometry
  const HEART_PATH =
    'M 12.00 7.64 ' +
    'C 14.55 5.09, 17.78 4.42, 19.68 6.32 ' +
    'C 21.44 8.08, 21.44 10.92, 19.68 12.68 ' +
    'C 17.14 15.22, 14.46 17.90, 12.00 20.36 ' +
    'C 9.54 17.90, 6.86 15.22, 4.32 12.68 ' +
    'C 2.56 10.92, 2.56 8.08, 4.32 6.32 ' +
    'C 6.22 4.42, 9.45 5.09, 12.00 7.64 Z';

  let strokeSvg = $state<SVGSVGElement | null>(null);
  let fillSvg = $state<SVGSVGElement | null>(null);
  let haloEl = $state<HTMLSpanElement | null>(null);

  const activeAnims: Animation[] = [];
  let initialized = false;
  let prevLiked: boolean | null = null;

  function applyRestingState(liked: boolean) {
    cancelAnimations(activeAnims);
    if (strokeSvg) {
      strokeSvg.style.transform = 'scale(1) rotate(0deg)';
    }
    if (fillSvg) {
      fillSvg.style.opacity = liked ? '1' : '0';
      fillSvg.style.transform = liked ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(0, 3px, 0) scale(0.2)';
    }
    if (haloEl) {
      haloEl.style.opacity = '0';
      haloEl.style.transform = 'scale(0.5)';
    }
  }

  function triggerAnimation(targetLiked: boolean) {
    cancelAnimations(activeAnims);

    if (targetLiked) {
      // Contour: quick inward gather -> systolic "LUB" bloom -> elastic catch -> "DUB" settle
      runGpuAnim(
        activeAnims,
        strokeSvg,
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(0.76) rotate(-5deg)', offset: 0.16 },
          { transform: 'scale(1.24) rotate(3.5deg)', offset: 0.44 },
          { transform: 'scale(0.93) rotate(-1.5deg)', offset: 0.68 },
          { transform: 'scale(1.06) rotate(0.5deg)', offset: 0.85 },
          { transform: 'scale(1) rotate(0deg)' }
        ],
        { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (strokeSvg) strokeSvg.style.transform = 'scale(1) rotate(0deg)';
        }
      );

      // Liquid Core Fill: rises upward from apex tip with buoyant spring overshoot
      runGpuAnim(
        activeAnims,
        fillSvg,
        [
          { opacity: 0, transform: 'translate3d(0, 3px, 0) scale(0.18)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1.22) rotate(3deg)', offset: 0.44 },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(0.93) rotate(-1.5deg)', offset: 0.68 },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1.05)', offset: 0.85 },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)' }
        ],
        { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (fillSvg) {
            fillSvg.style.opacity = '1';
            fillSvg.style.transform = 'translate3d(0, 0, 0) scale(1)';
          }
        }
      );

      // Crisp GPU Accent Halo Ripple
      runGpuAnim(
        activeAnims,
        haloEl,
        [
          { opacity: 0.45, transform: 'scale(0.45)' },
          { opacity: 0, transform: 'scale(1.55)' }
        ],
        { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        () => {
          if (haloEl) {
            haloEl.style.opacity = '0';
            haloEl.style.transform = 'scale(0.5)';
          }
        }
      );
    } else {
      // Unlike: gentle elastic exhale + apex drain
      runGpuAnim(
        activeAnims,
        strokeSvg,
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(0.84) rotate(-3deg)', offset: 0.32 },
          { transform: 'scale(1.05) rotate(1deg)', offset: 0.68 },
          { transform: 'scale(1) rotate(0deg)' }
        ],
        { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (strokeSvg) strokeSvg.style.transform = 'scale(1) rotate(0deg)';
        }
      );

      runGpuAnim(
        activeAnims,
        fillSvg,
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 0, transform: 'translate3d(0, 3.5px, 0) scale(0.22)' }
        ],
        { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
        () => {
          if (fillSvg) {
            fillSvg.style.opacity = '0';
            fillSvg.style.transform = 'translate3d(0, 3px, 0) scale(0.2)';
          }
        }
      );
    }
  }

  onMount(() => {
    initialized = true;
    prevLiked = isLiked;
    applyRestingState(isLiked);
  });

  $effect(() => {
    const nowLiked = isLiked;
    if (!initialized) return;

    if (prevLiked === null) {
      prevLiked = nowLiked;
      applyRestingState(nowLiked);
    } else if (prevLiked !== nowLiked) {
      prevLiked = nowLiked;
      triggerAnimation(nowLiked);
    }
  });

  onDestroy(() => {
    cancelAnimations(activeAnims);
  });
</script>

<div
  class="heart-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isLiked ? 'Unlike' : 'Like'}
>
  <span bind:this={haloEl} class="heart-halo pointer-events-none" aria-hidden="true"></span>

  <!-- Liquid Fill Layer (Origin anchored near lower apex so fill surges upward) -->
  <svg
    bind:this={fillSvg}
    viewBox="0 0 24 24"
    fill="currentColor"
    class="heart-layer heart-fill-svg absolute inset-0 z-10 w-full h-full overflow-visible"
  >
    <path d={HEART_PATH} />
  </svg>

  <!-- Crisp Static Vector Heart Contour Layer -->
  <svg
    bind:this={strokeSvg}
    viewBox="0 0 24 24"
    fill="none"
    class="heart-layer heart-stroke-svg relative z-10 w-full h-full overflow-visible"
  >
    <path
      d={HEART_PATH}
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</div>

<style>
  .heart-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .heart-layer {
    will-change: transform, opacity;
    pointer-events: none;
  }

  .heart-stroke-svg {
    transform-origin: 50% 54%;
  }

  .heart-fill-svg {
    transform-origin: 50% 80%;
  }

  .heart-halo {
    position: absolute;
    inset: -2px;
    border-radius: 9999px;
    border: 1.5px solid currentColor;
    opacity: 0;
    will-change: transform, opacity;
  }
</style>
