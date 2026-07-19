/**
 * AccountingPeriodsPanel — §19 قفل الفترات المحاسبية
 *
 * يعرض قائمة الفترات المحاسبية ويتيح:
 * - إنشاء فترة جديدة (مفتوحة)
 * - إغلاق فترة مفتوحة (يمنع التعديل على أي عملية داخلها)
 * - إعادة فتح فترة مغلقة (بسبب موثق + session_token إدارية)
 *
 * القواعد (Instructions.md §19):
 * - لا تُعدَّل عملية في فترة مغلقة إلا بصلاحية إدارية وسبب موثق.
 * - فتح فترة مغلقة مجدداً يسجَّل في audit_log.
 * - هذه الشاشة للعرض والإدارة فقط، لا تنشئ قيوداً أو حركات.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { callTauri } from "../api/tauri";
import type { AccountingPeriod } from "../types";

interface Props {
  sessionToken: string;
}

export function AccountingPeriodsPanel({ sessionToken }: Props) {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Status form
  const [statusModal, setStatusModal] = useState<{
    period: AccountingPeriod;
    action: "close" | "reopen";
  } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3500);
  };

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callTauri<AccountingPeriod[]>("get_accounting_periods");
      setPeriods(result ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPeriods();
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [fetchPeriods]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!startDate || !endDate) {
      setCreateError("تاريخ البداية والنهاية مطلوبان");
      return;
    }
    if (startDate > endDate) {
      setCreateError("تاريخ البداية يجب أن يكون قبل أو يساوي تاريخ النهاية");
      return;
    }
    setCreating(true);
    try {
      await callTauri("create_accounting_period", {
        startDate,
        endDate,
        sessionToken,
      });
      setShowCreate(false);
      setStartDate("");
      setEndDate("");
      showSuccess("تم إنشاء الفترة المحاسبية بنجاح");
      await fetchPeriods();
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusModal) return;
    setStatusError(null);
    const reason = statusReason.trim();
    if (!reason) {
      setStatusError("السبب مطلوب");
      return;
    }
    setStatusSubmitting(true);
    try {
      const newStatus = statusModal.action === "close" ? "closed" : "open";
      await callTauri("set_accounting_period_status", {
        periodId: statusModal.period.id,
        expectedVersion: statusModal.period.version,
        status: newStatus,
        reason,
        sessionToken,
      });
      const verb = statusModal.action === "close" ? "إغلاق" : "فتح";
      showSuccess(`تم ${verb} الفترة المحاسبية بنجاح`);
      setStatusModal(null);
      setStatusReason("");
      await fetchPeriods();
    } catch (err) {
      setStatusError(String(err));
    } finally {
      setStatusSubmitting(false);
    }
  };

  const openStatusModal = (period: AccountingPeriod, action: "close" | "reopen") => {
    setStatusReason("");
    setStatusError(null);
    setStatusModal({ period, action });
  };

  const formatDate = (d: string) => d || "—";

  return (
    <div
      data-testid="accounting-periods-root"
      style={{
        maxWidth: 780,
        width: "100%",
        margin: "1rem auto 0",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "var(--all-radius)",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "var(--labletext)", fontSize: "var(--fs-lg)", fontWeight: 800 }}>
            الفترات المحاسبية
          </h3>
          <p style={{ margin: "0.25rem 0 0", color: "var(--bg2)", fontSize: "var(--fs-xs)" }}>
            إغلاق الفترة يمنع تعديل أي عملية واقعة داخلها — §19
          </p>
        </div>
        <button
          type="button"
          data-testid="btn-new-accounting-period"
          className="btn btn-primary"
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
            setStartDate("");
            setEndDate("");
          }}
          style={{ minWidth: 130 }}
        >
          + فترة جديدة
        </button>
      </div>

      {/* Success */}
      {successMsg && (
        <div
          role="status"
          style={{
            padding: "0.6rem 1rem",
            background: "rgba(52,211,153,0.12)",
            border: "1px solid rgba(52,211,153,0.35)",
            borderRadius: "var(--all-radius)",
            color: "var(--dc-install-accent)",
            fontSize: "var(--fs-sm)",
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div
          className="dashboard-panel"
          style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <div style={{ fontWeight: 700, color: "var(--labletext)", fontSize: "var(--fs-base)" }}>
            إنشاء فترة محاسبية جديدة
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--bg2)" }}>تاريخ البداية</span>
              <input
                type="date"
                data-testid="accounting-period-start"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--bg2)" }}>تاريخ النهاية</span>
              <input
                type="date"
                data-testid="accounting-period-end"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
          </div>
          {createError && (
            <div style={{ color: "var(--dc-fund-accent)", fontSize: "var(--fs-xs)" }}>{createError}</div>
          )}
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button
              type="button"
              data-testid="btn-save-accounting-period"
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "جاري الحفظ..." : "حفظ"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--bg2)" }}>
          <div className="spinner" style={{ width: 24, height: 24, margin: "0 auto 0.5rem" }} />
          جاري التحميل...
        </div>
      ) : error ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "var(--all-radius)",
            color: "var(--dc-fund-accent)",
            fontSize: "var(--fs-sm)",
          }}
        >
          {error}
          <button
            type="button"
            className="btn"
            onClick={fetchPeriods}
            style={{ marginRight: "0.75rem", fontSize: "var(--fs-xs)" }}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : periods.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "2.5rem 0",
            color: "var(--bg2)",
            fontSize: "var(--fs-sm)",
          }}
        >
          لا توجد فترات محاسبية بعد — أنشئ أول فترة لتفعيل قفل الفترات
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {periods.map((p) => {
            const isClosed = p.status === "closed";
            return (
              <div
                key={p.id}
                data-testid={`accounting-period-row-${p.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  background: isClosed
                    ? "rgba(239,68,68,0.06)"
                    : "rgba(52,211,153,0.05)",
                  border: isClosed
                    ? "1px solid rgba(239,68,68,0.25)"
                    : "1px solid rgba(52,211,153,0.2)",
                  borderRadius: "var(--all-radius)",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                {/* Dates + status */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "0.15rem 0.55rem",
                      borderRadius: 999,
                      fontSize: "var(--fs-xs)",
                      fontWeight: 700,
                      background: isClosed ? "rgba(239,68,68,0.15)" : "rgba(52,211,153,0.15)",
                      color: isClosed ? "var(--dc-fund-accent)" : "var(--dc-install-accent)",
                      border: isClosed
                        ? "1px solid rgba(239,68,68,0.35)"
                        : "1px solid rgba(52,211,153,0.35)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isClosed ? "مغلقة" : "مفتوحة"}
                  </span>
                  <span
                    style={{
                      color: "var(--labletext)",
                      fontSize: "var(--fs-sm)",
                      fontWeight: 600,
                      direction: "ltr",
                    }}
                  >
                    {formatDate(p.start_date)} — {formatDate(p.end_date)}
                  </span>
                  {p.reason && (
                    <span style={{ color: "var(--bg2)", fontSize: "var(--fs-xs)" }}>
                      {p.reason}
                    </span>
                  )}
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {isClosed ? (
                    <button
                      type="button"
                      data-testid={`btn-reopen-accounting-period-${p.id}`}
                      className="btn"
                      onClick={() => openStatusModal(p, "reopen")}
                      style={{ fontSize: "var(--fs-xs)" }}
                    >
                      إعادة الفتح
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`btn-close-accounting-period-${p.id}`}
                      className="btn"
                      onClick={() => openStatusModal(p, "close")}
                      style={{
                        fontSize: "var(--fs-xs)",
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "var(--dc-fund-accent)",
                      }}
                    >
                      إغلاق الفترة
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Status change modal */}
      {statusModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !statusSubmitting) {
              setStatusModal(null);
            }
          }}
        >
          <div
            data-testid="accounting-period-status-dialog"
            style={{
              background: "var(--glass-bg, rgba(20,20,30,0.96))",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "var(--all-radius)",
              padding: "1.5rem",
              width: "min(440px, 92vw)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <h4 style={{ margin: 0, color: "var(--labletext)", fontSize: "var(--fs-base)", fontWeight: 800 }}>
              {statusModal.action === "close" ? "إغلاق الفترة المحاسبية" : "إعادة فتح الفترة المحاسبية"}
            </h4>
            <div style={{ color: "var(--bg2)", fontSize: "var(--fs-sm)" }}>
              الفترة: <strong style={{ color: "var(--labletext)", direction: "ltr", display: "inline-block" }}>
                {formatDate(statusModal.period.start_date)} — {formatDate(statusModal.period.end_date)}
              </strong>
            </div>
            {statusModal.action === "close" && (
              <div
                style={{
                  padding: "0.6rem 0.85rem",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: "var(--all-radius)",
                  color: "var(--dc-fund-accent)",
                  fontSize: "var(--fs-xs)",
                }}
              >
                ⚠ إغلاق الفترة يمنع تعديل أي عملية واقعة بين {formatDate(statusModal.period.start_date)} و {formatDate(statusModal.period.end_date)}. للتصحيح استخدم قيداً عكسياً في فترة مفتوحة.
              </div>
            )}
            {statusModal.action === "reopen" && (
              <div
                style={{
                  padding: "0.6rem 0.85rem",
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.25)",
                  borderRadius: "var(--all-radius)",
                  color: "#f5c842",
                  fontSize: "var(--fs-xs)",
                }}
              >
                ⚠ إعادة الفتح تُسجَّل في سجل التدقيق. تأكد من وجود سبب وجيه.
              </div>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--bg2)" }}>
                السبب <span style={{ color: "var(--dc-fund-accent)" }}>*</span>
              </span>
              <textarea
                data-testid="accounting-period-reason"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                rows={3}
                className="form-input"
                placeholder="أدخل سبباً واضحاً يُحفظ في سجل التدقيق..."
                disabled={statusSubmitting}
              />
            </label>
            {statusError && (
              <div style={{ color: "var(--dc-fund-accent)", fontSize: "var(--fs-xs)" }}>
                {statusError}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setStatusModal(null)}
                disabled={statusSubmitting}
              >
                إلغاء
              </button>
              <button
                type="button"
                data-testid="btn-confirm-accounting-period-status"
                className="btn btn-primary"
                onClick={handleStatusChange}
                disabled={statusSubmitting || !statusReason.trim()}
                style={
                  statusModal.action === "close"
                    ? {
                        background: "rgba(239,68,68,0.15)",
                        border: "1px solid rgba(239,68,68,0.4)",
                        color: "var(--dc-fund-accent)",
                      }
                    : {}
                }
              >
                {statusSubmitting
                  ? "جاري الحفظ..."
                  : statusModal.action === "close"
                  ? "إغلاق الفترة"
                  : "إعادة الفتح"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
