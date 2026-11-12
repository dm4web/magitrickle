import { expect, test } from "@playwright/test";

const initialGroup = {
  id: "group-11",
  name: "Media",
  interface: "eth0",
  fallback_interfaces: ["eth1", "nwg0"],
  check_target: "",
  enable: true,
  color: "#7755aa",
  rules: [{ id: "rule-11", name: "Example", rule: "example.com", type: "domain", enable: true }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("locale", JSON.stringify({ value: "ru" })));
  await page.route("**/api/v1/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/auth", (route) => route.fulfill({ json: { enabled: false } }));
  await page.route("**/groups?with_rules=true", (route) =>
    route.fulfill({ json: { groups: [structuredClone(initialGroup)] } }),
  );
  await page.route("**/system/interfaces", (route) =>
    route.fulfill({
      json: { interfaces: ["eth0", "eth1", "nwg0", "lan1"].map((id) => ({ id })) },
    }),
  );
  await page.route("**/subscriptions", (route) => route.fulfill({ json: { subscriptions: [] } }));
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            primary_interface: "eth0",
            active_interface: "eth0",
            selected_interface: "eth0",
            applied: true,
            enabled: true,
            failover: true,
            interfaces: ["eth0", "eth1", "nwg0"].map((name) => ({
              interface: name,
              checked: true,
              healthy: true,
              method: "link",
              detail: "link up (connectivity unverified)",
            })),
          },
        ],
      },
    }),
  );
});

test("reorders backups, adds a candidate, changes TCP target and saves settings", async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/groups?save=true", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { status: "ok" } });
  });

  await page.goto("/");
  const group = page.locator(".group-wrapper").first();
  await expect(group).toBeVisible();
  const actions = group.locator(".group-actions");
  const routeButton = actions.getByRole("button", { name: "Настроить интерфейсы" });
  const actionLayout = await actions.evaluate((container) => {
    const route = container.querySelector<HTMLButtonElement>("button.failover-action");
    const toggle = container.querySelector<HTMLElement>("[data-switch-root]");
    if (!route || !toggle) throw new Error("Expected group actions missing");
    const deleteButton = route
      .closest('[role="tooltip"]')
      ?.nextElementSibling?.querySelector<HTMLButtonElement>("button");
    if (!deleteButton) throw new Error("Delete action missing");
    const r = route.getBoundingClientRect();
    return {
      square: Math.abs(r.width - r.height) < 1,
      rightOfToggle: r.x > toggle.getBoundingClientRect().x,
      leftOfDelete: r.right < deleteButton.getBoundingClientRect().x,
      matchesDelete: Math.abs(r.width - deleteButton.getBoundingClientRect().width) < 1,
    };
  });
  expect(actionLayout).toEqual({
    square: true,
    rightOfToggle: true,
    leftOfDelete: true,
    matchesDelete: true,
  });
  await routeButton.click();
  await expect(routeButton).toHaveAttribute("aria-expanded", "true");
  const settings = group.getByRole("region", { name: "Резервирование интерфейсов" });
  await expect(settings.locator(".interface-entry.backup")).toHaveCount(2);
  await expect(settings.locator(".interface-entry.backup").first()).toContainText("eth1");

  await settings.getByRole("button", { name: "Повысить приоритет" }).nth(1).click();
  await expect(settings.locator(".interface-entry.backup").first()).toContainText("nwg0");

  await settings.locator("[data-select-trigger]").click();
  await page.getByRole("option", { name: "lan1" }).click();
  await settings.getByRole("button", { name: "Добавить резерв" }).click();
  await expect(settings.locator(".interface-entry.backup")).toHaveCount(3);
  await expect(settings.locator(".add-backup")).toHaveCount(0);

  await settings.getByLabel("Проверка доступности (TCP, необязательно)").fill("1.1.1.1:443");
  await page.locator("#save-changes").click();
  await expect.poll(() => submitted).toBeDefined();
  const savedGroup = (submitted as { groups: Array<typeof initialGroup> }).groups[0];
  expect(savedGroup.fallback_interfaces).toEqual(["nwg0", "eth1", "lan1"]);
  expect(savedGroup.check_target).toBe("1.1.1.1:443");
  expect(savedGroup.interface).toBe("eth0");
});

test("shows blocked route and correct failover summary", async ({ page }) => {
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            enabled: true,
            failover: true,
            primary_interface: "eth0",
            active_interface: "blackhole",
            selected_interface: "blackhole",
            applied: true,
            interfaces: ["eth0", "eth1", "nwg0"].map((name) => ({
              interface: name,
              checked: true,
              healthy: false,
              method: "tcp",
              detail: "TCP probe failed",
            })),
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".route-status")).toHaveText("Заблокирован");
  const overview = page.getByLabel("Сводка маршрутизации");
  await expect(overview).toContainText("Нет маршрута");
  await expect(overview.locator(".overview-alert strong")).toHaveText("1");
  await page.getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(page.getByLabel("Резервирование интерфейсов")).toContainText("Заблокирован");
});

test("does not report an uncommitted route as active", async ({ page }) => {
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            primary_interface: "eth0",
            active_interface: "eth0",
            selected_interface: "nwg0",
            applied: false,
            enabled: true,
            failover: true,
            interfaces: ["eth0", "eth1", "nwg0"].map((name) => ({
              interface: name,
              checked: true,
              healthy: name !== "eth0",
              method: "tcp",
              detail: name === "eth0" ? "TCP probe failed" : "TCP probe passed",
            })),
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".route-status")).toHaveText("Не применён");
  await page.getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(page.getByLabel("Резервирование интерфейсов")).toContainText("Выбран: nwg0");
  await expect(
    page.getByLabel("Сводка маршрутизации").locator(".overview-item").nth(2).locator("strong"),
  ).toHaveText("0");
});

test("desktop and mobile routes settings remain usable without horizontal overflow", async ({
  page,
}, testInfo) => {
  for (const viewport of [
    { name: "desktop", width: 1280, height: 900 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 360, height: 740 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    const group = page.locator(".group-wrapper").first();
    await expect(group).toBeVisible();
    await group.getByRole("button", { name: "Настроить интерфейсы" }).click();
    await expect(group.getByLabel("Резервирование интерфейсов")).toBeVisible();
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.right > window.innerWidth + 1)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 10)
        .map(({ element, rect }) => ({
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className.slice(0, 90) : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        })),
    }));
    await page.screenshot({ path: testInfo.outputPath(viewport.name + ".png"), fullPage: true });
    expect(widths.document, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
  }
});

test("group title edits inline without full-width browser focus outline", async ({ page }) => {
  await page.goto("/");
  const group = page.locator(".group-wrapper").first();
  const name = group.locator("input.group-name");
  await expect(name).toHaveValue("Media");
  const field = await name.boundingBox();
  const header = await group.locator(".group-header").boundingBox();
  expect(field).not.toBeNull();
  expect(header).not.toBeNull();
  expect(field!.width).toBeLessThan(header!.width * 0.7);

  await name.click();
  await expect(name).toBeFocused();
  const computed = await name.evaluate((input: HTMLInputElement) => ({
    selected: input.selectionStart !== input.selectionEnd,
    outline: getComputedStyle(input).outlineStyle,
    shadow: getComputedStyle(input).boxShadow,
  }));
  expect(computed.selected).toBe(false);
  expect(computed.outline).toBe("none");
  expect(computed.shadow).toBe("none");
  await name.fill("Media services");
  await expect(name).toHaveValue("Media services");
});

test("primary and backup rows have identical height and square action buttons", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const group = page.locator(".group-wrapper").first();
    await group.getByRole("button", { name: "Настроить интерфейсы" }).click();
    const rows = group.locator(".interface-entry");
    await expect(rows).toHaveCount(3);

    const geometry = await rows.evaluateAll((nodes) =>
      nodes.map((node) => {
        const height = node.getBoundingClientRect().height;
        const buttons = [...node.querySelectorAll(".interface-actions button")].map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        return { height, buttons };
      }),
    );

    const primaryHeight = geometry[0].height;
    expect(primaryHeight).toBeGreaterThan(40);
    for (const row of geometry) {
      expect(Math.abs(row.height - primaryHeight)).toBeLessThan(1);
      for (const button of row.buttons) {
        expect(Math.abs(button.width - button.height)).toBeLessThan(1);
        expect(button.height).toBeLessThan(row.height);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
});
