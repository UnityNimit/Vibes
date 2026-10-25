<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    /** Whether the item is liked / active (true = filled heart with systolic bloom, false = outline) */
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
  // 6-SEGMENT CUBIC-BEZIER HEART ANATOMY (38 coordinate floats)
  // Landmarks (Clockwise from Top Cleft):
  //   P0 (12.00,  7.64) : Top Cleft Valley
  //   P1 (19.68,  6.32) : Top-Right Crown
  //   P2 (19.68, 12.68) : Right Flank Transition
  //   P3 (12.00, 20.36) : Bottom Apex Point
  //   P4 ( 4.32, 12.68) : Left Flank Transition
  //   P5 ( 4.32,  6.32) : Top-Left Crown
  // ---------------------------------------------------------------------------

  interface HeartDeform {
    cleftY: number;      // Vertical offset of top cleft P0
    crownSpreadX: number;// Horizontal expansion of upper crowns P1, P5
    crownLiftY: number;  // Vertical lift of upper crowns P1, P5
    cheekSpreadX: number;// Horizontal expansion of outer cheeks (C3/C4 & C9/C10)
    flankSpreadX: number;// Horizontal offset of flank transitions P2, P4
    flankLiftY: number;  // Vertical offset of flank transitions P2, P4
    apexY: number;       // Vertical offset of bottom tip P3
    bellyBow: number;    // Outward (+) or concave (-) bow of lower flanks (Seg 3 & Seg 4)
    lobeLoft: number;    // Extra upward dome on top lobe arches (Seg 1 & Seg 6)
  }

  const REST_DEFORM: HeartDeform = {
    cleftY: 0,
    crownSpreadX: 0,
    crownLiftY: 0,
    cheekSpreadX: 0,
    flankSpreadX: 0,
    flankLiftY: 0,
    apexY: 0,
    bellyBow: 0,
    lobeLoft: 0
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

  // Builds the 38-float 6-segment Cubic Bezier array from anatomical deformation parameters
  function buildHeartPoints(d: HeartDeform): number[] {
    // 6 Anchors
    const p0x = 12.0;
    const p0y = 7.636 + d.cleftY;

    const p1x = 19.682 + d.crownSpreadX;
    const p1y = 6.318 + d.crownLiftY;

    const p2x = 19.682 + d.flankSpreadX;
    const p2y = 12.682 + d.flankLiftY;

    const p3x = 12.0;
    const p3y = 20.364 + d.apexY;

    const p4x = 4.318 - d.flankSpreadX;
    const p4y = 12.682 + d.flankLiftY;

    const p5x = 4.318 - d.crownSpreadX;
    const p5y = 6.318 + d.crownLiftY;

    // Segment 1: P0 (Cleft) -> P1 (Top-Right Crown)
    const c1x = 14.55 + d.crownSpreadX * 0.35;
    const c1y = 5.09 + d.cleftY * 0.45 - d.lobeLoft;
    const c2x = p1x - 1.90 - d.crownSpreadX * 0.15;
    const c2y = p1y - 1.90 - d.lobeLoft * 0.85;

    // Segment 2: P1 (Top-Right Crown) -> P2 (Right Flank) — 90 deg arc at rest (k*cos45 = 1.757)
    const cheekK = 1.757 + d.cheekSpreadX;
    const c3x = p1x + cheekK;
    const c3y = p1y + 1.757;
    const c4x = p2x + cheekK;
    const c4y = p2y - 1.757;

    // Segment 3: P2 (Right Flank) -> P3 (Bottom Apex) — Straight at rest, bows outward/inward in motion
    const bowNx = 0.7071 * d.bellyBow;
    const bowNy = 0.7071 * d.bellyBow;
    const c5x = lerp(p2x, p3x, 0.33) + bowNx;
    const c5y = lerp(p2y, p3y, 0.33) + bowNy;
    const c6x = lerp(p2x, p3x, 0.68) + bowNx * 0.75;
    const c6y = lerp(p2y, p3y, 0.68) + bowNy * 0.75;

    // Segment 4: P3 (Bottom Apex) -> P4 (Left Flank)
    const c7x = lerp(p3x, p4x, 0.32) - bowNx * 0.75;
    const c7y = lerp(p3y, p4y, 0.32) + bowNy * 0.75;
    const c8x = lerp(p3x, p4x, 0.67) - bowNx;
    const c8y = lerp(p3y, p4y, 0.67) + bowNy;

    // Segment 5: P4 (Left Flank) -> P5 (Top-Left Crown)
    const c9x = p4x - cheekK;
    const c9y = p4y - 1.757;
    const c10x = p5x - cheekK;
    const c10y = p5y + 1.757;

    // Segment 6: P5 (Top-Left Crown) -> P0 (Cleft)
    const c11x = p5x + 1.90 + d.crownSpreadX * 0.15;
    const c11y = p5y - 1.90 - d.lobeLoft * 0.85;
    const c12x = 9.45 - d.crownSpreadX * 0.35;
    const c12y = 5.09 + d.cleftY * 0.45 - d.lobeLoft;

    return [
      p0x, p0y,
      c1x, c1y, c2x, c2y, p1x, p1y,
      c3x, c3y, c4x, c4y, p2x, p2y,
      c5x, c5y, c6x, c6y, p3x, p3y,
      c7x, c7y, c8x, c8y, p4x, p4y,
      c9x, c9y, c10x, c10y, p5x, p5y,
      c11x, c11y, c12x, c12y, p0x, p0y
    ];
  }

  function toBezierPath(p: number[]): string {
    return (
      `M ${p[0].toFixed(2)} ${p[1].toFixed(2)} ` +
      `C ${p[2].toFixed(2)} ${p[3].toFixed(2)}, ${p[4].toFixed(2)} ${p[5].toFixed(2)}, ${p[6].toFixed(2)} ${p[7].toFixed(2)} ` +
      `C ${p[8].toFixed(2)} ${p[9].toFixed(2)}, ${p[10].toFixed(2)} ${p[11].toFixed(2)}, ${p[12].toFixed(2)} ${p[13].toFixed(2)} ` +
      `C ${p[14].toFixed(2)} ${p[15].toFixed(2)}, ${p[16].toFixed(2)} ${p[17].toFixed(2)}, ${p[18].toFixed(2)} ${p[19].toFixed(2)} ` +
      `C ${p[20].toFixed(2)} ${p[21].toFixed(2)}, ${p[22].toFixed(2)} ${p[23].toFixed(2)}, ${p[24].toFixed(2)} ${p[25].toFixed(2)} ` +
      `C ${p[26].toFixed(2)} ${p[27].toFixed(2)}, ${p[28].toFixed(2)} ${p[29].toFixed(2)}, ${p[30].toFixed(2)} ${p[31].toFixed(2)} ` +
      `C ${p[32].toFixed(2)} ${p[33].toFixed(2)}, ${p[34].toFixed(2)} ${p[35].toFixed(2)}, ${p[36].toFixed(2)} ${p[37].toFixed(2)} Z`
    );
  }

  const P_REST = buildHeartPoints(REST_DEFORM);

  // Evaluates the outer stroke & rising liquid meniscus fill during LIKE (t in [0, 1])
  function evalLikeChoreo(t: number) {
    // 1. Anticipation gather (t: 0 -> 0.18): cleft dips, apex lifts, cheeks draw in
    const gather = t < 0.22 ? Math.sin((t / 0.22) * Math.PI) : 0;

    // 2. Primary Systolic Bloom ("LUB") + Secondary Harmonic Catch ("DUB")
    const bloomEnv = t > 0.14 ? Math.exp(-(t - 0.14) * 4.2) * Math.sin((t - 0.14) * Math.PI * 3.1) : 0;
    // Phase-lagged wave for upper crowns (travels upward from apex to lobes)
    const crownWave = t > 0.17 ? Math.exp(-(t - 0.17) * 4.0) * Math.sin((t - 0.17) * Math.PI * 3.0) : 0;

    const strokeDeform: HeartDeform = {
      cleftY: 1.35 * gather - 0.85 * crownWave,
      crownSpreadX: -0.75 * gather + 1.35 * crownWave,
      crownLiftY: 0.65 * gather - 1.30 * crownWave,
      cheekSpreadX: -0.65 * gather + 1.25 * bloomEnv,
      flankSpreadX: -0.55 * gather + 0.95 * bloomEnv,
      flankLiftY: -0.45 * gather + 0.35 * bloomEnv,
      apexY: -1.45 * gather + 1.25 * bloomEnv,
      bellyBow: -0.55 * gather + 1.05 * bloomEnv,
      lobeLoft: -0.45 * gather + 1.15 * crownWave
    };

    const strokePts = buildHeartPoints(strokeDeform);

    // Rising Liquid Meniscus Fill:
    // Nucleates near the lower apex chamber and surges upward into the left & right lobes
    const fillProgress = smoothstep(0.08, 0.52, t);
    const meniscusWave = Math.sin(fillProgress * Math.PI);

    // At fillProgress = 0, the fill is a compact droplet tucked inside the lower apex (around y = 17.2)
    const dropletPts = buildHeartPoints({
      cleftY: 9.2,
      crownSpreadX: -6.4,
      crownLiftY: 10.8,
      cheekSpreadX: -1.35,
      flankSpreadX: -6.1,
      flankLiftY: 5.4,
      apexY: -1.1,
      bellyBow: 0.4,
      lobeLoft: -1.2
    });

    const fillPts = new Array<number>(38);
    for (let i = 0; i < 38; i++) {
      // Cleft (P0) lags slightly behind the outer lobes to form a concave liquid meniscus as it rises
      const isCleft = i <= 1 || i >= 36;
      const localP = isCleft ? Math.pow(fillProgress, 1.35) : Math.pow(fillProgress, 0.78);
      fillPts[i] = lerp(dropletPts[i], strokePts[i], localP);
    }
    // Extra upward crest on the two lobe peaks during the surge
    fillPts[7] -= 0.65 * meniscusWave;
    fillPts[31] -= 0.65 * meniscusWave;

    const fillOpacity = smoothstep(0.04, 0.22, t);
    const tiltDeg = 2.8 * bloomEnv;

    return { strokePts, fillPts, fillOpacity, tiltDeg };
  }

  // Evaluates the outer stroke exhale & cleft-to-apex cavity drain during UNLIKE (t in [0, 1])
  function evalUnlikeChoreo(t: number) {
    // Exhale deflection peaks around t = 0.32, then rebounds elastically
    const exhale = Math.exp(-t * 3.8) * Math.sin(t * Math.PI * 2.1);

    const strokeDeform: HeartDeform = {
      cleftY: 1.55 * exhale,
      crownSpreadX: -0.95 * exhale,
      crownLiftY: 0.88 * exhale,
      cheekSpreadX: -0.82 * exhale,
      flankSpreadX: -0.65 * exhale,
      flankLiftY: 0.35 * exhale,
      apexY: 0.75 * exhale,
      bellyBow: -0.78 * exhale,
      lobeLoft: -0.65 * exhale
    };

    const strokePts = buildHeartPoints(strokeDeform);

    // Fill detaches from top cleft & upper lobes first and drains down into the bottom apex tip
    const drainProgress = smoothstep(0.0, 0.64, t);
    const drainTargetPts = buildHeartPoints({
      cleftY: 11.4,
      crownSpreadX: -7.1,
      crownLiftY: 12.6,
      cheekSpreadX: -1.55,
      flankSpreadX: -6.8,
      flankLiftY: 6.8,
      apexY: 0.2,
      bellyBow: -0.5,
      lobeLoft: -1.6
    });

    const fillPts = new Array<number>(38);
    for (let i = 0; i < 38; i++) {
      // Cleft (P0) drops first, pulling the upper lobes down toward the apex
      const isCleft = i <= 1 || i >= 36;
      const localP = isCleft ? Math.pow(drainProgress, 0.62) : Math.pow(drainProgress, 0.92);
      fillPts[i] = lerp(strokePts[i], drainTargetPts[i], localP);
    }

    const fillOpacity = 1 - smoothstep(0.32, 0.66, t);
    const tiltDeg = -2.2 * exhale;

    return { strokePts, fillPts, fillOpacity, tiltDeg };
  }

  // Reactive SVG state
  let strokePathD = $state<string>(toBezierPath(P_REST));
  let fillPathD = $state<string>(toBezierPath(P_REST));
  let fillOpacity = $state<number>(0);
  let transformStyle = $state<string>('rotate(0deg)');

  let currentStrokePts = [...P_REST];
  let currentFillPts = [...P_REST];

  let rafId: number | null = null;
  let animStartTime = 0;
  let prevLiked: boolean | null = null;

  function triggerAnimation(targetLiked: boolean) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    const startStrokeSnapshot = [...currentStrokePts];
    const startFillSnapshot = [...currentFillPts];
    const idealStart = targetLiked ? evalLikeChoreo(0) : evalUnlikeChoreo(0);

    animStartTime = performance.now();
    const duration = targetLiked ? 540 : 420; // ms

    function tick(now: number) {
      const elapsed = now - animStartTime;
      const t = clamp(elapsed / duration, 0, 1);

      const choreo = targetLiked ? evalLikeChoreo(t) : evalUnlikeChoreo(t);
      const residual = (1 - t) * (1 - t); // Smoothly decays mid-flight interruption offsets

      for (let i = 0; i < 38; i++) {
        currentStrokePts[i] =
          choreo.strokePts[i] + (startStrokeSnapshot[i] - idealStart.strokePts[i]) * residual;
        currentFillPts[i] =
          choreo.fillPts[i] + (startFillSnapshot[i] - idealStart.fillPts[i]) * residual;
      }

      strokePathD = toBezierPath(currentStrokePts);
      fillPathD = toBezierPath(currentFillPts);
      fillOpacity = Number(choreo.fillOpacity.toFixed(3));
      transformStyle = `rotate(${choreo.tiltDeg.toFixed(2)}deg)`;

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        currentStrokePts = [...P_REST];
        currentFillPts = [...P_REST];
        strokePathD = toBezierPath(P_REST);
        fillPathD = toBezierPath(P_REST);
        fillOpacity = targetLiked ? 1 : 0;
        transformStyle = 'rotate(0deg)';
        rafId = null;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  $effect(() => {
    const nowLiked = isLiked;
    if (prevLiked === null) {
      prevLiked = nowLiked;
      currentStrokePts = [...P_REST];
      currentFillPts = [...P_REST];
      strokePathD = toBezierPath(P_REST);
      fillPathD = toBezierPath(P_REST);
      fillOpacity = nowLiked ? 1 : 0;
      transformStyle = 'rotate(0deg)';
    } else if (prevLiked !== nowLiked) {
      prevLiked = nowLiked;
      triggerAnimation(nowLiked);
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
    style="transform: {transformStyle};"
  >
    <!-- Liquid Meniscus Core Fill (Surges upward from apex on Like, drains to apex on Unlike) -->
    <path
      d={fillPathD}
      fill="currentColor"
      opacity={fillOpacity}
      class="heart-fill"
    />

    <!-- Dynamic 6-Segment Cubic-Bezier Heart Contour -->
    <path
      d={strokePathD}
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class="heart-stroke"
    />
  </svg>
</div>

<style>
  .heart-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .heart-svg {
    transform-origin: 12px 13px;
    will-change: transform;
  }

  .heart-fill,
  .heart-stroke {
    pointer-events: none;
  }
</style>
