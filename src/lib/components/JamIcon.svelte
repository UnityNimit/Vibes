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
</script>

<div
  class="jam-icon-wrapper relative inline-flex items-center justify-center select-none overflow-visible {className}"
  style="width: {typeof size === 'number' ? `${size}px` : size}; height: {typeof size === 'number' ? `${size}px` : size};"
>
  {#if active}
    <!-- Outer Wave Emission Rings (GPU-accelerated broadcast pulse) -->
    <div class="jam-waves" aria-hidden="true">
      <span class="jam-ring jam-ring-1"></span>
      <span class="jam-ring jam-ring-2"></span>
      <span class="jam-ring jam-ring-3"></span>
    </div>
  {/if}

  <!-- Main Jam Broadcast SVG Icon -->
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class="jam-svg relative z-10 w-full h-full overflow-visible transition-transform duration-200"
    class:is-active={active}
  >
    <!-- Center Emitter Core / Dot -->
    <path
      d="M12 12h.008v.008H12V12z"
      class="jam-core {active ? 'jam-core-active' : ''}"
      stroke-width={Number(strokeWidth) + 1}
    />

    <!-- Inner Wave Arcs -->
    <path
      d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304"
      class="jam-arc jam-arc-inner {active ? 'jam-arc-inner-active' : ''}"
    />

    <!-- Middle Wave Arcs -->
    <path
      d="M7.227 16.773a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546"
      class="jam-arc jam-arc-mid {active ? 'jam-arc-mid-active' : ''}"
    />

    <!-- Outer Wave Arcs -->
    <path
      d="M5.106 18.894a9.75 9.75 0 010-13.788m13.788 0a9.75 9.75 0 010 13.788"
      class="jam-arc jam-arc-outer {active ? 'jam-arc-outer-active' : ''}"
    />
  </svg>
</div>

<style>
  /* -------------------------------------------------------------------------- */
  /* JAM ICON ANIMATIONS & STYLING                                              */
  /* Edit this section freely to fine-tune your animations to perfection!       */
  /* -------------------------------------------------------------------------- */

  .jam-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* --- SVG Base Styles --- */
  .jam-svg {
    transform-origin: center center;
    will-change: transform;
  }

  /* --- Outer Expanding Wave Rings --- */
  .jam-waves {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    overflow: visible;
    z-index: 0;
  }

  .jam-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 9999px;
    border: 1.5px solid currentColor;
    opacity: 0;
    will-change: transform, opacity;
    animation: jam-wave-pulse 2.1s cubic-bezier(0.16, 1, 0.3, 1) infinite;
    pointer-events: none;
  }

  .jam-ring-1 {
    animation-delay: 0s;
  }

  .jam-ring-2 {
    animation-delay: 0.7s;
  }

  .jam-ring-3 {
    animation-delay: 1.4s;
  }

  @keyframes jam-wave-pulse {
    0% {
      transform: scale(0.6) translateZ(0);
      opacity: 0.85;
    }
    50% {
      opacity: 0.35;
    }
    100% {
      transform: scale(2.2) translateZ(0);
      opacity: 0;
    }
  }

  /* --- Center Core Dot Animation --- */
  .jam-core {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .jam-core-active {
    animation: jam-core-glow 1.4s ease-in-out infinite alternate;
  }

  @keyframes jam-core-glow {
    0% {
      opacity: 0.7;
    }
    100% {
      opacity: 1;
    }
  }

  /* --- Sequential Arc Pulse Animations --- */
  .jam-arc {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .jam-arc-inner-active {
    animation: jam-arc-pulse 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite 0s;
  }

  .jam-arc-mid-active {
    animation: jam-arc-pulse 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.25s;
  }

  .jam-arc-outer-active {
    animation: jam-arc-pulse 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.5s;
  }

  @keyframes jam-arc-pulse {
    0%, 100% {
      opacity: 0.45;
    }
    50% {
      opacity: 1;
    }
  }
</style>
