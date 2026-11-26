<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { cancelAnimations, runGpuAnim } from '../iconAnim';

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

  let playEl = $state<SVGSVGElement | null>(null);
  let barLeftEl = $state<SVGSVGElement | null>(null);
  let barRightEl = $state<SVGSVGElement | null>(null);
  let loadEl = $state<SVGSVGElement | null>(null);

  const activeAnims: Animation[] = [];
  let initialized = false;
  let prevPlaying: boolean | null = null;
  let prevLoading: boolean | null = null;

  function applyRestingState(playing: boolean, loading: boolean) {
    cancelAnimations(activeAnims);
    if (playEl) {
      playEl.style.opacity = !loading && !playing ? '1' : '0';
      playEl.style.transform = !loading && !playing ? 'translate3d(0.75px, 0, 0) scale(1)' : 'translate3d(0.75px, 0, 0) scale(0.7)';
    }
    const showPause = !loading && playing;
    if (barLeftEl) {
      barLeftEl.style.opacity = showPause ? '1' : '0';
      barLeftEl.style.transform = showPause ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(2px, 0, 0) scale(0.7)';
    }
    if (barRightEl) {
      barRightEl.style.opacity = showPause ? '1' : '0';
      barRightEl.style.transform = showPause ? 'translate3d(0, 0, 0) scale(1)' : 'translate3d(-2px, 0, 0) scale(0.7)';
    }
    if (loadEl) {
      loadEl.style.opacity = loading ? '1' : '0';
      loadEl.style.transform = loading ? 'scale(1)' : 'scale(0.8)';
    }
  }

  function animateTransition(nowPlaying: boolean, nowLoading: boolean, wasPlaying: boolean, wasLoading: boolean) {
    cancelAnimations(activeAnims);

    if (nowLoading) {
      // Crossfade active play/pause layers into buffering capsules
      if (!wasLoading) {
        if (wasPlaying) {
          runGpuAnim(activeAnims, barLeftEl, [
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
            { opacity: 0, transform: 'translate3d(0.5px,0,0) scale(0.78)' }
          ], { duration: 150, easing: 'ease-out' }, () => {
            if (barLeftEl) barLeftEl.style.opacity = '0';
          });
          runGpuAnim(activeAnims, barRightEl, [
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
            { opacity: 0, transform: 'translate3d(-0.5px,0,0) scale(0.78)' }
          ], { duration: 150, easing: 'ease-out' }, () => {
            if (barRightEl) barRightEl.style.opacity = '0';
          });
        } else {
          runGpuAnim(activeAnims, playEl, [
            { opacity: 1, transform: 'translate3d(0.75px,0,0) scale(1)' },
            { opacity: 0, transform: 'translate3d(0,0,0) scale(0.72)' }
          ], { duration: 150, easing: 'ease-out' }, () => {
            if (playEl) playEl.style.opacity = '0';
          });
        }
        runGpuAnim(activeAnims, loadEl, [
          { opacity: 0, transform: 'scale(0.78)' },
          { opacity: 1, transform: 'scale(1)' }
        ], { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }, () => {
          if (loadEl) {
            loadEl.style.opacity = '1';
            loadEl.style.transform = 'scale(1)';
          }
        });
      }
      return;
    }

    if (wasLoading) {
      // Emerge from buffering capsules into Play or Pause
      runGpuAnim(activeAnims, loadEl, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.8)' }
      ], { duration: 140, easing: 'ease-out' }, () => {
        if (loadEl) loadEl.style.opacity = '0';
      });
    }

    if (nowPlaying) {
      // Play (or Loading) -> Pause: play triangle cleaves inward, pause bars spring apart with overshoot
      if (!wasLoading) {
        runGpuAnim(activeAnims, playEl, [
          { opacity: 1, transform: 'translate3d(0.75px, 0, 0) scale(1) rotate(0deg)' },
          { opacity: 0.4, transform: 'translate3d(-0.5px, 0, 0) scale(0.55, 1.08) rotate(14deg)', offset: 0.55 },
          { opacity: 0, transform: 'translate3d(-1px, 0, 0) scale(0.35, 1.1) rotate(20deg)' }
        ], { duration: 165, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }, () => {
          if (playEl) {
            playEl.style.opacity = '0';
            playEl.style.transform = 'translate3d(0.75px, 0, 0) scale(0.7)';
          }
        });
      }

      runGpuAnim(activeAnims, barLeftEl, [
        { opacity: 0, transform: 'translate3d(2.8px, 0, 0) scale(0.7, 0.72)' },
        { opacity: 1, transform: 'translate3d(-0.7px, 0, 0) scale(0.92, 1.09)', offset: 0.52 },
        { opacity: 1, transform: 'translate3d(0.25px, 0, 0) scale(1.03, 0.97)', offset: 0.78 },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' }
      ], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, () => {
        if (barLeftEl) {
          barLeftEl.style.opacity = '1';
          barLeftEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
        }
      });

      runGpuAnim(activeAnims, barRightEl, [
        { opacity: 0, transform: 'translate3d(-2.8px, 0, 0) scale(0.7, 0.72)' },
        { opacity: 1, transform: 'translate3d(0.7px, 0, 0) scale(0.92, 1.09)', offset: 0.52 },
        { opacity: 1, transform: 'translate3d(-0.25px, 0, 0) scale(1.03, 0.97)', offset: 0.78 },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' }
      ], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, () => {
        if (barRightEl) {
          barRightEl.style.opacity = '1';
          barRightEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
        }
      });
    } else {
      // Pause (or Loading) -> Play: bars pinch inward into center, play triangle punches right with squash & bounce
      if (!wasLoading) {
        runGpuAnim(activeAnims, barLeftEl, [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' },
          { opacity: 0, transform: 'translate3d(2.6px, 0, 0) scale(0.65, 0.72)' }
        ], { duration: 155, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }, () => {
          if (barLeftEl) {
            barLeftEl.style.opacity = '0';
            barLeftEl.style.transform = 'translate3d(2px, 0, 0) scale(0.7)';
          }
        });

        runGpuAnim(activeAnims, barRightEl, [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1, 1)' },
          { opacity: 0, transform: 'translate3d(-2.6px, 0, 0) scale(0.65, 0.72)' }
        ], { duration: 155, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }, () => {
          if (barRightEl) {
            barRightEl.style.opacity = '0';
            barRightEl.style.transform = 'translate3d(-2px, 0, 0) scale(0.7)';
          }
        });
      }

      runGpuAnim(activeAnims, playEl, [
        { opacity: 0, transform: 'translate3d(-1.5px, 0, 0) scale(0.58) rotate(-14deg)' },
        { opacity: 1, transform: 'translate3d(1.6px, 0, 0) scale(1.11, 0.93) rotate(2deg)', offset: 0.54 },
        { opacity: 1, transform: 'translate3d(0.4px, 0, 0) scale(0.97, 1.03) rotate(-0.5deg)', offset: 0.8 },
        { opacity: 1, transform: 'translate3d(0.75px, 0, 0) scale(1, 1) rotate(0deg)' }
      ], { duration: 310, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, () => {
        if (playEl) {
          playEl.style.opacity = '1';
          playEl.style.transform = 'translate3d(0.75px, 0, 0) scale(1)';
        }
      });
    }
  }

  onMount(() => {
    initialized = true;
    prevPlaying = isPlaying;
    prevLoading = isLoading;
    applyRestingState(isPlaying, isLoading);
  });

  $effect(() => {
    const nowPlaying = isPlaying;
    const nowLoading = isLoading;

    if (!initialized) return;

    if (prevPlaying === null || prevLoading === null) {
      prevPlaying = nowPlaying;
      prevLoading = nowLoading;
      applyRestingState(nowPlaying, nowLoading);
      return;
    }

    if (prevPlaying !== nowPlaying || prevLoading !== nowLoading) {
      const wasP = prevPlaying;
      const wasL = prevLoading;
      prevPlaying = nowPlaying;
      prevLoading = nowLoading;
      animateTransition(nowPlaying, nowLoading, wasP, wasL);
    }
  });

  onDestroy(() => {
    cancelAnimations(activeAnims);
  });
</script>

<div
  class="play-pause-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
>
  <!-- 1. Play Triangle Layer -->
  <svg
    bind:this={playEl}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linejoin="round"
    stroke-linecap="round"
    class="gpu-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <path d="M 7.2 5.4 L 18.8 12.0 L 7.2 18.6 Z" />
  </svg>

  <!-- 2. Pause Left Bar Layer -->
  <svg
    bind:this={barLeftEl}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linejoin="round"
    stroke-linecap="round"
    class="gpu-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <path d="M 6.8 5.4 L 9.8 5.4 L 9.8 18.6 L 6.8 18.6 Z" />
  </svg>

  <!-- 3. Pause Right Bar Layer -->
  <svg
    bind:this={barRightEl}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linejoin="round"
    stroke-linecap="round"
    class="gpu-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <path d="M 14.2 5.4 L 17.2 5.4 L 17.2 18.6 L 14.2 18.6 Z" />
  </svg>

  <!-- 4. Pure GPU CSS Twin Capsule Buffering Layer -->
  <svg
    bind:this={loadEl}
    viewBox="0 0 24 24"
    fill="currentColor"
    class="gpu-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <rect x="7.4" y="6.2" width="2.8" height="11.6" rx="1.4" class="capsule-bar capsule-a" />
    <rect x="13.8" y="6.2" width="2.8" height="11.6" rx="1.4" class="capsule-bar capsule-b" />
  </svg>
</div>

<style>
  .play-pause-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .gpu-layer {
    transform-origin: center center;
    will-change: transform, opacity;
    pointer-events: none;
  }

  .capsule-bar {
    transform-origin: center 12px;
    will-change: transform;
  }

  .capsule-a {
    animation: capsule-wave 0.9s ease-in-out infinite;
  }

  .capsule-b {
    animation: capsule-wave 0.9s ease-in-out infinite -0.32s;
  }

  @keyframes capsule-wave {
    0%, 100% {
      transform: scaleY(0.58) translateZ(0);
    }
    50% {
      transform: scaleY(1.06) translateZ(0);
    }
  }
</style>
