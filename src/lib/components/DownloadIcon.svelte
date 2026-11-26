<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { cancelAnimations, runGpuAnim } from '../iconAnim';

  interface Props {
    /** Whether download is actively in progress */
    isDownloading?: boolean;
    /** Whether track is saved offline (true = saved checkmark, false = download arrow) */
    isSaved?: boolean;
    /** Icon width and height in px (or CSS unit) */
    size?: number | string;
    /** SVG stroke width */
    strokeWidth?: number | string;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    isDownloading = false,
    isSaved = false,
    size = 20,
    strokeWidth = 2,
    class: className = ''
  }: Props = $props();

  let trayEl = $state<SVGSVGElement | null>(null);
  let arrowEl = $state<SVGSVGElement | null>(null);
  let checkEl = $state<SVGSVGElement | null>(null);

  const activeAnims: Animation[] = [];
  let initialized = false;
  let prevSaved: boolean | null = null;
  let prevDownloading: boolean | null = null;

  function applyRestingState(saved: boolean, downloading: boolean) {
    cancelAnimations(activeAnims);
    if (trayEl) {
      trayEl.style.opacity = !downloading && saved ? '0.42' : '1';
      trayEl.style.transform = !downloading && saved ? 'translate3d(0, 1.1px, 0) scale(1)' : 'translate3d(0, 0, 0) scale(1)';
    }
    if (arrowEl) {
      arrowEl.style.opacity = downloading || !saved ? '1' : '0';
      arrowEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
    }
    if (checkEl) {
      checkEl.style.opacity = !downloading && saved ? '1' : '0';
      checkEl.style.transform = !downloading && saved ? 'scale(1)' : 'scale(0.55)';
    }
  }

  function animateSavedChange(nowSaved: boolean) {
    cancelAnimations(activeAnims);

    if (nowSaved) {
      // Arrow plunges into tray -> tray cushions bounce -> checkmark whips open
      runGpuAnim(
        activeAnims,
        arrowEl,
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 0, transform: 'translate3d(0, 4.5px, 0) scale(0.72)' }
        ],
        { duration: 150, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
        () => {
          if (arrowEl) {
            arrowEl.style.opacity = '0';
            arrowEl.style.transform = 'translate3d(0, 0, 0) scale(0.75)';
          }
        }
      );

      runGpuAnim(
        activeAnims,
        trayEl,
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 1, transform: 'translate3d(0, 1.8px, 0) scale(1.06, 0.92)', offset: 0.36 },
          { opacity: 0.42, transform: 'translate3d(0, 1.1px, 0) scale(1)' }
        ],
        { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (trayEl) {
            trayEl.style.opacity = '0.42';
            trayEl.style.transform = 'translate3d(0, 1.1px, 0) scale(1)';
          }
        }
      );

      runGpuAnim(
        activeAnims,
        checkEl,
        [
          { opacity: 0, transform: 'translate3d(0, 2px, 0) scale(0.48) rotate(-10deg)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1.16) rotate(3deg)', offset: 0.58 },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(0.95)', offset: 0.8 },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)' }
        ],
        { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (checkEl) {
            checkEl.style.opacity = '1';
            checkEl.style.transform = 'scale(1)';
          }
        }
      );
    } else {
      runGpuAnim(
        activeAnims,
        checkEl,
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.55) rotate(-8deg)' }
        ],
        { duration: 140, easing: 'ease-out' },
        () => {
          if (checkEl) {
            checkEl.style.opacity = '0';
            checkEl.style.transform = 'scale(0.55)';
          }
        }
      );

      runGpuAnim(
        activeAnims,
        trayEl,
        [
          { opacity: 0.42, transform: 'translate3d(0, 1.1px, 0)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0)' }
        ],
        { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (trayEl) {
            trayEl.style.opacity = '1';
            trayEl.style.transform = 'translate3d(0, 0, 0)';
          }
        }
      );

      runGpuAnim(
        activeAnims,
        arrowEl,
        [
          { opacity: 0, transform: 'translate3d(0, 2.5px, 0) scale(0.72)' },
          { opacity: 1, transform: 'translate3d(0, -0.5px, 0) scale(1.06)', offset: 0.65 },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
        ],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        () => {
          if (arrowEl) {
            arrowEl.style.opacity = '1';
            arrowEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
          }
        }
      );
    }
  }

  onMount(() => {
    initialized = true;
    prevSaved = isSaved;
    prevDownloading = isDownloading;
    applyRestingState(isSaved, isDownloading);
  });

  $effect(() => {
    const nowSaved = isSaved;
    const nowDownloading = isDownloading;
    if (!initialized) return;

    if (prevSaved === null || prevDownloading === null) {
      prevSaved = nowSaved;
      prevDownloading = nowDownloading;
      applyRestingState(nowSaved, nowDownloading);
      return;
    }

    if (nowDownloading !== prevDownloading) {
      prevDownloading = nowDownloading;
      prevSaved = nowSaved;
      if (nowDownloading) {
        applyRestingState(nowSaved, true);
      } else {
        animateSavedChange(nowSaved);
      }
      return;
    }

    if (!nowDownloading && nowSaved !== prevSaved) {
      prevSaved = nowSaved;
      animateSavedChange(nowSaved);
    }
  });

  onDestroy(() => {
    cancelAnimations(activeAnims);
  });
</script>

<div
  class="download-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isDownloading ? 'Downloading...' : isSaved ? 'Saved offline' : 'Download for offline playback'}
>
  <!-- Receiver Cradle Tray -->
  <svg
    bind:this={trayEl}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="dl-layer absolute inset-0 z-10 w-full h-full overflow-visible"
  >
    <path d="M 4 16 L 4 17 A 3 3 0 0 0 7 20 L 17 20 A 3 3 0 0 0 20 17 L 20 16" />
  </svg>

  <!-- Download Arrow (Pure GPU CSS loop while downloading) -->
  <svg
    bind:this={arrowEl}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="dl-layer absolute inset-0 z-10 w-full h-full overflow-visible {isDownloading ? 'dl-arrow-loop' : ''}"
  >
    <path d="M 12 4 L 12 16 M 8 12 L 12 16 L 16 12" />
  </svg>

  <!-- Saved Checkmark -->
  <svg
    bind:this={checkEl}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="dl-layer absolute inset-0 z-10 w-full h-full overflow-visible"
  >
    <path d="M 5.5 12.5 L 10.0 16.5 L 18.5 7.5" />
  </svg>
</div>

<style>
  .download-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .dl-layer {
    transform-origin: center center;
    will-change: transform, opacity;
    pointer-events: none;
  }

  .dl-arrow-loop {
    animation: dl-drop 0.85s cubic-bezier(0.35, 0, 0.25, 1) infinite;
  }

  @keyframes dl-drop {
    0% {
      opacity: 0;
      transform: translate3d(0, -4px, 0) scale(0.9);
    }
    30% {
      opacity: 1;
      transform: translate3d(0, -1px, 0) scale(1);
    }
    75% {
      opacity: 1;
      transform: translate3d(0, 2.5px, 0) scale(0.96);
    }
    100% {
      opacity: 0;
      transform: translate3d(0, 4px, 0) scale(0.85);
    }
  }
</style>
