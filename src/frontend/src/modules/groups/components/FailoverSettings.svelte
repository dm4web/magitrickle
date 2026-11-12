<script lang="ts">
  import Select from "../../../components/ui/Select.svelte";
  import { interfaces } from "../../../data/interfaces.svelte";
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
      .filter((item) =>
        item.id !== "blackhole" &&
        item.id !== group.interface &&
        !backups.includes(item.id),
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

<section class="failover-settings" aria-label="Резервирование интерфейсов">
  <div class="failover-intro">
    <div>
      <strong>Выбор интерфейса</strong>
      <p>Используется первый доступный интерфейс в порядке приоритета.</p>
    </div>
    {#if backups.length > 0}
      <span class="failover-summary">
        {#if status}
          Маршрут:
          <b>{!status.applied ? "Не применён" : status.active_interface === "blackhole" ? "Заблокирован" : status.active_interface}</b>
          {#if status.selected_interface !== status.active_interface}
            <small>Выбран: {status.selected_interface}</small>
          {/if}
        {:else}
          Ожидание статуса
        {/if}
      </span>
    {/if}
  </div>

  <div class="interface-stack">
    <div class="interface-entry primary">
      <span class="interface-position">1</span>
      <span class="interface-name">{group.interface || "Не выбран"}</span>
      <span class="interface-role">Основной</span>
      {#if checkFor(group.interface)}
        {@const check = checkFor(group.interface)}
        <span class:online={check?.healthy && check?.checked} class:offline={check?.checked && !check?.healthy} class="interface-health"
          title={check?.detail ?? ""}>
          {check?.checked ? (check.healthy ? "Доступен" : "Недоступен") : "Ожидание"}
        </span>
      {/if}
    </div>
    {#each backups as name, index (name)}
      <div class="interface-entry backup">
        <span class="interface-position">{index + 2}</span>
        <span class="interface-name">{name}</span>
        <span class="interface-role">Резерв</span>
        {#if checkFor(name)}
          {@const check = checkFor(name)}
          <span class:online={check?.healthy && check?.checked} class:offline={check?.checked && !check?.healthy} class="interface-health"
            title={check?.detail ?? ""}>
            {check?.checked ? (check.healthy ? "Доступен" : "Недоступен") : "Ожидание"}
          </span>
        {/if}
        <div class="interface-actions">
          <button type="button" aria-label="Повысить приоритет" title="Выше" disabled={index === 0} onclick={() => moveBackup(index, -1)}>↑</button>
          <button type="button" aria-label="Понизить приоритет" title="Ниже" disabled={index === backups.length - 1} onclick={() => moveBackup(index, 1)}>↓</button>
          <button type="button" class="remove" aria-label="Удалить резерв" title="Удалить" onclick={() => removeBackup(index)}>×</button>
        </div>
      </div>
    {/each}
  </div>

  <div class="add-backup">
    <Select
      options={options}
      bind:selected={candidate}
      ariaLabel="Выбрать резервный интерфейс"
    />
    <button type="button" disabled={!candidate} onclick={addBackup}>Добавить резерв</button>
  </div>

  <div class="probe-setting">
    <label for={"check-target-" + group.id}>Проверка доступности (TCP, необязательно)</label>
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
      Без адреса проверяется только состояние интерфейса. С адресом — TCP-подключение через каждый интерфейс.
      При отказе всех интерфейсов используется blackhole. Проверки выполняются каждые 5 секунд.
    </p>
  </div>
</section>

<style>
  .failover-settings {
    margin: 0.65rem;
    padding: 1rem;
    border: 1px solid var(--bg-light-extra);
    border-radius: 0.75rem;
    background: var(--bg-dark);
    display: grid;
    gap: 0.9rem;
  }
  .failover-intro { display: flex; align-items: flex-start; gap: 1rem; justify-content: space-between; }
  .failover-intro strong { font-size: 1rem; }
  .failover-intro p, .probe-setting p { margin: 0.3rem 0 0; color: var(--text-2); font-size: 0.83rem; line-height: 1.4; }
  .failover-summary { font-size: 0.8rem; color: var(--text-2); white-space: nowrap; }
  .failover-summary b { color: var(--text); }
  .interface-stack { display: grid; gap: 0.4rem; }
  .interface-entry { display: flex; align-items: center; min-height: 2.35rem; gap: 0.6rem; padding: 0.3rem 0.55rem; background: var(--bg-medium); border-radius: 0.5rem; border: 1px solid var(--bg-light-extra); }
  .interface-entry.primary { border-color: var(--accent); }
  .interface-position { color: var(--text-2); font-size: 0.8rem; width: 1rem; text-align: center; }
  .interface-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .interface-role { margin-left: auto; color: var(--text-2); font-size: 0.75rem; }
  .interface-health { font-size: 0.72rem; color: var(--text-2); white-space: nowrap; }
  .interface-health.online { color: var(--green); }
  .interface-health.offline { color: var(--red); }
  .interface-actions { display: flex; gap: 0.2rem; }
  .interface-actions button, .add-backup button {
    cursor: pointer; background: var(--bg-light-extra); border: 1px solid var(--border-light); border-radius: 0.4rem; color: var(--text); padding: 0.24rem 0.5rem; font: inherit;
  }
  .interface-actions button:disabled, .add-backup button:disabled { cursor: default; opacity: 0.4; }
  .interface-actions button.remove { color: var(--red); }
  .add-backup { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; }
  .add-backup button { padding: 0.42rem 0.75rem; }
  .probe-setting { display: grid; gap: 0.4rem; }
  .probe-setting label { font-weight: 600; font-size: 0.85rem; }
  .probe-setting input { width: min(100%, 17rem); box-sizing: border-box; font: inherit; border-radius: 0.5rem; color: var(--text); background: var(--bg-medium); border: 1px solid var(--bg-light-extra); padding: 0.5rem 0.7rem; }
  .probe-setting input:focus { outline: 1px solid var(--accent); }
  @media(max-width: 700px) {
    .failover-intro { flex-direction: column; }
    .interface-entry { flex-wrap: wrap; }
    .interface-role { margin-left: 0; }
    .interface-health { margin-left: auto; }
    .interface-actions { margin-left: auto; }
  }
</style>
