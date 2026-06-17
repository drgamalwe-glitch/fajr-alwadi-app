import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { callTauri } from "../api/tauri";
import { todayIsoDate } from "../utils/dateSegments";
import type { Partner, PartnerTransaction, UnifiedAccount } from "../types";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { SearchableCombobox } from "./SearchableCombobox";
import { UnifiedDateField } from "./UnifiedDateField";
import { ActionButton, TextInput, NumberInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { Search } from "lucide-react";
import { PAGE_SIZE } from "../constants";
import { cn } from "../lib/utils";
import { GoldFxButton } from "./ui/GoldFxButton";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";

interface PartnersTabProps {
  partners: Partner[];
  onRefresh: () => Promise<void>;
  kind: string;
  partnersSearchOpen?: boolean;
  onPartnersSearchClose?: () => void;
  onPartnerActionsChange?: (actions: { onDeposit: () => void; onWithdraw: () => void; depositLabel?: string; withdrawLabel?: string } | null) => void;
  onAddAccountChange?: (onAddAccount: { action: () => void } | null) => void;
  pendingPartnerOpen?: string | null;
  onPendingPartnerOpened?: () => void;
}

const createEmptyForm = (kind: string) => ({
  name: "",
  phone: "",
  kind: kind === "partners-financial" ? "" : kind,
});

type TransactionType = "ايداع" | "سحب";
type TransactionSortKey = "sequence" | "date" | "type" | "amount";
type SortDirection = "asc" | "desc";

const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  (tx.type_ === "سحب" || tx.type_.startsWith("باقي")) && (!!tx.notes?.includes("قسط") || tx.type_.startsWith("باقي اقساط"));

const isBorrowerInstallmentPayment = (tx: PartnerTransaction) =>
  tx.type_.startsWith("تسديد") ||
  tx.type_.startsWith("استلام قسط") ||
  ((tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع")) && !!tx.notes?.includes("قسط"));

const isUnpaidInstallment = (tx: PartnerTransaction) =>
  (tx.type_ === "سحب" || tx.type_.startsWith("باقي")) && (!!tx.notes?.includes("موعد تسليم") || !!tx.notes?.includes("قسط") || tx.type_.startsWith("باقي")) && tx.amount > 0;

// معاملات بيع السيارة بموعد تسليم أو تقسيط (تُعرض كـ باقي/واصل بدلاً من سحب/ايداع)
const isSaleInstallmentTx = (tx: PartnerTransaction) =>
  tx.type_.startsWith("مقدمة") || tx.type_.startsWith("باقي") || tx.type_.startsWith("استلام") || !!tx.notes?.includes("موعد تسليم") || !!tx.notes?.includes("قسط");

const isSameCurrency = (tx: PartnerTransaction, currency: Currency) =>
  (tx.currency || "IQD") === currency;

const parseFinancierNotes = (notes: string | null) => {
  if (!notes) return { transferBy: "", commission: 0, commissionPercent: 0, originalNotes: "" };
  if (notes.startsWith("تم تسديد الممول")) {
    let commission = 0;
    let mainPart = notes;
    const commSplit = notes.split(" - عمولة:");
    if (commSplit.length > 1) {
      commission = Number(commSplit[commSplit.length - 1].trim()) || 0;
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
      commissionPercent: 0,
      originalNotes
    };
  }
  const transferByMatch = notes.match(/نقل بواسطة:\s*([^-]+)/);
  const commissionPercentMatch = notes.match(/عمولة:\s*([\d.]+)%/);
  const parts = notes.split(/-\s*عمولة:\s*[\d.]+%[^)]+\)\s*-?\s*/);
  const originalNotes = parts.length > 1 ? parts[1].trim() : "";
  return {
    transferBy: transferByMatch ? transferByMatch[1].trim() : "",
    commission: 0,
    commissionPercent: commissionPercentMatch ? Number(commissionPercentMatch[1]) : 1,
    originalNotes: originalNotes || (notes.startsWith("نقل بواسطة:") ? "" : notes)
  };
};

function splitAmountEvenly(total: number, parts: number) {
  if (parts <= 0) return [];
  const roundedTotal = Math.max(0, Math.round(total));
  const base = Math.floor(roundedTotal / parts);
  const remainder = roundedTotal - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    index === parts - 1 ? base + remainder : base,
  );
}

function addMonthsToDate(dateStr: string, monthsToAdd: number): string {
  if (monthsToAdd === 0) return dateStr;
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;

  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

  const totalMonths = year * 12 + (month - 1) + monthsToAdd;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;

  const maxDays = new Date(newYear, newMonth, 0).getDate();
  const newDay = Math.min(day, maxDays);

  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(newDay).padStart(2, "0")}`;
}


const ACCOUNTS_TABS: { id: "list" | "personal"; label: string }[] = [
  { id: "list", label: "حسابات العملاء" },
  { id: "personal", label: "الشركاء" },
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
}: PartnersTabProps) {
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [debtFilter, setDebtFilter] = useState<"all" | "we_owe" | "they_owe">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [accountsTab, setAccountsTab] = useState<"list" | "personal">("list");
  const [sharikListView, setSharikListView] = useState(true); // true = قائمة الشركاء، false = حساب شريك محدد
  const [sharikPage, setSharikPage] = useState(0);
  const [partnersSearch, setPartnersSearch] = useState("");
  const [partnersSearchHighlightIdx, setPartnersSearchHighlightIdx] = useState(0);
  const partnersSearchInputRef = useRef<HTMLInputElement>(null);
  const [partnerToView, setPartnerToView] = useState<Partner | null>(null);

  const fetchUnifiedAccounts = useCallback(async () => {
    if (kind !== "مطلوب") return;

    try {
      const data = await callTauri<UnifiedAccount[]>("get_unified_accounts");
      setUnifiedAccounts(data ?? []);
    } catch (err) {
      console.error("Failed to fetch unified accounts:", err);
    } finally {

    }
  }, [kind]);

  useEffect(() => {
    if (kind === "مطلوب") {
      void fetchUnifiedAccounts();
    }
  }, [kind, partners, fetchUnifiedAccounts]);

  // Cleanup sidebar actions on unmount
  useEffect(() => {
    return () => {
      onPartnerActionsChange?.(null);
    };
  }, [onPartnerActionsChange]);

  const [form, setForm] = useState(createEmptyForm(kind));
  const formRef = useRef(createEmptyForm(kind));
  const savingRef = useRef(false);
  const [partnersSort, setPartnersSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const handleSortPartners = (key: string) => {
    setPartnersSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const myPartners = useMemo(() => {
    let list = [];
    if (kind === "partners-financial") {
      // تبويب "حسابات العملاء" يعرض فقط: مستثمر، ممول، مقترض، شركة — بدون شريك
      list = partners.filter((p) => p.kind === "مستثمر" || p.kind === "ممول" || p.kind === "مقترض" || p.kind === "شركة");
    } else {
      list = partners.filter((p) => (p.kind || kind) === kind);
    }

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
        return (valA - valB) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [partners, kind, partnersSort]);

  // قائمة الشركاء (kind === "شريك") — تُعرض في تبويب "الشركاء" داخل partners-financial
  const sharikPartners = useMemo(() => {
    if (kind !== "partners-financial") return [];
    const list = partners.filter((p) => p.kind === "شريك");
    const { key, direction } = partnersSort;
    const sign = direction === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (key === "phone") return (a.phone || "").localeCompare(b.phone || "") * sign;
      if (key === "amount") {
        const valA = a.total_amount || 0;
        const valB = b.total_amount || 0;
        return (valA - valB) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [partners, kind, partnersSort]);

  const sharikTotalSame = useMemo(() => sharikPartners.reduce((sum, p) => sum + p.total_amount, 0), [sharikPartners]);

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
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [currencyTotals, setCurrencyTotals] = useState<[number, number]>([0, 0]);

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
    paymentType: "قاصه" as "قاصه" | "خارج القاصة" | "ماستر" | "مصرف" | "ممول",
    transferBy: "",
    commission: 0,
    commissionPercent: 1,
  });
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [transactionSort, setTransactionSort] = useState<{
    key: TransactionSortKey;
    direction: SortDirection;
  }>({ key: "date", direction: "asc" });
  const transactionListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTransactionsRef = useRef(false);










  const [accountsSort, setAccountsSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const handleSortAccounts = (key: string) => {
    setAccountsSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filteredAndSortedAccounts = useMemo(() => {
    if (kind !== "مطلوب") return [];
    let result = unifiedAccounts.filter((acc) => acc.kind === "مطلوب");

    if (search.trim()) {
      const cleanSearch = search.trim().toLowerCase();
      result = result.filter(
        (acc) =>
          acc.partner_name.toLowerCase().includes(cleanSearch) ||
          (acc.phone && acc.phone.includes(cleanSearch))
      );
    }

    if (debtFilter === "they_owe") {
      result = result.filter((acc) => acc.iqd_balance > 0 || acc.usd_balance > 0);
    } else if (debtFilter === "we_owe") {
      result = result.filter((acc) => acc.iqd_balance < 0 || acc.usd_balance < 0);
    }

    const { key, direction } = accountsSort;
    const sign = direction === "asc" ? 1 : -1;
    return result.sort((a, b) => {
      if (key === "phone") {
        return (a.phone || "").localeCompare(b.phone || "") * sign;
      }
      if (key === "iqd") {
        return (a.iqd_balance - b.iqd_balance) * sign;
      }
      if (key === "usd") {
        return (a.usd_balance - b.usd_balance) * sign;
      }
      return a.partner_name.localeCompare(b.partner_name, "ar") * sign;
    });
  }, [unifiedAccounts, search, debtFilter, kind, accountsSort]);

  useEffect(() => {
    const totalCount = kind === "مطلوب" ? filteredAndSortedAccounts.length : myPartners.length;
    const lastPage = Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [kind, search, debtFilter, filteredAndSortedAccounts.length, myPartners.length]);

  const totalPages = useMemo(() => {
    const totalCount = kind === "مطلوب" ? filteredAndSortedAccounts.length : myPartners.length;
    return Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  }, [kind, filteredAndSortedAccounts, myPartners]);

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
      if (acc.kind !== "مطلوب") continue;
      if (acc.iqd_balance > 0) {
        iqdTheyOwe += acc.iqd_balance;
      } else if (acc.iqd_balance < 0) {
        iqdWeOwe += Math.abs(acc.iqd_balance);
      }

      if (acc.usd_balance > 0) {
        usdTheyOwe += acc.usd_balance;
      } else if (acc.usd_balance < 0) {
        usdWeOwe += Math.abs(acc.usd_balance);
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
  }, [unifiedAccounts]);

  const currentBalanceDescription = useMemo(() => {
    if (kind !== "مطلوب") return "";

    const withdrawals = transactions.filter((t) => t.type_ === "سحب");
    const deposits = transactions.filter((t) => t.type_ === "ايداع");

    const withdrawalsIqd = withdrawals.filter((t) => t.currency !== "USD");
    const withdrawalsUsd = withdrawals.filter((t) => t.currency === "USD");
    const depositsIqd = deposits.filter((t) => t.currency !== "USD" && !t.notes?.includes("دفعة أولى") && !t.notes?.includes("قسط") && !t.notes?.includes("مؤجل"));
    const depositsUsd = deposits.filter((t) => t.currency === "USD" && !t.notes?.includes("دفعة أولى") && !t.notes?.includes("قسط") && !t.notes?.includes("مؤجل"));

    const hasInstallmentIqd = withdrawalsIqd.some(isInstallmentWithdrawal);
    const hasInstallmentUsd = withdrawalsUsd.some(isInstallmentWithdrawal);

    const totalDebtIqd = withdrawalsIqd.reduce((s, t) => s + t.amount, 0);
    const totalDebtUsd = withdrawalsUsd.reduce((s, t) => s + t.amount, 0);
    const totalPaidIqd = depositsIqd.reduce((s, t) => s + t.amount, 0);
    const totalPaidUsd = depositsUsd.reduce((s, t) => s + t.amount, 0);

    const remainingIqd = hasInstallmentIqd ? totalDebtIqd : totalDebtIqd - totalPaidIqd;
    const remainingUsd = hasInstallmentUsd ? totalDebtUsd : totalDebtUsd - totalPaidUsd;

    const descIqd = remainingIqd > 0
      ? `نطلبهم ${remainingIqd.toLocaleString()} IQ`
      : remainingIqd < 0
        ? `يطلبونا ${Math.abs(remainingIqd).toLocaleString()} IQ`
        : `خالص IQ`;

    const descUsd = remainingUsd > 0
      ? `نطلبهم ${remainingUsd.toLocaleString()} USD`
      : remainingUsd < 0
        ? `يطلبونا ${Math.abs(remainingUsd).toLocaleString()} USD`
        : `خالص USD`;

    return `${descIqd} | ${descUsd}`;
  }, [transactions, kind]);

  const [showTxModal, setShowTxModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<{ name: string; kind: string } | null>(null);

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
    setEditingTransactionId(null);
    setTransactionSort({ key: "date", direction: "asc" });
    if (!preserveType) {
      setTxForm({ type: "ايداع", amount: 0, date: todayIsoDate(), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 1 });
    }
    setTransactionsLoading(true);
    try {
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
        partnerName: partner.partner_name,
        kind: partner.kind,
      });
      setTransactions(txs ?? []);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const resetForm = () => {
    setEditingKey(null);
    setOriginalPartnerData(null);
    replaceForm(createEmptyForm(kind));
    setModalMode(null);
    setDeleteDialogOpen(false);
    setTransactions([]);
    setEditingTransactionId(null);
    setPartnerToView(null);
    setShowNewAccount(false);
    setAccountsTab("list");
    setSharikListView(true);
    onPartnerActionsChange?.(null);
  };

  const handleClose = async () => {
    if (modalMode === "view" && kind === "partners-financial") {
      const changed =
        form.name !== originalPartnerData?.name ||
        form.phone !== originalPartnerData?.phone ||
        form.kind !== originalPartnerData?.kind;
      if (changed) {
        setShowExitConfirm(true);
        return;
      }
      resetForm();
      return;
    }
    if (modalMode === "view") {
      await handleAutoSave();
    }
    resetForm();
  };

  const handleExitConfirmSave = async () => {
    setShowExitConfirm(false);
    if (modalMode === "view" && editingKey) {
      await handleAutoSave();
    }
    resetForm();
  };

  const handleExitConfirmDiscard = () => {
    setShowExitConfirm(false);
    resetForm();
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
        setPartnerToView({ partner_name: "", phone: "", kind: "شريك", total_amount: 0, total_withdrawals: 0 });
      } else {
        setAccountsTab("personal");
        setPartnerToView({ partner_name: "", phone: "", kind: formRef.current.kind, total_amount: 0, total_withdrawals: 0 });
      }
    }
  };

  // Register sidebar "Add Account" action
  useEffect(() => {
    if (kind === "partners-financial" && modalMode === null) {
      if (accountsTab === "list") {
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
        onAddAccountChange?.({
          action: () => {
            setEditingKey(null);
            setOriginalPartnerData(null);
            replaceForm({ name: "", phone: "", kind: "شريك" });
            setModalMode("new");
            setShowNewAccount(false);
          }
        });
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
    patchForm({ phone: cleaned });
  };

  const patchName = (value: string) => {
    patchForm({ name: englishKeyboardToArabic(value) });
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
      commissionPercent: 1,
    });
  };

  const ensurePartnerSaved = async () => {
    const currentForm = formRef.current;
    const nameClean = currentForm.name.trim();
    const phoneClean = toEnglishDigits(currentForm.phone.trim());
    if (!nameClean) {
      alert(kind === "مطلوب" || kind === "partners-financial" ? "الرجاء كتابة اسم الحساب" : `الرجاء كتابة اسم ${form.kind}`);
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
        if (kind === "مطلوب") void fetchUnifiedAccounts();
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
        if (kind === "مطلوب") void fetchUnifiedAccounts();
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
        if (kind === "مطلوب") void fetchUnifiedAccounts();
        return nameClean;
      } catch (err) {
        console.error("Failed to auto-add partner:", err);
        alert("تعذر حفظ الحساب.");
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
    resetTransactionForm("سحب");
    setShowTxModal(true);
  };

  const beginEditTransaction = (tx: PartnerTransaction) => {
    setEditingTransactionId(tx.id);
    const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
    const paymentType = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف" || rawPaymentType === "خارج القاصة") ? rawPaymentType : (rawPaymentType === "ممول" ? "ممول" : "قاصه");

    const isFinancierRepayment = form.kind === "ممول" && tx.type_.startsWith("سحب");
    const parsedNotes = isFinancierRepayment ? parseFinancierNotes(tx.notes) : null;

    const isPaidBorrowerInst = form.kind === "مقترض" && isInstallmentWithdrawal(tx) && paidTransactionIds.has(tx.id);
    const isWithdraw = (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) && !isPaidBorrowerInst;

    setTxForm({
      type: isWithdraw ? "سحب" : "ايداع",
      amount: tx.amount,
      date: tx.date?.split(" ")[0] || todayIsoDate(),
      notes: parsedNotes ? parsedNotes.originalNotes : (tx.notes ?? ""),
      installments: 1,
      paymentType,
      transferBy: parsedNotes ? parsedNotes.transferBy : "",
      commission: parsedNotes ? parsedNotes.commission : 0,
      commissionPercent: parsedNotes ? parsedNotes.commissionPercent : 1,
    });
    if (tx.currency === "USD" || tx.currency === "IQD") {
      setTxCurrency(tx.currency);
    }
    setShowTxModal(true);
  };

  const beginSettleInstallment = (tx: PartnerTransaction) => {
    beginEditTransaction(tx);
    let newNote = tx.notes || "";
    if (newNote.startsWith("باقي ")) {
      newNote = newNote.replace("باقي ", "تسديد ");
    } else {
      newNote = "تسديد " + newNote;
    }
    setTxForm(prev => ({ ...prev, type: "ايداع", notes: newNote }));
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
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * direction;
      }
      if (transactionSort.key === "type") {
        return a.type_.localeCompare(b.type_, "ar") * direction;
      }
      if (transactionSort.key === "amount") {
        return (a.amount - b.amount) * direction;
      }
      return (a.id - b.id) * direction;
    });
  }, [transactions, transactionSort]);

  const visibleSortedTransactions = useMemo(
    () =>
      sortedTransactions.filter(
        (tx) =>
          !(isInstallmentWithdrawal(tx) && tx.amount <= 0) &&
          !tx.type_.startsWith("تحويل") &&
          !(form.kind === "مقترض" && tx.type_ === "تسديد قسط سيارة")
      ),
    [sortedTransactions, form.kind],
  );

  const totalModalPages = Math.max(1, Math.ceil(visibleSortedTransactions.length / PAGE_SIZE));
  const currentModalPage = Math.min(modalPage, totalModalPages - 1);

  const pageTransactions = useMemo(() => {
    return visibleSortedTransactions.slice(currentModalPage * PAGE_SIZE, (currentModalPage + 1) * PAGE_SIZE);
  }, [visibleSortedTransactions, currentModalPage]);

  const sequenceByTransactionId = useMemo(() => {
    return new Map(visibleSortedTransactions.map((tx, index) => [tx.id, index + 1]));
  }, [visibleSortedTransactions]);

  const paidTransactionIds = useMemo(() => {
    if (form.kind !== "مقترض") return new Set<number>();
    // Payments that actually settle installments (exclude down payments)
    const payments = transactions.filter(isBorrowerInstallmentPayment);
    const totalPaid = payments.reduce((sum, t) => sum + t.amount, 0);
    const installments = transactions
      .filter(isInstallmentWithdrawal)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id);

    const paidIds = new Set<number>();
    let remaining = totalPaid;
    for (const inst of installments) {
      if (remaining >= inst.amount) {
        paidIds.add(inst.id);
        remaining -= inst.amount;
      } else {
        break;
      }
    }
    return paidIds;
  }, [transactions, form.kind]);

  const rebalanceInstallmentsAfterPayment = async (
    partnerName: string,
    paymentDelta: number,
    paymentDate: string,
    currency: Currency,
  ) => {
    const roundedDelta = Math.round(paymentDelta);
    if (roundedDelta === 0) return;

    const installmentRows = transactions
      .filter((tx) => isInstallmentWithdrawal(tx) && isSameCurrency(tx, currency))
      .sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        return dateDiff !== 0 ? dateDiff : a.id - b.id;
      });

    if (installmentRows.length === 0) return;

    const activeRows = installmentRows.filter((tx) => tx.amount > 0);
    if (activeRows.length === 0) return;

    const paymentTime = new Date(paymentDate).getTime();
    const target = activeRows.find((tx) => new Date(tx.date).getTime() >= paymentTime) ?? activeRows[0];
    const targetIndex = installmentRows.findIndex((tx) => tx.id === target.id);
    if (targetIndex < 0) return;

    const futureRows = installmentRows.slice(targetIndex + 1).filter((tx) => tx.amount > 0);

    if (form.kind === "مقترض") {
      const difference = target.amount - roundedDelta;
      if (difference === 0) return;

      if (futureRows.length === 0) {
        if (difference > 0) {
          const nextMonthDate = addMonthsToDate(target.date, 1);
          await callTauri("add_partner_transaction", {
            partnerName,
            kind: form.kind,
            type: "باقي قسط",
            amount: difference,
            date: nextMonthDate,
            notes: `متبقي قسط مؤجل - ${target.notes ?? ""}`,
            currency,
            paymentType: "خارج القاصة",
          });
        }
        return;
      }

      const futureTotal = futureRows.reduce((sum, tx) => sum + tx.amount, 0);
      const newRemaining = Math.max(0, futureTotal + difference);
      const distributedAmounts = splitAmountEvenly(newRemaining, futureRows.length);

      await Promise.all(
        futureRows.map((tx, index) => {
          const nextAmount = distributedAmounts[index] ?? 0;
          if (nextAmount <= 0) {
            return callTauri("delete_partner_transaction", {
              id: tx.id, partnerName, kind: form.kind,
            });
          }
          return callTauri("update_partner_transaction", {
            id: tx.id, partnerName, kind: form.kind,
            type: tx.type_,
            amount: nextAmount,
            date: tx.date, notes: tx.notes,
            currency,
            paymentType: tx.payment_type || tx.paymentType || "قاصه",
          });
        }),
      );
      return;
    }

    if (futureRows.length === 0) {
      const newAmount = Math.max(0, target.amount - roundedDelta);
      if (newAmount <= 0) {
        await callTauri("delete_partner_transaction", {
          id: target.id, partnerName, kind: form.kind,
        });
      } else {
        await callTauri("update_partner_transaction", {
          id: target.id,
          partnerName,
          kind: form.kind,
          type: target.type_,
          amount: newAmount,
          date: target.date,
          notes: target.notes,
          currency: target.currency,
          paymentType: target.paymentType || target.payment_type || "خارج القاصة",
        });
      }
      return;
    }

    const futureTotal = futureRows.reduce((sum, tx) => sum + tx.amount, 0);
    const originalTotal = target.amount + futureTotal;
    const newRemaining = Math.max(0, originalTotal - roundedDelta);
    const distributedAmounts = splitAmountEvenly(newRemaining, futureRows.length);

    await callTauri("delete_partner_transaction", {
      id: target.id, partnerName, kind: form.kind,
    });

    await Promise.all(
      futureRows.map((tx, index) => {
        const nextAmount = distributedAmounts[index] ?? 0;
        if (nextAmount <= 0) {
          return callTauri("delete_partner_transaction", {
            id: tx.id, partnerName, kind: form.kind,
          });
        }
        return callTauri("update_partner_transaction", {
          id: tx.id, partnerName, kind: form.kind,
          type: tx.type_,
          amount: nextAmount,
          date: tx.date, notes: tx.notes,
          currency,
          paymentType: tx.payment_type || tx.paymentType || "قاصه",
        });
      }),
    );
  };

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
    const partner = partners.find((p) => p.partner_name === pendingPartnerOpen);
    if (partner) {
      void openPersonalAccount(partner);
      onPendingPartnerOpened?.();
    }
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
      if (p.kind !== "شريك" && p.kind !== "مستثمر" && p.kind !== "ممول" && p.kind !== "مقترض" && p.kind !== "شركة") return false;
      return (
        p.partner_name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
      );
    });
  }, [partners, partnersSearch, kind]);

  const openPersonalAccount = useCallback(async (partner: Partner) => {
    setPartnerToView(partner);
    setAccountsTab("personal");
    setSharikListView(false);
    setPartnersSearch("");
    await loadPartner(partner);
    onPartnerActionsChange?.({
      onDeposit: openDepositForm,
      onWithdraw: openWithdrawForm,
      depositLabel: partner.kind === "مقترض" ? "واصل" : (partner.kind === "ممول" ? "استلام" : undefined),
      withdrawLabel: partner.kind === "مقترض" ? "باقي" : (partner.kind === "ممول" ? "تسديد" : undefined),
    });
  }, [onPartnerActionsChange]);

  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showExitConfirm) {
          setShowExitConfirm(false);
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
        if (kind === "partners-financial" && partnerToView && !sharikListView) {
          if (partnerToView.kind === "شريك") {
            setSharikListView(true);
            setPartnerToView(null);
            setEditingKey(null);
            setModalMode(null);
            setTransactions([]);
            onPartnerActionsChange?.(null);
            return;
          }
          // non-شريك: fall through to handleClose
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      // تمييز الحقل الفارغ بإطار أحمر ونقل التركيز إليه
      const nameInput = document.querySelector('.toolbar-field-input[placeholder="اسم صاحب الحساب"]') as HTMLElement
        || document.querySelector('.partner-identity-form input') as HTMLElement;
      if (nameInput) {
        nameInput.classList.add("input--error");
        nameInput.focus();
      }
      return;
    }

    setSaving(true);
    try {
      const nextName = form.name.trim();
      const phoneClean = toEnglishDigits(form.phone.trim());
      if (editingKey) {
        await callTauri("update_partner", {
          oldName: editingKey,
          oldKind: originalPartnerData?.kind || form.kind,
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: form.kind });
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, total_withdrawals: 0, kind: form.kind }, true);
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } else {
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        resetForm();
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      }
    } catch (err) {
      console.error(err);
      alert(`تعذر حفظ بيانات ${form.kind}.`);
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
    if (!editingKey) {
      const alreadyExists = partners.some(
        (p) => p.partner_name.trim() === nextName && p.kind === currentForm.kind
      );
      if (alreadyExists) {
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        if (kind === "partners-financial") {
          setPartnerToView({ partner_name: nextName, phone: phoneClean, kind: currentForm.kind, total_amount: 0, total_withdrawals: 0 });
        }
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
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
          setPartnerToView({ partner_name: nextName, phone: phoneClean, kind: currentForm.kind, total_amount: 0, total_withdrawals: 0 });
        }
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error("Auto save failed:", err);
      } finally {
        setSaving(false);
        savingRef.current = false;
      }
      return;
    }
    if (originalPartnerData && (nextName !== originalPartnerData.name || phoneClean !== originalPartnerData.phone || currentForm.kind !== originalPartnerData.kind)) {
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
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, total_withdrawals: 0, kind: currentForm.kind }, true);
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error(err);
        alert(`تعذر تحديث البيانات تلقائياً.`);
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
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
    } catch (err) {
      console.error(err);
      alert(`تعذر حذف ${form.kind}.`);
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
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
    } catch (err) {
      console.error(err);
      alert(`تعذر حذف ${partnerKind}.`);
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteTransaction = async () => {
    const tx = deleteTxConfirm;
    if (!tx) return;
    setDeleteTxConfirm(null);
    try {
      await callTauri("delete_partner_transaction", { id: tx.id, partnerName: tx.partner_name, kind: tx.kind });
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", { partnerName: tx.partner_name, kind: tx.kind });
      setTransactions(txs ?? []);
      if (editingTransactionId === tx.id) {
        setEditingTransactionId(null);
        setTxForm({ type: "ايداع" as TransactionType, amount: 0, date: todayIsoDate(), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 1 });
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(txForm.amount) || txForm.amount <= 0) {
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
      const originalEditingTransaction = editingTransactionId
        ? transactions.find((tx) => tx.id === editingTransactionId) ?? null
        : null;
      const installments = txForm.type === "سحب" && !editingTransactionId
        ? Math.max(1, Math.floor(Number(txForm.installments)) || 1)
        : 1;
      const periodAmount = Number.isFinite(txForm.amount) ? txForm.amount : 0;
      const installmentAmount = Math.floor(periodAmount / installments);
      const remainder = periodAmount - installmentAmount * installments;
      const isBorrowerInstallmentEdit =
        form.kind === "مقترض" &&
        !!editingTransactionId &&
        !!originalEditingTransaction &&
        isInstallmentWithdrawal(originalEditingTransaction);

      const convertsInstallmentToPayment =
        (kind === "مطلوب" || form.kind === "مقترض") &&
        txForm.type === "ايداع" &&
        !!editingTransactionId &&
        !!originalEditingTransaction &&
        isInstallmentWithdrawal(originalEditingTransaction);

      if (isBorrowerInstallmentEdit && originalEditingTransaction) {
        const wasAlreadyPaid = paidTransactionIds.has(originalEditingTransaction.id);
        const isWantsPaid = txForm.type === "ايداع";

        if (!wasAlreadyPaid && !isWantsPaid) {
          // Case A: Remains unpaid. Just update the original installment transaction.
          await callTauri("update_partner_transaction", {
            id: editingTransactionId,
            partnerName: editingKey,
            kind: form.kind,
            type: originalEditingTransaction.type_ || "باقي قسط",
            amount: periodAmount,
            date: dateStr,
            notes: txForm.notes || originalEditingTransaction.notes,
            currency: txCurrency,
            paymentType: originalEditingTransaction.payment_type || originalEditingTransaction.paymentType || "خارج القاصة",
          });
        } else if (!wasAlreadyPaid && isWantsPaid) {
          // Case B: Unpaid -> Paid. Create payment transactions and keep original installment.
          await callTauri("add_partner_transaction", {
            partnerName: editingKey,
            kind: form.kind,
            type: "تسديد قسط سيارة",
            amount: periodAmount,
            date: dateStr,
            notes: txForm.notes || `تسديد ${originalEditingTransaction.notes ?? "قسط"}`,
            currency: txCurrency,
            paymentType: "قاصه",
          });

          await callTauri("add_partner_transaction", {
            partnerName: editingKey,
            kind: form.kind,
            type: "تحويل قسط الى القاصة",
            amount: periodAmount,
            date: dateStr,
            notes: originalEditingTransaction.notes ?? "",
            currency: txCurrency,
            paymentType: "خارج القاصة",
          });

          await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);

          await callTauri("update_partner_transaction", {
            id: editingTransactionId,
            partnerName: editingKey,
            kind: form.kind,
            type: originalEditingTransaction.type_ || "باقي قسط",
            amount: periodAmount,
            date: dateStr,
            notes: txForm.notes || originalEditingTransaction.notes,
            currency: txCurrency,
            paymentType: originalEditingTransaction.payment_type || originalEditingTransaction.paymentType || "خارج القاصة",
          });
        } else if (wasAlreadyPaid && !isWantsPaid) {
          // Case C: Paid -> Unpaid. Delete matching payment transactions and keep original installment.
          const allTxs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
            partnerName: editingKey,
            kind: form.kind,
          });

          const paymentTx = allTxs.find(t =>
            t.type_ === "تسديد قسط سيارة" &&
            t.amount === originalEditingTransaction.amount &&
            (t.currency || "IQD") === (originalEditingTransaction.currency || "IQD")
          );

          if (paymentTx) {
            await callTauri("delete_partner_transaction", {
              id: paymentTx.id,
              partnerName: editingKey,
              kind: form.kind,
            });

            const transferTx = allTxs.find(t =>
              (t.type_ === "تحويل الى القاصة" || t.type_ === "تحويل باقي قسط الى القاصة" || t.type_ === "تحويل قسط الى القاصة") &&
              t.amount === originalEditingTransaction.amount &&
              (t.currency || "IQD") === (originalEditingTransaction.currency || "IQD") &&
              t.date === paymentTx.date
            );
            if (transferTx) {
              await callTauri("delete_partner_transaction", {
                id: transferTx.id,
                partnerName: editingKey,
                kind: form.kind,
              });
            }
          }

          await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);

          await callTauri("update_partner_transaction", {
            id: editingTransactionId,
            partnerName: editingKey,
            kind: form.kind,
            type: originalEditingTransaction.type_ || "باقي قسط",
            amount: periodAmount,
            date: dateStr,
            notes: txForm.notes || originalEditingTransaction.notes,
            currency: txCurrency,
            paymentType: originalEditingTransaction.payment_type || originalEditingTransaction.paymentType || "خارج القاصة",
          });
        } else if (wasAlreadyPaid && isWantsPaid) {
          // Case D: Remains paid, but edited. Update both original installment and matching payment transactions.
          const allTxs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
            partnerName: editingKey,
            kind: form.kind,
          });

          const paymentTx = allTxs.find(t =>
            t.type_ === "تسديد قسط سيارة" &&
            t.amount === originalEditingTransaction.amount &&
            (t.currency || "IQD") === (originalEditingTransaction.currency || "IQD")
          );

          if (paymentTx) {
            await callTauri("update_partner_transaction", {
              id: paymentTx.id,
              partnerName: editingKey,
              kind: form.kind,
              type: "تسديد قسط سيارة",
              amount: periodAmount,
              date: dateStr,
              notes: txForm.notes || paymentTx.notes,
              currency: txCurrency,
              paymentType: "قاصه",
            });

            const transferTx = allTxs.find(t =>
              (t.type_ === "تحويل الى القاصة" || t.type_ === "تحويل باقي قسط الى القاصة" || t.type_ === "تحويل قسط الى القاصة") &&
              t.amount === originalEditingTransaction.amount &&
              (t.currency || "IQD") === (originalEditingTransaction.currency || "IQD") &&
              t.date === paymentTx.date
            );
            if (transferTx) {
              await callTauri("update_partner_transaction", {
                id: transferTx.id,
                partnerName: editingKey,
                kind: form.kind,
                type: "تحويل قسط الى القاصة",
                amount: periodAmount,
                date: dateStr,
                notes: txForm.notes || originalEditingTransaction.notes || "تحويل قسط الى القاصة",
                currency: txCurrency,
                paymentType: "خارج القاصة",
              });
            }
          }

          await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);

          await callTauri("update_partner_transaction", {
            id: editingTransactionId,
            partnerName: editingKey,
            kind: form.kind,
            type: originalEditingTransaction.type_ || "باقي قسط",
            amount: periodAmount,
            date: dateStr,
            notes: txForm.notes || originalEditingTransaction.notes,
            currency: txCurrency,
            paymentType: originalEditingTransaction.payment_type || originalEditingTransaction.paymentType || "خارج القاصة",
          });
        }
      } else if (convertsInstallmentToPayment) {
        await callTauri("add_partner_transaction", {
          partnerName: editingKey,
          kind: form.kind,
          type: "تسديد قسط سيارة",
          amount: periodAmount,
          date: dateStr,
          notes: txForm.notes || `تسديد ${originalEditingTransaction.notes ?? "قسط"}`,
          currency: txCurrency,
          paymentType: "قاصه",
        });

        // إدخال قيد التحويل في خارج القاصة
        await callTauri("add_partner_transaction", {
          partnerName: editingKey,
          kind: form.kind,
          type: "تحويل قسط الى القاصة",
          amount: periodAmount,
          date: dateStr,
          notes: originalEditingTransaction.notes ?? "تحويل قسط الى القاصة",
          currency: txCurrency,
          paymentType: "خارج القاصة",
        });

        if (form.kind !== "مقترض") {
          await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
        }
      } else {
        for (let i = 0; i < installments; i++) {
          const [yStr, mStr, dStr] = dateStr.split("-");
          const year = parseInt(yStr, 10);
          const month = parseInt(mStr, 10) - 1;
          const day = parseInt(dStr, 10);
          const date = new Date(year, month + i, day);
          const dateStr_i = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          const amount = i === installments - 1 ? installmentAmount + remainder : installmentAmount;
          const monthNote = (() => {
            if (form.kind === "ممول" && txForm.type === "سحب") {
              const pct = txForm.commissionPercent || 0;
              const commissionVal = (amount * pct) / 100;
              const formattedTotal = txCurrency === "USD"
                ? `$${(amount + commissionVal).toLocaleString("en-US")}`
                : `${(amount + commissionVal).toLocaleString("en-US")} د.ع`;
              return `تم تسديد الممول ${form.name} بـ ${formattedTotal} ارسل اليه بواسطة ${txForm.transferBy || "—"}${txForm.notes ? ` - ${txForm.notes}` : ""} - عمولة: ${pct}%`;
            }
            return installments > 1
              ? `قسط ${i + 1}/${installments}${txForm.notes ? ` - ${txForm.notes}` : ""}`
              : (txForm.notes || null);
          })();

          const transactionPayload = {
            partnerName: editingKey,
            kind: form.kind,
            type: (form.kind === "مقترض" && txForm.type === "ايداع") ? "تسديد قسط سيارة" : txForm.type,
            amount,
            date: dateStr_i,
            notes: monthNote,
            currency: txCurrency,
            paymentType: (form.kind === "ممول" && txForm.type === "ايداع") ? "ممول" : txForm.paymentType,
          };

          if (editingTransactionId) {
            await callTauri("update_partner_transaction", {
              id: editingTransactionId,
              ...transactionPayload,
            });
          } else {
            await callTauri("add_partner_transaction", transactionPayload);
          }
        }

        if (kind === "مطلوب" && txForm.type === "ايداع") {
          const originalCurrency = originalEditingTransaction?.currency === "USD" ? "USD" : "IQD";
          const originalAmount = originalEditingTransaction?.type_ === "ايداع" || originalEditingTransaction?.type_ === "استلام قسط" || originalEditingTransaction?.type_ === "تسديد قسط سيارة"
            ? originalEditingTransaction.amount
            : 0;
          if (!editingTransactionId) {
            await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
          } else if (originalEditingTransaction?.type_ === "ايداع" || originalEditingTransaction?.type_ === "استلام قسط" || originalEditingTransaction?.type_ === "تسديد قسط سيارة") {
            if (originalCurrency === txCurrency) {
              await rebalanceInstallmentsAfterPayment(
                editingKey,
                periodAmount - originalAmount,
                dateStr,
                txCurrency,
              );
            } else {
              await rebalanceInstallmentsAfterPayment(
                editingKey,
                -originalAmount,
                originalEditingTransaction.date?.split(" ")[0] || dateStr,
                originalCurrency,
              );
              await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
            }
          }
        }
      }

      resetTransactionForm(txForm.type);
      shouldScrollTransactionsRef.current = !editingTransactionId;
      await loadPartner({ partner_name: editingKey, phone: form.phone, total_amount: 0, total_withdrawals: 0, kind: form.kind }, true);
      await onRefresh();
      if (kind === "مطلوب") { void fetchUnifiedAccounts(); }
      setShowTxModal(false);
    } catch (err) {
      console.error(err);
      alert("تعذر إضافة المعاملة.");
    } finally {
      setSaving(false);
    }
  };

  const totalDeposits = transactions
    .filter((t) => t.type_.startsWith("ايداع") || t.type_.startsWith("إيداع") || t.type_.startsWith("مقدمة") || t.type_.startsWith("استلام") || t.type_.startsWith("إستلام") || t.type_.startsWith("تسديد") || t.type_.startsWith("إعادة استثمار") || t.type_.startsWith("تسوية"))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type_.startsWith("سحب") || t.type_.startsWith("باقي"))
    .reduce((sum, t) => sum + t.amount, 0);

  const partnerIqdBalance = accountsTab === "personal" && partnerToView
    ? form.kind === "مقترض"
      // مقترض: اعرض فقط المتبقي (إجمالي الأقساط بدون خصم الواصل)
      ? transactions.filter((t) => (t.currency || "IQD") === "IQD" && (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && !t.type_.startsWith("تحويل")).reduce((s, t) => s + t.amount, 0)
      : transactions.filter((t) => (t.type_.startsWith("ايداع") || t.type_.startsWith("إيداع") || t.type_.startsWith("مقدمة") || t.type_.startsWith("استلام") || t.type_.startsWith("إستلام") || t.type_.startsWith("إعادة استثمار") || t.type_.startsWith("تسوية")) && (t.currency || "IQD") === "IQD" && !t.type_.startsWith("تحويل")).reduce((s, t) => s + t.amount, 0)
      - transactions.filter((t) => (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && (t.currency || "IQD") === "IQD" && !t.type_.startsWith("تحويل")).reduce((s, t) => s + t.amount, 0)
    : currencyTotals[0];

  const partnerUsdBalance = accountsTab === "personal" && partnerToView
    ? form.kind === "مقترض"
      // مقترض: اعرض فقط المتبقي (إجمالي الأقساط بالدولار بدون خصم الواصل)
      ? transactions.filter((t) => t.currency === "USD" && (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && !t.type_.startsWith("تحويل")).reduce((s, t) => s + t.amount, 0)
      : transactions.filter((t) => (t.type_.startsWith("ايداع") || t.type_.startsWith("إيداع") || t.type_.startsWith("مقدمة") || t.type_.startsWith("استلام") || t.type_.startsWith("إستلام") || t.type_.startsWith("إعادة استثمار") || t.type_.startsWith("تسوية")) && t.currency === "USD" && !t.type_.startsWith("تحويل")).reduce((s, t) => s + t.amount, 0)
      - transactions.filter((t) => (t.type_.startsWith("سحب") || t.type_.startsWith("باقي")) && t.currency === "USD" && !t.type_.startsWith("تحويل")).reduce((s, t) => s + t.amount, 0)
    : currencyTotals[1];

  const hasInstallmentSchedule = transactions.some(isInstallmentWithdrawal);
  const displayTotalDebt = form.kind === "مقترض"
    ? totalWithdrawals
    : (hasInstallmentSchedule
      ? totalWithdrawals + totalDeposits
      : totalWithdrawals);
  const displayRemainingDebt = form.kind === "مقترض"
    ? Math.max(0, totalWithdrawals - totalDeposits)
    : (hasInstallmentSchedule
      ? totalWithdrawals
      : Math.max(0, totalWithdrawals - totalDeposits));


  return (
    <div className="customers-page">
      {/* ── لوحة الإحصائيات العلوية لكشف الحساب الموحد ── */}
      {kind === "مطلوب" && (
        <div className="car-dashboard__grid car-dashboard__grid--3col" style={{ marginBottom: "1.5rem", gap: "1.2rem", minHeight: "auto" }}>
          {/* Card 1: نطلبهم */}
          <div className="stat-card" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0",
            padding: "1.5rem 2rem",
            position: "relative",
            background: "linear-gradient(145deg, rgba(212,175,55,0.22), rgba(255,215,0,0.10), rgba(180,140,30,0.18))",
            border: "1.5px solid rgba(212,175,55,0.45)",
            boxShadow: "0 0 32px rgba(212,175,55,0.18), 0 4px 24px rgba(212,175,55,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}>
            <h3 className="stat-label" style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "var(--gold)",
              textShadow: "0 0 12px rgba(212,175,55,0.5)"
            }}>نطلبهم</h3>
            <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
              <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(212,175,55,0.35)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
              <circle cx="82" cy="34" r="2" fill="rgba(212,175,55,0.7)" />
            </svg>
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,215,0,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "var(--gold)",
                border: "1px solid rgba(212,175,55,0.4)",
                boxShadow: "0 0 20px rgba(212,175,55,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(212,175,55,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
                <PriceDisplay amount={stats.iqdTheyOwe} />
              </div>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(212,175,55,0.28), rgba(255,215,0,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "var(--gold)",
                border: "1px solid rgba(212,175,55,0.4)",
                boxShadow: "0 0 20px rgba(212,175,55,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(212,175,55,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdTheyOwe} currency="USD" />
              </div>
            </div>
          </div>

          {/* Card 2: يطلبونا */}
          <div className="stat-card" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0",
            padding: "1.5rem 2rem",
            position: "relative",
            background: "linear-gradient(145deg, rgba(239,68,68,0.22), rgba(248,113,113,0.10), rgba(185,28,28,0.18))",
            border: "1.5px solid rgba(239,68,68,0.45)",
            boxShadow: "0 0 32px rgba(239,68,68,0.18), 0 4px 24px rgba(239,68,68,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}>
            <h3 className="stat-label" style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "var(--red-600)",
              textShadow: "0 0 12px rgba(239,68,68,0.5)"
            }}>يطلبونا</h3>
            <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
              <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(239,68,68,0.35)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
              <circle cx="82" cy="34" r="2" fill="rgba(248,113,113,0.7)" />
            </svg>
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(239,68,68,0.28), rgba(248,113,113,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "var(--red-600)",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 20px rgba(239,68,68,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(248,113,113,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
                <PriceDisplay amount={stats.iqdWeOwe} />
              </div>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(239,68,68,0.28), rgba(248,113,113,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "var(--red-600)",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 20px rgba(239,68,68,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(248,113,113,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdWeOwe} currency="USD" />
              </div>
            </div>
          </div>

          {/* Card 3: الكاش */}
          <div className="stat-card" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0",
            padding: "1.5rem 2rem",
            position: "relative",
            background: "linear-gradient(145deg, rgba(34,197,94,0.20), rgba(74,222,128,0.10), rgba(22,163,74,0.16))",
            border: "1.5px solid rgba(34,197,94,0.45)",
            boxShadow: "0 0 32px rgba(34,197,94,0.18), 0 4px 24px rgba(34,197,94,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}>
            <h3 className="stat-label" style={{
              fontSize: "var(--fs-md)",
              fontWeight: "var(--fw-bold)",
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "var(--green)",
              textShadow: "0 0 12px rgba(34,197,94,0.5)"
            }}>الكاش</h3>
            <svg viewBox="0 0 100 36" style={{ width: "180px", height: "36px", margin: "4px 0 6px 0" }}>
              <path d="M 50 0 L 50 12 Q 50 17, 25 17 L 18 34 M 50 12 Q 50 17, 75 17 L 82 34"
                stroke="rgba(34,197,94,0.35)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="34" r="2" fill="rgba(216,168,90,0.5)" />
              <circle cx="82" cy="34" r="2" fill="rgba(74,222,128,0.7)" />
            </svg>
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(74,222,128,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "var(--green)",
                border: "1px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 20px rgba(34,197,94,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(74,222,128,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
                <PriceDisplay amount={stats.iqdNet} />
              </div>
              <div style={{
                flex: "1 1 0",
                background: "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(74,222,128,0.12))",
                borderRadius: "12px",
                padding: "0.75rem 1rem",
                minWidth: "0",
                direction: "ltr",
                textAlign: "center",
                fontWeight: "var(--fw-extrabold)",
                fontSize: "var(--fs-lg)",
                color: "var(--green)",
                border: "1px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 20px rgba(34,197,94,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "var(--fw-normal)", color: "rgba(74,222,128,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdNet} currency="USD" />
              </div>
            </div>
          </div>
        </div>
      )}

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
                          form.kind !== originalPartnerData?.kind;
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

                  <div className="toolbar-field-group">
                    <input
                      value={form.name}
                      onChange={(e) => patchName(e.target.value)}
                      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                      onBlur={() => void handleAutoSave()}
                      placeholder="اسم صاحب الحساب"
                      className="toolbar-field-input w-[250px] min-w-[250px]"
                    />
                  </div>
                  <div className="toolbar-field-group">
                    <input
                      value={form.phone || ""}
                      onChange={(e) => patchPhone(e.target.value)}
                      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                      onBlur={() => void handleAutoSave()}
                      placeholder="رقم الهاتف"
                      className="toolbar-field-input w-[180px] min-w-[180px]"
                      dir="ltr"
                    />
                  </div>
                  <div className="toolbar-field-group min-w-[220px]">
                    <SearchableCombobox
                      value={form.kind}
                      onChange={(val) => {
                        patchForm({ kind: val });
                        void handleAutoSave();
                      }}
                      placeholder="نوع الحساب"
                      options={[
                        { label: "شريك", value: "شريك", kind: "شريك" },
                        { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                        { label: "ممول", value: "ممول", kind: "ممول" },
                        { label: "مقترض", value: "مقترض", kind: "مقترض" },
                        { label: "شركة", value: "شركة", kind: "شركة" },
                      ]}
                    />
                  </div>
                </div>
              ) : (
                ACCOUNTS_TABS.map((tab) => {
                  const isActive = accountsTab === tab.id;
                  const isPersonalActive = tab.id === "personal" && accountsTab === "personal";

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`${tab.id === "list" ? "top-btn-one" : "top-btn-two"} ${isActive || isPersonalActive ? (tab.id === "list" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                      onClick={() => {
                        if (tab.id === "list") {
                          resetForm();
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
                })
              )}
            </div>
            <div className="unified-toolbar__center">
            </div>
            <div className="unified-toolbar__left">
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={partnerUsdBalance} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={partnerIqdBalance} />
              </div>
            </div>
          </>
        ) : kind === "مطلوب" ? (
          <>
            <div className="unified-toolbar__right">
              <ActionButton type="button" variant="primary" className="btn-new-car" onClick={startNew} style={{ whiteSpace: "nowrap" }}>
                + إضافة حساب
              </ActionButton>

              <div className="flex items-center gap-1 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-xl p-1" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all select-none border border-transparent whitespace-nowrap",
                    debtFilter === "all"
                      ? "bg-white/15 text-white border-white/10 shadow-sm shadow-black/20"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                  onClick={() => setDebtFilter("all")}
                >
                  الكل
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all select-none border border-transparent whitespace-nowrap",
                    debtFilter === "they_owe"
                      ? "bg-gradient-to-br from-[var(--green-bg)] to-[var(--green)]/10 text-[var(--green)] border-[var(--green-bd)] shadow-sm shadow-[var(--green)]/10"
                      : "text-white/60 hover:text-[var(--green)] hover:bg-[var(--green)]/5"
                  )}
                  onClick={() => setDebtFilter("they_owe")}
                >
                  نطلبهم
                </button>
                <button
                  type="button"
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all select-none border border-transparent whitespace-nowrap",
                    debtFilter === "we_owe"
                      ? "bg-gradient-to-br from-[var(--red-bg)] to-[var(--red-600)]/10 text-[var(--red-600)] border-[var(--red-bd)] shadow-sm shadow-[var(--red-600)]/10"
                      : "text-white/60 hover:text-[var(--red-600)] hover:bg-[var(--red-600)]/5"
                  )}
                  onClick={() => setDebtFilter("we_owe")}
                >
                  يطلبونا
                </button>
              </div>
            </div>
            <div className="unified-toolbar__center">
              <TextInput
                type="search"
                placeholder="بحث بالاسم أو رقم الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leadingIcon={Search}
                inputSize="sm"
                containerClassName="w-full max-w-[420px]"
              />
            </div>
            <div className="unified-toolbar__left"></div>
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
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={currencyTotals[1]} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={currencyTotals[0]} />
              </div>
            </div>
          </>
        )}
      </div>

      {kind === "partners-financial" && accountsTab === "list" ? (
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
                    <th className={partnersSort.key === "kind" ? "th--sorted" : ""} onClick={() => handleSortPartners("kind")} style={{ cursor: "pointer" }}>النوع</th>
                    <th className={`col-name ${partnersSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagePartners.map((partner, idx) => {
                    const pKind = partner.kind || "شريك";
                    return (
                      <tr
                        key={`${partner.partner_name}_${partner.kind}`}
                        className={`customers-tr partner-row--${pKind}`}
                        onClick={() => openPersonalAccount(partner)}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td>
                          <span className={`badge badge--kind-${pKind}`}>
                            {pKind}
                          </span>
                        </td>
                        <td className="col-name cell-bold">{partner.partner_name}</td>
                        <td className="col-phone">{partner.phone || "—"}</td>
                        <td className="col-money cell-bold">
                          {pKind === "ممول" ? (
                            partner.total_amount > 0 ? (
                              <span className="text-green">
                                <PriceDisplay amount={partner.total_amount} noColor />
                              </span>
                            ) : partner.total_amount < 0 ? (
                              <span className="text-red">
                                <PriceDisplay amount={Math.abs(partner.total_amount)} noColor />
                              </span>
                            ) : (
                              <span style={{ color: "rgba(255,255,255,0.4)" }}>0IQ</span>
                            )
                          ) : pKind === "مقترض" ? (
                            partner.total_amount !== 0 ? (
                              <span className={partner.total_amount > 0 ? "text-green" : "text-red"}>
                                <PriceDisplay amount={Math.abs(partner.total_amount)} noColor />
                              </span>
                            ) : (
                              <span style={{ color: "rgba(255,255,255,0.4)" }}>0IQ</span>
                            )
                          ) : (
                            <span className={partner.total_amount >= 0 ? "text-green" : "text-red"}>
                              <PriceDisplay amount={partner.total_amount} noColor />
                            </span>
                          )}
                        </td>
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
                      <td colSpan={6} className="empty-cell">
                        لا توجد حسابات بعد
                      </td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pagePartners.length) }).map((_, i) => (
                    <tr key={`empty-part-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
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
                    <th className={`col-name ${partnersSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className="col-ratio">نسبة الشراكة</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sharikPartners.slice(sharikPage * PAGE_SIZE, (sharikPage + 1) * PAGE_SIZE).map((partner, idx) => {
                    const ratio = sharikTotalSame > 0 ? (partner.total_amount / sharikTotalSame) * 100 : 0;
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
                          <span className={partner.total_amount >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={partner.total_amount} noColor />
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
                              setPartnerToDelete({ name: partner.partner_name, kind: "شريك" });
                              setShowDeleteModal(true);
                            }}
                          >
                            ✕
                          </button>
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
                      const isPaidBorrowerInst = form.kind === "مقترض" && isInstallmentWithdrawal(tx) && paidTransactionIds.has(tx.id);
                      const isWithdraw = (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) && !isPaidBorrowerInst;
                      const isDeposit = tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || tx.type_.startsWith("إعادة استثمار") || tx.type_.startsWith("تسوية") || isPaidBorrowerInst;
                      return (
                        <tr
                          key={tx.id}
                          className={`partner-tx-row ${form.kind === "ممول"
                            ? (isWithdraw ? "partner-tx-row--withdraw" : "partner-tx-row--deposit")
                            : (isDeposit ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                            }`}
                          title="اضغط لتعديل المعاملة"
                          onClick={() => beginEditTransaction(tx)}
                        >
                          <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                          <td className="col-date">{tx.date}</td>
                          <td className="col-time">{tx.time || "00:00"}</td>
                          <td className="col-type">
                            <span className={form.kind === "ممول" ? (isWithdraw ? "text-red font-bold" : "text-green font-bold") : (isWithdraw ? "tx-type-withdraw" : "tx-type-deposit")}>
                              {form.kind === "ممول" ? (isWithdraw ? "تسديد تمويل" : "استلام تمويل") : form.kind === "مقترض" ? (isWithdraw ? "باقي" : "واصل") : isSaleInstallmentTx(tx) ? (isWithdraw ? "باقي" : "واصل") : tx.type_}
                            </span>
                          </td>
                          <td className={cn(
                            "col-amount font-bold",
                            form.kind === "مقترض" ? "text-green" : isSaleInstallmentTx(tx) ? "text-green" : form.kind === "ممول" ? (isWithdraw ? "text-red" : "text-green") : (isWithdraw ? "text-red" : "text-green")
                          )}>
                            <PriceDisplay
                              amount={form.kind === "مقترض" ? tx.amount : isSaleInstallmentTx(tx) ? tx.amount : (isWithdraw ? -tx.amount : tx.amount)}
                              currency={tx.currency}
                              noColor
                            />
                          </td>
                          <td className="text-muted col-notes">
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span>
                                {tx.notes
                                  ? tx.notes.includes(" - عمولة:")
                                    ? tx.notes.split(" - عمولة:")[0]
                                    : tx.notes
                                  : "—"}
                              </span>

                            </div>
                          </td>
                          <td className="col-actions">
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
      ) : kind === "مطلوب" ? (
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
              <table className="data-table partners-data-table partners-data-table--debtors">
                <thead>
                  <tr>
                    <th className="cell-num" style={{ width: "35px" }}>ت</th>
                    <th className={`col-name ${accountsSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${accountsSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${accountsSort.key === "iqd" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("iqd")} style={{ cursor: "pointer" }}>الرصيد بالدينار</th>
                    <th className={`col-money ${accountsSort.key === "usd" ? "th--sorted" : ""}`} onClick={() => handleSortAccounts("usd")} style={{ cursor: "pointer" }}>الرصيد بالدولار</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pageAccounts.map((account, idx) => {
                    const renderBalanceCell = (amount: number, isUsd: boolean) => {
                      if (amount > 0) {
                        return (
                          <span className="text-green font-bold" style={{ direction: "ltr", display: "inline-block" }}>
                            + <PriceDisplay amount={amount} currency={isUsd ? "USD" : "IQD"} noColor />
                          </span>
                        );
                      } else if (amount < 0) {
                        return (
                          <span className="text-red font-bold" style={{ direction: "ltr", display: "inline-block" }}>
                            - <PriceDisplay amount={Math.abs(amount)} currency={isUsd ? "USD" : "IQD"} noColor />
                          </span>
                        );
                      } else {
                        return <span style={{ color: "var(--text-muted)" }}>-</span>;
                      }
                    };
                    return (
                      <tr
                        key={`${account.partner_name}_${account.kind}`}
                        className="customers-tr"
                        onClick={() => loadPartner({ partner_name: account.partner_name, phone: account.phone || "", total_amount: 0, total_withdrawals: 0, kind: "مطلوب" })}
                        title="اضغط لعرض التفاصيل"
                      >
                        <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                        <td className="col-name cell-bold">{account.partner_name}</td>
                        <td className="col-phone">{account.phone || "—"}</td>
                        <td className="col-money">{renderBalanceCell(account.iqd_balance, false)}</td>
                        <td className="col-money">{renderBalanceCell(account.usd_balance, true)}</td>
                        <td className="col-delete">
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            title="حذف"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPartnerToDelete({ name: account.partner_name, kind: "مطلوب" });
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
                      <td colSpan={6} className="empty-cell">لا توجد حسابات مطابقة للبحث أو التصفية</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pageAccounts.length) }).map((_, i) => (
                    <tr key={`empty-acc-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td className="col-name">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
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
      ) : kind !== "مطلوب" && kind !== "partners-financial" ? (
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
                    <th className={partnersSort.key === "kind" ? "th--sorted" : ""} onClick={() => handleSortPartners("kind")} style={{ cursor: "pointer" }}>النوع</th>
                    <th className={`col-name ${partnersSort.key === "name" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("name")} style={{ cursor: "pointer" }}>الاسم</th>
                    <th className={`col-phone ${partnersSort.key === "phone" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("phone")} style={{ cursor: "pointer" }}>رقم الهاتف</th>
                    <th className={`col-money ${partnersSort.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("amount")} style={{ cursor: "pointer" }}>المبلغ</th>
                    <th className={`col-ratio ${partnersSort.key === "ratio" ? "th--sorted" : ""}`} onClick={() => handleSortPartners("ratio")} style={{ cursor: "pointer" }}>نسبة الشراكة</th>
                    <th className="col-delete" style={{ width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagePartners.map((partner, idx) => {
                    const pKind = partner.kind || kind;
                    const sameKind = myPartners.filter((p) => (p.kind || kind) === pKind);
                    const totalSameKind = sameKind.reduce((sum, p) => sum + p.total_amount, 0);
                    const ratio = totalSameKind > 0 ? (partner.total_amount / totalSameKind) * 100 : 0;
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
                          <span className={partner.total_amount >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={partner.total_amount} noColor />
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
                <label className="label" htmlFor="partner-name-new">
                  اسم {kind}
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
                  onInput={(e: React.FormEvent<HTMLInputElement>) => patchPhone((e.target as HTMLInputElement).value)}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchPhone(e.target.value)}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchPhone(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", paddingBottom: "2px" }}>
                <GoldFxButton type="submit" variant="green" style={{ flex: 1, margin: 0 }} disabled={saving}>
                  <span className="gold-fx-btn__label">{saving ? "جاري الحفظ..." : `حفظ ${kind}`}</span>
                </GoldFxButton>
                <GoldFxButton type="button" variant="gray" style={{ flex: 1, margin: 0 }} onClick={resetForm}>
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
            className={`modal-dialog ${modalMode === "view" ? "modal-dialog--partner modal-dialog--wide" : "modal-dialog--slim modal-dialog--overflow-visible"
              } modal-dialog--kind-${form.kind}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`customer-form-panel ${modalMode === "view" ? "partner-form-panel" : "partner-form-panel--slim"}`}>
              {modalMode === "view" && (
                <div className="partner-summary-sidebar">
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">👤 الاسم</span>
                    <input
                      type="text"
                      className="partner-sidebar-input"
                      value={form.name}
                      onInput={(e) => patchName((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchName(e.target.value)}
                      onFocus={(e) => setTimeout(() => (e.target as HTMLInputElement).select(), 0)}
                      onBlur={() => void handleAutoSave()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">📞 رقم الهاتف</span>
                    <input
                      type="text"
                      className="partner-sidebar-input"
                      dir="ltr"
                      value={form.phone}
                      onInput={(e) => patchPhone((e.target as HTMLInputElement).value)}
                      onChange={(e) => patchPhone(e.target.value)}
                      onFocus={(e) => setTimeout(() => (e.target as HTMLInputElement).select(), 0)}
                      onBlur={() => void handleAutoSave()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
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
                          void handleAutoSave();
                        }}
                        placeholder="نوع الحساب"
                        options={[
                          { label: "شريك", value: "شريك", kind: "شريك" },
                          { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                          { label: "ممول", value: "ممول", kind: "ممول" },
                          { label: "مقترض", value: "مقترض", kind: "مقترض" },
                          { label: "شركة", value: "شركة", kind: "شركة" },
                        ]}
                      />
                    </div>
                  )}
                  {(kind === "مطلوب") ? (
                    <>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">📊 المبلغ الكلي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--total">
                          <PriceDisplay amount={displayTotalDebt} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">🟢 تم تسديد</span>
                        <span className="partner-summary-field__value partner-summary-field__value--paid">
                          <PriceDisplay amount={totalDeposits} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">🔴 المتبقي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--remaining">
                          <PriceDisplay amount={displayRemainingDebt} />
                        </span>
                      </div>

                    </>
                  ) : form.kind === "مقترض" ? (
                    <>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">📊 المجموع الكلي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--total">
                          <PriceDisplay amount={totalWithdrawals} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "var(--green)" }}>واصل</span>
                        <span className="partner-summary-field__value" style={{ color: "var(--green)" }}>
                          <PriceDisplay amount={totalDeposits} noColor />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "var(--red-600)" }}>باقي</span>
                        <span className="partner-summary-field__value" style={{ color: "var(--red-600)" }}>
                          <PriceDisplay amount={Math.max(0, totalWithdrawals - totalDeposits)} noColor />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 صافي المبلغ</span>
                      <span className="partner-summary-field__value">
                        {form.kind === "ممول" ? (
                          (totalDeposits - totalWithdrawals) > 0 ? (
                            <span className="text-green">
                              <PriceDisplay amount={totalDeposits - totalWithdrawals} noColor />
                            </span>
                          ) : (totalDeposits - totalWithdrawals) < 0 ? (
                            <span className="text-red">
                              <PriceDisplay amount={Math.abs(totalDeposits - totalWithdrawals)} noColor />
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>0IQ</span>
                          )
                        ) : (
                          <span className={(totalDeposits - totalWithdrawals) >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={totalDeposits - totalWithdrawals} noColor />
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
                      : `سجل حركات الحساب ${form.name} ${kind === "مطلوب" && currentBalanceDescription ? `(${currentBalanceDescription})` : ""}`}
                  </h3>
                </div>

                {modalMode !== "view" && (
                  <form className="form customer-form partner-identity-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                      <label className="label" htmlFor="partner-name">
                        اسم {kind === "partners-financial" ? "الحساب" : kind}
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
                            { label: "شريك", value: "شريك", kind: "شريك" },
                            { label: "مستثمر", value: "مستثمر", kind: "مستثمر" },
                            { label: "ممول", value: "ممول", kind: "ممول" },
                            { label: "مقترض", value: "مقترض", kind: "مقترض" },
                            { label: "شركة", value: "شركة", kind: "شركة" },
                          ]}
                        />
                      </div>
                    )}
                    <div className="car-form-panel__actions">
                      <ActionButton type="submit" variant="success" disabled={saving}>
                        {saving ? "جاري الحفظ..." : kind === "partners-financial" ? "حفظ الحساب" : `حفظ ${kind}`}
                      </ActionButton>
                      <ActionButton type="button" variant="ghost" onClick={resetForm}>
                        إلغاء
                      </ActionButton>
                    </div>
                  </form>
                )}

                {modalMode === "view" && (
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
                                    const paymentTypeLabel = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف" || rawPaymentType === "خارج القاصة") ? rawPaymentType : "قاصه";
                                    const badgeClass = paymentTypeLabel === "ماستر" ? "account-badge--master" : paymentTypeLabel === "مصرف" ? "account-badge--bank" : paymentTypeLabel === "خارج القاصة" ? "account-badge--external" : "account-badge--qasa";
                                    const isPaidBorrowerInst = form.kind === "مقترض" && isInstallmentWithdrawal(tx) && paidTransactionIds.has(tx.id);
                                    const isWithdraw = (tx.type_.startsWith("سحب") || tx.type_.startsWith("باقي")) && !isPaidBorrowerInst;
                                    const isDeposit = tx.type_.startsWith("ايداع") || tx.type_.startsWith("إيداع") || tx.type_.startsWith("مقدمة") || isPaidBorrowerInst;
                                    return (
                                      <tr
                                        key={tx.id}
                                        className={`partner-tx-row ${form.kind === "ممول" || kind === "مطلوب"
                                          ? (isWithdraw ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                                          : (isDeposit ? "partner-tx-row--deposit" : "partner-tx-row--withdraw")
                                          }`}
                                        title="اضغط لتعديل المعاملة"
                                        onClick={() => beginEditTransaction(tx)}
                                      >
                                        <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                                        <td className="col-date">{tx.date}</td>
                                        <td className="col-time">{tx.time || "00:00"}</td>
                                        <td className="col-type">
                                          <span className={form.kind === "ممول" || kind === "مطلوب" ? (isWithdraw ? "text-green font-bold" : "text-red font-bold") : (isWithdraw ? "tx-type-withdraw" : "tx-type-deposit")}>
                                            {form.kind === "ممول" ? (isWithdraw ? "سحب" : "ايداع") : kind === "مطلوب" ? (isWithdraw ? "اعطيته" : "اخذت منه") : form.kind === "مقترض" ? (isWithdraw ? "باقي" : "واصل") : isSaleInstallmentTx(tx) ? (isWithdraw ? "باقي" : "واصل") : tx.type_}
                                          </span>
                                        </td>
                                        <td className="col-account">
                                          <span className={`account-badge ${badgeClass}`}>
                                            {paymentTypeLabel}
                                          </span>
                                        </td>
                                        <td className={cn(
                                          "col-amount font-bold",
                                          form.kind === "ممول" ? (isWithdraw ? "text-red" : "text-green") :
                                            kind === "مطلوب" ? (isWithdraw ? "text-green" : "text-red") :
                                              isSaleInstallmentTx(tx) ? "text-green" :
                                                (isWithdraw ? "text-red" : "text-green")
                                        )}>
                                          <PriceDisplay
                                            amount={(kind === "مطلوب" || form.kind === "ممول") ? (isWithdraw ? tx.amount : -tx.amount) : isSaleInstallmentTx(tx) ? tx.amount : (isWithdraw ? -tx.amount : tx.amount)}
                                            currency={tx.currency}
                                            noColor
                                          />
                                        </td>
                                        <td className="text-muted col-notes">
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span>
                                              {tx.notes
                                                ? tx.notes.includes(" - عمولة:")
                                                  ? tx.notes.split(" - عمولة:")[0]
                                                  : tx.notes
                                                : "—"}
                                            </span>
                                            {(form.kind === "مقترض" && isUnpaidInstallment(tx) && !paidTransactionIds.has(tx.id)) && (
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
                                          </div>
                                        </td>
                                        <td className="col-actions">
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

                    <div className="car-form-panel__actions partner-modal-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                      <ActionButton
                        type="button"
                        variant={kind === "مطلوب" ? "success" : form.kind === "مقترض" ? "secondary" : "success"}
                        style={{ flex: 1, minWidth: 0, padding: "8px 16px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--red-600)", backdropFilter: "blur(8px)", borderRadius: "10px", fontWeight: 700, fontSize: "var(--fs-sm)" }}
                        onClick={openWithdrawForm}
                      >
                        {form.kind === "ممول" ? "سحب" : kind === "مطلوب" ? `باقي على ${form.name || "الحساب"}` : form.kind === "مقترض" ? "باقي" : "سحب"}
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant={kind === "مطلوب" ? "secondary" : form.kind === "مقترض" ? "success" : "secondary"}
                        style={{ flex: 1, minWidth: 0, padding: "8px 16px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "var(--green)", backdropFilter: "blur(8px)", borderRadius: "10px", fontWeight: 700, fontSize: "var(--fs-sm)" }}
                        onClick={openDepositForm}
                      >
                        {form.kind === "ممول" ? "ايداع" : kind === "مطلوب" ? `واصل من ${form.name || "الحساب"}` : form.kind === "مقترض" ? "واصل" : "إيداع"}
                      </ActionButton>
                    </div>
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

      {/* ── نافذة إضافة / تحديث المعاملة ── */}
      {showTxModal && editingKey && (
        <div className="mb-overlay" role="presentation" onClick={() => setShowTxModal(false)}>
          <div
            className="mb-dialog tx-dialog"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: (form.kind === "ممول" && txForm.type === "سحب") ? 650 : 480 }}
          >
            <h3 className="mb-title">
              {form.kind === "ممول"
                ? (txForm.type === "سحب"
                  ? (editingTransactionId ? `تعديل تسديد تمويل - ${form.name}` : `تسديد تمويل - ${form.name}`)
                  : (editingTransactionId ? `تعديل استلام تمويل - ${form.name}` : `استلام تمويل - ${form.name}`))
                : (editingTransactionId ? "تحديث المعاملة" : `إضافة معاملة - ${form.name}`)}
            </h3>

            {!(form.kind === "ممول" && txForm.type === "سحب") && (form.kind === "ممول" || kind === "مطلوب") && (
              <div style={{
                margin: "0 0 1rem",
                padding: "0.6rem",
                borderRadius: "8px",
                textAlign: "center",
                fontWeight: "var(--fw-bold)",
                fontSize: "var(--fs-sm)",
                background: form.kind === "ممول"
                  ? (txForm.type === "سحب" ? "var(--red-bg)" : "var(--green-bg)")
                  : (txForm.type === "سحب" ? "var(--green-bg)" : "rgba(216, 168, 90, 0.15)"),
                color: form.kind === "ممول"
                  ? (txForm.type === "سحب" ? "var(--red-600)" : "var(--green)")
                  : (txForm.type === "سحب" ? "var(--green)" : "var(--gold)"),
                border: form.kind === "ممول"
                  ? (txForm.type === "سحب" ? "1px solid var(--red-bd)" : "1px solid var(--green-bd)")
                  : (txForm.type === "سحب" ? "1px solid var(--green-bd)" : "1px solid rgba(216, 168, 90, 0.3)")
              }}>
                {form.kind === "ممول"
                  ? (txForm.type === "سحب" ? `تسديد تمويل لحساب ${form.name}` : `استلام تمويل من حساب ${form.name}`)
                  : (txForm.type === "سحب" ? `باقي على ${form.name} (نطلبه)` : `واصل من ${form.name} (يطلبنا)`)}
              </div>
            )}

            {form.kind === "مقترض" && editingTransactionId && (
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
                    background: txForm.type === "ايداع" ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "ايداع" ? "var(--green)" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "ايداع" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)",
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
                    background: txForm.type === "سحب" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "سحب" ? "var(--red-600)" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "سحب" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  باقي
                </button>
              </div>
            )}

            <style>{`
              .tx-dialog {
                background: var(--backkground-secondary) !important;
                border: 1px solid var(--border-master) !important;
                border-radius: var(--all-radius) !important;
                backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
                -webkit-backdrop-filter: blur(var(--backkground-secondary-blur)) saturate(var(--backkground-secondary-saturate)) !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;
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
              {form.kind === "ممول" && txForm.type === "سحب" ? (
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

                  {/* Row 2: العمولة - المبلغ مع العمولة */}
                  <div className="form-group">
                    <label className="mb-label">العمولة (نسبة مئوية %)</label>
                    <NumberInput
                      value={String(txForm.commissionPercent)}
                      onChange={(val) => setTxForm({ ...txForm, commissionPercent: Number(val) || 0 })}
                      min={0}
                      step={0.1}
                      hideArrows
                    />
                  </div>
                  <div className="form-group">
                    <label className="mb-label">المبلغ الكلي مع العمولة</label>
                    <div style={{
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "8px",
                      color: "var(--green)",
                      fontWeight: 700,
                      fontSize: "var(--fs-md)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      height: "42px"
                    }}>
                      <span style={{ fontSize: "var(--fs-sm)", opacity: 0.7 }}>المجموع:</span>
                      <PriceDisplay amount={txForm.amount + (txForm.amount * txForm.commissionPercent) / 100} currency={txCurrency} />
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
                      {kind === "مطلوب"
                        ? txForm.type === "ايداع" ? "تاريخ التسديد" : "تاريخ الاستحقاق"
                        : "التاريخ"}
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
                          placeholder="اسم ناقل المبلغ (مثال: ماستر، مكتب صرافة...)"
                        />
                      </div>
                      <div className="form-group">
                        <label className="mb-label">العمولة (نسبة مئوية %)</label>
                        <NumberInput
                          value={String(txForm.commissionPercent)}
                          onChange={(val) => setTxForm({ ...txForm, commissionPercent: Number(val) || 0 })}
                          min={0}
                          step={0.1}
                          hideArrows
                        />
                      </div>
                      <div className="form-group">
                        <label className="mb-label">المبلغ الكلي مع العمولة</label>
                        <div style={{
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "8px",
                          color: "var(--green)",
                          fontWeight: 700,
                          fontSize: "var(--fs-md)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>المجموع:</span>
                          <PriceDisplay amount={txForm.amount + (txForm.amount * txForm.commissionPercent) / 100} currency={txCurrency} />
                        </div>
                      </div>
                    </>
                  )}

                  {kind === "مطلوب" && txForm.type === "سحب" && !editingTransactionId && (
                    <div className="form-group">
                      <label className="mb-label">عدد الأشهر</label>
                      <NumberInput
                        value={String(txForm.installments)}
                        onChange={(installments) => setTxForm({ ...txForm, installments: Math.max(1, Number(installments) || 1) })}
                        min={1}
                        hideArrows
                      />
                    </div>
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
                  variant={form.kind === "ممول" ? (txForm.type === "سحب" ? "red" : "green") : (txForm.type === "ايداع" ? "green" : "gray")}
                  style={{ flex: 1, margin: 0 }}
                  disabled={saving}
                >
                  <span className="gold-fx-btn__label">{saving ? "جاري الحفظ..." : editingTransactionId ? "تحديث" : (form.kind === "ممول" ? (txForm.type === "سحب" ? "تسديد" : "استلام") : "إضافة")}</span>
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
            <h3 className="fx-confirm-title">تأكيد حذف {partnerToDelete.kind === "مطلوب" ? "المديونية" : partnerToDelete.kind}</h3>
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
    </div>
  );
}
