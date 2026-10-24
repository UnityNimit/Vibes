<script lang="ts">
  import { onMount } from 'svelte';
  import { isAndroid } from '$lib/platform';

  interface TooltipPos {
    x: number;
    y: number;
    transform: string;
  }

  let activeTooltip = $state<string | null>(null);
  let tooltipPos = $state<TooltipPos>({ x: 0, y: 0, transform: 'translate(-50%, -100%)' });
  let currentTarget: Element | null = null;
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  function showTooltip(el: Element, text: string) {
    const rect = el.getBoundingClientRect();
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Sidebar icons (left side of screen) -> Show to the right
    if (rect.left < 90 && rect.width < 90) {
      tooltipPos = {
        x: rect.right + 10,
        y: rect.top + rect.height / 2,
        transform: 'translate(0, -50%)'
      };
    }
    // Bottom player controls (bottom of screen) -> Show above
    else if (rect.bottom > screenH - 100) {
      tooltipPos = {
        x: Math.max(24, Math.min(screenW - 24, rect.left + rect.width / 2)),
        y: rect.top - 10,
        transform: 'translate(-50%, -100%)'
      };
    }
    // Top bar buttons (top of screen) -> Show below
    else if (rect.top < 60) {
      tooltipPos = {
        x: Math.max(24, Math.min(screenW - 24, rect.left + rect.width / 2)),
        y: rect.bottom + 8,
        transform: 'translate(-50%, 0)'
      };
    }
    // Default: Show above, clamped within screen edges
    else {
      tooltipPos = {
        x: Math.max(24, Math.min(screenW - 24, rect.left + rect.width / 2)),
        y: rect.top - 8,
        transform: 'translate(-50%, -100%)'
      };
    }

    activeTooltip = text;
  }

  function handlePointerOver(e: MouseEvent) {
    const target = (e.target as Element)?.closest?.('[title], [data-tooltip]');
    if (!target) return;

    // Intercept native title attribute immediately so OS never shows native box
    if (target.hasAttribute('title')) {
      const titleVal = target.getAttribute('title');
      if (titleVal && titleVal.trim()) {
        target.setAttribute('data-tooltip', titleVal.trim());
      }
      target.removeAttribute('title');
    }

    const tip = target.getAttribute('data-tooltip');
    if (!tip) return;

    if (target === currentTarget) return;
    currentTarget = target;

    if (hoverTimeout) clearTimeout(hoverTimeout);

    // If tooltip is already active elsewhere, transition instantly; otherwise wait 160ms
    const delay = activeTooltip ? 30 : 160;
    hoverTimeout = setTimeout(() => {
      if (currentTarget === target) {
        showTooltip(target, tip);
      }
    }, delay);
  }

  function handlePointerOut(e: MouseEvent) {
    const target = (e.target as Element)?.closest?.('[data-tooltip]');
    if (target && target === currentTarget) {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      activeTooltip = null;
      currentTarget = null;
    }
  }

  function dismiss() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    activeTooltip = null;
    currentTarget = null;
  }

  onMount(() => {
    if (isAndroid()) {
      // On Android, disable all hover hints / tooltips entirely
      const stripTitles = () => {
        document.querySelectorAll('[title]').forEach(el => el.removeAttribute('title'));
      };
      stripTitles();
      const observer = new MutationObserver(() => stripTitles());
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title']
      });
      return () => observer.disconnect();
    }

    window.addEventListener('mouseover', handlePointerOver, { passive: true });
    window.addEventListener('mouseout', handlePointerOut, { passive: true });
    window.addEventListener('pointerdown', dismiss, { passive: true });
    window.addEventListener('scroll', dismiss, { passive: true });

    return () => {
      window.removeEventListener('mouseover', handlePointerOver);
      window.removeEventListener('mouseout', handlePointerOut);
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('scroll', dismiss);
    };
  });
</script>

{#if activeTooltip}
  <div
    class="fixed pointer-events-none z-[9999] px-2.5 py-1 rounded-lg bg-[#121216]/95 border border-white/10 text-neutral-200 text-xs font-sans font-normal tracking-normal shadow-2xl backdrop-blur-md transition-opacity duration-150 animate-tooltip select-none"
    style="left: {tooltipPos.x}px; top: {tooltipPos.y}px; transform: {tooltipPos.transform};"
  >
    {activeTooltip}
  </div>
{/if}

<style>
  @keyframes tooltip-fade {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .animate-tooltip {
    animation: tooltip-fade 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
</style>
