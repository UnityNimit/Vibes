<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    checked?: boolean;
    defaultChecked?: boolean;
    onChange?: (checked: boolean) => void;
    label?: string;
    disabled?: boolean;
    trackColor?: string;
    trackOnColor?: string;
    thumbColor?: string;
    thumbOnColor?: string;
    width?: number;
    height?: number;
    radius?: number;
    speed?: number;
    stretch?: number;
    hoverScale?: number;
    colorDuration?: number;
    ariaLabel?: string;
    className?: string;
    id?: string;
  }

  let {
    checked = $bindable(undefined),
    defaultChecked = false,
    onChange,
    label = '',
    disabled = false,
    trackColor = '#27272a',
    trackOnColor = 'var(--accent, #ffffff)',
    thumbColor = '',
    thumbOnColor = '',
    width = 50,
    height = 26,
    radius = 13,
    speed = 50,
    stretch = 36,
    hoverScale = 1.035,
    colorDuration = 320,
    ariaLabel = 'Toggle switch',
    className = '',
    id
  }: Props = $props();

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const inset = $derived(Math.max(2.5, Math.round(height * 0.11)));
  const thumb = $derived(height - inset * 2);
  const min = $derived(inset);
  const max = $derived(width - inset - thumb);
  const mid = $derived((min + max) / 2);
  const trackRadius = $derived(Math.min(radius, height / 2));
  const thumbRadius = $derived(Math.max(2, trackRadius - inset));

  const resolvedThumbColor = $derived(thumbColor || '#71717a');
  const resolvedThumbOnColor = $derived(thumbOnColor || 'var(--accent-text, #000000)');

  let inner = $state(false);
  const isControlled = $derived(checked !== undefined);
  const on = $derived(isControlled ? checked : inner);

  let dragging = $state(false);
  let x = $state(0);
  let vx = $state(0);
  let flow = $state(0);
  let flowV = $state(0);
  let swell = $state(1);
  let swellV = $state(0);
  let targetSwell = $state(1);
  let scaleX = $state(1);
  let scaleY = $state(1);

  let trackRef: HTMLElement | null = $state(null);
  let autoId = 'ss-' + Math.random().toString(36).slice(2, 9);
  const buttonId = $derived(id ?? autoId);

  let reduce = $state(false);

  interface Grip {
    id: number;
    grab: number | null;
    moved: boolean;
    startX: number;
    onAtPress: boolean;
    slop: number;
    lastTime: number;
  }
  let grip: Grip | null = null;
  let skipClick = false;

  let raf = 0;
  let lastFrameTime = 0;

  function commit(next: boolean) {
    if (next === on) return;
    if (!isControlled) {
      inner = next;
    } else {
      checked = next;
    }
    onChange?.(next);
  }

  function startLoop() {
    if (!raf && typeof requestAnimationFrame !== 'undefined') {
      lastFrameTime = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;

    const target = on ? max : min;

    if (reduce) {
      x = target;
      vx = 0;
      flow = 0;
      flowV = 0;
      swell = 1;
      swellV = 0;
      scaleX = 1;
      scaleY = 1;
      return;
    }

    // Motion physics constants
    const kx = 170 - (50 - clamp(speed, 0, 100)) * 1.1; // Stiffness
    const dx = 21.5;                                     // Damping
    const mx = 0.9;                                      // Mass

    // Sub-stepping for ultra-high refresh rates & numerical stability
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;

    for (let s = 0; s < steps; s++) {
      if (!dragging) {
        const ax = (-kx * (x - target) - dx * vx) / mx;
        vx += ax * h;
        x += vx * h;
      }

      // Flow spring tracks velocity
      const aflow = (-320 * (flow - vx) - 40 * flowV) / 0.6;
      flowV += aflow * h;
      flow += flowV * h;

      // Swell spring tracks targetSwell
      const aswell = (-520 * (swell - targetSwell) - 34 * swellV) / 0.6;
      swellV += aswell * h;
      swell += swellV * h;
    }

    // Squish stretch calculation
    const gain = clamp(stretch, 0, 100) / 100;
    const stretchOf = 1 + Math.min(0.4, Math.abs(flow) / 600) * gain;
    scaleX = stretchOf * swell;
    scaleY = swell / stretchOf;

    const stillMoving =
      dragging ||
      Math.abs(x - target) > 0.05 ||
      Math.abs(vx) > 0.5 ||
      Math.abs(flow) > 0.5 ||
      Math.abs(swell - targetSwell) > 0.005 ||
      Math.abs(swellV) > 0.05;

    if (!stillMoving) {
      x = target;
      vx = 0;
      flow = 0;
      flowV = 0;
      swell = targetSwell;
      swellV = 0;
      scaleX = targetSwell;
      scaleY = targetSwell;
    } else {
      raf = requestAnimationFrame(tick);
    }
  }

  function localX(clientX: number): number {
    if (!trackRef) return 0;
    const rect = trackRef.getBoundingClientRect();
    const scale = rect.width / (trackRef.offsetWidth || rect.width) || 1;
    return (clientX - rect.left) / scale;
  }

  function down(e: PointerEvent) {
    if (disabled || grip || e.button !== 0) return;
    grip = {
      id: e.pointerId,
      grab: null,
      moved: false,
      startX: e.clientX,
      onAtPress: !!on,
      slop: e.pointerType === 'touch' ? 8 : 4,
      lastTime: performance.now()
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    dragging = true;
    startLoop();
  }

  function move(e: PointerEvent) {
    if (!grip || grip.id !== e.pointerId) return;
    const lx = localX(e.clientX);
    if (grip.grab === null) {
      grip.grab = lx - x;
      return;
    }
    if (!grip.moved && Math.abs(e.clientX - grip.startX) > grip.slop) {
      grip.moved = true;
    }
    if (!grip.moved) return;

    const nx = clamp(lx - grip.grab, min, max);
    const now = performance.now();
    const dt = Math.max(0.001, (now - grip.lastTime) / 1000);
    grip.lastTime = now;
    vx = (nx - x) / dt;
    x = nx;
    commit(nx > mid);
    startLoop();
  }

  function up(e: PointerEvent, cancelled = false) {
    if (!grip || grip.id !== e.pointerId) return;
    const g = grip;
    grip = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (cancelled) {
      commit(g.onAtPress);
    } else if (!g.moved) {
      commit(!on);
    }
    skipClick = true;
    setTimeout(() => {
      skipClick = false;
    }, 0);
    dragging = false;
    startLoop();
  }

  function click() {
    if (skipClick) {
      skipClick = false;
      return;
    }
    if (!disabled) {
      commit(!on);
      startLoop();
    }
  }

  $effect(() => {
    // Sync target on prop changes
    const _ = on;
    startLoop();
  });

  onMount(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduce = mql.matches;
    const handler = (e: MediaQueryListEvent) => { reduce = e.matches; };
    mql.addEventListener('change', handler);

    if (checked === undefined && defaultChecked) {
      inner = defaultChecked;
    }
    x = on ? max : min;
    startLoop();

    return () => {
      mql.removeEventListener('change', handler);
      if (raf) cancelAnimationFrame(raf);
    };
  });
</script>

<span class="inline-flex items-center gap-2.5 {className}">
  <button
    id={buttonId}
    type="button"
    role="switch"
    aria-checked={on}
    aria-disabled={disabled || undefined}
    aria-label={ariaLabel}
    class="group relative m-0 inline-block cursor-pointer touch-pan-y border-0 bg-transparent p-0 outline-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] after:absolute after:-inset-2 after:content-[''] data-[held]:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    data-on={on ? '' : undefined}
    data-held={dragging ? '' : undefined}
    style="
      --ss-w: {width}px;
      --ss-h: {height}px;
      --ss-inset: {inset}px;
      --ss-thumb: {thumb}px;
      --ss-r: {trackRadius}px;
      --ss-thumb-r: {thumbRadius}px;
      --ss-track: {trackColor};
      --ss-track-on: {trackOnColor};
      --ss-thumb-color: {resolvedThumbColor};
      --ss-thumb-on: {resolvedThumbOnColor};
      --ss-fade: {colorDuration}ms;
    "
    onpointerdown={down}
    onpointermove={move}
    onpointerup={(e) => up(e, false)}
    onpointercancel={(e) => up(e, true)}
    onpointerenter={(e) => {
      if (e.pointerType === 'mouse' && !disabled) {
        targetSwell = hoverScale;
        startLoop();
      }
    }}
    onpointerleave={() => {
      targetSwell = 1;
      startLoop();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape' && grip) {
        up(e as any, true);
      }
    }}
    onclick={click}
  >
    <span
      bind:this={trackRef}
      class="relative block [width:var(--ss-w)] [height:var(--ss-h)] [border-radius:var(--ss-r)] [background:var(--ss-track)] [transition:background-color_var(--ss-fade)_ease] group-data-[on]:[background:var(--ss-track-on)] motion-reduce:[transition-duration:1ms]"
    >
      <span
        class="absolute left-0 [top:var(--ss-inset)] [width:var(--ss-thumb)] [height:var(--ss-thumb)] [border-radius:var(--ss-thumb-r)] [background:var(--ss-thumb-color)] [transition:background-color_var(--ss-fade)_ease] group-data-[on]:[background:var(--ss-thumb-on)] motion-reduce:[transition-duration:1ms] pointer-events-none"
        aria-hidden="true"
        style="
          transform: translate3d({x.toFixed(2)}px, 0, 0) scale({scaleX.toFixed(3)}, {scaleY.toFixed(3)});
          transform-origin: center center;
          will-change: transform;
        "
      ></span>
    </span>
  </button>
  {#if label}
    <label for={buttonId} class="cursor-pointer select-none text-sm text-neutral-300">
      {label}
    </label>
  {/if}
</span>
