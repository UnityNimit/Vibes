<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { cancelAnimations, runGpuAnim } from '../iconAnim';

  export type RepeatMode = 'off' | 'one' | 'shuffle' | 'all';

  interface Props {
    mode: RepeatMode;
    class?: string;
    size?: number | string;
  }

  let { mode = 'off', class: className = '', size = 30 }: Props = $props();

  type ShapeKind = 'line' | 'circle' | 'infinity';

  // Exact canonical SVG geometry matching Vibes' Repeat / Shuffle ribbon topology
  const PATH_LINE = 'M 4.20 12.00 L 19.80 12.00';
  const PATH_CIRCLE =
    'M 12 5.80 ' +
    'C 8.58 5.80, 5.80 8.58, 5.80 12.00 ' +
    'C 5.80 15.42, 8.58 18.20, 12.00 18.20 ' +
    'C 15.42 18.20, 18.20 15.42, 18.20 12.00 ' +
    'C 18.20 8.58, 15.42 5.80, 12.00 5.80 Z';
  const PATH_INFINITY =
    'M 12.00 12.00 ' +
    'C 9.20 7.50, 4.20 7.50, 4.20 12.00 ' +
    'C 4.20 16.50, 9.20 16.50, 12.00 12.00 ' +
    'C 14.80 7.50, 19.80 7.50, 19.80 12.00 ' +
    'C 19.80 16.50, 14.80 16.50, 12.00 12.00 Z';

  let lineEl = $state<SVGSVGElement | null>(null);
  let circleEl = $state<SVGSVGElement | null>(null);
  let infinityEl = $state<SVGSVGElement | null>(null);

  const activeAnims: Animation[] = [];
  let initialized = false;
  let prevKind: ShapeKind | null = null;

  function getShapeKind(m: RepeatMode): ShapeKind {
    if (m === 'one') return 'circle';
    if (m === 'shuffle' || m === 'all') return 'infinity';
    return 'line';
  }

  function getLayer(kind: ShapeKind): SVGSVGElement | null {
    if (kind === 'circle') return circleEl;
    if (kind === 'infinity') return infinityEl;
    return lineEl;
  }

  function applyRestingState(kind: ShapeKind) {
    cancelAnimations(activeAnims);
    const layers: ShapeKind[] = ['line', 'circle', 'infinity'];
    for (const k of layers) {
      const el = getLayer(k);
      if (!el) continue;
      const active = k === kind;
      el.style.opacity = active ? '1' : '0';
      el.style.transform = active ? 'scale(1) rotate(0deg)' : 'scale(0.55) rotate(-25deg)';
    }
  }

  function animateTo(fromKind: ShapeKind, toKind: ShapeKind) {
    if (fromKind === toKind) {
      applyRestingState(toKind);
      return;
    }

    cancelAnimations(activeAnims);

    // Ensure the non-involved layer stays hidden cleanly
    const kinds: ShapeKind[] = ['line', 'circle', 'infinity'];
    for (const k of kinds) {
      if (k !== fromKind && k !== toKind) {
        const unused = getLayer(k);
        if (unused) {
          unused.style.opacity = '0';
          unused.style.transform = 'scale(0.55)';
        }
      }
    }

    const outEl = getLayer(fromKind);
    const inEl = getLayer(toKind);
    const spinDir = toKind === 'infinity' ? 1 : toKind === 'circle' ? 1 : -1;

    runGpuAnim(
      activeAnims,
      outEl,
      [
        { opacity: 1, transform: 'scale(1) rotate(0deg)' },
        { opacity: 0, transform: `scale(0.45, 0.72) rotate(${spinDir * 42}deg)` }
      ],
      { duration: 155, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
      () => {
        if (outEl) {
          outEl.style.opacity = '0';
          outEl.style.transform = 'scale(0.55)';
        }
      }
    );

    runGpuAnim(
      activeAnims,
      inEl,
      [
        { opacity: 0, transform: `scale(0.45) rotate(${-spinDir * 48}deg)` },
        { opacity: 1, transform: `scale(1.16) rotate(${spinDir * 6}deg)`, offset: 0.56 },
        { opacity: 1, transform: `scale(0.95) rotate(${-spinDir * 2}deg)`, offset: 0.8 },
        { opacity: 1, transform: 'scale(1) rotate(0deg)' }
      ],
      { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      () => {
        if (inEl) {
          inEl.style.opacity = '1';
          inEl.style.transform = 'scale(1) rotate(0deg)';
        }
      }
    );
  }

  onMount(() => {
    initialized = true;
    const initKind = getShapeKind(mode);
    prevKind = initKind;
    applyRestingState(initKind);
  });

  $effect(() => {
    const nextKind = getShapeKind(mode);
    if (!initialized) return;

    if (prevKind === null) {
      prevKind = nextKind;
      applyRestingState(nextKind);
    } else if (prevKind !== nextKind) {
      const from = prevKind;
      prevKind = nextKind;
      animateTo(from, nextKind);
    }
  });

  onDestroy(() => {
    cancelAnimations(activeAnims);
  });
</script>

<div
  class="repeat-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={`Playback mode: ${mode === 'shuffle' ? 'shuffle' : mode === 'one' ? 'repeat one' : mode === 'all' ? 'repeat all' : 'off'}`}
>
  <svg
    bind:this={lineEl}
    viewBox="0 0 24 24"
    fill="none"
    class="repeat-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <path d={PATH_LINE} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <svg
    bind:this={circleEl}
    viewBox="0 0 24 24"
    fill="none"
    class="repeat-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <path d={PATH_CIRCLE} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <svg
    bind:this={infinityEl}
    viewBox="0 0 24 24"
    fill="none"
    class="repeat-layer absolute inset-0 w-full h-full overflow-visible"
  >
    <path d={PATH_INFINITY} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</div>

<style>
  .repeat-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .repeat-layer {
    transform-origin: center center;
    will-change: transform, opacity;
    pointer-events: none;
  }
</style>
