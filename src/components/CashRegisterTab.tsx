import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";

const PAGE_SIZE = 10;

interface CashRegisterTabProps {
  paymentType?: string;
}

export function CashRegisterTab({ paymentType }: CashRegisterTabProps) {
  const [entries, setEntries] = useState<CashRegisterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callTauri<CashRegisterEntry[]>("get_cash_register_entries", {
        paymentType: paymentType ?? null,
      });
      setEntries(data ?? []);
      const lastPage = Math.max(0, Math.ceil((data ?? []).length / PAGE_SIZE) - 1);
      setPage(lastPage);
    } catch {
      setEntries([]);
      setPage(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [paymentType]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [entries, currentPage],
  );

  const formatEntry = (entry: CashRegisterEntry, value: number) => {
    return <PriceDisplay amount={value} currency={entry.currency} />;
  };

  return (
    <section className="panel-card cash-register-section">
      <div className="table-wrapper" style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0 }}>
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
              pageEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="cell-num">{entry.id}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem", textAlign: "center" }}>{entry.time}</td>
                  <td>
                    <span className={`badge ${entry.amount >= 0 ? "badge--primary" : "badge--sold"}`}>
                      {entry.type_}
                    </span>
                  </td>
                  <td className="col-money" style={{ color: entry.currency === "USD" ? "#10b981" : (entry.amount >= 0 ? "#d8a85a" : "#f43f5e") }}>
                    {formatEntry(entry, entry.amount)}
                  </td>
                  <td style={{ fontSize: "0.85rem", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.description}
                    {entry.notes ? <span className="text-muted" style={{ marginRight: "0.5rem" }}>({entry.notes})</span> : null}
                  </td>
                  <td className="col-money" style={{ color: entry.currency === "USD" ? "#10b981" : (entry.balance >= 0 ? "#d8a85a" : "#f43f5e") }}>
                    {formatEntry(entry, entry.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "0.75rem 0 0.25rem 0",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage === 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
          style={{
            background: currentPage === 0 ? "transparent" : "rgba(216,168,90,0.15)",
            border: "1px solid rgba(216,168,90,0.2)",
            borderRadius: "8px",
            padding: "6px 16px",
            color: currentPage === 0 ? "rgba(255,255,255,0.2)" : "#d8a85a",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: currentPage === 0 ? "default" : "pointer",
            transition: "all 0.2s",
          }}
          >
            → السابق
          </button>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", fontWeight: 500 }}>
          {currentPage + 1} / {totalPages}
        </span>
        <button
          type="button"
          className="pagination-btn"
          disabled={currentPage >= totalPages - 1}
          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          style={{
            background: currentPage >= totalPages - 1 ? "transparent" : "rgba(216,168,90,0.15)",
            border: "1px solid rgba(216,168,90,0.2)",
            borderRadius: "8px",
            padding: "6px 16px",
            color: currentPage >= totalPages - 1 ? "rgba(255,255,255,0.2)" : "#d8a85a",
            fontSize: "0.85rem",
            fontWeight: 600,
            cursor: currentPage >= totalPages - 1 ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          التالي ←
        </button>
      </div>
    </section>
  );
}
