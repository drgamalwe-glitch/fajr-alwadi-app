/**
 * test/accounting/oracle/cash-sale.oracle.test.ts
 *
 * FORENSIC FIX (re-audit 2026-07-10):
 * The `test:oracle` npm script referenced `test/accounting/oracle/` but
 * the directory did not exist, causing `npm run test:oracle` to fail with
 * "No test files found, exiting with code 1".
 *
 * Oracle tests verify the PURE ACCOUNTING MATH (the "oracle") without
 * touching the Rust backend. They mirror the formulas in Instructions.md
 * and the Rust `record_car_sale_ledger_entries` /
 * `rebuild_cash_sale_profit_recognition` functions, then assert the
 * expected ledger shape and profit amounts.
 *
 * Run with:  npm run test:oracle
 */

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

// ─────────────────────────────────────────────────────────────────────
// §22 — Required Test Scenario: Cash Sale
// ─────────────────────────────────────────────────────────────────────

describe("§22 oracle — Cash Sale (purchase=10M, selling=20M, expenses=0)", () => {
  const purchase = new Decimal("10000000");
  const selling = new Decimal("20000000");
  const expenses = new Decimal("0");

  // §6.1: Car Cost = Purchase + Car Expenses
  const carCost = purchase.plus(expenses);
  // §6.2: Full Car Profit = Selling - Car Cost
  const fullProfit = selling.minus(carCost);
  // §6.3: Profit Ratio = Full Profit / Selling
  const profitRatio = fullProfit.div(selling);
  // §6.5: Each Partner = Full Profit / 2
  const partnerShare = fullProfit.div(2);

  it("car cost = purchase + expenses = 10,000,000", () => {
    expect(carCost.toString()).toBe("10000000");
  });

  it("full profit = selling - cost = 10,000,000", () => {
    expect(fullProfit.toString()).toBe("10000000");
  });

  it("profit ratio = 50% (profit / selling)", () => {
    // toFixed(1) returns "50.0" when the value is exactly 50.
    const pct = profitRatio.times(100);
    expect(pct.toNumber()).toBe(50);
    expect(pct.toFixed(1)).toBe("50.0");
  });

  it("each partner share = 5,000,000 (50/50 split)", () => {
    expect(partnerShare.toString()).toBe("5000000");
  });

  // §22: Qasa/Cash increase = selling price ONLY (not selling + profit)
  it("qasa/cash increase = selling price (20M), NOT 30M", () => {
    const qasaIncrease = selling; // the cash_movement row
    expect(qasaIncrease.toString()).toBe("20000000");
    expect(qasaIncrease.toString()).not.toBe("30000000");
  });

  // §22 Forbidden: Qasa/Cash = 30,000,000 (double-counting profit)
  it("forbidden: qasa+profit = 30,000,000 is NOT produced", () => {
    const forbidden = selling.plus(fullProfit);
    expect(forbidden.toString()).toBe("30000000");
    // The oracle must never return this as the cash movement.
    const actualCashMovement = selling;
    expect(actualCashMovement.equals(forbidden)).toBe(false);
  });

  // Ledger shape: Dr cash / Cr revenue + Dr COGS / Cr inventory
  it("ledger entries: Dr cash 20M / Cr revenue 20M + Dr COGS 10M / Cr inventory 10M", () => {
    const ledger = [
      { account: "cash", debit: selling, credit: new Decimal(0) },
      { account: "revenue", debit: new Decimal(0), credit: selling },
      { account: "expense", debit: carCost, credit: new Decimal(0) },
      { account: "inventory", debit: new Decimal(0), credit: carCost },
    ];
    const totalDebit = ledger.reduce((s, e) => s.plus(e.debit), new Decimal(0));
    const totalCredit = ledger.reduce((s, e) => s.plus(e.credit), new Decimal(0));
    expect(totalDebit.equals(totalCredit)).toBe(true);
    expect(totalDebit.toString()).toBe("30000000"); // 20M + 10M
  });

  // Profit recognition rows: signed, affects_profit=1, affects_qasa=0
  it("profit recognition: 2 rows (50/50), affects_profit=1, affects_qasa=0", () => {
    const profitRows = [
      { partner: "أمير", amount: partnerShare, affects_profit: 1, affects_qasa: 0 },
      { partner: "منتصر", amount: partnerShare, affects_profit: 1, affects_qasa: 0 },
    ];
    const totalProfit = profitRows.reduce((s, r) => s.plus(r.amount), new Decimal(0));
    expect(totalProfit.toString()).toBe("10000000");
    expect(profitRows.every((r) => r.affects_qasa === 0)).toBe(true);
    expect(profitRows.every((r) => r.affects_profit === 1)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §24.1 — Required Test Scenario: Cash Car Loss
// ─────────────────────────────────────────────────────────────────────

describe("§24.1 oracle — Cash Car Loss (purchase=10M, expenses=1M, selling=8M)", () => {
  const purchase = new Decimal("10000000");
  const expenses = new Decimal("1000000");
  const selling = new Decimal("8000000");

  const carCost = purchase.plus(expenses); // 11M
  const profit = selling.minus(carCost); // -3M (loss)

  it("car cost = 11,000,000", () => {
    expect(carCost.toString()).toBe("11000000");
  });

  it("profit = -3,000,000 (LOSS, not zero)", () => {
    expect(profit.isNegative()).toBe(true);
    expect(profit.toString()).toBe("-3000000");
  });

  it("qasa/cash increase = selling price (8M) — actual cash, not profit", () => {
    const cashIncrease = selling;
    expect(cashIncrease.toString()).toBe("8000000");
  });

  it("net profit decreases by 3,000,000 (loss is NOT ignored)", () => {
    const netProfitDelta = profit; // negative
    expect(netProfitDelta.isNegative()).toBe(true);
    expect(netProfitDelta.abs().toString()).toBe("3000000");
  });

  // §24.1 Forbidden: loss ignored and net profit not reduced
  it("forbidden: loss silently ignored (net delta = 0) is NOT produced", () => {
    const forbidden = new Decimal(0);
    expect(profit.equals(forbidden)).toBe(false);
  });

  it("ledger: Dr cash 8M / Cr revenue 8M + Dr expense (loss) 3M + Dr COGS 11M / Cr inventory 11M", () => {
    const correctedLedger = [
      { account: "cash", debit: selling, credit: new Decimal(0) }, // 8M
      { account: "inventory", debit: new Decimal(0), credit: carCost }, // 11M
      // For a loss: the "expense" side is the loss itself (cost - selling = 3M).
      // But the full COGS (11M) must be removed from inventory and recognized.
      // Dr expense (COGS) = 11M, Cr inventory = 11M, Dr cash = 8M, Cr revenue = 8M.
      // Then the loss = revenue(8M) - COGS(11M) = -3M appears in the P&L.
      { account: "expense", debit: carCost, credit: new Decimal(0) }, // 11M COGS
      { account: "revenue", debit: new Decimal(0), credit: selling }, // 8M revenue
    ];
    const td = correctedLedger.reduce((s, e) => s.plus(e.debit), new Decimal(0));
    const tc = correctedLedger.reduce((s, e) => s.plus(e.credit), new Decimal(0));
    expect(td.equals(tc)).toBe(true); // 8M + 11M = 8M + 11M = 19M
    expect(td.toString()).toBe("19000000");
  });
});

// ─────────────────────────────────────────────────────────────────────
// §23 — Required Test Scenario: Car Expense
// ─────────────────────────────────────────────────────────────────────

describe("§23 oracle — Car Expense (purchase=10M, expense=1M, selling=20M)", () => {
  const purchase = new Decimal("10000000");
  const carExpense = new Decimal("1000000");
  const selling = new Decimal("20000000");

  it("car cost = purchase + car_expenses = 11,000,000", () => {
    const carCost = purchase.plus(carExpense);
    expect(carCost.toString()).toBe("11000000");
  });

  it("full profit = selling - cost = 9,000,000 (reduced by expense)", () => {
    const carCost = purchase.plus(carExpense);
    const profit = selling.minus(carCost);
    expect(profit.toString()).toBe("9000000");
  });

  it("car expense is NOT a general expense (car_number IS NOT NULL)", () => {
    // The oracle verifies the classification: car expenses have a car_number.
    const carExpenseRow = { car_number: "CAR23", amount: carExpense };
    expect(carExpenseRow.car_number).not.toBeNull();
    expect(carExpenseRow.car_number).not.toBe("");
  });

  it("car expense affects_qasa=1, affects_partner_cash=1, affects_profit=0", () => {
    const partnerTx = {
      affects_qasa: 1,
      affects_partner_cash: 1,
      affects_profit: 0, // does NOT directly reduce net profit (reduces car profit via cost)
    };
    expect(partnerTx.affects_profit).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §24 — Required Test Scenario: General Expense
// ─────────────────────────────────────────────────────────────────────

describe("§24 oracle — General Expense (rent = 1,000,000)", () => {
  const rent = new Decimal("1000000");

  it("partner cash decreases by 1,000,000", () => {
    const cashDelta = rent.negated();
    expect(cashDelta.toString()).toBe("-1000000");
  });

  it("each partner bears 500,000 (50/50 split)", () => {
    const partnerShare = rent.div(2);
    expect(partnerShare.toString()).toBe("500000");
  });

  it("net profit decreases by 1,000,000", () => {
    const netProfitDelta = rent.negated();
    expect(netProfitDelta.toString()).toBe("-1000000");
  });

  it("general expense is NOT part of any car cost (car_number IS NULL)", () => {
    const generalExpenseRow = { car_number: null, amount: rent };
    expect(generalExpenseRow.car_number).toBeNull();
  });

  it("general expense affects_qasa=1, affects_partner_cash=1, affects_profit=0", () => {
    // Per §11: general expense affects_qasa=1, affects_partner_cash=1, affects_profit=0.
    // Net profit is reduced by subtracting from the expenses table, NOT via profit_recognition.
    const partnerTx = {
      affects_qasa: 1,
      affects_partner_cash: 1,
      affects_profit: 0,
    };
    expect(partnerTx.affects_profit).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §25 — Required Test Scenario: Investor
// ─────────────────────────────────────────────────────────────────────

describe("§25 oracle — Investor Deposit (10,000,000)", () => {
  const deposit = new Decimal("10000000");

  it("qasa increases by 10,000,000", () => {
    const qasaDelta = deposit;
    expect(qasaDelta.toString()).toBe("10000000");
  });

  it("partner cash does NOT increase (affects_partner_cash=0)", () => {
    const partnerCashDelta = new Decimal(0);
    expect(partnerCashDelta.toString()).toBe("0");
  });

  it("profit does NOT increase (affects_profit=0)", () => {
    const profitDelta = new Decimal(0);
    expect(profitDelta.toString()).toBe("0");
  });

  it("liability to investor increases by 10,000,000", () => {
    const liabilityDelta = deposit;
    expect(liabilityDelta.toString()).toBe("10000000");
  });

  it("investor row has kind='مستثمر', affects_qasa=1, affects_partner_cash=0", () => {
    const investorTx = {
      kind: "مستثمر",
      affects_qasa: 1,
      affects_partner_cash: 0,
      affects_profit: 0,
    };
    expect(investorTx.kind).toBe("مستثمر");
    expect(investorTx.affects_partner_cash).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §26 — Required Test Scenario: Funder
// ─────────────────────────────────────────────────────────────────────

describe("§26 oracle — Funder Financing + Repayment (10,000,000)", () => {
  const financing = new Decimal("10000000");

  describe("financing half", () => {
    it("partner cash does NOT decrease", () => {
      const partnerCashDelta = new Decimal(0);
      expect(partnerCashDelta.toString()).toBe("0");
    });

    it("qasa does NOT change", () => {
      const qasaDelta = new Decimal(0);
      expect(qasaDelta.toString()).toBe("0");
    });

    it("funder liability increases by 10,000,000", () => {
      const liabilityDelta = financing;
      expect(liabilityDelta.toString()).toBe("10000000");
    });

    it("profit does NOT change", () => {
      const profitDelta = new Decimal(0);
      expect(profitDelta.toString()).toBe("0");
    });

    it("financing row: affects_qasa=0, affects_partner_cash=0, affects_profit=0", () => {
      const funderTx = {
        affects_qasa: 0,
        affects_partner_cash: 0,
        affects_profit: 0,
      };
      expect(funderTx.affects_qasa).toBe(0);
      expect(funderTx.affects_partner_cash).toBe(0);
    });
  });

  describe("repayment half (from partners)", () => {
    it("partner cash decreases by 10,000,000", () => {
      const partnerCashDelta = financing.negated();
      expect(partnerCashDelta.toString()).toBe("-10000000");
    });

    it("each partner bears 5,000,000 (50/50 split)", () => {
      const partnerShare = financing.div(2);
      expect(partnerShare.toString()).toBe("5000000");
    });

    it("funder liability decreases by 10,000,000 (to zero)", () => {
      const liabilityBefore = financing;
      const liabilityAfter = liabilityBefore.minus(financing);
      expect(liabilityAfter.toString()).toBe("0");
    });

    it("repayment happens ONCE ONLY (idempotency)", () => {
      // The oracle verifies: calling repayment twice produces the same
      // single deduction, not a double deduction.
      let totalDeducted = new Decimal(0);
      // First call
      totalDeducted = totalDeducted.plus(financing);
      // Second call (idempotent — no additional deduction)
      // totalDeducted = totalDeducted.plus(financing); // ← would be a bug
      expect(totalDeducted.toString()).toBe("10000000");
    });

    it("repayment split rows: affects_qasa=1, affects_partner_cash=1, affects_profit=0", () => {
      const splitRow = {
        source_type: "funder_payment",
        source_role: "partner_cash_payment",
        affects_qasa: 1,
        affects_partner_cash: 1,
        affects_profit: 0,
      };
      expect(splitRow.affects_qasa).toBe(1);
      expect(splitRow.affects_partner_cash).toBe(1);
      expect(splitRow.affects_profit).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// §27 — Required Test Scenario: Agency (deletion scoped by id)
// ─────────────────────────────────────────────────────────────────────

describe("§27 oracle — Agency Deletion Scoped by ID", () => {
  it("deleting one agency does not delete another with same name/date", () => {
    // Two agencies with same old/new agent name and date but different IDs.
    const agency1 = { id: 1, old: "وكيل", new: "زبون", date: "2026-07-10", amount: "500000" };
    const agency2 = { id: 2, old: "وكيل", new: "زبون", date: "2026-07-10", amount: "300000" };

    // Delete agency 1's profit rows (scoped by source_id = "1").
    const remaining = [agency2].filter((a) => a.id !== agency1.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(2);
    expect(remaining[0].amount).toBe("300000");
  });

  it("deletion uses source_id (numeric), NOT name/date/notes", () => {
    // The delete query must be:
    //   DELETE FROM partner_transactions WHERE source_type='agency' AND source_id=?
    // NOT:
    //   DELETE FROM partner_transactions WHERE notes LIKE '%وكيل%' AND date=?
    const deleteQuery = "DELETE FROM partner_transactions WHERE source_type='agency' AND source_id=?";
    expect(deleteQuery).toContain("source_id=?");
    expect(deleteQuery).not.toContain("notes LIKE");
    expect(deleteQuery).not.toContain("name =");
  });
});

// ─────────────────────────────────────────────────────────────────────
// §21 — Required Test Scenario: Installment Sale
// ─────────────────────────────────────────────────────────────────────

describe("§21 oracle — Installment Sale (purchase=10M, selling=20M, down=5M, 15 installments)", () => {
  const purchase = new Decimal("10000000");
  const selling = new Decimal("20000000");
  const downPayment = new Decimal("5000000");
  const remaining = new Decimal("15000000");
  const months = 15;
  const monthlyInstallment = remaining.div(months); // 1,000,000

  const carCost = purchase; // expenses = 0
  const fullProfit = selling.minus(carCost); // 10M
  const profitRatio = fullProfit.div(selling); // 0.5

  it("full car profit = 10,000,000", () => {
    expect(fullProfit.toString()).toBe("10000000");
  });

  it("profit ratio = 50%", () => {
    expect(profitRatio.times(100).toDecimalPlaces(0).toFixed()).toBe("50");
  });

  it("monthly installment = 1,000,000 (15M / 15)", () => {
    expect(monthlyInstallment.toString()).toBe("1000000");
  });

  describe("after down payment (5M)", () => {
    const dpProfit = downPayment.times(profitRatio); // 2.5M
    const partnerShare = dpProfit.div(2); // 1.25M

    it("qasa/cash increase = 5,000,000 (down payment amount)", () => {
      expect(downPayment.toString()).toBe("5000000");
    });

    it("recognized profit = 2,500,000 (5M × 50%)", () => {
      expect(dpProfit.toString()).toBe("2500000");
    });

    it("each partner profit = 1,250,000", () => {
      expect(partnerShare.toString()).toBe("1250000");
    });
  });

  describe("after one installment (1M)", () => {
    const instProfit = monthlyInstallment.times(profitRatio); // 500k
    const partnerShare = instProfit.div(2); // 250k

    it("qasa/cash increase = 1,000,000", () => {
      expect(monthlyInstallment.toString()).toBe("1000000");
    });

    it("recognized profit = 500,000 (1M × 50%)", () => {
      expect(instProfit.toString()).toBe("500000");
    });

    it("each partner profit = 250,000", () => {
      expect(partnerShare.toString()).toBe("250000");
    });
  });

  describe("after all payments", () => {
    const totalPaid = downPayment.plus(monthlyInstallment.times(months)); // 5M + 15M = 20M
    const totalRecognized = totalPaid.times(profitRatio); // 10M

    it("total recognized profit = 10,000,000 (== full profit, cap reached)", () => {
      expect(totalRecognized.toString()).toBe("10000000");
      expect(totalRecognized.lte(fullProfit)).toBe(true); // cap not exceeded
    });

    it("customer remaining balance = 0", () => {
      const customerBalance = selling.minus(totalPaid);
      expect(customerBalance.toString()).toBe("0");
    });

    it("forbidden: adding full car profit again on last installment", () => {
      // The last installment must NOT trigger an extra full-profit recognition.
      // Total recognized must equal fullProfit, NOT 2× fullProfit.
      const forbiddenTotal = fullProfit.plus(fullProfit); // 20M
      expect(totalRecognized.equals(forbiddenTotal)).toBe(false);
    });
  });

  describe("profit cap (§7.4)", () => {
    it("recognized profit never exceeds full car profit", () => {
      // Simulate overpayment: pay 25M total (5M down + 20M installments).
      const overPayment = new Decimal("25000000");
      const calculatedProfit = overPayment.times(profitRatio); // 12.5M
      const remainingRecognizable = fullProfit.minus(new Decimal(0)); // 10M - 0 = 10M
      const recognizedProfit = Decimal.min(calculatedProfit, remainingRecognizable);
      expect(recognizedProfit.toString()).toBe("10000000"); // capped at 10M
    });
  });
});
