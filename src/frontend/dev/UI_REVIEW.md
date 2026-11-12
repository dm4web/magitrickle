# MagiTrickle — UI review checklist

This checklist records feedback from the browser review. Do not mark an item done
based on a passing build alone. Verify geometry with Playwright and inspect the
resulting desktop and mobile screenshots. Do not deploy to Keenetic during review.

- [x] Theme selector: icon, translated label and chevron must sit in one compact
      row, with a 4–8 px label-to-chevron gap and no empty area in between.
      Choices: System / Light / Dark. Verify RU/EN and theme changes.
- [x] Theme menu must have colored mode icons, an unmistakable persistent
      selected-state highlight/checkmark, and no background/color flicker when
      moving the pointer between an option and empty space. Validate keyboard
      selection and both light/dark appearances (new user screenshots).
- [x] Interface priority rows: primary and each backup must have the **same height**
      in desktop and mobile layouts. Match the original primary row (~44 px desktop).
- [x] Interface action buttons (up/down/remove): each must be an exact square;
      button size must not increase the backup row's height.
- [x] Group header spacing: grip-to-name visible gap should be compact (~3–8 px).
      Interface selectors and status columns must align across groups; icon buttons
      should have uniform sizes and gaps. Verify desktop/tablet/mobile, no overlap.
- [x] Version remains next to MagiTrickle, vertically centered, with visible
      spacing between name, version, and dev badge.
- [x] Interfaces action uses icon alongside other buttons, with localized tooltip
      “Настроить интерфейсы” / “Configure interfaces”; no “backup” in this label.
- [x] RU/EN dictionaries cover all UI copy. Never translate user-defined group
      or interface names. Locale and appearance choices persist.
- [x] Validate Svelte diagnostics, all relevant Playwright tests, full e2e
      regression, and visually review screenshots before closing.

Source of truth: user feedback and screenshot captured 2026-11-12 23:14.
Scope: local frontend preview and tests only. No router deployment.

- [ ] Final visual approval in the user’s own Chrome window.

Verified locally: 66/66 Playwright browser tests, 63/63 unit test steps,
Svelte 0 errors/0 warnings, static production build, demo preview pass,
and Playwright screenshots in dark/light themes with unchanged selected
highlight after pointer leaves the menu. Keenetic not touched.
