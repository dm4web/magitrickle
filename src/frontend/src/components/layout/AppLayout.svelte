<script lang="ts">
  import { onMount } from "svelte";
  import { Tabs } from "bits-ui";

  import { token } from "../../data/auth.svelte";
  import { t } from "../../data/locale.svelte";
  import GroupsView from "../../modules/groups/GroupsView.svelte";
  import SubscriptionsView from "../../modules/subscriptions/SubscriptionsView.svelte";
  import { persistedState } from "../../utils/persisted-state.svelte";
  // import LogsPanel from "../../modules/logs/LogsPanel.svelte";
  // import SettingsPanel from "../../modules/settings/SettingsPanel.svelte";
  import Overlay from "../feedback/Overlay.svelte";
  import ScrollToTop from "../feedback/ScrollToTop.svelte";
  import SnowField from "../feedback/SnowField.svelte";
  import Toast from "../feedback/Toast.svelte";
  import HeaderSettings from "./HeaderSettings.svelte";

  import { version } from "../../data/build";
  import { ArrowUp, LayoutList, Menu, RSS } from "../ui/icons";

  type UpdateStatus = {
    currentVersion: string;
    latestVersion?: string;
    available: boolean;
    releaseUrl?: string;
  };

  let updateStatus = $state<UpdateStatus | null>(null);
  const displayedVersion = $derived(
    updateStatus?.currentVersion && /^\d+$/.test(updateStatus.currentVersion)
      ? updateStatus.currentVersion
      : version,
  );

  onMount(() => {
    let active = true;

    async function checkUpdate() {
      try {
        const headers: Record<string, string> = {};
        if (token.current) headers.Authorization = `Bearer ${token.current}`;
        const response = await fetch("/api/v1/system/update/check", { headers });
        if (!response.ok) return;
        const status = (await response.json()) as UpdateStatus;
        if (active && typeof status.currentVersion === "string") updateStatus = status;
      } catch {
        // The version remains visible when GitHub or the backend is offline.
      }
    }

    void checkUpdate();
    const interval = window.setInterval(() => void checkUpdate(), 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  });

  const lastActiveTab = persistedState("active_tab", "groups");
  let active_tab = $state(lastActiveTab.current);
  let isMenuOpen = $state(false);
  let isRenderCompleteGroups = $state(false);
  let isRenderCompleteSubscriptions = $state(false);
  let isRenderComplete = $derived(isRenderCompleteGroups && isRenderCompleteSubscriptions);

  $effect(() => {
    lastActiveTab.current = active_tab;
  });

  const toggleMenu = () => (isMenuOpen = !isMenuOpen);
  const closeMenu = () => (isMenuOpen = false);

  function handleSearchShortcut(event: KeyboardEvent) {
    if (
      event.isComposing ||
      event.altKey ||
      event.shiftKey ||
      !(event.ctrlKey || event.metaKey) ||
      event.code !== "KeyF"
    ) {
      return;
    }

    if (document.querySelector('[data-dialog-content][data-state="open"]')) return;

    const searchInput = document.querySelector<HTMLInputElement>(
      '[data-tabs-content][data-state="active"] [data-page-search]',
    );
    if (!searchInput) return;

    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
</script>

<svelte:window onkeydown={handleSearchShortcut} />

<Toast />
<Overlay />
<ScrollToTop />
{#if [11, 0, 1].includes(new Date().getMonth())}
  <SnowField visible={isRenderComplete} />
{/if}

<main>
  <Tabs.Root bind:value={active_tab}>
    <nav>
      <div class="nav-left">
        <div class="app-brand" aria-label="MagiTrickle Neo">
          <span class="brand-symbol">M</span>
          <span class="brand-text">
            <span class="brand-name">MagiTrickle Neo</span>
            <span class="brand-meta">
              <span class="brand-version" title={t("Build") + ": " + displayedVersion}
                >{displayedVersion}</span
              >
              {#if updateStatus?.available && updateStatus.releaseUrl}
                <a
                  class="brand-update"
                  href={updateStatus.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${t("Update available")}: ${updateStatus.latestVersion}`}
                  aria-label={`${t("Update available")}: ${updateStatus.latestVersion}`}
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </a>
              {/if}
            </span>
          </span>
        </div>
        <button
          type="button"
          class="mobile-dropdown-btn"
          aria-label={t(isMenuOpen ? "Close menu" : "Open menu")}
          aria-expanded={isMenuOpen}
          onclick={toggleMenu}
        >
          <span class="menu-morph" class:open={isMenuOpen} aria-hidden="true">
            <Menu size={24} />
          </span>
        </button>

        <!-- Tabs container -->
        <div class="tabs-panel" class:open={isMenuOpen}>
          <Tabs.List>
            <Tabs.Trigger value="groups" onclick={closeMenu}>
              <span class="tab-icon"><LayoutList size={24} /></span>
              {t("Groups")}
            </Tabs.Trigger>

            <Tabs.Trigger value="subscriptions" onclick={closeMenu}>
              <span class="tab-icon"><RSS size={24} strokeWidth={3} /></span>
              {t("Subscriptions")}
            </Tabs.Trigger>

            <!--
            <Tabs.Trigger value="settings" onclick={closeMenu}>Settings</Tabs.Trigger>
            <Tabs.Trigger value="logs" onclick={closeMenu}>Logs</Tabs.Trigger>
            -->
          </Tabs.List>
        </div>
      </div>

      <div class="header-settings">
        <HeaderSettings />
      </div>
    </nav>

    <article>
      <Tabs.Content value="groups">
        <GroupsView onRenderComplete={() => (isRenderCompleteGroups = true)} />
      </Tabs.Content>
      <Tabs.Content value="subscriptions">
        <SubscriptionsView onRenderComplete={() => (isRenderCompleteSubscriptions = true)} />
      </Tabs.Content>
      <!-- <Tabs.Content value="settings">...</Tabs.Content> -->
    </article>
  </Tabs.Root>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 2rem;
    padding: 1rem clamp(0.5rem, 2vw, 1.5rem);
  }

  :global([data-tabs-root]) {
    width: 100%;
    max-width: 1280px;
    display: flex;
    flex-direction: column;
  }

  article {
    width: 100%;
  }

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 1280px;
    position: relative;
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 0.4rem 1rem;
    gap: 1rem;
  }

  .nav-left {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 1.3rem;
  }

  .app-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .brand-text {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
  }

  .brand-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--text-2);
  }

  .brand-version {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding: 0.22rem 0.46rem;
    border: 1px solid var(--border-light);
    border-radius: 0.45rem;
    font-weight: 600;
    color: var(--color-success);
    line-height: 1;
  }

  .brand-update {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-success);
    text-decoration: none;
  }

  .brand-update:hover {
    color: var(--color-accent);
  }

  .brand-symbol {
    display: inline-grid;
    place-items: center;
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--color-accent) 18%, var(--color-bg-secondary));
    border: 1px solid color-mix(in srgb, var(--color-accent) 45%, transparent);
    color: var(--color-accent);
  }

  .mobile-dropdown-btn {
    display: none;
  }

  .tabs-panel {
    display: block;
    z-index: 10;
  }

  :global([data-tabs-list]) {
    display: flex;
    flex-direction: row;
    gap: 0.4rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 0.8rem;
    padding: 0.25rem;
  }

  :global([data-tabs-trigger]) {
    padding: 0.45rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 0.6rem;
    font-size: 0.92rem;
    font-family: var(--font);
    background-color: transparent;
    color: var(--text-2);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    white-space: nowrap;
    transition:
      color 0.2s,
      border-color 0.2s;
  }

  .tab-icon {
    display: flex;
  }

  :global([data-tabs-trigger][data-state="active"]) {
    color: var(--color-accent);
    background: var(--color-bg-tertiary);
    border-color: var(--color-border);
  }

  :global([data-tabs-trigger]:hover) {
    color: var(--text);
  }

  :global([data-tabs-content]) {
    padding-top: 1rem;
    outline: none;
  }

  @media (max-width: 980px) {
    .brand-name {
      display: none;
    }
  }

  @media (max-width: 700px) {
    .brand-version {
      font-size: 0.62rem;
    }
  }

  @media (max-width: 700px) {
    .mobile-dropdown-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem;
      border: 0;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .tabs-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--bg-dark);
      border-top: 1px solid var(--border-light);
      border-bottom: 1px solid var(--border-light);
      padding: 1rem 0.7rem;
      display: flex;
      flex-direction: column;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: none;
    }

    .tabs-panel.open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0);
      transition:
        opacity 160ms ease,
        transform 160ms ease,
        visibility 0s linear 0s;
    }

    @supports selector(:has(*)) {
      @starting-style {
        .tabs-panel.open {
          transform: translateY(-10px);
        }
      }
    }

    :global([data-tabs-list]) {
      flex-direction: column;
      gap: 0.35rem;
      align-items: flex-start;
    }

    :global([data-tabs-trigger]) {
      font-size: 0.95rem;
      font-weight: 500;
      border-bottom: none;
      padding: 0;
      width: 100%;
      justify-content: flex-start;
      gap: 0.8rem;
      line-height: 1;
    }
  }

  .menu-morph {
    --icon: 24px;
    --dur-move: 170ms;
    --dur-fade: 110ms;
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --offset: calc(var(--icon) * 7 / 24);
    --xscale: 1.08;

    width: var(--icon);
    height: var(--icon);
    display: inline-block;
  }

  .menu-morph :global(svg) {
    width: var(--icon);
    height: var(--icon);
    display: block;
  }

  .menu-morph :global(path) {
    vector-effect: non-scaling-stroke;
    transform-box: fill-box;
    transform-origin: center;
    will-change: transform, opacity;

    transition-property: transform, opacity;
    transition-duration: var(--dur-move), var(--dur-fade);
    transition-timing-function: var(--ease), ease-out;
  }

  .menu-morph:not(.open) :global(path:nth-child(2)) {
    transition-delay: 60ms, 0ms;
  }

  .menu-morph.open :global(path:nth-child(1)) {
    transform: translateY(var(--offset)) rotate(45deg) scale(var(--xscale));
  }

  .menu-morph.open :global(path:nth-child(3)) {
    transform: translateY(calc(var(--offset) * -1)) rotate(-45deg) scale(var(--xscale));
  }

  .menu-morph.open :global(path:nth-child(2)) {
    opacity: 0;
    transform: scaleX(0);
    transition-delay: 0ms, 0ms;
  }

  @media (prefers-reduced-motion: reduce) {
    .menu-morph :global(path),
    .tabs-panel.open {
      transition: none !important;
    }
  }
</style>
