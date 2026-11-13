<script lang="ts">
  export type HighlightPart = { text: string; matched: boolean };

  type Props = {
    value: string;
    placeholder?: string;
    kind?: "group" | "rule" | "pattern";
    highlightParts?: HighlightPart[];
    warning?: boolean;
    element?: HTMLInputElement;
    oninput?: (event: Event) => void;
    onfocusout?: (event: FocusEvent) => void;
  };

  let {
    value = $bindable(),
    placeholder = "",
    kind = "rule",
    highlightParts,
    warning = false,
    element = $bindable(),
    oninput,
    onfocusout,
  }: Props = $props();
</script>

<div class:group={kind === "group"} class="editable-field">
  <input
    type="text"
    bind:value
    bind:this={element}
    {placeholder}
    class="editable-input"
    class:group-name={kind === "group"}
    class:table-input={kind !== "group"}
    class:pattern-input={kind === "pattern"}
    class:search-text-hidden={Boolean(highlightParts)}
    class:has-warning={warning}
    {oninput}
    {onfocusout}
  />
  {#if highlightParts}
    <div
      class="search-highlight-overlay"
      class:group-name-search-overlay={kind === "group"}
      class:has-warning={warning}
      aria-hidden="true"
    >
      {#each highlightParts as part}
        {#if part.matched}
          <mark>{part.text}</mark>
        {:else}
          {part.text}
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .editable-field {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .editable-field.group {
    width: fit-content;
    max-width: 100%;
  }

  .editable-input {
    appearance: none;
    box-sizing: border-box;
    display: block;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0.3rem 0.65rem;
    border: 1px solid transparent;
    border-radius: 0.45rem;
    outline: none;
    box-shadow: none;
    background: transparent;
    color: var(--text);
    font: 400 1rem/1.3 var(--font);
    transition:
      background-color 150ms ease,
      border-color 150ms ease;
  }

  .editable-input.group-name {
    field-sizing: content;
    width: auto;
    min-width: 7ch;
    max-width: 100%;
    font-size: 1.3rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .editable-input.has-warning {
    padding-right: 2.2rem;
  }

  .editable-input:hover:not(:focus) {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .editable-input:focus,
  .editable-input:focus-visible {
    outline: none;
    box-shadow: none;
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-light));
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }

  :global(.editable-input.invalid),
  :global(.editable-input.invalid:focus-visible) {
    border-color: color-mix(in srgb, var(--red) 75%, transparent);
  }

  .editable-input::selection {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .editable-input.search-text-hidden {
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: var(--text);
  }

  .editable-input.search-text-hidden:focus,
  .editable-input.search-text-hidden:focus-visible {
    color: var(--text);
    -webkit-text-fill-color: var(--text);
  }

  .editable-input:focus + .search-highlight-overlay {
    display: none;
  }

  .search-highlight-overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    box-sizing: border-box;
    padding: 0.3rem 0.65rem;
    color: var(--text);
    font: 400 1rem/1.3 var(--font);
    white-space: pre;
    text-overflow: ellipsis;
  }

  .group-name-search-overlay {
    font-size: 1.3rem;
    font-weight: 600;
    line-height: 1.25;
  }

  .search-highlight-overlay.has-warning {
    padding-right: 2.2rem;
  }

  .search-highlight-overlay mark {
    background: color-mix(in oklab, var(--yellow) 34%, transparent);
    box-shadow:
      inset 0 0 0 1px color-mix(in oklab, var(--yellow) 62%, transparent),
      0 1px 0 color-mix(in oklab, var(--yellow) 30%, transparent);
    color: inherit;
    border-radius: 0.22rem;
  }
</style>
