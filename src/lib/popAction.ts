/**
 * React Bits Animated List Pop-In Animation Action (Continuous Scroll & Initial Stagger)
 *
 * High-performance mobile & desktop architecture:
 * 1. Initial mount: Staggered cascade wave for elements currently in viewport (30ms stagger, max 250ms).
 * 2. Single-pass entry: Elements entering view animate once, then unobserve to eliminate main-thread layout thrashing.
 * 3. Fast-scroll protection: Immediate rendering when scrolling at high speed (>1400px/s).
 * 4. Zero forced reflows: Eliminates offsetWidth calls during scroll to preserve 120 FPS compositor fluidity.
 */

const scrollParentCache = new WeakMap<HTMLElement, HTMLElement | null>();

function getScrollParent(node: HTMLElement): HTMLElement | null {
  const cached = scrollParentCache.get(node);
  if (cached !== undefined) return cached;

  let cur = node.parentElement;
  while (cur && cur !== document.body) {
    const cl = cur.classList;
    if (cl && (cl.contains('overflow-y-auto') || cl.contains('overflow-auto') || cl.contains('overflow-y-scroll'))) {
      scrollParentCache.set(node, cur);
      return cur;
    }
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY + style.overflowX + style.overflow)) {
      scrollParentCache.set(node, cur);
      return cur;
    }
    cur = cur.parentElement;
  }
  scrollParentCache.set(node, null);
  return null;
}

function isInitiallyVisible(node: HTMLElement, scrollParent: HTMLElement | null): boolean {
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  const vh = window.innerHeight || 800;
  const vw = window.innerWidth || 1200;
  const bounds = scrollParent
    ? scrollParent.getBoundingClientRect()
    : { top: 0, bottom: vh, left: 0, right: vw };

  return (
    rect.top < bounds.bottom &&
    rect.bottom > bounds.top &&
    rect.left < bounds.right &&
    rect.right > bounds.left
  );
}

// Global scroll velocity detector across scrollable containers
let lastScrollTop = 0;
let lastScrollTime = 0;
let isFastScrolling = false;
let scrollStopTimer: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'scroll',
    (e) => {
      const target = (e.target as HTMLElement) || document.documentElement;
      const currentTop = target.scrollTop ?? window.scrollY;
      const now = performance.now();
      const dt = now - lastScrollTime;
      if (dt > 16) {
        const dy = Math.abs(currentTop - lastScrollTop);
        const velocity = (dy / dt) * 1000; // px/sec
        isFastScrolling = velocity > 1400;
        lastScrollTop = currentTop;
        lastScrollTime = now;
      }
      clearTimeout(scrollStopTimer);
      scrollStopTimer = setTimeout(() => {
        isFastScrolling = false;
      }, 90);
    },
    { capture: true, passive: true }
  );
}

// Singleton IntersectionObserver
let sharedObserver: IntersectionObserver | null = null;
let batchTime = 0;
let batchCount = 0;

function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        const now = performance.now();
        if (now - batchTime > 160) {
          batchTime = now;
          batchCount = 0;
        }

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            // Unobserve immediately: element has arrived into view, no need for ongoing checks
            sharedObserver?.unobserve(target);
            target.classList.remove('pop-pending');

            if (isFastScrolling) {
              // High-velocity scroll: render immediately without animation latency
              target.classList.remove('animate-pop-in');
            } else {
              // Normal scroll: stagger slightly if arriving in simultaneous burst
              const delay = batchCount < 6 ? batchCount * 0.03 : 0;
              batchCount++;

              target.style.setProperty('--pop-delay', `${delay.toFixed(3)}s`);
              target.classList.add('animate-pop-in');

              const onEnd = () => {
                target.removeEventListener('animationend', onEnd);
                target.classList.remove('animate-pop-in');
              };
              target.addEventListener('animationend', onEnd, { once: true });
            }
          }
        }
      },
      {
        root: null,
        rootMargin: '60px',
        threshold: 0
      }
    );
  }
  return sharedObserver;
}

export function popItem(node: HTMLElement, index = 0) {
  node.classList.add('pop-item');
  const scrollParent = getScrollParent(node);

  // Check if initially visible in viewport
  if (isInitiallyVisible(node, scrollParent)) {
    // Initial mount cascade wave: 30ms stagger, capped at 250ms
    const delay = Math.min(index * 0.03, 0.25);
    node.style.setProperty('--pop-delay', `${delay.toFixed(3)}s`);
    node.classList.add('animate-pop-in');

    const onEnd = () => {
      node.removeEventListener('animationend', onEnd);
      node.classList.remove('animate-pop-in');
    };
    node.addEventListener('animationend', onEnd, { once: true });

    return {
      destroy() {}
    };
  }

  // Offscreen item waiting for first scroll entry
  node.classList.add('pop-pending');
  getObserver().observe(node);

  return {
    destroy() {
      sharedObserver?.unobserve(node);
    }
  };
}
