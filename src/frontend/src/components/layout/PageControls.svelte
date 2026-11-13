<script lang="ts">
  import type { Snippet } from "svelte";

  import { autosave } from "../../data/autosave.svelte";
  import { t } from "../../data/locale.svelte";
  import Button from "../ui/Button.svelte";
  import Tooltip from "../ui/Tooltip.svelte";

  import { Add, Export, Import, Save } from "../ui/icons";

  type Props = {
    search: Snippet;
    addLabel: string;
    canSave: boolean;
    isDirty?: boolean;
    saveFailed?: boolean;
    controlsClass?: string;
    actionsClass?: string;
    onAdd: () => void;
    onSave: () => void;
    saveButtonId?: string;
    saveLabel: string;
    saveState?: "idle" | "saving" | "saved" | "error";
    exportLabel?: string;
    importAccept?: string;
    importLabel?: string;
    onExport?: () => void;
    onImport?: (event: Event) => void;
  };

  let {
    search,
    addLabel,
    actionsClass = "",
    canSave,
    isDirty = false,
    saveFailed = false,
    controlsClass = "",
    exportLabel,
    importAccept = ".mtrickle",
    importLabel,
    onAdd,
    onExport,
    onImport,
    onSave,
    saveButtonId,
    saveLabel,
    saveState = "idle",
  }: Props = $props();

  let importInputRef = $state<HTMLInputElement>();
  let actionsCount = $derived(2 + (onImport ? 1 : 0) + (onExport ? 1 : 0));
  let actionsReserve = $derived(`${actionsCount * 48 + Math.max(0, actionsCount - 1) * 8 + 84}px`);
  let statusText = $derived(
    saveState === "saving"
      ? t("Saving...")
      : saveFailed
        ? t("Save failed")
        : isDirty
          ? t("Unsaved changes")
          : t("Saved"),
  );
  let indicatorState = $derived(
    !autosave.current
      ? "off"
      : saveFailed
        ? "error"
        : saveState === "saving" || isDirty
          ? "pending"
          : "saved",
  );
</script>

<div class={`page-controls ${controlsClass}`} style:--actions-reserve-size={actionsReserve}>
  <div class="page-controls-search">
    {@render search()}
  </div>

  <div class={`page-controls-actions ${actionsClass}`}>
    <div class="save-cluster">
      <Tooltip value={saveLabel}>
        <Button
          small
          onclick={onSave}
          id={saveButtonId}
          class={autosave.current ? "save-trigger autosave-on" : "save-trigger"}
          inactive={!canSave}
        >
          <Save size={22} />
        </Button>
      </Tooltip>
      <span class="save-divider" aria-hidden="true"></span>
      <Tooltip
        value={autosave.current
          ? `${t("Autosave enabled")} · ${statusText}`
          : t("Autosave disabled")}
      >
        <button
          type="button"
          class="autosave-trigger"
          role="switch"
          aria-label={t("Autosave")}
          aria-checked={autosave.current}
          data-save-status={indicatorState}
          onclick={() => (autosave.current = !autosave.current)}
        >
          <span class="autosave-label">{t("Auto")}</span>
          <span class="autosave-dot" data-state={indicatorState} aria-hidden="true"></span>
        </button>
      </Tooltip>
    </div>
    <span class="visually-hidden" role="status" aria-live="polite">
      {autosave.current ? statusText : t("Autosave disabled")}
    </span>

    {#if onImport && importLabel}
      <Tooltip value={importLabel}>
        <input
          bind:this={importInputRef}
          type="file"
          hidden
          accept={importAccept}
          onchange={onImport}
        />
        <Button onclick={() => importInputRef?.click()}>
          <Import size={22} />
        </Button>
      </Tooltip>
    {/if}

    {#if onExport && exportLabel}
      <Tooltip value={exportLabel}>
        <Button onclick={onExport}>
          <Export size={22} />
        </Button>
      </Tooltip>
    {/if}

    <Tooltip value={addLabel}>
      <Button onclick={onAdd}><Add size={22} /></Button>
    </Tooltip>
  </div>
</div>

<style>
  .page-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 0.75rem;
    padding: 0.3rem 0rem;
    margin-bottom: 1rem;
    position: sticky;
    top: 0;
    z-index: 5;
    background: color-mix(in oklab, var(--bg-dark) 92%, var(--bg-dark-extra) 8%);
  }

  .page-controls-search {
    min-width: 0;
  }

  .page-controls-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .save-cluster {
    display: inline-flex;
    align-items: center;
    gap: 0;
    flex-shrink: 0;
    box-sizing: border-box;
    height: 2.7rem;
    border: 1px solid var(--bg-light-extra);
    border-radius: 0.5rem;
    padding: 0;
    background: var(--bg-light);
  }

  .save-cluster :global([role="tooltip"]) {
    height: 100%;
    align-items: stretch;
  }

  .save-cluster:has(:global(button:focus-visible)) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .save-cluster :global(button:focus-visible) {
    outline: none;
  }

  .save-cluster :global(button.save-trigger) {
    border: none;
    background: transparent;
    box-shadow: none;
    box-sizing: border-box;
    width: 2.6rem;
    height: 100%;
    padding: 0;
    border-radius: 0.4rem;
  }

  .save-cluster :global(button.save-trigger:hover:not(.inactive)) {
    background: var(--bg-light-extra);
  }

  .save-cluster :global(button.save-trigger.autosave-on),
  .save-cluster :global(button.save-trigger.autosave-on:hover) {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: var(--text-2);
    opacity: 0.65;
  }

  .save-divider {
    height: 1.5rem;
    width: 1px;
    background: var(--border-light);
  }

  .autosave-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    box-sizing: border-box;
    height: 100%;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    padding: 0 0.5rem;
    color: var(--text-2);
    font: 500 0.75rem var(--font);
    cursor: pointer;
  }

  .autosave-trigger:hover,
  .autosave-trigger:focus-visible {
    background: var(--bg-light-extra);
  }

  .autosave-dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--text-2);
    opacity: 0.7;
  }

  .autosave-dot[data-state="pending"] {
    background: var(--orange);
    opacity: 1;
    animation: autosave-pulse 1.4s ease-in-out infinite;
  }

  @keyframes autosave-pulse {
    0%,
    100% {
      opacity: 0.35;
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--orange) 15%, transparent);
    }
    50% {
      opacity: 1;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--orange) 30%, transparent);
    }
  }

  .autosave-dot[data-state="saved"] {
    background: var(--green);
    opacity: 1;
  }

  .autosave-dot[data-state="error"] {
    background: var(--red);
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .autosave-dot[data-state="pending"] {
      animation: none;
    }
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 570px) {
    .autosave-label {
      display: none;
    }

    .autosave-trigger {
      padding: 0 0.4rem;
    }
    .page-controls {
      display: block;
      padding: 0.3rem 0;
      padding-bottom: 0;
      transition: padding-bottom 220ms cubic-bezier(0.2, 0, 0.2, 1);
      --row-h: 48px;
      --gap: 10px;
      --actions-top: 0px;
      --actions-reserve: var(--actions-reserve-size);
    }

    .page-controls-search {
      padding-right: var(--actions-reserve);
      transition: padding-right 220ms cubic-bezier(0.2, 0, 0.2, 1);
    }

    .page-controls-actions {
      position: absolute;
      right: 0;
      top: var(--actions-top);
      height: var(--row-h);
      transition: top 220ms cubic-bezier(0.2, 0, 0.2, 1);
    }

    .page-controls:has(:global(.search-container:focus-within)),
    .page-controls:has(:global(.search-input:not(:placeholder-shown))) {
      padding-bottom: calc(var(--row-h) + var(--gap));
      --actions-top: calc(var(--row-h) + var(--gap));
      --actions-reserve: 0px;
    }

    .page-controls:has(:global(.search-container:focus-within)) :global(.search-container),
    .page-controls:has(:global(.search-input:not(:placeholder-shown))) :global(.search-container) {
      width: 100%;
    }

    .page-controls:has(:global(.search-container:focus-within))
      :global(.search-container .input-wrapper),
    .page-controls:has(:global(.search-input:not(:placeholder-shown)))
      :global(.search-container .input-wrapper) {
      width: 100%;
    }
  }

  @media (max-width: 700px) {
    .page-controls {
      margin-bottom: 1rem;
    }
  }
</style>
