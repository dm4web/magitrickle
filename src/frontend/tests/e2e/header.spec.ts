import { expect, test, type Page } from "@playwright/test";

test.describe("Header Settings", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth disabled to access layout directly
    await page.route("**/auth", async (route) => route.fulfill({ json: { enabled: false } }));
    await page.route("**/groups?with_rules=true", async (route) =>
      route.fulfill({ json: { groups: [] } }),
    );
    await page.route("**/interfaces", async (route) => route.fulfill({ json: { interfaces: [] } }));
    await page.goto("/");
  });

  test("should display version", async ({ page }) => {
    const version = page.locator(".app-brand .brand-version");
    await expect(version).toBeVisible();
    await expect(version).not.toBeEmpty();
    await expect(page.locator(".header-settings .version-text")).toHaveCount(0);
  });

  test("should rotate locale", async ({ page }) => {
    const localeBtn = page.locator(".locale button");

    // Get initial text (flag)
    const initialText = await localeBtn.textContent();

    await expect(page.getByRole("tab", { name: "Groups" })).toBeVisible();
    await localeBtn.click();
    await expect(localeBtn).not.toHaveText(initialText || "");
    await expect(page.getByRole("tab", { name: "Группы" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.reload();
    await expect(page.getByRole("tab", { name: "Группы" })).toBeVisible();
    await localeBtn.click();
    await expect(page.getByRole("tab", { name: "Groups" })).toBeVisible();
  });

  test("should open info dialog", async ({ page }) => {
    const infoBtn = page.locator(".info button");
    await expect(infoBtn).toBeVisible();

    await infoBtn.click();

    // Check dialog title
    const dialog = page.locator("[data-dialog-content]");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("About", { exact: true })).toBeVisible();

    // Check for some content
    await expect(dialog.locator("text=Official website")).toBeVisible();
    await expect(dialog.locator("text=Bug Tracker")).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});

type ThemeMode = "system" | "light" | "dark";

async function selectTheme(page: Page, mode: ThemeMode) {
  await page.locator(".theme-switch [data-select-trigger]").click();
  await page.locator('.theme-menu [data-select-item][data-value="' + mode + '"]').click();
}

test("system theme tracks OS and explicit themes override it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const trigger = page.locator(".theme-switch [data-select-trigger]");
  await expect(trigger).toContainText("System");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await selectTheme(page, "light");
  await expect(trigger).toContainText("Light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator(".theme-switch [data-select-trigger]")).toContainText("Light");

  await selectTheme(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await selectTheme(page, "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("theme label and arrow remain compact in both languages", async ({ page }) => {
  await page.goto("/");
  const trigger = page.locator(".theme-switch [data-select-trigger]");
  const measure = () =>
    trigger.evaluate((root) => {
      const label = root.querySelector(".theme-label")!.getBoundingClientRect();
      const arrow = root.querySelector(".theme-chevron")!.getBoundingClientRect();
      return arrow.left - label.right;
    });

  for (const mode of ["system", "light", "dark"] as const) {
    await selectTheme(page, mode);
    const gap = await measure();
    expect(gap).toBeGreaterThanOrEqual(3);
    expect(gap).toBeLessThanOrEqual(9);
  }

  await page.locator(".locale button").click();
  await expect(trigger.locator(".theme-label")).toHaveText("Тёмная");
  const russianGap = await measure();
  expect(russianGap).toBeGreaterThanOrEqual(3);
  expect(russianGap).toBeLessThanOrEqual(9);

  await page.setViewportSize({ width: 390, height: 844 });
  const containment = await trigger.evaluate((root) => {
    const shell = root.getBoundingClientRect();
    return shell.left >= 0 && shell.right <= innerWidth + 1;
  });
  expect(containment).toBe(true);
});

test("theme menu clearly highlights selection without hover flicker", async ({ page }) => {
  await page.goto("/");
  await selectTheme(page, "dark");
  const trigger = page.locator(".theme-switch [data-select-trigger]");
  await trigger.click();

  const selected = page.locator('.theme-menu [data-value="dark"]');
  const other = page.locator('.theme-menu [data-value="light"]');
  await expect(selected).toHaveAttribute("data-selected", "");
  await expect(selected.locator(".theme-option-check svg")).toBeVisible();
  await expect(other.locator(".theme-option-check svg")).toHaveCount(0);

  const selectionBackground = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
  const normalBackground = await other.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(selectionBackground).not.toBe(normalBackground);

  await other.hover();
  await page.mouse.move(15, 300);
  await expect(selected).toBeVisible();
  await expect(selected).toHaveAttribute("data-selected", "");
  expect(await selected.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    selectionBackground,
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".theme-menu")).toHaveCount(0);

  // Keyboard accessibility of the custom menu.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.theme-menu [data-value="dark"]')).toBeVisible();
  await page.keyboard.press("Escape");
});
