import { persistedState } from "../utils/persisted-state.svelte";

import en from "../locales/en.json" with { type: "json" };
import ru from "../locales/ru.json" with { type: "json" };

export const locales = { en, ru } as const;
export type LocaleCode = keyof typeof locales;
export const supportedLocales: readonly LocaleCode[] = ["en", "ru"];

// Keep the existing persisted selection and storage key. Unknown older
// values safely fall back to English.
export const locale = persistedState<LocaleCode>("locale", "en");
const translation = $derived(locales[locale.state.value] ?? locales.en);

/** Translate a stable UI key, optionally interpolating named values. */
export function t(key: string, params?: Record<string, string | number>): string {
  const value: string = translation[key as keyof typeof en] ?? en[key as keyof typeof en] ?? key;
  return params
    ? value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name]),
      )
    : value;
}
