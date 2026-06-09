import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";
import "../styles/qasa.css";

import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";

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
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

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
      let valA: any = a[key as keyof CashRegisterEntry] ?? "";
      let valB: any = b[key as keyof CashRegisterEntry] ?? "";

      if (key === "commission") {
        valA = parseCommissionText(a.notes, a.currency, a.amount);
        valB = parseCommissionText(b.notes, b.currency, b.amount);
      }

      if (key === "amount" || key === "balance" || key === "id") {
        return (Number(valA) - Number(valB)) * sign;
      }
      if (key === "date") {
        const dtA = `${a.date}T${a.time || "00:00"}`;
        const dtB = `${b.date}T${b.time || "00:00"}`;
        return dtA.localeCompare(dtB) * sign;
      }
      return String(valA).localeCompare(String(valB), "ar", { numeric: true }) * sign;
    });
  }, [entries, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => sortedEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [sortedEntries, currentPage],
  );

  const formatEntry = (entry: CashRegisterEntry, value: number) => {
    return <PriceDisplay amount={value} currency={entry.currency} />;
  };

  return (
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
      <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
         <table className="data-table">
          <thead>
            <tr>
              <th className={`cell-num ${sortConfig?.key === "id" ? "th--sorted" : ""}`} onClick={() => handleSort("id")} style={{ width: "40px", cursor: "pointer" }}>ت</th>
              <th className={sortConfig?.key === "date" ? "th--sorted" : ""} onClick={() => handleSort("date")} style={{ width: "110px", cursor: "pointer" }}>التاريخ</th>
              <th className={sortConfig?.key === "time" ? "th--sorted" : ""} onClick={() => handleSort("time")} style={{ width: "60px", cursor: "pointer" }}>الساعة</th>
              <th className={sortConfig?.key === "type_" ? "th--sorted" : ""} onClick={() => handleSort("type_")} style={{ width: "200px", cursor: "pointer" }}>نوع العملية</th>
              <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{width: "200px", cursor: "pointer" }}>المبلغ</th>
              {paymentType === "ممول" && <th className={sortConfig?.key === "commission" ? "th--sorted" : ""} onClick={() => handleSort("commission")} style={{ width: "80px", textAlign: "center", cursor: "pointer" }}>العمولة</th>}
              <th className={sortConfig?.key === "description" ? "th--sorted" : ""} onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>التفاصيل</th>
              <th className={`col-money ${sortConfig?.key === "balance" ? "th--sorted" : ""}`} onClick={() => handleSort("balance")} style={{ cursor: "pointer" }}>الرصيد</th>
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
                    <td style={{ whiteSpace: "nowrap", color: "#fff" }}>
                      {entry.type_}
                    </td>
                    <td className={`col-money ${entry.currency === "USD" ? "qasa-amount-usd" : (entry.amount >= 0 ? "qasa-amount-iqd-pos" : "qasa-amount-iqd-neg")}`}>
                      {formatEntry(entry, entry.amount)}
                    </td>
                    {paymentType === "ممول" && (
                      <td className="qasa-commission-text">
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
                    <td className={`col-money ${entry.currency === "USD" ? "qasa-amount-usd" : (entry.balance >= 0 ? "qasa-amount-iqd-pos" : "qasa-amount-iqd-neg")}`}>
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
    </section>
    </>
  );
}
