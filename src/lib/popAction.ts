/**
 * React Bits Animated List Pop-In Animation Action (Dynamic Scroll & Initial Stagger)
 *
 * Implements spring-physics pop-in when items enter view:
 * 1. Initial mount: Staggered cascade wave for elements in viewport (35ms delay per item, capped at 350ms).
 * 2. Dynamic scroll: Offscreen items wait in `pop-pending`, then pop in with spring physics
 *    as the user scrolls down (or up), even when already pre-loaded into memory/DOM.
 * 3. Hysteresis: Elements only reset to `pop-pending` when safely offscreen (> 80px),
 *    preventing edge flickering or jitter during minor scrolling.
 * 4. Cleanup: Releases GPU compositing layer memory on animationend.
 */

function getScrollParent(node: HTMLElement): HTMLElement | null {
  let cur = node.parentElement;
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY + style.overflowX + style.overflow)) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

// Global batch tracker for micro-staggering burst arrivals
let batchTime = 0;
let batchIndex = 0;

// Singleton IntersectionObserver
let sharedObserver: IntersectionObserver | null = null;
const nodeData = new WeakMap<HTMLElement, { index: number; scrollParent: HTMLElement | null }>();

function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver((entries) => {
      const now = performance.now();
      if (now - batchTime > 250) {
        batchTime = now;
        batchIndex = 0;
      }

      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const data = nodeData.get(target);
        const scrollParent = data?.scrollParent ?? getScrollParent(target);

        if (entry.isIntersecting) {
          // Trigger pop animation if currently pending or not animating
          if (target.classList.contains('pop-pending') || !target.classList.contains('animate-pop-in')) {
            target.classList.remove('pop-pending');

            // Stagger delay if part of a simultaneous batch, otherwise instant (0s)
            const delay = Math.min(batchIndex * 0.035, 0.35);
            batchIndex++;

            target.style.setProperty('--pop-delay', `${delay.toFixed(3)}s`);
            target.classList.add('animate-pop-in');
            target.style.willChange = 'transform, opacity';

            const onEnd = () => {
              target.removeEventListener('animationend', onEnd);
              target.classList.remove('animate-pop-in');
              target.style.willChange = 'auto';
            };
            target.addEventListener('animationend', onEnd, { once: true });
          }
        } else {
          // Offscreen check with 80px hysteresis deadband
          const rect = entry.boundingClientRect;
          const bounds = scrollParent
            ? scrollParent.getBoundingClientRect()
            : {
                top: 0,
                bottom: window.innerHeight || 800,
                left: 0,
                right: window.innerWidth || 1200
              };

          const isFarOffscreen =
            rect.bottom < bounds.top - 80 ||
            rect.top > bounds.bottom + 80 ||
            rect.right < bounds.left - 80 ||
            rect.left > bounds.right + 80;

          if (isFarOffscreen) {
            target.classList.remove('animate-pop-in');
            target.classList.add('pop-pending');
            target.style.willChange = 'auto';
          }
        }
      }
    }, {
      root: null,
      threshold: 0
    });
  }
  return sharedObserver;
}

export function popItem(node: HTMLElement, index = 0) {
  node.classList.add('pop-item');
  const scrollParent = getScrollParent(node);
  nodeData.set(node, { index, scrollParent });

  // Check if initially visible in viewport
  const rect = node.getBoundingClientRect();
  const vh = window.innerHeight || 800;
  const vw = window.innerWidth || 1200;
  const bounds = scrollParent
    ? scrollParent.getBoundingClientRect()
    : { top: 0, bottom: vh, left: 0, right: vw };

  const isInitiallyVisible =
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < bounds.bottom &&
    rect.bottom > bounds.top &&
    rect.left < bounds.right &&
    rect.right > bounds.left;

  if (isInitiallyVisible) {
    // Initial mount cascade wave
    const delay = Math.min(index * 0.035, 0.35);
    node.style.setProperty('--pop-delay', `${delay.toFixed(3)}s`);
    node.classList.add('animate-pop-in');
    node.style.willChange = 'transform, opacity';

    const onEnd = () => {
      node.removeEventListener('animationend', onEnd);
      node.classList.remove('animate-pop-in');
      node.style.willChange = 'auto';
    };
    node.addEventListener('animationend', onEnd, { once: true });
  } else {
    // Offscreen item waiting for scroll entry
    node.classList.add('pop-pending');
  }

  // Observe for scroll transitions
  getObserver().observe(node);

  return {
    update(newIndex = 0) {
      const data = nodeData.get(node);
      if (data) {
        data.index = newIndex;
      }
    },
    destroy() {
      sharedObserver?.unobserve(node);
      nodeData.delete(node);
    }
  };
}
