/**
 * React Bits Animated List Pop-In Animation Action (Dynamic Scroll & Initial Stagger)
 *
 * Implements glitch-free spring-physics pop-in when items enter view:
 * 1. Initial mount: Staggered cascade wave for elements in viewport (35ms delay per item, capped at 280ms).
 * 2. Dynamic scroll: Offscreen items wait in `pop-pending`, then pop in with spring physics
 *    as the user scrolls down (or up) with ZERO delay (0s).
 * 3. Fast-scroll perfection:
 *    - 80px rootMargin pre-triggers items before they cross the visible boundary, eliminating blank gaps.
 *    - Fast fling optimization: items that completely flew past the viewport are settled immediately
 *      without spinning up unneeded animations.
 *    - Once an item has popped in, it is unobserved and stays settled forever, preventing offscreen
 *      disappearing/re-popping glitches.
 * 4. Unified single keyframe: avoids dual-animationend premature cutoff.
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

// Singleton IntersectionObserver with 80px anticipatory trigger margin
let sharedObserver: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const scrollParent = getScrollParent(target);
            const bounds = scrollParent
              ? scrollParent.getBoundingClientRect()
              : { top: 0, bottom: window.innerHeight || 800 };

            const rect = entry.boundingClientRect;

            // If an item already flew completely past the top during high-speed fling:
            if (rect.bottom < bounds.top) {
              target.classList.remove('pop-pending');
              sharedObserver?.unobserve(target);
              continue;
            }

            // Normal or fast scroll entry: pop in immediately with 0s delay
            target.classList.remove('pop-pending');
            target.style.setProperty('--pop-delay', '0s');
            target.classList.add('animate-pop-in');
            sharedObserver?.unobserve(target);

            target.addEventListener(
              'animationend',
              () => {
                target.classList.remove('animate-pop-in');
              },
              { once: true }
            );
          }
        }
      },
      {
        root: null,
        rootMargin: '80px',
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
    // Initial mount cascade wave: 35ms stagger, capped at 280ms
    const delay = Math.min(index * 0.035, 0.28);
    node.style.setProperty('--pop-delay', `${delay.toFixed(3)}s`);
    node.classList.add('animate-pop-in');

    node.addEventListener(
      'animationend',
      () => {
        node.classList.remove('animate-pop-in');
      },
      { once: true }
    );
  } else {
    // Offscreen item waiting for scroll entry
    node.classList.add('pop-pending');
    getObserver().observe(node);
  }

  return {
    destroy() {
      sharedObserver?.unobserve(node);
    }
  };
}
