<script lang="ts">
  import { onDestroy } from 'svelte';

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

  // ---------------------------------------------------------------------------
  // BACK NAVIGATION CHEVRON GEOMETRY & KINETIC CHOREOGRAPHY
  // Left Rest: P0 (15, 5) -> Apex (8, 12) -> P2 (15, 19)
  // Down Rest: P0 (5, 9)  -> Apex (12, 16) -> P2 (19, 9)
  // ---------------------------------------------------------------------------

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Evaluates dynamic curved/straight chevron path with kinetic vertex pull and wing bow
  function buildPath(t: number, dir: 'left' | 'down'): string {
    // Impulse: 0 -> 0.25 (Pulls back in travel direction)
    //          0.25 -> 1.0 (Damped spring rebound back to rest)
    const pull = t < 0.25 ? Math.sin((t / 0.25) * (Math.PI / 2)) : Math.exp(-t * 6) * Math.cos((t - 0.25) * Math.PI * 3.8);
    const apexOffset = -2.8 * pull; // Pulls backward (left or up)
    const wingBow = 1.2 * pull;

    if (dir === 'left') {
      const x0 = 15;
      const y0 = 5;
      const xApex = 8 + apexOffset;
      const yApex = 12;
      const x1 = 15;
      const y1 = 19;

      if (Math.abs(pull) < 0.01) {
        return `M ${x0} ${y0} L ${xApex.toFixed(2)} ${yApex} L ${x1} ${y1}`;
      }

      // Bowing wings with quadratic curves
      const c0x = lerp(x0, xApex, 0.5) + wingBow * 0.4;
      const c0y = lerp(y0, yApex, 0.5) - wingBow * 0.3;
      const c1x = lerp(xApex, x1, 0.5) + wingBow * 0.4;
      const c1y = lerp(yApex, y1, 0.5) + wingBow * 0.3;

      return `M ${x0} ${y0} Q ${c0x.toFixed(2)} ${c0y.toFixed(2)} ${xApex.toFixed(2)} ${yApex} Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${x1} ${y1}`;
    } else {
      // Down direction
      const x0 = 5;
      const y0 = 9;
      const xApex = 12;
      const yApex = 16 - apexOffset; // Pulls downward
      const x1 = 19;
      const y1 = 9;

      if (Math.abs(pull) < 0.01) {
        return `M ${x0} ${y0} L ${xApex} ${yApex.toFixed(2)} L ${x1} ${y1}`;
      }

      const c0x = lerp(x0, xApex, 0.5) - wingBow * 0.3;
      const c0y = lerp(y0, yApex, 0.5) - wingBow * 0.4;
      const c1x = lerp(xApex, x1, 0.5) + wingBow * 0.3;
      const c1y = lerp(yApex, y1, 0.5) - wingBow * 0.4;

      return `M ${x0} ${y0} Q ${c0x.toFixed(2)} ${c0y.toFixed(2)} ${xApex} ${yApex.toFixed(2)} Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${x1} ${y1}`;
    }
  }

  let animT = $state<number>(0);
  let currentD = $derived(buildPath(animT, direction));
  let rafId: number | null = null;
  let animStartTime = 0;
  const DURATION = 380; // ms

  export function triggerPulse() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    animStartTime = performance.now();

    function tick(now: number) {
      const elapsed = now - animStartTime;
      const t = clamp(elapsed / DURATION, 0, 1);
      animT = t;

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        animT = 0;
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
  class="back-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  onclick={() => triggerPulse()}
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="back-svg relative z-10 w-full h-full overflow-visible"
  >
    <path d={currentD} class="back-path" />
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
  }

  .back-path {
    pointer-events: none;
    will-change: d;
  }
</style>
