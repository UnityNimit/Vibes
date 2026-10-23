<script lang="ts">
  import '../app.css';
  import CustomTooltip from '$lib/components/CustomTooltip.svelte';
  let { children } = $props();
</script>

<svelte:window oncontextmenu={(e) => e.preventDefault()} />

{@render children()}
<CustomTooltip />
