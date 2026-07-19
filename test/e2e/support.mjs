import assert from "node:assert/strict";
import { Key } from "webdriverio";

export async function element(testId) {
  const target = await $(`[data-testid="${testId}"]`);
  await target.waitForExist();
  return target;
}

export async function click(testId) {
  await (await element(testId)).click();
}

export async function navigate(testId, targetTestId) {
  const navigation = await element(testId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await navigation.click();
    await browser.keys(["Enter"]);
    try {
      await browser.waitUntil(
        async () => (await $(`[data-testid="${targetTestId}"]`)).isExisting(),
        { timeout: 3000 },
      );
      return;
    } catch {
      await navigation.doubleClick();
    }
  }
  throw new Error(`Navigation ${testId} did not expose ${targetTestId}`);
}

export async function activate(testId, targetTestId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const target = await $(`[data-testid="${targetTestId}"]`);
    if (await target.isExisting()) return;
    const trigger = await $(`[data-testid="${testId}"]`);
    if (!(await trigger.isExisting())) {
      await target.waitForExist({ timeout: 12_000 });
      return;
    }
    await trigger.click();
    try {
      await browser.waitUntil(
        async () => (await $(`[data-testid="${targetTestId}"]`)).isExisting(),
        { timeout: 4000 },
      );
      return;
    } catch {
      // WKWebView may consume the first click as focus when a transformed
      // sidebar or modal has just settled. The next click is still a real UI action.
    }
  }
  throw new Error(`${testId} did not expose ${targetTestId}`);
}

export async function fill(selector, value) {
  const input = await $(selector);
  await input.waitForExist();
  await input.setValue(String(value));
}

export async function invoke(command, args = {}) {
  return browser.tauri.execute(
    ({ core }, commandName, commandArgs) => core.invoke(commandName, commandArgs),
    command,
    args,
  );
}

export async function login() {
  try {
    await browser.waitUntil(async () => {
      const dashboard = await $('[data-testid="nav-dashboard"]');
      const submit = await $('[data-testid="login-submit"]');
      return (await dashboard.isExisting()) || (await submit.isExisting());
    }, { timeout: 30_000 });
  } catch (error) {
    console.error(
      "E2E login surface did not appear:",
      await browser.execute(() => ({
        text: document.body.innerText.slice(0, 2000),
        testIds: [...document.querySelectorAll("[data-testid]")]
          .map((node) => node.getAttribute("data-testid"))
          .slice(0, 200),
      })),
    );
    throw error;
  }
  const dashboard = await $('[data-testid="nav-dashboard"]');
  if (await dashboard.isExisting()) {
    await dashboard.click();
    await click("dashboard-subtab-users");
    await click("btn-logout");
    await (await element("login-submit")).waitForExist();
  }
  const username = await $('[data-testid="login-username"]');
  const password = await $('[data-testid="login-password"]');
  const submit = await $('[data-testid="login-submit"]');
  await username.waitForExist();
  await username.setValue("admin");
  await password.setValue("admin");
  await submit.click();
  await (await $('[data-testid="nav-dashboard"]')).waitForExist();
}

export async function installErrorCollector() {
  await browser.execute(() => {
    globalThis.__fajrE2eErrors = [];
    const originalError = console.error.bind(console);
    console.error = (...args) => {
      globalThis.__fajrE2eErrors.push(args.map(String).join(" "));
      originalError(...args);
    };
    addEventListener("error", (event) => {
      globalThis.__fajrE2eErrors.push(`window.error: ${event.message}`);
    });
    addEventListener("unhandledrejection", (event) => {
      globalThis.__fajrE2eErrors.push(`unhandledrejection: ${String(event.reason)}`);
    });
  });
}

export async function clearFrontendErrors() {
  await browser.execute(() => {
    globalThis.__fajrE2eErrors = [];
  });
}

export async function assertNoFrontendErrors() {
  const errors = await browser.execute(() => globalThis.__fajrE2eErrors ?? []);
  assert.deepEqual(errors, [], `Frontend errors detected:\n${errors.join("\n")}`);
}

export async function assertDatabaseIntegrity() {
  const integrity = await invoke("e2e_integrity_snapshot");
  assert.equal(integrity.quick_check, "ok");
  assert.equal(integrity.foreign_key_violations, 0);
  assert.equal(integrity.unresolved_partner_source_ids, 0);
  assert.equal(integrity.unresolved_partner_related_ids, 0);
  assert.equal(integrity.unresolved_ledger_reference_ids, 0);
  assert.equal(integrity.duplicate_active_partner_sources, 0);
  assert.equal(integrity.unbalanced_operation_currency_groups, 0);
  assert.equal(integrity.orphan_operations, 0);
  assert.equal(Number(integrity.ledger_balance_iqd), 0);
  assert.equal(Number(integrity.ledger_balance_usd), 0);
  assert.equal(integrity.invalid_audit_events, 0);
  return integrity;
}

export async function selectCombobox(testId, value) {
  const input = await element(testId);
  await input.click();
  await input.setValue(value);
  await browser.keys([Key.Enter]);
  await browser.waitUntil(async () => (await input.getValue()).trim() === value);
}

export async function setPriceCurrency(inputId, currency) {
  const toggle = await element(`${inputId}-currency`);
  const current = (await toggle.getText()).trim();
  const isUsd = current === "USD";
  if ((currency === "USD") !== isUsd) {
    await toggle.click();
    await browser.waitUntil(async () => {
      const next = (await toggle.getText()).trim();
      return currency === "USD" ? next === "USD" : next !== "USD";
    });
  }
}

export async function openAccountsTab(tab = "customers") {
  await navigate("nav-partners-financial", `accounts-subtab-${tab}`);
  await click(`accounts-subtab-${tab}`);
}

export async function createAccount({ name, kind, phone = "07800000111" }) {
  await openAccountsTab("customers");
  await click("btn-add-account");
  await fill("#partner-name", name);
  await fill("#partner-phone", phone);
  await selectCombobox("partner-kind", kind);
  await click("btn-save-account");
  await openAccountsTab("customers");
  await click(`account-row-${name}`);
  await (await element("partner-account-detail")).waitForExist();
  await (await element("btn-account-deposit")).waitForExist();
}

export async function openAccount(name, tab = "customers") {
  await openAccountsTab(tab);
  await click(`account-row-${name}`);
  await (await element("partner-account-detail")).waitForExist();
  await (await element("btn-account-deposit")).waitForExist();
}

export async function addOpenAccountTransaction({
  action,
  amount,
  currency = "IQD",
  notes = "",
  commission = "0",
  transferBy = "",
  companyMode,
  funderName,
}) {
  await activate(
    action === "deposit" ? "btn-account-deposit" : "btn-account-withdraw",
    "partner-transaction-dialog",
  );
  await (await element("partner-transaction-dialog")).waitForExist();
  await setPriceCurrency("partner-transaction-amount", currency);
  await fill("#partner-transaction-amount", amount);

  if (companyMode === "cash") {
    await click("company-payment-cash");
  } else if (companyMode === "funder") {
    await click("company-payment-funder");
    await selectCombobox("company-settlement-funder", funderName);
  }

  const commissionInput = await $("#partner-funder-commission");
  if (await commissionInput.isExisting()) {
    await setPriceCurrency("partner-funder-commission", currency);
    await commissionInput.setValue(String(commission));
  }
  const transferInput = await $("#partner-transfer-by");
  if (await transferInput.isExisting()) {
    await transferInput.setValue(transferBy);
  }
  const notesInput = await $('[data-testid="partner-transaction-notes"]');
  if (await notesInput.isExisting()) {
    await notesInput.setValue(notes);
  }
  await click("btn-save-partner-transaction");
  await (await $('[data-testid="partner-transaction-dialog"]')).waitForExist({
    reverse: true,
    timeout: 30_000,
  });
  await (await element("partner-account-detail")).waitForExist();
}

export async function clickButtonByText(text, rootSelector = "body") {
  const root = await $(rootSelector);
  const buttons = await root.$$("button");
  for (const button of buttons) {
    if ((await button.getText()).trim() === text) {
      await button.click();
      return;
    }
  }
  throw new Error(`Button not found: ${text}`);
}
