import assert from "node:assert/strict";
import { Key } from "webdriverio";
import {
  activate,
  assertDatabaseIntegrity,
  assertNoFrontendErrors,
  clearFrontendErrors,
  click,
  element,
  fill,
  installErrorCollector,
  invoke,
  login,
  openAccount,
  setPriceCurrency,
} from "./support.mjs";

async function setInstallmentMonths(months) {
  const input = await $("#installment-months");
  await input.waitForExist();
  await input.click();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = Number(await input.getValue());
    if (current === months) return;
    await browser.keys([current < months ? Key.ArrowUp : Key.ArrowDown]);
  }
  throw new Error(`Could not set installment months to ${months}`);
}

async function createInstallmentSale({ plate, chassis, customer, currency }) {
  await click("nav-cars");
  await click("cars-subtab-available");
  await click("btn-add-car");
  await fill("#car-model", `INSTALLMENT ${currency}`);
  await fill("#car-year", "2026");
  await fill("#car-color", "أبيض");
  await fill("#car-num", plate);
  await fill("#car-chassis", chassis);
  await setPriceCurrency("car-purchase", currency);
  await fill("#car-purchase", currency === "IQD" ? "1000000" : "1000");
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

  await click("cars-subtab-available");
  await click(`car-row-${plate}`);
  await click("status-toggle");
  await click("payment-type-اقساط");
  await click("quick-add-customer");
  await fill('[data-testid="quick-add-partner-name"]', customer);
  await fill('[data-testid="quick-add-partner-phone"]', "07800000777");
  await click("quick-add-partner-save");
  await (await $('[data-testid="quick-add-زبون-dialog"]')).waitForExist({ reverse: true });
  await setPriceCurrency("car-selling", currency);
  await fill("#car-selling", currency === "IQD" ? "4000000" : "4000");
  await fill("#amount-paid", currency === "IQD" ? "1000000" : "1000");
  await setInstallmentMonths(3);
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
}

async function carSnapshot(plate) {
  return invoke("e2e_car_snapshot", { plateNumber: plate });
}

async function accountSnapshot(name) {
  return invoke("e2e_account_snapshot", { name, kind: "زبون" });
}

async function handleInstallment(customer, transactionId, mode) {
  const classification = (await accountSnapshot(customer)).classifications;
  await openAccount(customer, classification.includes("نطلب") ? "receivables" : "customers");
  await click(`partner-transaction-row-${transactionId}`);
  const dialog = await element("installment-payment-dialog");
  await dialog.waitForExist();
  assert.match(await dialog.getText(), mode === "reverse" ? /إلغاء دفعة قسط/ : /تسديد قسط/);
  const confirm = await element("confirm-installment-payment");
  await confirm.waitForEnabled();
  await confirm.click();
  await dialog.waitForExist({ reverse: true, timeout: 30_000 });
  const accountDetail = await element("partner-account-detail");
  await accountDetail.waitForExist();
  assert.equal(
    await accountDetail.getAttribute("data-account-name"),
    customer,
    `customer account ${customer} must remain open after installment ${mode}`,
  );
  const visibleOperationType = await element(`partner-transaction-type-${transactionId}`);
  assert.equal(
    (await visibleOperationType.getText()).trim(),
    mode === "reverse" ? "باقي" : "واصل",
    `visible installment operation must update after ${mode}`,
  );
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

describe("Real Tauri installment completion, reversal, and closed periods", () => {
  before(async () => {
    await installErrorCollector();
    await login();
    await assertDatabaseIntegrity();
  });

  beforeEach(clearFrontendErrors);

  afterEach(async () => {
    await assertNoFrontendErrors();
    await assertDatabaseIntegrity();
  });

  it("creates real IQD and USD installment sales through the React UI", async () => {
    await createInstallmentSale({
      plate: "E2E-INSTALL-IQD",
      chassis: "E2E-INSTALL-IQD-VIN",
      customer: "زبون أقساط IQD E2E",
      currency: "IQD",
    });
    await createInstallmentSale({
      plate: "E2E-INSTALL-USD",
      chassis: "E2E-INSTALL-USD-VIN",
      customer: "زبون أقساط USD E2E",
      currency: "USD",
    });

    for (const plate of ["E2E-INSTALL-IQD", "E2E-INSTALL-USD"]) {
      const car = await carSnapshot(plate);
      assert.equal(car.payment_type, "اقساط");
      assert.equal(car.installments.length, 3);
      assert.ok(car.installments.every((row) => row.status === "unpaid"));
    }
  });

  it("pays every installment and routes both settled customers to customers only", async () => {
    for (const [plate, customer] of [
      ["E2E-INSTALL-IQD", "زبون أقساط IQD E2E"],
      ["E2E-INSTALL-USD", "زبون أقساط USD E2E"],
    ]) {
      let car = await carSnapshot(plate);
      for (const installment of car.installments) {
        assert.ok(installment.legacy_transaction_id);
        await handleInstallment(customer, installment.legacy_transaction_id, "pay");
      }

      car = await carSnapshot(plate);
      assert.ok(car.installments.every((row) => row.status === "paid"));
      assert.equal(Number(car.amount_remaining), 0);
      assert.equal(Number(car.amount_paid), Number(car.selling_price));
      const account = await accountSnapshot(customer);
      assert.deepEqual(account.classifications, ["العملاء"]);

      await click("nav-partners-financial");
      await click("accounts-subtab-customers");
      assert.equal(await (await element(`account-row-${customer}`)).isDisplayed(), true);
      await click("accounts-subtab-receivables");
      assert.equal(await $(`[data-testid="account-row-${customer}"]`).isExisting(), false);
    }
  });

  it("reverses one paid installment, returns the customer to receivables, then repays it", async () => {
    const plate = "E2E-INSTALL-IQD";
    const customer = "زبون أقساط IQD E2E";
    let car = await carSnapshot(plate);
    const first = car.installments[0];
    await handleInstallment(customer, first.legacy_transaction_id, "reverse");

    car = await carSnapshot(plate);
    const reversedInstallment = car.installments.find((row) => row.id === first.id);
    assert.equal(reversedInstallment.status, "unpaid");
    assert.match(reversedInstallment.transaction_type, /^باقي/);
    assert.ok(Number(car.amount_remaining) > 0);
    assert.deepEqual((await accountSnapshot(customer)).classifications, ["نطلب"]);

    await handleInstallment(customer, first.legacy_transaction_id, "pay");
    car = await carSnapshot(plate);
    assert.equal(car.installments.find((row) => row.id === first.id).status, "paid");
    assert.equal(Number(car.amount_remaining), 0);
    assert.deepEqual((await accountSnapshot(customer)).classifications, ["العملاء"]);
  });

  it("closes an accounting period and rejects a UI expense without any partial write", async () => {
    const today = todayIso();
    await click("nav-dashboard");
    await click("dashboard-subtab-periods");
    await (await element("accounting-periods-root")).waitForExist();
    await click("btn-new-accounting-period");
    await fill('[data-testid="accounting-period-start"]', today);
    await fill('[data-testid="accounting-period-end"]', today);
    await click("btn-save-accounting-period");

    const periods = await invoke("get_accounting_periods");
    const period = periods.find((row) => row.start_date === today && row.end_date === today);
    assert.ok(period);
    await click(`btn-close-accounting-period-${period.id}`);
    await fill('[data-testid="accounting-period-reason"]', "إغلاق E2E للتحقق من منع الكتابة الجزئية");
    await activate(
      "btn-confirm-accounting-period-status",
      `btn-reopen-accounting-period-${period.id}`,
    );
    await (await element(`btn-reopen-accounting-period-${period.id}`)).waitForExist();

    await click("nav-expenses");
    await click("btn-add-expense");
    await fill("#expense-description", "مصروف مرفوض بفترة مغلقة E2E");
    await fill("#expense-amount", "123456");
    await click("btn-save-expense");
    const dialog = await element("expense-dialog");
    assert.match(await dialog.getText(), /الفترة.*مغلقة|مغلقة.*الفترة/);
    assert.equal(
      (await invoke("get_expenses")).some(
        (row) => row.description === "مصروف مرفوض بفترة مغلقة E2E",
      ),
      false,
    );
  });
});
