import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("locale", JSON.stringify({ value: "ru" }));
  if (!localStorage.getItem("magitrickle-theme")) {
    localStorage.setItem("magitrickle-theme", "dark");
  }
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".group-wrapper")).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator(".group-wrapper").first().locator("input.group-name")).toHaveValue(
    "Медиасервисы",
  );
  await expect(page.getByLabel("Сводка маршрутизации")).toContainText("Резервирование");
  console.log("PASS: groups and summary render");

  await page.getByRole("button", { name: "Настроить резервные интерфейсы" }).first().click();
  const settings = page.getByLabel("Резервирование интерфейсов").first();
  await expect(settings).toBeVisible();
  await expect(settings).toContainText("eth1");
  console.log("PASS: failover settings render");

  const controller = await browser.newPage();
  await controller.goto("http://127.0.0.1:6969/demo");
  await controller.getByRole("button", { name: "Резервный интерфейс" }).click();
  await expect(page.locator(".route-status").first()).toHaveText("eth1", { timeout: 11000 });
  console.log("PASS: backup scenario updates without page reload");
  await page.screenshot({
    path: "node_modules/.playwright-results/preview-desktop.png",
    fullPage: true,
  });

  await controller.getByRole("button", { name: "Все интерфейсы недоступны" }).click();
  await expect(page.locator(".route-status").first()).toHaveText("Заблокирован", {
    timeout: 11000,
  });
  console.log("PASS: blackhole scenario");

  await controller.getByRole("button", { name: "Не удалось применить маршрут" }).click();
  await expect(page.locator(".route-status").first()).toHaveText("Не применён", { timeout: 11000 });
  console.log("PASS: route-apply error scenario");

  await controller.getByRole("button", { name: "Основной интерфейс" }).click();
  await expect(page.locator(".route-status").first()).toHaveText("nwg0", { timeout: 11000 });
  console.log("PASS: recovery to primary");

  const target = settings.getByLabel("Проверка доступности (TCP, необязательно)");
  await target.fill("9.9.9.9:443");
  await page.locator("#save-changes").click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          "http://127.0.0.1:5173/api/v1/groups?with_rules=true",
        );
        const data = await response.json();
        return data.groups[0].check_target;
      },
      { timeout: 10000 },
    )
    .toBe("9.9.9.9:443");
  await page.reload();
  await expect(page.locator(".group-wrapper")).toHaveCount(3);
  await page.getByRole("button", { name: "Настроить резервные интерфейсы" }).first().click();
  await expect(
    page
      .getByLabel("Резервирование интерфейсов")
      .first()
      .getByLabel("Проверка доступности (TCP, необязательно)"),
  ).toHaveValue("9.9.9.9:443");
  console.log("PASS: edit/save/reload preserves group settings");

  await page.locator(".theme-switch select").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".group-wrapper")).toHaveCount(3, { timeout: 15000 });
  await page.screenshot({
    path: "node_modules/.playwright-results/preview-light.png",
    fullPage: true,
  });
  console.log("PASS: light theme persists");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Настроить резервные интерфейсы" }).first().click();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  if (dimensions.document > dimensions.viewport + 1) {
    throw new Error("Horizontal overflow on mobile: " + JSON.stringify(dimensions));
  }
  await page.screenshot({
    path: "node_modules/.playwright-results/preview-mobile.png",
    fullPage: true,
  });
  console.log("PASS: 390px mobile layout without overflow");

  if (errors.length) throw new Error("Browser exceptions: " + errors.join("; "));
  console.log("PASS: no uncaught browser exceptions");
  await controller.close();
  console.log("SUCCESS: visual browser preview validated");
} finally {
  await browser.close();
  await fetch("http://127.0.0.1:6969/demo/reset", { method: "POST" });
}
