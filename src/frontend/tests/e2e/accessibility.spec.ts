import { expect, test } from "@playwright/test";

import { GroupsPage } from "./pages/GroupsPage";

test.describe("Accessibility", () => {
  let groupsPage: GroupsPage;

  test.beforeEach(async ({ page }) => {
    groupsPage = new GroupsPage(page);
    await page.route("**/auth", async (route) => route.fulfill({ json: { enabled: false } }));
    await page.route("**/groups?with_rules=true", async (route) =>
      route.fulfill({ json: { groups: [] } }),
    );
    await page.route("**/interfaces", async (route) => route.fulfill({ json: { interfaces: [] } }));
    await groupsPage.goto();
  });

  test("should focus group name on creation", async ({ page }) => {
    await groupsPage.createGroup();

    // After creation, focus should be on the group name input
    const groupNameInput = page.locator(".group-wrapper").first().locator("input.group-name");
    await expect(groupNameInput).toBeFocused();
  });

  test("should tab through group controls", async ({ page }) => {
    await groupsPage.createGroup();
    const groupNameInput = page.locator(".group-wrapper").first().locator("input.group-name");

    // Focus Name
    await groupNameInput.focus();

    // Tab -> Interface Select (First select in the group)
    await page.keyboard.press("Tab");
    const interfaceTrigger = page
      .locator(".group-wrapper")
      .first()
      .locator("[data-select-trigger]")
      .first();
    await expect(interfaceTrigger).toBeFocused();

    // Tab -> Configure failover (new focusable control).
    await page.keyboard.press("Tab");
    await expect(
      page.locator(".group-wrapper").first().getByRole("button", {
        name: "Configure backup interfaces",
      }),
    ).toBeFocused();

    // Tab -> Enable/Disable group.
    await page.keyboard.press("Tab");
    await expect(page.locator(".group-wrapper").first().locator(".enable-group")).toBeFocused();

    // Tab -> Delete Group (do not depend on button indices).
    await page.keyboard.press("Tab");
    const deleteBtn = page
      .locator(".group-wrapper")
      .first()
      .locator('[data-value="Delete Group"] button');
    await expect(deleteBtn).toBeFocused();
  });
});
