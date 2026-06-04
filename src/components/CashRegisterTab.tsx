import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";

import { PAGE_SIZE } from "../constants";

const parseCommissionText = (notes: string | null | undefined, currency?: string | null, amount?: number): string => {
  const curr = currency || "IQD";
  if (!notes) return "—";
  const parts = notes.split("عمولة:");
  if (parts.length > 1) {
    const cleanPart = parts[1].split("%")[0].trim();
    if (parts[1].includes("%")) {
      const pct = parseFloat(cleanPart);
      if (!isNaN(pct)) {
        if (amount !== undefined) {
          const commissionVal = (Math.abs(amount) * pct) / 100;
          return curr === "USD"
            ? `${commissionVal.toLocaleString("en-US")} USD`
            : `${commissionVal.toLocaleString("en-US")} IQ`;
        }
        return pct + "%";
      }
    }
    const val = parseFloat(cleanPart);
    if (!isNaN(val)) {
      return curr === "USD"
        ? `${val.toLocaleString("en-US")} USD`
        : `${val.toLocaleString("en-US")} IQ`;
    }
  }
  return "—";
};

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
              {paymentType === "ممول" && <th style={{ width: "80px", textAlign: "center" }}>العمولة</th>}
              <th>التفاصيل</th>
              <th className="col-money">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={paymentType === "ممول" ? 8 : 7} className="empty-cell">جاري التحميل...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={paymentType === "ممول" ? 8 : 7} className="empty-cell">لا توجد معاملات بعد</td></tr>
            ) : (
              <>
                {pageEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="cell-num">{entry.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                    <td>
                      <span
                        className={`badge ${entry.amount >= 0 ? "badge--primary" : "badge--sold"}`}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {entry.type_}
                      </span>
                    </td>
                    <td className="col-money" style={{ color: entry.currency === "USD" ? "#10b981" : (entry.amount >= 0 ? "#d8a85a" : "#f43f5e") }}>
                      {formatEntry(entry, entry.amount)}
                    </td>
                    {paymentType === "ممول" && (
                      <td style={{ textAlign: "center", fontWeight: "bold", color: "#a78bfa", fontSize: "var(--fs-sm)" }}>
                        {parseCommissionText(entry.notes, entry.currency, entry.amount)}
                      </td>
                    )}
                    <td style={{ fontSize: "var(--fs-sm)", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.notes && entry.notes.startsWith("تم تسديد الممول") ? (
                        entry.notes.includes(" - عمولة:") ? entry.notes.split(" - عمولة:")[0] : entry.notes
                      ) : (
                        <>
                          {entry.description}
                          {entry.notes ? (
                            <span className="text-muted" style={{ marginRight: "0.5rem" }}>
                              ({entry.notes.includes(" - عمولة:") ? entry.notes.split(" - عمولة:")[0] : entry.notes})
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="col-money" style={{ color: entry.currency === "USD" ? "#10b981" : (entry.balance >= 0 ? "#d8a85a" : "#f43f5e") }}>
                      {formatEntry(entry, entry.balance)}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: PAGE_SIZE - pageEntries.length }).map((_, i) => (
                  <tr key={`empty-${i}`} style={{ pointerEvents: "none" }}>
                    <td className="cell-num">&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    {paymentType === "ممول" && <td>&nbsp;</td>}
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "8px 0 0 0",
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
            fontSize: "var(--fs-sm)",
            fontWeight: 600,
            cursor: currentPage === 0 ? "default" : "pointer",
            transition: "all 0.2s",
          }}
          >
            → السابق
          </button>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "var(--fs-sm)", fontWeight: 500 }}>
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
            fontSize: "var(--fs-sm)",
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
