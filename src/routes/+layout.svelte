<script lang="ts">
  import '../app.css';
  import CustomTooltip from '$lib/components/CustomTooltip.svelte';
  let { children } = $props();
</script>

{@render children()}
<CustomTooltip />
