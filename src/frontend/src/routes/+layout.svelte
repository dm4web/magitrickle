<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { initOverlayScrollbar } from "../utils/overlay-scrollbar";
  import "../app.css";

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    initOverlayScrollbar({
      targetSelector:
        "[data-tabs-content][data-state='active'] .group-list, [data-tabs-content][data-state='active'] .subscription-list",
    });
  });
</script>

{@render children()}
