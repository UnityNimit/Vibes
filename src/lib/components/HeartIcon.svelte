<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    /** Whether the item is liked / active (true = filled heart with pop animation, false = outline) */
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

  // ---------------------------------------------------------------------------
  // HEART GEOMETRY & ANIMATION LATTICE
  // Canonical 24x24 Heart Path:
  // M 4.318 6.318 a 4.5 4.5 0 0 0 0 6.364 L 12 20.364 l 7.682 -7.682
  // a 4.5 4.5 0 0 0 -6.364 -6.364 L 12 7.636 l -1.318 -1.318
  // a 4.5 4.5 0 0 0 -6.364 0 z
  // ---------------------------------------------------------------------------
  const HEART_PATH =
    'M 4.318 6.318 a 4.5 4.5 0 0 0 0 6.364 L 12 20.364 l 7.682 -7.682 a 4.5 4.5 0 0 0 -6.364 -6.364 L 12 7.636 l -1.318 -1.318 a 4.5 4.5 0 0 0 -6.364 0 z';

  // 6 Radial Sparkles emitted on like impulse [angle, distance]
  interface Sparkle {
    cx: number;
    cy: number;
    r: number;
    opacity: number;
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Reactive animation states
  let scaleX = $state<number>(1);
  let scaleY = $state<number>(1);
  let fillOpacity = $state<number>(0);
  let sparkles = $state<Sparkle[]>([]);

  let rafId: number | null = null;
  let lastTime = 0;
  let animElapsed = 1;
  const ANIM_DURATION = 0.44; // seconds (440ms spring-damped heartbeat pop)
  let prevLiked: boolean | null = null;

  // Damped harmonic spring curve (slight initial compression -> energetic overshoot -> settle)
  function evalSpringPop(t: number): { sx: number; sy: number } {
    if (t >= 1) return { sx: 1, sy: 1 };

    // Phase 1: Rapid pre-launch compression (0 -> 0.22)
    if (t < 0.22) {
      const p = t / 0.22;
      const ease = p * p;
      return {
        sx: lerp(1, 0.72, ease),
        sy: lerp(1, 0.76, ease)
      };
    }

    // Phase 2: Elastic overshoot expansion (0.22 -> 0.6)
    if (t < 0.6) {
      const p = (t - 0.22) / 0.38;
      const ease = 1 - Math.pow(1 - p, 3);
      return {
        sx: lerp(0.72, 1.24, ease),
        sy: lerp(0.76, 1.28, ease)
      };
    }

    // Phase 3: Damped settling oscillation (0.6 -> 1.0)
    const p = (t - 0.6) / 0.4;
    const decay = Math.exp(-p * 3.8);
    const oscillation = Math.sin(p * Math.PI * 2.5);
    const s = 1 + 0.16 * decay * oscillation;
    return { sx: s, sy: s };
  }

  // Evaluates 6 radial burst sparkles around the heart during like activation
  function evalSparkles(t: number): Sparkle[] {
    if (t <= 0.12 || t >= 0.95 || !isLiked) return [];

    const p = (t - 0.12) / 0.83;
    const dist = lerp(8, 17.5, Math.pow(p, 0.8));
    const opacity = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
    const radius = lerp(1.2, 0.3, p);

    const angles = [
      -Math.PI * 0.48, // Top-Left
      -Math.PI * 0.15, // Top
      Math.PI * 0.18,  // Top-Right
      Math.PI * 0.52,  // Right
      Math.PI * 0.88,  // Bottom
      -Math.PI * 0.82  // Left
    ];

    return angles.map((a) => ({
      cx: Number((12 + Math.cos(a) * dist).toFixed(2)),
      cy: Number((12 + Math.sin(a) * dist).toFixed(2)),
      r: Number(Math.max(0.2, radius).toFixed(2)),
      opacity: Number(clamp(opacity, 0, 1).toFixed(2))
    }));
  }

  function step(now: number) {
    const dt = lastTime ? Math.min(0.064, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;

    if (animElapsed < ANIM_DURATION) {
      animElapsed = Math.min(ANIM_DURATION, animElapsed + dt);
      const t = clamp(animElapsed / ANIM_DURATION, 0, 1);

      if (isLiked) {
        // Like burst: spring pop + sparkle explosion + instant solid fill
        const { sx, sy } = evalSpringPop(t);
        scaleX = Number(sx.toFixed(3));
        scaleY = Number(sy.toFixed(3));
        fillOpacity = clamp(t * 3.5, 0, 1);
        sparkles = evalSparkles(t);
      } else {
        // Unlike recoil: gentle deflate and stroke clearance
        const ease = 1 - Math.pow(1 - t, 3);
        const s = 1 - 0.18 * Math.sin(t * Math.PI);
        scaleX = Number(s.toFixed(3));
        scaleY = Number(s.toFixed(3));
        fillOpacity = clamp(1 - t * 3.0, 0, 1);
        sparkles = [];
      }

      rafId = requestAnimationFrame(step);
    } else {
      scaleX = 1;
      scaleY = 1;
      fillOpacity = isLiked ? 1 : 0;
      sparkles = [];
      rafId = null;
    }
  }

  function triggerAnimation() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    animElapsed = 0;
    lastTime = performance.now();
    rafId = requestAnimationFrame(step);
  }

  $effect(() => {
    const nowLiked = isLiked;
    if (prevLiked === null) {
      prevLiked = nowLiked;
      fillOpacity = nowLiked ? 1 : 0;
      scaleX = 1;
      scaleY = 1;
    } else if (prevLiked !== nowLiked) {
      prevLiked = nowLiked;
      triggerAnimation();
    }
  });

  onDestroy(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<div
  class="heart-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isLiked ? 'Unlike' : 'Like'}
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    class="heart-svg relative z-10 w-full h-full overflow-visible"
    style="transform: scale({scaleX}, {scaleY});"
  >
    <!-- Solid Fill Layer (Smooth opacity crossfade on toggle) -->
    <path
      d={HEART_PATH}
      fill="currentColor"
      opacity={fillOpacity}
      class="heart-fill"
    />

    <!-- Stroke Outline Layer (Always crisp and clean) -->
    <path
      d={HEART_PATH}
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class="heart-stroke"
    />

    <!-- Radial Burst Particle Sparkles -->
    {#each sparkles as s}
      <circle
        cx={s.cx}
        cy={s.cy}
        r={s.r}
        fill="currentColor"
        opacity={s.opacity}
        class="heart-sparkle"
      />
    {/each}
  </svg>
</div>

<style>
  /* -------------------------------------------------------------------------- */
  /* HEART / LIKE ANIMATIONS & STYLING                                          */
  /* Edit this section freely to fine-tune your animations to perfection!       */
  /* -------------------------------------------------------------------------- */

  .heart-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .heart-svg {
    transform-origin: center center;
    will-change: transform;
  }

  .heart-fill {
    transition: opacity 0.12s ease-out;
  }

  .heart-stroke {
    pointer-events: none;
  }

  .heart-sparkle {
    pointer-events: none;
    will-change: transform, opacity;
  }
</style>
