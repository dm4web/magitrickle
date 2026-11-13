import { expect, test, type Page } from "@playwright/test";

type Subscription = {
  id: string;
  name: string;
  interface: string;
  enable: boolean;
  url: string;
  lastUpdate: number;
  interval: number;
  rules: { enable: boolean; id: string; rule: string; type: string }[];
};

const makeSubscription = (id: string, url: string, name = `Subscription ${id}`): Subscription => ({
  id,
  name,
  interface: "eth0",
  enable: true,
  url,
  lastUpdate: 1700000000,
  interval: 86400,
  rules: [{ enable: true, id: `${id.slice(0, 4)}aaaa`, rule: `${id}.example.com`, type: "domain" }],
});

async function setupSubscriptions(page: Page, data: Subscription[]) {
  let subscriptions = structuredClone(data);
  let savedBody: { subscriptions: Subscription[] } | null = null;
  let syncBody: { url?: string } | null = null;

  await page.route("**/auth", async (route) => route.fulfill({ json: { enabled: false } }));
  await page.route("**/groups?with_rules=true", async (route) =>
    route.fulfill({ json: { groups: [] } }),
  );
  await page.route("**/interfaces", async (route) =>
    route.fulfill({
      json: {
        interfaces: [
          { id: "eth0", name: "Main WAN" },
          { id: "wlan0", name: "Wi-Fi" },
        ],
      },
    }),
  );
  await page.route("**/subscriptions", async (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON();
      subscriptions = structuredClone(savedBody?.subscriptions ?? []);
      await route.fulfill({ json: { status: "ok" } });
      return;
    }

    await route.fulfill({ json: { subscriptions } });
  });
  await page.route("**/subscriptions/*/sync", async (route) => {
    syncBody = route.request().postDataJSON();
    const id = route.request().url().split("/").at(-2);
    const subscription = subscriptions.find((item) => item.id === id);
    if (!subscription) {
      await route.fulfill({ status: 404, json: { error: "subscription not found" } });
      return;
    }

    subscription.url = syncBody?.url ?? subscription.url;
    subscription.rules = [
      { enable: true, id: "87654321", rule: "synced.example.com", type: "domain" },
    ];
    subscription.lastUpdate = 1800000000;

    await route.fulfill({
      json: {
        rules: subscription.rules,
        lastUpdate: subscription.lastUpdate,
        url: subscription.url,
      },
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Subscriptions" }).click();
  await expect(page.locator(".subscription-panel")).toHaveCount(data.length);

  return {
    get savedBody() {
      return savedBody;
    },
    get syncBody() {
      return syncBody;
    },
  };
}

test.describe("Subscriptions", () => {
  test("empty subscriptions show one full-width placeholder without an empty list", async ({ page }) => {
    await setupSubscriptions(page, []);

    const placeholder = page.locator(".subscriptions-page .placeholder .card");
    await expect(placeholder).toHaveAttribute("data-full-width", "true");
    await expect(placeholder).toContainText("No subscriptions yet");
    await expect(page.locator(".subscription-list")).toBeHidden();

    for (const width of [1440, 740, 390]) {
      await page.setViewportSize({ width, height: 860 });
      const [card, controls] = await Promise.all([
        placeholder.boundingBox(),
        page.locator(".subscription-controls").boundingBox(),
      ]);
      expect(card).not.toBeNull();
      expect(controls).not.toBeNull();
      expect(card!.width).toBeGreaterThanOrEqual(controls!.width - 2);
      const alignment = await placeholder.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const icon = element.querySelector(".icon")!.getBoundingClientRect();
        const text = element.querySelector(".content")!.getBoundingClientRect();
        return {
          cardCenter: card.left + card.width / 2,
          iconCenter: icon.left + icon.width / 2,
          textCenter: text.left + text.width / 2,
          iconBottom: icon.bottom,
          textTop: text.top,
        };
      });
      expect(alignment.iconCenter).toBeCloseTo(alignment.cardCenter, 0);
      expect(alignment.textCenter).toBeCloseTo(alignment.cardCenter, 0);
      expect(alignment.iconBottom).toBeLessThanOrEqual(alignment.textTop);
    }
  });

  test("subscription header has no unused left indent and aligns right with groups", async ({
    page,
  }) => {
    await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://example.com/demo-rules", "Test"),
    ]);
    await page.route("**/groups?with_rules=true", (route) =>
      route.fulfill({
        json: {
          groups: [
            {
              id: "group-11",
              name: "Media",
              interface: "eth0",
              enable: true,
              color: "#7799cc",
              rules: [],
            },
          ],
        },
      }),
    );

    for (const width of [1440, 1024, 900, 850, 740, 390, 360]) {
      await page.setViewportSize({ width, height: 860 });
      await page.goto("/");
      if (width <= 700) await page.locator(".mobile-dropdown-btn").click();
      await page.getByRole("tab", { name: "Groups" }).click();
      const group = page.locator(".group-wrapper").first();
      await expect(group).toBeVisible();
      const groupPosition = await group.evaluate((element) => ({
        nameX: element.querySelector(".group-name")!.getBoundingClientRect().x,
        gripX: element.querySelector(".group-grip")!.getBoundingClientRect().x,
        lastRight: element
          .querySelector(".group-actions [data-collapsible-trigger]")!
          .getBoundingClientRect().right,
        headerHeight: element.querySelector(".group-header")!.getBoundingClientRect().height,
      }));

      if (width <= 700) await page.locator(".mobile-dropdown-btn").click();
      await page.getByRole("tab", { name: "Subscriptions" }).click();
      const panel = page.locator(".subscription-panel").first();
      await expect(panel).toBeVisible();
      const subscriptionPosition = await panel.evaluate((element) => ({
        nameX: element.querySelector(".subscription-name")!.getBoundingClientRect().x,
        gripX: element.querySelector(".subscription-grip")!.getBoundingClientRect().x,
        headerX: element.querySelector(".subscription-header")!.getBoundingClientRect().x,
        lastRight: element
          .querySelector(".expand-action [data-collapsible-trigger]")!
          .getBoundingClientRect().right,
        headerHeight: element.querySelector(".subscription-header")!.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));

      if (width <= 850) {
        expect(subscriptionPosition.nameX).toBeCloseTo(groupPosition.nameX, 0);
      }
      expect(subscriptionPosition.overflow).toBeLessThanOrEqual(1);
      if (width > 850) {
        expect(subscriptionPosition.gripX).toBeCloseTo(groupPosition.gripX, 0);
        expect(subscriptionPosition.lastRight).toBeCloseTo(groupPosition.lastRight, 0);
        expect(subscriptionPosition.headerHeight).toBeCloseTo(groupPosition.headerHeight, 0);
      }
    }
  });

  test("subscription selection checkbox does not cover the drag handle", async ({ page }) => {
    await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://example.com/demo-rules", "Test"),
    ]);
    const frame = page.locator(".selection-frame.inline-selection").first();
    const check = frame.locator(".selection-tail");

    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 860 });
      await frame.hover();
      await expect(check).toBeVisible();
      await expect(frame.locator(".tail-surface svg")).toHaveCSS("opacity", "0");
      const positions = await frame.evaluate((element) => {
        const check = element.querySelector(".selection-tail")!.getBoundingClientRect();
        const grip = element.querySelector(".subscription-grip")!.getBoundingClientRect();
        const name = element.querySelector(".subscription-name")!.getBoundingClientRect();
        const header = element.querySelector(".subscription-header")!.getBoundingClientRect();
        return { check, grip, name, header };
      });
      expect(positions.check.left).toBeGreaterThanOrEqual(positions.header.left);
      expect(positions.check.right).toBeLessThan(positions.name.left);
      expect(positions.check.bottom).toBeLessThanOrEqual(positions.header.bottom);
      if (width > 850) {
        expect(positions.check.right).toBeLessThanOrEqual(positions.grip.left + 1);
        expect(
          Math.abs(
            positions.check.top +
              positions.check.height / 2 -
              (positions.grip.top + positions.grip.height / 2),
          ),
        ).toBeLessThanOrEqual(1);
      }

      await check.click();
      await expect(check).toHaveAttribute("aria-pressed", "true");
      await expect(frame.locator(".tail-surface svg")).toHaveCSS("opacity", "1");
      await check.focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      await expect(check).toBeFocused();
      await expect(check).toHaveCSS("outline-style", "none");
      await expect(frame.locator(".tail-surface")).toHaveCSS("border-top-width", "2px");
      await check.click();
      await expect(check).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("subscription actions match group button spacing and show the expand control", async ({
    page,
  }) => {
    await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://example.com/demo-rules", "Test"),
    ]);

    const panel = page.locator(".subscription-panel").first();
    const expand = panel.locator(".expand-action [data-collapsible-trigger]");
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 860 });
      await expect(expand).toBeVisible();
      const measures = await panel.evaluate((element) => {
        const header = element.querySelector(".subscription-header")!.getBoundingClientRect();
        const actions = element.querySelector(".subscription-actions")!.getBoundingClientRect();
        const controls = [
          ...element.querySelectorAll<HTMLElement>(".subscription-actions .action"),
        ];
        const last = controls.at(-1)!.getBoundingClientRect();
        const actionButtons = controls.slice(2).map((control) => control.getBoundingClientRect());
        const interfaceRect = element
          .querySelector(".action.interface [data-select-trigger]")!
          .getBoundingClientRect();
        const switchRect = element
          .querySelector(".action.toggle [data-switch-root]")!
          .getBoundingClientRect();
        return {
          trailingGap: header.right - last.right,
          interfaceToggleGap: switchRect.left - interfaceRect.right,
          buttonWidths: actionButtons.map((rect) => rect.width),
          gaps: actionButtons.slice(1).map((rect, index) => rect.left - actionButtons[index].right),
          actionsRight: actions.right,
        };
      });
      if (width > 850) {
        expect(measures.interfaceToggleGap).toBeCloseTo(8.8, 0);
        expect(measures.trailingGap).toBeGreaterThanOrEqual(7);
        expect(measures.trailingGap).toBeLessThanOrEqual(10);
        for (const size of measures.buttonWidths) expect(size).toBeCloseTo(35.2, 0);
        for (const gap of measures.gaps) expect(gap).toBeCloseTo(4.8, 0);
      }
    }

    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    await expect(panel.locator(".subscription-rule")).toBeVisible();
    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "false");
  });

  test("subscription name and URL use the shared editable-field focus style", async ({ page }) => {
    await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://example.com/demo-rules", "Test name"),
    ]);

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 860 });
      for (const selector of [".subscription-name", ".subscription-url-input"]) {
        const input = page.locator(".subscription-panel").first().locator(selector);
        await input.focus();
        const style = await input.evaluate((element) => {
          const css = getComputedStyle(element);
          return {
            paddingLeft: parseFloat(css.paddingLeft),
            paddingRight: parseFloat(css.paddingRight),
            borderTop: css.borderTopWidth,
            borderBottom: css.borderBottomWidth,
            borderRadius: css.borderRadius,
            outline: css.outlineStyle,
            wrapper: element.parentElement?.className,
          };
        });
        expect(style.paddingLeft).toBeGreaterThanOrEqual(10);
        expect(style.paddingRight).toBeGreaterThanOrEqual(10);
        expect(style.borderTop).toBe(style.borderBottom);
        expect(parseFloat(style.borderRadius)).toBeGreaterThan(4);
        expect(style.outline).toBe("none");
        expect(style.wrapper).toContain("editable-field");
      }
    }
  });

  test("subscription header keeps metadata together and actions aligned on desktop and mobile", async ({
    page,
  }) => {
    const longName =
      "Тестовая подписка с очень длинным названием, которое должно показывать многоточие при обрезке";
    await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://example.com/demo-rules", longName),
    ]);

    for (const width of [2048, 1440, 1150, 1024, 900, 851, 850, 740, 390, 360]) {
      await page.setViewportSize({ width, height: 860 });
      const dimensions = await page
        .locator(".subscription-panel")
        .first()
        .evaluate((element) => {
          const rect = (selector: string) => {
            const node = element.querySelector(selector);
            if (!node) throw new Error("Missing subscription element " + selector);
            return node.getBoundingClientRect();
          };
          return {
            headerHeight: rect(".subscription-header").height,
            nameY: rect(".subscription-name").y,
            nameCenter: rect(".subscription-name").y + rect(".subscription-name").height / 2,
            nameRight: rect(".subscription-name").right,
            metadataLeft: rect(".subscription-url").left,
            metadataRight: rect(".subscription-url").right,
            actionsLeft: rect(".subscription-actions").left,
            actionsY: rect(".subscription-actions").y,
            urlY: rect(".url-line").y,
            urlCenter: rect(".url-line").y + rect(".url-line").height / 2,
            actionsCenter:
              rect(".subscription-actions").y + rect(".subscription-actions").height / 2,
            updateY: rect(".update-line").y,
            updateBottom: rect(".update-line").bottom,
            updateCenter: rect(".update-line").y + rect(".update-line").height / 2,
            updateIntervalRight: rect(".update-interval [data-select-trigger]").right,
            updateTimeVisible:
              getComputedStyle(element.querySelector(".update-text")!).display !== "none",
            interfaceHeight: rect(".subscription-interface").height,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            nameTitle: element.querySelector<HTMLInputElement>(".subscription-name")?.title,
            nameTextOverflow: getComputedStyle(
              element.querySelector<HTMLInputElement>(".subscription-name")!,
            ).textOverflow,
          };
        });

      expect(dimensions.overflow).toBeLessThanOrEqual(1);
      expect(dimensions.nameTitle).toBe(longName);
      expect(dimensions.nameTextOverflow).toBe("ellipsis");
      expect(dimensions.updateTimeVisible).toBe(true);
      expect(dimensions.interfaceHeight).toBeLessThanOrEqual(40);
      if (width > 850) {
        expect(Math.abs(dimensions.updateCenter - dimensions.nameCenter)).toBeLessThanOrEqual(3);
      }
      expect(dimensions.updateBottom).toBeLessThanOrEqual(dimensions.urlY + 60);
      if (width > 850) {
        expect(dimensions.headerHeight).toBeLessThanOrEqual(54);
        expect(Math.abs(dimensions.nameY - dimensions.actionsY)).toBeLessThan(12);
        expect(Math.abs(dimensions.urlCenter - dimensions.actionsCenter)).toBeLessThanOrEqual(3);
        expect(dimensions.nameRight).toBeLessThanOrEqual(dimensions.metadataLeft + 1);
        expect(dimensions.updateIntervalRight).toBeLessThanOrEqual(dimensions.metadataLeft + 1);
        expect(dimensions.actionsLeft - dimensions.metadataRight).toBeGreaterThanOrEqual(4);
        expect(dimensions.actionsLeft - dimensions.metadataRight).toBeLessThanOrEqual(12);
      } else {
        expect(dimensions.urlY).toBeGreaterThanOrEqual(dimensions.updateBottom);
        expect(dimensions.actionsY).toBeGreaterThan(dimensions.urlY);
      }
    }

    await page.setViewportSize({ width: 1440, height: 860 });
    const selector = page.locator(".subscription-panel .action.interface [data-select-trigger]");
    await selector.click();
    await page.getByRole("option", { name: "wlan0" }).click();
    await expect(selector).toContainText("wlan0");
  });

  test("edits an existing subscription URL and saves it", async ({ page }) => {
    const state = await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://old.example/list.txt"),
    ]);

    const urlInput = page.locator(".subscription-url-input").first();
    await expect(urlInput).toHaveValue("https://old.example/list.txt");

    await urlInput.fill(" https://new.example/list.txt ");

    const saveButton = page.locator("#save-subscriptions");
    await expect(saveButton).not.toHaveClass(/inactive/);
    await saveButton.click();

    await expect(page.getByText("Saved")).toBeVisible();
    expect(state.savedBody?.subscriptions[0].url).toBe("https://new.example/list.txt");
  });

  test("prevents saving duplicate subscription URLs", async ({ page }) => {
    await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://one.example/list.txt", "One"),
      makeSubscription("b1c2d3e4", "https://two.example/list.txt", "Two"),
    ]);

    const urlInputs = page.locator(".subscription-url-input");
    await urlInputs.first().fill("https://two.example/list.txt");

    await expect(urlInputs.first()).toHaveClass(/invalid/);
    await expect(page.locator(".url-error")).toHaveCount(0);
    await expect(page.locator("#save-subscriptions")).toHaveClass(/inactive/);
  });

  test("syncs with the edited unsaved subscription URL", async ({ page }) => {
    const state = await setupSubscriptions(page, [
      makeSubscription("a1b2c3d4", "https://old.example/list.txt"),
    ]);

    await page.locator(".subscription-url-input").first().fill(" https://new.example/list.txt ");
    await page.locator(".action.sync button").first().click();

    expect(state.syncBody?.url).toBe("https://new.example/list.txt");
    await expect(page.locator(".subscription-url-input").first()).toHaveValue(
      "https://new.example/list.txt",
    );
    await expect(page.locator("#save-subscriptions")).toHaveClass(/inactive/);
    await expect(page.locator(".subscription-rule")).toContainText("synced.example.com");
  });
});
