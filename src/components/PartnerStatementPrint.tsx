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

const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  isDebit(tx) && (!!tx.notes?.includes("قسط") || tx.type_.includes("قسط"));

const emptyBalances = (): Record<StatementCurrency, number> => ({ IQD: 0, USD: 0 });

const isFinancialAccountKind = (kind: string) =>
  kind === "مستثمر" || kind === "ممول" || kind === "شركة";

const isFinancialPrintDeposit = (tx: PartnerTransaction) =>
  tx.type_.startsWith("ايداع") ||
  tx.type_.startsWith("إيداع") ||
  tx.type_.startsWith("استلام") ||
  tx.type_.startsWith("إستلام") ||
  tx.type_.startsWith("تمويل") ||
  tx.type_.includes("تمويل شراء سيارة");

const isFinancialPrintWithdrawal = (tx: PartnerTransaction) =>
  tx.type_.startsWith("سحب") ||
  tx.type_.startsWith("تسليم") ||
  tx.type_.startsWith("سداد") ||
  tx.type_.startsWith("تسديد");

const calculateCustomerPrintSummary = (
  transactions: PartnerTransaction[],
  paidTransactionIds: Set<number>
) => {
  const remaining = emptyBalances();
  const paid = emptyBalances();

  transactions.forEach((tx) => {
    if (tx.type_.startsWith("تحويل")) return;
    const currency = (tx.currency || "IQD") as StatementCurrency;
    const amount = Math.abs(tx.amount);
    const paidInstallment = tx.id !== undefined && paidTransactionIds.has(tx.id);

    if (paidInstallment) {
      paid[currency] += amount;
      return;
    }

    if (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب")) {
      remaining[currency] += amount;
      return;
    }

    if (
      tx.type_.startsWith("واصل") ||
      tx.type_.startsWith("ايداع") ||
      tx.type_.startsWith("إيداع") ||
      tx.type_.startsWith("استلام") ||
      tx.type_.startsWith("إستلام") ||
      tx.type_.startsWith("تسديد") ||
      tx.type_.startsWith("مقدمة")
    ) {
      paid[currency] += amount;
      return;
    }
  });

  const total = {
    IQD: paid.IQD + remaining.IQD,
    USD: paid.USD + remaining.USD,
  };

  return { paid, remaining, total };
};

const calculateFinancialClientPrintSummary = (transactions: PartnerTransaction[]) => {
  const received = emptyBalances();
  const delivered = emptyBalances();

  transactions.forEach((tx) => {
    if (tx.type_.startsWith("تحويل")) return;
    const currency = (tx.currency || "IQD") as StatementCurrency;
    const amount = Math.abs(tx.amount);

    if (isFinancialPrintDeposit(tx)) {
      received[currency] += amount;
    }
    if (isFinancialPrintWithdrawal(tx)) {
      delivered[currency] += amount;
    }
  });

  const net = {
    IQD: received.IQD - delivered.IQD,
    USD: received.USD - delivered.USD,
  };

  return { received, delivered, net };
};

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
  const getPrintOperationType = (tx: PartnerTransaction, partnerKind: string) => {
    if (partnerKind === "زبون") {
      if (tx.id !== undefined && paidTransactionIds.has(tx.id)) return "واصل";
      if (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب")) return "باقي";
      if (
        tx.type_.startsWith("واصل") ||
        tx.type_.startsWith("ايداع") ||
        tx.type_.startsWith("إيداع") ||
        tx.type_.startsWith("استلام") ||
        tx.type_.startsWith("إستلام") ||
        tx.type_.startsWith("تسديد") ||
        tx.type_.startsWith("مقدمة")
      ) return "واصل";
    }

    if (isFinancialAccountKind(partnerKind)) {
      if (isFinancialPrintDeposit(tx)) return "استلام";
      if (isFinancialPrintWithdrawal(tx)) return "تسليم";
    }

    return tx.type_;
  };

  const isCashMovement = (tx: PartnerTransaction) =>
    tx.affects_partner_cash === undefined || tx.affects_partner_cash === 1;

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
  }, [transactions, printMode, printFromDate, printToDate, partner.kind]);

  const cashStatementTransactions = useMemo(() => {
    return statementTransactions.filter(isCashMovement);
  }, [statementTransactions]);

  const ledgerRows = useMemo(() => {
    return statementTransactions.map((tx, idx) => {
      const currency = (tx.currency || "IQD") as StatementCurrency;
      const paidInstallment = partner.kind === "زبون" && tx.id !== undefined && paidTransactionIds.has(tx.id);
      const debitRow = isDebit(tx) && !paidInstallment;
      return {
        key: `${tx.id ?? idx}-${tx.date}`,
        seq: idx + 1,
        date: tx.date,
        type: getPrintOperationType(tx, partner.kind),
        amount: formatAmount(tx.amount, currency),
        kind: debitRow ? ("debit" as const) : ("credit" as const),
        notes: tx.notes?.trim() ? tx.notes.trim() : "—",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementTransactions, partner.kind]);

  const rowChunks = useMemo(() => {
    if (ledgerRows.length === 0) return [[] as typeof ledgerRows];
    const chunks = [];
    for (let i = 0; i < ledgerRows.length; i += 18) {
      chunks.push(ledgerRows.slice(i, i + 18));
    }
    return chunks;
  }, [ledgerRows]);

  const customerSummary = useMemo(() => {
    return calculateCustomerPrintSummary(statementTransactions, paidTransactionIds);
  }, [statementTransactions, paidTransactionIds]);

  const financialStatementTransactions = useMemo(() => {
    return partner.kind === "مستثمر" || partner.kind === "ممول" || partner.kind === "شركة"
      ? statementTransactions
      : cashStatementTransactions;
  }, [statementTransactions, cashStatementTransactions, partner.kind]);

  const otherSummary = useMemo(() => {
    return calculateFinancialClientPrintSummary(financialStatementTransactions);
  }, [financialStatementTransactions]);

  const periodLabel = printMode === "range"
    ? `الفترة من ${printFromDate || "البداية"} إلى ${printToDate || "النهاية"}`
    : "كامل الحساب";

  const installments = useMemo(() => transactions.filter(isInstallmentWithdrawal), [transactions]);
  const paidInstallments = useMemo(() => {
    return installments.filter(
      (tx) => tx.id !== undefined && paidTransactionIds.has(tx.id)
    ).length;
  }, [installments, paidTransactionIds]);
  const remainingInstallments = useMemo(() => {
    return Math.max(0, installments.length - paidInstallments);
  }, [installments.length, paidInstallments]);

  const renderNetSummary = (iqd: number, usd: number) => {
    const kindLabel = partner.kind === "ممول" ? "الممول"
      : partner.kind === "شركة" ? "الشركة"
      : "المستثمر";

    const formatVal = (v: number, curr: StatementCurrency) =>
      `${Math.round(Math.abs(v)).toLocaleString("en-US")} ${currencyLabel(curr)}`;

    if (iqd === 0 && usd === 0) {
      return (
        <div className="net-row" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span className="net-label" style={{ fontSize: "7.5pt", color: "#64748b", fontWeight: "bold" }}>
            الحساب متوازن
          </span>
          <strong className="net-value" style={{ fontSize: "10pt", color: "#64748b", marginTop: "2px" }}>
            0 {currencyLabel("IQD")}
          </strong>
        </div>
      );
    }

    const weOweThem = [];
    const theyOweUs = [];
    if (iqd > 0) weOweThem.push(formatVal(iqd, "IQD"));
    if (usd > 0) weOweThem.push(formatVal(usd, "USD"));
    if (iqd < 0) theyOweUs.push(formatVal(iqd, "IQD"));
    if (usd < 0) theyOweUs.push(formatVal(usd, "USD"));

    return (
      <div className="net-summary-box" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%" }}>
        {weOweThem.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <span className="net-label" style={{ fontSize: "7.5pt", color: "#475569", fontWeight: "bold", marginBottom: "2px" }}>
              {kindLabel} يطلبنا
            </span>
            {weOweThem.map((valStr, idx) => (
              <strong key={idx} className="net-value" style={{ fontSize: "11pt", fontWeight: "900", color: "#1e293b", lineHeight: "1.2" }}>
                {valStr}
              </strong>
            ))}
          </div>
        )}
        {theyOweUs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <span className="net-label net-label--debt" style={{ fontSize: "7.5pt", color: "#b91c1c", fontWeight: "bold", marginBottom: "2px" }}>
              نطلب {kindLabel}
            </span>
            {theyOweUs.map((valStr, idx) => (
              <strong key={idx} className="net-value net-value--debt" style={{ fontSize: "11pt", fontWeight: "900", color: "#b91c1c", lineHeight: "1.2" }}>
                {valStr}
              </strong>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="print-layout print-only" dir="rtl">
      {rowChunks.map((pageRows, pageIdx) => (
        <div className="print-statement" key={pageIdx}>
          <div className="print-statement__topbar" />

          <header className="print-statement__header">
            <div className="print-statement__header-right" style={{ textAlign: "right" }}>
              <h1 style={{ margin: 0, fontSize: "16pt", fontWeight: 900 }}>شركة فجر الوادي</h1>
              <div style={{ fontSize: "10pt", color: "#57534e", fontWeight: 700 }}>لتجارة السيارات</div>
              <div style={{ fontSize: "8.5pt", color: "#78716c", marginTop: "2px" }}>الإدارة العامة - النجف</div>
            </div>
            <div className="print-statement__header-center" style={{ textAlign: "center" }}>
              <img className="print-statement__logo" src="/logo.png" alt="شعار الشركة" style={{ width: "130px", height: "130px", objectFit: "contain" }} />
            </div>
            <div className="print-statement__header-left" style={{ textAlign: "left", direction: "ltr" }}>
              <h1 style={{ margin: 0, fontSize: "16pt", fontWeight: 900 }}>FAJR ALWADI</h1>
              <div style={{ fontSize: "10pt", color: "#57534e", fontWeight: 700 }}>Car Trading Company</div>
              <div style={{ fontSize: "8.5pt", color: "#78716c", marginTop: "2px" }}>General Management - Najaf</div>
            </div>
          </header>

          <div style={{ textAlign: "center", margin: "12px 0 18px" }}>
            <h2 className="print-statement__title" style={{ margin: 0, fontSize: "15pt", fontWeight: "900", borderBottom: "2px solid #000", display: "inline-block", paddingBottom: "2px", minWidth: "150px" }}>
              كـشـف حـسـاب
            </h2>
          </div>

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
              <span>الصفحة</span>
              <strong>{pageIdx + 1} من {rowChunks.length}</strong>
            </div>
          </section>

          {partner.kind === "زبون" ? (
            <>
              <section className="print-statement__summary" aria-label="ملخص الحساب">
                <div className="print-summary-card print-summary-card--total">
                  <span>الإجمالي</span>
                  <strong>{formatDualAmount(customerSummary.total.IQD, customerSummary.total.USD)}</strong>
                </div>
                <div className="print-summary-card print-summary-card--paid">
                  <span>الواصل</span>
                  <strong>{formatDualAmount(customerSummary.paid.IQD, customerSummary.paid.USD)}</strong>
                </div>
                <div className="print-summary-card print-summary-card--remaining">
                  <span>الباقي</span>
                  <strong>{formatDualAmount(customerSummary.remaining.IQD, customerSummary.remaining.USD)}</strong>
                </div>
              </section>

              <section className="print-statement__installments">
                <span>الأقساط الكلية: {installments.length.toLocaleString("en-US")}</span>
                <span>الأقساط المسددة: {paidInstallments.toLocaleString("en-US")}</span>
                <span>الأقساط المتبقية: {remainingInstallments.toLocaleString("en-US")}</span>
              </section>
            </>
          ) : (
            <section className="print-statement__summary" aria-label="ملخص الحساب">
              <div className="print-summary-card print-summary-card--deposit">
                <span>الاستلام</span>
                <strong>{formatDualAmount(otherSummary.received.IQD, otherSummary.received.USD)}</strong>
              </div>
              <div className="print-summary-card print-summary-card--withdrawal">
                <span>التسليم</span>
                <strong>{formatDualAmount(otherSummary.delivered.IQD, otherSummary.delivered.USD)}</strong>
              </div>
              <div className="print-summary-card print-summary-card--net">
                <span>الناتج</span>
                <div className="print-net-details" style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", alignItems: "center" }}>
                  {renderNetSummary(otherSummary.net.IQD, otherSummary.net.USD)}
                </div>
              </div>
            </section>
          )}

          {pageRows.length === 0 ? (
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
                {pageRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.seq}</td>
                    <td>{row.date}</td>
                    <td>{row.type}</td>
                    <td dir="ltr" className={`print-table__amount print-table__amount--${row.kind}`}>
                      {row.amount}
                    </td>
                    <td className="print-table__notes" title={row.notes}>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <footer className="print-statement__footer">
            <div className="print-statement__footer-right">
              <span className="print-statement__footer-role">بإدارة: </span>
              <strong>سيد منتصر الحيدري</strong>
              <span className="print-statement__footer-phone" dir="ltr"> ({muntasirPhone}) </span>
              <span className="print-statement__footer-divider">|</span>
              <strong>أمير الزجراوي</strong>
              <span className="print-statement__footer-phone" dir="ltr"> ({amirPhone}) </span>
            </div>
            <div className="print-statement__footer-left">
              <span>Fajr Alwadi Car Trading Co.</span>
            </div>
          </footer>
        </div>
      ))}
    </div>
  );
}

