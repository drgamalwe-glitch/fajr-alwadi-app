import assert from "node:assert/strict";
import {
  addOpenAccountTransaction,
  assertDatabaseIntegrity,
  assertNoFrontendErrors,
  clearFrontendErrors,
  click,
  createAccount,
  element,
  fill,
  installErrorCollector,
  invoke,
  login,
  openAccount,
  openAccountsTab,
} from "./support.mjs";

async function snapshot(name, kind) {
  return invoke("e2e_account_snapshot", { name, kind });
}

async function transact(name, kind, transaction) {
  const account = await snapshot(name, kind);
  const tab = kind === "شريك"
    ? "personal"
    : account.classifications.includes("نطلب")
      ? "receivables"
      : account.classifications.includes("مطلوبين")
        ? "liabilities"
        : "customers";
  await openAccount(name, tab);
  await addOpenAccountTransaction(transaction);
  const accountDetail = await element("partner-account-detail");
  assert.equal(
    await accountDetail.getAttribute("data-account-name"),
    name,
    `account ${name} must remain open after ${transaction.action}`,
  );
}

async function assertVisibleOnlyIn(name, visibleTabs) {
  for (const tab of ["customers", "receivables", "liabilities"]) {
    await openAccountsTab(tab);
    const row = await $(`[data-testid="account-row-${name}"]`);
    assert.equal(await row.isExisting(), visibleTabs.includes(tab), `${name} in ${tab}`);
  }
}

async function addGeneralExpense() {
  await click("nav-expenses");
  await click("btn-add-expense");
  await fill("#expense-description", "مصروف توزيع الشركاء E2E");
  await fill("#expense-amount", "200000");
  await click("btn-save-expense");
  await (await $('[data-testid="expense-dialog"]')).waitForExist({ reverse: true, timeout: 30_000 });
}

async function createCashProfit() {
  await click("nav-cars");
  await click("cars-subtab-available");
  await click("btn-add-car");
  await fill("#car-model", "PROFIT E2E");
  await fill("#car-year", "2026");
  await fill("#car-color", "أبيض");
  await fill("#car-num", "E2E-PROFIT-CAR");
  await fill("#car-chassis", "E2E-PROFIT-VIN");
  await fill("#car-purchase", "1000000");
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });

  await click("cars-subtab-available");
  await click("car-row-E2E-PROFIT-CAR");
  await click("status-toggle");
  await click("payment-type-كاش");
  await fill("#buyer-name", "مشتري ربح E2E");
  await fill("#buyer-phone", "07800000999");
  await fill("#car-selling", "2000000");
  await click("btn-save-car");
  await (await $("#car-form")).waitForExist({ reverse: true, timeout: 30_000 });
}

describe("Real Tauri account balances, settlements, and partner allocations", () => {
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

  it("runs IQD and USD deposit/withdraw cycles for investor, funder, and company", async () => {
    for (const [index, kind] of ["مستثمر", "ممول", "شركة"].entries()) {
      const name = `${kind} دورة E2E`;
      await createAccount({ name, kind, phone: `0780000020${index}` });
      await transact(name, kind, {
        action: "deposit",
        amount: "1000000",
        currency: "IQD",
        notes: "إيداع IQD من الواجهة",
      });
      await transact(name, kind, {
        action: "withdraw",
        amount: "1000000",
        currency: "IQD",
        notes: "سحب IQD من الواجهة",
      });
      await transact(name, kind, {
        action: "deposit",
        amount: "250.50",
        currency: "USD",
        notes: "إيداع USD من الواجهة",
      });
      await transact(name, kind, {
        action: "withdraw",
        amount: "250.50",
        currency: "USD",
        notes: "سحب USD من الواجهة",
      });

      const account = await snapshot(name, kind);
      assert.equal(Number(account.iqd_balance), 0);
      assert.equal(Number(account.usd_balance), 0);
      assert.deepEqual(account.classifications, ["العملاء"]);
      assert.equal(account.active_transactions, 4);
      assert.equal(account.operation_count, 4);
      assert.ok(account.transactions.every((row) => row.operation_id));
      assert.ok(account.transactions.every((row) => !row.affects_profit));
      await assertVisibleOnlyIn(name, ["customers"]);
    }
  });

  it("classifies zero, positive, negative, and mixed currency balances exactly", async () => {
    await createAccount({ name: "حساب موجب E2E", kind: "مستثمر" });
    await transact("حساب موجب E2E", "مستثمر", {
      action: "deposit",
      amount: "500000",
      currency: "IQD",
    });
    assert.deepEqual((await snapshot("حساب موجب E2E", "مستثمر")).classifications, ["نطلب"]);
    await assertVisibleOnlyIn("حساب موجب E2E", ["receivables"]);

    await createAccount({ name: "حساب سالب E2E", kind: "مستثمر" });
    await transact("حساب سالب E2E", "مستثمر", {
      action: "withdraw",
      amount: "500000",
      currency: "IQD",
    });
    assert.deepEqual((await snapshot("حساب سالب E2E", "مستثمر")).classifications, ["مطلوبين"]);
    await assertVisibleOnlyIn("حساب سالب E2E", ["liabilities"]);

    await createAccount({ name: "حساب مختلط E2E", kind: "مستثمر" });
    await transact("حساب مختلط E2E", "مستثمر", {
      action: "deposit",
      amount: "750000",
      currency: "IQD",
    });
    await transact("حساب مختلط E2E", "مستثمر", {
      action: "withdraw",
      amount: "125",
      currency: "USD",
    });
    assert.deepEqual(
      (await snapshot("حساب مختلط E2E", "مستثمر")).classifications.sort(),
      ["نطلب", "مطلوبين"].sort(),
    );
    await assertVisibleOnlyIn("حساب مختلط E2E", ["receivables", "liabilities"]);
  });

  it("settles company debt by cash and by a funder without an incorrect cash movement", async () => {
    const company = "شركة تسديد E2E";
    const funder = "ممول وسيط E2E";
    await createAccount({ name: funder, kind: "ممول" });
    await openAccountsTab("customers");
    await createAccount({ name: company, kind: "شركة" });

    await transact(company, "شركة", {
      action: "withdraw",
      amount: "1000000",
      currency: "IQD",
      notes: "إنشاء دين الشركة",
    });
    assert.equal(Number((await snapshot(company, "شركة")).iqd_balance), -1000000);
    await transact(company, "شركة", {
      action: "deposit",
      amount: "1000000",
      currency: "IQD",
      companyMode: "cash",
      notes: "تسديد الشركة كاش",
    });
    assert.equal(Number((await snapshot(company, "شركة")).iqd_balance), 0);

    await transact(company, "شركة", {
      action: "withdraw",
      amount: "2000000",
      currency: "IQD",
      notes: "دين شركة يمول لاحقاً",
    });
    await transact(company, "شركة", {
      action: "deposit",
      amount: "2000000",
      currency: "IQD",
      companyMode: "funder",
      funderName: funder,
      notes: "تسديد الشركة بواسطة ممول",
    });

    const companyAfter = await snapshot(company, "شركة");
    const funderAfter = await snapshot(funder, "ممول");
    assert.equal(Number(companyAfter.iqd_balance), 0);
    assert.equal(Number(funderAfter.iqd_balance), -2000000);
    assert.ok(
      companyAfter.transactions.some((row) => row.source_type === "company_funder_settlement"),
    );
    assert.ok(
      funderAfter.transactions.some((row) => row.source_type === "company_funder_settlement"),
    );
  });

  it("repays funder principal and records commission as a separate real expense", async () => {
    const funder = "ممول وسيط E2E";
    await transact(funder, "ممول", {
      action: "deposit",
      amount: "2000000",
      currency: "IQD",
      commission: "100000",
      transferBy: "مكتب صرافة E2E",
      notes: "تسديد أصل الممول مع عمولة",
    });

    const account = await snapshot(funder, "ممول");
    assert.equal(Number(account.iqd_balance), 0);
    assert.deepEqual(account.classifications, ["العملاء"]);
    assert.ok(account.transactions.some((row) => row.notes?.includes("عمولة")));

    const expenses = await invoke("get_expenses");
    const commissionExpense = expenses.find((row) => row.description.includes("عمولة"));
    assert.ok(commissionExpense);
    const expenseSnapshot = await invoke("e2e_expense_snapshot", {
      description: commissionExpense.description,
    });
    assert.equal(Number(expenseSnapshot.amount), 100000);
    assert.equal(expenseSnapshot.is_reversed, false);
  });

  it("keeps manual partner cash movements out of profit and allocates real profit/expense 50/50", async () => {
    const partners = (await invoke("get_partners")).filter((row) => row.kind === "شريك");
    assert.equal(partners.length, 2);

    await openAccountsTab("personal");
    await click(`account-row-${partners[0].partner_name}`);
    await (await element("btn-account-deposit")).waitForExist();
    await transact(partners[0].partner_name, "شريك", {
      action: "deposit",
      amount: "300000",
      currency: "IQD",
      notes: "حركة شريك يدوية",
    });
    await transact(partners[0].partner_name, "شريك", {
      action: "withdraw",
      amount: "300000",
      currency: "IQD",
      notes: "عكس حركة الشريك اليدوية",
    });
    let firstPartner = await snapshot(partners[0].partner_name, "شريك");
    const manualRows = firstPartner.transactions.filter((row) =>
      row.notes?.includes("حركة شريك") || row.notes?.includes("حركة الشريك"),
    );
    assert.equal(manualRows.length, 2);
    assert.ok(manualRows.every((row) => !row.affects_profit));

    await addGeneralExpense();
    await createCashProfit();

    const partnerSnapshots = await Promise.all(
      partners.map((partner) => snapshot(partner.partner_name, "شريك")),
    );
    const activeProfitTotals = partnerSnapshots.map((account) =>
      account.transactions
        .filter(
          (row) =>
            row.affects_profit &&
            !row.is_reversed &&
            row.reverses_transaction_id == null,
        )
        .reduce((total, row) => total + Number(row.amount), 0),
    );
    assert.equal(activeProfitTotals[0], activeProfitTotals[1]);
    assert.ok(activeProfitTotals[0] > 0);
    for (const account of partnerSnapshots) {
      assert.ok(account.transactions.some((row) => row.affects_profit));
    }
    firstPartner = partnerSnapshots[0];
    assert.ok(firstPartner.audit_events > 0);
  });
});
