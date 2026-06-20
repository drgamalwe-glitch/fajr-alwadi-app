import { useMemo } from "react";
import type { Partner, PartnerTransaction } from "../types";
import "./PartnerStatementPrint.css";

type PrintMode = "all" | "range";
type StatementCurrency = "IQD" | "USD";

interface PartnerStatementPrintProps {
  partner: Partner;
  transactions: PartnerTransaction[];
  printMode: PrintMode;
  printFromDate: string;
  printToDate: string;
  muntasirPhone: string;
  amirPhone: string;
  paidTransactionIds: Set<number>;
}

const currencyLabel = (currency: StatementCurrency) => currency === "USD" ? "USD" : "IQD";

const formatAmount = (amount: number, currency: StatementCurrency) =>
  `${Math.round(amount).toLocaleString("en-US")} ${currencyLabel(currency)}`;

const formatDualAmount = (iqd: number, usd: number) => {
  const parts = [];
  if (iqd || !usd) parts.push(formatAmount(iqd, "IQD"));
  if (usd) parts.push(formatAmount(usd, "USD"));
  return parts.join(" و ");
};

const isDebit = (tx: PartnerTransaction) =>
  tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي") || tx.type_.startsWith("تسليم");

const isCredit = (tx: PartnerTransaction) =>
  tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") ||
  tx.type_.startsWith("واصل") || tx.type_.startsWith("مقدمة") ||
  tx.type_.startsWith("استلام") || tx.type_.startsWith("إستلام") ||
  tx.type_.startsWith("تسديد") || tx.type_.startsWith("إعادة استثمار") ||
  tx.type_.startsWith("تسوية");

const getLinkedInstallmentId = (tx: PartnerTransaction) => {
  const match = tx.notes?.match(/قسط#(\d+)/);
  return match ? Number(match[1]) : null;
};

const isLinkedInstallmentPayment = (tx: PartnerTransaction) =>
  getLinkedInstallmentId(tx) != null &&
  (tx.type_.startsWith("تسديد") ||
    tx.type_.startsWith("استلام قسط") ||
    tx.type_.startsWith("ايداع") ||
    tx.type_.startsWith("إيداع"));

// Any debit-style transaction (سحب / باقي / تسليم) tagged as an installment via its
// notes or its type label — matched anywhere in the string, not just at the start, so
// real-world variations like "تسليم قسط" or "باقي قسط 2" are still counted correctly.
const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  isDebit(tx) && (!!tx.notes?.includes("قسط") || tx.type_.includes("قسط"));

const emptyBalances = (): Record<StatementCurrency, number> => ({ IQD: 0, USD: 0 });

export function PartnerStatementPrint({
  partner,
  transactions,
  printMode,
  printFromDate,
  printToDate,
  muntasirPhone,
  amirPhone,
  paidTransactionIds,
}: PartnerStatementPrintProps) {
  const getTxType = (tx: PartnerTransaction) => {
    if (partner.kind === "زبون") {
      if (tx.id !== undefined && paidTransactionIds.has(tx.id)) return "واصل";
      if (isDebit(tx)) return "باقي";
      if (isCredit(tx)) return "واصل";
    }
    return tx.type_;
  };

  const statementTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (tx.type_.startsWith("تحويل")) return false;
        if (partner.kind === "زبون" && isLinkedInstallmentPayment(tx)) return false;
        if (printMode === "range" && printFromDate && tx.date < printFromDate) return false;
        if (printMode === "range" && printToDate && tx.date > printToDate) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
  }, [transactions, printMode, printFromDate, printToDate]);

  // Rows shown in the printed table — notes are pulled straight from each transaction's
  // own notes field so the printed statement always matches what is stored in the system.
  const ledgerRows = useMemo(() => {
    return statementTransactions.map((tx, idx) => {
      const currency = (tx.currency || "IQD") as StatementCurrency;
      const paidInstallment = partner.kind === "زبون" && tx.id !== undefined && paidTransactionIds.has(tx.id);
      const debitRow = isDebit(tx) && !paidInstallment;
      return {
        key: `${tx.id ?? idx}-${tx.date}`,
        seq: idx + 1,
        date: tx.date,
        type: getTxType(tx),
        amount: formatAmount(tx.amount, currency),
        kind: debitRow ? "debit" as const : "credit" as const,
        notes: tx.notes?.trim() ? tx.notes.trim() : "—",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementTransactions, partner.kind]);

  // "الواصل" sums only deposit/received-type transactions (ايداع، واصل، تسديد...إلخ).
  // "الباقي" sums only withdrawal/remaining-type transactions (سحب، باقي...إلخ).
  // "الإجمالي" is simply the sum of both — every transaction counted as a positive amount.
  const periodTotals = useMemo(() => {
    return statementTransactions.reduce(
      (acc, tx) => {
        const currency = (tx.currency || "IQD") as StatementCurrency;
        const amount = Math.abs(tx.amount);
        const paidInstallment = partner.kind === "زبون" && tx.id !== undefined && paidTransactionIds.has(tx.id);
        if (isDebit(tx) && !paidInstallment) acc.remaining[currency] += amount;
        if (isCredit(tx) || paidInstallment) acc.received[currency] += amount;
        return acc;
      },
      { remaining: emptyBalances(), received: emptyBalances() }
    );
  }, [statementTransactions]);

  const total = useMemo(
    () => ({
      IQD: periodTotals.remaining.IQD + periodTotals.received.IQD,
      USD: periodTotals.remaining.USD + periodTotals.received.USD,
    }),
    [periodTotals]
  );

  const periodLabel = printMode === "range"
    ? `الفترة من ${printFromDate || "البداية"} إلى ${printToDate || "النهاية"}`
    : "كامل الحساب";

  // Installment progress reflects the customer's full repayment plan regardless of the
  // printed date range, so it always shows accurate, up-to-date standing.
  const installments = transactions.filter(isInstallmentWithdrawal);
  const paidInstallments = installments.filter(
    (tx) => tx.id !== undefined && paidTransactionIds.has(tx.id)
  ).length;
  const remainingInstallments = Math.max(0, installments.length - paidInstallments);

  return (
    <div className="print-layout print-only" dir="rtl">
      <div className="print-statement">
        <div className="print-statement__topbar" />

        <header className="print-statement__header">
          <div className="print-statement__brand">
            <h1>
              شركة فجر الوادي
              <span>لتجارة السيارات</span>
            </h1>
            <p className="print-statement__badge">كشف حساب تفصيلي</p>
          </div>
          <img className="print-statement__logo" src="/logo.png" alt="شعار الشركة" />
        </header>

        <section className="print-statement__meta">
          <div>
            <span>اسم الحساب</span>
            <strong>{partner.partner_name}</strong>
          </div>
          <div>
            <span>نوع الحساب</span>
            <strong>{partner.kind}</strong>
          </div>
          <div>
            <span>رقم الهاتف</span>
            <strong>{partner.phone || "غير مثبت"}</strong>
          </div>
          <div>
            <span>نطاق الكشف</span>
            <strong>{periodLabel}</strong>
          </div>
          <div>
            <span>تاريخ الإصدار</span>
            <strong>{new Date().toLocaleDateString("ar-IQ")}</strong>
          </div>
          <div>
            <span>عدد الحركات</span>
            <strong>{ledgerRows.length.toLocaleString("en-US")}</strong>
          </div>
        </section>

        <section className="print-statement__summary" aria-label="ملخص الحساب">
          <div className="print-summary-card print-summary-card--total">
            <span>الإجمالي</span>
            <strong>{formatDualAmount(total.IQD, total.USD)}</strong>
          </div>
          <div className="print-summary-card print-summary-card--paid">
            <span>الواصل</span>
            <strong>{formatDualAmount(periodTotals.received.IQD, periodTotals.received.USD)}</strong>
          </div>
          <div className="print-summary-card print-summary-card--remaining">
            <span>الباقي</span>
            <strong>{formatDualAmount(periodTotals.remaining.IQD, periodTotals.remaining.USD)}</strong>
          </div>
        </section>

        {partner.kind === "زبون" && (
          <section className="print-statement__installments">
            <span>الأقساط الكلية: {installments.length.toLocaleString("en-US")}</span>
            <span>الأقساط المسددة: {paidInstallments.toLocaleString("en-US")}</span>
            <span>الأقساط المتبقية: {remainingInstallments.toLocaleString("en-US")}</span>
          </section>
        )}

        {ledgerRows.length === 0 ? (
          <div className="print-empty">لا توجد حركات ضمن نطاق الكشف المحدد.</div>
        ) : (
          <table className="print-table print-statement__table">
            <thead>
              <tr>
                <th>ت</th>
                <th>التاريخ</th>
                <th>نوع العملية</th>
                <th>المبلغ</th>
                <th>الملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.seq}</td>
                  <td>{row.date}</td>
                  <td>{row.type}</td>
                  <td dir="ltr" className={`print-table__amount print-table__amount--${row.kind}`}>
                    {row.amount}
                  </td>
                  <td className="print-table__notes">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <footer className="print-statement__footer">
          <div className="print-statement__footer-item">
            <span className="print-statement__footer-role">بإدارة</span>
            <strong>سيد منتصر الحيدري</strong>
            <span className="print-statement__footer-phone" dir="ltr">{muntasirPhone}</span>
          </div>
          <div className="print-statement__footer-divider" />
          <div className="print-statement__footer-item">
            <span className="print-statement__footer-role"></span>
            <strong>أمير الزجراوي</strong>
            <span className="print-statement__footer-phone" dir="ltr">{amirPhone}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
