<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

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

  // ---------------------------------------------------------------------------
  // COLLINEAR VERTICAL-CLEAVE TOPOLOGY
  // Each bar has 4 corners [TL, TR, BR, BL] = 8 anchor floats, rendered with
  // 4 Cubic Bezier edges so edges can bow with liquid surface tension in flight.
  //
  // Play Triangle Outer Envelope:
  //   Top-Left: (7.2, 5.4), Bottom-Left: (7.2, 18.6), Nose: (18.8, 12.0)
  //   Slope: yTop(x) = 5.4 + 6.6 * ((x - 7.2) / 11.6)
  //          yBot(x) = 18.6 - 6.6 * ((x - 7.2) / 11.6)
  // ---------------------------------------------------------------------------

  // Bar A: Left Trapezoid of Play (x: 7.2 -> 13.23, s = 0.52) <-> Left Pause Bar (x: 6.8 -> 9.8)
  const BAR_A_PLAY  = [7.20, 5.40,  13.23, 8.83,  13.23, 15.17,  7.20, 18.60];
  const BAR_A_PAUSE = [6.80, 5.40,   9.80, 5.40,   9.80, 18.60,  6.80, 18.60];

  // Bar B: Right Nose of Play (x: 12.30 -> 18.80, s = 0.44..1.0) <-> Right Pause Bar (x: 14.2 -> 17.2)
  const BAR_B_PLAY  = [12.30, 8.30,  18.80, 12.00,  18.80, 12.00,  12.30, 15.70];
  const BAR_B_PAUSE = [14.20, 5.40,  17.20,  5.40,  17.20, 18.60,  14.20, 18.60];

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

  // Converts 4 corner anchors [x0,y0, x1,y1, x2,y2, x3,y3] + edge bowing parameters
  // into a 26-float closed 4-segment Cubic Bezier path:
  //   topBowY: vertical bow of top edge (P0 -> P1)
  //   rightBowX: horizontal bow of right edge (P1 -> P2)
  //   botBowY: vertical bow of bottom edge (P2 -> P3)
  //   leftBowX: horizontal bow of left edge (P3 -> P0)
  function buildCurvedQuad(
    corners: number[],
    topBowY: number = 0,
    rightBowX: number = 0,
    botBowY: number = 0,
    leftBowX: number = 0
  ): string {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;

    // Segment 1: Top Edge (P0 -> P1)
    const c1x = lerp(x0, x1, 0.33);
    const c1y = lerp(y0, y1, 0.33) + topBowY;
    const c2x = lerp(x0, x1, 0.67);
    const c2y = lerp(y0, y1, 0.67) + topBowY;

    // Segment 2: Right Edge (P1 -> P2)
    const c3x = lerp(x1, x2, 0.33) + rightBowX;
    const c3y = lerp(y1, y2, 0.33);
    const c4x = lerp(x1, x2, 0.67) + rightBowX;
    const c4y = lerp(y1, y2, 0.67);

    // Segment 3: Bottom Edge (P2 -> P3)
    const c5x = lerp(x2, x3, 0.33);
    const c5y = lerp(y2, y3, 0.33) + botBowY;
    const c6x = lerp(x2, x3, 0.67);
    const c6y = lerp(y2, y3, 0.67) + botBowY;

    // Segment 4: Left Edge (P3 -> P0)
    const c7x = lerp(x3, x0, 0.33) + leftBowX;
    const c7y = lerp(y3, y0, 0.33);
    const c8x = lerp(x3, x0, 0.67) + leftBowX;
    const c8y = lerp(y3, y0, 0.67);

    return (
      `M ${x0.toFixed(2)} ${y0.toFixed(2)} ` +
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
      `C ${c3x.toFixed(2)} ${c3y.toFixed(2)}, ${c4x.toFixed(2)} ${c4y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `C ${c5x.toFixed(2)} ${c5y.toFixed(2)}, ${c6x.toFixed(2)} ${c6y.toFixed(2)}, ${x3.toFixed(2)} ${y3.toFixed(2)} ` +
      `C ${c7x.toFixed(2)} ${c7y.toFixed(2)}, ${c8x.toFixed(2)} ${c8y.toFixed(2)}, ${x0.toFixed(2)} ${y0.toFixed(2)} Z`
    );
  }

  // Evaluates the choreographed Play (p = 0) <-> Pause (p = 1) morph
  // direction: +1 when transitioning Play -> Pause, -1 when Pause -> Play
  function evalPlayPauseChoreo(p: number, direction: number) {
    const s = clamp(p, 0, 1);
    const wave = Math.sin(Math.PI * s);

    // Staggered phase curves:
    // When splitting to Pause (+1), the right nose detaches slightly ahead of the left bar's expansion.
    // When fusing to Play (-1), the right bar pinches into a sharp arrow tip early before slamming home.
    const sLeftX = direction >= 0 ? Math.pow(s, 0.85) : Math.pow(s, 1.15);
    const sLeftY = direction >= 0 ? Math.pow(s, 1.12) : Math.pow(s, 0.82);

    const sRightX = direction >= 0 ? Math.pow(s, 0.76) : Math.pow(s, 1.18);
    const sRightTipY = direction >= 0 ? Math.pow(s, 1.18) : Math.pow(s, 0.58);
    const sRightInnerY = direction >= 0 ? Math.pow(s, 0.92) : Math.pow(s, 0.95);

    const cornersA = [
      lerp(BAR_A_PLAY[0], BAR_A_PAUSE[0], sLeftX),
      lerp(BAR_A_PLAY[1], BAR_A_PAUSE[1], sLeftY),
      lerp(BAR_A_PLAY[2], BAR_A_PAUSE[2], sLeftX),
      lerp(BAR_A_PLAY[3], BAR_A_PAUSE[3], sLeftY),
      lerp(BAR_A_PLAY[4], BAR_A_PAUSE[4], sLeftX),
      lerp(BAR_A_PLAY[5], BAR_A_PAUSE[5], sLeftY),
      lerp(BAR_A_PLAY[6], BAR_A_PAUSE[6], sLeftX),
      lerp(BAR_A_PLAY[7], BAR_A_PAUSE[7], sLeftY)
    ];

    const cornersB = [
      lerp(BAR_B_PLAY[0], BAR_B_PAUSE[0], sRightX),
      lerp(BAR_B_PLAY[1], BAR_B_PAUSE[1], sRightInnerY),
      lerp(BAR_B_PLAY[2], BAR_B_PAUSE[2], sRightX) + 0.45 * wave * direction,
      lerp(BAR_B_PLAY[3], BAR_B_PAUSE[3], sRightTipY),
      lerp(BAR_B_PLAY[4], BAR_B_PAUSE[4], sRightX) + 0.45 * wave * direction,
      lerp(BAR_B_PLAY[5], BAR_B_PAUSE[5], sRightTipY),
      lerp(BAR_B_PLAY[6], BAR_B_PAUSE[6], sRightX),
      lerp(BAR_B_PLAY[7], BAR_B_PAUSE[7], sRightInnerY)
    ];

    // Viscous surface-tension bow on the inner facing edges (Bar A right edge & Bar B left edge)
    // plus subtle velocity arc on the outer edges
    const tension = Math.sin(Math.PI * Math.pow(s, 0.75)) * (1 - s * 0.25);
    const bowA_Right = 0.72 * tension;
    const bowA_Left = 0.22 * wave * -direction;

    const bowB_Left = -0.78 * tension;
    const bowB_Right = 0.52 * wave * direction;
    const slopeBow = 0.32 * tension;

    return {
      cornersA,
      cornersB,
      bowA: [-slopeBow * 0.4, bowA_Right, slopeBow * 0.4, bowA_Left] as const,
      bowB: [-slopeBow, bowB_Right, slopeBow, bowB_Left] as const
    };
  }

  // Evaluates the Twin Acoustic Capsule wave when `isLoading` is true
  function evalLoadingCapsules(clock: number) {
    const phaseA = clock * 6.2;
    const phaseB = phaseA - Math.PI * 0.65; // Quadrature phase offset

    const hA = 3.6 + 2.5 * (0.5 + 0.5 * Math.sin(phaseA)); // Half-height 3.6 .. 6.1
    const hB = 3.6 + 2.5 * (0.5 + 0.5 * Math.sin(phaseB));

    const swayA = 0.35 * Math.cos(phaseA);
    const swayB = 0.35 * Math.cos(phaseB);

    const cornersA = [
      7.6, 12 - hA,
      10.1, 12 - hA,
      10.1, 12 + hA,
      7.6, 12 + hA
    ];

    const cornersB = [
      13.9, 12 - hB,
      16.4, 12 - hB,
      16.4, 12 + hB,
      13.9, 12 + hB
    ];

    return {
      cornersA,
      cornersB,
      bowA: [0, swayA, 0, swayA] as const,
      bowB: [0, swayB, 0, swayB] as const
    };
  }

  // Reactive SVG state
  let pathA = $state<string>(buildCurvedQuad(BAR_A_PLAY));
  let pathB = $state<string>(buildCurvedQuad(BAR_B_PLAY));
  let transformStyle = $state<string>('translateX(0.75px) scale(1, 1) rotate(0deg)');

  let rafId: number | null = null;
  let lastTime = 0;

  // Continuous animation state variables
  let playPauseProgress = 0; // 0 = Play, 1 = Pause
  let animFromProgress = 0;
  let animTargetProgress = 0;
  let animElapsed = 1;
  let animDirection = 1;
  const ANIM_DURATION = 0.36; // seconds (360ms silky quintic morph)

  let loadBlend = 0; // 0 = normal Play/Pause, 1 = Twin-Capsule Buffering
  let loadClock = 0;

  let prevPlaying: boolean | null = null;
  let prevLoading: boolean | null = null;

  function step(now: number) {
    const dt = lastTime ? Math.min(0.064, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;

    // 1. Advance Play <-> Pause transition progress
    let tMorph = 1;
    if (animElapsed < ANIM_DURATION) {
      animElapsed = Math.min(ANIM_DURATION, animElapsed + dt);
      tMorph = clamp(animElapsed / ANIM_DURATION, 0, 1);

      // Expressive quintic-cubic blend with micro-overshoot poise
      const inv = 1 - tMorph;
      const ease = 1 - (0.32 * Math.pow(inv, 3) + 0.68 * Math.pow(inv, 5));
      playPauseProgress = lerp(animFromProgress, animTargetProgress, ease);
    } else {
      playPauseProgress = animTargetProgress;
    }

    // 2. Advance Loading blend & harmonic clock
    const targetLoad = isLoading ? 1 : 0;
    if (loadBlend !== targetLoad) {
      const loadSpeed = isLoading ? 3.6 : 3.2;
      loadBlend = clamp(loadBlend + (isLoading ? 1 : -1) * dt * loadSpeed, 0, 1);
    }
    if (loadBlend > 0.001) {
      loadClock += dt;
    }

    // 3. Evaluate Play/Pause geometry & Loading geometry, then blend seamlessly
    const baseState = evalPlayPauseChoreo(playPauseProgress, animDirection);
    const bLoad = smoothstep(0, 1, loadBlend);

    if (bLoad <= 0.0001) {
      pathA = buildCurvedQuad(
        baseState.cornersA,
        baseState.bowA[0],
        baseState.bowA[1],
        baseState.bowA[2],
        baseState.bowA[3]
      );
      pathB = buildCurvedQuad(
        baseState.cornersB,
        baseState.bowB[0],
        baseState.bowB[1],
        baseState.bowB[2],
        baseState.bowB[3]
      );
    } else {
      const loadState = evalLoadingCapsules(loadClock);
      const cA = new Array<number>(8);
      const cB = new Array<number>(8);
      for (let i = 0; i < 8; i++) {
        cA[i] = lerp(baseState.cornersA[i], loadState.cornersA[i], bLoad);
        cB[i] = lerp(baseState.cornersB[i], loadState.cornersB[i], bLoad);
      }
      pathA = buildCurvedQuad(
        cA,
        lerp(baseState.bowA[0], loadState.bowA[0], bLoad),
        lerp(baseState.bowA[1], loadState.bowA[1], bLoad),
        lerp(baseState.bowA[2], loadState.bowA[2], bLoad),
        lerp(baseState.bowA[3], loadState.bowA[3], bLoad)
      );
      pathB = buildCurvedQuad(
        cB,
        lerp(baseState.bowB[0], loadState.bowB[0], bLoad),
        lerp(baseState.bowB[1], loadState.bowB[1], bLoad),
        lerp(baseState.bowB[2], loadState.bowB[2], bLoad),
        lerp(baseState.bowB[3], loadState.bowB[3], bLoad)
      );
    }

    // 4. Tactile vector kinematics (optical centering + directional squash/stretch impulse)
    const impulseEnv = tMorph < 1 ? Math.sin(tMorph * Math.PI) * (1 - tMorph * 0.35) : 0;

    // Optical center: Play triangle sits +0.75px right; Pause & Loading sit at 0px
    // When launching Play (animDirection = -1), add a subtle forward velocity kick
    const baseNudgeX = lerp(0.75, 0, playPauseProgress) * (1 - bLoad);
    const launchKickX = animDirection < 0 ? 0.55 * impulseEnv : -0.25 * impulseEnv;
    const tx = baseNudgeX + launchKickX * (1 - bLoad);

    // Squash & stretch: Play launch stretches horizontally; Pause cleave poises vertically
    const stretchX = 1 + (animDirection < 0 ? 0.065 : -0.055) * impulseEnv * (1 - bLoad);
    const stretchY = 1 + (animDirection < 0 ? -0.055 : 0.045) * impulseEnv * (1 - bLoad);

    // Subtle rotational poise (-2.2 deg flick on transition)
    const rot = -2.2 * animDirection * impulseEnv * (1 - bLoad);

    transformStyle = `translateX(${tx.toFixed(2)}px) scale(${stretchX.toFixed(3)}, ${stretchY.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;

    // Keep RAF running only while morphing or buffering
    if (tMorph < 1 || loadBlend > 0.0001 || isLoading) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = null;
    }
  }

  function ensureLoop() {
    if (rafId === null) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(step);
    }
  }

  $effect(() => {
    const nowPlaying = isPlaying;
    const nowLoading = isLoading;

    if (prevPlaying === null) {
      prevPlaying = nowPlaying;
      prevLoading = nowLoading;
      playPauseProgress = nowPlaying ? 1 : 0;
      animFromProgress = playPauseProgress;
      animTargetProgress = playPauseProgress;
      animElapsed = ANIM_DURATION;
      loadBlend = nowLoading ? 1 : 0;

      const init = evalPlayPauseChoreo(playPauseProgress, 1);
      pathA = buildCurvedQuad(init.cornersA);
      pathB = buildCurvedQuad(init.cornersB);
      transformStyle = `translateX(${nowPlaying || nowLoading ? '0.00' : '0.75'}px) scale(1, 1) rotate(0deg)`;

      if (nowLoading) {
        ensureLoop();
      }
      return;
    }

    if (prevPlaying !== nowPlaying) {
      prevPlaying = nowPlaying;
      animFromProgress = playPauseProgress;
      animTargetProgress = nowPlaying ? 1 : 0;
      animDirection = nowPlaying ? 1 : -1;
      animElapsed = 0;
      ensureLoop();
    }

    if (prevLoading !== nowLoading) {
      prevLoading = nowLoading;
      ensureLoop();
    }
  });

  onMount(() => {
    if (isLoading) {
      ensureLoop();
    }
  });

  onDestroy(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<div
  class="play-pause-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
>
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linejoin="round"
    stroke-linecap="round"
    class="play-pause-svg relative z-10 w-full h-full overflow-visible"
    style="transform: {transformStyle};"
  >
    <path d={pathA} />
    <path d={pathB} />
  </svg>
</div>

<style>
  .play-pause-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .play-pause-svg {
    transform-origin: center center;
    will-change: transform;
  }
</style>
