<script lang="ts">
  import { ChevronDown, Monitor, Moon, Sun } from "lucide-svelte";
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

  function changeTheme(event: Event) {
    const mode = (event.currentTarget as HTMLSelectElement).value as ThemeMode;
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
    <div class="theme-selector">
      <span class="theme-icon" aria-hidden="true">
        {#if themeMode === "system"}
          <Monitor size={17} />
        {:else if themeMode === "light"}
          <Sun size={17} />
        {:else}
          <Moon size={17} />
        {/if}
      </span>
      <select aria-label={t("Theme")} title={t("Theme")} value={themeMode} onchange={changeTheme}>
        <option value="system">{t("System theme")}</option>
        <option value="light">{t("Light theme")}</option>
        <option value="dark">{t("Dark theme")}</option>
      </select>
      <span class="theme-chevron" aria-hidden="true"><ChevronDown size={14} /></span>
    </div>
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

  .theme-selector {
    height: 35px;
    position: relative;
    display: inline-flex;
    align-items: center;
    color: var(--text);
  }

  .theme-selector select {
    appearance: none;
    -webkit-appearance: none;
    height: 35px;
    min-width: 7.9rem;
    padding: 0 1.85rem 0 2rem;
    border-radius: 0.5rem;
    border: 1px solid transparent;
    background: var(--bg-light);
    color: var(--text);
    font: 500 0.86rem var(--font);
    cursor: pointer;
  }

  .theme-selector select:hover {
    border-color: var(--border-light);
  }

  .theme-selector select:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .theme-icon,
  .theme-chevron {
    position: absolute;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    pointer-events: none;
    color: var(--text-2);
  }

  .theme-icon {
    left: 0.65rem;
  }

  .theme-chevron {
    right: 0.45rem;
  }

  @media (max-width: 700px) {
    .container {
      gap: 0.4rem;
    }

    .info-label {
      display: none;
    }

    .theme-selector select {
      min-width: 0;
      width: 3.1rem;
      padding: 0;
      font-size: 0;
      color: transparent;
    }

    .theme-selector select option {
      font-size: 1rem;
      color: var(--text);
    }

    .theme-icon {
      left: 0.48rem;
    }

    .theme-chevron {
      right: 0.25rem;
    }

    .locale :global(button) {
      min-width: 3rem;
    }
  }
</style>
