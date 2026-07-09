import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callTauri } from "../api/tauri";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import type { ExpenseEntry } from "../types";
import { ActionButton, TextInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { formatNotesText } from "../utils/notesDisplay";
import { ConfirmDialog } from "./ConfirmDialog";
import { GoldFxButton } from "./ui/GoldFxButton";
import { compareMoney, moneySum, type MoneyValue } from "../utils/money";
import { ProfitDistributionTab } from "./ProfitDistributionTab";

interface ExpensesTabProps {
  onAddExpenseChange?: (onAddExpense: { action: () => void } | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  requestCloseRef?: React.MutableRefObject<{ request: (afterClose?: () => void) => void } | null>;
  onDistributeChange?: (onDistribute: { action: () => void } | null) => void;
  fromDate?: string;
  toDate?: string;
  initialSubTab?: "expenses" | "profit";
  onSubTabChange?: (tab: "expenses" | "profit") => void;
}

export function ExpensesTab({
  onAddExpenseChange,
  onDirtyChange,
  requestCloseRef,
  onDistributeChange,
  fromDate,
  toDate,
  initialSubTab,
  onSubTabChange,
}: ExpensesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"expenses" | "profit">(initialSubTab || "expenses");
  const [profitTotals, setProfitTotals] = useState<{ usd: MoneyValue; iqd: MoneyValue }>({ usd: 0, iqd: 0 });

  const handleProfitSummaryLoaded = useCallback((usd: MoneyValue, iqd: MoneyValue) => {
    setProfitTotals((previous) => {
      if (compareMoney(previous.usd, usd) === 0 && compareMoney(previous.iqd, iqd) === 0) {
        return previous;
      }
      return { usd, iqd };
    });
  }, []);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  useEffect(() => {
    onSubTabChange?.(activeSubTab);
  }, [activeSubTab, onSubTabChange]);

  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("IQD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [page, setPage] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState<ExpenseEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showExpenseSaveConfirm, setShowExpenseSaveConfirm] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const initialExpenseRef = useRef("");
  const pendingExpenseCloseRef = useRef<(() => void) | null>(null);
  const expenseFormDirty = useMemo(() => {
    if (!showAddModal) return false;
    const current = JSON.stringify({ description, amount, date, notes, currency });
    return current !== initialExpenseRef.current;
  }, [description, amount, date, notes, currency, showAddModal]);

  const isDirty = showAddModal && expenseFormDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = {
      request: (afterClose?: () => void) => {
        if (isDirty) {
          pendingExpenseCloseRef.current = afterClose ?? null;
          setShowExpenseSaveConfirm(true);
        } else {
          afterClose?.();
        }
      },
    };
    return () => { requestCloseRef.current = null; };
  }, []);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [entries.length]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callTauri<ExpenseEntry[]>("get_expenses");
      setEntries(data ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!showAddModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseModal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAddModal]);

  const handleCloseModal = () => {
    if (expenseFormDirty) {
      setShowExpenseSaveConfirm(true);
      return;
    }
    forceCloseModal();
  };

  const forceCloseModal = () => {
    setDescription("");
    setAmount("");
    setDate(todayIsoDate());
    setNotes("");
    setCurrency("IQD");
    setEditingExpense(null);
    setShowAddModal(false);
    setFormError(null);
    initialExpenseRef.current = "";
  };

  const validateExpenseForm = (): boolean => {
    let hasError = false;
    const descInput = document.getElementById("expense-description") as HTMLElement | null;
    const amountInput = document.getElementById("expense-amount") as HTMLElement | null;
    const dateInput = document.getElementById("expense-date") as HTMLElement | null;

    if (!description.trim()) {
      descInput?.classList.add("input--error");
      if (!hasError) descInput?.focus();
      hasError = true;
    } else {
      descInput?.classList.remove("input--error");
    }

    if (!amount || Number(amount) <= 0) {
      amountInput?.classList.add("input--error");
      if (!hasError) amountInput?.focus();
      hasError = true;
    } else {
      amountInput?.classList.remove("input--error");
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      dateInput?.classList.add("input--error");
      if (!hasError) dateInput?.focus();
      hasError = true;
    } else {
      dateInput?.classList.remove("input--error");
    }

    return !hasError;
  };

  const saveExpense = async () => {
    if (editingExpense) {
      await callTauri("update_expense", {
        id: editingExpense.id,
        description: description.trim(),
        amount: Number(amount),
        date,
        notes: notes.trim() || null,
        currency,
      });
    } else {
      await callTauri("add_expense", {
        description: description.trim(),
        amount: Number(amount),
        date,
        notes: notes.trim() || null,
        currency,
      });
    }
  };

  const handleExpenseSaveConfirmSave = async () => {
    setShowExpenseSaveConfirm(false);
    if (!validateExpenseForm()) return;
    try {
      await saveExpense();
      forceCloseModal();
      void load();
      pendingExpenseCloseRef.current?.();
      pendingExpenseCloseRef.current = null;
    } catch (err) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : "فشل حفظ المصروف");
    }
  };

  const handleExpenseSaveConfirmDiscard = () => {
    setShowExpenseSaveConfirm(false);
    forceCloseModal();
    pendingExpenseCloseRef.current?.();
    pendingExpenseCloseRef.current = null;
  };

  const handleRowClick = (expense: ExpenseEntry) => {
    setEditingExpense(expense);
    setDescription(expense.description);
    setAmount(String(expense.amount));
    setDate(expense.date);
    setNotes(expense.notes || "");
    setCurrency((expense.currency as Currency) || "IQD");
    initialExpenseRef.current = JSON.stringify({
      description: expense.description,
      amount: String(expense.amount),
      date: expense.date,
      notes: expense.notes || "",
      currency: (expense.currency as Currency) || "IQD",
    });
    setShowAddModal(true);
  };

  useEffect(() => {
    if (activeSubTab === "expenses") {
      onAddExpenseChange?.({
        action: () => {
          handleCloseModal();
          initialExpenseRef.current = JSON.stringify({
            description: "",
            amount: "",
            date: todayIsoDate(),
            notes: "",
            currency: "IQD",
          });
          setShowAddModal(true);
        },
      });
    } else {
      onAddExpenseChange?.(null);
    }
    return () => {
      onAddExpenseChange?.(null);
    };
  }, [onAddExpenseChange, activeSubTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseSaving) return;
    if (!validateExpenseForm()) return;

    setExpenseSaving(true);
    try {
      await saveExpense();
      forceCloseModal();
      void load();
    } catch (err) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : "فشل حفظ المصروف");
    } finally {
      setExpenseSaving(false);
    }
  };

  const handleDeleteClick = (expense: ExpenseEntry) => {
    setDeleteExpenseConfirm(expense);
  };

  const executeDelete = async () => {
    if (!deleteExpenseConfirm) return;
    setDeleting(true);
    try {
      await callTauri("delete_expense", { id: deleteExpenseConfirm.id });
      setDeleteExpenseConfirm(null);
      void load();
    } catch (err) {
      console.error("Failed to delete expense:", err);
      const message = err instanceof Error ? err.message : "فشل حذف المصروف";
      setFormError(message);
      alert(message);
      setDeleteExpenseConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedEntries = useMemo(() => {
    if (!sortConfig) return entries;
    const { key, direction } = sortConfig;
    const sign = direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      if (key === "id" || key === "amount") {
        return (Number(a[key] ?? 0) - Number(b[key] ?? 0)) * sign;
      }
      if (key === "date") {
        const dtA = `${a.date}T${a.time || "00:00"}`;
        const dtB = `${b.date}T${b.time || "00:00"}`;
        return dtA.localeCompare(dtB) * sign;
      }
      const valA = String(a[key as keyof ExpenseEntry] ?? "");
      const valB = String(b[key as keyof ExpenseEntry] ?? "");
      return valA.localeCompare(valB, "ar", { numeric: true }) * sign;
    });
  }, [entries, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => sortedEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedEntries, currentPage]
  );

  // Fixed: expense cards aggregate Decimal-compatible values from Rust instead of JS float addition.
  const expenseIqd = moneySum(entries.filter((e) => e.currency !== "USD"), (e) => e.amount);
  const expenseUsd = moneySum(entries.filter((e) => e.currency === "USD"), (e) => e.amount);

  return (
    <div className="dashboard">
      {/* ── شريط الأدوات الموحد في الأعلى ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <div className="cars-tabs financial-tabs">
            <button
              type="button"
              className={`top-btn-one ${activeSubTab === "expenses" ? "top-btn-one--active" : ""}`}
              onClick={() => setActiveSubTab("expenses")}
            >
              المصروفات
            </button>
            <button
              type="button"
              className={`top-btn-two ${activeSubTab === "profit" ? "top-btn-two--active" : ""}`}
              onClick={() => setActiveSubTab("profit")}
            >
              الأرباح
            </button>
          </div>
        </div>
        <div className="unified-toolbar__center"></div>
        <div className="unified-toolbar__left">
          {activeSubTab === "expenses" ? (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={expenseUsd} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={expenseIqd} />
              </div>
            </>
          ) : (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={profitTotals.usd} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={profitTotals.iqd} />
              </div>
            </>
          )}
        </div>
      </div>

      {activeSubTab === "profit" ? (
        <ProfitDistributionTab
          onDistributeChange={onDistributeChange}
          fromDate={fromDate || ""}
          toDate={toDate || ""}
          hideToolbar={true}
          onSummaryLoaded={handleProfitSummaryLoaded}
        />
      ) : (
        <>

          {/* ── نافذة إضافة مصروف منبثقة ── */}
          {showAddModal && (
            <div className="modal-overlay" role="presentation" onClick={handleCloseModal}>
              <div
                className="modal-dialog modal-dialog--has-header"
                role="dialog"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "520px" }}
              >
                {/* رأس النافذة */}
                <div className="modal-dialog__header">
                  <h2 className="modal-dialog__header-title" style={{ color: "var(--labletext)" }}>
                    {editingExpense ? "تعديل المصروف" : "إضافة مصروف جديد"}
                  </h2>
                  <button type="button" className="modal-dialog__close" onClick={handleCloseModal}>×</button>
                </div>

                <form
                  className="modal-dialog__body"
                  onSubmit={(e) => {
                    void handleSubmit(e);
                  }}
                >
                  {formError && (
                    <div className="alert alert--error" role="alert" style={{ marginBottom: "12px" }}>
                      {formError}
                    </div>
                  )}
                  <div className="agency-fields-row" style={{ alignItems: "flex-start" }}>
                    <div className="agency-field agency-field--lg" style={{ flex: "2 1 220px" }}>
                      <label className="agency-label" style={{ color: "var(--textinputlabletext)" }}>وصف المصروف</label>
                      <TextInput
                        id="expense-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="agency-field agency-field--lg" style={{ flex: "1 1 160px" }}>
                      <label className="agency-label" style={{ color: "var(--textinputlabletext)" }}>المبلغ</label>
                      <PriceInput
                        id="expense-amount"
                        value={amount}
                        onChange={setAmount}
                        required
                        currency={currency}
                        onCurrencyChange={setCurrency}
                      />
                    </div>
                    <div className="agency-field agency-field--md">
                      <label className="agency-label" style={{ color: "var(--textinputlabletext)" }}>التاريخ</label>
                      <UnifiedDateField id="expense-date" value={date} onChange={setDate} />
                    </div>
                    <div className="agency-field agency-field--lg">
                      <label className="agency-label" style={{ color: "var(--textinputlabletext)" }}>ملاحظة</label>
                      <TextInput
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* ── أزرار العمليات ── */}
                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <GoldFxButton
                      type="submit"
                      variant="green"
                      style={{ flex: 1, margin: 0 }}
                      disabled={expenseSaving}
                    >

                      <span className="gold-fx-btn__label">{expenseSaving ? "جاري الحفظ..." : "حفظ"}</span>
                    </GoldFxButton>
                    <GoldFxButton
                      type="button"
                      variant="gray"
                      style={{ flex: 1, margin: 0, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)" }}
                      onClick={handleCloseModal}
                    >
                      <span className="gold-fx-btn__label">إلغاء الأمر</span>
                    </GoldFxButton>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ── نافذة تأكيد حفظ التعديلات في المصروف ── */}
          {showExpenseSaveConfirm && (
            <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowExpenseSaveConfirm(false)}>
              <div
                className="fx-confirm-dialog"
                role="alertdialog"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="fx-confirm-title">هل تريد حفظ التعديلات؟</h3>
                <p className="fx-confirm-message">
                  لديك تعديلات غير محفوظة. هل تريد حفظها قبل المغادرة؟
                </p>
                <div className="fx-confirm-actions">
                  <ActionButton
                    type="button"
                    variant="success"
                    onClick={() => void handleExpenseSaveConfirmSave()}
                    disabled={deleting}
                  >
                    {deleting ? "جاري الحفظ..." : "حفظ"}
                  </ActionButton>
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={handleExpenseSaveConfirmDiscard}
                    disabled={deleting}
                  >
                    تجاهل التغييرات
                  </ActionButton>
                </div>
              </div>
            </div>
          )}

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
            <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th className={`cell-num ${sortConfig?.key === "id" ? "th--sorted" : ""}`} onClick={() => handleSort("id")} style={{ width: "40px", cursor: "pointer" }}>ت</th>
                    <th className={sortConfig?.key === "date" ? "th--sorted" : ""} onClick={() => handleSort("date")} style={{ width: "110px", cursor: "pointer" }}>التاريخ</th>
                    <th className={sortConfig?.key === "time" ? "th--sorted" : ""} onClick={() => handleSort("time")} style={{ width: "60px", cursor: "pointer" }}>الساعة</th>
                    <th className={sortConfig?.key === "description" ? "th--sorted" : ""} onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>البيان</th>
                    <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{ width: 200, cursor: "pointer" }}>المبلغ</th>
                    <th className={sortConfig?.key === "notes" ? "th--sorted" : ""} onClick={() => handleSort("notes")} style={{ cursor: "pointer" }}>ملاحظات</th>
                    <th style={{ width: "50px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="empty-cell">جاري التحميل...</td></tr>
                  ) : entries.length === 0 ? (
                    <tr><td colSpan={7} className="empty-cell">لا توجد مصروفات بعد</td></tr>
                  ) : (
                    pageEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        onClick={() => handleRowClick(entry)}
                        style={{ cursor: "pointer" }}
                        className="clickable-row"
                      >
                        <td className="cell-num">{entry.id}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                        <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                        <td>{entry.description}</td>
                        <td className="col-money"><PriceDisplay amount={entry.amount} currency={entry.currency} /></td>
                        <td className="cell-notes-text" title={formatNotesText(entry.notes) || undefined}>{formatNotesText(entry.notes) || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="partner-inline-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(entry);
                            }}
                            title="حذف"
                            aria-label="حذف المصروف"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                  {Array.from({ length: Math.max(0, PAGE_SIZE - pageEntries.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="opacity-25">
                      <td className="cell-num">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <ConfirmDialog
            open={!!deleteExpenseConfirm}
            title="تأكيد حذف المصروف"
            message={`هل أنت متأكد من حذف المصروف «${deleteExpenseConfirm?.description || ""}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`}
            confirmLabel="نعم، احذف"
            cancelLabel="إلغاء"
            danger
            loading={deleting}
            onConfirm={() => void executeDelete()}
            onCancel={() => setDeleteExpenseConfirm(null)}
          />
        </>
      )}
    </div>
  );
}
