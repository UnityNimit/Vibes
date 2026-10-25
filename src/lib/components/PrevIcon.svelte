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
  // PREVIOUS TRACK CUBIC-BEZIER GEOMETRY & BOW-SPRING KINEMATICS
  // Stopper Bar (Left): Cubic-Bezier spine at x = 6.80, y: 6.80 -> 17.20
  // Triangle (Right -> Left): Nose (9.35, 12.00), Top-Rear (16.60, 6.60), Bot-Rear (16.60, 17.40)
  // ---------------------------------------------------------------------------

  interface PrevPose {
    // Triangle vertices & edge bowing
    noseX: number;
    rearX: number;
    wingHalfH: number; // Half-height of rear vertical base (rest = 5.40 -> y: 6.60..17.40)
    rearBowX: number;  // Horizontal bow of rear vertical edge (P1 -> P2)
    slopeBow: number;  // Outward (+) or inward (-) bow of top/bottom slopes
    // Stopper Bar spine
    barEndX: number;   // X of top/bottom bar tips (rest = 6.80)
    barMidX: number;   // X of bar center control points (bends left on impact)
    barHalfH: number;  // Half-height of bar spine (conserves arc length when bent)
  }

  const REST_POSE: PrevPose = {
    noseX: 9.35,
    rearX: 16.60,
    wingHalfH: 5.40,
    rearBowX: 0,
    slopeBow: 0,
    barEndX: 6.80,
    barMidX: 6.80,
    barHalfH: 5.20
  };

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // Builds the 3-segment closed Cubic-Bezier path for the Left-Pointing Triangle
  function buildTrianglePath(p: PrevPose): string {
    const x0 = p.noseX;
    const y0 = 12.0;

    const x1 = p.rearX;
    const y1 = 12.0 - p.wingHalfH;

    const x2 = p.rearX;
    const y2 = 12.0 + p.wingHalfH;

    // Outward normal for top slope (P0 -> P1) is (-0.6, -0.8); bottom slope (P2 -> P0) is (-0.6, +0.8)
    const nx = -0.6 * p.slopeBow;
    const ny = 0.8 * p.slopeBow;

    // Seg 1: Nose (P0) -> Top-Rear (P1)
    const c1x = lerp(x0, x1, 0.34) + nx;
    const c1y = lerp(y0, y1, 0.34) - ny;
    const c2x = lerp(x0, x1, 0.68) + nx * 0.8;
    const c2y = lerp(y0, y1, 0.68) - ny * 0.8;

    // Seg 2: Top-Rear (P1) -> Bot-Rear (P2) [Rear Base]
    const c3x = x1 + p.rearBowX;
    const c3y = lerp(y1, y2, 0.33);
    const c4x = x2 + p.rearBowX;
    const c4y = lerp(y1, y2, 0.67);

    // Seg 3: Bot-Rear (P2) -> Nose (P0)
    const c5x = lerp(x2, x0, 0.32) + nx * 0.8;
    const c5y = lerp(y2, y0, 0.32) + ny * 0.8;
    const c6x = lerp(x2, x0, 0.66) + nx;
    const c6y = lerp(y2, y0, 0.66) + ny;

    return (
      `M ${x0.toFixed(2)} ${y0.toFixed(2)} ` +
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
      `C ${c3x.toFixed(2)} ${c3y.toFixed(2)}, ${c4x.toFixed(2)} ${c4y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `C ${c5x.toFixed(2)} ${c5y.toFixed(2)}, ${c6x.toFixed(2)} ${c6y.toFixed(2)}, ${x0.toFixed(2)} ${y0.toFixed(2)} Z`
    );
  }

  // Builds the Cubic-Bezier spine for the Left Stopper Bar
  function buildBarPath(p: PrevPose): string {
    const yTop = 12.0 - p.barHalfH;
    const yBot = 12.0 + p.barHalfH;
    const yC1 = lerp(yTop, yBot, 0.33);
    const yC2 = lerp(yTop, yBot, 0.67);

    return (
      `M ${p.barEndX.toFixed(2)} ${yTop.toFixed(2)} ` +
      `C ${p.barMidX.toFixed(2)} ${yC1.toFixed(2)}, ${p.barMidX.toFixed(2)} ${yC2.toFixed(2)}, ${p.barEndX.toFixed(2)} ${yBot.toFixed(2)}`
    );
  }

  // Evaluates the full Bow-Spring Strike & Rebound choreography for t in [0, 1]
  function evalPrevChoreo(t: number): PrevPose {
    if (t <= 0.0001 || t >= 0.9999) return { ...REST_POSE };

    // 1. Anticipation coil (t: 0 -> 0.14): pulls slightly right (+0.95px) before firing left
    const coil = t < 0.15 ? Math.sin((t / 0.15) * Math.PI) : 0;

    // 2. High-velocity leftward strike (peaks around t = 0.29) + damped spring rebound
    const strikeEnv =
      t > 0.10
        ? Math.exp(-(t - 0.10) * 5.6) * Math.sin((t - 0.10) * Math.PI * 3.35)
        : 0;

    // 3. Localized impact compression wave when the nose hits the bar (peaks around t = 0.31)
    const impact = Math.exp(-Math.pow((t - 0.31) / 0.095, 2));

    // 4. Bar bow-string deflection & tuning-fork harmonic ring (starts at contact t = 0.21)
    const barRing =
      t > 0.21
        ? Math.exp(-(t - 0.21) * 6.4) * Math.sin((t - 0.21) * Math.PI * 4.2)
        : 0;

    // Nose leads the launch leftward, then squashes against the bar on impact
    const noseX =
      REST_POSE.noseX +
      0.95 * coil -
      2.35 * strikeEnv +
      0.48 * impact;

    // Rear base trails slightly during launch (aerodynamic stretch), then whips forward on impact
    const rearLag =
      t > 0.12
        ? Math.exp(-(t - 0.12) * 5.4) * Math.sin((t - 0.12) * Math.PI * 3.25)
        : 0;
    const rearX =
      REST_POSE.rearX +
      0.75 * coil -
      1.65 * rearLag -
      0.85 * impact;

    // Wing height narrows during high-speed flight, flares vertically upon impact squash
    const wingHalfH =
      REST_POSE.wingHalfH +
      0.22 * coil -
      0.38 * Math.max(0, strikeEnv) +
      0.88 * impact;

    // Rear edge bows inward (leftward) into a swept chevron during flight, bows outward on impact
    const rearBowX =
      -0.45 * coil -
      1.15 * Math.max(0, strikeEnv * (1 - impact)) +
      0.95 * impact;

    // Slopes streamline inward during launch, bulge outward when absorbing impact
    const slopeBow =
      -0.38 * Math.max(0, strikeEnv * (1 - impact)) +
      0.92 * impact;

    // Stopper Bar: center bends sharply left (-2.35px) while tips follow less (-0.55px), forming a taut C-bow
    const barEndX = REST_POSE.barEndX + 0.18 * coil - 0.58 * barRing;
    const barMidX = REST_POSE.barMidX + 0.25 * coil - 2.35 * barRing;
    // Slight vertical foreshortening as the bar bends so arc length stays constant
    const bendMag = Math.abs(barMidX - barEndX);
    const barHalfH = REST_POSE.barHalfH - 0.16 * bendMag;

    return {
      noseX,
      rearX,
      wingHalfH,
      rearBowX,
      slopeBow,
      barEndX,
      barMidX,
      barHalfH
    };
  }

  function applyResidual(choreo: PrevPose, snap: PrevPose, r: number): PrevPose {
    if (r <= 0.0001) return choreo;
    return {
      noseX: choreo.noseX + (snap.noseX - REST_POSE.noseX) * r,
      rearX: choreo.rearX + (snap.rearX - REST_POSE.rearX) * r,
      wingHalfH: choreo.wingHalfH + (snap.wingHalfH - REST_POSE.wingHalfH) * r,
      rearBowX: choreo.rearBowX + (snap.rearBowX - REST_POSE.rearBowX) * r,
      slopeBow: choreo.slopeBow + (snap.slopeBow - REST_POSE.slopeBow) * r,
      barEndX: choreo.barEndX + (snap.barEndX - REST_POSE.barEndX) * r,
      barMidX: choreo.barMidX + (snap.barMidX - REST_POSE.barMidX) * r,
      barHalfH: choreo.barHalfH + (snap.barHalfH - REST_POSE.barHalfH) * r
    };
  }

  let currentPose: PrevPose = { ...REST_POSE };
  let triangleD = $state<string>(buildTrianglePath(REST_POSE));
  let barD = $state<string>(buildBarPath(REST_POSE));

  let rafId: number | null = null;
  let animStartTime = 0;
  const DURATION = 480; // ms

  export function triggerPulse() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    const startSnapshot: PrevPose = { ...currentPose };
    animStartTime = performance.now();

    function tick(now: number) {
      const elapsed = now - animStartTime;
      const t = clamp(elapsed / DURATION, 0, 1);

      const choreo = evalPrevChoreo(t);
      const residual = (1 - t) * (1 - t);
      currentPose = applyResidual(choreo, startSnapshot, residual);

      triangleD = buildTrianglePath(currentPose);
      barD = buildBarPath(currentPose);

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        currentPose = { ...REST_POSE };
        triangleD = buildTrianglePath(REST_POSE);
        barD = buildBarPath(REST_POSE);
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
  aria-label="Previous track"
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    class="prev-svg relative z-10 w-full h-full overflow-visible"
  >
    <!-- Elastic Bow-Spring Stopper Bar on the Left -->
    <path
      d={barD}
      stroke="currentColor"
      stroke-width="2.1"
      stroke-linecap="round"
      class="prev-bar"
    />

    <!-- Deformable Cubic-Bezier Left-Pointing Triangle -->
    <path
      d={triangleD}
      fill="currentColor"
      stroke="currentColor"
      stroke-width="2.0"
      stroke-linejoin="round"
      stroke-linecap="round"
      class="prev-triangle"
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
  }
</style>
