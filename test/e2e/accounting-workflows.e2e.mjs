import assert from "node:assert/strict";
import { Key } from "webdriverio";

const ADMIN_PASSWORD = "admin";
const plates = {
  cash: "E2E-CASH-101",
  financed: "E2E-FIN-102",
  company: "E2E-COMP-103",
  unsold: "E2E-EDIT-104",
};
const customers = {
  due: "زبون موعد E2E",
  installment: "زبون أقساط E2E",
};

async function element(testId) {
  const target = await $(`[data-testid="${testId}"]`);
  await target.waitForDisplayed();
  return target;
}

async function click(testId) {
  await (await element(testId)).click();
}

async function fill(selector, value) {
  const input = await $(selector);
  await input.waitForDisplayed();
  await input.setValue(String(value));
}

async function setNumberInputWithArrows(selector, value) {
  const input = await $(selector);
  await input.waitForDisplayed();
  await input.click();
  const target = Number(value);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const current = Number(await input.getValue());
    if (current === target) {
      return;
    }

    const next = current < target ? current + 1 : current - 1;
    await browser.keys([current < target ? Key.ArrowUp : Key.ArrowDown]);
    await browser.waitUntil(async () => Number(await input.getValue()) === next);
  }

  throw new Error(`Could not set ${selector} to ${target} using the real NumberInput controls`);
}

async function clickButtonByText(text, rootSelector = "body") {
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

async function invoke(command, args = {}) {
  return browser.tauri.execute(
    ({ core }, commandName, commandArgs) => core.invoke(commandName, commandArgs),
    command,
    args,
  );
}

async function carSnapshot(plate) {
  return invoke("e2e_car_snapshot", { plateNumber: plate });
}

async function assertNoFrontendErrors() {
  const errors = await browser.execute(() => globalThis.__fajrE2eErrors ?? []);
  assert.deepEqual(errors, [], `Frontend errors detected:\n${errors.join("\n")}`);
}

async function assertDatabaseIntegrity() {
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

async function clearFrontendErrors() {
  await browser.execute(() => {
    globalThis.__fajrE2eErrors = [];
  });
}

async function installErrorCollector() {
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

async function openCars(subtab = "available") {
  const carsNavigation = await element("nav-cars");
  if ((await carsNavigation.getAttribute("aria-current")) !== "page") {
    await carsNavigation.click();
  }
  await switchCarSubtab(subtab);
}

async function switchCarSubtab(subtab) {
  const carsPage = await $(".cars-page");
  await carsPage.waitForDisplayed();
  if ((await carsPage.getAttribute("data-active-tab")) !== subtab) {
    await click(`cars-subtab-${subtab}`);
  }
}

async function quickAddPartner(kind, name, phone = "07800000001") {
  const testId =
    kind === "ممول"
      ? "quick-add-financer"
      : kind === "شركة"
        ? "quick-add-company"
        : "quick-add-customer";
  await click(testId);
  await fill('[data-testid="quick-add-partner-name"]', name);
  await fill('[data-testid="quick-add-partner-phone"]', phone);
  await click("quick-add-partner-save");
  await (await $(`[data-testid="quick-add-${kind}-dialog"]`)).waitForExist({ reverse: true });
}

async function fillBaseCar({ plate, chassis, model, year, color, purchase }) {
  await fill("#car-model", model);
  await fill("#car-year", year);
  await fill("#car-color", color);
  await fill("#car-num", plate);
  await fill("#car-chassis", chassis);
  await fill("#car-purchase", purchase);
}

async function createAvailableCar({
  plate,
  chassis,
  model,
  year = "2026",
  color = "أبيض",
  purchase,
  purchaseType = "كاش",
  partnerName,
}) {
  await openCars("available");
  await click("btn-add-car");
  await fillBaseCar({ plate, chassis, model, year, color, purchase });
  await click(`purchase-type-${purchaseType}`);
  if (purchaseType === "تمويل") {
    await quickAddPartner("ممول", partnerName);
  } else if (purchaseType === "شركة") {
    await quickAddPartner("شركة", partnerName);
  }
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
  await switchCarSubtab("available");
  await (await element("btn-add-car")).waitForDisplayed();
  await (await element(`car-row-${plate}`)).waitForDisplayed();
}

async function openCar(plate, subtab) {
  await openCars(subtab);
  await click(`car-row-${plate}`);
  await (await $("#car-form")).waitForDisplayed();
}

async function openSoldCarSaleDetails(plate) {
  await openCar(plate, "sold");
  await click("car-form-tab-sale");
  await (await $("#sale-container")).waitForDisplayed();
}

async function saveCarAndWaitForRow(plate, subtab) {
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
  await switchCarSubtab(subtab);
  await (await element(`car-row-${plate}`)).waitForDisplayed();
}

async function sellCar({
  plate,
  paymentType,
  buyer,
  phone,
  selling,
  downPayment = "0",
  months = "1",
}) {
  await openCar(plate, "available");
  await click("status-toggle");
  await click(`payment-type-${paymentType}`);
  if (paymentType === "كاش") {
    await fill("#buyer-name", buyer);
    await fill("#buyer-phone", phone);
  } else {
    await quickAddPartner("زبون", buyer, phone);
  }
  await fill("#car-selling", selling);
  if (paymentType !== "كاش") {
    await fill("#amount-paid", downPayment);
  }
  if (paymentType === "اقساط") {
    // The component intentionally clamps an empty value back to its minimum.
    // Drive its real ArrowUp/ArrowDown behavior instead of bypassing React.
    await setNumberInputWithArrows("#installment-months", months);
  }
  await saveCarAndWaitForRow(plate, "sold");
}

async function cancelCar(plate, subtab) {
  await openCars(subtab);
  const row = await element(`car-row-${plate}`);
  await click(`delete-car-${plate}`);
  const dialog = await $('[role="alertdialog"]');
  await dialog.waitForDisplayed();
  const message = await dialog.getText();
  assert.match(message, /عكس جميع قيود الشراء والبيع والأرباح والدفعات والأقساط/);
  await click("confirm-car-cancellation");
  await row.waitForExist({ reverse: true });
}

describe("Fajr Al-Wadi real Tauri accounting workflows", () => {
  before(async () => {
    await (await element("login-submit")).waitForDisplayed();
    await installErrorCollector();
    await fill('[data-testid="login-username"]', "admin");
    await fill('[data-testid="login-password"]', ADMIN_PASSWORD);
    await click("login-submit");
    await (await element("nav-dashboard")).waitForDisplayed();
    const initial = await assertDatabaseIntegrity();
    assert.equal(initial.cars_total, 0);
    assert.equal(initial.active_sales, 0);
    assert.equal(initial.agencies_total, 0);
    assert.equal(initial.expenses_total, 0);
    assert.equal(initial.ledger_rows, 0);
    assert.equal(initial.partner_transaction_rows, 0);
    await assertNoFrontendErrors();
  });

  beforeEach(async () => {
    await clearFrontendErrors();
  });

  afterEach(async () => {
    await assertNoFrontendErrors();
    await assertDatabaseIntegrity();
  });

  it("adds cars through the UI using cash, financing, and company purchase types", async () => {
    await createAvailableCar({
      plate: plates.cash,
      chassis: "VIN-E2E-CASH-101",
      model: "TOYOTA CASH",
      purchase: "10000000",
    });
    await createAvailableCar({
      plate: plates.financed,
      chassis: "VIN-E2E-FIN-102",
      model: "KIA FINANCED",
      purchase: "20000000",
      purchaseType: "تمويل",
      partnerName: "ممول E2E",
    });
    await createAvailableCar({
      plate: plates.company,
      chassis: "VIN-E2E-COMP-103",
      model: "FORD COMPANY",
      purchase: "30000000",
      purchaseType: "شركة",
      partnerName: "شركة E2E",
    });
    await createAvailableCar({
      plate: plates.unsold,
      chassis: "VIN-E2E-EDIT-104",
      model: "NISSAN BEFORE EDIT",
      purchase: "12000000",
    });

    assert.equal((await carSnapshot(plates.cash)).purchase_type, "كاش");
    assert.equal((await carSnapshot(plates.financed)).purchase_type, "دين");
    assert.equal((await carSnapshot(plates.company)).purchase_type, "شركة");
  });

  it("edits unsold specifications and purchase price before any sale", async () => {
    await openCar(plates.unsold, "available");
    await fill("#car-model", "NISSAN AFTER EDIT");
    await fill("#car-year", "2025");
    await fill("#car-color", "أسود");
    await fill("#car-purchase", "12500000");
    await saveCarAndWaitForRow(plates.unsold, "available");

    const snapshot = await carSnapshot(plates.unsold);
    assert.equal(snapshot.car_model, "NISSAN AFTER EDIT");
    assert.equal(snapshot.car_year, "2025");
    assert.equal(snapshot.color, "أسود");
    assert.equal(snapshot.purchase_price, "12500000");
    assert.equal(snapshot.status, "متوفرة");
  });

  it("sells cars through the UI as cash, delivery-date, and installments", async () => {
    await sellCar({
      plate: plates.cash,
      paymentType: "كاش",
      buyer: "مشتري نقدي E2E",
      phone: "07800000010",
      selling: "14000000",
    });
    await sellCar({
      plate: plates.financed,
      paymentType: "موعد",
      buyer: customers.due,
      phone: "07800000011",
      selling: "26000000",
      downPayment: "6000000",
    });
    await sellCar({
      plate: plates.company,
      paymentType: "اقساط",
      buyer: customers.installment,
      phone: "07800000012",
      selling: "42000000",
      downPayment: "6000000",
      months: "6",
    });

    const cash = await carSnapshot(plates.cash);
    const due = await carSnapshot(plates.financed);
    const installments = await carSnapshot(plates.company);
    assert.equal(cash.payment_type, "كاش");
    assert.equal(cash.active_profit_total, "4000000");
    assert.equal(due.payment_type, "موعد");
    assert.equal(due.amount_remaining, "20000000");
    assert.equal(installments.payment_type, "اقساط");
    assert.equal(installments.installments.length, 6);
    assert.deepEqual(
      installments.installments.map((row) => row.current_amount),
      Array(6).fill("6000000"),
    );
  });

  it("updates sold car specifications, purchase cost, sale price, and exact profit", async () => {
    await openCar(plates.cash, "sold");
    await fill("#car-model", "TOYOTA SOLD EDITED");
    await fill("#car-color", "لؤلؤي");
    await fill("#car-purchase", "11000000");
    await saveCarAndWaitForRow(plates.cash, "sold");

    let snapshot = await carSnapshot(plates.cash);
    assert.equal(snapshot.car_model, "TOYOTA SOLD EDITED");
    assert.equal(snapshot.color, "لؤلؤي");
    assert.equal(snapshot.purchase_price, "11000000");
    assert.equal(snapshot.active_profit_total, "3000000");

    await openSoldCarSaleDetails(plates.cash);
    await fill("#car-selling", "15000000");
    await saveCarAndWaitForRow(plates.cash, "sold");
    snapshot = await carSnapshot(plates.cash);
    assert.equal(snapshot.selling_price, "15000000");
    assert.equal(snapshot.active_profit_total, "4000000");
  });

  it("reduces a delivery-date balance automatically when the selling price changes", async () => {
    const before = await carSnapshot(plates.financed);
    await openSoldCarSaleDetails(plates.financed);
    await fill("#car-selling", "24000000");
    await saveCarAndWaitForRow(plates.financed, "sold");
    const after = await carSnapshot(plates.financed);
    assert.equal(after.amount_paid, "6000000");
    assert.equal(after.amount_remaining, "18000000");
    assert.notEqual(after.active_profit_total, before.active_profit_total);
  });

  it("preserves the paid installment and redistributes only unpaid installments equally", async () => {
    let snapshot = await carSnapshot(plates.company);
    const firstInstallment = snapshot.installments[0];
    assert.ok(firstInstallment.legacy_transaction_id);

    await click("nav-partners-financial");
    await click("accounts-subtab-receivables");
    await click(`account-row-${customers.installment}`);
    await click(`partner-transaction-row-${firstInstallment.legacy_transaction_id}`);
    await (await element("installment-payment-dialog")).waitForDisplayed();
    const confirm = await element("confirm-installment-payment");
    await confirm.waitForEnabled();
    await confirm.click();
    await (await $('[data-testid="installment-payment-dialog"]')).waitForExist({ reverse: true });

    snapshot = await carSnapshot(plates.company);
    const paidBeforeEdit = snapshot.installments.find((row) => row.id === firstInstallment.id);
    assert.equal(paidBeforeEdit.status, "paid");
    assert.equal(paidBeforeEdit.current_amount, "6000000");
    assert.equal(paidBeforeEdit.actual_paid_amount, "6000000");

    await openSoldCarSaleDetails(plates.company);
    await fill("#car-selling", "39000000");
    await saveCarAndWaitForRow(plates.company, "sold");

    const after = await carSnapshot(plates.company);
    const paidAfterEdit = after.installments.find((row) => row.id === firstInstallment.id);
    const unpaid = after.installments.filter((row) => row.status === "unpaid");
    assert.equal(after.amount_paid, "12000000");
    assert.equal(after.amount_remaining, "27000000");
    assert.equal(paidAfterEdit.id, firstInstallment.id);
    assert.equal(paidAfterEdit.current_amount, "6000000");
    assert.equal(paidAfterEdit.actual_paid_amount, "6000000");
    assert.equal(unpaid.length, 5);
    assert.deepEqual(unpaid.map((row) => row.current_amount), Array(5).fill("5400000"));
  });

  it("opens deposit and withdrawal dialogs without logging the operator out", async () => {
    await click("nav-partners-financial");
    await click("accounts-subtab-receivables");
    await click(`account-row-${customers.due}`);

    await click("btn-account-deposit");
    await (await element("partner-transaction-dialog")).waitForDisplayed();
    assert.equal(await (await element("nav-dashboard")).isDisplayed(), true);
    await clickButtonByText("إلغاء", '[data-testid="partner-transaction-dialog"]');
    await (await $('[data-testid="partner-transaction-dialog"]')).waitForExist({ reverse: true });

    await click("btn-account-withdraw");
    await (await element("partner-transaction-dialog")).waitForDisplayed();
    assert.equal(await (await element("nav-dashboard")).isDisplayed(), true);
    await clickButtonByText("إلغاء", '[data-testid="partner-transaction-dialog"]');
  });

  it("manages a user through the real users screen", async () => {
    const username = "e2e_operator";
    await click("nav-dashboard");
    await click("dashboard-subtab-users");
    await click("btn-add-user");
    await fill('[data-testid="user-username"]', username);
    await fill('[data-testid="user-display-name"]', "مشغل E2E");
    await fill('[data-testid="user-password"]', "Operator-E2E-2026!");
    await click("btn-save-user");
    await (await element(`user-row-${username}`)).waitForDisplayed();

    await click(`delete-user-${username}`);
    await click("confirm-dialog-confirm");
    await (await $(`[data-testid="user-row-${username}"]`)).waitForExist({ reverse: true });
  });

  it("loads the dashboard and cash report from the same real accounting database", async () => {
    await click("nav-dashboard");
    await (await element("dashboard-root")).waitForDisplayed();
    await click("dashboard-subtab-main");
    const dashboardText = await (await element("dashboard-root")).getText();
    assert.match(dashboardText, /نطلب/);
    assert.match(dashboardText, new RegExp(customers.due));

    await click("nav-financial-accounts");
    const cashReport = await element("cash-register-root");
    await cashReport.waitForDisplayed();
    assert.match(await cashReport.getText(), /بيع سيارة|ايداع|إيداع/);
  });

  it("cancels unsold and all sold car types with complete accounting reversals", async () => {
    await cancelCar(plates.unsold, "available");
    await cancelCar(plates.cash, "sold");
    await cancelCar(plates.financed, "sold");
    await cancelCar(plates.company, "sold");

    for (const plate of Object.values(plates)) {
      const snapshot = await carSnapshot(plate);
      assert.equal(snapshot.status, "محذوفة");
      assert.equal(Number(snapshot.active_profit_total), 0);
      assert.equal(snapshot.active_related_transactions, 0);
      assert.equal(snapshot.active_related_ledger_rows, 0);
      assert.ok(snapshot.reversed_related_transactions > 0);
      assert.ok(snapshot.audit_events >= 2);
    }
    const installmentSnapshot = await carSnapshot(plates.company);
    assert.ok(installmentSnapshot.installments.every((row) => row.status === "cancelled"));
  });

  it("creates and cancels received and unreceived agencies with their records", async () => {
    const created = [];
    for (const [index, status] of ["واصل", "غير واصل"].entries()) {
      await click("nav-agencies");
      await click("btn-add-agency");
      await fill("#agency-old-agent", `وكيل قديم ${index}`);
      await fill("#agency-new-agent", `وكيل جديد ${index}`);
      await fill("#agency-car-type", "TOYOTA");
      await fill("#agency-car-year", "2026");
      await fill("#agency-car-number", `AG-E2E-${index + 1}`);
      await fill("#agency-color", "أبيض");
      await click(`agency-payment-status-${status}`);
      await fill("#agency-amount-iqd", String((index + 1) * 1000000));
      const saveAgencyButton = await element("btn-save-agency");
      await saveAgencyButton.click();
      // WKWebView can focus a button without dispatching its click when the
      // transformed RTL form is still settling. Enter activates the same real
      // focused control; the UI's in-flight guard prevents duplicate saves.
      await browser.keys([Key.Enter]);
      await saveAgencyButton.waitForExist({ reverse: true });

      const agencies = await invoke("get_agencies");
      const agency = agencies.find((item) => item.car_number === `AG-E2E-${index + 1}`);
      assert.ok(agency);
      assert.equal(agency.payment_status, status);
      created.push(agency);
    }

    for (const agency of created) {
      await click("nav-agencies");
      const row = await element(`agency-row-${agency.id}`);
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
  });

  it("creates and reverses an expense with all related accounting records", async () => {
    const description = "مصروف E2E تدقيق فعلي";
    await click("nav-expenses");
    await click("btn-add-expense");
    await fill("#expense-description", description);
    await fill("#expense-amount", "750000");
    await fill("#expense-notes", "اختبار عكس كامل");
    await click("btn-save-expense");

    const expenses = await invoke("get_expenses");
    const expense = expenses.find((item) => item.description === description);
    assert.ok(expense);
    const row = await element(`expense-row-${expense.id}`);
    await click(`delete-expense-${expense.id}`);
    const dialog = await element("confirm-dialog");
    assert.match(await dialog.getText(), /المصروف الأصلي وقيد العكس وسجل التدقيق/);
    await click("confirm-dialog-confirm");
    await row.waitForExist({ reverse: true });

    const snapshot = await invoke("e2e_expense_snapshot", { description });
    assert.equal(snapshot.is_reversed, true);
    assert.ok(snapshot.reversal_expense_id);
    assert.equal(snapshot.active_transactions, 0);
    assert.equal(snapshot.active_ledger_rows, 0);
    assert.ok(snapshot.reversed_transactions > 0 || snapshot.reversed_ledger_rows > 0);
    assert.ok(snapshot.audit_events >= 2);
  });

  it("finishes with a healthy, balanced database and structured audit trail", async () => {
    await assertDatabaseIntegrity();
  });
});
