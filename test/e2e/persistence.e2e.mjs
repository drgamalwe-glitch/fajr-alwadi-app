import assert from "node:assert/strict";

async function element(testId) {
  const target = await $(`[data-testid="${testId}"]`);
  await target.waitForDisplayed();
  return target;
}

async function fill(selector, value) {
  const input = await $(selector);
  await input.waitForDisplayed();
  await input.setValue(String(value));
}

async function invoke(command, args = {}) {
  return browser.tauri.execute(
    ({ core }, commandName, commandArgs) => core.invoke(commandName, commandArgs),
    command,
    args,
  );
}

describe("Persistence after a real Tauri application restart", () => {
  it("logs in normally and verifies the committed accounting state after restart", async () => {
    await fill('[data-testid="login-username"]', "admin");
    await fill('[data-testid="login-password"]', "admin");
    await (await element("login-submit")).click();
    await (await element("nav-dashboard")).waitForDisplayed();

    for (const plate of ["E2E-CASH-101", "E2E-FIN-102", "E2E-COMP-103", "E2E-EDIT-104"]) {
      const car = await invoke("e2e_car_snapshot", { plateNumber: plate });
      assert.equal(car.status, "محذوفة");
      assert.equal(car.active_related_transactions, 0);
      assert.equal(car.active_related_ledger_rows, 0);
    }

    const expense = await invoke("e2e_expense_snapshot", {
      description: "مصروف E2E تدقيق فعلي",
    });
    assert.equal(expense.is_reversed, true);
    assert.ok(expense.reversal_expense_id);

    const integrity = await invoke("e2e_integrity_snapshot");
    assert.equal(integrity.quick_check, "ok");
    assert.equal(integrity.foreign_key_violations, 0);
    assert.equal(integrity.active_sales, 0);
    assert.equal(integrity.cars_total, 4);
    assert.equal(integrity.agencies_total, 2);
    assert.equal(integrity.cancelled_agencies, 2);
    assert.equal(integrity.expenses_total, 2);
    assert.equal(integrity.duplicate_active_partner_sources, 0);
    assert.equal(integrity.unbalanced_operation_currency_groups, 0);
    assert.equal(integrity.orphan_operations, 0);
    assert.equal(Number(integrity.ledger_balance_iqd), 0);
    assert.equal(Number(integrity.ledger_balance_usd), 0);
    assert.equal(integrity.invalid_audit_events, 0);
  });
});
