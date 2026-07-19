import assert from "node:assert/strict";
import { assertDatabaseIntegrity, invoke, login } from "./support.mjs";

const domain = process.env.FAJR_E2E_DOMAIN;

describe(`Persistence after real Tauri restart: ${domain}`, () => {
  it("logs in through the UI and rechecks committed SQLite state", async () => {
    await login();

    if (domain === "cars") {
      assert.equal((await invoke("e2e_car_matches", { platePrefix: "E2E-BATCH" })).length, 25);
      assert.equal(
        (await invoke("e2e_car_matches", { chassisNumber: "E2E-DUP-CHASSIS" })).length,
        2,
      );
      const duplicates = await invoke("e2e_car_matches", { plateNumber: "E2E-DUP-PLATE" });
      assert.equal(duplicates.length, 2);
      assert.deepEqual(
        await invoke("e2e_car_expense_snapshot", { carId: duplicates[0].id }),
        [],
      );
    } else if (domain === "agencies-expenses") {
      const agencies = (await invoke("get_agencies")).filter((row) =>
        row.car_number.startsWith("E2E-AGENCY-"),
      );
      assert.equal(agencies.length, 23);
      for (const description of ["مصروف عام E2E IQD", "مصروف عام E2E USD"]) {
        const expense = await invoke("e2e_expense_snapshot", { description });
        assert.equal(expense.is_reversed, true);
        assert.ok(expense.reversal_expense_id);
      }
    } else if (domain === "accounts") {
      for (const [name, kind] of [
        ["مستثمر دورة E2E", "مستثمر"],
        ["ممول دورة E2E", "ممول"],
        ["شركة دورة E2E", "شركة"],
        ["شركة تسديد E2E", "شركة"],
        ["ممول وسيط E2E", "ممول"],
      ]) {
        const account = await invoke("e2e_account_snapshot", { name, kind });
        assert.equal(Number(account.iqd_balance), 0);
      }
      const mixed = await invoke("e2e_account_snapshot", {
        name: "حساب مختلط E2E",
        kind: "مستثمر",
      });
      assert.deepEqual(mixed.classifications.sort(), ["نطلب", "مطلوبين"].sort());
    } else if (domain === "installments-periods") {
      for (const plate of ["E2E-INSTALL-IQD", "E2E-INSTALL-USD"]) {
        const car = await invoke("e2e_car_snapshot", { plateNumber: plate });
        assert.equal(Number(car.amount_remaining), 0);
        assert.ok(car.installments.every((row) => row.status === "paid"));
      }
      const periods = await invoke("get_accounting_periods");
      assert.equal(periods.length, 1);
      assert.equal(periods[0].status, "closed");
      assert.equal(
        (await invoke("get_expenses")).some(
          (row) => row.description === "مصروف مرفوض بفترة مغلقة E2E",
        ),
        false,
      );
    } else if (domain === "installment-redistribution") {
      const iqd = await invoke("e2e_car_snapshot", {
        plateNumber: "E2E-INSTALL-REDIST-IQD",
      });
      assert.equal(iqd.installments.length, 6);
      assert.ok(iqd.installments.every((row) => row.status === "unpaid"));
      assert.ok(iqd.installments.every((row) => row.current_amount === "1000"));
      assert.equal(iqd.amount_remaining, "6000");

      const usd = await invoke("e2e_car_snapshot", {
        plateNumber: "E2E-INSTALL-REDIST-USD",
      });
      assert.deepEqual(
        usd.installments.map((row) => row.current_amount),
        ["1000", "999.67", "999.67", "999.66", "0.01"],
      );
      assert.deepEqual(
        usd.installments.map((row) => row.status),
        ["paid", "unpaid", "unpaid", "paid", "unpaid"],
      );
      assert.equal(usd.amount_remaining, "1999.35");
    } else {
      throw new Error(`Unknown E2E persistence domain: ${domain}`);
    }

    const integrity = await assertDatabaseIntegrity();
    if (domain === "agencies-expenses") {
      assert.equal(integrity.agencies_total, 25);
      assert.equal(integrity.cancelled_agencies, 2);
    }
  });
});
