<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props {
    active: boolean;
    class?: string;
    size?: number | string;
  }

  let { active = false, class: className = '', size = 30 }: Props = $props();

  // 14 floats per arrow:
  // [x0, y0, c1x, c1y, c2x, c2y, x1, y1, bx1, by1, tx, ty, bx2, by2]
  // Inactive (Off): Sleek horizontal straightline arrow at y = 12 pointing right
  // Acute 51 deg sleek arrowhead (dx=2.6, dy=1.25, tip at 20.0, 12.0)
  const OFF_POINTS = [
    3.5, 12.0,   9.5, 12.0,   14.0, 12.0,   20.0, 12.0,
    17.4, 10.75, 20.0, 12.0,  17.4, 13.25
  ];

  // Active (On): Arrow A curves down smoothly from top-left (3.5, 6.5) to bottom-right (20.0, 17.5)
  // Inflection distributed smoothly across center (12, 12), acute 51 deg tip at (20.0, 17.5)
  const ON_POINTS_A = [
    3.5, 6.5,    10.5, 6.5,   13.5, 17.5,  20.0, 17.5,
    17.4, 16.25, 20.0, 17.5,  17.4, 18.75
  ];

  // Active (On): Arrow B curves up smoothly from bottom-left (3.5, 17.5) to top-right (20.0, 6.5)
  const ON_POINTS_B = [
    3.5, 17.5,   10.5, 17.5,  13.5, 6.5,   20.0, 6.5,
    17.4, 5.25,  20.0, 6.5,   17.4, 7.75
  ];

  function toArrowPath(p: number[]): string {
    return (
      `M ${p[0].toFixed(2)} ${p[1].toFixed(2)} ` +
      `C ${p[2].toFixed(2)} ${p[3].toFixed(2)}, ${p[4].toFixed(2)} ${p[5].toFixed(2)}, ${p[6].toFixed(2)} ${p[7].toFixed(2)} ` +
      `M ${p[8].toFixed(2)} ${p[9].toFixed(2)} ` +
      `L ${p[10].toFixed(2)} ${p[11].toFixed(2)} ` +
      `L ${p[12].toFixed(2)} ${p[13].toFixed(2)}`
    );
  }

  let currentPointsA = [...OFF_POINTS];
  let currentPointsB = [...OFF_POINTS];
  let opacityB = $state<number>(0);
  let pathA = $state<string>(toArrowPath(OFF_POINTS));
  let pathB = $state<string>(toArrowPath(OFF_POINTS));

  let animId: number | null = null;
  let prevActive: boolean | null = null;

  function animateTo(targetActive: boolean) {
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }

    const startA = [...currentPointsA];
    const startB = [...currentPointsB];
    const startOpacityB = opacityB;
    const targetA = targetActive ? ON_POINTS_A : OFF_POINTS;
    const targetB = targetActive ? ON_POINTS_B : OFF_POINTS;
    const targetOpacityB = targetActive ? 1 : 0;
    const startTime = performance.now();
    const duration = 400; // ms

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / duration));
      // Quartic ease out: ultra-fluid deceleration curve
      const ease = 1 - Math.pow(1 - t, 4);

      for (let i = 0; i < 14; i++) {
        currentPointsA[i] = startA[i] + (targetA[i] - startA[i]) * ease;
        currentPointsB[i] = startB[i] + (targetB[i] - startB[i]) * ease;
      }
      opacityB = startOpacityB + (targetOpacityB - startOpacityB) * ease;

      pathA = toArrowPath(currentPointsA);
      pathB = toArrowPath(currentPointsB);

      if (t < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        currentPointsA = [...targetA];
        currentPointsB = [...targetB];
        opacityB = targetOpacityB;
        pathA = toArrowPath(targetA);
        pathB = toArrowPath(targetB);
        animId = null;
      }
    }

    animId = requestAnimationFrame(tick);
  }

  $effect(() => {
    const isNowActive = active;
    if (prevActive === null) {
      prevActive = isNowActive;
      currentPointsA = [...(isNowActive ? ON_POINTS_A : OFF_POINTS)];
      currentPointsB = [...(isNowActive ? ON_POINTS_B : OFF_POINTS)];
      opacityB = isNowActive ? 1 : 0;
      pathA = toArrowPath(currentPointsA);
      pathB = toArrowPath(currentPointsB);
    } else if (prevActive !== isNowActive) {
      prevActive = isNowActive;
      animateTo(isNowActive);
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
  aria-label={`Shuffle: ${active ? 'enabled' : 'disabled'}`}
>
  <!-- Arrow A (curves top-left to bottom-right when active, straight when off) -->
  <path
    d={pathA}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="transition-colors duration-200"
  />

  <!-- Arrow B (curves bottom-left to top-right when active, fades out/in smoothly on toggle) -->
  {#if opacityB > 0.01}
    <path
      d={pathB}
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="opacity: {opacityB.toFixed(3)};"
      class="transition-colors duration-200"
    />
  {/if}
</svg>
