<script lang="ts">
  import Logo from './Logo.svelte';
  import { getHighQualityThumbCandidates } from '../utils';
  import { networkStore } from '../networkStore.svelte';

  interface Props {
    src?: string | null;
    songId?: string | null;
    alt?: string;
    class?: string;
    iconClass?: string;
    highQuality?: boolean;
  }

  let {
    src = '',
    songId = null,
    alt = '',
    class: className = '',
    iconClass = 'w-4 h-4',
    highQuality = false
  }: Props = $props();

  let candidateUrls = $state<string[]>([]);
  let currentCandidateIndex = $state<number>(0);
  let hasError = $state<boolean>(false);
  let isLetterboxed = $state<boolean>(false);
  let isLoaded = $state<boolean>(false);
  let retryToken = $state<number>(0);
  let autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempts = 0;

  // Initialize or re-initialize candidate URLs when props change
  $effect(() => {
    const urls = getHighQualityThumbCandidates(src, songId, highQuality);
    candidateUrls = urls;
    currentCandidateIndex = 0;
    hasError = urls.length === 0;
    isLetterboxed = false;
    isLoaded = false;
    retryToken = 0;
    retryAttempts = 0;
    clearRetryTimer();
  });

  // Automatically retry loading when network reconnects
  $effect(() => {
    const epoch = networkStore.reconnectEpoch;
    if (epoch > 0 && !isLoaded && candidateUrls.length > 0) {
      retryLoading(true);
    }
  });

  function clearRetryTimer() {
    if (autoRetryTimer) {
      clearTimeout(autoRetryTimer);
      autoRetryTimer = null;
    }
  }

  function retryLoading(immediate = false) {
    clearRetryTimer();
    const run = () => {
      hasError = false;
      currentCandidateIndex = 0;
      isLetterboxed = false;
      isLoaded = false;
      retryToken = Date.now();
    };

    if (immediate) {
      run();
    } else {
      // Exponential backoff retry: 2.5s, 5s, 10s
      const delay = Math.min(10000, 2500 * Math.pow(1.8, Math.min(retryAttempts, 3)));
      retryAttempts++;
      autoRetryTimer = setTimeout(run, delay);
    }
  }

  function handleError() {
    if (currentCandidateIndex < candidateUrls.length - 1) {
      currentCandidateIndex++;
      isLetterboxed = false;
      isLoaded = false;
    } else {
      hasError = true;
      isLoaded = false;
      // If we exhausted all candidates due to network drop or failure, schedule auto-retry
      if (!isLoaded) {
        retryLoading(false);
      }
    }
  }

  function handleLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    // 1. Detect YouTube's 120x90 dummy 404 placeholder:
    if (img.naturalWidth === 120 && img.naturalHeight === 90) {
      handleError();
      return;
    }

    // 2. Detect 4:3 letterboxed YouTube images (e.g. 480x360 with baked-in bars):
    const ratio = img.naturalWidth / img.naturalHeight;
    isLetterboxed = ratio > 1.22 && ratio < 1.45;
    isLoaded = true;
    hasError = false;
    retryAttempts = 0;
    clearRetryTimer();
  }

  let effectiveSrc = $derived.by(() => {
    if (hasError || candidateUrls.length === 0) return '';
    const base = candidateUrls[currentCandidateIndex];
    if (!base) return '';
    if (retryToken === 0 || base.startsWith('file:') || base.startsWith('blob:') || base.startsWith('asset:')) {
      return base;
    }
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}_r=${retryToken}`;
  });
</script>

<div class="relative w-full h-full overflow-hidden bg-[#16171b] flex items-center justify-center select-none flex-shrink-0">
  <!-- Default Logo Art Placeholder (Shown immediately while image is loading or if failed) -->
  <div
    class="absolute inset-0 flex items-center justify-center bg-[#16171b] text-neutral-500 transition-opacity duration-300 pointer-events-none {isLoaded ? 'opacity-0' : 'opacity-100'}"
  >
    <Logo class={iconClass} />
  </div>

  <!-- Real Artwork Image (Fades in smoothly over the placeholder once decoded) -->
  {#if effectiveSrc && !hasError}
    <img
      src={effectiveSrc}
      {alt}
      onload={handleLoad}
      onerror={handleError}
      class="w-full h-full object-cover block transition-all duration-300 {isLoaded ? 'opacity-100' : 'opacity-0'} {isLetterboxed ? 'scale-[1.34]' : 'scale-100'} {className}"
      loading="lazy"
    />
  {/if}
</div>
