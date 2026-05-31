import { useEffect, useMemo, useRef, useState } from "react";
import { callTauri } from "../api/tauri";
import type { Partner, PartnerTransaction } from "../types";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { ElegantSwitch } from "./ElegantSwitch";
import { NumberInput } from "./NumberInput";
import { UnifiedDateField } from "./UnifiedDateField";

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


export function PartnersTab({ partners, onRefresh, kind }: PartnersTabProps) {
  const [form, setForm] = useState(createEmptyForm(kind));
  const formRef = useRef(createEmptyForm(kind));
  const myPartners = useMemo(() => partners.filter((p) => (p.kind || kind) === kind), [partners, kind]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTxConfirm, setDeleteTxConfirm] = useState<PartnerTransaction | null>(null);
  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const [txForm, setTxForm] = useState({
    type: "ايداع" as TransactionType,
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    installments: 1,
  });
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [transactionSort, setTransactionSort] = useState<{
    key: TransactionSortKey;
    direction: SortDirection;
  }>({ key: "date", direction: "asc" });
  const transactionListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollTransactionsRef = useRef(false);
  const [partnerFinances, setPartnerFinances] = useState<Map<string, {
    totalDebt: number;
    totalPaid: number;
    remaining: number;
    installmentAmount: number;
    nextDueDate: string | null;
  }>>(new Map());
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
    replaceForm({ name: partner.partner_name, phone: partner.phone, kind: partner.kind });
    setModalMode("view");
    setEditingTransactionId(null);
    setTransactionSort({ key: "date", direction: "asc" });
    if (!preserveType) {
      setTxForm({ type: "ايداع", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1 });
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
    replaceForm(createEmptyForm(kind));
    setModalMode(null);
    setDeleteDialogOpen(false);
    setTransactions([]);
    setEditingTransactionId(null);
  };

  const startNew = () => {
    setEditingKey(null);
    replaceForm(createEmptyForm(kind));
    setModalMode("new");
  };

  const patchPhone = (value: string) => {
    patchForm({ phone: value });
  };

  const patchName = (value: string) => {
    patchForm({ name: englishKeyboardToArabic(value) });
  };

  const resetTransactionForm = (type: TransactionType = txForm.type) => {
    setEditingTransactionId(null);
    setTxForm({ type, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1 });
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
    setTxForm({
      type: tx.type_ === "سحب" ? "سحب" : "ايداع",
      amount: tx.amount,
      date: tx.date?.split(" ")[0] || new Date().toISOString().slice(0, 10),
      notes: tx.notes ?? "",
      installments: 1,
    });
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

  const sequenceByTransactionId = useMemo(() => {
    return new Map(transactions.map((tx, index) => [tx.id, index + 1]));
  }, [transactions]);

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
        totalDebt: number;
        totalPaid: number;
        remaining: number;
        installmentAmount: number;
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
          const totalDebt = withdrawals.reduce((s, t) => s + t.amount, 0);
          const totalPaid = deposits.reduce((s, t) => s + t.amount, 0);
          const sortedDebts = [...withdrawals].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
          return [p.partner_name, { totalDebt, totalPaid, remaining: totalDebt, installmentAmount, nextDueDate }];
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
        setDeleteTxConfirm(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          old_name: editingKey,
          old_kind: form.kind,
          name: nextName,
          phone: phoneClean,
          kind: form.kind,
        });
        setEditingKey(nextName);
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
        setTxForm({ type: "ايداع" as TransactionType, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", installments: 1 });
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
      const installments = txForm.type === "سحب" && !editingTransactionId
        ? Math.max(1, Math.floor(Number(txForm.installments)) || 1)
        : 1;
      const periodAmount = Number.isFinite(txForm.amount) ? txForm.amount : 0;
      const installmentAmount = Math.floor(periodAmount / installments);
      const remainder = periodAmount - installmentAmount * installments;

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
  const currentInstallment = (() => {
    const withdrawals = transactions.filter((t) => t.type_ === "سحب");
    return withdrawals.length > 0 ? withdrawals[withdrawals.length - 1].amount : 0;
  })();

  return (
    <div className="customers-page">
      <section className="main-card customers-main-card">
        <div className="card-toolbar customers-toolbar partners-toolbar">
          <div className="partners-toolbar-buttons">
            <button type="button" className="btn btn--primary partners-add-btn" onClick={startNew}>
              + إضافة {kind}
            </button>
          </div>
          <h3 className="card-header card-header--inline customers-title partners-title">
            {kind === "مطلوب" ? "ديون العملاء" : kind === "مستثمر" ? "المستثمرون" : "الشركاء"} ({myPartners.length})
          </h3>
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
                {sortedDebtors.map((partner, idx) => {
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
                      <td className={`col-money cell-bold ${fin && fin.remaining > 0 ? "text-red" : "text-green"}`}>
                        {financesLoading ? "—" : fin ? fin.remaining.toLocaleString("en-US") : "0"}
                      </td>
                      <td className="col-money cell-bold" style={{ color: "#60a5fa" }}>
                        {financesLoading ? "—" : fin ? fin.installmentAmount.toLocaleString("en-US") : "0"}
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
                {sortedDebtors.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      لا يوجد ديون العملاء
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
                        {partner.total_amount.toLocaleString("en-US")}
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
        <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={resetForm}>
          <div
            className="modal-dialog modal-dialog--customer modal-dialog--partner"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="customer-form-panel partner-form-panel">
              {modalMode === "view" && (
                <div className="partner-summary-sidebar">
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">الاسم</span>
                    <span className="partner-summary-field__value">{form.name || "—"}</span>
                  </div>
                  <div className="partner-summary-field">
                    <span className="partner-summary-field__label">رقم الهاتف</span>
                    <span className="partner-summary-field__value" dir="ltr">{form.phone || "—"}</span>
                  </div>
                  {(kind === "مطلوب") ? (
                    <>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">المبلغ الكلي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--total">
                          {(totalWithdrawals + totalDeposits).toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">تم تسديد</span>
                        <span className="partner-summary-field__value partner-summary-field__value--paid">
                          {totalDeposits.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">المتبقي</span>
                        <span className="partner-summary-field__value partner-summary-field__value--remaining">
                          {totalWithdrawals.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="partner-summary-field">
                        <span className="partner-summary-field__label">القسط الشهري</span>
                        <span className="partner-summary-field__value partner-summary-field__value--installment">
                          {currentInstallment.toLocaleString("en-US")}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="partner-summary-field">
                      <span className="partner-summary-field__label">صافي المبلغ</span>
                      <span className="partner-summary-field__value">
                        {(totalDeposits - totalWithdrawals).toLocaleString("en-US")}
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
                       : ""}
                  </h3>
                </div>

                {modalMode !== "view" && (
                <form className="form customer-form partner-identity-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="label" htmlFor="partner-name">
                      اسم {kind}
                    </label>
                    <input id="partner-name" className="input" type="text" value={form.name}
                      autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                      onInput={(e) => patchName(e.currentTarget.value)}
                      onChange={(e) => patchName(e.target.value)}
                      onBlur={(e) => patchName(e.currentTarget.value)}
                      placeholder="الاسم الثلاثي" />
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="partner-phone">
                      رقم الهاتف
                    </label>
                    <input id="partner-phone" className="input" type="text" value={form.phone}
                      autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                      dir="ltr" placeholder="077xxxxxxxx"
                      onInput={(e) => patchPhone(e.currentTarget.value)}
                      onChange={(e) => patchPhone(e.target.value)}
                      onBlur={(e) => patchPhone(e.currentTarget.value)} />
                  </div>
                  <div className="car-form-panel__actions">
                    <button type="submit" className="btn btn--success" disabled={saving}>
                      {saving ? "جاري الحفظ..." : `حفظ ${kind}`}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={resetForm}>
                      إلغاء
                    </button>
                  </div>
                </form>
                )}

                {modalMode === "view" && (
                  <>
                    <div className="partner-transactions-panel">
                      <h4 className="partner-section-title">
                        سجل المعاملات
                      </h4>
                      {transactionsLoading ? (
                        <p className="text-muted partner-empty-state">جاري التحميل...</p>
                      ) : transactions.length === 0 ? (
                        <p className="text-muted partner-empty-state">لا توجد معاملات بعد</p>
                      ) : (
                        <div className="table-wrapper partner-tx-wrapper" ref={transactionListRef}>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>
                                  <button type="button" className="th-sort-btn" onClick={() => handleSortTransactions("sequence")}>
                                    ت {transactionSort.key === "sequence" ? (transactionSort.direction === "asc" ? "▲" : "▼") : ""}
                                  </button>
                                </th>
                                <th>
                                  <button type="button" className="th-sort-btn" onClick={() => handleSortTransactions("date")}>
                                    التاريخ {transactionSort.key === "date" ? (transactionSort.direction === "asc" ? "▲" : "▼") : ""}
                                  </button>
                                </th>
                                <th>المبلغ</th>
                                <th>ملاحظة</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedTransactions.map((tx) => (
                                <tr
                                  key={tx.id}
                                  className={`partner-tx-row ${tx.type_ === "ايداع" ? "partner-tx-row--deposit" : "partner-tx-row--withdraw"}`}
                                  title="اضغط لتعديل المعاملة"
                                  onClick={() => beginEditTransaction(tx)}
                                >
                                  <td className="cell-num">{sequenceByTransactionId.get(tx.id) ?? tx.id}</td>
                                  <td>{tx.date}</td>
                                  <td className={tx.type_ === "ايداع" ? "text-green" : "text-red"}>
                                    {tx.amount.toLocaleString("en-US")}
                                  </td>
                                  <td className="text-muted">{tx.notes || "—"}</td>
                                  <td>
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
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="car-form-panel__actions partner-modal-actions" style={{ marginTop: "1rem" }}>
                      <button
                        type="button"
                        className="btn btn--withdraw"
                        onClick={openWithdrawForm}
                      >
                        {kind === "مطلوب" ? "إضافة دين" : "سحب"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--success"
                        onClick={openDepositForm}
                      >
                        {kind === "مطلوب" ? "تسديد" : "إيداع"}
                      </button>
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
        message={`هل تريد حذف هذه المعاملة بقيمة (${deleteTxConfirm?.amount.toLocaleString("en-US")})؟ لا يمكن التراجع عن هذا الإجراء.`}
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
                <NumberInput
                  value={String(txForm.amount)}
                  onChange={(amount) => setTxForm({ ...txForm, amount: Number(amount) || 0 })}
                  wheelMultiply={1000}
                />
              </div>

              {kind === "مطلوب" && txForm.type === "سحب" && !editingTransactionId && (
                <div className="form-group">
                  <label className="label">عدد الأشهر</label>
                  <NumberInput
                    value={String(txForm.installments)}
                    onChange={(installments) => setTxForm({ ...txForm, installments: Math.max(1, Number(installments) || 1) })}
                    min={1}
                  />
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

              <div className="modal-dialog__actions" style={{ marginTop: "1.5rem" }}>
                <button type="button" className="btn btn--ghost" onClick={() => setShowTxModal(false)}>
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`btn ${txForm.type === "ايداع" ? "btn--success" : "btn--withdraw"}`}
                  disabled={saving}
                >
                  {saving ? "جاري الحفظ..." : editingTransactionId ? "تحديث" : "إضافة"}
                </button>
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
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => { setShowDeleteModal(false); setPartnerToDelete(null); }}
                disabled={saving}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn--danger-solid"
                onClick={() => {
                  const p = partnerToDelete;
                  setShowDeleteModal(false);
                  setPartnerToDelete(null);
                  void executeInlineDelete(p.name, p.kind);
                }}
                disabled={saving}
              >
                {saving ? "جاري الحذف..." : "تأكيد الحذف النهائي"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
