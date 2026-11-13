<script lang="ts">
  import { Collapsible } from "bits-ui";
  import { GitBranch, Route } from "lucide-svelte";
  import { createEventDispatcher, getContext, tick } from "svelte";
  import { slide } from "svelte/transition";

  import Pagination from "../../../components/Pagination.svelte";
  import Button from "../../../components/ui/Button.svelte";
  import DropdownMenu from "../../../components/ui/DropdownMenu.svelte";
  import EditableField from "../../../components/ui/EditableField.svelte";
  import Switch from "../../../components/ui/Switch.svelte";
  import Tooltip from "../../../components/ui/Tooltip.svelte";
  import { t } from "../../../data/locale.svelte";
  import { routingStatus } from "../../../data/routing-status.svelte";
  import { GROUPS_STORE_CONTEXT, type GroupsStore } from "../groups.svelte";
  import FailoverSettings from "./FailoverSettings.svelte";
  import GroupDuplicateMenu from "./GroupDuplicateMenu.svelte";
  import RuleRow from "./RuleRow.svelte";

  import {
    Add,
    Copy,
    Delete,
    Dots,
    Grip,
    GroupCollapse,
    GroupExpand,
    ImportList,
    SortAsc,
    SortDesc,
    SortNeutral,
  } from "../../../components/ui/icons";
  import { routeIndicator } from "../../../data/route-indicator";
  import { draggable, droppable } from "../../../lib/dnd";
  import { type Rule } from "../../../types";
  import { copyRulePatternsToClipboard } from "../../../utils/copy-rule-patterns";
  import { defaultRule } from "../../../utils/defaults";
  import { type SortDirection, type SortField } from "../../../utils/rule-sorter";

  type Props = {
    group_index: number;
    selectionActive?: boolean;
    selected?: boolean;
    ontoggleSelection?: () => void;
  };

  let {
    group_index,
    selectionActive = false,
    selected = false,
    ontoggleSelection,
  }: Props = $props();

  const store = getContext<GroupsStore>(GROUPS_STORE_CONTEXT);
  if (!store) {
    throw new Error("GroupsStore context is missing");
  }
  const dispatch = createEventDispatcher();

  const PAGE_SIZE = 50;
  let currentPage = $state(1);

  let client_width = $state<number>(Infinity);
  let is_desktop = $derived(client_width > 668);

  let group = $derived(store.data[group_index]);
  let searchActive = $derived(store.searchActive);
  let searchQuery = $derived(store.normalizedSearch);
  let isGroupSearchMatched = $derived(group ? store.searchMatchedGroupIds.has(group.id) : false);
  let groupNameHighlightParts = $derived(
    group && isGroupSearchMatched
      ? store.getSearchHighlightParts(group.name ?? "", searchQuery)
      : undefined,
  );
  let visibleRuleIndices = $derived(store.visibilityMap.get(group_index));
  let searchManuallyCollapsed = $state(false);
  let searchManuallyExpanded = $state(false);
  let searchAutoExpanded = $derived(
    searchActive &&
      store.visibilityMap.has(group_index) &&
      Array.isArray(visibleRuleIndices) &&
      visibleRuleIndices.length > 0,
  );
  let effectiveOpen = $derived(
    group
      ? searchAutoExpanded
        ? !searchManuallyCollapsed
        : searchActive && isGroupSearchMatched
          ? searchManuallyExpanded
        : (store.open_state[group.id] ?? false)
      : false,
  );
  let duplicateConflicts = $derived(group ? store.getDuplicateConflictsForGroup(group.id) : []);
  let showFailoverSettings = $state(false);
  let liveRouting = $derived(routingStatus.groups.find((entry) => entry.id === group?.id));
  let routeView = $derived(routeIndicator(liveRouting, group?.enable ?? false));
  let activeBackup = $derived(
    Boolean(
      group?.enable &&
      liveRouting?.applied &&
      liveRouting.active_interface !== group.interface &&
      (group.fallback_interfaces ?? []).includes(liveRouting.active_interface) &&
      routeView.kind === "healthy",
    ),
  );
  let explicitBlackhole = $derived(
    group?.interface === "blackhole" &&
      group.enable &&
      liveRouting?.applied &&
      liveRouting.active_interface === "blackhole",
  );

  $effect(() => {
    // Search expansion is temporary; a changed query starts with results open.
    searchQuery;
    searchManuallyCollapsed = false;
    searchManuallyExpanded = false;
  });

  function toggleOpen(nextOpen: boolean) {
    if (!group) return;
    if (searchAutoExpanded) {
      searchManuallyCollapsed = !nextOpen;
      return;
    }
    if (searchActive && isGroupSearchMatched) {
      searchManuallyExpanded = nextOpen;
      return;
    }
    store.open_state[group.id] = nextOpen;
  }

  function copyRulePatterns() {
    if (group) copyRulePatternsToClipboard(group.rules);
  }

  type GroupDnD = {
    group_id: string;
    group_index: number;
    name: string;
    color: string;
    count: number;
  };

  function createGroupDragPreview(
    headerEl: HTMLElement,
    name: string,
    color: string,
    count: number,
  ) {
    const badge = document.createElement("div");
    badge.style.cssText =
      "position:fixed;top:-1000px;left:-1000px;pointer-events:none;z-index:2147483647;transform:translateZ(0);font:600 13px/1.2 var(--font, -apple-system, system-ui, Segoe UI, Roboto, sans-serif);color:var(--text,#e5e7eb);";

    const inner = document.createElement("div");
    inner.style.cssText =
      "display:flex;align-items:center;gap:.55rem;padding:.42rem .7rem;border-radius:.7rem;background:var(--bg-light,rgba(30,30,36,.92));border:1px solid var(--bg-light-extra,rgba(255,255,255,.12));box-shadow:0 6px 18px rgba(0,0,0,.35);backdrop-filter:saturate(120%) blur(6px);";

    const colorBadge = document.createElement("span");
    colorBadge.style.cssText =
      "display:inline-block;width:10px;height:10px;border-radius:999px;box-shadow:0 0 0 1px rgba(255,255,255,.25) inset;";
    colorBadge.style.background = color || "#888";
    inner.appendChild(colorBadge);

    const title = document.createElement("span");
    title.textContent = name || "group";
    title.style.cssText =
      "max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    inner.appendChild(title);

    const cnt = document.createElement("span");
    cnt.textContent = `• ${count}`;
    cnt.style.opacity = "0.8";
    inner.appendChild(cnt);

    const gripClone = headerEl.querySelector(".group-grip")?.cloneNode(true) as HTMLElement | null;
    if (gripClone) {
      gripClone.style.cssText += "opacity:.9;display:flex;align-items:center;margin-left:.25rem;";
      inner.appendChild(gripClone);
    }

    badge.appendChild(inner);
    document.body.appendChild(badge);
    return badge;
  }

  let totalRulesCount = $derived(
    searchActive && Array.isArray(visibleRuleIndices)
      ? visibleRuleIndices.length
      : (group?.rules.length ?? 0),
  );

  let usePagination = $derived(totalRulesCount > PAGE_SIZE);

  $effect(() => {
    if (searchActive && visibleRuleIndices) {
      currentPage = 1;
    }
  });

  $effect(() => {
    const maxPage = Math.ceil(totalRulesCount / PAGE_SIZE);
    if (currentPage > maxPage && maxPage > 0) {
      currentPage = 1;
    }
  });

  let displayedRules = $derived.by(() => {
    if (!group) return [];
    let rulesToRender: { rule: Rule; originalIndex: number }[] = [];

    let sourceIndices: number[] = [];
    if (searchActive && Array.isArray(visibleRuleIndices)) {
      sourceIndices = visibleRuleIndices;
    } else {
      sourceIndices = new Array(group.rules.length);
      for (let i = 0; i < group.rules.length; i++) sourceIndices[i] = i;
    }

    let startIndex = 0;
    let endIndex = sourceIndices.length;

    if (usePagination) {
      startIndex = (currentPage - 1) * PAGE_SIZE;
      endIndex = Math.min(startIndex + PAGE_SIZE, sourceIndices.length);
    }

    for (let i = startIndex; i < endIndex; i++) {
      const idx = sourceIndices[i];
      if (group.rules[idx]) {
        rulesToRender.push({ rule: group.rules[idx], originalIndex: idx });
      }
    }
    return rulesToRender;
  });

  let reportedFinished = false;
  $effect(() => {
    if (searchActive) return;
    if (!reportedFinished && (totalRulesCount === 0 || displayedRules.length > 0)) {
      reportedFinished = true;
      store.handleGroupFinished();
    }
  });

  let sortField = $state<SortField | null>(null);
  let sortDirection = $state<SortDirection>("asc");
  let initialOrderIds = $state<string[] | null>(null);

  function handleSort(field: SortField) {
    if (!group) return;
    if (!initialOrderIds) {
      initialOrderIds = group.rules.map((rule) => rule.id);
    }

    if (sortField === field && sortDirection === "desc") {
      sortField = null;
      sortDirection = "asc";

      if (initialOrderIds) {
        store.restoreGroupRulesOrder(group_index, initialOrderIds);
      }
      return;
    }

    if (sortField === field) {
      sortDirection = "desc";
    } else {
      sortField = field;
      sortDirection = "asc";
    }

    store.sortGroupRules(group_index, field, sortDirection);
  }

  function findRulePosition(ruleId: string) {
    if (!group) return -1;
    if (searchActive && Array.isArray(visibleRuleIndices)) {
      const visibleIndex = visibleRuleIndices.findIndex((idx) => group.rules[idx]?.id === ruleId);
      if (visibleIndex >= 0) return visibleIndex;
    }
    return group.rules.findIndex((rule) => rule.id === ruleId);
  }

  function handleDuplicateConflictClick(groupId: string, ruleId: string) {
    const highlighted = store.highlightRuleTemporarily(ruleId);
    if (!highlighted) return;
    store.requestDuplicateRuleFocus(groupId, ruleId);
  }

  $effect(() => {
    if (!group) return;
    const request = store.duplicateFocusRequest;
    if (!request || request.groupId !== group.id) return;

    void (async () => {
      const rulePosition = findRulePosition(request.ruleId);
      if (rulePosition >= 0) {
        currentPage = Math.floor(rulePosition / PAGE_SIZE) + 1;
      }

      store.open_state[group.id] = true;

      await tick();

      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          const row = document.querySelector<HTMLElement>(
            `.rule[data-group-uuid="${group.id}"][data-uuid="${request.ruleId}"]`,
          );
          if (row) {
            const rect = row.getBoundingClientRect();
            const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!inView) {
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          } else {
            const targetGroup = document.querySelector<HTMLElement>(
              `.group[data-uuid="${group.id}"]`,
            );
            if (targetGroup) {
              const rect = targetGroup.getBoundingClientRect();
              const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
              if (!inView) {
                targetGroup.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          }
        });
      }

      store.consumeDuplicateRuleFocus(request.groupId, request.ruleId, request.nonce);
    })();
  });

  $effect(() => {
    group?.rules.length;
    if (sortField === null) {
      initialOrderIds = null;
    }
  });
</script>

<svelte:window bind:innerWidth={client_width} />

{#if group}
  <div
    class="group"
    role="listitem"
    data-uuid={group.id}
    use:draggable={{
      data: {
        group_id: group.id,
        group_index,
        name: group.name,
        color: group.color,
        count: group.rules.length,
      } as GroupDnD,
      scope: "group",
      handle: ".group-grip",
      effects: { effectAllowed: "move", dropEffect: "move" },
      dragImage: (node) =>
        createGroupDragPreview(
          (node.querySelector(".group-header") ?? node) as HTMLElement,
          group.name,
          group.color || "",
          group.rules.length,
        ),
    }}
  >
    <Collapsible.Root open={effectiveOpen} onOpenChange={toggleOpen}>
      <div
        class="group-header"
        data-group-index={group_index}
        use:droppable={{
          data: { rule_id: "", rule_index: 0, group_id: group.id, group_index },
          scope: "rule",
          canDrop: (src) => src.group_id !== group.id || src.rule_index !== 0,
          onDrop: (source) =>
            store.changeRuleIndex(source.group_index, source.rule_index, group_index, 0),
        }}
      >
        <div class="group-left">
          {#if selectionActive}
            <button
              class="group-color"
              style="background: {group.color}"
              type="button"
              aria-label={`${t("Toggle selection")}: ${group.name}`}
              aria-pressed={selected}
              title={t(selected ? "Deselect item" : "Select item")}
              onclick={ontoggleSelection}
            ></button>
          {:else}
            <label class="group-color" style="background: {group.color}">
              <input type="color" bind:value={group.color} />
            </label>
          {/if}

          <div class="group-grip" title={t("Drag Group")}>
            <Grip />
          </div>

          <div class="group-name-wrap">
            <div class="group-name-field">
              <EditableField
                kind="group"
                placeholder={t("group name...")}
                bind:value={group.name}
                highlightParts={groupNameHighlightParts}
                warning={duplicateConflicts.length > 0}
              />
            </div>
            {#if duplicateConflicts.length > 0}
              <GroupDuplicateMenu
                conflicts={duplicateConflicts}
                isRuleHighlighted={store.isRuleHighlighted}
                onConflictClick={handleDuplicateConflictClick}
              />
            {/if}
          </div>
        </div>

        <div class="group-actions">
          <span
            class="route-status"
            class:route-healthy={routeView.kind === "healthy"}
            class:route-degraded={routeView.kind === "error"}
            class:route-neutral={routeView.kind === "pending" || routeView.kind === "disabled"}
            class:route-blackhole={explicitBlackhole}
            title={activeBackup
              ? t("Backup interface active")
              : routeView.kind === "error"
                ? t(routeView.label)
                : liveRouting
                  ? t("Current choice: {interface}", {
                      interface: liveRouting.active_interface || "—",
                    })
                  : t("Waiting for routing status")}
            aria-label={activeBackup
              ? `${t("Backup interface active")}: ${liveRouting?.active_interface}`
              : explicitBlackhole
                ? "blackhole"
                : t(routeView.label)}
          >
            {#if activeBackup}
              <GitBranch class="route-backup-icon" size={14} aria-hidden="true" />
            {/if}
            {explicitBlackhole ? "blackhole" : t(routeView.label)}
          </span>
          <Tooltip value={t(group.enable ? "Disable Group" : "Enable Group")}>
            <Switch class="enable-group" bind:checked={group.enable} />
          </Tooltip>

          <Tooltip value={t("Configure interfaces")}>
            <Button
              small
              class="failover-action"
              aria-label={t("Configure interfaces")}
              aria-expanded={showFailoverSettings}
              onclick={() => (showFailoverSettings = !showFailoverSettings)}
            >
              <Route size={20} />
            </Button>
          </Tooltip>

          {#if is_desktop}
            <Tooltip value={t("Delete Group")}>
              <Button small onclick={() => store.deleteGroup(group_index)}>
                <Delete size={20} />
              </Button>
            </Tooltip>
            <Tooltip value={t("Add Rule")}>
              <Button
                small
                onclick={() => {
                  store.addRuleToGroup(group_index, defaultRule(), true);
                  store.open_state[group.id] = true;
                }}
              >
                <Add size={20} />
              </Button>
            </Tooltip>
            <Tooltip value={t("Import Rule List")}>
              <Button small onclick={() => dispatch("importRules")}>
                <ImportList size={20} />
              </Button>
            </Tooltip>
            <Tooltip value={t("Copy to Clipboard")}>
              <Button small onclick={copyRulePatterns}>
                <Copy size={20} />
              </Button>
            </Tooltip>
          {:else}
            <DropdownMenu>
              {#snippet trigger()}
                <Dots size={20} />
              {/snippet}
              {#snippet item1()}
                <Button
                  general
                  onclick={() => {
                    store.addRuleToGroup(group_index, defaultRule(), true);
                    store.open_state[group.id] = true;
                  }}
                >
                  <div class="dd-icon"><Add size={20} /></div>
                  <div class="dd-label">{t("Add Rule")}</div>
                </Button>
              {/snippet}
              {#snippet item2()}
                <Button general onclick={() => dispatch("importRules")}>
                  <div class="dd-icon"><ImportList size={20} /></div>
                  <div class="dd-label">{t("Import Rule List")}</div>
                </Button>
              {/snippet}
              {#snippet item3()}
                <Button general onclick={copyRulePatterns}>
                  <div class="dd-icon"><Copy size={20} /></div>
                  <div class="dd-label">{t("Copy to Clipboard")}</div>
                </Button>
              {/snippet}
              {#snippet item4()}
                <Button general onclick={() => store.deleteGroup(group_index)}>
                  <div class="dd-icon"><Delete size={20} /></div>
                  <div class="dd-label">{t("Delete Group")}</div>
                </Button>
              {/snippet}
            </DropdownMenu>
          {/if}

          <Tooltip value={t(effectiveOpen ? "Collapse Group" : "Expand Group")}>
            <Collapsible.Trigger>
              {#if effectiveOpen}
                <GroupCollapse size={20} />
              {:else}
                <GroupExpand size={20} />
              {/if}
            </Collapsible.Trigger>
          </Tooltip>
        </div>
      </div>

      {#if showFailoverSettings}
        <FailoverSettings {group} status={liveRouting} onChanged={() => store.markDataRevision()} />
      {/if}

      <Collapsible.Content>
        <div transition:slide={searchActive ? { duration: 0 } : {}}>
          {#if totalRulesCount > 0}
            <div class="group-rules-header">
              <div class="group-rules-header-column total">
                #{totalRulesCount}
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="group-rules-header-column clickable" onclick={() => handleSort("name")}>
                {t("Name")}
                <div class="sort-icon">
                  {#if sortField === "name" && sortDirection === "desc"}
                    <SortAsc size={16} />
                  {:else if sortField === "name"}
                    <SortDesc size={16} />
                  {:else}
                    <SortNeutral size={16} />
                  {/if}
                </div>
              </div>
              <div class="group-rules-header-column">{t("Type")}</div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="group-rules-header-column clickable"
                onclick={() => handleSort("pattern")}
              >
                {t("Pattern")}
                <div class="sort-icon">
                  {#if sortField === "pattern" && sortDirection === "desc"}
                    <SortAsc size={16} />
                  {:else if sortField === "pattern"}
                    <SortDesc size={16} />
                  {:else}
                    <SortNeutral size={16} />
                  {/if}
                </div>
              </div>
              <div class="group-rules-header-column">{t("Enabled")}</div>
            </div>
          {/if}
          <div class="group-rules">
            {#if totalRulesCount > 0}
              {#each displayedRules as { rule, originalIndex }, i (rule.id)}
                <RuleRow
                  key={rule.id}
                  bind:rule={group.rules[originalIndex]}
                  rule_index={originalIndex}
                  {group_index}
                  rule_id={rule.id}
                  group_id={group.id}
                  isDuplicate={store.isRuleDuplicate(rule.id)}
                  isHighlighted={store.isRuleHighlighted(rule.id)}
                  style={i % 2 ? "" : "background-color: var(--bg-light)"}
                />
              {/each}
            {/if}
          </div>
          {#if usePagination}
            <Pagination totalItems={totalRulesCount} pageSize={PAGE_SIZE} bind:currentPage />
          {/if}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
{/if}

<style>
  .group-actions :global(button.failover-action[aria-expanded="true"]) {
    color: var(--accent);
    background: var(--bg-dark);
    border-color: var(--bg-light-extra);
  }
  .route-status {
    color: var(--green);
    font-size: 0.78rem;
    font-weight: 600;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .route-status.route-degraded {
    color: var(--red);
  }
  .group {
    & {
      background-color: var(--bg-medium);
      border-radius: 0.5rem;
      border: 1px solid var(--bg-light-extra);
      transition:
        transform 0.12s ease,
        opacity 0.12s ease,
        box-shadow 0.12s ease;
    }
  }

  .group-header {
    & {
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-sizing: border-box;
      height: 3.3rem;
      padding: 0.5rem;
      border-radius: 0.5rem;
      background-color: var(--bg-light);
      position: relative;
    }
  }

  .group-left {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex: 1 1 auto;
    min-width: 0;
  }

  .group-color {
    & {
      display: inline-block;
      padding: 0;
      border: 0;
      width: 2rem;
      height: 100%;
      border-top-left-radius: calc(0.5rem - 1px);
      border-bottom-left-radius: calc(0.5rem - 1px);
      position: absolute;
      left: 0;
      top: 0;
      overflow: hidden;
      cursor: pointer;
    }

    & input {
      margin-left: 0.5rem;
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
  }

  .group-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2.2rem;
    color: var(--text-2);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-user-drag: none;
  }
  .group-grip:hover {
    color: var(--text);
  }

  .group-name-wrap {
    display: flex;
    position: relative;
    align-items: center;
    margin-left: 0;
    min-width: 0;
    flex: 1 1 auto;
  }

  .group-name-wrap :global([data-dropdown-menu-trigger]) {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    z-index: 2;
  }

  .group-name-field {
    position: relative;
    width: auto;
    max-width: 100%;
    min-width: 0;
    flex: 0 1 auto;
  }

  .group-actions {
    & {
      display: grid;
      grid-template-columns: 12rem 2rem repeat(6, 2.2rem);
      align-items: center;
      justify-content: end;
      flex: 0 0 auto;
      gap: 0.3rem;
    }
  }

  .group-actions .route-status {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    justify-self: end;
    text-align: right;
    margin-right: 0.45rem;
    min-width: 0;
    font-weight: 600;
    font-size: 0.84rem;
  }

  .group-actions .route-healthy {
    color: var(--green);
  }

  .group-actions .route-degraded {
    color: var(--red);
  }

  .group-actions .route-neutral {
    color: var(--text-2);
  }

  .group-actions .route-blackhole {
    color: var(--orange);
  }

  .group-actions .route-status :global(.route-backup-icon) {
    flex: 0 0 auto;
    color: var(--accent);
  }

  .group-actions :global([role="tooltip"] > button:not([data-switch-root])),
  .group-actions :global([data-collapsible-trigger]) {
    box-sizing: border-box;
    width: 2.2rem;
    height: 2.2rem;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .group-rules-header {
    display: grid;
    grid-template-columns: 4rem 2.1fr 1fr 3fr 1fr;
    justify-content: center;
    align-items: center;

    font-size: 0.9rem;
    color: var(--text-2);
    padding-top: 0.6rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid var(--bg-light-extra);
  }

  .group-rules-header-column {
    & {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &.total {
      justify-content: start;
      margin-left: 0.5rem;
    }

    &.total :global(svg) {
      position: relative;
      top: -1px;
    }
  }

  .clickable {
    cursor: pointer;
    user-select: none;
    transition: color 0.12s ease;
  }

  .clickable:hover {
    color: var(--text);
  }

  .sort-icon {
    margin-left: 0.4rem;
    display: flex;
    align-items: center;
    color: var(--text-2);
  }

  :global {
    [data-collapsible-trigger] {
      & {
        color: var(--text-2);
        background-color: transparent;
        border: 1px solid transparent;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.4rem;
        border-radius: 0.5rem;
        cursor: pointer;
      }

      &:hover {
        background-color: var(--bg-dark);
        color: var(--text);
        border: 1px solid var(--bg-light-extra);
      }
    }
  }

  input[type="color"] {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background: transparent;
    width: auto;
    height: 0;
    padding: 0;
    border: none;
    cursor: pointer;
  }

  @media (max-width: 850px) {
    .group-header {
      display: flex;
      flex-direction: column;
      align-items: start;
      justify-content: center;
      height: auto;
      padding: 0.4rem 0.5rem;
    }

    .group-left {
      flex: none;
      width: 100%;
    }

    .group-name-wrap {
      width: calc(100% - 2rem);
      margin-left: 2rem;
    }

    .group-grip {
      display: none;
    }

    .group-actions {
      display: flex;
      width: calc(100% - 2rem);
      min-width: 0;
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 0.25rem;
      margin-left: 2rem;
    }

    .group-actions .route-status {
      margin-right: 0.45rem;
      flex: 0 1 auto;
      text-align: right;
    }

    .group-rules-header {
      height: 1px;
      & .group-rules-header-column {
        display: none;
      }
    }
  }
  .clickable {
    cursor: pointer;
    user-select: none;
    transition: color 0.12s ease;
  }
  .clickable:hover {
    color: var(--text);
  }

  .sort-icon {
    margin-left: 0.4rem;
    display: flex;
    align-items: center;
    color: var(--text-2);
  }
</style>
