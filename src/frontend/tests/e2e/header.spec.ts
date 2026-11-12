import { expect, test } from "@playwright/test";

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

test("system theme tracks OS and explicit themes override it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const selector = page.locator(".theme-switch select");
  await expect(selector).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await selector.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator(".theme-switch select")).toHaveValue("light");

  await selector.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await selector.selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
