<script lang="ts">
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

  // Exact symmetric polar arc geometry matching the canonical 3-ray radii (3.75, 6.75, 9.75)
  function buildSymmetricArcPair(r: number, halfAngle = Math.PI * 0.25): string {
    const dx = r * Math.cos(halfAngle);
    const dy = r * Math.sin(halfAngle);
    const xL = (12 - dx).toFixed(2);
    const xR = (12 + dx).toFixed(2);
    const yTop = (12 - dy).toFixed(2);
    const yBot = (12 + dy).toFixed(2);
    const rf = r.toFixed(2);
    return `M ${xL} ${yBot} A ${rf} ${rf} 0 0 1 ${xL} ${yTop} M ${xR} ${yTop} A ${rf} ${rf} 0 0 1 ${xR} ${yBot}`;
  }

  const RAY_INNER = buildSymmetricArcPair(3.75);
  const RAY_MID = buildSymmetricArcPair(6.75);
  const RAY_OUTER = buildSymmetricArcPair(9.75);

  let baseStroke = $derived(Number(strokeWidth) || 2);
</script>

<div
  class="jam-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
  aria-label={active ? 'Jam session active' : 'Start Jam session'}
>
  <!-- Center Emitter Core -->
  <svg viewBox="0 0 24 24" fill="none" class="jam-layer absolute inset-0 z-10 w-full h-full overflow-visible {active ? 'jam-core-active' : ''}">
    <circle cx="12" cy="12" r="1.35" fill="currentColor" opacity="0.92" />
  </svg>

  <!-- Inner Ray Pair -->
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="jam-layer absolute inset-0 z-10 w-full h-full overflow-visible {active ? 'jam-wave-1' : ''}"
  >
    <path d={RAY_INNER} opacity="0.94" stroke-width={baseStroke} />
  </svg>

  <!-- Middle Ray Pair -->
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="jam-layer absolute inset-0 z-10 w-full h-full overflow-visible {active ? 'jam-wave-2' : ''}"
  >
    <path d={RAY_MID} opacity="0.78" stroke-width={baseStroke} />
  </svg>

  <!-- Outer Ray Pair -->
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="jam-layer absolute inset-0 z-10 w-full h-full overflow-visible {active ? 'jam-wave-3' : ''}"
  >
    <path d={RAY_OUTER} opacity="0.62" stroke-width={baseStroke} />
  </svg>
</div>

<style>
  .jam-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .jam-layer {
    transform-origin: center center;
    pointer-events: none;
  }

  .jam-core-active {
    will-change: transform, opacity;
    animation: jam-core-pulse 1.5s ease-in-out infinite;
  }

  .jam-wave-1,
  .jam-wave-2,
  .jam-wave-3 {
    will-change: transform, opacity;
    animation: jam-ray-pulse 1.5s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }

  .jam-wave-1 { animation-delay: 0s; }
  .jam-wave-2 { animation-delay: 0.25s; }
  .jam-wave-3 { animation-delay: 0.5s; }

  @keyframes jam-core-pulse {
    0%, 100% {
      transform: scale(1) translateZ(0);
      opacity: 0.9;
    }
    50% {
      transform: scale(1.24) translateZ(0);
      opacity: 1;
    }
  }

  @keyframes jam-ray-pulse {
    0%, 100% {
      transform: scale(0.92) translateZ(0);
      opacity: 0.45;
    }
    45% {
      transform: scale(1.08) translateZ(0);
      opacity: 1;
    }
  }
</style>
