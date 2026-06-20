import { useEffect, useMemo, useState } from "react";
import { callTauri } from "../api/tauri";
import type { Car, CashRegisterEntry } from "../types";
import { PriceDisplay } from "@/components/ui";

import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";

/**
 * سجل المعاملات – يعرض جميع سجل المعاملات من كافة الحسابات (قاصه + مصرف)
 * مجمّعة في جدول واحد.
 */
export function FinancialTransactionsTab() {
  const [entries, setEntries] = useState<(CashRegisterEntry & { _source?: "قاصه" | "مصرف" })[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

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
        let source: "قاصه" | "مصرف" = "قاصه";

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
              if (pType === "مصرف" || pType === "قاصه") {
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

      let iqdRunning = 0;
      let usdRunning = 0;
      const allWithBalance = all.map(entry => {
        const curr = entry.currency === "USD" ? "USD" : "IQD";
        if (curr === "USD") {
          usdRunning += entry.amount;
          return { ...entry, balance: usdRunning };
        } else {
          iqdRunning += entry.amount;
          return { ...entry, balance: iqdRunning };
        }
      });

      const lastPage = Math.max(0, Math.ceil(allWithBalance.length / PAGE_SIZE) - 1);
      setEntries(allWithBalance);
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
      let valA: any = a[key as keyof typeof a] ?? "";
      let valB: any = b[key as keyof typeof b] ?? "";

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

  return (
    <div
      className="dashboard"
      onWheel={(e) => handlePaginationWheel(e, currentPage, totalPages, setPage)}
      onKeyDown={(e) => handlePaginationKeyDown(e, currentPage, totalPages, setPage)}
      tabIndex={0}
    >
      {/* شريط الأدوات الموحد في الأعلى */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right"></div>
        <div className="unified-toolbar__center"></div>
        <div className="unified-toolbar__left"></div>
      </div>

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

      {/* الجدول */}
      <section className="table-card-container">
        <div className="table-wrapper" style={{ flex: 1, minHeight: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className={`cell-num ${sortConfig?.key === "id" ? "th--sorted" : ""}`} onClick={() => handleSort("id")} style={{ width: "40px", cursor: "pointer" }}>ت</th>
                <th className={sortConfig?.key === "_source" ? "th--sorted" : ""} onClick={() => handleSort("_source")} style={{ width: "90px", cursor: "pointer" }}>الحساب</th>
                <th className={sortConfig?.key === "date" ? "th--sorted" : ""} onClick={() => handleSort("date")} style={{ width: "110px", cursor: "pointer" }}>التاريخ</th>
                <th className={sortConfig?.key === "time" ? "th--sorted" : ""} onClick={() => handleSort("time")} style={{ width: "60px", cursor: "pointer" }}>الساعة</th>
                <th className={sortConfig?.key === "type_" ? "th--sorted" : ""} onClick={() => handleSort("type_")} style={{ width: "200px", cursor: "pointer" }}>نوع العملية</th>
                <th className={`col-money ${sortConfig?.key === "amount" ? "th--sorted" : ""}`} onClick={() => handleSort("amount")} style={{ width: "200px", cursor: "pointer" }}>المبلغ</th>
                <th className={sortConfig?.key === "description" ? "th--sorted" : ""} onClick={() => handleSort("description")} style={{ cursor: "pointer" }}>التفاصيل</th>
                <th className={`col-money ${sortConfig?.key === "balance" ? "th--sorted" : ""}`} onClick={() => handleSort("balance")} style={{ width: "200px", cursor: "pointer" }}>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="empty-cell">جاري التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={8} className="empty-cell">لا توجد حركات مالية</td></tr>
              ) : (
                <>
                  {pageEntries.map((entry, idx) => (
                    <tr key={`${entry._source}-${entry.id}-${idx}`}>
                      <td className="cell-num">{currentPage * PAGE_SIZE + idx + 1}</td>
                      <td style={{ whiteSpace: "nowrap", color: "#fff" }}>
                        {entry._source}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                      <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-sm)", textAlign: "center" }}>{entry.time}</td>
                      <td style={{ whiteSpace: "nowrap", color: "#fff" }}>
                        {entry.type_}
                      </td>
                      <td
                        className={`col-money ${entry.type_ === "شراء بالتمويل"
                            ? "tx-amount-iqd-neg"
                            : entry.currency === "USD"
                              ? "tx-amount-usd"
                              : entry.amount >= 0
                                ? "tx-amount-iqd-pos"
                                : "tx-amount-iqd-neg"
                          }`}
                      >
                        <PriceDisplay amount={entry.amount} currency={entry.currency} />
                      </td>
                      <td style={{
                        fontSize: "var(--fs-sm)",
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
                      <td
                        className={`col-money ${entry.currency === "USD"
                            ? "tx-amount-usd"
                            : entry.balance >= 0
                              ? "tx-amount-iqd-pos"
                              : "tx-amount-iqd-neg"
                          }`}
                      >
                        <PriceDisplay amount={entry.balance} currency={entry.currency} />
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
                      <td>&nbsp;</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
