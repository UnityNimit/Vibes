<script lang="ts">
  import { onDestroy } from 'svelte';

  export type RepeatMode = 'off' | 'one' | 'shuffle' | 'all';

  interface Props {
    mode: RepeatMode;
    class?: string;
    size?: number | string;
  }

  let { mode = 'off', class: className = '', size = 20 }: Props = $props();

  type ShapeKind = 'line' | 'circle' | 'infinity';

  // 26 Bezier coordinate floats (4 cubic segments, 5 anchors P0..P4, 8 handles C1..C8):
  // [x0, y0, c1x, c1y, c2x, c2y, x1, y1, c3x, c3y, c4x, c4y, x2, y2, c5x, c5y, c6x, c6y, x3, y3, c7x, c7y, c8x, c8y, x4, y4]

  const R = 6.2;
  const K = +(R * 0.5522847).toFixed(2); // 3.42
  const LINE_LEN = 15.6; // 4.2 -> 19.8
  const CIRCLE_LEN = 2 * Math.PI * R; // ~38.96

  // 1. Off: Unfolded, monotonic horizontal ribbon from left (4.2, 12) to right (19.8, 12)
  const P_LINE = [
    4.2, 12,
    5.5, 12, 6.8, 12, 8.1, 12,
    9.4, 12, 10.7, 12, 12.0, 12,
    13.3, 12, 14.6, 12, 15.9, 12,
    17.2, 12, 18.5, 12, 19.8, 12
  ];

  // 2. One: Ribbon curls upward from both ends and fuses at top (12, 12 - R)
  // P0 = Top, P1 = Left, P2 = Bottom, P3 = Right, P4 = Top
  const P_CIRCLE = [
    12, 12 - R,
    12 - K, 12 - R, 12 - R, 12 - K, 12 - R, 12,
    12 - R, 12 + K, 12 - K, 12 + R, 12, 12 + R,
    12 + K, 12 + R, 12 + R, 12 + K, 12 + R, 12,
    12 + R, 12 - K, 12 + K, 12 - R, 12, 12 - R
  ];

  // 3. Shuffle / All: Top and bottom pinch to (12, 12) while the right lobe twists into an 8 / infinity figure
  // P0 = Center, P1 = Left Apex (4.2, 12), P2 = Center, P3 = Right Apex (19.8, 12), P4 = Center
  const P_INFINITY = [
    12, 12,
    9.2, 7.5, 4.2, 7.5, 4.2, 12,
    4.2, 16.5, 9.2, 16.5, 12, 12,
    14.8, 7.5, 19.8, 7.5, 19.8, 12,
    19.8, 16.5, 14.8, 16.5, 12, 12
  ];

  function getShapeKind(m: RepeatMode): ShapeKind {
    if (m === 'one') return 'circle';
    if (m === 'shuffle' || m === 'all') return 'infinity';
    return 'line';
  }

  function getTarget(kind: ShapeKind): number[] {
    if (kind === 'circle') return P_CIRCLE;
    if (kind === 'infinity') return P_INFINITY;
    return P_LINE;
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Exact analytical circular-arc generator:
  // s = 0 -> straight line of length 15.6; s = 1 -> closed circle of radius 6.2 (length ~38.96)
  function evalLineToCircle(s: number): number[] {
    if (s <= 0.0001) return [...P_LINE];
    if (s >= 0.9999) return [...P_CIRCLE];

    // Length leads slightly so the line visibly elongates as it begins curling upward
    const sLen = Math.pow(s, 0.72);
    const sAngle = Math.pow(s, 1.08);

    const L = lerp(LINE_LEN, CIRCLE_LEN, sLen);
    const theta = Math.max(0.001, sAngle * Math.PI * 2);
    const rho = L / theta; // Instantaneous radius of curvature

    // Keep the top curling tips and bottom midpoint vertically centered around y = 12
    const yMid = 12 + 0.5 * rho * (1 - Math.cos(theta * 0.5));
    const dPhi = theta * 0.25;
    const handle = rho * (4 / 3) * Math.tan(dPhi * 0.25);

    const anchorsX: number[] = [];
    const anchorsY: number[] = [];
    const tanX: number[] = [];
    const tanY: number[] = [];

    for (let k = 0; k <= 4; k++) {
      const phi = (k * 0.5 - 1) * (theta * 0.5); // -theta/2 .. +theta/2
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      anchorsX.push(12 + rho * sinP);
      anchorsY.push(yMid - rho * (1 - cosP));
      tanX.push(cosP);
      tanY.push(-sinP);
    }

    const out = new Array<number>(26);
    out[0] = anchorsX[0];
    out[1] = anchorsY[0];

    for (let seg = 0; seg < 4; seg++) {
      const base = seg * 6 + 2;
      out[base] = anchorsX[seg] + handle * tanX[seg];
      out[base + 1] = anchorsY[seg] + handle * tanY[seg];
      out[base + 2] = anchorsX[seg + 1] - handle * tanX[seg + 1];
      out[base + 3] = anchorsY[seg + 1] - handle * tanY[seg + 1];
      out[base + 4] = anchorsX[seg + 1];
      out[base + 5] = anchorsY[seg + 1];
    }

    return out;
  }

  // Wave-propagated 3D twist from Circle (s = 0) to Infinity (s = 1):
  // Inner center handles cross before outer apex handles so the right loop never flattens into a 1D stick
  function evalCircleToInfinity(s: number): number[] {
    if (s <= 0.0001) return [...P_CIRCLE];
    if (s >= 0.9999) return [...P_INFINITY];

    const out = new Array<number>(26);
    for (let i = 0; i < 26; i++) {
      out[i] = lerp(P_CIRCLE[i], P_INFINITY[i], s);
    }

    const wave = Math.sin(Math.PI * s);
    const sInnerLead = Math.pow(s, 0.62); // Inner crossing leads near (12, 12)
    const sOuterLag = Math.pow(s, 1.48);  // Outer apex follows near (19.8, 12)

    // Left lobe subtle breathing while pinching to center
    out[2] = lerp(P_CIRCLE[2], P_INFINITY[2], sInnerLead);
    out[3] = lerp(P_CIRCLE[3], P_INFINITY[3], sInnerLead);
    out[10] = lerp(P_CIRCLE[10], P_INFINITY[10], sInnerLead);
    out[11] = lerp(P_CIRCLE[11], P_INFINITY[11], sInnerLead);

    // Right lobe inner handles (C5, C8) cross early at center
    out[14] = lerp(P_CIRCLE[14], P_INFINITY[14], sInnerLead) + 0.65 * wave;
    out[15] = lerp(P_CIRCLE[15], P_INFINITY[15], sInnerLead);
    out[22] = lerp(P_CIRCLE[22], P_INFINITY[22], sInnerLead) - 0.65 * wave;
    out[23] = lerp(P_CIRCLE[23], P_INFINITY[23], sInnerLead);

    // Right lobe outer handles (C6, C7) flip after the center has already opened up
    out[16] = lerp(P_CIRCLE[16], P_INFINITY[16], sOuterLag) + 0.55 * wave;
    out[17] = lerp(P_CIRCLE[17], P_INFINITY[17], sOuterLag);
    out[20] = lerp(P_CIRCLE[20], P_INFINITY[20], sOuterLag) - 0.55 * wave;
    out[21] = lerp(P_CIRCLE[21], P_INFINITY[21], sOuterLag);

    // Right apex (P3) reaches outward with a slight 3D arc
    out[18] = lerp(P_CIRCLE[18], P_INFINITY[18], s) + 0.45 * wave;

    return out;
  }

  // Anti-symmetric S-ribbon uncurling between Line (s = 0) and Infinity (s = 1)
  function evalLineToInfinity(s: number): number[] {
    if (s <= 0.0001) return [...P_LINE];
    if (s >= 0.9999) return [...P_INFINITY];

    const out = new Array<number>(26);
    const sEnds = Math.pow(s, 0.88);
    const sLobes = Math.pow(s, 0.76);
    const wave = Math.sin(Math.PI * s);

    for (let i = 0; i < 26; i++) {
      out[i] = lerp(P_LINE[i], P_INFINITY[i], sLobes);
    }

    // Free ends P0 and P4 sweep along opposite arches (S-wave) as the two loops pull taut / curl in
    out[0] = lerp(P_LINE[0], P_INFINITY[0], sEnds);
    out[1] = 12 - 3.3 * wave; // Left tip arches over top-left

    out[24] = lerp(P_LINE[24], P_INFINITY[24], sEnds);
    out[25] = 12 + 3.3 * wave; // Right tip arches under bottom-right

    // Outer handles trail the tips smoothly
    out[2] = lerp(P_LINE[2], P_INFINITY[2], sEnds);
    out[3] = lerp(P_LINE[3], P_INFINITY[3], sLobes) - 1.4 * wave;

    out[22] = lerp(P_LINE[22], P_INFINITY[22], sEnds);
    out[23] = lerp(P_LINE[23], P_INFINITY[23], sLobes) + 1.4 * wave;

    return out;
  }

  function evalPair(fromKind: ShapeKind, toKind: ShapeKind, s: number): number[] {
    if (fromKind === toKind) return [...getTarget(toKind)];
    if (fromKind === 'line' && toKind === 'circle') return evalLineToCircle(s);
    if (fromKind === 'circle' && toKind === 'line') return evalLineToCircle(1 - s);
    if (fromKind === 'circle' && toKind === 'infinity') return evalCircleToInfinity(s);
    if (fromKind === 'infinity' && toKind === 'circle') return evalCircleToInfinity(1 - s);
    if (fromKind === 'line' && toKind === 'infinity') return evalLineToInfinity(s);
    return evalLineToInfinity(1 - s);
  }

  function toPath(p: number[], settledKind: ShapeKind | null = null): string {
    if (settledKind === 'line') {
      // Single pristine horizontal line from left to right (exact single stroke of width 2)
      return 'M 4.20 12.00 L 19.80 12.00';
    }
    const close = settledKind === 'circle' || settledKind === 'infinity' ? ' Z' : '';
    return (
      `M ${p[0].toFixed(2)} ${p[1].toFixed(2)} ` +
      `C ${p[2].toFixed(2)} ${p[3].toFixed(2)}, ${p[4].toFixed(2)} ${p[5].toFixed(2)}, ${p[6].toFixed(2)} ${p[7].toFixed(2)} ` +
      `C ${p[8].toFixed(2)} ${p[9].toFixed(2)}, ${p[10].toFixed(2)} ${p[11].toFixed(2)}, ${p[12].toFixed(2)} ${p[13].toFixed(2)} ` +
      `C ${p[14].toFixed(2)} ${p[15].toFixed(2)}, ${p[16].toFixed(2)} ${p[17].toFixed(2)}, ${p[18].toFixed(2)} ${p[19].toFixed(2)} ` +
      `C ${p[20].toFixed(2)} ${p[21].toFixed(2)}, ${p[22].toFixed(2)} ${p[23].toFixed(2)}, ${p[24].toFixed(2)} ${p[25].toFixed(2)}` +
      close
    );
  }

  let currentPoints = [...P_LINE];
  let pathD = $state<string>(toPath(P_LINE, 'line'));
  let animId: number | null = null;
  let prevMode: RepeatMode | null = null;
  let activeFromKind: ShapeKind = 'line';

  function animateTo(fromKind: ShapeKind, toKind: ShapeKind) {
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }

    if (fromKind === toKind) {
      currentPoints = [...getTarget(toKind)];
      pathD = toPath(currentPoints, toKind);
      return;
    }

    const startSnapshot = [...currentPoints];
    const idealStart = evalPair(fromKind, toKind, 0);
    const startTime = performance.now();
    const duration = 480; // ms

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / duration));

      // Expressive quintic-mixed deceleration (silky 120/144/240Hz follow-through)
      const inv = 1 - t;
      const ease = 1 - (0.35 * Math.pow(inv, 3) + 0.65 * Math.pow(inv, 5));

      const choreo = evalPair(fromKind, toKind, ease);
      const residualWeight = inv * inv; // Smoothly decays mid-flight interruption offsets

      for (let i = 0; i < 26; i++) {
        currentPoints[i] = choreo[i] + (startSnapshot[i] - idealStart[i]) * residualWeight;
      }

      if (t < 1) {
        pathD = toPath(currentPoints, null);
        animId = requestAnimationFrame(tick);
      } else {
        currentPoints = [...getTarget(toKind)];
        pathD = toPath(currentPoints, toKind);
        activeFromKind = toKind;
        animId = null;
      }
    }

    animId = requestAnimationFrame(tick);
  }

  $effect(() => {
    const currentMode = mode;
    const nextKind = getShapeKind(currentMode);

    if (prevMode === null) {
      prevMode = currentMode;
      activeFromKind = nextKind;
      currentPoints = [...getTarget(nextKind)];
      pathD = toPath(currentPoints, nextKind);
    } else if (prevMode !== currentMode) {
      const fromKind = getShapeKind(prevMode);
      prevMode = currentMode;
      animateTo(fromKind, nextKind);
    }
  });

  onDestroy(() => {
    if (animId !== null) {
      cancelAnimationFrame(animId);
    }
  });
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  class="overflow-visible select-none pointer-events-none {className}"
  aria-label={`Playback mode: ${mode === 'shuffle' ? 'shuffle' : mode === 'one' ? 'repeat one' : mode === 'all' ? 'repeat all' : 'off'}`}
>
  <!-- Morphing Vector Ribbon (Line <-> Circle <-> 8 Loop) -->
  <path
    d={pathD}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="transition-colors duration-200"
  />
</svg>
