import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { Car, CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";

import { PAGE_SIZE } from "../constants";

/**
 * سجل المعاملات – يعرض جميع سجل المعاملات من كافة الحسابات (قاصه + ماستر + مصرف)
 * مجمّعة في جدول واحد.
 */
export function FinancialTransactionsTab() {
  const [entries, setEntries] = useState<(CashRegisterEntry & { _source?: "قاصه" | "ماستر" | "مصرف" })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      // تحميل جميع السيارات والعمليات بشكل متوازٍ لتجنب التكرار ولربط الحساب الصحيح بالعملية
      const [cars, entriesData] = await Promise.all([
        callTauri<Car[]>("get_cars"),
        callTauri<CashRegisterEntry[]>("get_cash_register_entries", { paymentType: null }),
      ]);

      const carsMap = new Map<string, Car>();
      for (const car of (cars ?? [])) {
        carsMap.set(car.car_number.trim(), car);
      }

      const all = (entriesData ?? []).map(entry => {
        let source: "قاصه" | "ماستر" | "مصرف" = "قاصه";
        
        // التحقق مما إذا كانت الحركة متعلقة بسيارة
        const isCarEntry = [
          "شراء سيارة",
          "بيع سيارة كاش",
          "بيع سيارة آجل",
          "مقدمة سيارة اقساط",
        ].includes(entry.type_);

        if (isCarEntry) {
          // استخراج رقم السيارة من التفاصيل (يكون بعد علامة " - ")
          const parts = entry.description.split(" - ");
          if (parts.length > 1) {
            const carNum = parts[parts.length - 1].trim();
            const car = carsMap.get(carNum);
            if (car && car.purchase_payment_type) {
              const pType = car.purchase_payment_type.trim();
              if (pType === "ماستر" || pType === "مصرف" || pType === "قاصه") {
                source = pType as any;
              }
            }
          }
        }
        
        return {
          ...entry,
          _source: source,
        };
      });

      // ترتيب حسب التاريخ والوقت (الأقدم أولاً)
      all.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.time ?? "").localeCompare(b.time ?? "");
      });

      const lastPage = Math.max(0, Math.ceil(all.length / PAGE_SIZE) - 1);
      setEntries(all);
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
  }, []);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageEntries = useMemo(
    () => entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [entries, currentPage],
  );

  const getSourceBadgeStyle = (source: string) => {
    switch (source) {
      case "قاصه":
        return { background: "rgba(216,168,90,0.18)", color: "#d8a85a", border: "1px solid rgba(216,168,90,0.25)" };
      case "ماستر":
        return { background: "rgba(216,168,90,0.18)", color: "#d8a85a", border: "1px solid rgba(216,168,90,0.25)" };
      case "مصرف":
        return { background: "rgba(34,197,94,0.18)", color: "#86efac", border: "1px solid rgba(34,197,94,0.25)" };
      default:
        return { background: "rgba(255,255,255,0.08)", color: "#aaa", border: "1px solid rgba(255,255,255,0.1)" };
    }
  };

  return (
    <div className="dashboard">
      {/* العنوان فقط بدون أدوات تصفية أو تبويبات */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        marginBottom: "1.5rem",
        flexWrap: "wrap",
      }}>
        <h2 className="page-intro__title" style={{ margin: 0, fontSize: "1.5rem" }}>سجل المعاملات</h2>
      </div>

      {/* الجدول */}
      <section className="panel-card cash-register-section">
        <div className="table-wrapper" style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-num" style={{ width: "40px" }}>ت</th>
                <th style={{ width: "90px" }}>الحساب</th>
                <th style={{ width: "110px" }}>تاريخ العملية</th>
                <th style={{ width: "60px" }}>الساعة</th>
                <th style={{ width: "150px" }}>نوع العملية</th>
                <th className="col-money">المبلغ</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-cell">جاري التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="empty-cell">لا توجد حركات مالية</td></tr>
              ) : (
                <>
                  {pageEntries.map((entry, idx) => (
                    <tr key={`${entry._source}-${entry.id}-${idx}`}>
                      <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                      <td>
                        <span
                          style={{
                            ...getSourceBadgeStyle(entry._source ?? "قاصه"),
                            padding: "0.15rem 0.6rem",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            display: "inline-block",
                          }}
                        >
                          {entry._source}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem", textAlign: "center" }}>{entry.time}</td>
                      <td>
                        <span
                          className={`badge ${entry.amount >= 0 ? "badge--primary" : "badge--sold"}`}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {entry.type_}
                        </span>
                      </td>
                      <td
                        className="col-money"
                        style={{
                          color: entry.currency === "USD"
                            ? "#10b981"
                            : entry.amount >= 0
                              ? "#d8a85a"
                              : "#f43f5e",
                        }}
                      >
                        <PriceDisplay amount={entry.amount} currency={entry.currency} />
                      </td>
                      <td style={{
                        fontSize: "0.85rem",
                        maxWidth: "280px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {entry.description}
                        {entry.notes ? (
                          <span className="text-muted" style={{ marginRight: "0.5rem" }}>({entry.notes})</span>
                        ) : null}
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
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* ترقيم الصفحات */}
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
    </div>
  );
}
