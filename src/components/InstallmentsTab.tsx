import { useState, useMemo } from "react";
import type { InstallmentAlert } from "../utils/installments";
import { formatIqd } from "../utils/finance";

interface InstallmentsTabProps {
  alerts: InstallmentAlert[];
}

function getRowStyle(alert: InstallmentAlert): React.CSSProperties {
  if (alert.status === "overdue") {
    return {
      background: "rgba(220, 53, 69, 0.06)",
      borderRight: "4px solid var(--danger, #dc3545)",
    };
  }
  if (alert.status === "due_today") {
    return {
      background: "rgba(249, 115, 22, 0.08)",
      borderRight: "4px solid #f97316",
    };
  }
  return {};
}

function getStatusPill(alert: InstallmentAlert) {
  if (alert.status === "overdue") {
    return {
      bg: "var(--danger, #dc3545)",
      color: "#fff",
      label: `متأخر ${alert.daysDifference} يوم 🔴`,
    };
  }
  return {
    bg: "#f97316",
    color: "#fff",
    label: "يستحق اليوم 🟠",
  };
}

export function InstallmentsTab({ alerts: resolvedAlerts }: InstallmentsTabProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "due_today">("all");
  const [sortKey, setSortKey] = useState<"dueDate" | "payment" | "buyer" | "days">("dueDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const stats = useMemo(() => {
    const overdueCount = resolvedAlerts.filter((a) => a.status === "overdue").length;
    const dueTodayCount = resolvedAlerts.filter((a) => a.status === "due_today").length;
    const totalAmount = resolvedAlerts.reduce((sum, a) => sum + a.monthlyPayment, 0);
    return { overdueCount, dueTodayCount, totalAmount };
  }, [resolvedAlerts]);

  const filteredAndSortedAlerts = useMemo(() => {
    let result = resolvedAlerts.filter((alert) => {
      if (statusFilter === "overdue" && alert.status !== "overdue") return false;
      if (statusFilter === "due_today" && alert.status !== "due_today") return false;
      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      if (sortKey === "dueDate") {
        comparison = a.dueDate.localeCompare(b.dueDate);
      } else if (sortKey === "payment") {
        comparison = a.monthlyPayment - b.monthlyPayment;
      } else if (sortKey === "buyer") {
        comparison = a.buyerName.localeCompare(b.buyerName, "ar");
      } else if (sortKey === "days") {
        const daysA = a.status === "overdue" ? -a.daysDifference : a.daysDifference;
        const daysB = b.status === "overdue" ? -b.daysDifference : b.daysDifference;
        comparison = daysA - daysB;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [resolvedAlerts, statusFilter, sortKey, sortDirection]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const renderSortHeader = (key: typeof sortKey, label: string) => (
    <button
      type="button"
      className="th-sort-btn"
      onClick={() => handleSort(key)}
      style={{ background: "none", border: "none", color: "inherit", font: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
    >
      <span>{label}</span>
      <span className="th-sort-indicator" style={{ fontSize: "0.75rem", opacity: sortKey === key ? 1 : 0.4 }} aria-hidden>
        {sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );

  const statusTabs = [
    { id: "all" as const, label: "الكل", count: resolvedAlerts.length, type: "available" },
    { id: "overdue" as const, label: "🔴 متأخرة", count: stats.overdueCount, type: "sold_installment" },
    { id: "due_today" as const, label: "🟠 تستحق اليوم", count: stats.dueTodayCount, type: "sold_cash" },
  ];

  return (
    <div className="page-intro" style={{ width: "100%" }}>
      <h2 className="page-intro__title">الأقساط</h2>
      <p className="page-intro__desc" style={{ marginBottom: "1.5rem" }}>
        متابعة تواريخ استحقاق أقساط السيارات المباعة غير النقدي.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="stat-card" style={{ borderRight: "4px solid #6b7280" }}>
          <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>إجمالي قيمة الأقساط المستحقة</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--gold)", marginTop: "0.25rem" }}>
            {formatIqd(stats.totalAmount)}
          </div>
        </div>
        <div className="stat-card" style={{ borderRight: "4px solid var(--danger, #dc3545)" }}>
          <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>الأقساط المتأخرة</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--danger, #dc3545)", marginTop: "0.25rem" }}>
            {stats.overdueCount} {stats.overdueCount === 1 ? "قسط" : "أقساط"}
          </div>
        </div>
        <div className="stat-card" style={{ borderRight: "4px solid #f97316" }}>
          <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>الأقساط المستحقة اليوم</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#f97316", marginTop: "0.25rem" }}>
            {stats.dueTodayCount} {stats.dueTodayCount === 1 ? "قسط" : "أقساط"}
          </div>
        </div>
      </div>

      <div className="cars-tabs" style={{ marginBottom: "1rem" }}>
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`cars-tab cars-tab--${tab.type} ${statusFilter === tab.id ? "cars-tab--active" : ""}`}
            onClick={() => setStatusFilter(tab.id)}
          >
            {tab.label}
            <span className="cars-tab__count">{tab.count}</span>
          </button>
        ))}
      </div>

      {filteredAndSortedAlerts.length === 0 ? (
        <div className="cars-empty" style={{ padding: "3rem", textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", opacity: 0.8 }}>لا توجد أقساط متأخرة أو مستحقة اليوم</p>
        </div>
      ) : (
        <div className="table-container" style={{ marginTop: "1rem", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>{renderSortHeader("buyer", "اسم المشتري")}</th>
                <th>رقم الهاتف</th>
                <th style={{ textAlign: "right" }}>{renderSortHeader("payment", "القسط الشهري")}</th>
                <th style={{ textAlign: "center" }}>{renderSortHeader("dueDate", "تاريخ الاستحقاق")}</th>
                <th style={{ textAlign: "center" }}>{renderSortHeader("days", "الحالة")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedAlerts.map((alert, idx) => {
                const pill = getStatusPill(alert);
                return (
                  <tr key={idx} style={getRowStyle(alert)}>
                    <td style={{ fontWeight: 600, opacity: 0.7 }}>{idx + 1}</td>
                    <td className="cell-bold">{alert.buyerName || "—"}</td>
                    <td dir="ltr" style={{ fontWeight: 600 }}>{alert.phone || "—"}</td>
                    <td dir="ltr" style={{ fontWeight: 700, color: "var(--gold)", textAlign: "right" }}>
                      {formatIqd(alert.monthlyPayment)}
                    </td>
                    <td dir="ltr" style={{ textAlign: "center", fontWeight: 600 }}>
                      {alert.dueDate || "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          background: pill.bg,
                          color: pill.color,
                          padding: "0.25rem 0.75rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          boxShadow: `0 2px 8px ${pill.bg}30`,
                        }}
                      >
                        {pill.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
