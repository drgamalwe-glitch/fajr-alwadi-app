import assert from "node:assert/strict";
import { Key } from "webdriverio";
import {
  assertDatabaseIntegrity,
  assertNoFrontendErrors,
  clearFrontendErrors,
  click,
  element,
  fill,
  installErrorCollector,
  invoke,
  login,
  navigate,
  setPriceCurrency,
} from "./support.mjs";

async function addExpense({ description, amount, currency }) {
  await navigate("nav-expenses", "btn-add-expense");
  await click("btn-add-expense");
  await fill("#expense-description", description);
  await setPriceCurrency("expense-amount", currency);
  await fill("#expense-amount", amount);
  await fill("#expense-notes", `E2E ${currency}`);
  await click("btn-save-expense");
  await (await $('[data-testid="expense-dialog"]')).waitForExist({ reverse: true, timeout: 30_000 });
  const expenses = await invoke("get_expenses");
  const expense = expenses.find((row) => row.description === description);
  assert.ok(expense);
  await (await element(`expense-row-${expense.id}`)).waitForExist();
  return expense;
}

async function deleteExpense(expense) {
  await navigate("nav-expenses", "btn-add-expense");
  const row = await element(`expense-row-${expense.id}`);
  await click(`delete-expense-${expense.id}`);
  const dialog = await element("confirm-dialog");
  assert.match(await dialog.getText(), /قيد العكس|سجل التدقيق/);
  await click("confirm-dialog-confirm");
  await row.waitForExist({ reverse: true });
}

async function addAgency(index) {
  const received = index < 13;
  const currency = index % 2 === 0 ? "IQD" : "USD";
  const plate = `E2E-AGENCY-${String(index + 1).padStart(2, "0")}`;
  await navigate("nav-agencies", "btn-add-agency");
  await click("btn-add-agency");
  await fill("#agency-old-agent", `وكيل قديم ${index + 1}`);
  await fill("#agency-new-agent", `وكيل جديد ${index + 1}`);
  await fill("#agency-car-type", "TOYOTA");
  await fill("#agency-car-year", "2026");
  await fill("#agency-car-number", plate);
  await fill("#agency-color", index % 2 === 0 ? "أبيض" : "أسود");
  await click(`agency-payment-status-${received ? "واصل" : "غير واصل"}`);
  if (currency === "IQD") {
    await fill("#agency-amount-iqd", String((index + 1) * 100000));
  } else {
    await fill("#agency-amount-usd", String((index + 1) * 100));
  }
  const save = await element("btn-save-agency");
  await save.click();
  await browser.keys([Key.Enter]);
  await save.waitForExist({ reverse: true, timeout: 30_000 });
  return { plate, received, currency };
}

async function findAgencyRow(agencyId) {
  const selector = `[data-testid="agency-row-${agencyId}"]`;
  const direct = await $(selector);
  if (await direct.isExisting()) return direct;
  const pages = await $$(".table-page-dot");
  for (const page of pages) {
    await page.click();
    const row = await $(selector);
    if (await row.isExisting()) return row;
  }
  throw new Error(`Agency row ${agencyId} was not found on any visible page`);
}

describe("Real Tauri agencies and expenses accounting records", () => {
  before(async () => {
    await installErrorCollector();
    await login();
    const initial = await assertDatabaseIntegrity();
    assert.equal(initial.agencies_total, 0);
    assert.equal(initial.expenses_total, 0);
  });

  beforeEach(clearFrontendErrors);

  afterEach(async () => {
    await assertNoFrontendErrors();
    await assertDatabaseIntegrity();
  });

  it("adds IQD and USD expenses through the UI and verifies every active record", async () => {
    const iqd = await addExpense({
      description: "مصروف عام E2E IQD",
      amount: "750000",
      currency: "IQD",
    });
    const usd = await addExpense({
      description: "مصروف عام E2E USD",
      amount: "125.50",
      currency: "USD",
    });

    const iqdSnapshot = await invoke("e2e_expense_snapshot", {
      description: iqd.description,
    });
    const usdSnapshot = await invoke("e2e_expense_snapshot", {
      description: usd.description,
    });
    assert.equal(iqdSnapshot.amount, "750000");
    assert.equal(iqdSnapshot.currency, "IQD");
    assert.equal(usdSnapshot.amount, "125.5");
    assert.equal(usdSnapshot.currency, "USD");
    for (const snapshot of [iqdSnapshot, usdSnapshot]) {
      assert.equal(snapshot.is_reversed, false);
      assert.ok(snapshot.active_transactions > 0 || snapshot.active_ledger_rows > 0);
      assert.ok(snapshot.audit_events > 0);
    }
  });

  it("deletes both expenses through the UI and leaves only complete reversals", async () => {
    const expenses = await invoke("get_expenses");
    for (const description of ["مصروف عام E2E IQD", "مصروف عام E2E USD"]) {
      const expense = expenses.find((row) => row.description === description);
      assert.ok(expense);
      await deleteExpense(expense);
      const snapshot = await invoke("e2e_expense_snapshot", { description });
      assert.equal(snapshot.is_reversed, true);
      assert.ok(snapshot.reversal_expense_id);
      assert.equal(snapshot.active_transactions, 0);
      assert.equal(snapshot.active_ledger_rows, 0);
      assert.ok(snapshot.reversed_transactions > 0 || snapshot.reversed_ledger_rows > 0);
      assert.ok(snapshot.audit_events >= 2);
    }
  });

  it("adds 25 agencies across statuses and currencies without duplicate accounting rows", async () => {
    const expected = [];
    for (let index = 0; index < 25; index += 1) {
      expected.push(await addAgency(index));
    }

    const agencies = await invoke("get_agencies");
    const created = agencies.filter((row) => row.car_number.startsWith("E2E-AGENCY-"));
    assert.equal(created.length, 25);
    assert.equal(created.filter((row) => row.payment_status === "واصل").length, 13);
    assert.equal(created.filter((row) => row.payment_status === "غير واصل").length, 12);
    assert.equal(new Set(created.map((row) => row.id)).size, 25);

    for (const item of expected) {
      const agency = created.find((row) => row.car_number === item.plate);
      assert.ok(agency);
      const snapshot = await invoke("e2e_agency_snapshot", { agencyId: agency.id });
      assert.equal(snapshot.payment_status, item.received ? "واصل" : "غير واصل");
      if (item.currency === "IQD") {
        assert.ok(Number(snapshot.amount_iqd) > 0);
        assert.equal(Number(snapshot.amount_usd), 0);
      } else {
        assert.ok(Number(snapshot.amount_usd) > 0);
        assert.equal(Number(snapshot.amount_iqd), 0);
      }
      assert.ok(snapshot.active_transactions > 0 || snapshot.active_ledger_rows > 0);
      assert.ok(snapshot.audit_events > 0);
    }
  });

  it("cancels one received and one unreceived agency while preserving the other 23", async () => {
    const agencies = (await invoke("get_agencies")).filter((row) =>
      row.car_number.startsWith("E2E-AGENCY-"),
    );
    const targets = [
      agencies.find((row) => row.payment_status === "واصل"),
      agencies.find((row) => row.payment_status === "غير واصل"),
    ];
    assert.ok(targets.every(Boolean));

    for (const agency of targets) {
      await navigate("nav-agencies", "btn-add-agency");
      const row = await findAgencyRow(agency.id);
      await (await row.$(`button[aria-label="حذف الوكالة ${agency.id}"]`)).click();
      const dialog = await element("confirm-dialog");
      assert.match(await dialog.getText(), /عكس مبالغها ومعاملاتها وقيودها/);
      await click("confirm-dialog-confirm");
      await row.waitForExist({ reverse: true });

      const snapshot = await invoke("e2e_agency_snapshot", { agencyId: agency.id });
      assert.equal(snapshot.payment_status, "محذوفة");
      assert.equal(snapshot.active_transactions, 0);
      assert.equal(snapshot.active_ledger_rows, 0);
      assert.ok(snapshot.reversed_transactions > 0 || snapshot.reversed_ledger_rows > 0);
      assert.ok(snapshot.audit_events >= 2);
    }

    const remaining = (await invoke("get_agencies")).filter(
      (row) => row.car_number.startsWith("E2E-AGENCY-") && row.payment_status !== "محذوفة",
    );
    assert.equal(remaining.length, 23);
  });
});
