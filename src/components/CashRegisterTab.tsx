import { useEffect, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";

export function CashRegisterTab() {
  const [entries, setEntries] = useState<CashRegisterEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callTauri<CashRegisterEntry[]>("get_cash_register_entries");
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

  const currentBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;

  return (
    <div className="dashboard">
      <div className="page-intro" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 className="page-intro__title">القاصه</h2>
          <p className="page-intro__desc">سجل جميع المعاملات المالية</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
            الرصيد الحالي:{' '}
            <span className={currentBalance >= 0 ? "text-green" : "text-red"}>
              {currentBalance.toLocaleString("en-US")}
            </span>
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => void load()} style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}>
            ⟳ تحديث
          </button>
        </div>
      </div>

      <section className="panel-card">
        <div className="table-wrapper" style={{ maxHeight: "70vh" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-num" style={{ width: "40px" }}>ت</th>
                <th style={{ width: "110px" }}>تاريخ العملية</th>
                <th style={{ width: "60px" }}>الساعة</th>
                <th style={{ width: "150px" }}>نوع العملية</th>
                <th className="col-money">المبلغ</th>
                <th>التفاصيل</th>
                <th className="col-money">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-cell">جاري التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">لا توجد معاملات بعد</td></tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-num">{entry.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem", textAlign: "center" }}>{entry.time}</td>
                    <td>
                      <span className={`badge ${entry.amount >= 0 ? "badge--primary" : "badge--sold"}`}>
                        {entry.type_}
                      </span>
                    </td>
                    <td className={`col-money ${entry.amount >= 0 ? "text-green" : "text-red"}`}>
                      {entry.amount.toLocaleString("en-US")}
                    </td>
                    <td style={{ fontSize: "0.85rem", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.description}
                      {entry.notes ? <span className="text-muted" style={{ marginRight: "0.5rem" }}>({entry.notes})</span> : null}
                    </td>
                    <td className={`col-money ${entry.balance >= 0 ? "text-green" : "text-red"}`}>
                      {entry.balance.toLocaleString("en-US")}
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