import { useEffect, useMemo, useRef, useState } from "react";
import { callTauri } from "../api/tauri";
import type { Partner, PartnerTransaction } from "../types";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { ElegantSwitch } from "./ElegantSwitch";
import { UnifiedDateField } from "./UnifiedDateField";
import { ActionButton, TextInput, NumberInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";

interface PartnersTabProps {
  partners: Partner[];
  onRefresh: () => Promise<void>;
  kind: string;
}

const createEmptyForm = (kind: string) => ({
  name: "",
  phone: "",
  kind,
});

type TransactionType = "ايداع" | "سحب";
type TransactionSortKey = "sequence" | "date" | "type";
type SortDirection = "asc" | "desc";

const isInstallmentWithdrawal = (tx: PartnerTransaction) =>
  tx.type_ === "سحب" && !!tx.notes?.includes("قسط");

const isSameCurrency = (tx: PartnerTransaction, currency: Currency) =>
  (tx.currency || "IQD") === currency;

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
  const [form, setForm] = useState(createEmptyForm(kind));
  const formRef = useRef(createEmptyForm(kind));
  const myPartners = useMemo(() => partners.filter((p) => (p.kind || kind) === kind), [partners, kind]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [originalPartnerData, setOriginalPartnerData] = useState<{ name: string; phone: string } | null>(null);
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
    paymentType: "قاصه" as "قاصه" | "ماستر" | "مصرف",
  });
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [transactionSort, setTransactionSort] = useState<{
    key: TransactionSortKey;
    direction: SortDirection;
  }>({ key: "date", direction: "asc" });
  const transactionListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTransactionsRef = useRef(false);
  const [partnerFinances, setPartnerFinances] = useState<Map<string, {
    totalDebtIqd: number;
    totalPaidIqd: number;
    remainingIqd: number;
    totalDebtUsd: number;
    totalPaidUsd: number;
    remainingUsd: number;
    installmentAmount: number;
    installmentCurrency: string | null;
    nextDueDate: string | null;
  }>>(new Map());
  const [debtsSubTab, setDebtsSubTab] = useState<"us" | "them">("us");
  const [financesLoading, setFinancesLoading] = useState(false);

  // ترتيب المديونين حسب أقرب دفعة قادمة (الأقرب أولاً)
  const sortedDebtors = useMemo(() => {
    if (kind !== "مطلوب") return myPartners;
    return [...myPartners].sort((a, b) => {
      const aDate = partnerFinances.get(a.partner_name)?.nextDueDate;
      const bDate = partnerFinances.get(b.partner_name)?.nextDueDate;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.localeCompare(bDate);
    });
  }, [myPartners, partnerFinances, kind]);

  const visibleDebtors = useMemo(() => {
    if (kind !== "مطلوب") return sortedDebtors;
    return sortedDebtors.filter((p) => {
      const fin = partnerFinances.get(p.partner_name);
      if (debtsSubTab === "us") {
        return fin ? !(fin.remainingIqd < 0 || fin.remainingUsd < 0) : true;
      } else {
        return fin ? (fin.remainingIqd < 0 || fin.remainingUsd < 0) : false;
      }
    });
  }, [sortedDebtors, kind, partnerFinances, debtsSubTab]);

  const activeCurrencyTotals = useMemo(() => {
    if (kind !== "مطلوب") return currencyTotals;
    let iqdSum = 0;
    let usdSum = 0;
    for (const [, fin] of partnerFinances) {
      if (debtsSubTab === "us") {
        if (fin.remainingIqd > 0) iqdSum += fin.remainingIqd;
        if (fin.remainingUsd > 0) usdSum += fin.remainingUsd;
      } else {
        if (fin.remainingIqd < 0) iqdSum += Math.abs(fin.remainingIqd);
        if (fin.remainingUsd < 0) usdSum += Math.abs(fin.remainingUsd);
      }
    }
    return [iqdSum, usdSum] as [number, number];
  }, [kind, currencyTotals, partnerFinances, debtsSubTab]);

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
    setOriginalPartnerData({ name: partner.partner_name, phone: partner.phone });
    replaceForm({ name: partner.partner_name, phone: partner.phone, kind: partner.kind });
    setModalMode("view");
    setEditingTransactionId(null);
    setTransactionSort({ key: "date", direction: "asc" });
    if (!preserveType) {
      setTxForm({ type: "ايداع", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه" });
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
    replaceForm(createEmptyForm(kind));
    setModalMode("new");
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
    setTxForm({ type, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه" });
  };

  const openDepositForm = () => {
    resetTransactionForm("ايداع");
    setShowTxModal(true);
  };

  const openWithdrawForm = () => {
    resetTransactionForm("سحب");
    setShowTxModal(true);
  };

  const beginEditTransaction = (tx: PartnerTransaction) => {
    setEditingTransactionId(tx.id);
    const rawPaymentType = tx.payment_type || tx.paymentType || "قاصه";
    const paymentType = (rawPaymentType === "ماستر" || rawPaymentType === "مصرف") ? rawPaymentType : "قاصه";
    setTxForm({
      type: tx.type_ === "سحب" ? "سحب" : "ايداع",
      amount: tx.amount,
      date: tx.date?.split(" ")[0] || new Date().toISOString().slice(0, 10),
      notes: tx.notes ?? "",
      installments: 1,
      paymentType,
    });
    if (tx.currency === "USD" || tx.currency === "IQD") {
      setTxCurrency(tx.currency);
    }
    setShowTxModal(true);
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

    const affectedRows = installmentRows.slice(targetIndex).filter((tx) => tx.amount > 0);
    const affectedTotal = affectedRows.reduce((sum, tx) => sum + tx.amount, 0);
    const remainingAfterPayment = Math.max(0, affectedTotal - roundedDelta);
    const futureRows = installmentRows.slice(targetIndex + 1);
    const rowsToDistribute = futureRows.length > 0 ? futureRows : [target];
    const distributedAmounts = splitAmountEvenly(remainingAfterPayment, rowsToDistribute.length);
    const targetAmount = futureRows.length > 0 ? 0 : distributedAmounts[0] ?? 0;

    if (targetAmount <= 0) {
      await callTauri("delete_partner_transaction", {
        id: target.id,
        partnerName,
        kind: form.kind,
      });
    } else {
      await callTauri("update_partner_transaction", {
        id: target.id,
        partnerName,
        kind: form.kind,
        type: "سحب",
        amount: targetAmount,
        date: target.date,
        notes: target.notes,
        currency,
        paymentType: target.payment_type || target.paymentType || "قاصه",
      });
    }

    if (futureRows.length > 0) {
      await Promise.all(
        futureRows.map((tx, index) => {
          const nextAmount = distributedAmounts[index] ?? 0;
          if (nextAmount <= 0) {
            return callTauri("delete_partner_transaction", {
              id: tx.id,
              partnerName,
              kind: form.kind,
            });
          }
          return callTauri("update_partner_transaction", {
            id: tx.id,
            partnerName,
            kind: form.kind,
            type: "سحب",
            amount: nextAmount,
            date: tx.date,
            notes: tx.notes,
            currency,
            paymentType: tx.payment_type || tx.paymentType || "قاصه",
          });
        }),
      );
    }
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

  /* ── تحميل المعاملات لجدول ديون العملاء الرئيسي ── */
  useEffect(() => {
    if (kind !== "مطلوب" || myPartners.length === 0) {
      setPartnerFinances(new Map());
      return;
    }
    setFinancesLoading(true);
    let cancelled = false;
    const loadAll = async () => {
      const entries: [string, {
        totalDebtIqd: number;
        totalPaidIqd: number;
        remainingIqd: number;
        totalDebtUsd: number;
        totalPaidUsd: number;
        remainingUsd: number;
        installmentAmount: number;
        installmentCurrency: string | null;
        nextDueDate: string | null;
      }][] = await Promise.all(
        myPartners.map(async (p) => {
          const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", {
            partnerName: p.partner_name,
            kind: p.kind,
          });
          const list = txs ?? [];
          const withdrawals = list.filter((t) => t.type_ === "سحب");
          const deposits = list.filter((t) => t.type_ === "ايداع");
          
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
          
          const sortedDebts = [...withdrawals]
            .filter((t) => t.amount > 0)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayTime = today.getTime();
          // أقرب دفعة قادمة (تاريخ ≥ اليوم) أو آخر دفعة إذا كانت كلها متأخرة
          let nextInstallment: typeof sortedDebts[0] | null = null;
          for (const d of sortedDebts) {
            const dd = new Date(d.date);
            dd.setHours(0, 0, 0, 0);
            if (dd.getTime() >= todayTime) {
              nextInstallment = d;
              break;
            }
          }
          if (!nextInstallment && sortedDebts.length > 0) {
            nextInstallment = sortedDebts[sortedDebts.length - 1]; // آخر دفعة إذا كانت كلها متأخرة
          }
          const installmentAmount = nextInstallment ? nextInstallment.amount : 0;
          const installmentCurrency = nextInstallment ? (nextInstallment.currency || "IQD") : "IQD";
          
          // أقرب تاريخ استحقاق إجمالاً
          let closest: typeof sortedDebts[0] | null = null;
          let closestDiff = Infinity;
          for (const d of sortedDebts) {
            const dd = new Date(d.date);
            dd.setHours(0, 0, 0, 0);
            const diff = Math.abs(dd.getTime() - todayTime);
            if (diff < closestDiff) { closestDiff = diff; closest = d; }
          }
          const nextDueDate = closest ? closest.date : null;
          return [p.partner_name, {
            totalDebtIqd,
            totalPaidIqd,
            remainingIqd,
            totalDebtUsd,
            totalPaidUsd,
            remainingUsd,
            installmentAmount,
            installmentCurrency,
            nextDueDate
          }];
        }),
      );
      if (!cancelled) setPartnerFinances(new Map(entries));
      setFinancesLoading(false);
    };
    loadAll();
    return () => { cancelled = true; };
  }, [myPartners, kind]);

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
      alert(`الرجاء كتابة اسم ${form.kind}`);
      return;
    }

    setSaving(true);
    try {
      const nextName = form.name.trim();
      const phoneClean = toEnglishDigits(form.phone.trim());
      if (editingKey) {
        await callTauri("update_partner", {
          oldName: editingKey,
          oldKind: form.kind,
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nextName);
        setOriginalPartnerData({ name: nextName, phone: phoneClean });
        await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, kind: form.kind });
        await onRefresh();
      } else {
        await callTauri("add_partner", {
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        resetForm();
        await onRefresh();
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
    if (originalPartnerData && (nextName !== originalPartnerData.name || phoneClean !== originalPartnerData.phone)) {
      setSaving(true);
      try {
        if (editingKey) {
          await callTauri("update_partner", {
            oldName: editingKey,
            oldKind: currentForm.kind,
            name: nextName,
            phone: phoneClean,
            kind: currentForm.kind,
          });
          setEditingKey(nextName);
          setOriginalPartnerData({ name: nextName, phone: phoneClean });
          await loadPartner({ partner_name: nextName, phone: phoneClean, total_amount: 0, kind: currentForm.kind }, true);
          await onRefresh();
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
      const txs = await callTauri<PartnerTransaction[]>("get_partner_transactions", { partnerName: tx.partner_name, kind: tx.kind });
      setTransactions(txs ?? []);
      if (editingTransactionId === tx.id) {
        setEditingTransactionId(null);
        setTxForm({ type: "ايداع" as TransactionType, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1, paymentType: "قاصه" });
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
        kind === "مطلوب" &&
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
        const monthNote = installments > 1
          ? `قسط ${i + 1}/${installments}${txForm.notes ? ` - ${txForm.notes}` : ""}`
          : (txForm.notes || null);

        const transactionPayload = {
          partnerName: editingKey,
          kind: form.kind,
          type: txForm.type,
          amount,
          date: dateStr_i,
          notes: monthNote,
          currency: txCurrency,
          paymentType: txForm.paymentType,
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
      await loadPartner({ partner_name: editingKey, phone: form.phone, total_amount: 0, kind: form.kind }, true);
      await onRefresh();
      setShowTxModal(false);
    } catch (err) {
      console.error(err);
      alert("تعذر إضافة المعاملة.");
    } finally {
      setSaving(false);
    }
  };

  const totalDeposits = transactions
    .filter((t) => t.type_ === "ايداع")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = transactions
    .filter((t) => t.type_ === "سحب")
    .reduce((sum, t) => sum + t.amount, 0);
  const hasInstallmentSchedule = transactions.some(isInstallmentWithdrawal);
  const displayTotalDebt = hasInstallmentSchedule
    ? totalWithdrawals + totalDeposits
    : totalWithdrawals;
  const displayRemainingDebt = hasInstallmentSchedule
    ? totalWithdrawals
    : Math.max(0, totalWithdrawals - totalDeposits);
  const currentInstallment = (() => {
    const withdrawals = transactions
      .filter((t) => t.type_ === "سحب" && t.amount > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (withdrawals.length === 0) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = withdrawals.find((tx) => {
      const due = new Date(tx.date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() >= today.getTime();
    });
    return (next ?? withdrawals[withdrawals.length - 1]).amount;
  })();

  return (
    <div className="customers-page">
      {kind === "مطلوب" && (
        <div className="cars-tabs" style={{ marginBottom: "1.2rem" }}>
          <button
            type="button"
            className={`cars-tab cars-tab--available ${debtsSubTab === "us" ? "cars-tab--active" : ""}`}
            onClick={() => setDebtsSubTab("us")}
          >
            لنا
            <span className="cars-tab__count">
              {myPartners.filter((p) => {
                const fin = partnerFinances.get(p.partner_name);
                return fin ? !(fin.remainingIqd < 0 || fin.remainingUsd < 0) : true;
              }).length}
            </span>
          </button>
          <button
            type="button"
            className={`cars-tab cars-tab--sold ${debtsSubTab === "them" ? "cars-tab--active" : ""}`}
            onClick={() => setDebtsSubTab("them")}
          >
            علينا
            <span className="cars-tab__count">
              {myPartners.filter((p) => {
                const fin = partnerFinances.get(p.partner_name);
                return fin ? (fin.remainingIqd < 0 || fin.remainingUsd < 0) : false;
              }).length}
            </span>
          </button>
        </div>
      )}
      <section className="main-card customers-main-card">
        <div className="card-toolbar customers-toolbar partners-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="card-header card-header--inline customers-title partners-title" style={{ margin: 0 }}>
            {kind === "مطلوب" ? "الديون" : kind === "مستثمر" ? "المستثمرون" : "الشركاء"} ({kind === "مطلوب" ? visibleDebtors.length : myPartners.length})
          </h3>
          <div className="partners-toolbar-buttons">
            <ActionButton type="button" variant="primary" onClick={startNew}>
              + إضافة {kind === "مطلوب" ? "دين" : kind}
            </ActionButton>
          </div>
          
          <div className="partners-toolbar-cards">
            <div className="summary-card-premium summary-card-premium--iqd">
              <div className="summary-card-premium__label">
                {kind === "مطلوب"
                  ? (debtsSubTab === "us" ? "إجمالي لنا بالدينار" : "إجمالي علينا بالدينار")
                  : kind === "مستثمر" ? "إجمالي الاستثمار بالدينار" : "إجمالي الشركاء بالدينار"}
              </div>
              <PriceDisplay amount={activeCurrencyTotals[0]} />
            </div>
            <div className="summary-card-premium summary-card-premium--usd">
              <div className="summary-card-premium__label">
                {kind === "مطلوب"
                  ? (debtsSubTab === "us" ? "إجمالي لنا بالدولار" : "إجمالي علينا بالدولار")
                  : kind === "مستثمر" ? "إجمالي الاستثمار بالدولار" : "إجمالي الشركاء بالدولار"}
              </div>
              <PriceDisplay amount={activeCurrencyTotals[1]} currency="USD" />
            </div>
          </div>
        </div>

        <div className="table-wrapper partner-debtors-scroll">
          <table className={`data-table partners-data-table${kind === "مطلوب" ? " partners-data-table--debtors" : ""}`}>
            {kind === "مطلوب" ? (<>
              <thead>
                <tr>
                  <th className="cell-num" style={{ width: "35px" }}>ت</th>
                  <th className="col-name">الاسم</th>
                  <th className="col-phone">رقم الهاتف</th>
                  <th className="col-money">المتبقي</th>
                  <th className="col-money">القسط القادم</th>
                  <th className="col-due">الدفعة القادمة</th>
                  <th className="col-delete" style={{ width: "40px" }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleDebtors.map((partner, idx) => {
                  const fin = partnerFinances.get(partner.partner_name);
                  let countdown = null;
                  let badgeClass = "";
                  if (fin?.nextDueDate) {
                    const due = new Date(fin.nextDueDate);
                    due.setHours(0, 0, 0, 0);
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const diff = Math.trunc((due.getTime() - now.getTime()) / 86400000);
                    if (diff < 0) {
                      countdown = `متأخر ${Math.abs(diff)} أيام`;
                      badgeClass = "countdown-badge--overdue";
                    } else if (diff === 0) {
                      countdown = `يستحق اليوم`;
                      badgeClass = "countdown-badge--due-today";
                    } else {
                      countdown = `متبقي ${diff} أيام`;
                      badgeClass = "countdown-badge--upcoming";
                    }
                  }
                  return (
                    <tr
                      key={partner.partner_name}
                      className="customers-tr"
                      onClick={() => loadPartner(partner)}
                      title="اضغط لعرض التفاصيل"
                    >
                      <td className="cell-num">{idx + 1}</td>
                      <td className="col-name cell-bold">{partner.partner_name}</td>
                      <td className="col-phone">{partner.phone || "—"}</td>
                      <td className="col-money cell-bold">
                        {financesLoading ? "—" : (
                          <div style={{ display: "inline-flex", flexDirection: "column", gap: "2px", alignItems: "flex-end", width: "100%" }}>
                            {fin && fin.remainingIqd !== 0 && (
                              <span className={fin.remainingIqd > 0 ? "text-red" : "text-green"}>
                                <PriceDisplay amount={Math.abs(fin.remainingIqd)} />
                              </span>
                            )}
                            {fin && fin.remainingUsd !== 0 && (
                              <span className={fin.remainingUsd > 0 ? "text-red" : "text-green"}>
                                <PriceDisplay amount={Math.abs(fin.remainingUsd)} currency="USD" />
                              </span>
                            )}
                            {fin && fin.remainingIqd === 0 && fin.remainingUsd === 0 && (
                              <span className="text-green">0</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="col-money cell-bold" style={{ color: "#60a5fa" }}>
                        {financesLoading ? "—" : (
                          <PriceDisplay
                            amount={fin ? fin.installmentAmount : 0}
                            currency={fin && fin.installmentCurrency === "USD" ? "USD" : "IQD"}
                          />
                        )}
                      </td>
                      <td className="col-due">
                        {financesLoading ? (
                          "—"
                        ) : countdown ? (
                          <span className={`countdown-badge ${badgeClass}`}>
                            {countdown}
                          </span>
                        ) : (
                          <span className="badge badge--complete">مكتمل</span>
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
                {visibleDebtors.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      {debtsSubTab === "us" ? "لا توجد ديون لنا" : "لا توجد ديون علينا"}
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
                  const pKind = partner.kind || kind;
                  const sameKind = myPartners.filter((p) => (p.kind || kind) === kind);
                  const totalSameKind = sameKind.reduce((sum, p) => sum + p.total_amount, 0);
                  const ratio = totalSameKind > 0 ? (partner.total_amount / totalSameKind) * 100 : 0;
                  return (
                    <tr
                      key={partner.partner_name}
                      className="customers-tr"
                      onClick={() => loadPartner(partner)}
                      title="اضغط لعرض التفاصيل"
                    >
                      <td className="cell-num">{idx + 1}</td>
                      <td>
                        <span className={`badge ${pKind === "مستثمر" ? "badge--info" : "badge--primary"}`}>
                          {pKind}
                        </span>
                      </td>
                      <td className="col-name cell-bold">{partner.partner_name}</td>
                      <td className="col-phone">{partner.phone || "—"}</td>
                      <td className={`col-money cell-bold ${partner.total_amount >= 0 ? "text-green" : "text-red"}`}>
                        <PriceDisplay amount={partner.total_amount} />
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
                      لا يوجد {kind === "مستثمر" ? "مستثمرون" : "شركاء"}
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
            className={`modal-dialog ${
              modalMode === "view" ? "modal-dialog--partner modal-dialog--car modal-dialog--wide" : "modal-dialog--slim"
            }`}
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
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">📅 القسط الشهري</span>
                        <span className="partner-summary-field__value partner-summary-field__value--installment">
                          <PriceDisplay amount={currentInstallment} />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">💼 صافي المبلغ</span>
                        <span className="partner-summary-field__value">
                          <PriceDisplay amount={totalDeposits - totalWithdrawals} />
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="partner-main-content">
                <div className="car-form-panel__header">
                  <h3 className="car-form-panel__title">
                    {modalMode === "new"
                      ? `إضافة ${kind}`
                      : `سجل حركات الحساب: ${form.name}`}
                  </h3>
                </div>

                {modalMode !== "view" && (
                <form className="form customer-form partner-identity-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="label" htmlFor="partner-name">
                      اسم {kind}
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
                  <div className="car-form-panel__actions">
                    <ActionButton type="submit" variant="success" disabled={saving}>
                      {saving ? "جاري الحفظ..." : `حفظ ${kind}`}
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
                                <th className="col-seq">
                                  <button type="button" className="th-sort-btn" onClick={() => handleSortTransactions("sequence")}>
                                    ت {transactionSort.key === "sequence" ? (transactionSort.direction === "asc" ? "▲" : "▼") : ""}
                                  </button>
                                </th>
                                <th className="col-date">
                                  <button type="button" className="th-sort-btn" onClick={() => handleSortTransactions("date")}>
                                    التاريخ {transactionSort.key === "date" ? (transactionSort.direction === "asc" ? "▲" : "▼") : ""}
                                  </button>
                                </th>
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
                                return (
                                  <tr
                                    key={tx.id}
                                    className={`partner-tx-row ${tx.type_ === "ايداع" ? "partner-tx-row--deposit" : "partner-tx-row--withdraw"}`}
                                    title="اضغط لتعديل المعاملة"
                                    onClick={() => beginEditTransaction(tx)}
                                  >
                                    <td className="cell-num col-seq">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                                    <td className="col-date">{tx.date}</td>
                                    <td className="col-type">
                                      <span className={tx.type_ === "سحب" ? "tx-type-withdraw" : "tx-type-deposit"}>
                                        {tx.type_ === "سحب" ? "سحب" : "إيداع"}
                                      </span>
                                    </td>
                                    <td className="col-account">
                                      <span className={`account-badge ${badgeClass}`}>
                                        {paymentTypeLabel}
                                      </span>
                                    </td>
                                    <td className="col-amount">
                                      <PriceDisplay amount={tx.type_ === "سحب" ? -tx.amount : tx.amount} currency={tx.currency} />
                                    </td>
                                    <td className="text-muted col-notes">{tx.notes || "—"}</td>
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

                    <div className="car-form-panel__actions partner-modal-actions" style={{ marginTop: "1rem" }}>
                    <ActionButton
                      type="button"
                      variant="success"
                      onClick={openDepositForm}
                    >
                      {kind === "مطلوب" ? "تسديد" : "إيداع"}
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant={kind === "مطلوب" ? "primary" : "secondary"}
                      onClick={openWithdrawForm}
                    >
                      {kind === "مطلوب" ? "إضافة دين" : "سحب"}
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
            style={{ maxWidth: 480 }}
          >
            <h3 className="modal-dialog__title">
              {editingTransactionId ? "تحديث المعاملة" : `إضافة معاملة - ${form.name}`}
            </h3>

            {kind === "مطلوب" && (
              <div style={{ margin: "0 0 1rem", display: "flex", justifyContent: "center" }}>
                <ElegantSwitch
                  checked={txForm.type === "ايداع"}
                  onChange={(checked) => {
                    setTxForm({ ...txForm, type: checked ? "ايداع" : "سحب" });
                  }}
                  offLabel="المتبقي"
                  onLabel="تسديد"
                  offColor="#f59e0b"
                  onColor="#10b981"
                  direction="horizontal"
                />
              </div>
            )}

            <form className="form" onSubmit={handleAddTransaction}>
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

              <div className="form-group">
                <label className="label">طريقة الدفع</label>
                <div className="payment-type-selector">
                  {(["قاصه", "ماستر", "مصرف"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`payment-type-btn payment-type-btn--${opt === "قاصه" ? "qasa" : opt === "ماستر" ? "master" : "bank"} ${txForm.paymentType === opt ? "payment-type-btn--active" : ""}`}
                      onClick={() => setTxForm({ ...txForm, paymentType: opt })}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

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
