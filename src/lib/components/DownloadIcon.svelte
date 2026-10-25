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
  // UNIFIED VECTOR STATE SNAPSHOT
  // 1. Chevron / Checkmark: [x0, y0,  x1, y1,  x2, y2,  rightWingBow]
  //    - Arrow Rest:     (8.0, 12.0) -> (12.0, 16.0) -> (16.0, 12.0)
  //    - Checkmark Rest: (5.5, 12.5) -> (10.0, 16.5) -> (18.5,  7.5)
  // 2. Shaft: [xTop, yTop, xBot, yBot, opacity] (Bottom stays locked to elbow)
  // 3. Elastic Receiver Tray: [floorDipY, lipFlareX, lipLiftY, opacity]
  // ---------------------------------------------------------------------------

  interface VectorPose {
    chev: [number, number, number, number, number, number, number];
    shaft: [number, number, number, number, number];
    tray: [number, number, number, number];
  }

  const POSE_ARROW: VectorPose = {
    chev: [8.0, 12.0, 12.0, 16.0, 16.0, 12.0, 0],
    shaft: [12.0, 4.0, 12.0, 16.0, 1],
    tray: [0, 0, 0, 1]
  };

  const POSE_SAVED: VectorPose = {
    chev: [5.5, 12.5, 10.0, 16.5, 18.5, 7.5, 0],
    shaft: [10.0, 16.5, 10.0, 16.5, 0],
    tray: [0, 0.35, 1.15, 0.42]
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

  function clonePose(p: VectorPose): VectorPose {
    return {
      chev: [...p.chev],
      shaft: [...p.shaft],
      tray: [...p.tray]
    };
  }

  // Builds the 2-segment Cubic Bezier path for the Arrow Chevron / Saved Checkmark
  function buildChevronPath(c: VectorPose['chev']): string {
    const [x0, y0, x1, y1, x2, y2, bow] = c;

    if (Math.abs(bow) < 0.01) {
      return `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    }

    // Left wing (P0 -> P1) + Right wing (P1 -> P2) with perpendicular kinetic whip bow
    const c1x = lerp(x0, x1, 0.5);
    const c1y = lerp(y0, y1, 0.5) - bow * 0.35;

    const c2x = lerp(x1, x2, 0.36) - bow * 0.65;
    const c2y = lerp(y1, y2, 0.36) - bow * 0.85;
    const c3x = lerp(x1, x2, 0.72) - bow * 0.35;
    const c3y = lerp(y1, y2, 0.72) - bow * 0.55;

    return (
      `M ${x0.toFixed(2)} ${y0.toFixed(2)} ` +
      `Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
      `C ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${c3x.toFixed(2)} ${c3y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`
    );
  }

  // Builds the elastic receiver cradle (matches canonical M 4 16 v 1 a 3 3 0 0 0 3 3 h 10 a 3 3 0 0 0 3 -3 v -1 at rest)
  function buildTrayPath(t: VectorPose['tray']): string {
    const [floorDipY, lipFlareX, lipLiftY] = t;
    const k = 1.65685; // 3 * 0.5522847

    const xL = 4.0 - lipFlareX;
    const xR = 20.0 + lipFlareX;
    const yLip = 16.0 + lipLiftY;
    const yCorner = Math.max(yLip + 0.35, 17.0 + lipLiftY * 0.45 + floorDipY * 0.25);
    const yFloor = 20.0 + floorDipY * 0.35;
    const yFloorMid = yFloor + floorDipY * 0.85;

    return (
      `M ${xL.toFixed(2)} ${yLip.toFixed(2)} ` +
      `L ${xL.toFixed(2)} ${yCorner.toFixed(2)} ` +
      `C ${xL.toFixed(2)} ${(yCorner + k).toFixed(2)}, ${(7.0 - k).toFixed(2)} ${yFloor.toFixed(2)}, 7.00 ${yFloor.toFixed(2)} ` +
      `C 9.80 ${yFloorMid.toFixed(2)}, 14.20 ${yFloorMid.toFixed(2)}, 17.00 ${yFloor.toFixed(2)} ` +
      `C ${(17.0 + k).toFixed(2)} ${yFloor.toFixed(2)}, ${xR.toFixed(2)} ${(yCorner + k).toFixed(2)}, ${xR.toFixed(2)} ${yCorner.toFixed(2)} ` +
      `L ${xR.toFixed(2)} ${yLip.toFixed(2)}`
    );
  }

  // 1. Choreographed Arrow -> Saved Checkmark (Plunge + Stem Absorption + Rebound Whip)
  function evalArrowToSaved(t: number): VectorPose {
    if (t <= 0.0001) return clonePose(POSE_ARROW);
    if (t >= 0.9999) return clonePose(POSE_SAVED);

    // Phase A (0 -> 0.38): Arrow gathers slightly then plunges downward into the cradle
    // Phase B (0.28 -> 1.0): Shaft absorbs into elbow as right wing whips up to (18.5, 7.5)
    const impactWave = Math.exp(-Math.pow((t - 0.32) / 0.16, 2)); // Peaks at impact t = 0.32
    const settleProgress = smoothstep(0.22, 0.92, t);
    const rightTipWhip = smoothstep(0.26, 0.86, t);
    const whipOvershoot = Math.sin(rightTipWhip * Math.PI) * (1 - rightTipWhip * 0.3);

    // Elbow plunges down to y = 17.45 on impact, then rebounds to checkmark vertex (10.0, 16.5)
    const elbowX = lerp(12.0, 10.0, smoothstep(0.20, 0.78, t));
    const elbowY = lerp(16.0, 16.5, settleProgress) + 1.45 * impactWave;

    // Left wing transitions from (8.0, 12.0) -> (5.5, 12.5), dipping slightly on impact
    const leftX = lerp(8.0, 5.5, smoothstep(0.18, 0.76, t));
    const leftY = lerp(12.0, 12.5, settleProgress) + 1.10 * impactWave;

    // Right wing tucks on impact, then whips up to (18.5, 7.5) with slight elastic overshoot
    const rightX = lerp(16.0, 18.5, rightTipWhip) + 0.45 * whipOvershoot;
    const rightY = lerp(12.0, 7.5, rightTipWhip) + 1.25 * impactWave - 0.55 * whipOvershoot;

    // Shaft top tail races downward into the elbow (absorbed completely by t = 0.48)
    const shaftAbsorb = smoothstep(0.04, 0.46, t);
    const shaftTopX = lerp(12.0, elbowX, shaftAbsorb);
    const shaftTopY = lerp(4.0, elbowY, Math.pow(shaftAbsorb, 0.82)) + 1.2 * impactWave * (1 - shaftAbsorb);
    const shaftOpacity = 1 - smoothstep(0.32, 0.46, t);

    // Tray floor bends downward under impact, then rebounds and relaxes into pedestal
    const rebound = t > 0.32 ? Math.exp(-(t - 0.32) * 5.0) * Math.sin((t - 0.32) * Math.PI * 2.4) : 0;
    const floorDipY = 1.85 * impactWave - 0.65 * rebound;
    const lipFlareX = -0.45 * impactWave + lerp(0, 0.35, settleProgress);
    const lipLiftY = lerp(0, 1.15, settleProgress) + 0.35 * impactWave;
    const trayOpacity = lerp(1.0, 0.42, smoothstep(0.35, 0.95, t));

    return {
      chev: [leftX, leftY, elbowX, elbowY, rightX, rightY, 1.15 * whipOvershoot],
      shaft: [shaftTopX, shaftTopY, elbowX, elbowY, shaftOpacity],
      tray: [floorDipY, lipFlareX, lipLiftY, trayOpacity]
    };
  }

  // 2. Choreographed Saved Checkmark -> Arrow (Fold Wings + Draw Shaft Upward Out of Elbow)
  function evalSavedToArrow(t: number): VectorPose {
    if (t <= 0.0001) return clonePose(POSE_SAVED);
    if (t >= 0.9999) return clonePose(POSE_ARROW);

    const foldProgress = smoothstep(0.0, 0.72, t);
    const shaftDraw = smoothstep(0.18, 0.88, t);
    const springBounce = Math.sin(t * Math.PI) * (1 - t * 0.4);

    const elbowX = lerp(10.0, 12.0, foldProgress);
    const elbowY = lerp(16.5, 16.0, foldProgress) + 0.65 * Math.sin(foldProgress * Math.PI);

    const leftX = lerp(5.5, 8.0, foldProgress);
    const leftY = lerp(12.5, 12.0, foldProgress) + 0.4 * springBounce;

    const rightX = lerp(18.5, 16.0, foldProgress);
    const rightY = lerp(7.5, 12.0, foldProgress) + 0.4 * springBounce;

    // Shaft emerges upward from the elbow back to (12, 4)
    const shaftTopX = elbowX;
    const shaftTopY = lerp(elbowY, 4.0, Math.pow(shaftDraw, 0.78));
    const shaftOpacity = smoothstep(0.14, 0.28, t);

    const floorDipY = 0.65 * Math.sin(t * Math.PI);
    const lipFlareX = lerp(0.35, 0, foldProgress);
    const lipLiftY = lerp(1.15, 0, foldProgress);
    const trayOpacity = lerp(0.42, 1.0, foldProgress);

    return {
      chev: [leftX, leftY, elbowX, elbowY, rightX, rightY, -0.55 * springBounce],
      shaft: [shaftTopX, shaftTopY, elbowX, elbowY, shaftOpacity],
      tray: [floorDipY, lipFlareX, lipLiftY, trayOpacity]
    };
  }

  // 3. Continuous Gravity-Drop & Trampoline Catch Wave (`isDownloading` cycle u in [0, 1))
  function evalDownloadingWave(u: number): VectorPose {
    // u: 0.00 -> 0.56 (Accelerating drop from top into tray)
    // u: 0.56 -> 0.84 (Elastic absorption into tray floor + shaft compression)
    // u: 0.84 -> 1.00 (Tray rebound + new arrow nucleation at top)
    const dropPhase = smoothstep(0.0, 0.62, u);
    const absorbPhase = smoothstep(0.48, 0.84, u);
    const emergePhase = smoothstep(0.84, 1.0, u);

    // Impact pulse peaks around u = 0.58 when the arrow tip hits the cradle
    const impact = Math.exp(-Math.pow((u - 0.58) / 0.13, 2));
    const rebound = u > 0.58 ? Math.exp(-(u - 0.58) * 6.5) * Math.sin((u - 0.58) * Math.PI * 3.2) : 0;

    let elbowY: number;
    let shaftTopY: number;
    let wingSpread: number;
    let wingSweepY: number;
    let opacity: number;

    if (u < 0.84) {
      // Falling & absorbing into cradle (elbow travels from 12.2 down to 17.6)
      elbowY = lerp(12.2, 17.6, Math.pow(dropPhase, 1.15));
      // Shaft stretches during peak velocity, then top tail plunges into elbow during absorption
      const baseTopY = elbowY - 11.2 * (1 - 0.72 * absorbPhase);
      shaftTopY = Math.max(3.2, baseTopY);
      wingSpread = 4.0 * (1 - 0.45 * absorbPhase);
      // Aerodynamic upward sweep of wing tips during fall
      wingSweepY = 4.0 + 0.55 * Math.sin(dropPhase * Math.PI) * (1 - absorbPhase);
      opacity = smoothstep(0.0, 0.16, u) * (1 - smoothstep(0.66, 0.84, u));
    } else {
      // Next packet nucleating seamlessly at top back into the start position (elbowY = 12.2)
      elbowY = lerp(10.4, 12.2, emergePhase);
      shaftTopY = lerp(3.0, 4.0, emergePhase);
      wingSpread = lerp(2.6, 4.0, emergePhase);
      wingSweepY = lerp(2.8, 4.0, emergePhase);
      opacity = smoothstep(0.84, 0.99, u);
    }

    const floorDipY = 1.75 * impact - 0.55 * rebound;
    const lipFlareX = -0.38 * impact + 0.18 * rebound;
    const lipLiftY = 0.35 * impact;

    return {
      chev: [
        12.0 - wingSpread,
        elbowY - wingSweepY,
        12.0,
        elbowY,
        12.0 + wingSpread,
        elbowY - wingSweepY,
        0
      ],
      shaft: [12.0, shaftTopY, 12.0, elbowY, opacity],
      tray: [floorDipY, lipFlareX, lipLiftY, 1]
    };
  }

  function blendPoses(a: VectorPose, b: VectorPose, w: number): VectorPose {
    return {
      chev: [
        lerp(a.chev[0], b.chev[0], w),
        lerp(a.chev[1], b.chev[1], w),
        lerp(a.chev[2], b.chev[2], w),
        lerp(a.chev[3], b.chev[3], w),
        lerp(a.chev[4], b.chev[4], w),
        lerp(a.chev[5], b.chev[5], w),
        lerp(a.chev[6], b.chev[6], w)
      ],
      shaft: [
        lerp(a.shaft[0], b.shaft[0], w),
        lerp(a.shaft[1], b.shaft[1], w),
        lerp(a.shaft[2], b.shaft[2], w),
        lerp(a.shaft[3], b.shaft[3], w),
        lerp(a.shaft[4], b.shaft[4], w)
      ],
      tray: [
        lerp(a.tray[0], b.tray[0], w),
        lerp(a.tray[1], b.tray[1], w),
        lerp(a.tray[2], b.tray[2], w),
        lerp(a.tray[3], b.tray[3], w)
      ]
    };
  }

  function applyResidual(choreo: VectorPose, snap: VectorPose, ideal: VectorPose, r: number): VectorPose {
    if (r <= 0.0001) return choreo;
    return {
      chev: [
        choreo.chev[0] + (snap.chev[0] - ideal.chev[0]) * r,
        choreo.chev[1] + (snap.chev[1] - ideal.chev[1]) * r,
        choreo.chev[2] + (snap.chev[2] - ideal.chev[2]) * r,
        choreo.chev[3] + (snap.chev[3] - ideal.chev[3]) * r,
        choreo.chev[4] + (snap.chev[4] - ideal.chev[4]) * r,
        choreo.chev[5] + (snap.chev[5] - ideal.chev[5]) * r,
        choreo.chev[6] + (snap.chev[6] - ideal.chev[6]) * r
      ],
      shaft: [
        choreo.shaft[0] + (snap.shaft[0] - ideal.shaft[0]) * r,
        choreo.shaft[1] + (snap.shaft[1] - ideal.shaft[1]) * r,
        choreo.shaft[2] + (snap.shaft[2] - ideal.shaft[2]) * r,
        choreo.shaft[3] + (snap.shaft[3] - ideal.shaft[3]) * r,
        clamp(choreo.shaft[4] + (snap.shaft[4] - ideal.shaft[4]) * r, 0, 1)
      ],
      tray: [
        choreo.tray[0] + (snap.tray[0] - ideal.tray[0]) * r,
        choreo.tray[1] + (snap.tray[1] - ideal.tray[1]) * r,
        choreo.tray[2] + (snap.tray[2] - ideal.tray[2]) * r,
        clamp(choreo.tray[3] + (snap.tray[3] - ideal.tray[3]) * r, 0, 1)
      ]
    };
  }

  // Reactive SVG attributes
  let currentPose = clonePose(POSE_ARROW);
  let trayD = $state<string>(buildTrayPath(POSE_ARROW.tray));
  let trayOpacity = $state<number>(1);
  let chevronD = $state<string>(buildChevronPath(POSE_ARROW.chev));
  let chevronOpacity = $state<number>(1);
  let shaftD = $state<string>('M 12.00 4.00 L 12.00 16.00');
  let shaftOpacity = $state<number>(1);
  let showShaft = $state<boolean>(true);

  let rafId: number | null = null;
  let lastTime = 0;

  let animElapsed = 1;
  const MORPH_DURATION = 0.50; // seconds (500ms choreographed plunge + whip)
  let startSnapshot = clonePose(POSE_ARROW);
  let idealStartPose = clonePose(POSE_ARROW);

  let downloadClock = 0;
  let downloadBlend = 0;

  let prevSaved: boolean | null = null;
  let prevDownloading: boolean | null = null;

  function syncDomFromPose(p: VectorPose) {
    currentPose = p;
    trayD = buildTrayPath(p.tray);
    trayOpacity = Number(p.tray[3].toFixed(3));
    chevronD = buildChevronPath(p.chev);

    const dx = p.shaft[2] - p.shaft[0];
    const dy = p.shaft[3] - p.shaft[1];
    const len = Math.hypot(dx, dy);

    // Hide shaft when absorbed into the elbow so round linecaps never leave an orphan dot
    if (len > 0.12 && p.shaft[4] > 0.02) {
      showShaft = true;
      shaftD = `M ${p.shaft[0].toFixed(2)} ${p.shaft[1].toFixed(2)} L ${p.shaft[2].toFixed(2)} ${p.shaft[3].toFixed(2)}`;
      shaftOpacity = Number(p.shaft[4].toFixed(3));
    } else {
      showShaft = false;
      shaftOpacity = 0;
    }

    // During downloading wave, chevron shares the packet fade envelope; otherwise solid 1
    chevronOpacity = isDownloading || downloadBlend > 0.01 ? Number(clamp(p.shaft[4] + (1 - downloadBlend), 0, 1).toFixed(3)) : 1;
  }

  function step(now: number) {
    const dt = lastTime ? Math.min(0.064, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;

    // 1. Advance Arrow <-> Saved transition timer
    let tMorph = 1;
    if (animElapsed < MORPH_DURATION) {
      animElapsed = Math.min(MORPH_DURATION, animElapsed + dt);
      tMorph = clamp(animElapsed / MORPH_DURATION, 0, 1);
    }

    const baseChoreo = isSaved ? evalArrowToSaved(tMorph) : evalSavedToArrow(tMorph);
    const residual = (1 - tMorph) * (1 - tMorph);
    const morphedPose = applyResidual(baseChoreo, startSnapshot, idealStartPose, residual);

    // 2. Advance Downloading blend & ballistic wave clock
    const targetDl = isDownloading ? 1 : 0;
    if (downloadBlend !== targetDl) {
      const dlSpeed = isDownloading ? 4.2 : 3.4;
      downloadBlend = clamp(downloadBlend + (isDownloading ? 1 : -1) * dt * dlSpeed, 0, 1);
    }

    if (downloadBlend > 0.001) {
      downloadClock = (downloadClock + dt * 1.45) % 1;
    }

    const bDl = smoothstep(0, 1, downloadBlend);
    const finalPose =
      bDl <= 0.0001
        ? morphedPose
        : blendPoses(morphedPose, evalDownloadingWave(downloadClock), bDl);

    syncDomFromPose(finalPose);

    if (tMorph < 1 || downloadBlend > 0.0001 || isDownloading) {
      rafId = requestAnimationFrame(step);
    } else {
      syncDomFromPose(isSaved ? clonePose(POSE_SAVED) : clonePose(POSE_ARROW));
      rafId = null;
    }
  }

  function triggerTransition(fromSavedChange: boolean) {
    startSnapshot = clonePose(currentPose);
    if (fromSavedChange) {
      idealStartPose = isSaved ? clonePose(POSE_ARROW) : clonePose(POSE_SAVED);
      animElapsed = 0;
    }
    if (rafId === null) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(step);
    }
  }

  $effect(() => {
    const nowSaved = isSaved;
    const nowDownloading = isDownloading;

    if (prevSaved === null) {
      prevSaved = nowSaved;
      prevDownloading = nowDownloading;
      animElapsed = MORPH_DURATION;
      downloadBlend = nowDownloading ? 1 : 0;
      const initPose = nowSaved ? clonePose(POSE_SAVED) : clonePose(POSE_ARROW);
      syncDomFromPose(initPose);
      if (nowDownloading) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(step);
      }
      return;
    }

    const savedChanged = prevSaved !== nowSaved;
    const dlChanged = prevDownloading !== nowDownloading;
    prevSaved = nowSaved;
    prevDownloading = nowDownloading;

    if (savedChanged || dlChanged) {
      // When transitioning straight from Downloading -> Saved, let downloadBlend crossfade into the plunge
      if (dlChanged && !nowDownloading && !savedChanged) {
        startSnapshot = clonePose(currentPose);
        idealStartPose = nowSaved ? clonePose(POSE_SAVED) : clonePose(POSE_ARROW);
      }
      triggerTransition(savedChanged);
    }
  });

  onMount(() => {
    if (isDownloading) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(step);
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
    <!-- Elastic Cubic-Bezier Receiver Cradle -->
    <path
      d={trayD}
      opacity={trayOpacity}
      class="download-tray"
    />

    <!-- Plunging Arrow Stem (Absorbs downward into the chevron vertex on Save) -->
    {#if showShaft}
      <path
        d={shaftD}
        opacity={shaftOpacity}
        class="download-shaft"
      />
    {/if}

    <!-- Dynamic Winged Chevron / Kinetic Whip Checkmark -->
    <path
      d={chevronD}
      opacity={chevronOpacity}
      class="download-chevron"
    />
  </svg>
</div>

<style>
  .download-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .download-svg {
    transform-origin: center center;
  }

  .download-tray,
  .download-shaft,
  .download-chevron {
    pointer-events: none;
  }
</style>
