<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

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

  // ---------------------------------------------------------------------------
  // DOWNLOAD & SAVED VECTOR GEOMETRY
  // Tray:    M 4 16 v 1 a 3 3 0 0 0 3 3 h 10 a 3 3 0 0 0 3 -3 v -1
  // Arrow:   Shaft M 12 4 v 12  +  Chevron M 8 12 l 4 4 l 4 -4
  // Saved:   Checkmark M 5.5 12.5 L 10 16.5 L 18.5 7.5
  // ---------------------------------------------------------------------------

  const TRAY_PATH =
    'M 4 16 v 1 a 3 3 0 0 0 3 3 h 10 a 3 3 0 0 0 3 -3 v -1';

  // Checkmark 3 points: [Start, Elbow, Tip]
  // In Saved mode: (5.5, 12.5) -> (10.0, 16.5) -> (18.5, 7.5)
  // In Arrow mode: (8.0, 12.0) -> (12.0, 16.0) -> (16.0, 12.0)
  const CHEVRON_ARROW = [8.0, 12.0,  12.0, 16.0,  16.0, 12.0];
  const CHEVRON_CHECK = [5.5, 12.5,  10.0, 16.5,  18.5, 7.5];

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Reactive state
  let arrowProgress = $state<number>(0); // 0 = Arrow, 1 = Checkmark
  let arrowYOffset = $state<number>(0);
  let arrowOpacity = $state<number>(1);
  let shaftLength = $state<number>(12);
  let trayScale = $state<number>(1);
  let trayOpacity = $state<number>(1);
  let chevronD = $state<string>('');

  let rafId: number | null = null;
  let lastTime = 0;
  let animElapsed = 1;
  const MORPH_DURATION = 0.36; // seconds
  let downloadClock = 0;

  let prevSaved: boolean | null = null;
  let prevDownloading: boolean | null = null;

  function buildChevronPath(pts: number[]): string {
    return `M ${pts[0].toFixed(2)} ${pts[1].toFixed(2)} L ${pts[2].toFixed(2)} ${pts[3].toFixed(2)} L ${pts[4].toFixed(2)} ${pts[5].toFixed(2)}`;
  }

  function step(now: number) {
    const dt = lastTime ? Math.min(0.064, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;

    // 1. Downloading Continuous Wave Stream
    if (isDownloading) {
      downloadClock += dt;
      // Conveyor downward loop (0 -> 1)
      const u = (downloadClock * 1.8) % 1;
      const wave = Math.sin(u * Math.PI);

      arrowYOffset = lerp(-6, 4, u);
      arrowOpacity = clamp(Math.sin(u * Math.PI) * 1.2, 0, 1);
      shaftLength = 11;
      trayScale = 1 + 0.08 * Math.sin(downloadClock * 7);
      arrowProgress = 0;

      chevronD = buildChevronPath(CHEVRON_ARROW);
      rafId = requestAnimationFrame(step);
      return;
    }

    // 2. Morph between Arrow and Saved Checkmark
    if (animElapsed < MORPH_DURATION) {
      animElapsed = Math.min(MORPH_DURATION, animElapsed + dt);
      const t = clamp(animElapsed / MORPH_DURATION, 0, 1);

      // Silky quintic deceleration
      const ease = 1 - Math.pow(1 - t, 4);
      arrowProgress = isSaved ? ease : 1 - ease;

      const pts = [
        lerp(CHEVRON_ARROW[0], CHEVRON_CHECK[0], arrowProgress),
        lerp(CHEVRON_ARROW[1], CHEVRON_CHECK[1], arrowProgress),
        lerp(CHEVRON_ARROW[2], CHEVRON_CHECK[2], arrowProgress),
        lerp(CHEVRON_ARROW[3], CHEVRON_CHECK[3], arrowProgress),
        lerp(CHEVRON_ARROW[4], CHEVRON_CHECK[4], arrowProgress),
        lerp(CHEVRON_ARROW[5], CHEVRON_CHECK[5], arrowProgress)
      ];

      chevronD = buildChevronPath(pts);

      // Arrow shaft retracts into checkmark
      shaftLength = lerp(12, 0, arrowProgress);
      arrowOpacity = 1;
      arrowYOffset = isSaved ? lerp(0, -0.5, ease) : 0;

      // Tactile tray bounce on save completion
      trayScale = 1 + (isSaved ? 0.14 * Math.sin(t * Math.PI) : 0);
      trayOpacity = lerp(1, 0.4, arrowProgress);

      rafId = requestAnimationFrame(step);
    } else {
      arrowProgress = isSaved ? 1 : 0;
      chevronD = buildChevronPath(isSaved ? CHEVRON_CHECK : CHEVRON_ARROW);
      shaftLength = isSaved ? 0 : 12;
      arrowYOffset = isSaved ? -0.5 : 0;
      arrowOpacity = 1;
      trayScale = 1;
      trayOpacity = isSaved ? 0.4 : 1;
      rafId = null;
    }
  }

  function startAnimation() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    animElapsed = 0;
    lastTime = performance.now();
    rafId = requestAnimationFrame(step);
  }

  $effect(() => {
    const nowSaved = isSaved;
    const nowDownloading = isDownloading;

    if (prevSaved === null) {
      prevSaved = nowSaved;
      prevDownloading = nowDownloading;
      arrowProgress = nowSaved ? 1 : 0;
      chevronD = buildChevronPath(nowSaved ? CHEVRON_CHECK : CHEVRON_ARROW);
      shaftLength = nowSaved ? 0 : 12;
      trayOpacity = nowSaved ? 0.4 : 1;
      if (nowDownloading) {
        startAnimation();
      }
      return;
    }

    if (prevSaved !== nowSaved || prevDownloading !== nowDownloading) {
      prevSaved = nowSaved;
      prevDownloading = nowDownloading;
      startAnimation();
    }
  });

  onDestroy(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<div
  class="download-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isDownloading ? 'Downloading...' : isSaved ? 'Saved offline' : 'Download for offline playback'}
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="download-svg relative z-10 w-full h-full overflow-visible"
  >
    <!-- Tray / Receiver Base (Fades back when saved) -->
    <path
      d={TRAY_PATH}
      opacity={trayOpacity}
      class="download-tray"
      style="transform: scale({trayScale}); transform-origin: 12px 17px;"
    />

    <!-- Vertical Arrow Shaft (Dissolves when morphing to Checkmark) -->
    {#if shaftLength > 0.05}
      <line
        x1="12"
        y1={4 + arrowYOffset}
        x2="12"
        y2={4 + shaftLength + arrowYOffset}
        opacity={arrowOpacity}
        class="download-shaft"
      />
    {/if}

    <!-- Dynamic Chevron (Morphs from Arrow V-tip into Checkmark) -->
    <path
      d={chevronD}
      opacity={arrowOpacity}
      class="download-chevron"
      style="transform: translateY({arrowYOffset}px);"
    />
  </svg>
</div>

<style>
  /* -------------------------------------------------------------------------- */
  /* DOWNLOAD / SAVE ANIMATIONS & STYLING                                       */
  /* Edit this section freely to fine-tune your animations to perfection!       */
  /* -------------------------------------------------------------------------- */

  .download-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .download-svg {
    transform-origin: center center;
    will-change: transform;
  }

  .download-tray {
    transition: opacity 0.2s ease;
  }

  .download-shaft,
  .download-chevron {
    will-change: transform, opacity;
  }
</style>
