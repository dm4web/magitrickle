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

  await expect(settings.locator(".interface-entry.inactive")).toHaveCount(2);
  await settings
    .locator(".interface-entry.inactive")
    .filter({ hasText: "lan1" })
    .getByRole("button", { name: "Добавить резерв" })
    .click();
  await expect(settings.locator(".interface-entry.backup")).toHaveCount(3);
  await expect(settings.locator(".interface-entry.inactive")).toHaveCount(1);
  await expect(settings.locator(".add-backup")).toHaveCount(0);

  await settings.getByLabel("Проверка доступности (TCP, необязательно)").fill("1.1.1.1:443");
  await page.locator("#save-changes").click();
  await expect.poll(() => submitted).toBeDefined();
  const savedGroup = (submitted as { groups: Array<typeof initialGroup> }).groups[0];
  expect(savedGroup.fallback_interfaces).toEqual(["nwg0", "eth1", "lan1"]);
  expect(savedGroup.check_target).toBe("1.1.1.1:443");
  expect(savedGroup.interface).toBe("eth0");
});

test("dragging a backup grip changes priority and preserves the primary interface", async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/groups?save=true", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { status: "ok" } });
  });

  await page.goto("/");
  const settings = page.locator(".group-wrapper").first();
  await settings.getByRole("button", { name: "Настроить интерфейсы" }).click();
  const rows = settings.locator(".interface-entry.backup");
  const names = rows.locator(".interface-name");
  await expect(names).toHaveText(["eth1", "nwg0"]);
  await expect(settings.locator(".interface-entry.primary .backup-grip")).toHaveCount(0);

  // The row itself isn't a drag handle; dragging its text must not reorder it.
  await rows
    .nth(0)
    .locator(".interface-name")
    .dragTo(rows.nth(1), {
      targetPosition: { x: 32, y: 20 },
    });
  await expect(names).toHaveText(["eth1", "nwg0"]);

  await rows
    .nth(0)
    .locator(".backup-grip")
    .dragTo(rows.nth(1), {
      targetPosition: { x: 32, y: 20 },
    });
  await expect(names).toHaveText(["nwg0", "eth1"]);

  // The existing arrow controls remain an accessible alternative.
  await rows.nth(0).getByRole("button", { name: "Понизить приоритет" }).click();
  await expect(names).toHaveText(["eth1", "nwg0"]);
  await rows
    .nth(1)
    .locator(".backup-grip")
    .dragTo(rows.nth(0), {
      targetPosition: { x: 32, y: 20 },
    });
  await expect(names).toHaveText(["nwg0", "eth1"]);

  await page.locator("#save-changes").click();
  await expect.poll(() => submitted).toBeDefined();
  const savedGroup = (submitted as { groups: Array<typeof initialGroup> }).groups[0];
  expect(savedGroup.interface).toBe("eth0");
  expect(savedGroup.fallback_interfaces).toEqual(["nwg0", "eth1"]);
});

test("a backup cannot be dragged into another group's priority list", async ({ page }) => {
  const secondGroup = {
    ...structuredClone(initialGroup),
    id: "group-22",
    name: "Second group",
    interface: "lan1",
    fallback_interfaces: ["nwg0", "eth1"],
  };
  await page.route("**/groups?with_rules=true", (route) =>
    route.fulfill({ json: { groups: [structuredClone(initialGroup), secondGroup] } }),
  );
  await page.goto("/");
  const groups = page.locator(".group-wrapper");
  await expect(groups).toHaveCount(2);
  for (const index of [0, 1]) {
    await groups.nth(index).getByRole("button", { name: "Настроить интерфейсы" }).click();
  }

  const first = groups.nth(0).locator(".interface-entry.backup");
  const second = groups.nth(1).locator(".interface-entry.backup");
  await first
    .nth(0)
    .locator(".backup-grip")
    .dragTo(second.nth(0), {
      targetPosition: { x: 32, y: 20 },
    });
  await expect(first.locator(".interface-name")).toHaveText(["eth1", "nwg0"]);
  await expect(second.locator(".interface-name")).toHaveText(["nwg0", "eth1"]);
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
  await expect(page.locator(".route-status")).toHaveText("Недоступен");
  await expect(page.locator(".route-status")).toHaveClass(/route-degraded/);
  const statsButton = page.getByRole("button", { name: "Статистика" });
  await expect(statsButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Сводка маршрутизации")).toBeHidden();
  await statsButton.click();
  const overview = page.getByLabel("Сводка маршрутизации");
  await expect(overview).toContainText("Нет маршрута");
  await expect(overview.locator(".overview-alert strong")).toHaveText("1");
  await page.getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(page.getByLabel("Резервирование интерфейсов")).toContainText("Недоступен");
  await expect(page.locator(".leak-protection")).toHaveCount(0);
  await expect(
    page.locator(".interface-entry.inactive").filter({ hasText: "blackhole" }),
  ).toHaveCount(1);
});

test("live failover status moves from primary through backup and blackhole and recovers", async ({
  page,
}) => {
  let scenario: "primary" | "backup" | "blackhole" = "primary";
  await page.route("**/groups?with_rules=true", (route) =>
    route.fulfill({
      json: {
        groups: [
          structuredClone(initialGroup),
          { ...structuredClone(initialGroup), id: "group-22", fallback_interfaces: [] },
        ],
      },
    }),
  );
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            enabled: true,
            failover: true,
            applied: true,
            primary_interface: "eth0",
            active_interface:
              scenario === "primary" ? "eth0" : scenario === "backup" ? "eth1" : "blackhole",
            selected_interface:
              scenario === "primary" ? "eth0" : scenario === "backup" ? "eth1" : "blackhole",
            interfaces: ["eth0", "eth1", "nwg0"].map((name) => ({
              interface: name,
              checked: true,
              healthy: scenario === "primary" ? true : scenario === "backup" && name === "eth1",
              method: "tcp",
              detail: "Simulated probe",
            })),
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const groups = page.locator(".group-wrapper");
  await expect(groups).toHaveCount(2);
  const routeStatus = groups.first().locator(".group-actions .route-status");
  await expect(routeStatus).toHaveText("eth0");
  await expect(routeStatus.locator(".route-backup-icon")).toHaveCount(0);
  await groups.first().getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(groups.first().locator(".leak-protection")).toHaveCount(0);
  await expect(
    groups.first().locator(".interface-entry.inactive").filter({ hasText: "blackhole" }),
  ).toHaveCount(1);
  await groups.nth(1).getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(
    groups.nth(1).locator(".interface-entry.inactive").filter({ hasText: "blackhole" }),
  ).toHaveCount(1);

  scenario = "backup";
  await expect(routeStatus).toHaveText("eth1", { timeout: 11000 });
  await expect(routeStatus.locator(".route-backup-icon")).toBeVisible();
  await expect(routeStatus).toHaveAttribute("aria-label", "Активен резервный интерфейс: eth1");
  scenario = "blackhole";
  await expect(groups.first().locator(".route-status")).toHaveText("Недоступен", {
    timeout: 11000,
  });
  await expect(groups.first().locator(".route-status")).toHaveClass(/route-degraded/);
  await expect(routeStatus.locator(".route-backup-icon")).toHaveCount(0);
  scenario = "primary";
  await expect(groups.first().locator(".route-status")).toHaveText("eth0", { timeout: 11000 });
  await expect(groups.first().locator(".route-status")).toHaveClass(/route-healthy/);
  await expect(routeStatus.locator(".route-backup-icon")).toHaveCount(0);
});

test("blackhole can be selected as the sole route, then replaced with an interface", async ({
  page,
}) => {
  await page.goto("/");
  const group = page.locator(".group-wrapper").first();
  await group.getByRole("button", { name: "Настроить интерфейсы" }).click();
  const settings = group.locator(".failover-settings");
  const blackhole = settings.locator(".interface-entry.inactive").filter({ hasText: "blackhole" });
  await blackhole.getByRole("button", { name: "Сделать основным" }).click();
  await expect(settings.locator(".interface-entry.primary .interface-name")).toHaveText(
    "blackhole",
  );
  await expect(settings.locator(".interface-entry.backup")).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Добавить резерв" })).toHaveCount(0);
  await settings
    .locator(".interface-entry.inactive")
    .filter({ hasText: "eth1" })
    .getByRole("button", { name: "Сделать основным" })
    .click();
  await expect(settings.locator(".interface-entry.primary .interface-name")).toHaveText("eth1");
  await expect(settings.locator(".interface-entry.backup")).toHaveCount(0);
});

test("explicit blackhole is shown beside group switch with distinct color", async ({ page }) => {
  await page.route("**/groups?with_rules=true", (route) =>
    route.fulfill({
      json: {
        groups: [
          { ...structuredClone(initialGroup), interface: "blackhole", fallback_interfaces: [] },
        ],
      },
    }),
  );
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            enabled: true,
            failover: false,
            primary_interface: "blackhole",
            active_interface: "blackhole",
            selected_interface: "blackhole",
            applied: true,
            interfaces: [
              {
                interface: "blackhole",
                checked: true,
                healthy: true,
                method: "link",
                detail: "explicit blackhole",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const group = page.locator(".group-wrapper").first();
  await expect(group.locator(".group-actions .route-status")).toHaveText("blackhole");
  await expect(group.locator(".group-actions .route-status")).toHaveClass(/route-blackhole/);
  await expect(group.locator(".route-backup-icon")).toHaveCount(0);
  await group.getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(group.locator(".interface-entry.primary .interface-name")).toHaveText("blackhole");
  await expect(group.locator(".interface-entry.backup")).toHaveCount(0);
});

test("health labels only report availability regardless of check method", async ({ page }) => {
  await page.route("**/groups?with_rules=true", (route) =>
    route.fulfill({
      json: {
        groups: [
          { ...structuredClone(initialGroup), check_target: "1.1.1.1:443" },
          {
            ...structuredClone(initialGroup),
            id: "group-22",
            fallback_interfaces: [],
            check_target: "",
          },
        ],
      },
    }),
  );
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            enabled: true,
            failover: true,
            primary_interface: "eth0",
            active_interface: "eth1",
            selected_interface: "eth1",
            applied: true,
            interfaces: [
              {
                interface: "eth0",
                checked: true,
                healthy: false,
                method: "tcp",
                detail: "TCP probe failed",
              },
              {
                interface: "eth1",
                checked: true,
                healthy: true,
                method: "tcp",
                detail: "TCP probe passed",
              },
            ],
          },
          {
            id: "group-22",
            enabled: true,
            failover: false,
            primary_interface: "eth0",
            active_interface: "eth0",
            selected_interface: "eth0",
            applied: true,
            interfaces: [
              {
                interface: "eth0",
                checked: true,
                healthy: true,
                method: "link",
                detail: "link up (connectivity unverified)",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const groups = page.locator(".group-wrapper");
  for (const index of [0, 1]) {
    await groups.nth(index).getByRole("button", { name: "Настроить интерфейсы" }).click();
  }
  await expect(groups.nth(0).locator(".interface-entry.primary .interface-health")).toHaveText(
    "Недоступен",
  );
  await expect(
    groups.nth(0).locator(".interface-entry.backup").first().locator(".interface-health"),
  ).toHaveText("Доступен");
  await expect(groups.nth(1).locator(".interface-entry.primary .interface-health")).toHaveText(
    "Доступен",
  );
});

test("missing or unfinished health checks are shown as Testing", async ({ page }) => {
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            enabled: true,
            applied: true,
            failover: true,
            primary_interface: "eth0",
            active_interface: "eth0",
            selected_interface: "eth0",
            interfaces: [
              { interface: "eth0", checked: false, healthy: false, method: "pending", detail: "" },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const group = page.locator(".group-wrapper").first();
  await group.getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(group.locator(".interface-entry.primary .interface-health")).toHaveText("Проверка");
  await expect(
    group.locator(".interface-entry.backup").first().locator(".interface-health"),
  ).toHaveText("Проверка");
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
  await expect(page.locator(".route-status")).toHaveText("Недоступен");
  await expect(page.locator(".route-status")).toHaveAttribute("title", "Недоступен");
  await page.getByRole("button", { name: "Настроить интерфейсы" }).click();
  await expect(page.locator(".failover-summary")).toHaveText("Маршрут: Недоступен");
  await page.getByRole("button", { name: "Статистика" }).click();
  await expect(
    page.getByLabel("Сводка маршрутизации").locator(".overview-item").nth(2).locator("strong"),
  ).toHaveText("0");
});

test("failed failover does not present the requested backup as the active route", async ({
  page,
}) => {
  await page.route("**/system/routing-status", (route) =>
    route.fulfill({
      json: {
        groups: [
          {
            id: initialGroup.id,
            primary_interface: "eth0",
            active_interface: "eth0",
            selected_interface: "eth1",
            applied: true,
            enabled: true,
            failover: true,
            interfaces: [
              { interface: "eth0", checked: true, healthy: true, method: "tcp", detail: "" },
              { interface: "eth1", checked: true, healthy: true, method: "tcp", detail: "" },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  const group = page.locator(".group-wrapper").first();
  await expect(group.locator(".route-status")).toHaveText("eth0");
  await expect(group.locator(".route-backup-icon")).toHaveCount(0);
  await group.getByRole("button", { name: "Настроить интерфейсы" }).click();
  const summary = group.locator(".failover-summary");
  await expect(summary).toHaveText("Маршрут: eth0");
});

test("statistics are hidden by default and the overview toggle does not affect controls", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const stats = page.getByRole("button", { name: "Статистика" });
    const overview = page.getByLabel("Сводка маршрутизации");
    await expect(stats).toHaveAttribute("aria-expanded", "false");
    await expect(overview).toBeHidden();
    const before = await page.locator(".group-wrapper").first().boundingBox();
    await stats.click();
    await expect(stats).toHaveAttribute("aria-expanded", "true");
    await expect(overview).toBeVisible();
    await expect(overview.locator(".overview-item")).toHaveCount(4);
    await stats.click();
    await expect(overview).toBeHidden();
    const after = await page.locator(".group-wrapper").first().boundingBox();
    expect(after?.y).toBeCloseTo(before!.y, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
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
    await expect(rows).toHaveCount(5);

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
