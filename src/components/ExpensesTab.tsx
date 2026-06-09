import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import type { ExpenseEntry, Partner } from "../types";
import { ActionButton, TextInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import "../styles/expenses.css";
import "../styles/cards.css";
import "../styles/agencies.css";

export function ExpensesTab() {
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

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount) return;
    await callTauri("add_expense", {
      description: description.trim(),
      amount: Number(amount),
      date,
      notes: notes.trim() || null,
      currency,
    });

    // ═══════════════════════════════════════════════
    //  توزيع المصروف تلقائياً على الشركاء كـ سحب مصروف
    // ═══════════════════════════════════════════════
    const expenseAmount = Number(amount) || 0;
    if (expenseAmount > 0) {
      try {
        const allPartners = await callTauri<Partner[]>("get_partners");
        const kindPartners = allPartners.filter((p) => p.kind === "شريك");
        const totalPartnerCapital = kindPartners.reduce((sum, p) => sum + p.total_amount, 0);

        if (kindPartners.length > 0) {
          for (const partner of kindPartners) {
            let partnerShare = 0;
            if (totalPartnerCapital > 0) {
              partnerShare = (partner.total_amount / totalPartnerCapital) * expenseAmount;
            } else {
              partnerShare = expenseAmount / kindPartners.length;
            }

            partnerShare = Math.round(partnerShare);

            if (partnerShare > 0) {
              const formattedShare = currency === "USD"
                ? `${partnerShare.toLocaleString("en-US")} USD`
                : `${partnerShare.toLocaleString("en-US")} IQ`;

              const note = `سحب مصروف بقيمة ${formattedShare} لـ ${description.trim()}`;

              await callTauri("add_partner_transaction", {
                partnerName: partner.partner_name,
                kind: "شريك",
                type: "سحب مصروف",
                amount: partnerShare,
                date: date,
                notes: note,
                currency: currency,
                paymentType: "قاصه",
                payment_type: "قاصه",
              });
            }
          }
        }
      } catch (err) {
        console.error("فشل توزيع المصروف على الشركاء:", err);
      }
    }

    setDescription("");
    setAmount("");
    setNotes("");
    setDate(todayIsoDate());
    void load();
  };

  const handleDelete = async (id: number) => {
    await callTauri("delete_expense", { id });
    void load();
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

  const expenseIqd = entries.filter((e) => e.currency !== "USD").reduce((sum, e) => sum + e.amount, 0);
  const expenseUsd = entries.filter((e) => e.currency === "USD").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="dashboard">
      {/* ── شريط الأدوات الموحد في الأعلى ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <ActionButton type="button" variant="primary" className="btn-new-car" onClick={() => setShowAddModal(true)}>
            + إضافة مصروف
          </ActionButton>
        </div>
        <div className="unified-toolbar__center"></div>
        <div className="unified-toolbar__left">
          <div className="currency-card currency-card--usd">
            <PriceDisplay amount={expenseUsd} currency="USD" />
          </div>
          <div className="currency-card currency-card--iqd">
            <PriceDisplay amount={expenseIqd} />
          </div>
        </div>
      </div>

      {/* ── نافذة إضافة مصروف منبثقة ── */}
      {showAddModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-dialog modal-dialog--has-header"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px" }}
          >
            {/* رأس النافذة */}
            <div className="modal-dialog__header">
              <h2 className="modal-dialog__header-title">
                <span style={{ fontSize: "1.2rem", background: "none" }}>💸</span>
                إضافة مصروف جديد
              </h2>
              <button type="button" className="modal-dialog__close" onClick={() => setShowAddModal(false)}>×</button>
            </div>

            <form
              className="modal-dialog__body"
              onSubmit={(e) => {
                void handleAdd(e);
                setShowAddModal(false);
              }}
            >
              {/* ── قسم البيان والمبلغ ── */}
              <div className="agency-section">
                <div className="agency-section__title">تفاصيل المصروف</div>
                <div className="agency-fields-row" style={{ alignItems: "flex-start" }}>
                  <div className="agency-field agency-field--lg" style={{ flex: "2 1 220px" }}>
                    <label className="agency-label">البيان *</label>
                    <TextInput
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      placeholder="وصف المصروف"
                      autoFocus
                    />
                  </div>
                  <div className="agency-field agency-field--lg" style={{ flex: "1 1 160px" }}>
                    <label className="agency-label">المبلغ *</label>
                    <PriceInput
                      value={amount}
                      onChange={setAmount}
                      required
                      currency={currency}
                      onCurrencyChange={setCurrency}
                    />
                  </div>
                </div>
              </div>

              {/* ── قسم التاريخ والملاحظة ── */}
              <div className="agency-section">
                <div className="agency-section__title">معلومات إضافية</div>
                <div className="agency-fields-row" style={{ alignItems: "flex-start" }}>
                  <div className="agency-field agency-field--md">
                    <label className="agency-label">التاريخ</label>
                    <UnifiedDateField value={date} onChange={setDate} />
                  </div>
                  <div className="agency-field agency-field--lg">
                    <label className="agency-label">ملاحظة</label>
                    <TextInput
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="اختياري"
                    />
                  </div>
                </div>
              </div>

              {/* زر submit مخفي — الإرسال بضغط Enter */}
              <button type="submit" style={{ display: "none" }} />
            </form>
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
                <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{ width: 200 ,cursor: "pointer" }}>المبلغ</th>
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
                  <tr key={entry.id}>
                    <td className="cell-num">{entry.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                    <td>{entry.description}</td>
                    <td className="col-money"><PriceDisplay amount={entry.amount} currency={entry.currency} /></td>
                    <td style={{ fontSize: "var(--fs-sm)" }}>{entry.notes || ""}</td>
                    <td>
                      <button
                        type="button"
                        className="partner-inline-delete-btn"
                        onClick={() => handleDelete(entry.id)}
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
    </div>
  );
}
