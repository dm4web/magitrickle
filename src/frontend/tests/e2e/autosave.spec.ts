import { expect, test } from "@playwright/test";

const group = {
  id: "group-11",
  name: "Media",
  interface: "eth0",
  fallback_interfaces: ["eth1"],
  enable: true,
  color: "#7755aa",
  rules: [],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/auth", (route) => route.fulfill({ json: { enabled: false } }));
  await page.route("**/groups?with_rules=true", (route) =>
    route.fulfill({ json: { groups: [structuredClone(group)] } }),
  );
  await page.route("**/subscriptions", (route) => route.fulfill({ json: { subscriptions: [] } }));
  await page.route("**/system/interfaces", (route) =>
    route.fulfill({ json: { interfaces: [{ id: "eth0" }, { id: "eth1" }] } }),
  );
  await page.route("**/system/routing-status", (route) => route.fulfill({ json: { groups: [] } }));
});

test("Save + Auto stays aligned, exposes one focus outline, and is shared between tabs", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const toolbar = page.locator(".page-controls-actions:visible").first();
    const cluster = toolbar.locator(".save-cluster");
    const autosave = cluster.getByRole("switch", { name: "Autosave" });

    const measure = () =>
      toolbar.evaluate((root) => {
        const cluster = root.querySelector(".save-cluster")!.getBoundingClientRect();
        const buttons = [...root.querySelectorAll<HTMLElement>(":scope > [role=tooltip] button")];
        return {
          cluster: { x: cluster.x, width: cluster.width, height: cluster.height },
          buttons: buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return { x: rect.x, height: rect.height };
          }),
        };
      });

    const before = await measure();
    expect(
      before.buttons.every((button) => Math.abs(button.height - before.cluster.height) < 1),
    ).toBe(true);
    await expect(toolbar.locator(".autosave-dot")).toHaveAttribute("data-state", "off");
    await autosave.click();
    await expect(toolbar.locator(".autosave-dot")).toHaveAttribute("data-state", "saved");
    expect(await measure()).toEqual(before);
    await expect(toolbar.locator(".save-feedback")).toHaveCount(0);

    await toolbar.locator("button.save-trigger").focus();
    await page.keyboard.press("Tab");
    await expect(autosave).toBeFocused();
    expect(await cluster.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe("solid");
    await autosave.click(); // restore off, without changing geometry
  }

  await page.locator(".page-controls-actions:visible").first().getByRole("switch").click();
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.getByRole("tab", { name: "Subscriptions" }).click();
  await expect(
    page
      .locator(".page-controls-actions:visible")
      .first()
      .getByRole("switch", { name: "Autosave" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(
    page
      .locator(".page-controls-actions:visible")
      .first()
      .getByRole("switch", { name: "Autosave" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("autosave reports pending, successful, and failed writes without moving buttons", async ({
  page,
}) => {
  // Three consecutive debounced saves are exercised; allow for a busy CI browser.
  test.setTimeout(60000);
  let writes = 0;
  let shouldFail = false;
  await page.route("**/groups?save=true", async (route) => {
    writes++;
    await route.fulfill(
      shouldFail ? { status: 500, json: { error: "test failure" } } : { json: { status: "ok" } },
    );
  });
  await page.goto("/");
  const toolbar = page.locator(".page-controls-actions:visible").first();
  const autosave = toolbar.getByRole("switch", { name: "Autosave" });
  const dot = toolbar.locator(".autosave-dot");
  const name = page.locator(".group-wrapper").first().locator("input.group-name");
  const buttons = () =>
    toolbar.evaluate((root) =>
      [...root.querySelectorAll(":scope > [role=tooltip] button")].map(
        (button) => button.getBoundingClientRect().left,
      ),
    );

  const initialPositions = await buttons();
  await autosave.click();
  await name.fill("Updated group");
  await expect(dot).toHaveAttribute("data-state", "pending");
  await expect.poll(() => writes, { timeout: 15000 }).toBe(1);
  await expect(dot).toHaveAttribute("data-state", "saved");

  shouldFail = true;
  await name.fill("Another group");
  await expect(dot).toHaveAttribute("data-state", "pending");
  await expect.poll(() => writes, { timeout: 15000 }).toBe(2);
  await expect(dot).toHaveAttribute("data-state", "error");

  shouldFail = false;
  await name.fill("Recovery group");
  await expect(dot).toHaveAttribute("data-state", "pending");
  await expect.poll(() => writes, { timeout: 15000 }).toBe(3);
  await expect(dot).toHaveAttribute("data-state", "saved");
  expect(await buttons()).toEqual(initialPositions);
});

test("edits made during a save are sent in a subsequent request", async ({ page }) => {
  const writes: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstRequest = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route("**/groups?save=true", async (route) => {
    const data = route.request().postDataJSON() as { groups: (typeof group)[] };
    writes.push(data.groups[0].name);
    if (writes.length === 1) await firstRequest;
    await route.fulfill({ json: { status: "ok" } });
  });

  await page.goto("/");
  const toolbar = page.locator(".page-controls-actions:visible").first();
  await toolbar.getByRole("switch", { name: "Autosave" }).click();
  const name = page.locator(".group-wrapper").first().locator("input.group-name");
  await name.fill("First version");
  await expect.poll(() => writes.length, { timeout: 8000 }).toBe(1);
  await name.fill("Latest version");
  releaseFirst?.();
  await expect.poll(() => writes.length, { timeout: 8000 }).toBe(2);
  expect(writes).toEqual(["First version", "Latest version"]);
  await expect(toolbar.locator(".autosave-dot")).toHaveAttribute("data-state", "saved");
});
