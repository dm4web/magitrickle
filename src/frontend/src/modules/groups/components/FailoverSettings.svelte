<script lang="ts">
  import Select from "../../../components/ui/Select.svelte";
  import { interfaces } from "../../../data/interfaces.svelte";
  import { t } from "../../../data/locale.svelte";
  import type { GroupRoutingStatus, InterfaceCheck } from "../../../data/routing-status.svelte";

  import type { Group } from "../../../types";

  type Props = {
    group: Group;
    status?: GroupRoutingStatus;
    onChanged: () => void;
  };

  let { group, status, onChanged }: Props = $props();
  let candidate = $state("");

  let backups = $derived(group.fallback_interfaces ?? []);
  let options = $derived(
    interfaces.list
      .filter(
        (item) =>
          item.id !== "blackhole" && item.id !== group.interface && !backups.includes(item.id),
      )
      .map((item) => ({
        value: item.id,
        label: item.id,
        description: item.name,
      })),
  );

  function checkFor(name: string): InterfaceCheck | undefined {
    return status?.interfaces.find((item) => item.interface === name);
  }

  function addBackup() {
    if (!candidate || candidate === group.interface || backups.includes(candidate)) return;
    group.fallback_interfaces = [...backups, candidate];
    candidate = "";
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
</script>

<section class="failover-settings" aria-label={t("Interface failover")}>
  <div class="failover-intro">
    <div>
      <strong>{t("Interface selection")}</strong>
      <p>{t("The first available interface is selected in priority order.")}</p>
    </div>
    {#if backups.length > 0}
      <span class="failover-summary">
        {#if status}
          {t("Route:")}
          <b
            >{!status.applied
              ? t("Not applied")
              : status.active_interface === "blackhole"
                ? t("Blocked")
                : status.active_interface}</b
          >
          {#if status.selected_interface !== status.active_interface}
            <small>{t("Selected: {interface}", { interface: status.selected_interface })}</small>
          {/if}
        {:else}
          {t("Waiting for status")}
        {/if}
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
          {check?.checked ? (check.healthy ? t("Available") : t("Unavailable")) : t("Waiting")}
        </span>
      {/if}
    </div>
    {#each backups as name, index (name)}
      <div class="interface-entry backup">
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
            {check?.checked ? (check.healthy ? t("Available") : t("Unavailable")) : t("Waiting")}
          </span>
        {/if}
        <div class="interface-actions">
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
            class="remove"
            aria-label={t("Remove backup")}
            title={t("Delete")}
            onclick={() => removeBackup(index)}>×</button
          >
        </div>
      </div>
    {/each}
  </div>

  {#if options.length > 0}
    <div class="add-backup">
      <Select {options} bind:selected={candidate} ariaLabel={t("Select backup interface")} />
      <button type="button" disabled={!candidate} onclick={addBackup}>{t("Add backup")}</button>
    </div>
  {/if}

  <div class="probe-setting">
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
    <p>
      {t(
        "Without a target, only the interface link state is checked. With a target, TCP connectivity is checked through each interface. If all interfaces fail, traffic is blocked using blackhole. Checks run every 5 seconds.",
      )}
    </p>
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

  .failover-intro p,
  .probe-setting p {
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

  .failover-summary small {
    font-size: inherit;
  }

  .interface-stack {
    display: grid;
    gap: 0.5rem;
  }

  .interface-entry {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) 5rem 6rem 7.5rem;
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

  .interface-actions button,
  .add-backup button {
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
  .add-backup button:hover:not(:disabled) {
    border-color: var(--accent);
  }

  .interface-actions button:disabled,
  .add-backup button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .interface-actions button.remove {
    color: var(--red);
  }

  .add-backup {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--layout-gap);
    min-width: 0;
    padding-left: 0;
  }

  .add-backup button {
    min-height: 2rem;
    padding: 0.45rem 0.75rem;
  }

  .probe-setting {
    display: grid;
    gap: 0.55rem;
  }

  .probe-setting label {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .probe-setting input {
    box-sizing: border-box;
    width: min(100%, 17rem);
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

    .add-backup {
      padding-left: 0;
    }
  }
</style>
