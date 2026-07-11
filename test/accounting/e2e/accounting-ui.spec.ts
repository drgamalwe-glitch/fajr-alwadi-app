import { test, expect, type Page } from "@playwright/test";

const APP_URL = "http://localhost:1420";

async function login(page: Page) {
  await page.goto(APP_URL);
  await page.getByTestId("login-username").fill("admin");
  await page.getByTestId("login-password").fill("admin");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test.describe("Accounting UI — Login + Dashboard", () => {
  test("login page loads", async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page).toHaveTitle(/فجر الوادي|Fajr Alwadi/i);
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("admin can log in and reach the dashboard", async ({ page }) => {
    await login(page);
    await expect(page.getByTestId("nav-dashboard")).toHaveAttribute("aria-current", "page");
  });
});

test.describe("§22 UI — Cash Sale Journey", () => {
  test("create a sold cash car and persist the sale fields once", async ({ page }) => {
    await login(page);
    await page.getByTestId("nav-cars").click();
    await page.getByTestId("btn-add-car").click();

    await page.locator("#car-model").fill("TOYOTA");
    await page.locator("#car-year").fill("2026");
    await page.locator("#car-color").fill("أبيض");
    await page.locator("#car-num").fill("E2E-22");
    await page.locator("#car-chassis").fill("CH-E2E-22");
    await page.locator("#car-purchase").fill("10000000");
    await page.getByTestId("status-toggle").click();
    await page.locator("#buyer-name").fill("مشتري E2E");
    await page.locator("#buyer-phone").fill("07800000000");
    await page.locator("#car-selling").fill("20000000");
    await page.getByTestId("btn-save-car").click();

    await page.getByTestId("cars-subtab-sold").click();
    await expect(page.getByTestId("car-row-E2E-22")).toBeVisible();
    const cars = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_cars") || "[]"));
    expect(cars).toHaveLength(1);
    expect(cars[0]).toMatchObject({
      car_number: "E2E-22",
      status: "مبيوعة",
      payment_type: "كاش",
      buyer_name: "مشتري E2E",
    });
    expect(String(cars[0].selling_price)).toBe("20000000");
  });
});

test.describe("§31.4 UI — Agency Cash vs Credit", () => {
  test("credit agency persists as unreceived without changing its status", async ({ page }) => {
    await login(page);
    await page.getByTestId("nav-agencies").click();
    await page.getByRole("button", { name: "إضافة وكالة" }).click();
    await page.locator("#agency-old-agent").fill("وكيل E2E");
    await page.locator("#agency-new-agent").fill("زبون E2E");
    await page.locator("#agency-car-type").fill("TOYOTA");
    await page.locator("#agency-car-year").fill("2026");
    await page.locator("#agency-car-number").fill("AG-E2E-1");
    await page.locator("#agency-color").fill("أبيض");
    await page.getByRole("radio", { name: "غير واصل" }).click();
    await page.locator(".agency-finance-corner input").first().fill("1000000");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page.getByRole("button", { name: "تفاصيل" })).toBeVisible();

    const agencies = await page.evaluate(() => JSON.parse(localStorage.getItem("mock_agencies") || "[]"));
    expect(agencies).toHaveLength(1);
    expect(agencies[0]).toMatchObject({
      old_agent_name: "وكيل E2E",
      new_agent_name: "زبون E2E",
      payment_status: "غير واصل",
    });
    expect(String(agencies[0].amount_iqd)).toBe("1000000");
  });
});
