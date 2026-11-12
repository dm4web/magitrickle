<script lang="ts">
  import { Select } from "bits-ui";
  import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-svelte";
  import { onMount } from "svelte";

  import { authState, token } from "../../data/auth.svelte";
  import { locale, supportedLocales, t } from "../../data/locale.svelte";
  import { hide } from "../../lib/tooltip/tooltip.svelte";
  import InfoDialog from "../InfoDialog.svelte";
  import Button from "../ui/Button.svelte";
  import Tooltip from "../ui/Tooltip.svelte";

  import { Info, Locale, LogOut } from "../ui/icons";

  type ThemeMode = "system" | "light" | "dark";

  let infoIsOpen = $state(false);
  let themeMode = $state<ThemeMode>("system");
  const themeOptions = $derived([
    { value: "system", label: t("System theme") },
    { value: "light", label: t("Light theme") },
    { value: "dark", label: t("Dark theme") },
  ]);

  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const saved = localStorage.getItem("magitrickle-theme");
    themeMode = saved === "light" || saved === "dark" ? saved : "system";
    const updateSystemTheme = () => {
      if (themeMode === "system") {
        document.documentElement.dataset.theme = media.matches ? "dark" : "light";
      }
    };
    document.documentElement.dataset.theme =
      themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
    document.documentElement.lang = supportedLocales.includes(locale.current)
      ? locale.current
      : "en";
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  });

  function changeTheme(mode: string) {
    if (mode !== "system" && mode !== "light" && mode !== "dark") return;
    themeMode = mode;
    document.documentElement.dataset.theme =
      mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    localStorage.setItem("magitrickle-theme", mode);
  }

  const rotateLocale = () => {
    hide();
    const idx = supportedLocales.indexOf(locale.current);
    locale.current = supportedLocales[(idx + 1) % supportedLocales.length];
    document.documentElement.lang = locale.current;
  };
  const flag = (key: string) => (key === "en" ? "🇺🇸" : key === "ru" ? "🇷🇺" : key);

  function logout() {
    token.reset();
  }
</script>

<div class="container">
  <div class="theme-switch">
    <Select.Root type="single" value={themeMode} items={themeOptions} onValueChange={changeTheme}>
      <Select.Trigger class="theme-trigger" aria-label={t("Theme")}>
        <span class="theme-icon" data-mode={themeMode} aria-hidden="true">
          {#if themeMode === "system"}
            <Monitor size={17} />
          {:else if themeMode === "light"}
            <Sun size={17} />
          {:else}
            <Moon size={17} />
          {/if}
        </span>
        <span class="theme-label">
          {themeMode === "system"
            ? t("System theme")
            : themeMode === "light"
              ? t("Light theme")
              : t("Dark theme")}
        </span>
        <span class="theme-chevron" aria-hidden="true"><ChevronDown size={14} /></span>
      </Select.Trigger>
      <Select.Content class="theme-menu" align="end" sideOffset={6} aria-label={t("Theme")}>
        {#each themeOptions as option}
          <Select.Item value={option.value} label={option.label} class="theme-option">
            {#snippet children({ selected })}
              <span class="theme-option-row" class:selected>
                <span class="theme-option-icon" data-mode={option.value} aria-hidden="true">
                  {#if option.value === "system"}
                    <Monitor size={18} />
                  {:else if option.value === "light"}
                    <Sun size={18} />
                  {:else}
                    <Moon size={18} />
                  {/if}
                </span>
                <span class="theme-option-label">{option.label}</span>
                <span class="theme-option-check" aria-hidden="true">
                  {#if selected}<Check size={17} strokeWidth={2.5} />{/if}
                </span>
              </span>
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="info">
    <Tooltip value={t("About this app")}>
      <Button small onclick={() => (infoIsOpen = true)}>
        <div class="info-content">
          <Info size={16} />
          <span class="info-label">{t("About")}</span>
        </div>
      </Button>
    </Tooltip>
  </div>

  <div class="locale">
    <Tooltip value={t("Change Locale")}>
      <Button small onclick={rotateLocale}>
        <div class="locale-content">
          <Locale size={16} />
          {flag(locale.current)}
        </div>
      </Button>
    </Tooltip>
  </div>

  {#if authState.enabled}
    <div class="logout">
      <Tooltip value={t("Logout")}>
        <Button small onclick={logout}>
          <LogOut size={20} />
        </Button>
      </Tooltip>
    </div>
  {/if}
</div>

<InfoDialog bind:open={infoIsOpen} />

<style>
  .container {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }

  .locale,
  .logout,
  .info,
  .theme-switch {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
  }

  .locale :global(button),
  .info :global(button),
  .logout :global(button) {
    height: 35px;
    border-radius: 0.5rem;
    background: var(--bg-light);
  }

  .locale :global(button) {
    min-width: 3.35rem;
  }

  .locale-content,
  .info-content {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    line-height: 1;
    white-space: nowrap;
  }

  :global(.theme-trigger[data-select-trigger]) {
    box-sizing: border-box;
    height: 35px;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.55rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: var(--bg-light);
    color: var(--text);
    cursor: pointer;
    font: 500 0.86rem var(--font);
    white-space: nowrap;
  }

  :global(.theme-trigger[data-select-trigger]:hover),
  :global(.theme-trigger[data-select-trigger][data-state="open"]) {
    border-color: var(--color-border-hover);
    background: var(--bg-light);
  }

  :global(.theme-trigger[data-select-trigger]:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  :global(.theme-menu[data-select-content]) {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.35rem;
    min-width: 11.5rem;
    border-radius: 0.7rem;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    box-shadow: var(--shadow-popover);
    color: var(--text);
    z-index: 100;
  }

  :global(.theme-option[data-select-item]) {
    display: block;
    border: 1px solid transparent;
    border-radius: 0.45rem;
    padding: 0;
    outline: none;
    color: var(--text);
    cursor: pointer;
  }

  :global(.theme-option[data-select-item]:hover:not([data-selected])),
  :global(.theme-option[data-select-item][data-highlighted]:not([data-selected])) {
    background: var(--color-bg-hover);
    border-color: var(--color-border-hover);
  }

  :global(.theme-option[data-select-item][data-selected]) {
    background: color-mix(in srgb, var(--accent) 22%, var(--color-bg-tertiary));
    border-color: color-mix(in srgb, var(--accent) 65%, var(--color-border));
  }

  :global(.theme-option-row) {
    display: grid;
    grid-template-columns: 1.3rem minmax(0, 1fr) 1.2rem;
    align-items: center;
    gap: 0.65rem;
    min-height: 2.35rem;
    padding: 0 0.65rem;
  }

  :global(.theme-option-row.selected .theme-option-label),
  :global(.theme-option-row.selected .theme-option-check) {
    color: var(--accent);
    font-weight: 600;
  }

  .theme-icon,
  .theme-chevron,
  :global(.theme-option-icon),
  :global(.theme-option-check) {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    pointer-events: none;
    color: var(--text-2);
  }

  .theme-icon[data-mode="system"],
  :global(.theme-option-icon[data-mode="system"]) {
    color: var(--color-info);
  }

  .theme-icon[data-mode="light"],
  :global(.theme-option-icon[data-mode="light"]) {
    color: var(--color-warning);
  }

  .theme-icon[data-mode="dark"],
  :global(.theme-option-icon[data-mode="dark"]) {
    color: var(--color-accent);
  }

  .theme-label {
    font: 500 0.86rem var(--font);
    line-height: 1;
    white-space: nowrap;
  }

  @media (max-width: 700px) {
    .container {
      gap: 0.4rem;
    }

    .info-label {
      display: none;
    }

    :global(.theme-trigger[data-select-trigger]) {
      padding: 0 0.4rem;
      gap: 0.25rem;
    }

    .theme-label {
      display: none;
    }

    .locale :global(button) {
      min-width: 3rem;
    }
  }
</style>
