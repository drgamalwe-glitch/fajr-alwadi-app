/**
 * PartnersTab.tsx — FORENSIC FIX (re-audit 2026-07-11, PHASE-4-SPLIT):
 * This file is 4,024 lines and renders four sub-tabs (customers / personal /
 * receivables / liabilities). It is being migrated to a directory of
 * sub-components at src/components/partners/:
 *   - CustomersTab.tsx     (الزبائن)
 *   - PersonalTab.tsx      (الشركاء)
 *   - ReceivablesTab.tsx   (نطلب)
 *   - LiabilitiesTab.tsx   (مطلوبين)
 *
 * The sub-component files exist as documented stubs. The actual render logic
 * still lives in this file because physically moving 4,024 lines of JSX +
 * state + effects without compile-testing risks breaking the app. A
 * follow-up task should move each sub-tab's JSX block into its respective
 * sub-component file, one sub-tab at a time, with `npm run typecheck` after
 * each move.
 *
 * The PartnersTab component below will eventually become a thin shell that
 * delegates to the four sub-components.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { callTauri } from "../api/tauri";
import { todayIsoDate } from "../utils/dateSegments";
import type { Car, InstallmentPaymentPreview, Partner, PartnerTransaction, UnifiedAccount } from "../types";

import { toEnglishDigits } from "../utils/numberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { SearchableCombobox } from "./SearchableCombobox";
import { UnifiedDateField } from "./UnifiedDateField";
import { ActionButton, TextInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { PAGE_SIZE } from "../constants";
import { cn } from "../lib/utils";
import { GoldFxButton } from "./ui/GoldFxButton";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { formatNotesText } from "../utils/notesDisplay";
import { printStatement } from "../pdf/printStatement";
import Decimal from "decimal.js";
import { toMoney, moneyAdd, moneySub, moneyDiv, moneyMul, moneySum, compareMoney, moneyAbs, type MoneyValue } from "../utils/money";

interface PartnersTabProps {
  partners: Partner[];
  onRefresh: () => Promise<void>;
  kind: string;
  partnersSearchOpen?: boolean;
  onPartnersSearchClose?: () => void;
  onPartnerActionsChange?: (actions: { onDeposit: () => void; onWithdraw: () => void; depositLabel?: string; withdrawLabel?: string } | null) => void;
  onAddAccountChange?: (onAddAccount: { action: () => void } | null) => void;
  pendingPartnerOpen?: {
    name: string;
    kind?: string | null;
    action?: "deposit" | "withdraw" | "settle_installment";
    transactionId?: number | null;
  } | null;
  onPendingPartnerOpened?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  requestCloseRef?: React.MutableRefObject<{ request: (afterClose?: () => void) => void } | null>;
  initialSubTab?: AccountsTabId | null;
  onInitialSubTabSet?: () => void;
  onSubTabChange?: (tab: AccountsTabId) => void;
  returnState?: { section: string; subTab?: string } | null;
  onReturn?: () => void;
  cars?: Car[];
  onNavigateToCar?: (carNumber: string, status: "available" | "sold", initialPage?: 0 | 1) => void;
  sessionToken?: string | null;
}

const normalizeArabic = (str: string): string => {
  return str
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "");
};

const createEmptyForm = (kind: string) => ({
  name: "",
  phone: "",
  kind: kind === "partners-financial" ? "" : kind,
});

type TransactionType = "ايداع" | "سحب";
type TransactionSortKey = "sequence" | "date" | "type" | "amount";
type SortDirection = "asc" | "desc";
type InstallmentModalMode = "pay" | "reverse";

type InstallmentModalState = {
  mode: InstallmentModalMode;
  tx: PartnerTransaction;
  installmentId: number;
  actualPaidAmount: number;
  preview: InstallmentPaymentPreview | null;
  loadingPreview: boolean;
  error: string | null;
};

const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  (tx.type_ === "سحب" || tx.type_.startsWith("باقي")) && (!!tx.notes?.includes("قسط") || tx.type_.startsWith("باقي اقساط"));

const isInstallmentScheduleTx = (tx: PartnerTransaction) =>
  tx.source_type === "customer_installment_schedule" &&
  tx.source_role === "installment_schedule";

const isCustomerInstallmentRecord = (tx: PartnerTransaction) =>
  isInstallmentWithdrawal(tx) ||
  (tx.type_.startsWith("واصل") && (!!tx.notes?.includes("قسط") || tx.type_.includes("قسط")));

const isBorrowerInstallmentPayment = (tx: PartnerTransaction) =>
  tx.type_.startsWith("تسديد") ||
  tx.type_.startsWith("استلام قسط") ||
  ((tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) && !!tx.notes?.includes("قسط"));

const getLinkedInstallmentId = (tx: PartnerTransaction) => {
  const match = tx.notes?.match(/قسط#(\d+)/);
  return match ? Number(match[1]) : null;
};

const isLinkedInstallmentPayment = (tx: PartnerTransaction) =>
  isBorrowerInstallmentPayment(tx) && (
    getLinkedInstallmentId(tx) != null ||
    (tx.source_type === "customer_payment" && tx.source_role === "customer_payment" && tx.type_.includes("قسط"))
  );

const isUnpaidInstallment = (tx: PartnerTransaction) =>
  isInstallmentScheduleTx(tx) &&
  (tx.type_ === "سحب" || tx.type_.startsWith("باقي")) &&
  (!!tx.notes?.includes("موعد تسليم") || !!tx.notes?.includes("قسط") || tx.type_.startsWith("باقي")) &&
  compareMoney(tx.amount, 0) > 0;

// معاملات بيع السيارة بموعد تسليم أو تقسيط (تُعرض كـ باقي/واصل بدلاً من سحب/ايداع)
const isSaleInstallmentTx = (tx: PartnerTransaction) =>
  tx.type_.startsWith("مقدمة") || tx.type_.startsWith("باقي") || tx.type_.startsWith("استلام") || !!tx.notes?.includes("موعد تسليم") || !!tx.notes?.includes("قسط");

const isSaleDownPaymentRecord = (tx: PartnerTransaction) =>
  tx.source_type === "customer_sale_payment" &&
  tx.source_role === "sale_down_payment";

const isAgencyReceivableRecord = (tx: PartnerTransaction | null | undefined) =>
  !!tx &&
  tx.kind === "وكالة" &&
  tx.source_type === "agency" &&
  tx.source_role === "agency_receivable";

const isFinancialClientKind = (kind: string) =>
  kind === "مستثمر" || kind === "ممول" || kind === "شركة";

const isBorrowerKind = (kind: string) => kind === "زبون" || kind === "وكالة";

const isCustomerRemainingBalanceTx = (tx: PartnerTransaction) =>
  !tx.type_.startsWith("تحويل") &&
  !tx.type_.startsWith("واصل") &&
  (tx.type_.startsWith("باقي") || tx.type_.startsWith("سحب"));

const moneyValueToNumber = (value: unknown): number => {
  const amount = toMoney(value as any);
  return amount.isFinite() ? amount.toNumber() : 0;
};

const formatEnglishNumber = (value: unknown): string =>
  moneyValueToNumber(value).toLocaleString("en-US");

const firstAccountName = (name: string | null | undefined): string =>
  (name ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message.trim()) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
};

type AccountsTabId = "customers" | "personal" | "receivables" | "liabilities";

const ACCOUNT_LIST_KINDS = new Set(["مستثمر", "ممول", "زبون", "وكالة", "شركة"]);

const isAccountListKind = (kind: string) => ACCOUNT_LIST_KINDS.has(kind);

const transactionDirection = (accountKind: string, isWithdraw: boolean) => {
  if (isFinancialClientKind(accountKind)) {
    return {
      label: isWithdraw ? "تسليم" : "استلام",
      colorClass: isWithdraw ? "text-green" : "text-red",
      rowClass: isWithdraw ? "partner-tx-row--deposit" : "partner-tx-row--withdraw",
    };
  }
  if (isBorrowerKind(accountKind)) {
    return {
      label: isWithdraw ? "باقي" : "واصل",
      colorClass: isWithdraw ? "text-green" : "text-red",
      rowClass: isWithdraw ? "partner-tx-row--deposit" : "partner-tx-row--withdraw",
    };
  }
  return {
    label: isWithdraw ? "سحب" : "ايداع",
    colorClass: isWithdraw ? "text-red" : "text-green",
    rowClass: isWithdraw ? "partner-tx-row--withdraw" : "partner-tx-row--deposit",
  };
};

const parseFinancierNotes = (notes: string | null, amount?: number) => {
  if (!notes) return { transferBy: "", commission: 0, commissionPercent: 0, originalNotes: "" };
  if (notes.startsWith("تم تسديد الممول") || notes.startsWith("تم تسليم الممول")) {
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
    const transferByMatch = mainPart.match(/(?:ارسل اليه بواسطة|ارسل بيد)\s*([^-]+)/);
    if (transferByMatch) {
      transferBy = transferByMatch[1].trim();
      const rest = mainPart.split(/(?:ارسل اليه بواسطة|ارسل بيد)\s*[^-]+/)[1] || "";
      if (rest.startsWith(" - ")) {
        originalNotes = rest.substring(3).trim();
      } else {
        originalNotes = rest.trim();
      }
    }
    return {
      transferBy,
      commission,
      commissionPercent,
      originalNotes
    };
  }
  const transferByMatch = notes.match(/نقل بواسطة:\s*([^-]+)/);
  const commissionPercentMatch = notes.match(/عمولة:\s*([\d.]+)%/);
  const pct = commissionPercentMatch ? Number(commissionPercentMatch[1]) : 0;
  const commission = (pct && amount) ? (amount * pct) / 100 : 0;
  const parts = notes.split(/-\s*عمولة:\s*[\d.]+%[^)]+\)\s*-?\s*/);
  const originalNotes = parts.length > 1 ? parts[1].trim() : "";
  return {
    transferBy: transferByMatch ? transferByMatch[1].trim() : "",
    commission,
    commissionPercent: pct,
    originalNotes: originalNotes || (notes.startsWith("نقل بواسطة:") ? "" : notes)
  };
};

const ACCOUNTS_TABS: { id: AccountsTabId; label: string }[] = [
  { id: "customers", label: "العملاء" },
  { id: "personal", label: "الشركاء" },
  { id: "receivables", label: "نطلب" },
  { id: "liabilities", label: "مطلوبين" },
];

export function PartnersTab({
  partners,
  onRefresh,
  kind,
  partnersSearchOpen,
  onPartnersSearchClose,
  onPartnerActionsChange,
  onAddAccountChange,
  pendingPartnerOpen,
  onPendingPartnerOpened,
  onDirtyChange,
  requestCloseRef,
  initialSubTab,
  onInitialSubTabSet,
  onSubTabChange,
  returnState,
  onReturn,
  cars = [],
  onNavigateToCar,
  sessionToken,
}: PartnersTabProps) {
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [page, setPage] = useState(0);
  const [accountsTab, setAccountsTab] = useState<AccountsTabId>("customers");
  const accountsTabRef = useRef(accountsTab);
  accountsTabRef.current = accountsTab;
  const [originAccountsTab, setOriginAccountsTab] = useState<AccountsTabId>("customers");
  const [sharikListView, setSharikListView] = useState(true); // true = قائمة الشركاء، false = حساب شريك محدد
  const [sharikPage, setSharikPage] = useState(0);
  const [partnersSearch, setPartnersSearch] = useState("");
  const [partnersSearchHighlightIdx, setPartnersSearchHighlightIdx] = useState(0);
  const partnersSearchInputRef = useRef<HTMLInputElement>(null);
  const [partnerToView, setPartnerToView] = useState<Partner | null>(null);

  const purchasedCars = useMemo(() => {
    if (!partnerToView || partnerToView.kind !== "زبون" || !cars) return [];
    const normalizedPartnerName = normalizeArabic(partnerToView.partner_name);
    return cars.filter(c => c.buyer_name && normalizeArabic(c.buyer_name) === normalizedPartnerName);
  }, [partnerToView, cars]);

  const customerDeferredSaleCar = useMemo(() => {
    return [...purchasedCars]
      .filter((car) => car.payment_type === "اقساط" || car.payment_type === "موعد" || (car.delivery_date && car.delivery_date.trim() !== ""))
      .sort((a, b) =>
        (b.sale_date ?? "").localeCompare(a.sale_date ?? "") ||
        b.car_number.localeCompare(a.car_number)
      )[0] ?? null;
  }, [purchasedCars]);

  useEffect(() => {
    onSubTabChange?.(accountsTab);
  }, [accountsTab, onSubTabChange]);

  const muntasirPartner = partners.find(p => p.partner_name.includes("منتصر") && p.kind === "شريك");
  const amirPartner = partners.find(p => (p.partner_name.includes("امير") || p.partner_name.includes("أمير")) && p.kind === "شريك");

  const muntasirPhone = muntasirPartner?.phone || "07812541714";
  const amirPhone = amirPartner?.phone || "07808425228";

  const fetchUnifiedAccounts = useCallback(async () => {
    if (kind !== "partners-financial") return [];

    try {
      const data = await callTauri<UnifiedAccount[]>("get_unified_accounts");
      const nextAccounts = data ?? [];
      setUnifiedAccounts(nextAccounts);
      return nextAccounts;
    } catch (err) {
      console.error("Failed to fetch unified accounts:", err);
      return [];
    } finally {

    }
  }, [kind]);

  useEffect(() => {
    if (kind !== "partners-financial") return;
    let cancelled = false;
    fetchUnifiedAccounts().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [kind, partners, fetchUnifiedAccounts]);

  // Cleanup sidebar actions on unmount
  useEffect(() => {
    return () => {
      onPartnerActionsChange?.(null);
    };
  }, [onPartnerActionsChange]);

  useEffect(() => {
    if (initialSubTab) {
      setAccountsTab(initialSubTab);
      setOriginAccountsTab(initialSubTab);
      setSharikListView(true);
      setPartnerToView(null);
      setEditingKey(null);
      setTransactions([]);
      onPartnerActionsChange?.(null);
      onInitialSubTabSet?.();
    }
  }, [initialSubTab, onInitialSubTabSet]);

  const [form, setForm] = useState(createEmptyForm(kind));
  const formRef = useRef(createEmptyForm(kind));
  const savingRef = useRef(false);
  const usesUnifiedAccounts = kind === "partners-financial";
  const requiresPhoneForCustomerAccount = (accountKind: string) =>
    kind === "partners-financial" && accountsTab !== "personal" && accountKind !== "شريك";
  const markAccountFieldError = (field: "name" | "phone") => {
    const selector = field === "name"
      ? '#partner-name, .toolbar-field-input[placeholder="اسم صاحب الحساب"]'
      : '#partner-phone, .toolbar-field-input[placeholder="رقم الهاتف"], input[placeholder="رقم الهاتف"]';
    const input = document.querySelector(selector) as HTMLElement | null;
    if (input) {
      input.classList.add("input--error");
      input.focus();
    }
  };
  const clearAccountFieldError = (field: "name" | "phone") => {
    const selector = field === "name"
      ? '#partner-name, .toolbar-field-input[placeholder="اسم صاحب الحساب"]'
      : '#partner-phone, .toolbar-field-input[placeholder="رقم الهاتف"], input[placeholder="رقم الهاتف"]';
    document.querySelectorAll(selector).forEach((el) => el.classList.remove("input--error"));
  };
  const [partnersSort, setPartnersSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const handleSortPartners = (key: string) => {
    setPartnersSort((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const myPartners = useMemo(() => {
    let list = [];
    if (kind === "partners-financial") {
      // تبويب "حسابات العملاء" يعرض فقط حسابات العملاء والجهات المالية — بدون شريك
      list = partners.filter((p) => isAccountListKind(p.kind));
    } else {
      list = partners.filter((p) => (p.kind || kind) === kind);
    }

    if (!partnersSort) return list;
    const { key, direction } = partnersSort;
    const sign = direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (key === "kind") {
        return (a.kind || "").localeCompare(b.kind || "", "ar") * sign;
      }
      if (key === "phone") {
        return (a.phone || "").localeCompare(b.phone || "") * sign;
      }
      if (key === "amount") {
        const valA = a.total_amount || a.total_withdrawals || 0;
        const valB = b.total_amount || b.total_withdrawals || 0;
        return compareMoney(valA, valB) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [partners, kind, partnersSort]);

  // قائمة الشركاء (kind === "شريك") — تُعرض في تبويب "الشركاء" داخل partners-financial
  const sharikPartners = useMemo(() => {
    if (kind !== "partners-financial") return [];
    const list = partners.filter((p) => p.kind === "شريك");
    if (!partnersSort) return list;
    const { key, direction } = partnersSort;
    const sign = direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (key === "phone") return (a.phone || "").localeCompare(b.phone || "") * sign;
      if (key === "amount") {
        const valA = a.total_amount || 0;
        const valB = b.total_amount || 0;
        return compareMoney(valA, valB) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [partners, kind, partnersSort]);

  // Audit fix #5: share ratios must never mix IQD and USD amounts in one division.
  // The ratio is computed per currency: IQD balances are used when the group has
  // any positive IQD total, otherwise USD balances are used.
  const partnerRatioIn = useCallback((partner: Partner, group: Partner[]): number => {
    const totalIqd = moneySum(group, (p) => p.iqd_balance ?? 0);
    const totalUsd = moneySum(group, (p) => p.usd_balance ?? 0);
    if (compareMoney(totalIqd, 0) > 0) {
      return moneyDiv(toMoney(partner.iqd_balance ?? 0), totalIqd).times(100).toNumber();
    }
    if (compareMoney(totalUsd, 0) > 0) {
      return moneyDiv(toMoney(partner.usd_balance ?? 0), totalUsd).times(100).toNumber();
    }
    return 0;
  }, []);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [modalPage, setModalPage] = useState(0);

  useEffect(() => {
    setModalPage(0);
  }, [editingKey]);
  const [originalPartnerData, setOriginalPartnerData] = useState<{ name: string; phone: string; kind: string } | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "new" | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTxConfirm, setDeleteTxConfirm] = useState<PartnerTransaction | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const isFormNameDuplicate = form.name.trim() !== "" && (() => {
    const normalizedFormName = normalizeArabic(form.name);
    if (editingKey) {
      if (normalizedFormName === normalizeArabic(editingKey)) {
        return false;
      }
    }
    return (partners || []).some(
      (p) => normalizeArabic(p.partner_name) === normalizedFormName
    );
  })();
  const [currencyTotals, setCurrencyTotals] = useState<[number, number]>([0, 0]);
  const transactionsDirtyRef = useRef(false);
  const pendingPartnerCloseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchTotals = async () => {
      try {
        const queryKind = kind === "partners-financial"
          ? (accountsTab === "personal" ? "partners-only" : "customers-only")
          : kind;
        const data = await callTauri<[number, number]>("get_partners_totals", { kind: queryKind });
        if (!cancelled) setCurrencyTotals(data ?? [0, 0]);
      } catch {
        if (!cancelled) setCurrencyTotals([0, 0]);
      }
    };
    fetchTotals();
    return () => { cancelled = true; };
  }, [kind, accountsTab, myPartners, sharikPartners]);

  const [txCurrency, setTxCurrency] = useState<Currency>("IQD");
  const [txForm, setTxForm] = useState({
    type: "ايداع" as TransactionType,
    amount: 0,
    date: todayIsoDate(),
    notes: "",
    installments: 1,
    paymentType: "قاصه" as "قاصه" | "قاصه" | "مصرف" | "ممول",
    transferBy: "",
    commission: 0,
    commissionPercent: 0,
  });
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [transactionSort, setTransactionSort] = useState<{
    key: TransactionSortKey;
    direction: SortDirection;
  }>({ key: "sequence", direction: "asc" });
  const transactionListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTransactionsRef = useRef(false);










  const [accountsSort, setAccountsSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const handleSortAccounts = (key: string) => {
    setAccountsSort((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filteredAndSortedAccounts = useMemo(() => {
    const isFinancialAccountsList = kind === "partners-financial" && accountsTab !== "personal";
    if (!isFinancialAccountsList) return [];

    let result = unifiedAccounts.filter((acc) => {
      if (!isAccountListKind(acc.kind)) return false;
      const iqdBalance = moneyValueToNumber(acc.iqd_balance);
      const usdBalance = moneyValueToNumber(acc.usd_balance);
      if (accountsTab === "customers") return iqdBalance === 0 && usdBalance === 0;
      if (accountsTab === "receivables") return iqdBalance > 0 || usdBalance > 0;
      if (accountsTab === "liabilities") return iqdBalance < 0 || usdBalance < 0;
      return false;
    });

    if (!accountsSort) return result;
    const { key, direction } = accountsSort;
    const sign = direction === "asc" ? 1 : -1;
    return result.sort((a, b) => {
      if (key === "phone") {
        return (a.phone || "").localeCompare(b.phone || "") * sign;
      }
      if (key === "iqd") {
        return (moneyValueToNumber(a.iqd_balance) - moneyValueToNumber(b.iqd_balance)) * sign;
      }
      if (key === "usd") {
        return (moneyValueToNumber(a.usd_balance) - moneyValueToNumber(b.usd_balance)) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [unifiedAccounts, kind, accountsTab, accountsSort]);

  useEffect(() => {
    const usesUnifiedAccountsTable = kind === "partners-financial" && accountsTab !== "personal";
    const totalCount = usesUnifiedAccountsTable ? filteredAndSortedAccounts.length : myPartners.length;
    const lastPage = Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [kind, accountsTab, filteredAndSortedAccounts.length, myPartners.length]);

  const totalPages = useMemo(() => {
    const usesUnifiedAccountsTable = kind === "partners-financial" && accountsTab !== "personal";
    const totalCount = usesUnifiedAccountsTable ? filteredAndSortedAccounts.length : myPartners.length;
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  }, [kind, accountsTab, filteredAndSortedAccounts, myPartners]);

  const currentPage = Math.min(page, totalPages - 1);

  const pageAccounts = useMemo(() => {
    return filteredAndSortedAccounts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [filteredAndSortedAccounts, currentPage]);

  const pagePartners = useMemo(() => {
    return myPartners.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [myPartners, currentPage]);

  const stats = useMemo(() => {
    let iqdTheyOwe = 0;
    let usdTheyOwe = 0;
    let iqdWeOwe = 0;
    let usdWeOwe = 0;

    for (const acc of unifiedAccounts) {
      if (kind === "partners-financial") {
        if (!isAccountListKind(acc.kind)) continue;
      } else {
        continue;
      }
      const iqdBalance = moneyValueToNumber(acc.iqd_balance);
      const usdBalance = moneyValueToNumber(acc.usd_balance);
      if (iqdBalance > 0) {
        iqdTheyOwe += iqdBalance;
      } else if (iqdBalance < 0) {
        iqdWeOwe += Math.abs(iqdBalance);
      }

      if (usdBalance > 0) {
        usdTheyOwe += usdBalance;
      } else if (usdBalance < 0) {
        usdWeOwe += Math.abs(usdBalance);
      }
    }

    const iqdNet = iqdTheyOwe - iqdWeOwe;
    const usdNet = usdTheyOwe - usdWeOwe;

    return {
      iqdTheyOwe,
      usdTheyOwe,
      iqdWeOwe,
      usdWeOwe,
      iqdNet,
      usdNet,
    };
  }, [unifiedAccounts, kind]);

  const [showTxModal, setShowTxModal] = useState(false);
  const [installmentModal, setInstallmentModal] = useState<InstallmentModalState | null>(null);
  const [installmentProcessing, setInstallmentProcessing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<{ name: string; kind: string } | null>(null);
  const [settleFunderName, setSettleFunderName] = useState("");
  const [showFunderInsuffientModal, setShowFunderInsuffientModal] = useState(false);
  const [insufficientFunderDetails, setInsufficientFunderDetails] = useState<{
    name: string;
    required: number;
    available: number;
    currency: string;
  } | null>(null);
  const [companyPaymentMode, setCompanyPaymentMode] = useState<"" | "cash" | "funder">("");
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [printFromDate, setPrintFromDate] = useState("");
  const [printToDate, setPrintToDate] = useState("");

  const replaceForm = (next: ReturnType<typeof createEmptyForm>) => {
    formRef.current = next;
    setForm(next);
  };

  const patchForm = (patch: Partial<ReturnType<typeof createEmptyForm>>) => {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
  };

  const loadPartner = async (partner: Partner, preserveType?: boolean) => {
    setEditingKey(partner.partner_name);
    setOriginalPartnerData({ name: partner.partner_name, phone: partner.phone, kind: partner.kind });
    replaceForm({ name: partner.partner_name, phone: partner.phone, kind: partner.kind });
    setModalMode("view");
    transactionsDirtyRef.current = false;
    setEditingTransactionId(null);
    setTransactionSort({ key: "date", direction: "asc" });
    if (!preserveType) {
      setTxForm({ type: "ايداع", amount: 0, date: todayIsoDate(), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 0 });
    }
    setTransactionsLoading(true);
    let loadedTransactions: PartnerTransaction[] = [];
    try {
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
        partnerName: partner.partner_name,
        kind: partner.kind,
      });
      loadedTransactions = txs ?? [];
      setTransactions(loadedTransactions);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
    return loadedTransactions;
  };

  const routeSettledAccountToCustomers = (accounts: UnifiedAccount[], accountName: string, accountKind: string) => {
    const updatedAccount = accounts.find(
      (acc) => acc.partner_name === accountName && acc.kind === accountKind,
    );
    if (
      updatedAccount &&
      moneyValueToNumber(updatedAccount.iqd_balance) === 0 &&
      moneyValueToNumber(updatedAccount.usd_balance) === 0
    ) {
      setOriginAccountsTab("customers");
    }
  };

  const resetForm = (nextAccountsTab?: AccountsTabId) => {
    setEditingKey(null);
    setOriginalPartnerData(null);
    replaceForm(createEmptyForm(kind));
    setModalMode(null);
    setDeleteDialogOpen(false);
    setTransactions([]);
    setEditingTransactionId(null);
    setPartnerToView(null);
    setShowNewAccount(false);
    const targetTab = nextAccountsTab !== undefined ? nextAccountsTab : originAccountsTab;
    setAccountsTab(targetTab);
    if (nextAccountsTab !== undefined) {
      setOriginAccountsTab(nextAccountsTab);
    }
    setSharikListView(true);
    onPartnerActionsChange?.(null);
  };

  const handleClose = async () => {
    if (modalMode === "view") {
      const changed =
        form.name !== originalPartnerData?.name ||
        form.phone !== originalPartnerData?.phone ||
        form.kind !== originalPartnerData?.kind ||
        transactionsDirtyRef.current;
      if (changed) {
        setShowExitConfirm(true);
        return;
      }
      resetForm();
      return;
    }
    resetForm();
  };

  const handleExitConfirmSave = async () => {
    setShowExitConfirm(false);
    if (modalMode === "view" && editingKey) {
      await handleAutoSave();
    }
    resetForm();
    pendingPartnerCloseRef.current?.();
    pendingPartnerCloseRef.current = null;
  };

  const handleExitConfirmDiscard = () => {
    setShowExitConfirm(false);
    resetForm();
    pendingPartnerCloseRef.current?.();
    pendingPartnerCloseRef.current = null;
  };

  const startNew = () => {
    setEditingKey(null);
    setOriginalPartnerData(null);
    replaceForm(createEmptyForm(kind));
    setModalMode(null);
    setTransactions([]);
    setShowNewAccount(true);
    if (kind === "partners-financial") {
      if (accountsTab === "personal") {
        // إضافة شريك جديد من تبويب الشركاء
        replaceForm({ name: "", phone: "", kind: "شريك" });
        setSharikListView(false);
        setPartnerToView({ partner_name: "", phone: "", kind: "شريك", total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0 });
      } else {
        setOriginAccountsTab(accountsTab);
        setAccountsTab("personal");
        setPartnerToView({ partner_name: "", phone: "", kind: formRef.current.kind, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0 });
      }
    }
  };

  // Register sidebar "Add Account" action
  useEffect(() => {
    if (kind === "partners-financial" && modalMode === null) {
      if (accountsTab !== "personal") {
        onAddAccountChange?.({
          action: () => {
            setEditingKey(null);
            setOriginalPartnerData(null);
            replaceForm({ name: "", phone: "", kind: "مستثمر" });
            setModalMode("new");
            setShowNewAccount(false);
          }
        });
      } else if (accountsTab === "personal" && sharikListView) {
        onAddAccountChange?.(null);
      } else {
        onAddAccountChange?.(null);
      }
    } else {
      onAddAccountChange?.(null);
    }
    return () => {
      onAddAccountChange?.(null);
    };
  }, [kind, accountsTab, sharikListView, modalMode, onAddAccountChange]);

  const patchPhone = (value: string) => {
    const normalized = toEnglishDigits(value);
    const cleaned = normalized.replace(/[^\d+\s()-]/g, "");
    if (cleaned.trim()) clearAccountFieldError("phone");
    patchForm({ phone: cleaned });
  };

  const patchName = (value: string) => {
    const nextName = value;
    if (nextName.trim()) clearAccountFieldError("name");
    patchForm({ name: nextName });
  };

  const resetTransactionForm = (type: TransactionType = txForm.type) => {
    setEditingTransactionId(null);
    setTxForm({
      type,
      amount: 0,
      date: todayIsoDate(),
      notes: "",
      installments: 1,
      paymentType: (formRef.current.kind === "ممول" && type === "ايداع") ? "ممول" : "قاصه",
      transferBy: "",
      commission: 0,
      commissionPercent: 0,
    });
  };

  const ensurePartnerSaved = async () => {
    const currentForm = formRef.current;
    const nameClean = currentForm.name.trim();
    const phoneClean = toEnglishDigits(currentForm.phone.trim());
    if (!nameClean) {
      alert(kind === "partners-financial" ? "الرجاء كتابة اسم الحساب" : `الرجاء كتابة اسم ${form.kind}`);
      markAccountFieldError("name");
      return null;
    }
    if (!editingKey && requiresPhoneForCustomerAccount(currentForm.kind) && !phoneClean) {
      alert("الرجاء كتابة رقم الهاتف قبل إضافة الحساب");
      markAccountFieldError("phone");
      return null;
    }

    if (!editingKey) {
      // هل الشريك موجود بنفس النوع؟
      const exactMatch = partners.find(
        (p) => p.partner_name.trim() === nameClean && p.kind === currentForm.kind
      );
      if (exactMatch) {
        setEditingKey(nameClean);
        setOriginalPartnerData({ name: nameClean, phone: phoneClean, kind: currentForm.kind });
        await onRefresh();
        if (usesUnifiedAccounts) void fetchUnifiedAccounts();
        return nameClean;
      }

      // هل الشريك موجود بنوع مختلف؟ استخدمه مباشرة بدون إنشاء جديد
      const anyMatch = partners.find(
        (p) => p.partner_name.trim() === nameClean
      );
      if (anyMatch) {
        setEditingKey(nameClean);
        setOriginalPartnerData({ name: nameClean, phone: phoneClean, kind: anyMatch.kind });
        await onRefresh();
        if (usesUnifiedAccounts) void fetchUnifiedAccounts();
        return nameClean;
      }

      if (savingRef.current) return null;
      savingRef.current = true;
      setSaving(true);
      try {
        await callTauri("add_partner", {
          name: nameClean,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nameClean);
        setOriginalPartnerData({ name: nameClean, phone: phoneClean, kind: form.kind });
        await onRefresh();
        if (usesUnifiedAccounts) void fetchUnifiedAccounts();
        return nameClean;
      } catch (err) {
        console.error("Failed to auto-add partner:", err);
        const errMsg = String(err);
        if (errMsg.includes("UNIQUE") || errMsg.includes("unique") || errMsg.includes("constraint") || errMsg.includes("Constraint")) {
          alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
        } else {
          alert("تعذر حفظ الحساب.");
        }
        return null;
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
    }
    return editingKey;
  };

  const openDepositForm = async () => {
    const savedKey = await ensurePartnerSaved();
    if (!savedKey) return;
    resetTransactionForm("ايداع");
    setShowTxModal(true);
  };

  const openWithdrawForm = async () => {
    const savedKey = await ensurePartnerSaved();
    if (!savedKey) return;
    setCompanyPaymentMode("");
    resetTransactionForm("سحب");
    setShowTxModal(true);
  };

  const beginEditTransaction = (tx: PartnerTransaction) => {
    setEditingTransactionId(tx.id);
    const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
    const paymentType = (rawPaymentType === "مصرف" || rawPaymentType === "قاصه") ? rawPaymentType : (rawPaymentType === "ممول" ? "ممول" : "قاصه");
    const currentKind = formRef.current.kind;

    const isFinancierRepayment = currentKind === "ممول" && tx.type_.startsWith("سحب");
    const txAmount = moneyValueToNumber(tx.amount);
    const parsedNotes = isFinancierRepayment ? parseFinancierNotes(tx.notes, txAmount) : null;

    const isPaidBorrowerInst = currentKind === "زبون" && isCustomerInstallmentRecord(tx) && paidTransactionIds.has(tx.id);
    const isWithdraw = (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) && !isPaidBorrowerInst;

    setTxForm({
      type: isWithdraw ? "سحب" : "ايداع",
      amount: txAmount,
      date: tx.date?.split(" ")[0] || todayIsoDate(),
      notes: parsedNotes ? parsedNotes.originalNotes : (tx.notes ?? ""),
      installments: 1,
      paymentType,
      transferBy: parsedNotes ? parsedNotes.transferBy : "",
      commission: parsedNotes ? parsedNotes.commission : 0,
      commissionPercent: parsedNotes ? parsedNotes.commissionPercent : 0,
    });
    if (tx.currency === "USD" || tx.currency === "IQD") {
      setTxCurrency(tx.currency);
    }
    setShowTxModal(true);
  };

  const beginSettleInstallment = (tx: PartnerTransaction) => {
    openInstallmentModal(tx, "pay");
  };

  const openInstallmentModal = (tx: PartnerTransaction, mode?: InstallmentModalMode) => {
    const resolvedMode: InstallmentModalMode = mode ?? (tx.type_.startsWith("واصل") ? "reverse" : "pay");
    const installmentId = isInstallmentScheduleTx(tx) ? tx.id : getLinkedInstallmentId(tx);
    if (!installmentId) {
      setInstallmentModal({
        mode: resolvedMode,
        tx,
        installmentId: tx.id,
        actualPaidAmount: moneyValueToNumber(tx.current_amount ?? tx.amount),
        preview: null,
        loadingPreview: false,
        error: "تعذر تحديد القسط المرتبط بهذه الحركة",
      });
      return;
    }
    const currentAmount = moneyValueToNumber(tx.current_amount ?? tx.amount);
    setInstallmentModal({
      mode: resolvedMode,
      tx,
      installmentId,
      actualPaidAmount: currentAmount,
      preview: null,
      loadingPreview: resolvedMode === "pay",
      error: null,
    });
  };

  useEffect(() => {
    if (!installmentModal || installmentModal.mode !== "pay") return;
    let cancelled = false;
    const loadPreview = async () => {
      if (!installmentModal.actualPaidAmount || installmentModal.actualPaidAmount <= 0) {
        setInstallmentModal((current) => current ? { ...current, preview: null, loadingPreview: false, error: "المبلغ المدفوع فعلياً يجب أن يكون أكبر من صفر" } : current);
        return;
      }
      setInstallmentModal((current) => current ? { ...current, loadingPreview: true, error: null } : current);
      try {
        const preview = await callTauri<InstallmentPaymentPreview>("preview_installment_payment_redistribution", {
          installmentId: installmentModal.installmentId,
          actualPaidAmount: installmentModal.actualPaidAmount,
          currency: installmentModal.tx.currency || "IQD",
        });
        if (!cancelled) {
          setInstallmentModal((current) => current ? { ...current, preview, loadingPreview: false, error: null } : current);
        }
      } catch (err) {
        if (!cancelled) {
          setInstallmentModal((current) => current ? { ...current, preview: null, loadingPreview: false, error: getErrorMessage(err, "تعذرت معاينة توزيع الدفعة") } : current);
        }
      }
    };
    loadPreview();
    return () => { cancelled = true; };
  }, [installmentModal?.mode, installmentModal?.installmentId, installmentModal?.actualPaidAmount, installmentModal?.tx.currency]);

  const refreshCurrentPartnerAfterInstallment = async () => {
    if (!editingKey) return;
    transactionsDirtyRef.current = true;
    await loadPartner({ partner_name: editingKey, phone: form.phone, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: form.kind }, true);
    await onRefresh();
    if (usesUnifiedAccounts) {
      const accounts = await fetchUnifiedAccounts();
      routeSettledAccountToCustomers(accounts, editingKey, form.kind);
    }
  };

  const confirmInstallmentModal = async () => {
    if (!installmentModal || installmentProcessing || !editingKey) return;
    setInstallmentProcessing(true);
    try {
      if (installmentModal.mode === "pay") {
        if (!installmentModal.preview) {
          throw new Error(installmentModal.error || "يجب انتظار معاينة توزيع الدفعة");
        }
        await callTauri("pay_customer_installment", {
          installmentId: installmentModal.installmentId,
          customerName: editingKey,
          actualPaidAmount: installmentModal.actualPaidAmount,
          date: todayIsoDate(),
          notes: `تسديد ${installmentModal.tx.notes || "قسط"}`,
          currency: installmentModal.tx.currency || "IQD",
          paymentType: installmentModal.tx.payment_type || installmentModal.tx.paymentType || "قاصه",
          sessionToken,
        });
      } else {
        await callTauri("reverse_customer_installment_payment", {
          installmentId: installmentModal.installmentId,
        });
      }
      setInstallmentModal(null);
      await refreshCurrentPartnerAfterInstallment();
    } catch (err) {
      setInstallmentModal((current) => current ? { ...current, error: getErrorMessage(err, "تعذرت معالجة القسط") } : current);
    } finally {
      setInstallmentProcessing(false);
    }
  };

  const handleSortTransactions = (key: TransactionSortKey) => {
    setTransactionSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedTransactions = useMemo(() => {
    const direction = transactionSort.direction === "asc" ? 1 : -1;
    return [...transactions].sort((a, b) => {
      if (transactionSort.key === "date") {
        const diff = (new Date(a.date).getTime() - new Date(b.date).getTime()) * direction;
        if (diff !== 0) return diff;
        if (a.time && b.time && a.time !== b.time) {
          return a.time.localeCompare(b.time) * direction;
        }
        return (a.id - b.id) * direction;
      }
      if (transactionSort.key === "type") {
        return a.type_.localeCompare(b.type_, "ar") * direction;
      }
      if (transactionSort.key === "amount") {
        return compareMoney(a.amount, b.amount) * direction;
      }
      return (a.id - b.id) * direction;
    });
  }, [transactions, transactionSort]);

  const isOriginalCustomerInstallmentRow = useCallback((tx: PartnerTransaction) =>
    form.kind === "زبون" &&
    (tx.type_.startsWith("باقي") || tx.type_.startsWith("واصل")) &&
    (tx.type_.includes("قسط") || !!tx.notes?.includes("قسط")),
    [form.kind]);

  const isProfitRecognition = useCallback((tx: PartnerTransaction) =>
    tx.affects_partner_cash === 0 && (tx.affects_profit === 1 || tx.source_role === 'profit_recognition'), []);

  const visibleSortedTransactions = useMemo(
    () =>
      sortedTransactions.filter(
        (tx) =>
          isOriginalCustomerInstallmentRow(tx) ||
          (
            !(isInstallmentWithdrawal(tx) && compareMoney(tx.amount, 0) <= 0) &&
            !(form.kind === "زبون" && isLinkedInstallmentPayment(tx)) &&
            !tx.type_.startsWith("تحويل") &&
            !isProfitRecognition(tx)
          )
      ),
    [sortedTransactions, isOriginalCustomerInstallmentRow, isProfitRecognition],
  );

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(visibleSortedTransactions.length / PAGE_SIZE) - 1);
    setModalPage(lastPage);
  }, [visibleSortedTransactions.length]);

  const totalModalPages = Math.max(1, Math.ceil(visibleSortedTransactions.length / PAGE_SIZE));
  const currentModalPage = Math.min(modalPage, totalModalPages - 1);

  const pageTransactions = useMemo(() => {
    return visibleSortedTransactions.slice(currentModalPage * PAGE_SIZE, (currentModalPage + 1) * PAGE_SIZE);
  }, [visibleSortedTransactions, currentModalPage]);

  const sequenceByTransactionId = useMemo(() => {
    return new Map(visibleSortedTransactions.map((tx, index) => [tx.id, index + 1]));
  }, [visibleSortedTransactions]);

  // A real cash movement: either has affects_partner_cash = 1 explicitly,
  // OR it's an old row without the flag BUT it is NOT a profit recognition row.
  // Profit recognition rows are identified by: affects_partner_cash = 0 AND affects_profit = 1 OR source_role = 'profit_recognition'.
  const isCashMovement = useCallback((tx: PartnerTransaction) => {
    // If explicitly marked as NOT a partner cash movement → exclude
    if (tx.affects_partner_cash === 0) return false;
    // If explicitly marked as a cash movement → include
    if (tx.affects_partner_cash === 1) return true;
    // Legacy row (undefined): exclude if it looks like profit recognition
    if (tx.source_role === 'profit_recognition' || tx.affects_profit === 1) return false;
    return true;
  }, []);


  const cashTransactions = useMemo(
    () => transactions.filter(isCashMovement),
    [transactions, isCashMovement],
  );

  const paidTransactionIds = useMemo(() => {
    if (form.kind !== "زبون") return new Set<number>();
    // Payments that actually settle installments (exclude down payments)
    const payments = transactions.filter(isBorrowerInstallmentPayment);
    const installments = transactions
      .filter(isInstallmentWithdrawal)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id);

    const paidIds = new Set<number>();
    // Audit fix #18: unlinked payments are pooled PER CURRENCY — IQD payments must
    // never mark USD installments as paid (and vice versa).
    const remainingByCurrency = new Map<string, ReturnType<typeof toMoney>>();
    for (const payment of payments) {
      const linkedId = getLinkedInstallmentId(payment);
      if (linkedId) {
        paidIds.add(linkedId);
      } else {
        const curr = payment.currency || "IQD";
        remainingByCurrency.set(curr, moneyAdd(remainingByCurrency.get(curr) ?? toMoney(0), payment.amount));
      }
    }

    const stoppedCurrencies = new Set<string>();
    for (const inst of installments) {
      // F14: fast path — if the row already carries a paid_event_id or actual_paid_amount, treat it as paid without consulting the heuristic.
      if (inst.paid_event_id != null || inst.actual_paid_amount != null) {
        paidIds.add(inst.id);
        continue;
      }
      if (paidIds.has(inst.id)) continue;
      const curr = inst.currency || "IQD";
      if (stoppedCurrencies.has(curr)) continue;
      const remaining = remainingByCurrency.get(curr) ?? toMoney(0);
      if (compareMoney(remaining, inst.amount) >= 0) {
        paidIds.add(inst.id);
        remainingByCurrency.set(curr, moneySub(remaining, inst.amount));
      } else {
        stoppedCurrencies.add(curr);
      }
    }

    for (const tx of transactions) {
      if (tx.type_.startsWith("واصل") && (tx.type_.includes("قسط") || tx.notes?.includes("قسط"))) {
        paidIds.add(tx.id);
      }
    }

    return paidIds;
  }, [transactions, form.kind]);

  const editingTransaction = useMemo(() => {
    return editingTransactionId
      ? transactions.find((tx) => tx.id === editingTransactionId) ?? null
      : null;
  }, [editingTransactionId, transactions]);

  const isEditingSaleDownPayment = !!editingTransaction && isSaleDownPaymentRecord(editingTransaction);

  useEffect(() => {
    if (!shouldScrollTransactionsRef.current || transactionsLoading || transactions.length === 0) {
      return;
    }

    shouldScrollTransactionsRef.current = false;
    window.requestAnimationFrame(() => {
      transactionListRef.current?.scrollTo({
        top: transactionListRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [transactions, transactionsLoading]);



  /* ── متابعة حالة البحث المنبثق ── */
  useEffect(() => {
    if (kind !== "partners-financial" || !pendingPartnerOpen) return;
    let cancelled = false;
    // F20: require kind to match — don't fall back to a name-only lookup that could match an unrelated account.
    const partner = partners.find(
      (p) =>
        p.partner_name === pendingPartnerOpen.name &&
        (!pendingPartnerOpen.kind || p.kind === pendingPartnerOpen.kind),
    );
    if (partner) {
      openPersonalAccount(
        partner,
        pendingPartnerOpen.action,
        pendingPartnerOpen.transactionId ?? undefined,
      ).then(() => {
        if (!cancelled) onPendingPartnerOpened?.();
      });
    }
    return () => { cancelled = true; };
  }, [kind, pendingPartnerOpen, partners, onPendingPartnerOpened]);

  /* ── متابعة حالة البحث المنبثق ── */
  useEffect(() => {
    if (kind !== "partners-financial") return;
    if (partnersSearchOpen) {
      const t = setTimeout(() => partnersSearchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setPartnersSearch("");
    }
  }, [partnersSearchOpen, kind]);

  /* ── تصفية الشركاء للبحث ── */
  const filteredPartnersForSearch = useMemo(() => {
    if (kind !== "partners-financial") return [];
    const q = partnersSearch.trim().toLowerCase();
    if (!q) return [];
    return partners.filter((p) => {
      if (p.kind !== "شريك" && !isAccountListKind(p.kind)) return false;
      return (
        p.partner_name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
      );
    });
  }, [partners, partnersSearch, kind]);

  const openPersonalAccount = useCallback(async (
    partner: Partner,
    action?: "deposit" | "withdraw" | "settle_installment",
    transactionId?: number,
  ) => {
    const currentTab = accountsTabRef.current;
    if (currentTab !== "personal") {
      setOriginAccountsTab(currentTab);
    }
    setPartnerToView(partner);
    setAccountsTab("personal");
    setSharikListView(false);
    setPartnersSearch("");
    const loadedTransactions = await loadPartner(partner);
    const firstName = firstAccountName(partner.partner_name);
    if (partner.kind === "مستثمر") {
      onPartnerActionsChange?.({
        onDeposit: openWithdrawForm,
        onWithdraw: openDepositForm,
        depositLabel: `تسليم الى ${firstName}`,
        withdrawLabel: `استلام من ${firstName}`,
      });
    } else if (partner.kind === "ممول") {
      onPartnerActionsChange?.({
        onDeposit: openWithdrawForm,
        onWithdraw: openDepositForm,
        depositLabel: `تسليم الى ${firstName}`,
        withdrawLabel: `استلام من ${firstName}`,
      });
    } else if (partner.kind === "شركة") {
      onPartnerActionsChange?.({
        onDeposit: openWithdrawForm,
        onWithdraw: openDepositForm,
        depositLabel: `تسليم الى ${firstName}`,
        withdrawLabel: `استلام من ${firstName}`,
      });
    } else if (isBorrowerKind(partner.kind)) {
      onPartnerActionsChange?.(null);
    } else {
      onPartnerActionsChange?.({
        onDeposit: openDepositForm,
        onWithdraw: openWithdrawForm,
      });
    }
    if (action === "settle_installment") {
      const installmentTx = loadedTransactions.find((tx) => tx.id === transactionId);
      if (installmentTx) {
        beginSettleInstallment(installmentTx);
      } else {
        resetTransactionForm("ايداع");
        setShowTxModal(true);
      }
    } else if (action === "withdraw") {
      setCompanyPaymentMode("");
      resetTransactionForm("سحب");
      setShowTxModal(true);
    } else if (action === "deposit") {
      resetTransactionForm("ايداع");
      setShowTxModal(true);
    }
  }, [onPartnerActionsChange]);

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showExitConfirm) {
          setShowExitConfirm(false);
          pendingPartnerCloseRef.current = null;
          return;
        }
        if (partnersSearchOpen) {
          onPartnersSearchClose?.();
          return;
        }
        if (showDeleteModal) {
          setShowDeleteModal(false);
          setPartnerToDelete(null);
          return;
        }
        if (deleteTxConfirm) {
          setDeleteTxConfirm(null);
          return;
        }
        if (deleteDialogOpen) {
          setDeleteDialogOpen(false);
          return;
        }
        if (showTxModal) {
          setShowTxModal(false);
          return;
        }
        if (partnerToView && !sharikListView) {
          if (partnerToView.kind === "شريك") {
            setSharikListView(true);
            setPartnerToView(null);
            setEditingKey(null);
            setModalMode(null);
            setTransactions([]);
            onPartnerActionsChange?.(null);
            return;
          }
          // non-شريك: show exit confirm if changed
          void handleClose();
          return;
        }
        if (editingKey) {
          void handleClose();
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [partnersSearchOpen, onPartnersSearchClose, showDeleteModal, deleteTxConfirm, deleteDialogOpen, showTxModal, editingKey, partnerToView, sharikListView, kind, showExitConfirm]);

  const partnerDirty = modalMode === "view" && (
    form.name !== originalPartnerData?.name ||
    form.phone !== originalPartnerData?.phone ||
    form.kind !== originalPartnerData?.kind ||
    transactionsDirtyRef.current
  );

  useEffect(() => {
    onDirtyChange?.(partnerDirty);
  }, [partnerDirty, onDirtyChange]);

  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = {
      request: (afterClose?: () => void) => {
        if (partnerDirty) {
          pendingPartnerCloseRef.current = afterClose ?? null;
          setShowExitConfirm(true);
        } else {
          if (modalMode === "view") {
            resetForm();
          }
          afterClose?.();
        }
      },
    };
    return () => { requestCloseRef.current = null; };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      // تمييز الحقل الفارغ بإطار أحمر ونقل التركيز إليه
      markAccountFieldError("name");
      return;
    }

    setSaving(true);
    try {
      const nextName = form.name.trim();
      const phoneClean = toEnglishDigits(form.phone.trim());
      if (!editingKey && requiresPhoneForCustomerAccount(form.kind) && !phoneClean) {
        alert("الرجاء كتابة رقم الهاتف قبل إضافة الحساب");
        markAccountFieldError("phone");
        return;
      }
      const dbPartners = await callTauri<Partner[]>("get_partners").catch(() => []) || [];
      const normalizedNext = normalizeArabic(nextName);

      if (editingKey) {
        if (normalizeArabic(nextName) !== normalizeArabic(editingKey)) {
          const alreadyExists = dbPartners.some(
            (p) => normalizeArabic(p.partner_name) === normalizedNext
          );
          if (alreadyExists) {
            alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
            return;
          }
        }
        await callTauri("update_partner", {
          oldName: editingKey,
          oldKind: originalPartnerData?.kind || form.kind,
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: form.kind });
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: form.kind }, true);
        await onRefresh();
        if (usesUnifiedAccounts) {
          void fetchUnifiedAccounts();
        }
      } else {
        const alreadyExists = dbPartners.some(
          (p) => normalizeArabic(p.partner_name) === normalizedNext
        );
        if (alreadyExists) {
          alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
          return;
        }
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        const newPartner: Partner = {
          partner_name: nextName,
          phone: phoneClean,
          kind: form.kind,
          total_amount: 0,
          iqd_balance: 0,
          usd_balance: 0,
          total_withdrawals: 0
        };
        await onRefresh();
        if (usesUnifiedAccounts) {
          void fetchUnifiedAccounts();
        }
        await openPersonalAccount(newPartner);
      }
    } catch (err) {
      console.error(err);
      const errMsg = String(err);
      if (errMsg.includes("UNIQUE") || errMsg.includes("unique") || errMsg.includes("constraint") || errMsg.includes("Constraint")) {
        alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
      } else {
        alert(`تعذر حفظ بيانات ${form.kind}.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const currentForm = formRef.current;
    const nextName = currentForm.name.trim();
    const phoneClean = toEnglishDigits(currentForm.phone.trim());
    if (!nextName) {
      if (originalPartnerData) {
        patchForm({ name: originalPartnerData.name });
      }
      savingRef.current = false;
      return;
    }
    if (!currentForm.kind && !editingKey) {
      savingRef.current = false;
      return;
    }
    if (!editingKey && requiresPhoneForCustomerAccount(currentForm.kind) && !phoneClean) {
      alert("الرجاء كتابة رقم الهاتف قبل إضافة الحساب");
      markAccountFieldError("phone");
      savingRef.current = false;
      return;
    }
    const dbPartners = await callTauri<Partner[]>("get_partners").catch(() => []) || [];
    const normalizedNext = normalizeArabic(nextName);

    if (!editingKey) {
      const alreadyExistsName = dbPartners.some(
        (p) => normalizeArabic(p.partner_name) === normalizedNext
      );
      if (alreadyExistsName) {
        alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
        savingRef.current = false;
        return;
      }

      setSaving(true);
      try {
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: currentForm.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        setShowNewAccount(false);
        if (kind === "partners-financial") {
          setPartnerToView({ partner_name: nextName, phone: phoneClean, kind: currentForm.kind, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0 });
        }
        await onRefresh();
        if (usesUnifiedAccounts) {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error("Auto save failed:", err);
        const errMsg = String(err);
        if (errMsg.includes("UNIQUE") || errMsg.includes("unique") || errMsg.includes("constraint") || errMsg.includes("Constraint")) {
          alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
        }
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
      return;
    }
    if (originalPartnerData && (nextName !== originalPartnerData.name || phoneClean !== originalPartnerData.phone || currentForm.kind !== originalPartnerData.kind)) {
      if (normalizeArabic(nextName) !== normalizeArabic(originalPartnerData.name)) {
        const alreadyExists = dbPartners.some(
          (p) => normalizeArabic(p.partner_name) === normalizedNext
        );
        if (alreadyExists) {
          alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
          savingRef.current = false;
          return;
        }
      }
      setSaving(true);
      try {
        await callTauri("update_partner", {
          oldName: editingKey,
          oldKind: originalPartnerData.kind,
          name: nextName,
          phone: phoneClean,
          kind: currentForm.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: currentForm.kind }, true);
        await onRefresh();
        if (usesUnifiedAccounts) {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error(err);
        const errMsg = String(err);
        if (errMsg.includes("UNIQUE") || errMsg.includes("unique") || errMsg.includes("constraint") || errMsg.includes("Constraint")) {
          alert("اسم الحساب موجود مسبقا الرجاء اختيار اسم آخر");
        } else {
          alert(`تعذر تحديث البيانات تلقائياً.`);
        }
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
    } else {
      savingRef.current = false;
    }
  };

  const executeDelete = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      await callTauri("delete_partner", { name: editingKey, kind: form.kind });
      resetForm();
      await onRefresh();
      if (usesUnifiedAccounts) { void fetchUnifiedAccounts(); }
    } catch (err) {
      console.error(err);
      setErrorDialog({
        title: `تعذر حذف ${form.kind}`,
        message: getErrorMessage(err, `تعذر حذف ${form.kind}.`),
      });
    } finally {
      setSaving(false);
    }
  };

  const executeInlineDelete = async (partnerName: string, partnerKind: string) => {
    setSaving(true);
    try {
      await callTauri("delete_partner", { name: partnerName, kind: partnerKind });
      if (editingKey === partnerName) resetForm();
      await onRefresh();
      if (usesUnifiedAccounts) { void fetchUnifiedAccounts(); }
    } catch (err) {
      console.error(err);
      setErrorDialog({
        title: `تعذر حذف ${partnerKind}`,
        message: getErrorMessage(err, `تعذر حذف ${partnerKind}.`),
      });
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteTransaction = async () => {
    const tx = deleteTxConfirm;
    if (!tx) return;
    setDeleteTxConfirm(null);
    try {
      await callTauri("delete_partner_transaction", { id: tx.id, partnerName: tx.partner_name, kind: tx.kind, sessionToken });
      transactionsDirtyRef.current = true;
      if (usesUnifiedAccounts) { void fetchUnifiedAccounts(); }
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", { partnerName: tx.partner_name, kind: tx.kind });
      setTransactions(txs ?? []);
      if (editingTransactionId === tx.id) {
        setEditingTransactionId(null);
        setTxForm({ type: "ايداع" as TransactionType, amount: 0, date: todayIsoDate(), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 0 });
      }
      await onRefresh();
    } catch (err) {
      console.error("فشل حذف المعاملة:", err);
      alert("خطأ: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = txForm.date?.trim() || "";
    const originalEditingTransaction = editingTransactionId
      ? transactions.find((tx) => tx.id === editingTransactionId) ?? null
      : null;
    const isBorrowerInstallmentEdit =
      form.kind === "زبون" &&
      !!editingTransactionId &&
      !!originalEditingTransaction &&
      isCustomerInstallmentRecord(originalEditingTransaction);
    const isSaleDownPaymentEdit =
      form.kind === "زبون" &&
      !!editingTransactionId &&
      !!originalEditingTransaction &&
      isSaleDownPaymentRecord(originalEditingTransaction);
    const isAgencyReceivableEdit =
      form.kind === "وكالة" &&
      !!editingTransactionId &&
      !!originalEditingTransaction &&
      isAgencyReceivableRecord(originalEditingTransaction);
    const originalInstallmentAmount = originalEditingTransaction
      ? moneyValueToNumber(originalEditingTransaction.amount)
      : 0;
    const formAmount = moneyValueToNumber(txForm.amount);
    const effectiveAmount = isBorrowerInstallmentEdit && formAmount <= 0
      ? originalInstallmentAmount
      : formAmount;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || effectiveAmount <= 0) {
      // تمييز الحقل الفارغ
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const dateInput = document.querySelector('.tx-dialog-form input[type="text"]') as HTMLElement;
        if (dateInput) { dateInput.classList.add("input--error"); dateInput.focus(); }
      } else {
        const amountInput = document.querySelector('.tx-dialog-form input[inputmode]') as HTMLElement;
        if (amountInput) { amountInput.classList.add("input--error"); amountInput.focus(); }
      }
      return;
    }
    if (!editingKey) return;

    setSaving(true);
    try {
      // للشركة: إذا كان التسديد عبر ممول
      if (form.kind === "شركة" && txForm.type === "سحب" && companyPaymentMode === "funder") {
        if (!settleFunderName) { alert("الرجاء اختيار الممول"); setSaving(false); return; }

        await callTauri("settle_company_through_funder", {
          companyName: editingKey,
          funderName: settleFunderName,
          amount: txForm.amount,
          date: txForm.date,
          currency: txCurrency,
          sessionToken,
        });
        resetTransactionForm(txForm.type);
        setCompanyPaymentMode("");
        shouldScrollTransactionsRef.current = !editingTransactionId;
        await loadPartner({ partner_name: editingKey, phone: form.phone, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: form.kind }, true);
        await onRefresh();
        if (usesUnifiedAccounts) {
          const accounts = await fetchUnifiedAccounts();
          routeSettledAccountToCustomers(accounts, editingKey, form.kind);
        }
        setShowTxModal(false);
        setSaving(false);
        return;
      }

      const installments = txForm.type === "سحب" && !editingTransactionId
        ? Math.max(1, Math.floor(Number(txForm.installments)) || 1)
        : 1;
      const periodAmount = Number.isFinite(effectiveAmount) ? effectiveAmount : 0;
      // Use Decimal division for money; round installments down with ROUND_FLOOR.
      const installmentAmount = moneyDiv(periodAmount, installments).toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber();
      const remainder = moneySub(periodAmount, moneyMul(installmentAmount, installments)).toNumber();

      if (isSaleDownPaymentEdit && originalEditingTransaction) {
        await callTauri("update_customer_sale_down_payment", {
          transactionId: originalEditingTransaction.id,
          customerName: editingKey,
          amount: periodAmount,
          date: dateStr,
          notes: txForm.notes || originalEditingTransaction.notes,
          currency: txCurrency,
          paymentType: originalEditingTransaction.payment_type || originalEditingTransaction.paymentType || "قاصه",
        });
      } else if (isBorrowerInstallmentEdit && originalEditingTransaction) {
        const isWantsPaid = txForm.type === "ايداع";

        // Use the new atomic command for all installment toggle operations
        await callTauri("set_customer_installment_status", {
          installmentId: originalEditingTransaction.id,
          partnerName: editingKey,
          kind: form.kind,
          paid: isWantsPaid,
          amount: periodAmount,
          date: dateStr,
          notes: txForm.notes || originalEditingTransaction.notes,
          currency: txCurrency,
          paymentType: originalEditingTransaction.payment_type || originalEditingTransaction.paymentType || "قاصه",
        });
      } else if (isAgencyReceivableEdit && originalEditingTransaction) {
        await callTauri("set_agency_receivable_status", {
          transactionId: originalEditingTransaction.id,
          paid: txForm.type === "ايداع",
        });
      } else {
        // Track created transaction IDs so we can roll back on partial failure (atomic multi-installment creation).
        const createdIds: number[] = [];
        try {
          for (let i = 0; i < installments; i++) {
            const [yStr, mStr, dStr] = dateStr.split("-");
            const year = parseInt(yStr, 10);
            const month = parseInt(mStr, 10) - 1;
            const day = parseInt(dStr, 10);
            // F5: clamp day to the last valid day of the target month to avoid off-by-one rollover (e.g. day 31 in a 30-day month).
            const maxDay = new Date(year, month + i + 1, 0).getDate();
            const safeDay = Math.min(day, maxDay);
            const date = new Date(year, month + i, safeDay);
            const dateStr_i = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            const amount = i === installments - 1 ? installmentAmount + remainder : installmentAmount;
            const monthNote = (() => {
              if (form.kind === "ممول" && txForm.type === "سحب") {
                const commissionVal = txForm.commission || 0;
                const totalWithCommission = moneyValueToNumber(amount) + moneyValueToNumber(commissionVal);
                const formattedTotal = txCurrency === "USD"
                  ? `$${formatEnglishNumber(totalWithCommission)}`
                  : `${formatEnglishNumber(totalWithCommission)} د.ع`;
                return `تم تسليم الممول ${form.name} بـ ${formattedTotal} ارسل اليه بواسطة ${txForm.transferBy || "—"}${txForm.notes ? ` - ${txForm.notes}` : ""} - عمولة: ${commissionVal}`;
              }
              return installments > 1
                ? `قسط ${i + 1}/${installments}${txForm.notes ? ` - ${txForm.notes}` : ""}`
                : (txForm.notes || null);
            })();

            const isCompanyCashWithdrawal = form.kind === "شركة" && txForm.type === "سحب";
            // Audit fix #15: the cash flag is carried by the TYPE field ("سحب نقدي"),
            // which is the classifier used across the whole system. The notes marker
            // is kept only for readability / backward compatibility.
            const cashWdrNote = isCompanyCashWithdrawal
              ? (monthNote ? `سحب نقدي - ${monthNote}` : "سحب نقدي")
              : monthNote;
            const transactionPayload = {
              partnerName: editingKey,
              kind: form.kind,
              type: form.kind === "شريك" && txForm.type === "سحب"
                ? "سحب شريك"
                : isCompanyCashWithdrawal
                  ? "سحب نقدي"
                  : (form.kind === "زبون" && txForm.type === "ايداع") ? "تسديد قسط سيارة" : txForm.type,
              amount,
              date: dateStr_i,
              notes: cashWdrNote,
              currency: txCurrency,
              paymentType: (form.kind === "ممول" && txForm.type === "ايداع") ? "ممول" : txForm.paymentType,
            };

            if (editingTransactionId) {
              await callTauri("update_partner_transaction", {
                id: editingTransactionId,
                ...transactionPayload,
                sessionToken,
              });
            } else {
              const newId = await callTauri<number>("add_partner_transaction", { ...transactionPayload, sessionToken });
              if (typeof newId === "number" && Number.isFinite(newId)) {
                createdIds.push(newId);
              }
            }
          }
        } catch (rollbackErr) {
          // Best-effort rollback of any transactions created in this loop before the failure.
          for (const createdId of createdIds) {
            try {
              await callTauri("delete_partner_transaction", { id: createdId, partnerName: editingKey, kind: form.kind, sessionToken });
            } catch (cleanupErr) {
              console.error("Failed to roll back installment transaction", createdId, cleanupErr);
            }
          }
          throw rollbackErr;
        }

      }

      transactionsDirtyRef.current = true;
      resetTransactionForm(txForm.type);
      shouldScrollTransactionsRef.current = !editingTransactionId;
      await loadPartner({ partner_name: editingKey, phone: form.phone, total_amount: 0, iqd_balance: 0, usd_balance: 0, total_withdrawals: 0, kind: form.kind }, true);
      await onRefresh();
      if (usesUnifiedAccounts) {
        const accounts = await fetchUnifiedAccounts();
        routeSettledAccountToCustomers(accounts, editingKey, form.kind);
      }
      setShowTxModal(false);
    } catch (err) {
      console.error(err);
      alert(getErrorMessage(err, "تعذر حفظ العملية. حاول مرة أخرى."));
    } finally {
      setSaving(false);
    }
  };

  const totalDeposits = moneySum(
    cashTransactions.filter((t) => !t.type_.startsWith("تحويل") && (t.type_.startsWith("ايداع") || t.type_.startsWith("إيداع") || t.type_.startsWith("مقدمة") || t.type_.startsWith("استلام") || t.type_.startsWith("إستلام") || t.type_.startsWith("تسديد") || t.type_.startsWith("إعادة استثمار") || t.type_.startsWith("تسوية") || t.type_.startsWith("دفعة"))),
    (t) => t.amount
  );
  const totalWithdrawals = moneySum(
    cashTransactions.filter((t) => !t.type_.startsWith("تحويل") && (t.type_.startsWith("سحب") || t.type_.startsWith("باقي"))),
    (t) => t.amount
  );

  const depositPrefixes = (t: { type_: string }) =>
    t.type_.startsWith("ايداع") || t.type_.startsWith("إيداع") || t.type_.startsWith("مقدمة")
    || t.type_.startsWith("استلام") || t.type_.startsWith("إستلام") || t.type_.startsWith("تسديد")
    || t.type_.startsWith("إعادة استثمار") || t.type_.startsWith("تسوية") || t.type_.startsWith("دفعة");

  const partnerIqdBalance = accountsTab === "personal" && partnerToView
    ? isFinancialClientKind(form.kind)
      ? moneySub(
        moneySum(transactions.filter((t) => (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && (t.currency || "IQD") === "IQD" && !t.type_.startsWith("تحويل")), (t) => t.amount),
        moneySum(transactions.filter((t) => depositPrefixes(t) && (t.currency || "IQD") === "IQD" && !t.type_.startsWith("تحويل")), (t) => t.amount)
      )
      : isBorrowerKind(form.kind)
        ? moneySum(transactions.filter((t) => isCustomerRemainingBalanceTx(t) && (t.currency || "IQD") === "IQD"), (t) => t.amount)
        : moneySub(
          moneySum(cashTransactions.filter((t) => depositPrefixes(t) && (t.currency || "IQD") === "IQD" && !t.type_.startsWith("تحويل")), (t) => t.amount),
          moneySum(cashTransactions.filter((t) => (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && (t.currency || "IQD") === "IQD" && !t.type_.startsWith("تحويل")), (t) => t.amount)
        )
    : currencyTotals[0];

  const partnerUsdBalance = accountsTab === "personal" && partnerToView
    ? isFinancialClientKind(form.kind)
      ? moneySub(
        moneySum(transactions.filter((t) => (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && t.currency === "USD" && !t.type_.startsWith("تحويل")), (t) => t.amount),
        moneySum(transactions.filter((t) => depositPrefixes(t) && t.currency === "USD" && !t.type_.startsWith("تحويل")), (t) => t.amount)
      )
      : isBorrowerKind(form.kind)
        ? moneySum(transactions.filter((t) => isCustomerRemainingBalanceTx(t) && t.currency === "USD"), (t) => t.amount)
        : moneySub(
          moneySum(cashTransactions.filter((t) => depositPrefixes(t) && t.currency === "USD" && !t.type_.startsWith("تحويل")), (t) => t.amount),
          moneySum(cashTransactions.filter((t) => (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && t.currency === "USD" && !t.type_.startsWith("تحويل")), (t) => t.amount)
        )
    : currencyTotals[1];



  const getMultiCurrencyBalanceStatus = (iqd: number, usd: number) => {
    const hasPositive = iqd > 0 || usd > 0;
    const hasNegative = iqd < 0 || usd < 0;
    if (hasPositive && !hasNegative) return { label: "نطلبه", className: "text-green" };
    if (hasNegative && !hasPositive) return { label: "مطلوبين", className: "text-red" };
    if (hasPositive && hasNegative) return { label: "مختلط", className: "text-yellow" };
    return { label: "متوازن", className: "text-muted" };
  };
  const getDetailBalanceCardClass = (amount: MoneyValue) => {
    if (compareMoney(amount, 0) > 0) return "currency-card--balance-positive";
    if (compareMoney(amount, 0) < 0) return "currency-card--balance-negative";
    return "currency-card--balance-zero";
  };
  const getPartnerCurrencyBalance = (currency: "IQD" | "USD") => {
    if (!partnerToView) return currency === "IQD" ? currencyTotals[0] : currencyTotals[1];
    if (isBorrowerKind(form.kind)) {
      return moneySum(
        transactions.filter((t) => (t.currency || "IQD") === currency && isCustomerRemainingBalanceTx(t)),
        (t) => t.amount
      );
    }
    if (isFinancialClientKind(form.kind)) {
      return transactions
        .filter((t) => (t.currency || "IQD") === currency && !t.type_.startsWith("تحويل"))
        .reduce<Decimal>((sum, t) => {
          if (depositPrefixes(t)) return moneySub(sum, t.amount);
          if (t.type_.startsWith("سحب") || t.type_.startsWith("باقي") || t.type_.startsWith("تسليم")) return moneyAdd(sum, t.amount);
          return sum;
        }, toMoney(0));
    }
    return currency === "IQD" ? partnerIqdBalance : partnerUsdBalance;
  };
  const viewedUnifiedAccount = useMemo(() => {
    if (kind !== "partners-financial" || accountsTab !== "personal" || !partnerToView) return null;
    return unifiedAccounts.find(
      (acc) => acc.partner_name === partnerToView.partner_name && acc.kind === partnerToView.kind,
    ) ?? null;
  }, [accountsTab, kind, partnerToView, unifiedAccounts]);

  const displayPartnerIqdBalance = accountsTab === "personal" && partnerToView
    ? viewedUnifiedAccount?.iqd_balance ?? getPartnerCurrencyBalance("IQD")
    : kind === "partners-financial" && accountsTab === "receivables"
      ? stats.iqdTheyOwe
      : kind === "partners-financial" && accountsTab === "liabilities"
        ? stats.iqdWeOwe
        : kind === "partners-financial" && accountsTab === "customers"
          ? 0
          : currencyTotals[0];
  const displayPartnerUsdBalance = accountsTab === "personal" && partnerToView
    ? viewedUnifiedAccount?.usd_balance ?? getPartnerCurrencyBalance("USD")
    : kind === "partners-financial" && accountsTab === "receivables"
      ? stats.usdTheyOwe
      : kind === "partners-financial" && accountsTab === "liabilities"
        ? stats.usdWeOwe
        : kind === "partners-financial" && accountsTab === "customers"
          ? 0
          : currencyTotals[1];
  const accountsListCardClass = accountsTab === "receivables"
    ? "currency-card--balance-positive"
    : accountsTab === "liabilities"
      ? "currency-card--balance-negative"
      : "";

  const runPrint = async (mode: "all" | "range") => {
    if (!partnerToView) return;
    setPrintMenuOpen(false);
    try {
      await printStatement({
        partner: partnerToView,
        transactions,
        printMode: mode,
        printFromDate,
        printToDate,
        muntasirPhone,
        amirPhone,
        paidTransactionIds,
      });
    } catch (err) {
      console.error("Failed to generate partner statement PDF:", err);
      setErrorDialog({
        title: "تعذر إنشاء كشف الحساب",
        message: getErrorMessage(err, "تعذر إنشاء ملف PDF. حاول مرة أخرى."),
      });
    }
  };

  return (
    <div className="customers-page">


      <div className="cars-page__toolbar unified-toolbar">
        {kind === "partners-financial" ? (
          <>
            <div className="unified-toolbar__right">
              {partnerToView && !sharikListView ? (
                <div className="flex items-end gap-5 pb-0.5">
                  <GoldFxButton
                    type="button"
                    isBack
                    onClick={() => {
                      if (partnerToView.kind === "شريك") {
                        setSharikListView(true);
                        setPartnerToView(null);
                        setEditingKey(null);
                        setModalMode(null);
                        setTransactions([]);
                        onPartnerActionsChange?.(null);
                      } else {
                        const changed =
                          form.name !== originalPartnerData?.name ||
                          form.phone !== originalPartnerData?.phone ||
                          form.kind !== originalPartnerData?.kind ||
                          transactionsDirtyRef.current;
                        if (changed) {
                          setShowExitConfirm(true);
                        } else {
                          resetForm();
                        }
                      }
                    }}
                  >
                    <span className="gold-fx-btn__icon">↩</span>
                  </GoldFxButton>
                  {partnerToView?.kind !== "شريك" && (
                    <GoldFxButton
                      type="button"
                      variant="green"
                      style={{ margin: 0, whiteSpace: "nowrap", height: "42px" }}
                      disabled={saving}
                      onClick={() => void handleAutoSave()}
                    >
                      <span className="gold-fx-btn__label">حفظ</span>
                    </GoldFxButton>
                  )}

                  <GoldFxButton
                    type="button"
                    variant="gold"
                    style={{ margin: 0, whiteSpace: "nowrap", height: "42px" }}
                    onClick={() => {
                      setPrintFromDate("");
                      setPrintToDate("");
                      setPrintMenuOpen(true);
                    }}
                  >
                    <span className="gold-fx-btn__label">طباعة</span>
                  </GoldFxButton>

                  {partnerToView?.kind === "زبون" && customerDeferredSaleCar && onNavigateToCar && (
                    <GoldFxButton
                      type="button"
                      variant="gray"
                      title="تفاصيل بيع السيارة"
                      aria-label="تفاصيل بيع السيارة"
                      style={{ margin: 0, width: "42px", minWidth: "42px", height: "42px", padding: 0 }}
                      onClick={() => onNavigateToCar(
                        customerDeferredSaleCar.car_number,
                        customerDeferredSaleCar.status === "متوفرة" ? "available" : "sold",
                        1,
                      )}
                    >
                      <span className="gold-fx-btn__label" aria-hidden>🚗</span>
                    </GoldFxButton>
                  )}

                  <div className="toolbar-field-group">
                    <input
                      value={form.name}
                      onChange={(e) => patchName(e.target.value)}
                      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                      placeholder="اسم صاحب الحساب"
                      className="toolbar-field-input w-[250px] min-w-[250px]"
                      disabled={partnerToView?.kind === "شريك"}
                    />
                  </div>
                  <div className="toolbar-field-group">
                    <input
                      value={form.phone || ""}
                      inputMode="tel"
                      onInput={(e) => patchPhone((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchPhone(e.target.value)}
                      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                      placeholder="رقم الهاتف"
                      className="toolbar-field-input w-[180px] min-w-[180px]"
                      dir="ltr"
                      disabled={partnerToView?.kind === "شريك"}
                    />
                  </div>
                  <div className="toolbar-field-group min-w-[160px]">
                    {partnerToView?.kind === "شريك" ? (
                      <span className="badge badge--kind-شريك" style={{ height: "42px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 16px", borderRadius: "var(--all-radius)", fontWeight: "bold" }}>
                        شريك
                      </span>
                    ) : (
                      <SearchableCombobox
                        value={form.kind}
                        onChange={(val) => {
                          patchForm({ kind: val });
                        }}
                        placeholder="نوع الحساب"
                        options={[
                          ...(form.kind === "شريك" ? [{ label: "شريك", value: "شريك", kind: "شريك" }] : []),

                          { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                          { label: "ممول", value: "ممول", kind: "ممول" },
                          { label: "زبون", value: "زبون", kind: "زبون" },
                          { label: "وكالة", value: "وكالة", kind: "وكالة" },
                          { label: "شركة", value: "شركة", kind: "شركة" },
                        ]}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {returnState && onReturn && (
                    <GoldFxButton
                      type="button"
                      isBack
                      onClick={onReturn}
                    >
                      <span className="gold-fx-btn__icon">↩</span>
                    </GoldFxButton>
                  )}
                  {ACCOUNTS_TABS.map((tab) => {
                    const isActive = accountsTab === tab.id;
                    const isPersonalActive = tab.id === "personal" && accountsTab === "personal";
                    const primaryTab = tab.id === "customers";

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`${primaryTab ? "top-btn-one" : "top-btn-two"} ${isActive || isPersonalActive ? (primaryTab ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                        onClick={() => {
                          if (tab.id !== "personal") {
                            if (partnerToView && !sharikListView) {
                              if (partnerToView.kind === "شريك") {
                                setSharikListView(true);
                                setPartnerToView(null);
                                setEditingKey(null);
                                setModalMode(null);
                                setTransactions([]);
                                onPartnerActionsChange?.(null);
                              } else {
                                void handleClose();
                              }
                              return;
                            }
                            resetForm(tab.id);
                          } else {
                            setAccountsTab("personal");
                            setSharikListView(true);
                            setPartnerToView(null);
                            setEditingKey(null);
                            setTransactions([]);
                            onPartnerActionsChange?.(null);
                          }
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <div className="unified-toolbar__center">
            </div>
            <div className="unified-toolbar__left">
              <div className={`currency-card currency-card--usd ${accountsTab !== "personal" ? accountsListCardClass : getDetailBalanceCardClass(displayPartnerUsdBalance)}`}>
                <PriceDisplay amount={moneyAbs(displayPartnerUsdBalance)} currency="USD" noColor />
              </div>
              <div className={`currency-card currency-card--iqd ${accountsTab !== "personal" ? accountsListCardClass : getDetailBalanceCardClass(displayPartnerIqdBalance)}`}>
                <PriceDisplay amount={moneyAbs(displayPartnerIqdBalance)} noColor />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="unified-toolbar__right">
              <ActionButton type="button" variant="primary" className="btn-new-car" onClick={startNew}>
                + إضافة {kind}
              </ActionButton>
            </div>
            <div className="unified-toolbar__center"></div>
            <div className="unified-toolbar__left">
              <div className={`currency-card currency-card--usd ${(isBorrowerKind(kind) || isFinancialClientKind(kind)) ? getDetailBalanceCardClass(currencyTotals[1]) : currencyTotals[1] >= 0 ? "currency-card--balance-positive" : "currency-card--balance-negative"}`}>
                <PriceDisplay amount={Math.abs(currencyTotals[1])} currency="USD" noColor />
              </div>
              <div className={`currency-card currency-card--iqd ${(isBorrowerKind(kind) || isFinancialClientKind(kind)) ? getDetailBalanceCardClass(currencyTotals[0]) : currencyTotals[0] >= 0 ? "currency-card--balance-positive" : "currency-card--balance-negative"}`}>
                <PriceDisplay amount={Math.abs(currencyTotals[0])} noColor />
              </div>
            </div>
          </>
        )}
      </div>

      {kind === "partners-financial" && accountsTab !== "personal" ? (
        <>
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table">
                <thead>
                  <tr>
                    <th className="cell-num">ت</th>
                    <th>النوع</th>
                    <th className={`col-name ${accountsSort?.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${accountsSort?.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className="col-status">الحالة</th>
                    <th className={`col-money ${accountsSort?.key === "iqd" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("iqd")} style={{ cursor: "pointer" }}>الرصيد بالدينار</th>
                    <th className={`col-money ${accountsSort?.key === "usd" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("usd")} style={{ cursor: "pointer" }}>الرصيد بالدولار</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageAccounts.map((account, idx) => {
                    const pKind = account.kind || "مستثمر";
                    const iqdBalance = moneyValueToNumber(account.iqd_balance);
                    const usdBalance = moneyValueToNumber(account.usd_balance);
                    const balanceStatus = getMultiCurrencyBalanceStatus(iqdBalance, usdBalance);
                    const renderBalanceCell = (amount: number, isUsd: boolean) => {
                      if (amount > 0) {
                        return (
                          <span className="text-green font-bold" style={{ direction: "ltr", display: "inline-block" }}>
                            <PriceDisplay amount={amount} currency={isUsd ? "USD" : "IQD"} noColor />
                          </span>
                        );
                      }
                      if (amount < 0) {
                        return (
                          <span className="text-red font-bold" style={{ direction: "ltr", display: "inline-block" }}>
                            <PriceDisplay amount={Math.abs(amount)} currency={isUsd ? "USD" : "IQD"} noColor />
                          </span>
                        );
                      }
                      return <span style={{ color: "var(--text-muted)" }}>-</span>;
                    };
                    const partnerLike: Partner = {
                      partner_name: account.partner_name,
                      phone: account.phone || "",
                      total_amount: iqdBalance + usdBalance,
                      iqd_balance: account.iqd_balance,
                      usd_balance: account.usd_balance,
                      total_withdrawals: 0,
                      kind: account.kind,
                    };
                    return (
                      <tr
                        key={`${account.partner_name}_${account.kind}`}
                        className={`customers-tr partner-row--${pKind}`}
                        onClick={() => openPersonalAccount(partnerLike)}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td>
                          <span className={`badge badge--kind-${pKind}`}>
                            {pKind}
                          </span>
                        </td>
                        <td className="col-name cell-bold">{account.partner_name}</td>
                        <td className="col-phone">{account.phone || "—"}</td>
                        <td className={`col-status cell-bold ${balanceStatus.className}`}>{balanceStatus.label}</td>
                        <td className="col-money">{renderBalanceCell(iqdBalance, false)}</td>
                        <td className="col-money">{renderBalanceCell(usdBalance, true)}</td>
                        <td className="col-delete">
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            title="حذف"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete({ name: account.partner_name, kind: account.kind });
                              setShowDeleteModal(true);
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAndSortedAccounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty-cell">
                        لا توجد حسابات في هذا التبويب
                      </td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pageAccounts.length) }).map((_, i) => (
                    <tr key={`empty-part-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-status">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : kind === "partners-financial" && accountsTab === "personal" && sharikListView ? (
        // ── قائمة الشركاء ──
        <>
          {Math.ceil(sharikPartners.length / PAGE_SIZE) >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: Math.ceil(sharikPartners.length / PAGE_SIZE) }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === sharikPage ? "is-active" : ""}`}
                  onClick={() => setSharikPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}
          <section className="table-card-container" tabIndex={0}>
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table">
                <thead>
                  <tr>
                    <th className="cell-num">ت</th>
                    <th className={`col-name ${partnersSort?.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort?.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className="col-ratio">نسبة الشراكة</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sharikPartners.slice(sharikPage * PAGE_SIZE, (sharikPage + 1) * PAGE_SIZE).map((partner, idx) => {
                    // Per Instructions.md §1.1, partners own 50% each. Hardcode the ratio instead of using the cash-balance ratio.
                    // Audit fix #5: non-partner ratios are computed per currency (never IQD+USD mixed).
                    const ratio = partner.kind === "شريك" ? 50 : partnerRatioIn(partner, sharikPartners);
                    return (
                      <tr
                        key={`${partner.partner_name}_شريك`}
                        className="customers-tr partner-row--شريك"
                        onClick={() => openPersonalAccount(partner)}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{sharikPage * PAGE_SIZE + idx + 1}</td>
                        <td className="col-name cell-bold">{partner.partner_name}</td>
                        <td className="col-phone">{partner.phone || "—"}</td>
                        <td className="col-money cell-bold">
                          <span className={compareMoney(partner.total_amount, 0) > 0 ? "text-green" : compareMoney(partner.total_amount, 0) < 0 ? "text-red" : "text-muted"}>
                            <PriceDisplay amount={moneyAbs(partner.total_amount)} noColor />
                          </span>
                        </td>
                        <td className="col-ratio">{ratio.toFixed(1)}%</td>
                        <td className="col-delete">
                          {/* غير قابل للحذف */}
                        </td>
                      </tr>
                    );
                  })}
                  {sharikPartners.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-cell">لا يوجد شركاء بعد</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - sharikPartners.slice(sharikPage * PAGE_SIZE, (sharikPage + 1) * PAGE_SIZE).length) }).map((_, i) => (
                    <tr key={`empty-sharik-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-ratio">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : kind === "partners-financial" && accountsTab === "personal" && partnerToView ? (
        <>
          {totalModalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalModalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentModalPage ? "is-active" : ""}`}
                  onClick={() => setModalPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}
          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentModalPage, totalModalPages, setModalPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentModalPage, totalModalPages, setModalPage)}
            tabIndex={0}
          >
            {transactionsLoading ? (
              <p className="text-muted partner-empty-state">جاري التحميل...</p>
            ) : visibleSortedTransactions.length === 0 ? (
              <p className="text-muted partner-empty-state">لا توجد معاملات بعد</p>
            ) : (
              <div
                className="table-wrapper partner-tx-wrapper"
                ref={transactionListRef}
              >
                <table className="data-table">
                  <thead>
                    <tr data-kind={partnerToView?.kind || ""}>
                      <th className={`col-seq ${transactionSort.key === "sequence" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("sequence")} style={{ cursor: "pointer" }}>ت</th>
                      <th className={`col-date ${transactionSort.key === "date" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("date")}>التاريخ</th>
                      <th className="col-time" style={{ width: "80px" }}>الوقت</th>
                      <th className={`col-type ${transactionSort.key === "type" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("type")} style={{ cursor: "pointer", width: "160px", minWidth: "120px" }}>العملية</th>
                      <th className={`col-amount ${transactionSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("amount")} style={{ cursor: "pointer", width: "180px", minWidth: "140px" }}>المبلغ</th>
                      <th className="col-notes">ملاحظة</th>
                      <th className="col-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageTransactions.map((tx) => {
                      const isPaidBorrowerInst = form.kind === "زبون" && isCustomerInstallmentRecord(tx) && paidTransactionIds.has(tx.id);
                      const isProfitRow = isProfitRecognition(tx);
                      const isWithdraw = !isProfitRow && (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) && !isPaidBorrowerInst;
                      const isDeposit = !isProfitRow && (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || tx.type_.startsWith("إعادة استثمار") || tx.type_.startsWith("تسوية") || isPaidBorrowerInst);
                      const direction = transactionDirection(form.kind, isWithdraw);
                      return (
                        <tr
                          key={tx.id}
                          className={`partner-tx-row ${isProfitRow ? "partner-tx-row--profit" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind)
                            ? direction.rowClass
                            : (isDeposit ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                            }`}
                          title={isProfitRow ? "أرباح (تسجيل أرباح ولا تؤثر على الرصيد النقدي)" : form.kind === "زبون" && isCustomerInstallmentRecord(tx) ? "اضغط لمعالجة القسط" : "اضغط لتعديل المعاملة"}
                          onClick={() => !isProfitRow && (form.kind === "زبون" && isCustomerInstallmentRecord(tx) ? openInstallmentModal(tx) : beginEditTransaction(tx))}
                        >
                          <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                          <td className="col-date">{tx.date}</td>
                          <td className="col-time">{tx.time || "00:00"}</td>
                          <td className="col-type">
                            <span className={isProfitRow ? "tx-type-profit" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? `${direction.colorClass} font-bold` : (isWithdraw ? "tx-type-withdraw" : "tx-type-deposit")}>
                              {isProfitRow ? "ارباح" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? direction.label : (form.kind === "زبون" && isSaleInstallmentTx(tx)) ? (isWithdraw ? "باقي" : "واصل") : tx.type_}
                            </span>
                          </td>
                          <td className={cn(
                            "col-amount font-bold",
                            isProfitRow ? "tx-amount-profit" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? direction.colorClass : (form.kind === "زبون" && isSaleInstallmentTx(tx)) ? "text-green" : (isWithdraw ? "text-red" : "text-green")
                          )}>
                            <PriceDisplay
                              amount={tx.amount}
                              currency={tx.currency}
                              noColor
                            />
                          </td>
                          <td className="col-notes cell-notes-text" title={formatNotesText(tx.notes) || undefined}>
                            {formatNotesText(tx.notes) || "—"}
                          </td>
                          <td className="col-actions">
                            {!isProfitRow && (
                              <button
                                type="button"
                                className="partner-tx-delete-btn"
                                title="حذف المعاملة"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTxConfirm(tx);
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : kind !== "partners-financial" ? (
        <>
          {totalPages >= 1 && (
            <div className="table-page-dots" aria-label="تنقل بين الصفحات">
              {Array.from({ length: totalPages }, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`table-page-dot ${idx === currentPage ? "is-active" : ""}`}
                  onClick={() => setPage(idx)}
                  aria-label={`الصفحة ${idx + 1}`}
                />
              ))}
            </div>
          )}

          <section
            className="table-card-container"
            onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
            onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
            tabIndex={0}
          >
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table">
                <thead>
                  <tr>
                    <th className="cell-num">ت</th>
                    <th className={partnersSort?.key === "kind" ? "th--sorted" : ""} onClick={() => handleSortPartners("kind")} style={{ cursor: "pointer" }}>النوع</th>
                    <th className={`col-name ${partnersSort?.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort?.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className={`col-ratio ${partnersSort?.key === "ratio" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("ratio")} style={{ cursor: "pointer" }}>نسبة الشراكة</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagePartners.map((partner, idx) => {
                    const pKind = partner.kind || kind;
                    const sameKind = myPartners.filter((p) => (p.kind || kind) === pKind);
                    // Per Instructions.md §1.1, partners own 50% each. Hardcode the ratio for شريك kind.
                    // Audit fix #5: other ratios are computed per currency (never IQD+USD mixed).
                    const ratio = pKind === "شريك" ? 50 : partnerRatioIn(partner, sameKind);
                    return (
                      <tr
                        key={`${partner.partner_name}_${partner.kind}`}
                        className={`customers-tr partner-row--${pKind}`}
                        onClick={() => openPersonalAccount(partner)}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td>
                          <span className={`badge badge--kind-${pKind}`}>{pKind}</span>
                        </td>
                        <td className="col-name cell-bold">{partner.partner_name}</td>
                        <td className="col-phone">{partner.phone || "—"}</td>
                        <td className="col-money cell-bold">
                          <span className={compareMoney(partner.total_amount, 0) > 0 ? "text-red" : compareMoney(partner.total_amount, 0) < 0 ? "text-green" : "text-muted"}>
                            <PriceDisplay amount={moneyAbs(partner.total_amount)} noColor />
                          </span>
                        </td>
                        <td className="col-ratio">{ratio.toFixed(1)}%</td>
                        <td className="col-delete">
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            title="حذف"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete({ name: partner.partner_name, kind: partner.kind });
                              setShowDeleteModal(true);
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {myPartners.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-cell">لا يوجد {kind === "مستثمر" ? "مستثمرون" : "شركاء"}</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pagePartners.length) }).map((_, i) => (
                    <tr key={`empty-part-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-ratio">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {showNewAccount && kind !== "partners-financial" ? (
        <div className="car-form-card" style={{ marginTop: "1.5rem", padding: "12px" }}>
          <h4 className="car-form-group-title">
            إضافة حساب {kind}
          </h4>
          <form className="form customer-form" onSubmit={handleSubmit}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 250px", minWidth: 0 }}>
                <label className="label" htmlFor="partner-name-new" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {isFormNameDuplicate ? (
                    <span style={{ color: "#ef4444", fontSize: "var(--font-size)", fontWeight: "bold" }}>
                      اسم الحساب موجود!
                    </span>
                  ) : (
                    <span>اسم {kind}</span>
                  )}
                </label>
                <TextInput id="partner-name-new" value={form.name}
                  autoComplete="new-password"
                  onInput={(e: React.FormEvent<HTMLInputElement>) => patchName((e.target as HTMLInputElement).value)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchName(e.target.value)}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchName(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <label className="label" htmlFor="partner-phone-new">
                  رقم الهاتف
                </label>
                <TextInput id="partner-phone-new" value={form.phone}
                  autoComplete="new-password"
                  inputMode="tel"
                  onInput={(e: React.FormEvent<HTMLInputElement>) => patchPhone((e.target as HTMLInputElement).value)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchPhone(e.target.value)}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchPhone(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", paddingBottom: "2px" }}>
                <GoldFxButton type="submit" variant="green" style={{ flex: 1, margin: 0 }} disabled={saving || isFormNameDuplicate}>
                  <span className="gold-fx-btn__label">{saving ? "جاري الحفظ..." : `حفظ ${kind}`}</span>
                </GoldFxButton>
                <GoldFxButton type="button" variant="gray" style={{ flex: 1, margin: 0 }} onClick={() => resetForm()}>
                  <span className="gold-fx-btn__label">إلغاء</span>
                </GoldFxButton>
              </div>
            </div>
          </form>
          <div className="table-card-container" style={{ marginTop: "1rem" }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ت</th>
                    <th>التاريخ</th>
                    <th>الوقت</th>
                    <th>العملية</th>
                    <th>الحساب</th>
                    <th>المبلغ</th>
                    <th>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} className="empty-cell">لا توجد معاملات بعد</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!showNewAccount && modalMode !== null && (kind !== "partners-financial" || !editingKey) && createPortal(
        <div className="modal-overlay" role="presentation" onClick={handleClose}>
          <div
            className={`modal-dialog modal-dialog--overflow-visible ${modalMode === "view" ? "modal-dialog--partner modal-dialog--wide" : "modal-dialog--slim"
              } modal-dialog--kind-${form.kind}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`customer-form-panel ${modalMode === "view" ? "partner-form-panel" : "partner-form-panel--slim"}`}>
              {modalMode === "view" && (
                <div className="partner-summary-sidebar">
                  <div className="partner-summary-field">
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%" }}>
                      {isFormNameDuplicate ? (
                        <span style={{ color: "#ef4444", fontSize: "var(--font-size)", fontWeight: "bold" }}>
                          اسم الحساب موجود!
                        </span>
                      ) : (
                        <span className="partner-summary-field__label">👤 الاسم</span>
                      )}
                    </div>
                    <input
                      type="text"
                      className="partner-sidebar-input"
                      value={form.name}
                      onInput={(e) => patchName((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchName(e.target.value)}
                      onFocus={(e) => setTimeout(() => (e.target as HTMLInputElement).select(), 0)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!isFormNameDuplicate) void handleAutoSave();
                        }
                      }}
                    />
                  </div>
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">📞 رقم الهاتف</span>
                    <input
                      type="text"
                      inputMode="tel"
                      className="partner-sidebar-input"
                      dir="ltr"
                      value={form.phone}
                      onInput={(e) => patchPhone((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchPhone(e.target.value)}
                      onFocus={(e) => setTimeout(() => (e.target as HTMLInputElement).select(), 0)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!isFormNameDuplicate) void handleAutoSave();
                        }
                      }}
                    />
                  </div>
                  {kind === "partners-financial" && (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 نوع الحساب</span>
                      <SearchableCombobox
                        value={form.kind}
                        onChange={(val) => {
                          patchForm({ kind: val });
                        }}
                        placeholder="نوع الحساب"
                        options={[
                          ...(form.kind === "شريك" ? [{ label: "شريك", value: "شريك", kind: "شريك" }] : []),

                          { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                          { label: "ممول", value: "ممول", kind: "ممول" },
                          { label: "زبون", value: "زبون", kind: "زبون" },
                          { label: "وكالة", value: "وكالة", kind: "وكالة" },
                          { label: "شركة", value: "شركة", kind: "شركة" },
                        ]}
                      />
                    </div>
                  )}
                  <GoldFxButton
                    type="button"
                    variant="green"
                    style={{ width: "100%", margin: "8px 0 0" }}
                    disabled={saving || isFormNameDuplicate}
                    onClick={() => void handleAutoSave()}
                  >
                    <span className="gold-fx-btn__label">حفظ التعديلات</span>
                  </GoldFxButton>
                  {isBorrowerKind(form.kind) ? (
                    <>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">📊 المجموع الكلي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--total">
                          <PriceDisplay amount={totalWithdrawals} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "var(--red-600)" }}>واصل</span>
                        <span className="partner-summary-field__value" style={{ color: "var(--red-600)" }}>
                          <PriceDisplay amount={totalDeposits} noColor />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "var(--green)" }}>باقي</span>
                        <span className="partner-summary-field__value" style={{ color: "var(--green)" }}>
                          <PriceDisplay amount={totalWithdrawals} noColor />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 صافي المبلغ</span>
                      <span className="partner-summary-field__value">
                        {form.kind === "ممول" ? (
                          compareMoney(totalDeposits, totalWithdrawals) > 0 ? (
                            <span className="text-red">
                              <PriceDisplay amount={moneyAbs(moneySub(totalDeposits, totalWithdrawals))} noColor />
                            </span>
                          ) : compareMoney(totalDeposits, totalWithdrawals) < 0 ? (
                            <span className="text-green">
                              <PriceDisplay amount={moneyAbs(moneySub(totalDeposits, totalWithdrawals))} noColor />
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>0IQ</span>
                          )
                        ) : (
                          <span className={isFinancialClientKind(form.kind) ? (compareMoney(totalWithdrawals, totalDeposits) >= 0 ? "text-green" : "text-red") : compareMoney(totalDeposits, totalWithdrawals) >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={moneyAbs(isFinancialClientKind(form.kind) ? moneySub(totalWithdrawals, totalDeposits) : moneySub(totalDeposits, totalWithdrawals))} noColor />
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="partner-main-content">
                <div className="car-form-panel__header" style={{ textAlign: "center", width: "100%" }}>
                  <h3 className="car-form-panel__title" style={{ margin: "0 auto" }}>
                    {modalMode === "new"
                      ? "إضافة حساب"
                      : `سجل حركات الحساب ${form.name}`}
                  </h3>
                </div>

                {modalMode !== "view" && (
                  <form className="form customer-form partner-identity-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label className="label" htmlFor="partner-name" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                        {isFormNameDuplicate ? (
                          <span style={{ color: "#ef4444", fontSize: "var(--font-size)", fontWeight: "bold" }}>
                            اسم الحساب موجود!
                          </span>
                        ) : (
                          <span>اسم {kind === "partners-financial" ? "الحساب" : kind}</span>
                        )}
                      </label>
                      <TextInput id="partner-name" value={form.name}
                        autoComplete="new-password"
                        onInput={(e: React.FormEvent<HTMLInputElement>) => patchName((e.target as HTMLInputElement).value)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchName(e.target.value)}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="partner-phone">
                        رقم الهاتف
                      </label>
                      <TextInput id="partner-phone" value={form.phone}
                        autoComplete="new-password"
                        inputMode="tel"
                        onInput={(e: React.FormEvent<HTMLInputElement>) => patchPhone((e.target as HTMLInputElement).value)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchPhone(e.target.value)}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchPhone(e.target.value)} />
                    </div>
                    {kind === "partners-financial" && (
                      <div className="form-group" style={{ zIndex: 10 }}>
                        <label className="label">نوع الحساب</label>
                        <SearchableCombobox
                          value={form.kind}
                          onChange={(val) => patchForm({ kind: val })}
                          placeholder="نوع الحساب"
                          options={[
                            ...(form.kind === "شريك" ? [{ label: "شريك", value: "شريك", kind: "شريك" }] : []),

                            { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                            { label: "ممول", value: "ممول", kind: "ممول" },
                            { label: "زبون", value: "زبون", kind: "زبون" },
                            { label: "وكالة", value: "وكالة", kind: "وكالة" },
                            { label: "شركة", value: "شركة", kind: "شركة" },
                          ]}
                        />
                      </div>
                    )}
                    <div className="car-form-panel__actions">
                      <ActionButton type="submit" variant="success" disabled={saving || isFormNameDuplicate}>
                        {saving ? "جاري الحفظ..." : kind === "partners-financial" ? "حفظ الحساب" : `حفظ ${kind}`}
                      </ActionButton>
                      <ActionButton type="button" variant="ghost" onClick={() => resetForm()}>
                        إلغاء
                      </ActionButton>
                    </div>
                  </form>
                )}

                {modalMode === "view" && (
                  <>
                    {purchasedCars.length > 0 && (
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "12px",
                        marginBottom: "16px",
                        padding: "4px"
                      }}>
                        {purchasedCars.map(car => (
                          <div
                            key={car.car_number}
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: "12px",
                              padding: "12px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              backdropFilter: "blur(8px)",
                              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                            }}
                          >
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: "bold", fontSize: "15px", color: "var(--gold)" }}>
                                {car.car_name} {car.car_model} ({car.car_year})
                              </div>
                              <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
                                لوحة: {car.car_plate_num || car.car_number} | شاصي: {car.chassis_number || "—"}
                              </div>
                              <div style={{ fontSize: "13px", color: "#6ef7b7", marginTop: "4px", fontWeight: "bold" }}>
                                {car.payment_type === "اقساط" ? "شراء بالتقسيط" : car.payment_type === "موعد" ? "شراء بموعد" : "شراء كاش"}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onNavigateToCar?.(car.car_number, car.status === "متوفرة" ? "available" : "sold", 1)}
                              style={{
                                background: "rgba(216, 168, 90, 0.12)",
                                border: "1px solid rgba(216, 168, 90, 0.4)",
                                color: "var(--gold)",
                                borderRadius: "8px",
                                padding: "6px 12px",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: "bold",
                                transition: "all 0.18s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(216, 168, 90, 0.25)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "rgba(216, 168, 90, 0.12)";
                              }}
                            >
                              عرض السيارة 🚗
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {totalModalPages >= 1 && (
                      <div className="table-page-dots" aria-label="تنقل بين الصفحات">
                        {Array.from({ length: totalModalPages }, (_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`table-page-dot ${idx === currentModalPage ? "is-active" : ""}`}
                            onClick={() => setModalPage(idx)}
                            aria-label={`الصفحة ${idx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                    <div className="partner-transactions-panel">
                      {transactionsLoading ? (
                        <p className="text-muted partner-empty-state">جاري التحميل...</p>
                      ) : visibleSortedTransactions.length === 0 ? (
                        <p className="text-muted partner-empty-state">لا توجد معاملات بعد</p>
                      ) : (
                        <>
                          <section
                            className="table-card-container"
                            onWheel={(e) => handlePaginationWheel(e, currentModalPage, totalModalPages, setModalPage)}
                            onKeyDown={(e) => handlePaginationKeyDown(e, currentModalPage, totalModalPages, setModalPage)}
                            tabIndex={0}
                          >
                            <div
                              className="table-wrapper partner-tx-wrapper"
                              ref={transactionListRef}
                            >
                              <table className="data-table">
                                <thead>
                                  <tr data-kind={form.kind || ""}>
                                    <th className={`col-seq ${transactionSort.key === "sequence" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("sequence")} style={{ cursor: "pointer" }}>ت</th>
                                    <th className={`col-date ${transactionSort.key === "date" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("date")} style={{ cursor: "pointer" }}>التاريخ</th>
                                    <th className="col-time">الوقت</th>
                                    <th className={`col-type ${transactionSort.key === "type" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("type")} style={{ cursor: "pointer" }}>العملية</th>
                                    <th className="col-account">الحساب</th>
                                    <th className={`col-amount ${transactionSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortTransactions("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                                    <th className="col-notes">ملاحظة</th>
                                    <th className="col-actions"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pageTransactions.map((tx) => {
                                    const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
                                    const paymentTypeLabel = (rawPaymentType === "مصرف" || rawPaymentType === "قاصه") ? rawPaymentType : "قاصه";
                                    const badgeClass = paymentTypeLabel === "مصرف" ? "account-badge--bank" : "account-badge--qasa";
                                    const isPaidBorrowerInst = form.kind === "زبون" && isCustomerInstallmentRecord(tx) && paidTransactionIds.has(tx.id);
                                    const isProfitRow = isProfitRecognition(tx);
                                    const isWithdraw = !isProfitRow && (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) && !isPaidBorrowerInst;
                                    const isDeposit = !isProfitRow && (tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || isPaidBorrowerInst);
                                    const direction = transactionDirection(form.kind, isWithdraw);
                                    const canOpenInstallmentAction = form.kind === "زبون" && (isInstallmentScheduleTx(tx) || getLinkedInstallmentId(tx) != null);
                                    const canReverseInstallment = canOpenInstallmentAction && tx.type_.startsWith("واصل") && isCustomerInstallmentRecord(tx);
                                    return (
                                      <tr
                                        key={tx.id}
                                        className={`partner-tx-row ${isProfitRow ? "partner-tx-row--profit" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind)
                                          ? direction.rowClass
                                          : form.kind === "ممول"
                                            ? (isWithdraw ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                                            : (isDeposit ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                                          }`}
                                        title={isProfitRow ? "أرباح (تسجيل أرباح ولا تؤثر على الرصيد النقدي)" : canOpenInstallmentAction && isCustomerInstallmentRecord(tx) ? "اضغط لمعالجة القسط" : "اضغط لتعديل المعاملة"}
                                        onClick={() => !isProfitRow && (canOpenInstallmentAction && isCustomerInstallmentRecord(tx) ? openInstallmentModal(tx) : beginEditTransaction(tx))}
                                      >
                                        <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                                        <td className="col-date">{tx.date}</td>
                                        <td className="col-time">{tx.time || "00:00"}</td>
                                        <td className="col-type">
                                          <span className={isProfitRow ? "tx-type-profit" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? `${direction.colorClass} font-bold` : form.kind === "ممول" ? (isWithdraw ? "text-green font-bold" : "text-red font-bold") : (isWithdraw ? "tx-type-withdraw" : "tx-type-deposit")}>
                                            {isProfitRow ? "ارباح" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? direction.label : (form.kind === "زبون" && isSaleInstallmentTx(tx)) ? (isWithdraw ? "باقي" : "واصل") : tx.type_}
                                          </span>
                                        </td>
                                        <td className="col-account">
                                          <span className={`account-badge ${badgeClass}`}>
                                            {paymentTypeLabel}
                                          </span>
                                        </td>
                                        <td className={cn(
                                          "col-amount font-bold",
                                          isProfitRow ? "tx-amount-profit" : isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? direction.colorClass :
                                            form.kind === "ممول" ? (isWithdraw ? "text-red" : "text-green") :
                                              (form.kind === "زبون" && isSaleInstallmentTx(tx)) ? "text-green" :
                                                (isWithdraw ? "text-red" : "text-green")
                                        )}>
                                          <PriceDisplay
                                            amount={tx.amount}
                                            currency={tx.currency}
                                            noColor
                                          />
                                        </td>
                                        <td className="col-notes cell-notes-text">
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span title={formatNotesText(tx.notes) || undefined}>
                                              {formatNotesText(tx.notes) || "—"}
                                            </span>
                                            {(form.kind === "زبون" && isUnpaidInstallment(tx) && !paidTransactionIds.has(tx.id)) && (
                                              <button
                                                type="button"
                                                className="btn-settle-installment"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  beginSettleInstallment(tx);
                                                }}
                                              >
                                                واصل
                                              </button>
                                            )}
                                            {canReverseInstallment && (
                                              <button
                                                type="button"
                                                className="btn-settle-installment"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openInstallmentModal(tx, "reverse");
                                                }}
                                              >
                                                إلغاء
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="col-actions">
                                          {!isProfitRow && (
                                            <button
                                              type="button"
                                              className="partner-tx-delete-btn"
                                              title="حذف المعاملة"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteTxConfirm(tx);
                                              }}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        </>
                      )}
                    </div>

                    {!isBorrowerKind(form.kind) && (
                      <div className="car-form-panel__actions partner-modal-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                        <ActionButton
                          type="button"
                          variant={isBorrowerKind(form.kind) ? "success" : "success"}
                          style={{ flex: 1, minWidth: 0, padding: "8px 16px", background: isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)", color: isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? "var(--green)" : "var(--red-600)", backdropFilter: "blur(8px)", borderRadius: "var(--all-radius)", fontWeight: 700, fontSize: "var(--fs-sm)" }}
                          onClick={openWithdrawForm}
                        >
                          {isBorrowerKind(form.kind)
                            ? `باقي على ${firstAccountName(form.name)}`
                            : isFinancialClientKind(form.kind)
                              ? `تسليم الى ${firstAccountName(form.name)}`
                              : "سحب"}
                        </ActionButton>
                        <ActionButton
                          type="button"
                          variant={isBorrowerKind(form.kind) ? "secondary" : "secondary"}
                          style={{ flex: 1, minWidth: 0, padding: "8px 16px", background: isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", border: isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(34,197,94,0.3)", color: isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? "var(--red-600)" : "var(--green)", backdropFilter: "blur(8px)", borderRadius: "var(--all-radius)", fontWeight: 700, fontSize: "var(--fs-sm)" }}
                          onClick={openDepositForm}
                        >
                          {isBorrowerKind(form.kind)
                            ? `واصل من ${firstAccountName(form.name)}`
                            : form.kind === "شركة" || form.kind === "ممول" || form.kind === "مستثمر"
                              ? `استلام من ${firstAccountName(form.name)}`
                              : "إيداع"}
                        </ActionButton>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── نافذة البحث المنبثقة للعملاء ── */}
      {kind === "partners-financial" && partnersSearchOpen && (
        <div className="search-overlay" onClick={() => onPartnersSearchClose?.()}>
          <div
            className="search-popup"
            onClick={(e) => e.stopPropagation()}
            role="search"
            aria-label="بحث في حسابات العملاء"
          >
            <div className="search-popup__header">
              <span className="search-popup__icon" aria-hidden>❖</span>
              <span className="search-popup__title">بحث في حسابات العملاء</span>
              {partnersSearch.trim() && (
                <span className="search-popup__badge">
                  {filteredPartnersForSearch.length}
                </span>
              )}
              <button
                type="button"
                className="search-popup__close"
                onClick={() => onPartnersSearchClose?.()}
                aria-label="إغلاق البحث"
              >
                ✕
              </button>
            </div>

            <div className="search-popup__body">
              <span className="search-popup__search-icon" aria-hidden>🔍</span>
              <input
                ref={partnersSearchInputRef}
                type="search"
                className="search-popup__input"
                placeholder="ابحث باسم الحساب أو رقم الهاتف..."
                value={partnersSearch}
                onChange={(e) => {
                  setPartnersSearch(e.target.value);
                  setPartnersSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  const results = filteredPartnersForSearch.slice(0, 8);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPartnersSearchHighlightIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPartnersSearchHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results.length > 0) {
                    e.preventDefault();
                    const partner = results[partnersSearchHighlightIdx] ?? results[0];
                    onPartnersSearchClose?.();
                    void openPersonalAccount(partner);
                  }
                }}
                autoComplete="off"
                dir="rtl"
              />
              {partnersSearch && (
                <button
                  type="button"
                  className="search-popup__clear"
                  onClick={() => { setPartnersSearch(""); setPartnersSearchHighlightIdx(0); }}
                  aria-label="مسح البحث"
                >
                  ✕
                </button>
              )}
            </div>

            {partnersSearch.trim() && (
              <div className="search-popup__results">
                {filteredPartnersForSearch.length === 0 ? (
                  <div className="search-popup__empty">
                    <span className="search-popup__empty-icon" aria-hidden>👤</span>
                    <span>لا توجد حسابات مطابقة</span>
                  </div>
                ) : (
                  <ul className="search-popup__list" role="listbox">
                    {filteredPartnersForSearch.slice(0, 8).map((partner, resultIdx) => {
                      const isHighlighted = resultIdx === partnersSearchHighlightIdx;
                      const q = partnersSearch.trim();
                      const highlight = (text: string) => {
                        if (!q) return text;
                        const idx = text.toLowerCase().indexOf(q.toLowerCase());
                        if (idx === -1) return text;
                        return (
                          <>
                            {text.slice(0, idx)}
                            <mark className="search-popup__mark">{text.slice(idx, idx + q.length)}</mark>
                            {text.slice(idx + q.length)}
                          </>
                        );
                      };
                      const pKind = partner.kind || "شريك";
                      return (
                        <li
                          key={`${partner.partner_name}_${partner.kind}`}
                          className={`search-popup__item${isHighlighted ? " search-popup__item--active" : ""}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setPartnersSearchHighlightIdx(resultIdx)}
                          onClick={() => {
                            onPartnersSearchClose?.();
                            void openPersonalAccount(partner);
                          }}
                        >
                          <div className="search-popup__item-main">
                            <span className="search-popup__item-model">
                              {highlight(partner.partner_name)}
                            </span>
                            <span className={`badge badge--kind-${pKind}`} style={{ fontSize: "var(--fs-xs)", padding: "1px 6px" }}>
                              {pKind}
                            </span>
                          </div>
                          <div className="search-popup__item-sub">
                            <span className="search-popup__item-plate">
                              {partner.phone || "—"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                    {filteredPartnersForSearch.length > 8 && (
                      <li className="search-popup__more">
                        و {filteredPartnersForSearch.length - 8} حساب آخر...
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        title={`تأكيد حذف ${form.kind}`}
        message={`هل تريد حذف «${editingKey ?? form.name}» وكل معاملاته؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        loading={saving}
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteDialogOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTxConfirm}
        title="تأكيد حذف المعاملة"
        message={<span>هل تريد حذف هذه المعاملة بقيمة ({deleteTxConfirm ? <PriceDisplay amount={deleteTxConfirm.amount} currency={deleteTxConfirm.currency} /> : ""})؟ لا يمكن التراجع عن هذا الإجراء.</span>}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        onConfirm={() => void executeDeleteTransaction()}
        onCancel={() => setDeleteTxConfirm(null)}
      />

      <ConfirmDialog
        open={showExitConfirm}
        title="حفظ التغييرات"
        message="هل تود حفظ التغييرات قبل الخروج؟"
        confirmLabel="حفظ"
        cancelLabel="تجاهل"
        onConfirm={() => void handleExitConfirmSave()}
        onCancel={handleExitConfirmDiscard}
      />

      <ConfirmDialog
        open={!!errorDialog}
        title={errorDialog?.title ?? "تنبيه"}
        message={errorDialog?.message ?? ""}
        confirmLabel="موافق"
        cancelLabel="إغلاق"
        danger
        onConfirm={() => setErrorDialog(null)}
        onCancel={() => setErrorDialog(null)}
      />

      <ConfirmDialog
        open={showFunderInsuffientModal}
        title="تنبيه: رصيد الممول غير كافٍ"
        message={
          insufficientFunderDetails ? (
            <span>
              رصيد الممول <strong>{insufficientFunderDetails.name}</strong> الحالي هو (
              <PriceDisplay
                amount={insufficientFunderDetails.available}
                currency={insufficientFunderDetails.currency}
              />
              )، وهو أقل من المبلغ المطلوب تسديده (
              <PriceDisplay
                amount={insufficientFunderDetails.required}
                currency={insufficientFunderDetails.currency}
              />
              ).
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="موافق"
        onConfirm={() => {
          setShowFunderInsuffientModal(false);
          setInsufficientFunderDetails(null);
        }}
        onCancel={() => {
          setShowFunderInsuffientModal(false);
          setInsufficientFunderDetails(null);
        }}
      />

      {installmentModal && (
        <div className="mb-overlay" role="presentation" onClick={() => !installmentProcessing && setInstallmentModal(null)}>
          <div
            className="mb-dialog tx-dialog installment-pay-dialog"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 620, fontSize: "var(--font-size)" }}
          >
            <h3 className="mb-title" style={{ fontSize: "var(--font-size)" }}>
              {installmentModal.mode === "pay" ? "تسديد قسط" : "إلغاء دفعة قسط"}
            </h3>
            {installmentModal.mode === "pay" ? (
              <div className="form tx-dialog-form" style={{ display: "grid", gap: "1rem" }}>
                <div className="installment-dialog-grid-2">
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "12px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "72px"
                  }}>
                    <span style={{ fontSize: "calc(var(--font-size) * 0.65)", color: "var(--font-lable-color)", marginBottom: "0.25rem" }}>القسط المستحق</span>
                    <div style={{ fontSize: "calc(var(--font-size) * 1.15)", fontWeight: "bold" }}>
                      <PriceDisplay amount={installmentModal.preview?.current_amount ?? installmentModal.tx.current_amount ?? installmentModal.tx.amount} currency={installmentModal.tx.currency} />
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "12px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    minHeight: "72px"
                  }}>
                    <span style={{ fontSize: "calc(var(--font-size) * 0.65)", color: "var(--font-lable-color)", marginBottom: "0.5rem", textAlign: "center" }}>المدفوع فعلاً</span>
                    <PriceInput
                      value={String(installmentModal.actualPaidAmount)}
                      onChange={(amount) => setInstallmentModal((current) => current ? { ...current, actualPaidAmount: Number(amount) || 0 } : current)}
                      currency={(installmentModal.tx.currency === "USD" ? "USD" : "IQD") as Currency}
                      onCurrencyChange={() => undefined}
                    />
                  </div>
                </div>

                <div style={{
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  borderRadius: "12px",
                  padding: "1rem",
                  marginTop: "0.25rem"
                }}>
                  <h4 style={{
                    fontSize: "calc(var(--font-size) * 0.73)",
                    fontWeight: "bold",
                    color: "var(--font-lable-color)",
                    marginBottom: "0.75rem",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                    paddingBottom: "0.5rem"
                  }}>
                    تأثير الفارق المالي
                  </h4>
                  <div className="installment-dialog-grid-3">
                    <div style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "10px",
                      padding: "0.75rem 0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <span style={{ fontSize: "calc(var(--font-size) * 0.62)", color: "var(--font-lable-color)", marginBottom: "0.25rem" }}>الفرق</span>
                      <span style={{ fontWeight: "bold", fontSize: "calc(var(--font-size) * 0.77)" }}>
                        <PriceDisplay amount={installmentModal.preview?.difference_amount ?? 0} currency={installmentModal.tx.currency} />
                      </span>
                    </div>

                    <div style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "10px",
                      padding: "0.75rem 0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <span style={{ fontSize: "calc(var(--font-size) * 0.62)", color: "var(--font-lable-color)", marginBottom: "0.25rem" }}>الأقساط المتأثرة</span>
                      <span style={{ fontWeight: "bold", color: "var(--labletext)", fontSize: "calc(var(--font-size) * 0.77)" }}>
                        {installmentModal.loadingPreview ? (
                          <span style={{ opacity: 0.5 }}>...</span>
                        ) : (
                          (installmentModal.preview?.affected_count ?? 0) === 0 ? (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>لا يوجد</span>
                          ) : (
                            `${installmentModal.preview?.affected_count} قسط`
                          )
                        )}
                      </span>
                    </div>

                    <div style={{
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "10px",
                      padding: "0.75rem 0.5rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <span style={{ fontSize: "calc(var(--font-size) * 0.62)", color: "var(--font-lable-color)", marginBottom: "0.25rem" }}>تعديل الأقساط</span>
                      <span style={{ fontWeight: "bold", display: "flex", alignItems: "center", fontSize: "calc(var(--font-size) * 0.77)" }}>
                        {(() => {
                          const dir = installmentModal.preview?.redistribution_direction ?? "لا يوجد فرق";
                          if (dir.includes("تخفيض")) {
                            return (
                              <span style={{
                                color: "#10b981",
                                background: "rgba(16, 185, 129, 0.1)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "calc(var(--font-size) * 0.62)"
                              }}>
                                تخفيض ↓
                              </span>
                            );
                          }
                          if (dir.includes("زيادة")) {
                            return (
                              <span style={{
                                color: "#f43f5e",
                                background: "rgba(244, 63, 94, 0.1)",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "calc(var(--font-size) * 0.62)"
                              }}>
                                زيادة ↑
                              </span>
                            );
                          }
                          return (
                            <span style={{
                              color: "rgba(255,255,255,0.5)",
                              background: "rgba(255, 255, 255, 0.05)",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "calc(var(--font-size) * 0.62)"
                            }}>
                              لا يوجد
                            </span>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                background: "rgba(244, 63, 94, 0.04)",
                border: "1px solid rgba(244, 63, 94, 0.15)",
                borderRadius: "12px",
                padding: "1.25rem",
                color: "var(--textinputtext)",
                maxHeight: "260px",
                overflowY: "auto"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
                  <span style={{
                    background: "rgba(244, 63, 94, 0.15)",
                    color: "#f43f5e",
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "calc(var(--font-size) * 0.85)",
                    fontWeight: "bold"
                  }}>
                    ⚠️
                  </span>
                  <h4 style={{ fontSize: "calc(var(--font-size) * 0.77)", fontWeight: "bold", color: "#f43f5e", margin: 0 }}>
                    تنبيه إلغاء دفعة القسط
                  </h4>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "calc(var(--font-size) * 0.73)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#f43f5e", marginTop: "2px" }}>•</span>
                    <p style={{ margin: 0 }}>سيتم <strong>إلغاء تسجيل الدفعة</strong> بالكامل وتغيير حالة القسط إلى غير مسدد.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#f43f5e", marginTop: "2px" }}>•</span>
                    <p style={{ margin: 0 }}>سيتم <strong>عكس قيود القاصة</strong> تلقائياً واسترجاع المبلغ.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#f43f5e", marginTop: "2px" }}>•</span>
                    <p style={{ margin: 0 }}>سيتم <strong>عكس قيود الشركاء</strong> وإلغاء توزيع الأرباح المرتبطة بالدفعة بالتساوي (50% / 50%).</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#f43f5e", marginTop: "2px" }}>•</span>
                    <p style={{ margin: 0 }}>سيتم <strong>عكس كافة القيود المحاسبية</strong> المرتبطة بهذه المعاملة في النظام.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: "#f43f5e", marginTop: "2px" }}>•</span>
                    <p style={{ margin: 0 }}>سيتم <strong>إعادة احتساب جدول الأقساط</strong> وتوزيع القيمة الملغاة على الأقساط القادمة.</p>
                  </div>
                </div>
              </div>
            )}
            {installmentModal.error && (
              <div style={{
                background: "rgba(244, 63, 94, 0.08)",
                border: "1px solid rgba(244, 63, 94, 0.2)",
                borderRadius: "8px",
                padding: "0.75rem",
                color: "#f43f5e",
                textAlign: "center",
                marginTop: "1rem",
                fontWeight: 700,
                fontSize: "calc(var(--font-size) * 0.73)"
              }}>
                ⚠️ {installmentModal.error}
              </div>
            )}
            <div className="modal-dialog__actions" style={{ marginTop: "1.5rem", display: "flex", gap: "12px" }}>
              <GoldFxButton
                type="button"
                variant={installmentModal.mode === "pay" ? "gold" : "red"}
                style={{ flex: 1, margin: 0 }}
                disabled={installmentProcessing || (installmentModal.mode === "pay" && (installmentModal.loadingPreview || !installmentModal.preview || !!installmentModal.error))}
                onClick={confirmInstallmentModal}
              >
                <span className="gold-fx-btn__label">
                  {installmentProcessing ? "جاري التنفيذ..." : installmentModal.mode === "pay" ? "تأكيد التسديد" : "تأكيد إلغاء الدفعة"}
                </span>
              </GoldFxButton>
              <GoldFxButton
                type="button"
                variant="gray"
                style={{ flex: 1, margin: 0, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)" }}
                disabled={installmentProcessing}
                onClick={() => setInstallmentModal(null)}
              >
                <span className="gold-fx-btn__label">إغلاق</span>
              </GoldFxButton>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة إضافة / تحديث المعاملة ── */}
      {showTxModal && editingKey && (
        <div className="mb-overlay" role="presentation" onClick={() => setShowTxModal(false)}>
          <div
            className="mb-dialog tx-dialog"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: ((form.kind === "ممول" || form.kind === "شركة") && txForm.type === "سحب") ? 650 : 480 }}
          >
            <h3 className="mb-title">
              {isFinancialClientKind(form.kind)
                ? (txForm.type === "سحب"
                  ? (editingTransactionId ? `تعديل تسليم - ${form.name}` : `تسليم - ${form.name}`)
                  : (editingTransactionId ? `تعديل استلام - ${form.name}` : `استلام - ${form.name}`))
                : (editingTransactionId ? "تحديث المعاملة" : `إضافة معاملة - ${form.name}`)}
            </h3>

            {!(form.kind === "ممول" && txForm.type === "سحب") && isFinancialClientKind(form.kind) && (
              <div style={{
                margin: "0 0 1rem",
                padding: "0.6rem",
                borderRadius: "var(--all-radius)",
                textAlign: "center",
                fontWeight: "var(--fw-bold)",
                fontSize: "var(--fs-sm)",
                background: isFinancialClientKind(form.kind)
                  ? (txForm.type === "سحب" ? "var(--green-bg)" : "var(--red-bg)")
                  : (txForm.type === "سحب" ? "var(--green-bg)" : "rgba(216, 168, 90, 0.15)"),
                color: isFinancialClientKind(form.kind)
                  ? (txForm.type === "سحب" ? "var(--green)" : "var(--red-600)")
                  : (txForm.type === "سحب" ? "var(--green)" : "var(--gold)"),
                border: isFinancialClientKind(form.kind)
                  ? (txForm.type === "سحب" ? "1px solid var(--green-bd)" : "1px solid var(--red-bd)")
                  : (txForm.type === "سحب" ? "1px solid var(--green-bd)" : "1px solid rgba(216, 168, 90, 0.3)")
              }}>
                {isFinancialClientKind(form.kind)
                  ? (txForm.type === "سحب" ? `تسليم إلى ${form.name} (نحن نطلبه)` : `استلام من ${form.name} (هو يطلبنا)`)
                  : (txForm.type === "سحب" ? `باقي على ${form.name} (نطلبه)` : `واصل من ${form.name} (يطلبنا)`)}
              </div>
            )}

            {editingTransactionId && (
              (form.kind === "زبون" && !isEditingSaleDownPayment) ||
              (form.kind === "وكالة" && isAgencyReceivableRecord(editingTransaction))
            ) && (
              <div style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "center",
                margin: "0 0 1rem",
              }}>
                <button
                  type="button"
                  className={`payment-type-btn payment-type-btn--settle ${txForm.type === "ايداع" ? "payment-type-btn--active" : ""}`}
                  onClick={() => setTxForm(prev => ({ ...prev, type: "ايداع" }))}
                  style={{
                    flex: 1, padding: "8px 16px",
                    background: txForm.type === "ايداع" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "ايداع" ? "var(--red-600)" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "ايداع" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  واصل
                </button>
                <button
                  type="button"
                  className={`payment-type-btn payment-type-btn--unsettle ${txForm.type === "سحب" ? "payment-type-btn--active" : ""}`}
                  onClick={() => setTxForm(prev => ({ ...prev, type: "سحب" }))}
                  style={{
                    flex: 1, padding: "8px 16px",
                    background: txForm.type === "سحب" ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "سحب" ? "var(--green)" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "سحب" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  باقي
                </button>
              </div>
            )}

            <style>{`
              .tx-dialog {
                background: var(--background-secondary) !important;
                border: 1px solid var(--border-master) !important;
                border-radius: var(--all-radius) !important;
                backdrop-filter: blur(var(--background-secondary-blur)) saturate(var(--background-secondary-saturate)) !important;
                -webkit-backdrop-filter: blur(var(--background-secondary-blur)) saturate(var(--background-secondary-saturate)) !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;
                overflow: visible !important;
              }
              .tx-dialog .mb-title {
                font-size: var(--font-size) !important;
              }
              .tx-dialog-form .mb-label {
                color: var(--textinputlabletext) !important;
                font-size: var(--font-size) !important;
              }
              .tx-dialog-form .app-input-field {
                color: var(--textinputtext) !important;
                font-size: var(--font-size) !important;
              }
              .tx-dialog-form .mb-textarea {
                color: var(--textinputtext) !important;
                font-size: var(--font-size) !important;
              }
              .tx-dialog-form .act-btn {
                font-size: var(--font-size) !important;
              }
              .tx-dialog-form .tx-notes-field {
                background: var(--input-bg) !important;
                border: var(--input-border-color) !important;
                border-radius: var(--input-border-radius) !important;
                color: var(--textinputtext) !important;
                font-size: var(--font-size) !important;
                font-family: var(--input-font-family) !important;
                padding: 0 16px !important;
                min-height: var(--input-height) !important;
                height: var(--input-height) !important;
                resize: none !important;
                overflow: hidden !important;
                width: 100% !important;
                outline: none !important;
                box-sizing: border-box !important;
                text-align: center !important;
                line-height: var(--input-height) !important;
              }
              .tx-dialog-form .modal-dialog__actions {
                justify-content: flex-start !important;
                direction: rtl !important;
              }
            `}</style>
            <form className="form tx-dialog-form" onSubmit={handleAddTransaction}>
              {(form.kind === "ممول" || form.kind === "شركة") && txForm.type === "سحب" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 1.5rem" }}>
                  {/* Row 1: التاريخ - المبلغ */}
                  <div className="form-group">
                    <label className="mb-label">التاريخ</label>
                    <UnifiedDateField
                      value={txForm.date}
                      onChange={(date) => setTxForm({ ...txForm, date })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="mb-label">المبلغ</label>
                    <PriceInput
                      value={String(txForm.amount)}
                      onChange={(amount) => setTxForm({ ...txForm, amount: Number(amount) || 0 })}
                      currency={txCurrency}
                      onCurrencyChange={setTxCurrency}
                    />
                  </div>

                  {form.kind === "ممول" && (
                    <>
                      {/* Row 2: العمولة - المبلغ مع العمولة */}
                      <div className="form-group">
                        <label className="mb-label">العمولة</label>
                        <PriceInput
                          value={String(txForm.commission)}
                          onChange={(commission) => setTxForm({ ...txForm, commission: Number(commission) || 0 })}
                          currency={txCurrency}
                          onCurrencyChange={setTxCurrency}
                        />
                      </div>
                      <div className="form-group">
                        <label className="mb-label">المبلغ الكلي مع العمولة</label>
                        <div style={{
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "var(--all-radius)",
                          color: "var(--green)",
                          fontWeight: 700,
                          fontSize: "var(--fs-md)",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          height: "42px"
                        }}>
                          <PriceDisplay amount={txForm.amount + txForm.commission} currency={txCurrency} />
                        </div>
                      </div>

                      {/* Row 3: ارسال المبلغ بيد */}
                      <div className="form-group" style={{ gridColumn: "span 2" }}>
                        <label className="mb-label">ارسال المبلغ بيد</label>
                        <TextInput
                          value={txForm.transferBy}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxForm({ ...txForm, transferBy: e.target.value })}
                          placeholder="اسم ناقل المبلغ..."
                        />
                      </div>
                    </>
                  )}

                  {form.kind === "شركة" && (
                    <>
                      {/* Row 2: طريقة الدفع */}
                      <div className="form-group">
                        <label className="mb-label">طريقة الدفع</label>
                        <div className="payment-type-selector" style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            className={`payment-type-btn payment-type-btn--green ${companyPaymentMode === "cash" || companyPaymentMode === "" ? "payment-type-btn--active" : ""}`}
                            onClick={() => setCompanyPaymentMode("cash")}
                          >
                            كاش
                          </button>
                          <button
                            type="button"
                            className={`payment-type-btn payment-type-btn--blue ${companyPaymentMode === "funder" ? "payment-type-btn--active" : ""}`}
                            onClick={() => setCompanyPaymentMode("funder")}
                          >
                            تمويل
                          </button>
                        </div>
                      </div>

                      {/* Row 2: اختر الممول */}
                      <div className="form-group">
                        {companyPaymentMode === "funder" ? (
                          <>
                            <label className="mb-label">اختر الممول</label>
                            <div className="bg-[var(--car-bg-card)] rounded-xl p-1" style={{ position: "relative" }}>
                              <SearchableCombobox
                                value={settleFunderName}
                                onChange={(name) => setSettleFunderName(name)}
                                placeholder="اختر الممول"
                                options={partners.filter(p => p.kind === "ممول").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                              />
                            </div>
                          </>
                        ) : (
                          <div style={{ height: "100%" }} />
                        )}
                      </div>
                    </>
                  )}

                  {/* Row 4: الملاحظات */}
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="mb-label">الملاحظات</label>
                    <textarea
                      className="tx-notes-field"
                      value={txForm.notes}
                      onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="mb-label">
                      التاريخ
                    </label>
                    <UnifiedDateField
                      value={txForm.date}
                      onChange={(date) => setTxForm({ ...txForm, date })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="mb-label">المبلغ</label>
                    <PriceInput
                      value={String(txForm.amount)}
                      onChange={(amount) => setTxForm({ ...txForm, amount: Number(amount) || 0 })}
                      currency={txCurrency}
                      onCurrencyChange={setTxCurrency}
                    />
                  </div>

                  {form.kind === "ممول" && txForm.type === "سحب" && (
                    <>
                      <div className="form-group">
                        <label className="mb-label">نقل المبلغ بواسطة</label>
                        <TextInput
                          value={txForm.transferBy}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxForm({ ...txForm, transferBy: e.target.value })}
                          placeholder="اسم ناقل المبلغ (مثال: مكتب صرافة، مصرف...)"
                        />
                      </div>
                      <div className="form-group">
                        <label className="mb-label">العمولة</label>
                        <PriceInput
                          value={String(txForm.commission)}
                          onChange={(commission) => setTxForm({ ...txForm, commission: Number(commission) || 0 })}
                          currency={txCurrency}
                          onCurrencyChange={setTxCurrency}
                        />
                      </div>
                      <div className="form-group">
                        <label className="mb-label">المبلغ الكلي مع العمولة</label>
                        <div style={{
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "var(--all-radius)",
                          color: "var(--green)",
                          fontWeight: 700,
                          fontSize: "var(--fs-md)",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          height: "42px"
                        }}>
                          <PriceDisplay amount={txForm.amount + txForm.commission} currency={txCurrency} />
                        </div>
                      </div>
                    </>
                  )}



                  <div className="form-group">
                    <label className="mb-label">الملاحظة</label>
                    <textarea
                      className="tx-notes-field"
                      value={txForm.notes}
                      onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                    />
                  </div>
                </>
              )}

              <div className="modal-dialog__actions" style={{ marginTop: "1.5rem", display: "flex", gap: "12px" }}>
                <GoldFxButton
                  type="submit"
                  variant={isFinancialClientKind(form.kind) || isBorrowerKind(form.kind) ? (txForm.type === "سحب" ? "green" : "red") : (txForm.type === "ايداع" ? "green" : "gray")}
                  style={{ flex: 1, margin: 0 }}
                  disabled={saving}
                >
                  <span className="gold-fx-btn__label">
                    {saving
                      ? "جاري الحفظ..."
                      : editingTransactionId
                        ? "تحديث"
                        : isFinancialClientKind(form.kind)
                          ? (txForm.type === "سحب" ? "تسليم" : "استلام")
                          : isBorrowerKind(form.kind)
                            ? (txForm.type === "سحب" ? "باقي" : "واصل")
                            : "إضافة"}
                  </span>
                </GoldFxButton>
                <GoldFxButton type="button" variant="gray" style={{ flex: 1, margin: 0, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)" }} onClick={() => setShowTxModal(false)}>
                  <span className="gold-fx-btn__label">إلغاء</span>
                </GoldFxButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف العميل / المديونية */}
      {showDeleteModal && partnerToDelete && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowDeleteModal(false)}>
          <div
            className="fx-confirm-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="fx-confirm-title">تأكيد حذف {partnerToDelete.kind}</h3>
            <p className="fx-confirm-message">
              هل أنت متأكد من حذف <strong>{partnerToDelete.name}</strong> وكل معاملاته؟
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="fx-confirm-actions">
              <GoldFxButton
                type="button"
                variant="red"
                onClick={() => {
                  const p = partnerToDelete;
                  setShowDeleteModal(false);
                  setPartnerToDelete(null);
                  void executeInlineDelete(p.name, p.kind);
                }}
                disabled={saving}
              >

                <span className="gold-fx-btn__label">{saving ? "جاري الحذف..." : "تأكيد"}</span>
              </GoldFxButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => { setShowDeleteModal(false); setPartnerToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {printMenuOpen && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setPrintMenuOpen(false)}>
          <div
            className="fx-confirm-dialog modal-dialog--kind-زبون"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "420px", display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <h3 className="fx-confirm-title" style={{ fontSize: "var(--font-size)", fontWeight: 800, margin: 0, color: "var(--white)", textAlign: "center" }}>
              خيارات طباعة كشف الحساب
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "8px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: "var(--white)", fontWeight: "bold", minWidth: "40px", fontSize: "var(--fs-sm)", textAlign: "right" }}>من</span>
                <UnifiedDateField value={printFromDate} onChange={setPrintFromDate} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ color: "var(--white)", fontWeight: "bold", minWidth: "40px", fontSize: "var(--fs-sm)", textAlign: "right" }}>إلى</span>
                <UnifiedDateField value={printToDate} onChange={setPrintToDate} />
              </div>
            </div>

            <div className="fx-confirm-actions" style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <GoldFxButton
                type="button"
                variant="green"
                onClick={() => {
                  void runPrint(printFromDate || printToDate ? "range" : "all");
                }}
              >
                <span className="gold-fx-btn__label">طباعة</span>
              </GoldFxButton>
              <GoldFxButton
                type="button"
                variant="red"
                onClick={() => setPrintMenuOpen(false)}
              >
                <span className="gold-fx-btn__label">إلغاء</span>
              </GoldFxButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
