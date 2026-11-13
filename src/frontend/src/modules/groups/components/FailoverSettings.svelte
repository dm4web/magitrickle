<script lang="ts">
  import { Crown, Plus, X } from "lucide-svelte";

  import { interfaces } from "../../../data/interfaces.svelte";
  import { t } from "../../../data/locale.svelte";
  import type { GroupRoutingStatus, InterfaceCheck } from "../../../data/routing-status.svelte";

  import { Grip } from "../../../components/ui/icons";
  import { routeIndicator } from "../../../data/route-indicator";
  import { draggable, droppable } from "../../../lib/dnd";
  import type { Group } from "../../../types";

  type Props = {
    group: Group;
    status?: GroupRoutingStatus;
    onChanged: () => void;
  };

  let { group, status, onChanged }: Props = $props();
  let backups = $derived(group.fallback_interfaces ?? []);
  let routeView = $derived(routeIndicator(status, group.enable));
  let allInterfaces = $derived.by(() => {
    const list = [...interfaces.list];
    for (const id of [group.interface, ...backups]) {
      if (id && !list.some((item) => item.id === id)) list.push({ id });
    }
    if (!list.some((item) => item.id === "blackhole")) list.push({ id: "blackhole" });
    return list;
  });
  let inactive = $derived(
    allInterfaces.filter((item) => item.id !== group.interface && !backups.includes(item.id)),
  );

  function checkFor(name: string): InterfaceCheck | undefined {
    return status?.interfaces.find((item) => item.interface === name);
  }

  function checkLabel(check: InterfaceCheck | undefined): string {
    if (!check?.checked) return t("Testing");
    if (check.interface === "blackhole") return t("Blocked");
    return t(check.healthy ? "Available" : "Unavailable");
  }

  function addBackup(name: string) {
    if (
      !name ||
      name === "blackhole" ||
      group.interface === "blackhole" ||
      name === group.interface ||
      backups.includes(name)
    )
      return;
    group.fallback_interfaces = [...backups, name];
    onChanged();
  }

  function makePrimary(name: string) {
    if (!name || name === group.interface) return;
    const previous = group.interface;
    group.interface = name;
    group.fallback_interfaces =
      name === "blackhole"
        ? []
        : [
            ...(previous === "blackhole" ? [] : [previous]),
            ...backups.filter((item) => item !== name && item !== previous && item !== "blackhole"),
          ].filter(Boolean);
    onChanged();
  }

  function removeBackup(index: number) {
    group.fallback_interfaces = backups.filter((_, i) => i !== index);
    onChanged();
  }

  function moveBackup(index: number, direction: -1 | 1) {
    const next = [...backups];
    const other = index + direction;
    if (other < 0 || other >= next.length) return;
    [next[index], next[other]] = [next[other], next[index]];
    group.fallback_interfaces = next;
    onChanged();
  }

  function reorderBackup(source: { name: string }, target: { name: string }) {
    if (source.name === target.name) return;
    const next = [...backups];
    const from = next.indexOf(source.name);
    const to = next.indexOf(target.name);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, source.name);
    group.fallback_interfaces = next;
    onChanged();
  }

  function createBackupDragPreview(name: string): HTMLElement {
    const preview = document.createElement("div");
    preview.textContent = "⠿  " + name;
    preview.style.cssText =
      "position:fixed;top:-1000px;left:-1000px;z-index:2147483647;pointer-events:none;" +
      "padding:.45rem .7rem;border-radius:.5rem;background:var(--bg-medium);" +
      "border:1px solid var(--accent);color:var(--text);" +
      "font:600 .9rem var(--font);box-shadow:var(--shadow-popover);";
    return preview;
  }
</script>

<section class="failover-settings" aria-label={t("Interface failover")}>
  <div class="failover-intro">
    <div>
      <strong>{t("Interface selection")}</strong>
      <p>{t("The first available interface is selected in priority order.")}</p>
    </div>
    {#if status}
      <span class="failover-summary">
        {t("Route:")}
        <b
          class:route-error={routeView.kind === "error"}
          class:route-good={routeView.kind === "healthy"}
        >
          {t(routeView.label)}
        </b>
      </span>
    {/if}
  </div>

  <div class="interface-stack">
    <div class="interface-entry primary">
      <span class="interface-position">1</span>
      <span class="interface-name">{group.interface || t("Not selected")}</span>
      <span class="interface-role">{t("Primary")}</span>
      {#if checkFor(group.interface)}
        {@const check = checkFor(group.interface)}
        <span
          class:online={check?.healthy && check?.checked}
          class:offline={check?.checked && !check?.healthy}
          class="interface-health"
          title={check?.detail ?? ""}
        >
          {checkLabel(check)}
        </span>
      {:else}
        <span class="interface-health">{t("Testing")}</span>
      {/if}
    </div>
    {#each group.interface === "blackhole" ? [] : backups as name, index (name)}
      <div
        class="interface-entry backup"
        use:draggable={{
          data: { name },
          scope: `backup-interface:${group.id}`,
          handle: ".backup-grip",
          effects: { effectAllowed: "move", dropEffect: "move" },
          dragImage: () => createBackupDragPreview(name),
        }}
        use:droppable={{
          data: { name },
          scope: `backup-interface:${group.id}`,
          canDrop: (source: { name: string }) => source.name !== name,
          dropEffect: "move",
          onDrop: (source: { name: string }) => reorderBackup(source, { name }),
        }}
      >
        <span class="interface-position">{index + 2}</span>
        <span class="interface-name">{name}</span>
        <span class="interface-role">{t("Backup")}</span>
        {#if checkFor(name)}
          {@const check = checkFor(name)}
          <span
            class:online={check?.healthy && check?.checked}
            class:offline={check?.checked && !check?.healthy}
            class="interface-health"
            title={check?.detail ?? ""}
          >
            {checkLabel(check)}
          </span>
        {:else}
          <span class="interface-health">{t("Testing")}</span>
        {/if}
        <div class="interface-actions">
          <span class="backup-grip" title={t("Drag interface")} aria-label={t("Drag interface")}>
            <Grip size={18} />
          </span>
          <button
            type="button"
            aria-label={t("Increase priority")}
            title={t("Higher")}
            disabled={index === 0}
            onclick={() => moveBackup(index, -1)}>↑</button
          >
          <button
            type="button"
            aria-label={t("Decrease priority")}
            title={t("Lower")}
            disabled={index === backups.length - 1}
            onclick={() => moveBackup(index, 1)}>↓</button
          >
          <button
            type="button"
            aria-label={t("Make primary")}
            title={t("Make primary")}
            onclick={() => makePrimary(name)}
          >
            <Crown size={15} />
          </button>
          <button
            type="button"
            class="remove"
            aria-label={t("Deactivate interface")}
            title={t("Deactivate interface")}
            onclick={() => removeBackup(index)}><X size={16} /></button
          >
        </div>
      </div>
    {/each}
    {#each inactive as item (item.id)}
      <div class="interface-entry inactive">
        <span class="interface-position" aria-hidden="true">—</span>
        <span class="interface-name">{item.id}</span>
        <span class="interface-role">{item.id === "blackhole" ? t("Blocked") : t("Inactive")}</span>
        <span class="interface-health"></span>
        <div class="interface-actions">
          <button
            type="button"
            aria-label={t("Make primary")}
            title={t("Make primary")}
            onclick={() => makePrimary(item.id)}
          >
            <Crown size={15} />
          </button>
          {#if item.id !== "blackhole" && group.interface !== "blackhole"}
            <button
              type="button"
              aria-label={t("Add backup")}
              title={t("Add backup")}
              onclick={() => addBackup(item.id)}
            >
              <Plus size={17} />
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="probe-setting">
    <div class="probe-field probe-target">
      <label for={"check-target-" + group.id}>{t("TCP connectivity check (optional)")}</label>
      <input
        id={"check-target-" + group.id}
        type="text"
        placeholder="1.1.1.1:443"
        spellcheck="false"
        value={group.check_target ?? ""}
        oninput={(event) => {
          group.check_target = event.currentTarget.value.trim();
          onChanged();
        }}
      />
    </div>
    <div class="probe-field">
      <label for={"check-interval-" + group.id}>{t("Check interval (s)")}</label>
      <input
        id={"check-interval-" + group.id}
        type="number"
        min="1"
        max="300"
        step="1"
        value={group.check_interval || 5}
        oninput={(event) => {
          const input = event.currentTarget;
          if (!input.value || !input.validity.valid) return;
          group.check_interval = Number(input.value);
          onChanged();
        }}
      />
    </div>
    <div class="probe-field">
      <label for={"check-timeout-" + group.id}>{t("TCP timeout (s)")}</label>
      <input
        id={"check-timeout-" + group.id}
        type="number"
        min="0.1"
        max="30"
        step="0.1"
        value={group.check_timeout || 1.5}
        oninput={(event) => {
          const input = event.currentTarget;
          if (!input.value || !input.validity.valid) return;
          group.check_timeout = Number(input.value);
          onChanged();
        }}
      />
    </div>
  </div>
</section>

<style>
  .failover-settings {
    --layout-gap: 0.75rem;
    margin: 0.65rem;
    padding: 1rem;
    border: 1px solid var(--bg-light-extra);
    border-radius: 0.75rem;
    background: var(--bg-dark);
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .failover-intro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .failover-intro > div {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .failover-intro strong {
    font-size: 1rem;
  }

  .failover-intro p {
    margin: 0;
    color: var(--text-2);
    font-size: 0.83rem;
    line-height: 1.5;
  }

  .failover-summary {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-2);
  }

  .failover-summary b {
    color: var(--text);
  }

  .interface-stack {
    display: grid;
    gap: 0.5rem;
  }

  .interface-entry {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) 5.5rem 6.5rem 12rem;
    align-items: center;
    column-gap: var(--layout-gap);
    height: 2.75rem;
    min-height: 2.75rem;
    padding: 0 0.75rem;
    box-sizing: border-box;
    background: var(--bg-medium);
    border: 1px solid var(--bg-light-extra);
    border-radius: 0.5rem;
  }

  .interface-entry.primary {
    border-color: var(--accent);
  }

  .interface-entry.inactive {
    opacity: 0.58;
    background: var(--bg-dark);
    border-style: dashed;
  }

  .interface-entry.inactive:hover,
  .interface-entry.inactive:focus-within {
    opacity: 1;
  }

  :global(.interface-entry.backup.dragover) {
    border-color: var(--accent);
    background: var(--bg-light);
  }

  :global(.interface-entry.backup.dragging) {
    opacity: 0.5;
  }

  .interface-position {
    grid-column: 1;
    color: var(--text-2);
    font-size: 0.8rem;
    text-align: center;
  }

  .interface-name {
    grid-column: 2;
    min-width: 0;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .route-error {
    color: var(--red) !important;
  }

  .route-good {
    color: var(--green) !important;
  }

  .interface-role {
    grid-column: 3;
    color: var(--text-2);
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .interface-health {
    grid-column: 4;
    font-size: 0.72rem;
    color: var(--text-2);
    white-space: nowrap;
  }

  .interface-health.online {
    color: var(--green);
  }

  .interface-health.offline {
    color: var(--red);
  }

  .interface-actions {
    grid-column: 5;
    display: flex;
    justify-content: flex-end;
    gap: 0.25rem;
  }

  .backup-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 1.3rem;
    width: 1.3rem;
    height: 1.9rem;
    color: var(--text-2);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }

  .backup-grip:hover {
    color: var(--text);
  }

  .backup-grip:active {
    cursor: grabbing;
  }

  .interface-actions button,
  .interface-actions button {
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-light);
    border-radius: 0.4rem;
    background: var(--bg-light-extra);
    color: var(--text);
    font: inherit;
  }

  .interface-actions button {
    box-sizing: border-box;
    flex: 0 0 1.9rem;
    width: 1.9rem;
    height: 1.9rem;
    min-width: 0;
    min-height: 0;
    padding: 0;
    line-height: 1;
  }

  .interface-actions button:hover:not(:disabled),
  .interface-actions button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .interface-actions button:disabled,
  .interface-actions button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .interface-actions button.remove {
    color: var(--red);
  }

  .probe-setting {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) minmax(7rem, 9rem) minmax(7rem, 9rem);
    align-items: end;
    gap: 0.75rem;
  }

  .probe-field {
    display: grid;
    gap: 0.55rem;
    min-width: 0;
  }

  .probe-setting label {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .probe-setting input {
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--bg-light-extra);
    border-radius: 0.5rem;
    background: var(--bg-medium);
    color: var(--text);
    font: inherit;
  }

  .probe-setting input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent);
  }

  @media (max-width: 700px) {
    .probe-setting {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    .probe-target {
      grid-column: 1 / -1;
    }
    .failover-settings {
      padding: 0.85rem;
    }

    .failover-intro {
      flex-direction: column;
    }

    .failover-summary {
      justify-content: flex-start;
    }

    .interface-entry {
      grid-template-columns: 1rem minmax(0, 1fr) auto;
      height: 4.8rem;
      min-height: 4.8rem;
      gap: 0.25rem 0.6rem;
      padding: 0.35rem 0.65rem;
    }

    .interface-position {
      grid-column: 1;
      grid-row: 1;
    }

    .interface-name {
      grid-column: 2;
      grid-row: 1;
    }

    .interface-role {
      grid-column: 3;
      grid-row: 1;
      text-align: right;
    }

    .interface-health {
      grid-column: 2;
      grid-row: 2;
    }

    .interface-actions {
      grid-column: 3;
      grid-row: 2;
    }
  }
</style>
