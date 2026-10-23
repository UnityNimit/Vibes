<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { player } from '../player.svelte';

  interface Props {
    height?: number;
    amplitude?: number;
    wavelength?: number;
    thumbRadius?: number;
    class?: string;
  }

  let {
    height = 24,
    amplitude = 3.5,
    wavelength = 26,
    thumbRadius = 5,
    class: className = ''
  }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let containerEl: HTMLDivElement | null = $state(null);

  let isDragging = $state(false);
  let isHovering = $state(false);
  let dragRatio = $state(0);
  let currentRatio = $state(0);

  let rafId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let wavePhase = 0;
  let lastFrameTime = performance.now();

  function getAccentColor(): string {
    if (typeof window === 'undefined') return '#ffffff';
    const computed = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return computed || '#ffffff';
  }

  function updateCanvasResolution() {
    if (!canvasEl || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width);
    const h = height;

    if (w <= 0) return;

    if (canvasEl.width !== w * dpr || canvasEl.height !== h * dpr) {
      canvasEl.width = w * dpr;
      canvasEl.height = h * dpr;
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
    }
  }

  function updateProgress(dt: number) {
    if (isDragging) {
      currentRatio = dragRatio;
      return;
    }

    const duration = player.duration > 0 ? player.duration : 0;
    if (duration <= 0) {
      currentRatio = 0;
      return;
    }

    const targetRatio = Math.min(1, Math.max(0, player.currentTime / duration));

    if (!player.isPlaying) {
      // When paused, smoothly damp towards target
      currentRatio += (targetRatio - currentRatio) * Math.min(1, dt * 16);
      return;
    }

    // When playing: advance monotonically without jitter
    const diff = targetRatio - currentRatio;
    if (Math.abs(diff) > 0.03 || diff < -0.005) {
      // Snappy seek/rewind recovery
      currentRatio = targetRatio;
    } else {
      // Frame-rate independent monotonic step + soft convergence
      const nominalStep = (dt * (player.audio?.playbackRate || 1)) / duration;
      const correction = diff * Math.min(1, dt * 8);
      currentRatio = Math.min(1, Math.max(0, currentRatio + nominalStep + correction));
    }
  }

  function drawWave(now: number) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvasEl.width;
    const canvasH = canvasEl.height;
    const centerY = canvasH / 2;

    ctx.clearRect(0, 0, width, canvasH);

    // Padding ensures the circular thumb and rounded line caps never clip outside the canvas
    const maxThumbR = (thumbRadius + 1.5) * dpr;
    const pad = Math.ceil(maxThumbR + 2 * dpr);
    const startX = pad;
    const endX = Math.max(startX, width - pad);
    const usableWidth = endX - startX;

    const ratio = Math.min(1, Math.max(0, isDragging ? dragRatio : currentRatio));
    const progressX = startX + ratio * usableWidth;
    const accentColor = getAccentColor();
    const trackWidth = 3 * dpr;

    // 1. Draw unplayed straight line (right of thumb to endX)
    if (progressX < endX) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = trackWidth;
      ctx.lineCap = 'round';
      ctx.moveTo(progressX, centerY);
      ctx.lineTo(endX, centerY);
      ctx.stroke();
    }

    // 2. Draw elapsed waving path (from startX to thumb)
    if (progressX > startX) {
      ctx.beginPath();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = trackWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const amp = amplitude * dpr;
      const wlen = wavelength * dpr;
      const taperDist = 16 * dpr;

      ctx.moveTo(startX, centerY);
      const step = Math.max(1, 1.5 * dpr);

      for (let x = startX; x <= progressX; x += step) {
        const distFromStart = x - startX;
        const distFromEnd = progressX - x;
        const taper = Math.min(1, Math.min(distFromStart, distFromEnd) / taperDist);
        const y = centerY + Math.sin(((x - startX) / wlen) * Math.PI * 2 - wavePhase) * amp * taper;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(progressX, centerY);
      ctx.stroke();
    }

    // 3. Draw smooth thumb knob
    const r = (isHovering || isDragging ? thumbRadius + 1.2 : thumbRadius) * dpr;
    ctx.beginPath();
    ctx.arc(progressX, centerY, r, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Dark ring for crisp boundary
    ctx.beginPath();
    ctx.arc(progressX, centerY, r + 0.5 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 0.8 * dpr;
    ctx.stroke();
  }

  function animate(now: number) {
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    // Advance wave phase smoothly when playing
    if (player.isPlaying && !isDragging) {
      wavePhase += dt * 5.0;
    }

    updateProgress(dt);
    drawWave(now);
    rafId = requestAnimationFrame(animate);
  }

  function handlePointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    canvasEl.setPointerCapture(e.pointerId);
    isDragging = true;
    updateSeekFromPointer(e);
  }

  function handlePointerMove(e: PointerEvent) {
    if (isDragging) {
      updateSeekFromPointer(e);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (isDragging) {
      if (canvasEl && canvasEl.hasPointerCapture(e.pointerId)) {
        canvasEl.releasePointerCapture(e.pointerId);
      }
      isDragging = false;
      const seekTime = dragRatio * (player.duration || 0);
      player.seek(seekTime);
    }
  }

  function updateSeekFromPointer(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const padCss = thumbRadius + 2;
    const usableWidth = rect.width - 2 * padCss;
    if (usableWidth <= 0) {
      dragRatio = 0;
      return;
    }
    const x = Math.max(0, Math.min(usableWidth, e.clientX - rect.left - padCss));
    dragRatio = x / usableWidth;
  }

  onMount(() => {
    updateCanvasResolution();

    if (containerEl) {
      resizeObserver = new ResizeObserver(() => {
        updateCanvasResolution();
      });
      resizeObserver.observe(containerEl);
    }

    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    if (resizeObserver) resizeObserver.disconnect();
  });
</script>

<div class="relative w-full flex items-center cursor-pointer touch-none select-none {className}" bind:this={containerEl}>
  <canvas
    bind:this={canvasEl}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onmouseenter={() => (isHovering = true)}
    onmouseleave={() => (isHovering = false)}
    class="w-full block"
  ></canvas>
</div>
