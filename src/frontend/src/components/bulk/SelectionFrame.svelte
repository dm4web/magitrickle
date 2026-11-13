<script lang="ts">
  import type { Snippet } from "svelte";

  import { t } from "../../data/locale.svelte";

  import { Check } from "../ui/icons";

  let {
    selected,
    name,
    inlineSelection = false,
    ontoggle,
    children,
  }: {
    selected: boolean;
    name: string;
    inlineSelection?: boolean;
    ontoggle: () => void;
    children: Snippet;
  } = $props();
</script>

<div class="selection-frame" class:selected class:inline-selection={inlineSelection}>
  {@render children()}
  <button
    class="selection-tail"
    type="button"
    aria-label={`${t("Select item")}: ${name}`}
    aria-pressed={selected}
    title={t(selected ? "Deselect item" : "Select item")}
    onclick={ontoggle}
    ><span class="tail-surface" aria-hidden="true"><Check size={16} strokeWidth={2.5} /></span
    ></button
  >
</div>

<style>
  .selection-frame {
    position: relative;
    border-radius: 0.5rem;
  }
  .selected > :global(.group),
  .selected > :global(.subscription-panel) {
    border-color: var(--accent);
  }
  .selection-tail {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    box-sizing: border-box;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 0.5rem 0 0 0;
    background: transparent;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .inline-selection .selection-tail {
    top: 1.65rem;
    left: 0.5rem;
    transform: translateY(-50%);
    border-radius: 0.35rem;
  }
  .tail-surface {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 1.45rem;
    height: 1.45rem;
    border: 1px solid color-mix(in srgb, var(--text-2) 45%, transparent);
    border-radius: 0.35rem;
    background: color-mix(in srgb, var(--bg-dark) 82%, transparent);
    pointer-events: none;
    color: var(--text-2);
    opacity: 0;
  }
  .selection-frame:hover .tail-surface,
  .selection-tail:focus-visible .tail-surface,
  .selected .tail-surface {
    opacity: 1;
  }
  .selected .tail-surface {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-dark-extra);
  }
  .inline-selection .tail-surface {
    opacity: 1;
  }
  .inline-selection:not(.selected) .tail-surface :global(svg) {
    opacity: 0;
  }
  .selection-tail:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .inline-selection .selection-tail:focus-visible {
    outline: none;
  }
  .inline-selection .selection-tail:focus-visible .tail-surface {
    border: 2px solid var(--accent);
  }
  .inline-selection.selected .selection-tail:focus-visible .tail-surface {
    border-color: var(--text);
  }
  @media (hover: none) {
    .tail-surface {
      opacity: 1;
    }
  }
  @media (max-width: 850px) {
    .inline-selection .selection-tail {
      top: 1.5rem;
    }
  }
</style>
