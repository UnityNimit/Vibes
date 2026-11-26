const reducedMotionMql =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

export function prefersReducedMotion(): boolean {
  return !!reducedMotionMql?.matches;
}

export function cancelAnimations(active: Animation[]): void {
  for (let i = 0; i < active.length; i++) {
    try {
      active[i].cancel();
    } catch {
      // Ignore already-cancelled animations
    }
  }
  active.length = 0;
}

/**
 * Runs a GPU-composited Web Animation (transform / opacity only) and cleans up
 * its Animation handle upon completion to prevent Blink EffectStack buildup.
 */
export function runGpuAnim(
  active: Animation[],
  el: HTMLElement | SVGElement | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  onDone?: () => void
): Animation | null {
  if (!el || typeof el.animate !== 'function') {
    onDone?.();
    return null;
  }

  const effectiveOpts: KeyframeAnimationOptions = prefersReducedMotion()
    ? { ...options, duration: 1, delay: 0, fill: 'forwards' }
    : { fill: 'forwards', ...options };

  const anim = el.animate(keyframes, effectiveOpts);
  active.push(anim);

  anim.onfinish = () => {
    onDone?.();
    try {
      anim.cancel();
    } catch {
      // Ignore
    }
    const idx = active.indexOf(anim);
    if (idx !== -1) active.splice(idx, 1);
  };

  return anim;
}
