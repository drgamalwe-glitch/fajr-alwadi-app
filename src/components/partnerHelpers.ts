/**
 * Partner helper functions extracted from PartnersTab.tsx.
 * Pure functions, type guards, and formatting utilities.
 */

import type { PartnerTransaction } from "../types";
import Decimal from "decimal.js";
import { toMoney, compareMoney, type MoneyInput } from "../utils/money";

export type TransactionType = "ايداع" | "سحب";
export type TransactionSortKey = "sequence" | "date" | "type" | "amount";
export type SortDirection = "asc" | "desc";
export type InstallmentModalMode = "pay" | "reverse";
export type AccountsTabId = "customers" | "personal" | "receivables" | "liabilities";

export const ACCOUNTS_TABS: { id: AccountsTabId; label: string }[] = [
  { id: "customers", label: "العملاء" },
  { id: "personal", label: "الشركاء" },
  { id: "receivables", label: "نطلب" },
  { id: "liabilities", label: "مطلوبين" },
];

const ACCOUNT_LIST_KINDS = new Set(["مستثمر", "ممول", "زبون", "وكالة", "شركة"]);

export const isAccountListKind = (kind: string) => ACCOUNT_LIST_KINDS.has(kind);

export const normalizeArabic = (str: string): string =>
  str
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "");

export const createEmptyForm = (kind: string) => ({
  name: "",
  phone: "",
  kind: kind === "partners-financial" ? "" : kind,
});

export type PartnersFormState = ReturnType<typeof createEmptyForm>;

// ── Transaction type guards ─────────────────────────────────────────────

export const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  (tx.type_ === "سحب" || tx.type_.startsWith("باقي")) &&
  (!!tx.notes?.includes("قسط") || tx.type_.startsWith("باقي اقساط"));

export const isInstallmentScheduleTx = (tx: PartnerTransaction) =>
  tx.source_type === "customer_installment_schedule" &&
  tx.source_role === "installment_schedule";

export const isCustomerInstallmentRecord = (tx: PartnerTransaction) =>
  isInstallmentWithdrawal(tx) ||
  (tx.type_.startsWith("واصل") &&
    (!!tx.notes?.includes("قسط") || tx.type_.includes("قسط")));

export const isBorrowerInstallmentPayment = (tx: PartnerTransaction) =>
  tx.type_.startsWith("تسديد") ||
  tx.type_.startsWith("استلام قسط") ||
  ((tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) &&
    !!tx.notes?.includes("قسط"));

export const getLinkedInstallmentId = (tx: PartnerTransaction) => {
  const match = tx.notes?.match(/قسط#(\d+)/);
  return match ? Number(match[1]) : null;
};

export const isLinkedInstallmentPayment = (tx: PartnerTransaction) =>
  isBorrowerInstallmentPayment(tx) &&
  (getLinkedInstallmentId(tx) != null ||
    (tx.source_type === "customer_payment" &&
      tx.source_role === "customer_payment" &&
      tx.type_.includes("قسط")));

export const isUnpaidInstallment = (tx: PartnerTransaction) =>
  isInstallmentScheduleTx(tx) &&
  (tx.type_ === "سحب" || tx.type_.startsWith("باقي")) &&
  (!!tx.notes?.includes("موعد تسليم") ||
    !!tx.notes?.includes("قسط") ||
    tx.type_.startsWith("باقي")) &&
  compareMoney(tx.amount, 0) > 0;

export const isSaleInstallmentTx = (tx: PartnerTransaction) =>
  tx.type_.startsWith("مقدمة") ||
  tx.type_.startsWith("باقي") ||
  tx.type_.startsWith("استلام") ||
  !!tx.notes?.includes("موعد تسليم") ||
  !!tx.notes?.includes("قسط");

export const isSaleDownPaymentRecord = (tx: PartnerTransaction) =>
  tx.source_type === "customer_sale_payment" &&
  tx.source_role === "sale_down_payment";

export const isAgencyReceivableRecord = (
  tx: PartnerTransaction | null | undefined,
) =>
  !!tx &&
  tx.kind === "وكالة" &&
  tx.source_type === "agency" &&
  tx.source_role === "agency_receivable";

export const isFinancialClientKind = (kind: string) =>
  kind === "مستثمر" || kind === "ممول" || kind === "شركة";

export const isBorrowerKind = (kind: string) =>
  kind === "زبون" || kind === "وكالة";

export const isCustomerRemainingBalanceTx = (tx: PartnerTransaction) =>
  !tx.type_.startsWith("تحويل") &&
  !tx.type_.startsWith("واصل") &&
  (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب"));

// ── Money / formatting helpers ──────────────────────────────────────────

export const moneyValueToNumber = (value: unknown): number => {
  const amount = toMoney(
    typeof value === "string" || typeof value === "number" ? value : null,
  );
  return amount.isFinite() ? amount.toNumber() : 0;
};

export const formatEnglishNumber = (value: unknown): string =>
  toMoney(typeof value === "string" || typeof value === "number" ? value : null)
    .toFixed()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const splitMoneyIntoInstallments = (
  total: MoneyInput,
  count: number,
  currency: "IQD" | "USD",
): string[] => {
  const safeCount = Math.max(1, Math.floor(count) || 1);
  const scale = currency === "USD" ? 2 : 0;
  const amount = toMoney(total);
  const regular = amount.div(safeCount).toDecimalPlaces(scale, Decimal.ROUND_FLOOR);
  const last = amount.minus(regular.times(safeCount - 1));
  return Array.from({ length: safeCount }, (_, index) =>
    (index === safeCount - 1 ? last : regular).toFixed(scale),
  );
};

export const firstAccountName = (name: string | null | undefined): string =>
  (name ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";

export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = String(
      (err as { message?: unknown }).message ?? "",
    ).trim();
    if (message) return message;
  }
  return fallback;
};

// ── Transaction direction labels ────────────────────────────────────────

export const transactionDirection = (
  accountKind: string,
  isWithdraw: boolean,
) => {
  if (isFinancialClientKind(accountKind)) {
    return {
      label: isWithdraw ? "تسليم" : "استلام",
      colorClass: isWithdraw ? "text-green" : "text-red",
      rowClass: isWithdraw
        ? "partner-tx-row--deposit"
        : "partner-tx-row--withdraw",
    };
  }
  if (isBorrowerKind(accountKind)) {
    return {
      label: isWithdraw ? "باقي" : "واصل",
      colorClass: isWithdraw ? "text-green" : "text-red",
      rowClass: isWithdraw
        ? "partner-tx-row--deposit"
        : "partner-tx-row--withdraw",
    };
  }
  return {
    label: isWithdraw ? "سحب" : "ايداع",
    colorClass: isWithdraw ? "text-red" : "text-green",
    rowClass: isWithdraw
      ? "partner-tx-row--withdraw"
      : "partner-tx-row--deposit",
  };
};

// ── Financier notes parser ──────────────────────────────────────────────

export const parseFinancierNotes = (
  notes: string | null,
  amount?: number,
) => {
  if (!notes)
    return {
      transferBy: "",
      commission: 0,
      commissionPercent: 0,
      originalNotes: "",
    };
  if (
    notes.startsWith("تم تسديد الممول") ||
    notes.startsWith("تم تسليم الممول")
  ) {
    let commission = 0;
    let commissionPercent = 0;
    let mainPart = notes;
    const commSplit = notes.split(" - عمولة:");
    if (commSplit.length > 1) {
      const commStr = commSplit[commSplit.length - 1].trim();
      if (commStr.includes("%")) {
        const pct = parseFloat(commStr.replace(/[^\d.]/g, "")) || 0;
        commissionPercent = pct;
        if (amount) {
          commission = (amount * pct) / 100;
        }
      } else {
        commission = parseFloat(commStr.replace(/[^\d.]/g, "")) || 0;
      }
      mainPart = commSplit.slice(0, -1).join(" - عمولة:");
    }
    let transferBy = "";
    let originalNotes = "";
    const transferByMatch = mainPart.match(
      /(?:ارسل اليه بواسطة|ارسل بيد)\s*([^-]+)/,
    );
    if (transferByMatch) {
      transferBy = transferByMatch[1].trim();
      const rest =
        mainPart.split(/(?:ارسل اليه بواسطة|ارسل بيد)\s*[^-]+/)[1] || "";
      if (rest.startsWith(" - ")) {
        originalNotes = rest.substring(3).trim();
      } else {
        originalNotes = rest.trim();
      }
    }
    return { transferBy, commission, commissionPercent, originalNotes };
  }
  const transferByMatch = notes.match(/نقل بواسطة:\s*([^-]+)/);
  const commissionPercentMatch = notes.match(/عمولة:\s*([\d.]+)%/);
  const pct = commissionPercentMatch ? Number(commissionPercentMatch[1]) : 0;
  const commission = pct && amount ? (amount * pct) / 100 : 0;
  const parts = notes.split(
    /-\s*عمولة:\s*[\d.]+%[^)]+\)\s*-?\s*/,
  );
  const originalNotes = parts.length > 1 ? parts[1].trim() : "";
  return {
    transferBy: transferByMatch ? transferByMatch[1].trim() : "",
    commission,
    commissionPercent: pct,
    originalNotes:
      originalNotes ||
      (notes.startsWith("نقل بواسطة:") ? "" : notes),
  };
};
