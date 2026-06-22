import type { Page, Locator } from "@playwright/test";

export async function safeText(locator: Locator): Promise<string> {
  try {
    if ((await locator.count()) === 0) return "N/A";
    return (await locator.first().textContent() ?? "").trim();
  } catch {
    return "N/A";
  }
}

export async function login(page: Page) {
  await page.locator('[data-testid="login-username"]').fill("admin");
  await page.locator('[data-testid="login-password"]').fill("admin");
  await page.locator('[data-testid="login-submit"]').click();
  await page.locator('[data-testid="nav-dashboard"]').waitFor({ timeout: 15_000 });
}

export async function navigateTo(page: Page, tab: string) {
  await page.locator(`[data-testid="nav-${tab}"]`).click();
  await page.waitForTimeout(1000);
}

export async function resetBridgeState() {
  try {
    await fetch("http://127.0.0.1:3899/__e2e/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // bridge may not be running
  }
}

export async function bridgeInvoke(command: string, args: Record<string, unknown> = {}) {
  const res = await fetch("http://127.0.0.1:3899/__e2e/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}
