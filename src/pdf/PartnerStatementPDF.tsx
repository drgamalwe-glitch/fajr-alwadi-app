import { useMemo } from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Partner, PartnerTransaction } from "../types";
import { compareMoney, formatMoney, moneyAbs, moneyAdd, moneySub, toMoney, type MoneyValue } from "../utils/money";
import { formatNotesText } from "../utils/notesDisplay";
import { styles } from "./pdfStyles";

type PrintMode = "all" | "range";
type StatementCurrency = "IQD" | "USD";

export interface PartnerStatementPrintProps {
  partner: Partner;
  transactions: PartnerTransaction[];
  printMode: PrintMode;
  printFromDate: string;
  printToDate: string;
  muntasirPhone: string;
  amirPhone: string;
  paidTransactionIds: Set<number>;
}

interface PartnerStatementPDFProps extends PartnerStatementPrintProps {
  logoSrc?: string;
}

const currencyLabel = (currency: StatementCurrency) => currency === "USD" ? "USD" : "IQD";

const toFiniteNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const formatEnglishNumber = (value: unknown, fallback = 0) =>
  toFiniteNumber(value, fallback).toLocaleString("en-US");

// Format a Decimal/MoneyValue for display. Keeps values as Decimal until the very moment of rendering.
const formatAmount = (amount: MoneyValue, currency: StatementCurrency) =>
  `${formatMoney(amount, currency)} ${currencyLabel(currency)}`;

const formatDualAmount = (iqd: MoneyValue, usd: MoneyValue) => {
  const parts = [];
  if (compareMoney(iqd, 0) !== 0 || compareMoney(usd, 0) === 0) parts.push(formatAmount(iqd, "IQD"));
  if (compareMoney(usd, 0) !== 0) parts.push(formatAmount(usd, "USD"));
  return parts.join(" و ");
};

const forceLtrNumbers = (value: unknown, fallback = 0) =>
  `\u200e${formatEnglishNumber(value, fallback)}\u200e`;

const formatPageCount = (pageNumber: unknown, totalPages: unknown) => {
  const page = toFiniteNumber(pageNumber, 1);
  const total = toFiniteNumber(totalPages, page);
  return `${forceLtrNumbers(page, 1)} من ${forceLtrNumbers(total, page)}`;
};

const formatIssueDate = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `\u200e${year}-${month}-${day}\u200e`;
};

const normalizePdfText = (value: unknown) =>
  String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const clipPdfText = (value: unknown, maxLength = 42) => {
  const text = normalizePdfText(value);
  if (!text) return "—";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const formatStatementNote = (notes: string | null | undefined) => {
  const text = formatNotesText(notes);
  return text ? clipPdfText(text, 54) : "—";
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

const isInstallmentScheduleRecord = (tx: PartnerTransaction) =>
  (
    tx.source_type === "customer_installment_schedule" &&
    tx.source_role === "installment_schedule"
  ) ||
  isInstallmentWithdrawal(tx) ||
  (
    tx.type_.startsWith("واصل") &&
    (!!tx.notes?.includes("قسط") || tx.type_.includes("قسط"))
  );

const emptyBalances = (): Record<StatementCurrency, MoneyValue> => ({ IQD: 0, USD: 0 });

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
    // F13: keep Decimal until rendering — do not collapse to JS number here.
    const amount = toMoney(tx.amount).abs();
    const paidInstallment = tx.id !== undefined && paidTransactionIds.has(tx.id);

    if (paidInstallment) {
      paid[currency] = moneyAdd(paid[currency], amount);
      return;
    }

    if (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب")) {
      remaining[currency] = moneyAdd(remaining[currency], amount);
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
      paid[currency] = moneyAdd(paid[currency], amount);
      return;
    }
  });

  const total = {
    IQD: moneyAdd(paid.IQD, remaining.IQD),
    USD: moneyAdd(paid.USD, remaining.USD),
  };

  return { paid, remaining, total };
};

const calculateFinancialClientPrintSummary = (transactions: PartnerTransaction[]) => {
  const received = emptyBalances();
  const delivered = emptyBalances();

  transactions.forEach((tx) => {
    if (tx.type_.startsWith("تحويل")) return;
    const currency = (tx.currency || "IQD") as StatementCurrency;
    // F13: keep Decimal until rendering.
    const amount = toMoney(tx.amount).abs();

    if (isFinancialPrintDeposit(tx)) {
      received[currency] = moneyAdd(received[currency], amount);
    }
    if (isFinancialPrintWithdrawal(tx)) {
      delivered[currency] = moneyAdd(delivered[currency], amount);
    }
  });

  const net = {
    IQD: moneySub(received.IQD, delivered.IQD),
    USD: moneySub(received.USD, delivered.USD),
  };

  return { received, delivered, net };
};

export function PartnerStatementPDF({
  partner,
  transactions,
  printMode,
  printFromDate,
  printToDate,
  muntasirPhone,
  amirPhone,
  paidTransactionIds,
  logoSrc,
}: PartnerStatementPDFProps) {
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
        date: normalizePdfText(tx.date) || "—",
        type: normalizePdfText(getPrintOperationType(tx, partner.kind)) || "—",
        amount: formatAmount(toMoney(tx.amount), currency),
        kind: debitRow ? ("debit" as const) : ("credit" as const),
        notes: formatStatementNote(tx.notes),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statementTransactions, partner.kind]);

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
  const issueDate = formatIssueDate();

  const installments = useMemo(() => transactions.filter(isInstallmentScheduleRecord), [transactions]);
  const paidInstallments = useMemo(() => {
    return installments.filter(
      (tx) =>
        tx.type_.startsWith("واصل") ||
        tx.paid_event_id != null ||
        (tx.id !== undefined && paidTransactionIds.has(tx.id))
    ).length;
  }, [installments, paidTransactionIds]);
  const remainingInstallments = useMemo(() => {
    return Math.max(0, installments.length - paidInstallments);
  }, [installments.length, paidInstallments]);

  const renderNetSummary = (iqd: MoneyValue, usd: MoneyValue) => {
    const kindLabel = partner.kind === "ممول" ? "الممول"
      : partner.kind === "شركة" ? "الشركة"
      : "المستثمر";

    const formatVal = (v: MoneyValue, curr: StatementCurrency) =>
      `${formatMoney(moneyAbs(v), curr)} ${currencyLabel(curr)}`;

    if (compareMoney(iqd, 0) === 0 && compareMoney(usd, 0) === 0) {
      return (
        <View style={styles.netRow}>
          <Text style={[styles.netLabel, styles.netLabelMuted]}>
            الحساب متوازن
          </Text>
          <Text style={[styles.netValue, styles.netValueMuted]}>
            0 {currencyLabel("IQD")}
          </Text>
        </View>
      );
    }

    const weOweThem = [];
    const theyOweUs = [];
    if (compareMoney(iqd, 0) > 0) weOweThem.push(formatVal(iqd, "IQD"));
    if (compareMoney(usd, 0) > 0) weOweThem.push(formatVal(usd, "USD"));
    if (compareMoney(iqd, 0) < 0) theyOweUs.push(formatVal(iqd, "IQD"));
    if (compareMoney(usd, 0) < 0) theyOweUs.push(formatVal(usd, "USD"));

    return (
      <View style={styles.netSummaryBox}>
        {weOweThem.length > 0 && (
          <View style={styles.netGroup}>
            <Text style={styles.netLabel}>
              {kindLabel} يطلبنا
            </Text>
            {weOweThem.map((valStr, idx) => (
              <Text key={idx} style={styles.netValue}>
                {valStr}
              </Text>
            ))}
          </View>
        )}
        {theyOweUs.length > 0 && (
          <View style={styles.netGroup}>
            <Text style={[styles.netLabel, styles.netLabelDebt]}>
              نطلب {kindLabel}
            </Text>
            {theyOweUs.map((valStr, idx) => (
              <Text key={idx} style={[styles.netValue, styles.netValueDebt]}>
                {valStr}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <Document title="كشف حساب" author="شركة فجر الوادي" language="ar">
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.headerRight}>
            <Text style={styles.companyNameAr}>شركة فجر الوادي</Text>
            <Text style={styles.companySubAr}>لتجارة السيارات</Text>
            <Text style={styles.companyCity}>الإدارة العامة - النجف</Text>
          </View>
          <View style={styles.headerCenter}>
            {logoSrc && <Image src={logoSrc} style={styles.logo} />}
          </View>
          <View style={styles.headerLeft}>
            <Text style={styles.companyNameEn}>FAJR ALWADI</Text>
            <Text style={styles.companySubEn}>Car Trading Company</Text>
            <Text style={styles.companyCityEn}>General Management - Najaf</Text>
          </View>
        </View>

        <View style={styles.titleWrap} wrap={false}>
          <Text style={styles.title}>كـشـف حـسـاب</Text>
        </View>

        <View style={styles.metaGrid} wrap={false}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>اسم الحساب</Text>
            <Text style={[styles.metaValue, styles.singleLineText]}>{clipPdfText(partner.partner_name, 28)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>نوع الحساب</Text>
            <Text style={[styles.metaValue, styles.singleLineText]}>{clipPdfText(partner.kind, 16)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>رقم الهاتف</Text>
            <Text style={[styles.metaValue, styles.singleLineText]}>{clipPdfText(partner.phone || "غير مثبت", 22)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>نطاق الكشف</Text>
            <Text style={[styles.metaValue, styles.singleLineText]}>{clipPdfText(periodLabel, 32)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>تاريخ الإصدار</Text>
            <Text style={[styles.metaValue, styles.singleLineText]}>{clipPdfText(issueDate, 14)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>الصفحة</Text>
            <Text
              style={[styles.metaValue, styles.singleLineText]}
              render={({ pageNumber, totalPages }) => formatPageCount(pageNumber, totalPages)}
            />
          </View>
        </View>

        {partner.kind === "زبون" ? (
          <>
            <View style={styles.summaryGrid} wrap={false}>
              <View style={[styles.summaryCard, styles.cardTotal]} wrap={false}>
                <Text style={styles.cardLabel}>الإجمالي</Text>
                <Text style={styles.cardValue}>
                  {formatDualAmount(customerSummary.total.IQD, customerSummary.total.USD)}
                </Text>
              </View>
              <View style={[styles.summaryCard, styles.cardPaid]} wrap={false}>
                <Text style={styles.cardLabel}>الواصل</Text>
                <Text style={[styles.cardValue, styles.valueGreen]}>
                  {formatDualAmount(customerSummary.paid.IQD, customerSummary.paid.USD)}
                </Text>
              </View>
              <View style={[styles.summaryCard, styles.cardRemaining]} wrap={false}>
                <Text style={styles.cardLabel}>الباقي</Text>
                <Text style={[styles.cardValue, styles.valueRed]}>
                  {formatDualAmount(customerSummary.remaining.IQD, customerSummary.remaining.USD)}
                </Text>
              </View>
            </View>

            <View style={styles.installmentStrip} wrap={false}>
              <Text style={styles.installmentText}>
                اجمالي الاقساط: {formatEnglishNumber(installments.length)}
              </Text>
              <Text style={styles.installmentText}>
                المسددة: {formatEnglishNumber(paidInstallments)}
              </Text>
              <Text style={styles.installmentText}>
                المتبقية: {formatEnglishNumber(remainingInstallments)}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.summaryGrid} wrap={false}>
            <View style={[styles.summaryCard, styles.cardDeposit]} wrap={false}>
              <Text style={styles.cardLabel}>الاستلام</Text>
              <Text style={[styles.cardValue, styles.valueGreen]}>
                {formatDualAmount(otherSummary.received.IQD, otherSummary.received.USD)}
              </Text>
            </View>
            <View style={[styles.summaryCard, styles.cardWithdraw]} wrap={false}>
              <Text style={styles.cardLabel}>التسليم</Text>
              <Text style={[styles.cardValue, styles.valueRed]}>
                {formatDualAmount(otherSummary.delivered.IQD, otherSummary.delivered.USD)}
              </Text>
            </View>
            <View style={[styles.summaryCard, styles.cardNet]} wrap={false}>
              <Text style={styles.cardLabel}>الناتج</Text>
              {renderNetSummary(otherSummary.net.IQD, otherSummary.net.USD)}
            </View>
          </View>
        )}

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.th, styles.colSeq]}>ت</Text>
          <Text style={[styles.th, styles.colDate]}>التاريخ</Text>
          <Text style={[styles.th, styles.colType]}>نوع العملية</Text>
          <Text style={[styles.th, styles.colAmount]}>المبلغ</Text>
          <Text style={[styles.th, styles.colNotes]}>الملاحظات</Text>
        </View>

        {ledgerRows.map((row, idx) => (
          <View
            key={row.key}
            style={[
              styles.tableRow,
              idx % 2 === 1 ? styles.tableRowAlt : {},
            ]}
            wrap={false}
          >
            <Text style={[styles.td, styles.colSeq]}>{row.seq}</Text>
            <Text style={[styles.td, styles.colDate]}>{row.date}</Text>
            <Text style={[styles.td, styles.colType]}>{row.type}</Text>
            <Text
              style={[
                styles.td,
                styles.colAmount,
                row.kind === "debit" ? styles.amountDebit : styles.amountCredit,
              ]}
            >
              {row.amount}
            </Text>
            <Text style={[styles.td, styles.colNotes, styles.singleLineText]}>{row.notes}</Text>
          </View>
        ))}

        {ledgerRows.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              لا توجد حركات ضمن نطاق الكشف المحدد.
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerRole}>بإدارة: </Text>
            <Text style={styles.footerName}>سيد منتصر الحيدري</Text>
            <Text style={styles.footerPhone}>({muntasirPhone})</Text>
            <Text style={styles.footerDivider}> | </Text>
            <Text style={styles.footerName}>أمير الزجراوي</Text>
            <Text style={styles.footerPhone}>({amirPhone})</Text>
          </View>
          <Text
            style={styles.footerRight}
            render={({ pageNumber, totalPages }) => `صفحة ${formatPageCount(pageNumber, totalPages)}`}
          />
        </View>
      </Page>
    </Document>
  );
}
