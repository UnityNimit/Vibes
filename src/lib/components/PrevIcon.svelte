<script lang="ts">
  import { onDestroy } from 'svelte';

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

  // ---------------------------------------------------------------------------
  // PREVIOUS TRACK GEOMETRY & KINETIC CHOREOGRAPHY
  // Bar: Rect centered at x = 7, width = 2, height = 12 (y: 6 to 18)
  // Triangle: Apex at (8.5, 12), Base at x = 17.5 (y: 6 to 18)
  // ---------------------------------------------------------------------------

  interface KineticState {
    triangleDx: number;
    triangleScaleX: number;
    triangleScaleY: number;
    barDx: number;
    barScaleY: number;
    opacity: number;
  }

  const REST_STATE: KineticState = {
    triangleDx: 0,
    triangleScaleX: 1,
    triangleScaleY: 1,
    barDx: 0,
    barScaleY: 1,
    opacity: 1
  };

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Kinetic impulse: Leftward strike against stopper bar with damped spring rebound
  function evalPrevImpulse(t: number): KineticState {
    if (t <= 0) return { ...REST_STATE };
    if (t >= 1) return { ...REST_STATE };

    // Strike phase (0 -> 0.22): Quick acceleration towards left bar
    // Rebound phase (0.22 -> 1.0): Spring damped oscillation back to rest
    const strike = Math.sin(clamp(t / 0.22, 0, 1) * (Math.PI / 2));
    const rebound = Math.exp(-t * 5.5) * Math.cos((t - 0.22) * Math.PI * 3.5);

    const triangleDx = t < 0.22 ? lerp(0, -2.4, strike) : -2.4 * rebound;
    const triangleScaleX = t < 0.22 ? lerp(1, 0.86, strike) : 1 - 0.14 * rebound;
    const triangleScaleY = t < 0.22 ? lerp(1, 1.10, strike) : 1 + 0.10 * rebound;

    // Bar receives impact compression
    const barImpact = t > 0.15 ? Math.exp(-(t - 0.15) * 7.0) * Math.sin((t - 0.15) * Math.PI * 4.0) : 0;
    const barDx = -0.9 * barImpact;
    const barScaleY = 1 + 0.12 * barImpact;

    return {
      triangleDx,
      triangleScaleX,
      triangleScaleY,
      barDx,
      barScaleY,
      opacity: 1
    };
  }

  // Reactive attributes
  let triangleTransform = $state('translate(0, 0)');
  let barTransform = $state('translate(0, 0)');

  let rafId: number | null = null;
  let animStartTime = 0;
  const DURATION = 420; // ms

  export function triggerPulse() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    animStartTime = performance.now();

    function tick(now: number) {
      const elapsed = now - animStartTime;
      const t = clamp(elapsed / DURATION, 0, 1);
      const pose = evalPrevImpulse(t);

      triangleTransform = `translate(${pose.triangleDx.toFixed(2)}px, 0px) scale(${pose.triangleScaleX.toFixed(3)}, ${pose.triangleScaleY.toFixed(3)})`;
      barTransform = `translate(${pose.barDx.toFixed(2)}px, 0px) scale(1, ${pose.barScaleY.toFixed(3)})`;

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        triangleTransform = 'translate(0px, 0px) scale(1, 1)';
        barTransform = 'translate(0px, 0px) scale(1, 1)';
        rafId = null;
      }
    }

    rafId = requestAnimationFrame(tick);
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
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="prev-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  onclick={() => triggerPulse()}
>
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    class="prev-svg relative z-10 w-full h-full overflow-visible"
  >
    <!-- Stopper Bar on the Left -->
    <rect
      x="6"
      y="6"
      width="2"
      height="12"
      rx="1"
      class="prev-bar"
      style="transform-origin: 7px 12px; transform: {barTransform};"
    />

    <!-- Backward / Left-Pointing Triangle -->
    <path
      d="M 17.5 6.38 A 1 1 0 0 0 15.9 5.58 L 8.9 11.2 A 1 1 0 0 0 8.9 12.8 L 15.9 18.42 A 1 1 0 0 0 17.5 17.62 Z"
      class="prev-triangle"
      style="transform-origin: 13px 12px; transform: {triangleTransform};"
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

  .prev-svg {
    transform-origin: center center;
  }

  .prev-bar,
  .prev-triangle {
    pointer-events: none;
    will-change: transform;
  }
</style>
