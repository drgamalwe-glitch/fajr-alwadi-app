import { test, expect } from "@playwright/test";

test("main sections remain reachable at a compact desktop size", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.addInitScript(() => localStorage.clear());
  await page.goto("http://localhost:1420");
  await page.getByTestId("login-username").fill("admin");
  await page.getByTestId("login-password").fill("admin");
  await page.getByTestId("login-submit").click();

  for (const tab of ["dashboard", "cars", "partners-financial", "financial-accounts", "expenses", "agencies"]) {
    const nav = page.getByTestId(`nav-${tab}`);
    await expect(nav).toBeVisible();
    await nav.click();
    await expect(nav).toHaveAttribute("aria-current", "page");
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
