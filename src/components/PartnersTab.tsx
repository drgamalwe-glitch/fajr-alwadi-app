import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { callTauri } from "../api/tauri";
import type { Partner, PartnerTransaction, UnifiedAccount } from "../types";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnifiedDateField } from "./UnifiedDateField";
import { ActionButton, TextInput, NumberInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";

interface PartnersTabProps {
  partners: Partner[];
  onRefresh: () => Promise<void>;
  kind: string;
}

const createEmptyForm = (kind: string) => ({
  name: "",
  phone: "",
  kind: kind === "partners-financial" ? "شريك" : kind,
});

type TransactionType = "ايداع" | "سحب";
type TransactionSortKey = "sequence" | "date" | "type";
type SortDirection = "asc" | "desc";

const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  tx.type_ === "سحب" && !!tx.notes?.includes("قسط");

const isUnpaidInstallment = (tx: PartnerTransaction) =>
  tx.type_ === "سحب" && (!!tx.notes?.includes("موعد تسليم") || !!tx.notes?.includes("قسط")) && tx.amount > 0;

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


export function PartnersTab({ partners, onRefresh, kind }: PartnersTabProps) {
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [debtFilter, setDebtFilter] = useState<"all" | "we_owe" | "they_owe">("all");
  const [search, setSearch] = useState("");

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
  const [form, setForm] = useState(createEmptyForm(kind));
  const formRef = useRef(createEmptyForm(kind));
  const myPartners = useMemo(() => {
    if (kind === "partners-financial") {
      return partners.filter((p) => p.kind === "شريك" || p.kind === "مستثمر" || p.kind === "ممول" || p.kind === "مقترض");
    }
    return partners.filter((p) => (p.kind || kind) === kind);
  }, [partners, kind]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [originalPartnerData, setOriginalPartnerData] = useState<{ name: string; phone: string; kind: string } | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTxConfirm, setDeleteTxConfirm] = useState<PartnerTransaction | null>(null);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [currencyTotals, setCurrencyTotals] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    let cancelled = false;
    const fetchTotals = async () => {
      try {
        const data = await callTauri<[number, number]>("get_partners_totals", { kind });
        if (!cancelled) setCurrencyTotals(data ?? [0, 0]);
      } catch {
        if (!cancelled) setCurrencyTotals([0, 0]);
      }
    };
    fetchTotals();
    return () => { cancelled = true; };
  }, [kind, myPartners]);

  const [txCurrency, setTxCurrency] = useState<Currency>("IQD");
  const [txForm, setTxForm] = useState({
    type: "ايداع" as TransactionType,
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    installments: 1,
    paymentType: "قاصه" as "قاصه" | "ماستر" | "مصرف" | "ممول",
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

    return result.sort((a, b) => a.partner_name.localeCompare(b.partner_name, "ar"));
  }, [unifiedAccounts, search, debtFilter, kind]);

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
      setTxForm({ type: "ايداع", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 1 });
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
  };

  const handleClose = async () => {
    if (modalMode === "view") {
      await handleAutoSave();
    }
    resetForm();
  };

  const startNew = () => {
    setEditingKey(null);
    setOriginalPartnerData(null);
    replaceForm(createEmptyForm(kind));
    setModalMode("view");
    setTransactions([]);
  };

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
      date: new Date().toISOString().slice(0, 10),
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
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
        return nameClean;
      } catch (err) {
        console.error("Failed to auto-add partner:", err);
        alert("تعذر حفظ الحساب.");
        return null;
      } finally {
        setSaving(false);
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
    const paymentType = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف") ? rawPaymentType : (rawPaymentType === "ممول" ? "ممول" : "قاصه");

    const isFinancierRepayment = form.kind === "ممول" && tx.type_.startsWith("سحب");
    const parsedNotes = isFinancierRepayment ? parseFinancierNotes(tx.notes) : null;

    setTxForm({
      type: tx.type_.startsWith("سحب") ? "سحب" : "ايداع",
      amount: tx.amount,
      date: tx.date?.split(" ")[0] || new Date().toISOString().slice(0, 10),
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
    setTxForm(prev => ({ ...prev, type: "ايداع" }));
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
      return (a.id - b.id) * direction;
    });
  }, [transactions, transactionSort]);

  const visibleSortedTransactions = useMemo(
    () => sortedTransactions.filter((tx) => !(isInstallmentWithdrawal(tx) && tx.amount <= 0)),
    [sortedTransactions],
  );

  const sequenceByTransactionId = useMemo(() => {
    return new Map(visibleSortedTransactions.map((tx, index) => [tx.id, index + 1]));
  }, [visibleSortedTransactions]);

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

    if (futureRows.length === 0) {
      await callTauri("delete_partner_transaction", {
        id: target.id, partnerName, kind: form.kind,
      });
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
          type: "سحب", amount: nextAmount,
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



  /* ── Esc key ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDeleteModal(false);
        setPartnerToDelete(null);
        setDeleteTxConfirm(null);
        setDeleteDialogOpen(false);
        setShowTxModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      alert(kind === "partners-financial" ? "الرجاء كتابة اسم الحساب" : `الرجاء كتابة اسم ${form.kind}`);
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
    const currentForm = formRef.current;
    const nextName = currentForm.name.trim();
    const phoneClean = toEnglishDigits(currentForm.phone.trim());
    if (!nextName) {
      if (originalPartnerData) {
        patchForm({ name: originalPartnerData.name });
      }
      return;
    }
    if (!editingKey) {
      setSaving(true);
      try {
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: currentForm.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean, kind: currentForm.kind });
        await onRefresh();
        if (kind === "مطلوب") {
          void fetchUnifiedAccounts();
        }
      } catch (err) {
        console.error("Auto save failed:", err);
      } finally {
        setSaving(false);
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
      }
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
        setTxForm({ type: "ايداع" as TransactionType, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه", transferBy: "", commission: 0, commissionPercent: 1 });
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
      alert("الرجاء إدخال مبلغ صحيح والتاريخ");
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
      const convertsInstallmentToPayment =
        (kind === "مطلوب" || form.kind === "مقترض") &&
        txForm.type === "ايداع" &&
        !!editingTransactionId &&
        !!originalEditingTransaction &&
        isInstallmentWithdrawal(originalEditingTransaction);

      if (convertsInstallmentToPayment) {
        await callTauri("add_partner_transaction", {
          partnerName: editingKey,
          kind: form.kind,
          type: "ايداع",
          amount: periodAmount,
          date: dateStr,
          notes: txForm.notes || `تسديد ${originalEditingTransaction.notes ?? "قسط"}`,
          currency: txCurrency,
          paymentType: txForm.paymentType,
        });
        await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
      } else {
        for (let i = 0; i < installments; i++) {
          const date = new Date(dateStr);
          date.setMonth(date.getMonth() + i);
          const dateStr_i = date.toISOString().slice(0, 10);
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
            type: txForm.type,
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

        if ((kind === "مطلوب" || form.kind === "مقترض") && txForm.type === "ايداع") {
          const originalCurrency = originalEditingTransaction?.currency === "USD" ? "USD" : "IQD";
          const originalAmount = originalEditingTransaction?.type_ === "ايداع"
            ? originalEditingTransaction.amount
            : 0;
          if (!editingTransactionId) {
            await rebalanceInstallmentsAfterPayment(editingKey, periodAmount, dateStr, txCurrency);
          } else if (originalEditingTransaction?.type_ === "ايداع") {
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
    .filter((t) => t.type_.startsWith("ايداع"))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type_.startsWith("سحب"))
    .reduce((sum, t) => sum + t.amount, 0);
  const hasInstallmentSchedule = transactions.some(isInstallmentWithdrawal);
  const displayTotalDebt = hasInstallmentSchedule
    ? totalWithdrawals + totalDeposits
    : totalWithdrawals;
  const displayRemainingDebt = hasInstallmentSchedule
    ? totalWithdrawals
    : Math.max(0, totalWithdrawals - totalDeposits);


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
              fontWeight: 700,
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "#f0d060",
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
                fontWeight: 800,
                fontSize: "var(--fs-lg)",
                color: "#f0d060",
                border: "1px solid rgba(212,175,55,0.4)",
                boxShadow: "0 0 20px rgba(212,175,55,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 400, color: "rgba(212,175,55,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
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
                fontWeight: 800,
                fontSize: "var(--fs-lg)",
                color: "#f0d060",
                border: "1px solid rgba(212,175,55,0.4)",
                boxShadow: "0 0 20px rgba(212,175,55,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 400, color: "rgba(212,175,55,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
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
              fontWeight: 700,
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "#fca5a5",
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
                fontWeight: 800,
                fontSize: "var(--fs-lg)",
                color: "#fca5a5",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 20px rgba(239,68,68,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 400, color: "rgba(248,113,113,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
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
                fontWeight: 800,
                fontSize: "var(--fs-lg)",
                color: "#fca5a5",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 20px rgba(239,68,68,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 400, color: "rgba(248,113,113,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdWeOwe} currency="USD" />
              </div>
            </div>
          </div>

          {/* Card 3: الصافي */}
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
              fontWeight: 700,
              letterSpacing: "0.5px",
              marginBottom: 0,
              color: "#86efac",
              textShadow: "0 0 12px rgba(34,197,94,0.5)"
            }}>الصافي</h3>
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
                fontWeight: 800,
                fontSize: "var(--fs-lg)",
                color: "#86efac",
                border: "1px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 20px rgba(34,197,94,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 400, color: "rgba(74,222,128,0.75)", marginBottom: "4px", direction: "rtl" }}>الدينار العراقي</div>
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
                fontWeight: 800,
                fontSize: "var(--fs-lg)",
                color: "#86efac",
                border: "1px solid rgba(34,197,94,0.4)",
                boxShadow: "0 0 20px rgba(34,197,94,0.15)",
              }}>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 400, color: "rgba(74,222,128,0.75)", marginBottom: "4px", direction: "rtl" }}>الدولار الأمريكي</div>
                <PriceDisplay amount={stats.usdNet} currency="USD" />
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="main-card customers-main-card">
        <div
          className="card-toolbar customers-toolbar partners-toolbar"
          style={kind === "مطلوب"
            ? { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "1rem", width: "100%" }
            : { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }
          }
        >
          {kind !== "مطلوب" && (
            <h3 className="card-header card-header--inline customers-title partners-title" style={{ margin: 0 }}>
              {kind === "partners-financial" ? "حسابات العملاء" : kind === "مستثمر" ? "المستثمرون" : "الشركاء"} ({myPartners.length})
            </h3>
          )}

          {kind === "مطلوب" ? (
            /* جهة اليمين (في RTL): زر إضافة حساب + أزرار التصفية */
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", justifySelf: "start", flexShrink: 0 }}>
              <ActionButton type="button" variant="primary" onClick={startNew} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
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
                      ? "bg-gradient-to-br from-green-500/25 to-green-600/10 text-green-300 border-green-500/40 shadow-sm shadow-green-500/10"
                      : "text-white/60 hover:text-green-300 hover:bg-green-500/5"
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
                      ? "bg-gradient-to-br from-red-500/25 to-red-600/10 text-red-300 border-red-500/40 shadow-sm shadow-red-500/10"
                      : "text-white/60 hover:text-red-300 hover:bg-red-500/5"
                  )}
                  onClick={() => setDebtFilter("we_owe")}
                >
                  يطلبونا
                </button>
              </div>
            </div>
          ) : null}

          {kind === "مطلوب" ? (
            /* في المنتصف: حقل البحث العريض والمصمم بشكل جميل وصغير */
            <div style={{ justifySelf: "center", width: "100%", minWidth: "280px", maxWidth: "420px" }}>
              <TextInput
                type="search"
                placeholder="بحث بالاسم أو رقم الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leadingIcon={Search}
                inputSize="sm"
                containerClassName="w-full"
              />
            </div>
          ) : (
            /* الأزرار لغير تبويب مطلوب */
            <div className="partners-toolbar-buttons" style={{ marginRight: "0" }}>
              <ActionButton type="button" variant="primary" onClick={startNew}>
                + إضافة {kind === "partners-financial" ? "حساب" : kind}
              </ActionButton>
            </div>
          )}

          {kind === "مطلوب" ? (
            /* جهة اليسار (في RTL): مساحة فارغة لموازنة المنتصف */
            <div style={{ justifySelf: "end" }} />
          ) : null}

          {kind !== "مطلوب" && (
            <div className="partners-toolbar-cards">
              <div className="summary-card-premium summary-card-premium--iqd">
                <div className="summary-card-premium__label">
                  {kind === "partners-financial" ? "إجمالي المبالغ بالدينار" : kind === "مستثمر" ? "إجمالي الاستثمار بالدينار" : "إجمالي الشركاء بالدينار"}
                </div>
                <PriceDisplay amount={currencyTotals[0]} />
              </div>
              <div className="summary-card-premium summary-card-premium--usd">
                <div className="summary-card-premium__label">
                  {kind === "partners-financial" ? "إجمالي المبالغ بالدولار" : kind === "مستثمر" ? "إجمالي الاستثمار بالدولار" : "إجمالي الشركاء بالدولار"}
                </div>
                <PriceDisplay amount={currencyTotals[1]} currency="USD" />
              </div>
            </div>
          )}
        </div>

        <div className="table-wrapper partner-debtors-scroll">
          <table className={`data-table partners-data-table${kind === "مطلوب" ? " partners-data-table--debtors" : ""}`}>
            {kind === "مطلوب" ? (<>
              <thead>
                <tr>
                  <th className="cell-num" style={{ width: "35px" }}>ت</th>
                  <th className="col-name">الاسم</th>
                  <th className="col-phone">رقم الهاتف</th>
                  <th className="col-money">الرصيد بالدينار</th>
                  <th className="col-money">الرصيد بالدولار</th>
                  <th className="col-delete" style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedAccounts.map((account, idx) => {
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
                      return <span style={{ color: "#888888" }}>-</span>;
                    }
                  };
                  return (
                    <tr
                      key={account.partner_name}
                      className="customers-tr"
                      onClick={() => loadPartner({ partner_name: account.partner_name, phone: account.phone || "", total_amount: 0, total_withdrawals: 0, kind: "مطلوب" })}
                      title="اضغط لعرض التفاصيل"
                    >
                      <td className="cell-num">{idx + 1}</td>
                      <td className="col-name cell-bold">{account.partner_name}</td>
                      <td className="col-phone">{account.phone || "—"}</td>
                      <td className="col-money">
                        {renderBalanceCell(account.iqd_balance, false)}
                      </td>
                      <td className="col-money">
                        {renderBalanceCell(account.usd_balance, true)}
                      </td>
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
                    <td colSpan={6} className="empty-cell">
                      لا توجد حسابات مطابقة للبحث أو التصفية
                    </td>
                  </tr>
                )}
              </tbody>
            </>) : (<>
              <thead>
                <tr>
                  <th className="cell-num">ت</th>
                  <th>النوع</th>
                  <th className="col-name">الاسم</th>
                  <th className="col-phone">رقم الهاتف</th>
                  <th className="col-money">المبلغ</th>
                  <th className="col-ratio">نسبة الشراكة</th>
                  <th className="col-delete" style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {myPartners.map((partner, idx) => {
                  const pKind = partner.kind || (kind === "partners-financial" ? "شريك" : kind);
                  const sameKind = myPartners.filter((p) => (p.kind || (kind === "partners-financial" ? "شريك" : kind)) === pKind);
                  const totalSameKind = sameKind.reduce((sum, p) => sum + p.total_amount, 0);
                  const ratio = totalSameKind > 0 ? (partner.total_amount / totalSameKind) * 100 : 0;
                  return (
                    <tr
                      key={partner.partner_name}
                      className={`customers-tr partner-row--${pKind}`}
                      onClick={() => loadPartner(partner)}
                      title="اضغط لعرض التفاصيل"
                    >
                      <td className="cell-num">{idx + 1}</td>
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
                            <span className="text-red" style={{ direction: "rtl", display: "inline-block" }}>
                              <PriceDisplay amount={partner.total_amount} noColor />
                              <span style={{ fontSize: "var(--fs-xs)", marginRight: "0.25rem", fontWeight: "normal" }}>يطلبنا</span>
                            </span>
                          ) : partner.total_amount < 0 ? (
                            <span className="text-green" style={{ direction: "rtl", display: "inline-block" }}>
                              <PriceDisplay amount={Math.abs(partner.total_amount)} noColor />
                              <span style={{ fontSize: "var(--fs-xs)", marginRight: "0.25rem", fontWeight: "normal" }}>نطلبه</span>
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>خالص</span>
                          )
                        ) : pKind === "مقترض" ? (
                          partner.total_withdrawals > 0 ? (
                            <span className="text-red" style={{ direction: "rtl", display: "inline-block" }}>
                              <PriceDisplay amount={partner.total_withdrawals} noColor />
                              <span style={{ fontSize: "var(--fs-xs)", marginRight: "0.25rem", fontWeight: "normal" }}>المتبقي</span>
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>خالص</span>
                          )
                        ) : (
                          <span className={partner.total_amount >= 0 ? "text-green" : "text-red"}>
                            <PriceDisplay amount={partner.total_amount} />
                          </span>
                        )}
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
                    <td colSpan={7} className="empty-cell">
                      {kind === "partners-financial" ? "لا توجد حسابات بعد" : `لا يوجد ${kind === "مستثمر" ? "مستثمرون" : "شركاء"}`}
                    </td>
                  </tr>
                )}
              </tbody>
            </>)}
          </table>
        </div>
      </section>

      {modalMode !== null && (
        <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={handleClose}>
          <div
            className={`modal-dialog ${modalMode === "view" ? "modal-dialog--partner modal-dialog--wide" : "modal-dialog--slim"
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
                      onBlur={() => void handleAutoSave()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                  {kind === "partners-financial" && (
                    <div className="partner-summary-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span className="partner-summary-field__label">💼 نوع الحساب</span>
                      <div className="payment-type-selector" style={{ width: "100%", maxWidth: "none", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px", padding: "4px" }}>
                        {(["شريك", "مستثمر", "ممول", "مقترض"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`payment-type-btn payment-type-btn--partner-${opt} ${form.kind === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => {
                              patchForm({ kind: opt });
                              void handleAutoSave();
                            }}
                            style={{
                              padding: "4px 8px",
                              fontSize: "var(--fs-xs)",
                              borderRadius: "6px",
                              flex: "none",
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
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
                          <PriceDisplay amount={totalDeposits + totalWithdrawals} />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "#22c55e" }}>🟢 تم تسديد</span>
                        <span className="partner-summary-field__value" style={{ color: "#22c55e" }}>
                          <PriceDisplay amount={totalDeposits} noColor />
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label" style={{ color: "#ef4444" }}>🔴 المتبقي</span>
                        <span className="partner-summary-field__value" style={{ color: "#ef4444" }}>
                          <PriceDisplay amount={totalWithdrawals} noColor />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 صافي المبلغ</span>
                      <span className="partner-summary-field__value">
                        {form.kind === "ممول" ? (
                          (totalDeposits - totalWithdrawals) > 0 ? (
                            <span className="text-red" style={{ direction: "rtl", display: "inline-block" }}>
                              <PriceDisplay amount={totalDeposits - totalWithdrawals} noColor />
                              <span style={{ fontSize: "var(--fs-xs)", marginRight: "0.25rem", fontWeight: "normal" }}>يطلبنا</span>
                            </span>
                          ) : (totalDeposits - totalWithdrawals) < 0 ? (
                            <span className="text-green" style={{ direction: "rtl", display: "inline-block" }}>
                              <PriceDisplay amount={Math.abs(totalDeposits - totalWithdrawals)} noColor />
                              <span style={{ fontSize: "var(--fs-xs)", marginRight: "0.25rem", fontWeight: "normal" }}>نطلبه</span>
                            </span>
                          ) : (
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>خالص</span>
                          )
                        ) : (
                          <PriceDisplay amount={totalDeposits - totalWithdrawals} />
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
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchName(e.target.value)}
                        placeholder="الاسم الثلاثي" />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="partner-phone">
                        رقم الهاتف
                      </label>
                      <TextInput id="partner-phone" value={form.phone}
                        autoComplete="new-password"
                        dir="ltr" placeholder="077xxxxxxxx"
                        onInput={(e: React.FormEvent<HTMLInputElement>) => patchPhone((e.target as HTMLInputElement).value)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchPhone(e.target.value)}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchPhone(e.target.value)} />
                    </div>
                    {kind === "partners-financial" && (
                      <div className="form-group">
                        <label className="label">نوع الحساب</label>
                        <div className="payment-type-selector">
                          {(["شريك", "مستثمر", "ممول", "مقترض"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              className={`payment-type-btn payment-type-btn--partner-${opt} ${form.kind === opt ? "payment-type-btn--active" : ""}`}
                              onClick={() => patchForm({ kind: opt })}
                              style={{ flex: 1 }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
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
                    <div className="partner-transactions-panel">
                      {transactionsLoading ? (
                        <p className="text-muted partner-empty-state">جاري التحميل...</p>
                      ) : visibleSortedTransactions.length === 0 ? (
                        <p className="text-muted partner-empty-state">لا توجد معاملات بعد</p>
                      ) : (
                        <div className="table-wrapper partner-tx-wrapper" ref={transactionListRef}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th className="col-seq">ت</th>
                                <th className="col-date">
                                  <button type="button" className="th-sort-btn" onClick={() => handleSortTransactions("date")}>
                                    التاريخ {transactionSort.key === "date" ? (transactionSort.direction === "asc" ? "▲" : "▼") : ""}
                                  </button>
                                </th>
                                <th className="col-time">الوقت</th>
                                <th className="col-type">العملية</th>
                                <th className="col-account">الحساب</th>
                                <th className="col-amount">المبلغ</th>
                                <th className="col-notes">ملاحظة</th>
                                <th className="col-actions"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleSortedTransactions.map((tx) => {
                                const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
                                const paymentTypeLabel = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف") ? rawPaymentType : "قاصه";
                                const badgeClass = paymentTypeLabel === "ماستر" ? "account-badge--master" : paymentTypeLabel === "مصرف" ? "account-badge--bank" : "account-badge--qasa";
                                const isWithdraw = tx.type_.startsWith("سحب");
                                const isDeposit = tx.type_.startsWith("ايداع");
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
                                        {form.kind === "ممول" ? (isWithdraw ? "تسديد" : "اخذ مبلغ") : kind === "مطلوب" ? (isWithdraw ? "اعطيته" : "اخذت منه") : form.kind === "مقترض" ? (isWithdraw ? "لم يسدد بعد" : "تم التسديد") : tx.type_}
                                      </span>
                                    </td>
                                    <td className="col-account">
                                      <span className={`account-badge ${badgeClass}`}>
                                        {paymentTypeLabel}
                                      </span>
                                    </td>
                                    <td className={cn(
                                      "col-amount font-bold",
                                      form.kind === "ممول" || kind === "مطلوب"
                                        ? (isWithdraw ? "text-green" : "text-red")
                                        : form.kind === "مقترض"
                                          ? (isWithdraw ? "text-red" : "text-green")
                                          : (isWithdraw ? "text-red" : "text-green")
                                    )}>
                                      <PriceDisplay
                                        amount={form.kind === "ممول"
                                          ? tx.amount
                                          : form.kind === "مقترض"
                                            ? tx.amount
                                            : form.kind === "ممول" || kind === "مطلوب"
                                              ? (isWithdraw ? tx.amount : -tx.amount)
                                              : (isWithdraw ? -tx.amount : tx.amount)
                                        }
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
                                        {(form.kind === "مقترض" && isUnpaidInstallment(tx)) && (
                                          <button
                                            type="button"
                                            className="btn-settle-installment"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              beginSettleInstallment(tx);
                                            }}
                                          >
                                            تم التسديد
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
                      )}
                    </div>

                    <div className="car-form-panel__actions partner-modal-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                      <ActionButton
                        type="button"
                        variant={kind === "مطلوب" ? "success" : form.kind === "مقترض" ? "secondary" : "success"}
                        onClick={openWithdrawForm}
                      >
                        {form.kind === "ممول" ? "تسديد مبلغ للممول" : kind === "مطلوب" ? `اعطي الى ${form.name || "الحساب"}` : form.kind === "مقترض" ? "لم يسدد بعد" : "سحب"}
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant={kind === "مطلوب" ? "secondary" : form.kind === "مقترض" ? "success" : "secondary"}
                        onClick={openDepositForm}
                      >
                        {form.kind === "ممول" ? "اخذ مبلغ من الممول" : kind === "مطلوب" ? `اخذ من ${form.name || "الحساب"}` : form.kind === "مقترض" ? "تم التسديد" : "إيداع"}
                      </ActionButton>
                    </div>
                  </>
                )}
              </div>
            </div>
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

      {/* ── نافذة إضافة / تحديث المعاملة ── */}
      {showTxModal && editingKey && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowTxModal(false)}>
          <div
            className="modal-dialog"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: (form.kind === "ممول" && txForm.type === "سحب") ? 650 : 480 }}
          >
            <h3 className="modal-dialog__title">
              {form.kind === "ممول" && txForm.type === "سحب"
                ? (editingTransactionId ? `تعديل تسديد مبلغ للممول - ${form.name}` : `تسديد مبلغ للممول - ${form.name}`)
                : (editingTransactionId ? "تحديث المعاملة" : `إضافة معاملة - ${form.name}`)}
            </h3>

            {!(form.kind === "ممول" && txForm.type === "سحب") && (form.kind === "ممول" || kind === "مطلوب") && (
              <div style={{
                margin: "0 0 1rem",
                padding: "0.6rem",
                borderRadius: "8px",
                textAlign: "center",
                fontWeight: 700,
                fontSize: "var(--fs-sm)",
                background: txForm.type === "سحب" ? "rgba(34,197,94,0.15)" : "rgba(212,175,55,0.15)",
                color: txForm.type === "سحب" ? "#22c55e" : "#f0d060",
                border: txForm.type === "سحب" ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(212,175,55,0.3)"
              }}>
                {form.kind === "ممول"
                  ? (txForm.type === "سحب" ? `تسديد مبلغ لـ ${form.name}` : `اخذ مبلغ من ${form.name}`)
                  : (txForm.type === "سحب" ? `اعطي الى ${form.name} (نطلبه)` : `اخذ من ${form.name} (يطلبنا)`)}
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
                    color: txForm.type === "ايداع" ? "#22c55e" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "ايداع" ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  ✅ تم التسديد
                </button>
                <button
                  type="button"
                  className={`payment-type-btn payment-type-btn--unsettle ${txForm.type === "سحب" ? "payment-type-btn--active" : ""}`}
                  onClick={() => setTxForm(prev => ({ ...prev, type: "سحب" }))}
                  style={{
                    flex: 1, padding: "8px 16px",
                    background: txForm.type === "سحب" ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)",
                    color: txForm.type === "سحب" ? "#ef4444" : "rgba(255,255,255,0.6)",
                    border: txForm.type === "سحب" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  ❌ لم يسدد بعد
                </button>
              </div>
            )}

            <form className="form" onSubmit={handleAddTransaction}>
              {form.kind === "ممول" && txForm.type === "سحب" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem 1.5rem" }}>
                  {/* Row 1: التاريخ - المبلغ */}
                  <div className="form-group">
                    <label className="label">التاريخ</label>
                    <UnifiedDateField
                      value={txForm.date}
                      onChange={(date) => setTxForm({ ...txForm, date })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">المبلغ</label>
                    <PriceInput
                      value={String(txForm.amount)}
                      onChange={(amount) => setTxForm({ ...txForm, amount: Number(amount) || 0 })}
                      currency={txCurrency}
                      onCurrencyChange={setTxCurrency}
                    />
                  </div>

                  {/* Row 2: العمولة - المبلغ مع العمولة */}
                  <div className="form-group">
                    <label className="label">العمولة (نسبة مئوية %)</label>
                    <NumberInput
                      value={String(txForm.commissionPercent)}
                      onChange={(val) => setTxForm({ ...txForm, commissionPercent: Number(val) || 0 })}
                      min={0}
                      step={0.1}
                      hideArrows
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">المبلغ الكلي مع العمولة</label>
                    <div style={{
                      padding: "10px 12px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "8px",
                      color: "#10b981",
                      fontWeight: "bold",
                      fontSize: "var(--fs-md)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      height: "42px"
                    }}>
                      <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>المجموع:</span>
                      <PriceDisplay amount={txForm.amount + (txForm.amount * txForm.commissionPercent) / 100} currency={txCurrency} />
                    </div>
                  </div>

                  {/* Row 3: طريقة الدفع - ارسال المبلغ بيد */}
                  <div className="form-group">
                    <label className="label">طريقة الدفع</label>
                    <div className="payment-type-selector" style={{ height: "42px", maxWidth: "none", padding: "4px" }}>
                      {(["قاصه", "ماستر"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${txForm.paymentType === opt ? "payment-type-btn--active" : ""}`}
                          onClick={() => setTxForm({ ...txForm, paymentType: opt })}
                          style={{ flex: 1, padding: "8px 12px" }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="label">ارسال المبلغ بيد</label>
                    <TextInput
                      value={txForm.transferBy}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxForm({ ...txForm, transferBy: e.target.value })}
                      placeholder="اسم ناقل المبلغ..."
                    />
                  </div>

                  {/* Row 4: الملاحظات */}
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="label">الملاحظات</label>
                    <textarea
                      className="input"
                      value={txForm.notes}
                      onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      placeholder="ملاحظات اختيارية..."
                      rows={2}
                      style={{ resize: "none", width: "100%" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="label">
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
                    <label className="label">المبلغ</label>
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
                        <label className="label">نقل المبلغ بواسطة</label>
                        <TextInput
                          value={txForm.transferBy}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxForm({ ...txForm, transferBy: e.target.value })}
                          placeholder="اسم ناقل المبلغ (مثال: ماستر، مكتب صرافة...)"
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">العمولة (نسبة مئوية %)</label>
                        <NumberInput
                          value={String(txForm.commissionPercent)}
                          onChange={(val) => setTxForm({ ...txForm, commissionPercent: Number(val) || 0 })}
                          min={0}
                          step={0.1}
                          hideArrows
                        />
                      </div>
                      <div className="form-group">
                        <label className="label">المبلغ الكلي مع العمولة</label>
                        <div style={{
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "8px",
                          color: "#10b981",
                          fontWeight: "bold",
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
                      <label className="label">عدد الأشهر</label>
                      <NumberInput
                        value={String(txForm.installments)}
                        onChange={(installments) => setTxForm({ ...txForm, installments: Math.max(1, Number(installments) || 1) })}
                        min={1}
                        hideArrows
                      />
                    </div>
                  )}

                  {!(form.kind === "ممول" && txForm.type === "ايداع") && (
                    <div className="form-group">
                      <label className="label">طريقة الدفع</label>
                      <div className="payment-type-selector">
                        {(["قاصه", "ماستر"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : "master"} ${txForm.paymentType === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => setTxForm({ ...txForm, paymentType: opt })}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="label">ملاحظة</label>
                    <textarea
                      className="input"
                      value={txForm.notes}
                      onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      placeholder="اختياري"
                      rows={2}
                      style={{ resize: "none" }}
                    />
                  </div>
                </>
              )}

              <div className="modal-dialog__actions" style={{ marginTop: "1.5rem" }}>
                <ActionButton type="button" variant="ghost" onClick={() => setShowTxModal(false)}>
                  إلغاء
                </ActionButton>
                <ActionButton
                  type="submit"
                  variant={txForm.type === "ايداع" ? "success" : "secondary"}
                  disabled={saving}
                >
                  {saving ? "جاري الحفظ..." : editingTransactionId ? "تحديث" : "إضافة"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة تأكيد حذف العميل / المديونية */}
      {showDeleteModal && partnerToDelete && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowDeleteModal(false)}>
          <div
            className="modal-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-dialog__title">تأكيد حذف {partnerToDelete.kind === "مطلوب" ? "المديونية" : partnerToDelete.kind}</h3>
            <p className="modal-dialog__message">
              هل أنت متأكد من حذف <strong>{partnerToDelete.name}</strong> وكل معاملاته؟
              لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="modal-dialog__actions">
              <ActionButton
                type="button"
                variant="danger"
                onClick={() => {
                  const p = partnerToDelete;
                  setShowDeleteModal(false);
                  setPartnerToDelete(null);
                  void executeInlineDelete(p.name, p.kind);
                }}
                disabled={saving}
              >
                {saving ? "جاري الحذف..." : "تأكيد"}
              </ActionButton>
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
