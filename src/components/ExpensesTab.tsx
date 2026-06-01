import { useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import type { ExpenseEntry } from "../types";
import { ActionButton, TextInput, PriceInput, PriceDisplay } from "@/components/ui";
import type { Currency } from "@/components/ui";

export function ExpensesTab() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>("IQD");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");

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

  const totalExpenses = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="dashboard">
      <div className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 className="page-intro__title">المصروفات</h2>
          <p className="page-intro__desc">تسجيل وإدارة المصروفات</p>
        </div>
        <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--color-red)" }}>
          إجمالي المصروفات: <PriceDisplay amount={totalExpenses} />
        </span>
      </div>

      <section className="panel-card" style={{ marginBottom: "1rem" }}>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "2", minWidth: "200px" }}>
            <label className="cf-label">البيان</label>
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="وصف المصروف"
              autoFocus
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1", minWidth: "120px" }}>
            <label className="cf-label">المبلغ</label>
            <PriceInput value={amount} onChange={setAmount} required currency={currency} onCurrencyChange={setCurrency} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1", minWidth: "150px" }}>
            <label className="cf-label">التاريخ</label>
            <UnifiedDateField value={date} onChange={setDate} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1", minWidth: "140px" }}>
            <label className="cf-label">ملاحظة</label>
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
            />
          </div>
          <ActionButton type="submit" variant="primary">
            + إضافة مصروف
          </ActionButton>
        </form>
      </section>

      <section className="panel-card">
        <div className="table-wrapper" style={{ maxHeight: "60vh" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-num" style={{ width: "40px" }}>ت</th>
                <th style={{ width: "110px" }}>التاريخ</th>
                <th style={{ width: "60px" }}>الساعة</th>
                <th>البيان</th>
                <th className="col-money">المبلغ</th>
                <th>ملاحظات</th>
                <th style={{ width: "50px" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-cell">جاري التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">لا توجد مصروفات بعد</td></tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-num">{entry.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem", textAlign: "center" }}>{entry.time}</td>
                    <td>{entry.description}</td>
                    <td className="col-money"><PriceDisplay amount={entry.amount} currency={entry.currency} /></td>
                    <td style={{ fontSize: "0.85rem" }}>{entry.notes || ""}</td>
                    <td>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() => handleDelete(entry.id)}
                        title="حذف"
                      >
                        ✕
                      </ActionButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
