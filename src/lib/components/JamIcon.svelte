<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    /** Whether the Jam is active/connected/hosting */
    active?: boolean;
    /** Icon width and height in px (or CSS unit) */
    size?: number | string;
    /** SVG stroke width */
    strokeWidth?: number | string;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    active = false,
    size = 20,
    strokeWidth = 2,
    class: className = ''
  }: Props = $props();

  interface RayState {
    d: string;
    opacity: number;
    strokeScale: number;
  }

  const TWO_PI = Math.PI * 2;
  const BASE_HALF_ANGLE = Math.PI * 0.25; // 45 deg canonical span

  // Note: 2.25 + 9.0 * (1/6, 3/6, 5/6) = (3.75, 6.75, 9.75) — exact match to the static icon radii
  const IDLE_SLOTS = [1 / 6, 3 / 6, 5 / 6] as const;

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

  // Generates a symmetric pair of left & right polar circular arcs centered at (12, 12)
  function buildSymmetricArcPair(radius: number, halfAngle: number): string {
    const r = Math.max(0.5, radius);
    const a = clamp(halfAngle, 0.08, Math.PI * 0.44);

    const dx = r * Math.cos(a);
    const dy = r * Math.sin(a);

    const xL = (12 - dx).toFixed(2);
    const xR = (12 + dx).toFixed(2);
    const yTop = (12 - dy).toFixed(2);
    const yBot = (12 + dy).toFixed(2);
    const rf = r.toFixed(2);

    // Left arc (bottom-left -> top-left, bowing left) + Right arc (top-right -> bottom-right, bowing right)
    return `M ${xL} ${yBot} A ${rf} ${rf} 0 0 1 ${xL} ${yTop} M ${xR} ${yTop} A ${rf} ${rf} 0 0 1 ${xR} ${yBot}`;
  }

  let baseStroke = $derived(Number(strokeWidth) || 2);

  // Reactive state for the 3 ray pairs + emitter core
  let rays = $state<[RayState, RayState, RayState]>([
    { d: buildSymmetricArcPair(3.75, BASE_HALF_ANGLE), opacity: 0.94, strokeScale: 1 },
    { d: buildSymmetricArcPair(6.75, BASE_HALF_ANGLE), opacity: 0.78, strokeScale: 1 },
    { d: buildSymmetricArcPair(9.75, BASE_HALF_ANGLE), opacity: 0.62, strokeScale: 1 }
  ]);
  let coreRadius = $state(1.35);
  let coreOpacity = $state(0.92);

  let rafId: number | null = null;
  let lastTime = 0;

  // Continuous phase & transition state
  let idleClock = 0;        // Slow harmonic clock for standby breathing
  let wavePhase = 0;        // Continuous conveyor phase (1.0 = full 3-ray period)
  let settleStartPhase = 0; // Phase snapshot when deactivating
  let settleTargetPhase = 0;// Nearest 1/3 lattice multiple for seamless docking
  let settleProgress = 1;   // 0 -> 1 quintic glide when settling back to idle
  let activeBlend = 0;      // 0 = pure idle, 1 = pure active broadcast
  let ignitionImpulse = 0;  // Brief radial gather/launch kick on activation
  let wasActive: boolean | null = null;

  // Evaluates a single ray slot k in pure IDLE state
  function evalIdleSlot(k: number, t: number) {
    const baseRadius = 2.25 + 9.0 * IDLE_SLOTS[k]; // 3.75, 6.75, 9.75
    const phase = t * 2.15 - k * 0.92;
    const wave = Math.sin(phase);
    const secondary = Math.cos(t * 1.1 - k * 0.6);

    // Subtle radial tide + tuning-fork angular tip flex
    const radius = baseRadius + 0.25 * wave + 0.06 * secondary;
    const halfAngle = BASE_HALF_ANGLE + (0.046 * wave - 0.015 * secondary);

    const baseOpacities = [0.92, 0.76, 0.58];
    const opacity = clamp(baseOpacities[k] + 0.12 * wave, 0.38, 1);
    const strokeScale = 1 + 0.035 * wave;

    return { radius, halfAngle, opacity, strokeScale };
  }

  // Evaluates a single ray at normalized conveyor position u in [0, 1) during ACTIVE broadcast
  function evalActiveWave(u: number, impulse: number) {
    // Non-linear acoustic dispersion: brisk emergence from core, poised glide through outer field
    const uDisp = 1 - Math.pow(1 - u, 1.24);
    const radius = lerp(2.05, 11.18, uDisp) - impulse * 0.45 * (1 - u);

    // Unfurl arc angle on birth (16 deg -> 48 deg), hold full span, gently taper near outer horizon
    const birthBloom = smoothstep(0.0, 0.24, u);
    const horizonTaper = 1 - 0.28 * smoothstep(0.72, 1.0, u);
    const halfAngle = lerp(0.28, BASE_HALF_ANGLE * 1.07, birthBloom) * horizonTaper;

    // Smooth plateau bell envelope: zero pop-in at birth (u=0) and zero pop-out at horizon (u=1)
    const fadeIn = smoothstep(0.0, 0.19, u);
    const fadeOut = 1 - smoothstep(0.74, 1.0, u);
    const opacity = clamp(fadeIn * fadeOut, 0, 1);

    // Energetic thicker stroke near emitter core, delicate taper outward
    const strokeScale = lerp(1.12, 0.82, uDisp);

    return { radius, halfAngle, opacity, strokeScale };
  }

  function step(now: number) {
    const dt = lastTime ? Math.min(0.064, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;

    idleClock += dt;

    // Smooth blend factor between Idle (0) and Active (1)
    const blendSpeed = active ? 3.4 : 2.3;
    activeBlend = clamp(activeBlend + (active ? 1 : -1) * dt * blendSpeed, 0, 1);

    // Decay activation impulse
    ignitionImpulse = Math.max(0, ignitionImpulse - dt * 3.8);
    const impulseWave = Math.sin(ignitionImpulse * Math.PI);

    if (active) {
      // Advance continuous radial wavefront (~0.52 full cycles/sec = 1.56 ray launches/sec)
      const speed = 0.52 + 0.28 * impulseWave;
      wavePhase = (wavePhase + dt * speed) % 1;
    } else if (settleProgress < 1) {
      // Glide traveling phase forward to the nearest 1/3 lattice alignment so rays dock into (3.75, 6.75, 9.75)
      settleProgress = Math.min(1, settleProgress + dt * 2.1);
      const easeOut = 1 - Math.pow(1 - settleProgress, 4);
      wavePhase = lerp(settleStartPhase, settleTargetPhase, easeOut) % 1;
    }

    const b = smoothstep(0, 1, activeBlend);

    for (let k = 0; k < 3; k++) {
      const idleState = evalIdleSlot(k, idleClock);

      // Traveling conveyor coordinate u in [0, 1)
      const u = (IDLE_SLOTS[k] + wavePhase) % 1;
      const activeState = evalActiveWave(u, impulseWave);

      const r = lerp(idleState.radius, activeState.radius, b);
      const a = lerp(idleState.halfAngle, activeState.halfAngle, b);
      const op = lerp(idleState.opacity, activeState.opacity, b);
      const sc = lerp(idleState.strokeScale, activeState.strokeScale, b);

      rays[k] = {
        d: buildSymmetricArcPair(r, a),
        opacity: Number(op.toFixed(3)),
        strokeScale: Number(sc.toFixed(3))
      };
    }

    // Center emitter core: calm harmonic breathing in idle, 3x synchronized launch heartbeat in active
    const idleCorePulse = 0.5 + 0.5 * Math.sin(idleClock * 2.15 + 0.7);
    const launchPulse = Math.pow(0.5 + 0.5 * Math.cos(wavePhase * 3 * TWO_PI), 2.2);

    const idleR = 1.28 + 0.12 * idleCorePulse;
    const activeR = 1.24 + 0.34 * launchPulse + 0.22 * impulseWave;

    coreRadius = Number(lerp(idleR, activeR, b).toFixed(3));
    coreOpacity = Number(lerp(0.84 + 0.14 * idleCorePulse, 0.88 + 0.12 * launchPulse, b).toFixed(3));

    rafId = requestAnimationFrame(step);
  }

  $effect(() => {
    const isNowActive = active;
    if (wasActive === null) {
      wasActive = isNowActive;
      activeBlend = isNowActive ? 1 : 0;
    } else if (wasActive !== isNowActive) {
      wasActive = isNowActive;
      if (isNowActive) {
        // Trigger subtle inward gather + outward launch impulse
        ignitionImpulse = 1;
        settleProgress = 1;
      } else {
        // Lock onto the next 1/3 lattice alignment so whichever ray is closest docks into its canonical slot
        settleStartPhase = wavePhase;
        const latticeStep = Math.ceil(wavePhase * 3 + 0.05) / 3;
        settleTargetPhase = latticeStep;
        settleProgress = 0;
      }
    }
  });

  onMount(() => {
    lastTime = performance.now();
    rafId = requestAnimationFrame(step);
  });

  onDestroy(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<div
  class="jam-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="jam-svg relative z-10 w-full h-full overflow-visible"
    aria-label={active ? 'Jam session active' : 'Start Jam session'}
  >
    <!-- Center Emitter Core -->
    <circle
      cx="12"
      cy="12"
      r={coreRadius}
      fill="currentColor"
      stroke="none"
      opacity={coreOpacity}
    />

    <!-- 3 Symmetric Polar Ray Pairs (Idle Harmonic Tide <-> Active Radial Wavefront) -->
    {#each rays as ray, i (i)}
      <path
        d={ray.d}
        opacity={ray.opacity}
        stroke-width={baseStroke * ray.strokeScale}
      />
    {/each}
  </svg>
</div>

<style>
  .jam-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .jam-svg {
    transform-origin: center center;
  }
</style>
