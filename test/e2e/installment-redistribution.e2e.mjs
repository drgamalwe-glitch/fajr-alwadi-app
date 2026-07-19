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
  openAccount,
  setPriceCurrency,
} from "./support.mjs";

const IQD_PLATE = "E2E-INSTALL-REDIST-IQD";
const IQD_CUSTOMER = "زبون إعادة توزيع IQD E2E";
const USD_PLATE = "E2E-INSTALL-REDIST-USD";
const USD_CUSTOMER = "زبون إعادة توزيع USD E2E";

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

async function createInstallmentSale({
  plate,
  customer,
  currency,
  sellingPrice,
  downPayment,
  months,
}) {
  await click("nav-cars");
  await click("cars-subtab-available");
  await click("btn-add-car");
  await fill("#car-model", `REDISTRIBUTION ${currency}`);
  await fill("#car-year", "2026");
  await fill("#car-color", "أبيض");
  await fill("#car-num", plate);
  await fill("#car-chassis", `${plate}-VIN`);
  await setPriceCurrency("car-purchase", currency);
  await fill("#car-purchase", currency === "IQD" ? "1000" : "100");
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

  await click("cars-subtab-available");
  await click(`car-row-${plate}`);
  await click("status-toggle");
  await click("payment-type-اقساط");
  await click("quick-add-customer");
  await fill('[data-testid="quick-add-partner-name"]', customer);
  await fill('[data-testid="quick-add-partner-phone"]', "07800000888");
  await click("quick-add-partner-save");
  await (await $('[data-testid="quick-add-زبون-dialog"]')).waitForExist({ reverse: true });
  await setPriceCurrency("car-selling", currency);
  await fill("#car-selling", sellingPrice);
  await fill("#amount-paid", downPayment);
  await setInstallmentMonths(months);
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
}

async function carSnapshot(plate) {
  return invoke("e2e_car_snapshot", { plateNumber: plate });
}

async function accountSnapshot(customer) {
  return invoke("e2e_account_snapshot", { name: customer, kind: "زبون" });
}

async function openInstallmentPayment(customer, transactionId, actualAmount) {
  const classifications = (await accountSnapshot(customer)).classifications;
  await openAccount(customer, classifications.includes("نطلب") ? "receivables" : "customers");
  await click(`partner-transaction-row-${transactionId}`);
  await (await element("installment-payment-dialog")).waitForExist();
  await fill('[data-testid="installment-actual-paid"]', actualAmount);
}

async function waitForPreview(direction, affectedCount) {
  await browser.waitUntil(
    async () => (await (await element("installment-preview-direction")).getText()).includes(direction),
    { timeout: 12_000 },
  );
  await browser.waitUntil(async () => {
    const text = await (await element("installment-preview-affected-count")).getText();
    return affectedCount === 0 ? text.includes("لا يوجد") : text.includes(String(affectedCount));
  });
  const rows = await $$('[data-testid^="installment-preview-row-"]');
  assert.equal(rows.length, affectedCount);
}

async function confirmPayment({ doubleClick = false } = {}) {
  const confirm = await element("confirm-installment-payment");
  await confirm.waitForEnabled();
  if (doubleClick) await confirm.doubleClick();
  else await confirm.click();
  await (await $('[data-testid="installment-payment-dialog"]')).waitForExist({
    reverse: true,
    timeout: 30_000,
  });
}

async function reversePayment(customer, transactionId) {
  const classifications = (await accountSnapshot(customer)).classifications;
  await openAccount(customer, classifications.includes("نطلب") ? "receivables" : "customers");
  await click(`partner-transaction-row-${transactionId}`);
  const dialog = await element("installment-payment-dialog");
  assert.match(await dialog.getText(), /إلغاء دفعة قسط/);
  await confirmPayment();
}

async function expectRejectedPreview(messagePattern) {
  const error = await element("installment-payment-error");
  await browser.waitUntil(async () => messagePattern.test(await error.getText()), {
    timeout: 12_000,
  });
  assert.equal(await (await element("confirm-installment-payment")).isEnabled(), false);
  await click("close-installment-payment");
  await (await $('[data-testid="installment-payment-dialog"]')).waitForExist({ reverse: true });
}

function amounts(rows) {
  return rows.map((row) => row.current_amount);
}

describe("Real Tauri installment underpayment, overpayment, and redistribution", () => {
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

  it("creates independent IQD and USD installment sales through the real UI", async () => {
    await createInstallmentSale({
      plate: IQD_PLATE,
      customer: IQD_CUSTOMER,
      currency: "IQD",
      sellingPrice: "7000",
      downPayment: "1000",
      months: 6,
    });
    await createInstallmentSale({
      plate: USD_PLATE,
      customer: USD_CUSTOMER,
      currency: "USD",
      sellingPrice: "5000",
      downPayment: "1000",
      months: 4,
    });

    assert.deepEqual(amounts((await carSnapshot(IQD_PLATE)).installments), Array(6).fill("1000"));
    assert.deepEqual(amounts((await carSnapshot(USD_PLATE)).installments), Array(4).fill("1000"));
  });

  it("pays an IQD installment short and increases only future unpaid installments equally", async () => {
    let car = await carSnapshot(IQD_PLATE);
    const first = car.installments[0];
    await openInstallmentPayment(IQD_CUSTOMER, first.legacy_transaction_id, "500");
    await waitForPreview("زيادة", 5);
    await confirmPayment();

    car = await carSnapshot(IQD_PLATE);
    assert.equal(car.installments[0].status, "paid");
    assert.equal(car.installments[0].actual_paid_amount, "500");
    assert.deepEqual(amounts(car.installments.slice(1)), Array(5).fill("1100"));
    assert.equal(car.amount_remaining, "5500");

    await reversePayment(IQD_CUSTOMER, first.legacy_transaction_id);
    car = await carSnapshot(IQD_PLATE);
    assert.ok(car.installments.every((row) => row.status === "unpaid"));
    assert.deepEqual(amounts(car.installments), Array(6).fill("1000"));
  });

  it("pays an IQD installment extra and reduces only future unpaid installments equally", async () => {
    let car = await carSnapshot(IQD_PLATE);
    const first = car.installments[0];
    await openInstallmentPayment(IQD_CUSTOMER, first.legacy_transaction_id, "2000");
    await waitForPreview("تخفيض", 5);
    await confirmPayment({ doubleClick: true });

    car = await carSnapshot(IQD_PLATE);
    assert.equal(car.installments[0].actual_paid_amount, "2000");
    assert.deepEqual(amounts(car.installments.slice(1)), Array(5).fill("800"));
    assert.equal(car.amount_remaining, "4000");
    const accountTransactions = (await accountSnapshot(IQD_CUSTOMER)).transactions;
    const reversedTransactionIds = new Set(
      accountTransactions
        .map((row) => row.reverses_transaction_id)
        .filter((id) => id != null),
    );
    const activePayments = accountTransactions.filter(
      (row) =>
        row.source_type === "customer_payment" &&
        !row.is_reversed &&
        !reversedTransactionIds.has(row.id),
    );
    assert.equal(activePayments.length, 1);

    await reversePayment(IQD_CUSTOMER, first.legacy_transaction_id);
    car = await carSnapshot(IQD_PLATE);
    assert.deepEqual(amounts(car.installments), Array(6).fill("1000"));
  });

  it("rejects unsafe overpayment without any partial SQLite write", async () => {
    let car = await carSnapshot(IQD_PLATE);
    const before = structuredClone(car.installments);
    await openInstallmentPayment(IQD_CUSTOMER, car.installments[0].legacy_transaction_id, "6001");
    await expectRejectedPreview(/أكبر من مجموع الأقساط المتبقية/);

    car = await carSnapshot(IQD_PLATE);
    assert.deepEqual(car.installments, before);

    const last = car.installments.at(-1);
    await openInstallmentPayment(IQD_CUSTOMER, last.legacy_transaction_id, "1500");
    await expectRejectedPreview(/دفعة زائدة على آخر قسط/);
    assert.deepEqual((await carSnapshot(IQD_PLATE)).installments, before);
  });

  it("creates a later installment when the last installment is paid short and removes it on reversal", async () => {
    let car = await carSnapshot(IQD_PLATE);
    const originalLast = car.installments.at(-1);
    await openInstallmentPayment(IQD_CUSTOMER, originalLast.legacy_transaction_id, "500");
    await waitForPreview("زيادة", 1);
    assert.match(await (await element("installment-preview-row-0")).getText(), /سيتم إنشاء قسط لاحق/);
    await confirmPayment();

    car = await carSnapshot(IQD_PLATE);
    assert.equal(car.installments.length, 7);
    assert.equal(car.installments[5].status, "paid");
    assert.equal(car.installments[5].actual_paid_amount, "500");
    assert.equal(car.installments[6].status, "unpaid");
    assert.equal(car.installments[6].current_amount, "500");
    assert.ok(car.installments[6].id !== originalLast.id);

    await reversePayment(IQD_CUSTOMER, originalLast.legacy_transaction_id);
    car = await carSnapshot(IQD_PLATE);
    assert.equal(car.installments.length, 6);
    assert.ok(car.installments.every((row) => row.status === "unpaid"));
    assert.deepEqual(amounts(car.installments), Array(6).fill("1000"));
  });

  it("settles every future installment when one advance payment covers the full remaining balance", async () => {
    let car = await carSnapshot(IQD_PLATE);
    const first = car.installments[0];
    const coveredLast = car.installments.at(-1);
    await openInstallmentPayment(IQD_CUSTOMER, first.legacy_transaction_id, "6000");
    await waitForPreview("تخفيض", 5);
    await confirmPayment();

    car = await carSnapshot(IQD_PLATE);
    assert.equal(car.amount_remaining, "0");
    assert.ok(car.installments.every((row) => row.status === "paid"));
    assert.ok(car.installments.slice(1).every((row) => row.current_amount === "0"));
    assert.deepEqual((await accountSnapshot(IQD_CUSTOMER)).classifications, ["العملاء"]);

    await reversePayment(IQD_CUSTOMER, coveredLast.legacy_transaction_id);
    car = await carSnapshot(IQD_PLATE);
    assert.ok(car.installments.every((row) => row.status === "unpaid"));
    assert.equal(car.amount_remaining, "6000");
    assert.deepEqual((await accountSnapshot(IQD_CUSTOMER)).classifications, ["نطلب"]);
  });

  it("redistributes an underpayment in USD using exact cent precision", async () => {
    let car = await carSnapshot(USD_PLATE);
    const first = car.installments[0];
    await openInstallmentPayment(USD_CUSTOMER, first.legacy_transaction_id, "999");
    await waitForPreview("زيادة", 3);
    await confirmPayment();

    car = await carSnapshot(USD_PLATE);
    assert.deepEqual(amounts(car.installments.slice(1)), ["1000.33", "1000.33", "1000.34"]);
    assert.equal(car.amount_remaining, "3001");

    await reversePayment(USD_CUSTOMER, first.legacy_transaction_id);
    car = await carSnapshot(USD_PLATE);
    assert.deepEqual(amounts(car.installments), Array(4).fill("1000"));
  });

  it("redistributes an USD overpayment and persists a one-cent later installment", async () => {
    let car = await carSnapshot(USD_PLATE);
    const first = car.installments[0];
    await openInstallmentPayment(USD_CUSTOMER, first.legacy_transaction_id, "1001");
    await waitForPreview("تخفيض", 3);
    await confirmPayment();

    car = await carSnapshot(USD_PLATE);
    assert.deepEqual(amounts(car.installments.slice(1)), ["999.67", "999.67", "999.66"]);
    const last = car.installments.at(-1);
    await openInstallmentPayment(USD_CUSTOMER, last.legacy_transaction_id, "999.65");
    await waitForPreview("زيادة", 1);
    await confirmPayment();

    car = await carSnapshot(USD_PLATE);
    assert.equal(car.installments.length, 5);
    assert.equal(car.installments.at(-1).current_amount, "0.01");
    assert.equal(car.installments.at(-1).status, "unpaid");
    assert.equal(car.amount_remaining, "1999.35");
    assert.equal(
      car.installments.reduce((total, row) =>
        total + (row.status === "unpaid" ? Number(row.current_amount) : 0), 0),
      Number(car.amount_remaining),
    );
  });
});
