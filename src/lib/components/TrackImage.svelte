<script lang="ts">
  import Logo from './Logo.svelte';
  import { getHighQualityThumbCandidates } from '../utils';

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

  $effect(() => {
    const urls = getHighQualityThumbCandidates(src, songId, highQuality);
    candidateUrls = urls;
    currentCandidateIndex = 0;
    hasError = urls.length === 0;
    isLetterboxed = false;
    isLoaded = false;
  });

  function handleError() {
    if (currentCandidateIndex < candidateUrls.length - 1) {
      currentCandidateIndex++;
      isLetterboxed = false;
      isLoaded = false;
    } else {
      hasError = true;
      isLoaded = false;
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
  }

  let currentSrc = $derived(
    !hasError && candidateUrls.length > 0 ? candidateUrls[currentCandidateIndex] : ''
  );
</script>

<div class="relative w-full h-full overflow-hidden bg-[#16171b] flex items-center justify-center select-none flex-shrink-0">
  <!-- Default Logo Art Placeholder (Shown immediately while image is loading or if failed) -->
  <div
    class="absolute inset-0 flex items-center justify-center bg-[#16171b] text-neutral-500 transition-opacity duration-300 pointer-events-none {isLoaded ? 'opacity-0' : 'opacity-100'}"
  >
    <Logo class={iconClass} />
  </div>

  <!-- Real Artwork Image (Fades in smoothly over the placeholder once decoded) -->
  {#if currentSrc && !hasError}
    <img
      src={currentSrc}
      {alt}
      onload={handleLoad}
      onerror={handleError}
      class="w-full h-full object-cover block transition-all duration-300 {isLoaded ? 'opacity-100' : 'opacity-0'} {isLetterboxed ? 'scale-[1.34]' : 'scale-100'} {className}"
      loading="lazy"
    />
  {/if}
</div>
