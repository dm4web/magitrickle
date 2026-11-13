import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 540, height: 800 },
]) {
  test(`subscription interface list stays clickable over the next card (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route("**/auth", (route) => route.fulfill({ json: { enabled: false } }));
    await page.route("**/groups?with_rules=true", (route) =>
      route.fulfill({ json: { groups: [] } }),
    );
    await page.route("**/subscriptions", (route) =>
      route.fulfill({
        json: {
          subscriptions: ["sub-0001", "sub-0002"].map((id, index) => ({
            id,
            name: `Subscription ${index + 1}`,
            url: `https://example.com/${index + 1}.txt`,
            interface: "eth0",
            enable: true,
            interval: 86400,
            lastUpdate: 0,
            rules: [],
          })),
        },
      }),
    );
    await page.route("**/interfaces", (route) =>
      route.fulfill({
        json: {
          interfaces: Array.from({ length: 8 }, (_, i) => ({
            id: `eth${i}`,
            name: `Network ${i}`,
          })),
        },
      }),
    );

    await page.goto("/");
    if (viewport.width <= 700) await page.locator(".mobile-dropdown-btn").click();
    await page.getByRole("tab", { name: "Subscriptions" }).click();
    await expect(page.locator(".subscription-panel")).toHaveCount(2);

    const trigger = page
      .locator(".subscription-panel .action.interface [data-select-trigger]")
      .first();
    await trigger.click();
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();

    // The popup must remain clickable even when it covers the next card.
    const option = page.getByRole("option", { name: "eth4", exact: true });
    await expect(option).toBeVisible();
    await expect
      .poll(() =>
        option.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return Boolean(hit && (element === hit || element.contains(hit)));
        }),
      )
      .toBe(true);

    await option.click();
    await expect(trigger).toContainText("eth4");
    await expect(list).toHaveCount(0);
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
