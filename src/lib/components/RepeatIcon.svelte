<script lang="ts">
  import { onDestroy } from 'svelte';

  export type RepeatMode = 'off' | 'one' | 'shuffle' | 'all';

  interface Props {
    mode: RepeatMode;
    class?: string;
    size?: number | string;
  }

  let { mode = 'off', class: className = '', size = 20 }: Props = $props();

  // 26 Bezier coordinate floats:
  // [x0, y0, c1x, c1y, c2x, c2y, x1, y1, c3x, c3y, c4x, c4y, x2, y2, c5x, c5y, c6x, c6y, x3, y3, c7x, c7y, c8x, c8y, x0, y0]

  // 1. Off: Sleek, confident horizontal line segment spanning proportional width (4.2 to 19.8)
  const P_LINE = [
    12, 12,
    14.5, 12, 17.5, 12, 19.8, 12,
    17.5, 12, 14.5, 12, 12, 12,
    9.5, 12, 6.5, 12, 4.2, 12,
    6.5, 12, 9.5, 12, 12, 12
  ];

  // 2. One: Line expands in length and curves into a clean, minimal circle (radius 6.2)
  const R = 6.2;
  const k = +(R * 0.5522847).toFixed(2); // 3.42
  const P_CIRCLE = [
    12, 12 - R,
    12 + k, 12 - R,  12 + R, 12 - k,  12 + R, 12,
    12 + R, 12 + k,  12 + k, 12 + R,  12, 12 + R,
    12 - k, 12 + R,  12 - R, 12 + k,  12 - R, 12,
    12 - R, 12 - k,  12 - k, 12 - R,  12, 12 - R
  ];

  // 3. Shuffle / Loop: Circle twists in the center and loops into a proportional 8 / infinity figure
  const P_INFINITY = [
    12, 12,
    14.8, 7.5, 19.8, 7.5, 19.8, 12,
    19.8, 16.5, 14.8, 16.5, 12, 12,
    9.2, 7.5, 4.2, 7.5, 4.2, 12,
    4.2, 16.5, 9.2, 16.5, 12, 12
  ];

  function getTarget(m: RepeatMode): number[] {
    if (m === 'one') return P_CIRCLE;
    if (m === 'shuffle' || m === 'all') return P_INFINITY;
    return P_LINE;
  }

  function toPath(p: number[], isSettledLine: boolean = false): string {
    if (isSettledLine) {
      // Single pristine horizontal line from left to right (exact single stroke of width 2)
      return `M 4.20 12.00 L 19.80 12.00`;
    }
    return (
      `M ${p[0].toFixed(2)} ${p[1].toFixed(2)} ` +
      `C ${p[2].toFixed(2)} ${p[3].toFixed(2)}, ${p[4].toFixed(2)} ${p[5].toFixed(2)}, ${p[6].toFixed(2)} ${p[7].toFixed(2)} ` +
      `C ${p[8].toFixed(2)} ${p[9].toFixed(2)}, ${p[10].toFixed(2)} ${p[11].toFixed(2)}, ${p[12].toFixed(2)} ${p[13].toFixed(2)} ` +
      `C ${p[14].toFixed(2)} ${p[15].toFixed(2)}, ${p[16].toFixed(2)} ${p[17].toFixed(2)}, ${p[18].toFixed(2)} ${p[19].toFixed(2)} ` +
      `C ${p[20].toFixed(2)} ${p[21].toFixed(2)}, ${p[22].toFixed(2)} ${p[23].toFixed(2)}, ${p[24].toFixed(2)} ${p[25].toFixed(2)} Z`
    );
  }

  let currentPoints = [...P_LINE];
  let pathD = $state<string>(toPath(P_LINE, true));
  let animId: number | null = null;
  let prevMode: RepeatMode | null = null;

  function animateTo(targetMode: RepeatMode) {
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }

    const start = [...currentPoints];
    const target = getTarget(targetMode);
    const startTime = performance.now();
    const duration = 440; // ms

    // Ultra-fluid quartic deceleration curve (zero jitter on 120/144/240Hz)
    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / duration));
      const ease = 1 - Math.pow(1 - t, 4);

      for (let i = 0; i < 26; i++) {
        currentPoints[i] = start[i] + (target[i] - start[i]) * ease;
      }

      pathD = toPath(currentPoints, false);

      if (t < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        currentPoints = [...target];
        pathD = toPath(target, targetMode === 'off');
        animId = null;
      }
    }

    animId = requestAnimationFrame(tick);
  }

  $effect(() => {
    const currentMode = mode;
    if (prevMode === null) {
      prevMode = currentMode;
      currentPoints = [...getTarget(currentMode)];
      pathD = toPath(currentPoints, currentMode === 'off');
    } else if (prevMode !== currentMode) {
      prevMode = currentMode;
      animateTo(currentMode);
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
  aria-label={`Playback mode: ${mode === 'shuffle' ? 'shuffle' : mode === 'one' ? 'repeat one' : 'off'}`}
>
  <!-- Morphing Vector Curve (Line -> Circle -> 8 Loop -> Line) -->
  <path
    d={pathD}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="transition-colors duration-200"
  />
</svg>
