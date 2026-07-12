import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { callTauri } from "../api/tauri";
import type { Agency, AgencyTransaction } from "../types";
import { ActionButton, PriceDisplay, PriceInput, TextInput } from "@/components/ui";
import { YearScrollField } from "./YearScrollField";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnifiedDateField } from "./UnifiedDateField";
import { compareMoney, moneySum } from "../utils/money";

import { toEnglishDigits } from "../utils/numberInput";
import { todayIsoDate, formatDisplayDate } from "../utils/dateSegments";
import { formatNotesText } from "../utils/notesDisplay";
import { GoldFxButton } from "./ui/GoldFxButton";

interface AgenciesTabProps {
  onRefresh: () => Promise<void>;
  agenciesSearchOpen?: boolean;
  onAgenciesSearchClose?: () => void;
  onAddAgencyChange?: (onAddAgency: { action: () => void } | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  requestCloseRef?: React.MutableRefObject<{ request: (afterClose?: () => void) => void } | null>;
  sessionToken?: string | null;
}

const AGENCIES_TABS: { id: "list" | "details"; label: string }[] = [
  { id: "list", label: "الوكالات" },
  { id: "details", label: "تفاصيل" },
];

const normalizeAgencyPlate = (value: string | null | undefined) =>
  toEnglishDigits(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const AGENCY_PAYMENT_STATUSES = ["واصل", "غير واصل"] as const;

const normalizeAgencyPaymentStatus = (value: string | null | undefined): Agency["payment_status"] =>
  value === "غير واصل" ? "غير واصل" : "واصل";

const normalizeAgency = (agency: Agency): Agency => ({
  ...agency,
  payment_status: normalizeAgencyPaymentStatus(agency.payment_status),
});

export function AgenciesTab({ onRefresh, agenciesSearchOpen, onAgenciesSearchClose, onAddAgencyChange, onDirtyChange, requestCloseRef, sessionToken }: AgenciesTabProps) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [agenciesTab, setAgenciesTab] = useState<"list" | "details">("list");
  const lastListTabClickRef = useRef(0);
  const [agenciesSearch, setAgenciesSearch] = useState("");
  const [agenciesSearchHighlightIdx, setAgenciesSearchHighlightIdx] = useState(0);
  const agenciesSearchInputRef = useRef<HTMLInputElement>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [saving, setSaving] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showAgencySaveConfirm, setShowAgencySaveConfirm] = useState(false);
  const initialAgencyRef = useRef<string>("");
  const pendingAgencyActionRef = useRef<(() => void) | null>(null);
  const pendingAgencyCloseRef = useRef<(() => void) | null>(null);

  const [txForm, setTxForm] = useState({ type: "ايداع" as string, amount: 0, date: todayIsoDate(), notes: "", currency: "IQD" as "IQD" | "USD" });

  const [deleteTxConfirm, setDeleteTxConfirm] = useState<AgencyTransaction | null>(null);
  const [deleteAgencyConfirm, setDeleteAgencyConfirm] = useState<Agency | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agencySaveInFlightRef = useRef(false);

  const selectedAgencyPlate = normalizeAgencyPlate(selectedAgency?.car_number);
  const isDuplicateAgencyPlate = useMemo(() => {
    if (!selectedAgency || !selectedAgencyPlate) return false;
    return agencies.some((agency) => (
      agency.id !== selectedAgency.id &&
      normalizeAgencyPlate(agency.car_number) === selectedAgencyPlate
    ));
  }, [agencies, selectedAgency, selectedAgencyPlate]);

  const agencyDirty = useMemo(() => {
    if (!selectedAgency) return false;
    return JSON.stringify(selectedAgency) !== initialAgencyRef.current;
  }, [selectedAgency]);

  const fetchAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callTauri<Agency[]>("get_agencies");
      setAgencies((data ?? []).map(normalizeAgency));
    } catch (err) {
      console.error("Failed to fetch agencies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddNewAgency = useCallback(async () => {
    const today = todayIsoDate();
    const newAgency: Agency = {
      id: -Date.now(),
      old_agent_name: "",
      car_type: "",
      car_number: "",
      car_model: "",
      color: "",
      new_agent_name: "",
      phone: "",
      amount_usd: 0,
      amount_iqd: 0,
      notes: "",
      payment_status: "واصل",
      date: today,
      time: "",
    };
    setSelectedAgency(newAgency);
    initialAgencyRef.current = JSON.stringify(newAgency);
    setAgenciesTab("details");
  }, []);

  const handleSaveAgency = async () => {
    if (agencySaveInFlightRef.current) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (selectedAgency) {
      const requiredFields: { key: keyof Agency; id: string }[] = [
        { key: "old_agent_name", id: "agency-old-agent" },
        { key: "new_agent_name", id: "agency-new-agent" },
        { key: "car_type", id: "agency-car-type" },
        { key: "car_number", id: "agency-car-number" },
        { key: "car_model", id: "agency-car-year" },
        { key: "color", id: "agency-color" },
      ];
      let hasError = false;
      for (const field of requiredFields) {
        const val = (selectedAgency[field.key] ?? "").toString().trim();
        const input = document.getElementById(field.id) as HTMLElement | null;
        if (!val) {
          input?.classList.add("input--error");
          if (!hasError) input?.focus();
          hasError = true;
        } else {
          input?.classList.remove("input--error");
        }
      }
      if (hasError) return;
      if (isDuplicateAgencyPlate) {
        const input = document.getElementById("agency-car-number") as HTMLElement | null;
        input?.classList.add("input--error");
        input?.focus();
        return;
      }

      agencySaveInFlightRef.current = true;
      setSaving(true);
      try {
        if (selectedAgency.id < 0) {
          const newId = await callTauri<number>("add_agency", {
            oldAgentName: selectedAgency.old_agent_name,
            carType: selectedAgency.car_type,
            carNumber: selectedAgency.car_number,
            carModel: selectedAgency.car_model,
            color: selectedAgency.color,
            newAgentName: selectedAgency.new_agent_name,
            phone: toEnglishDigits(selectedAgency.phone),
            amountIqd: String(selectedAgency.amount_iqd ?? "0"),
            amountUsd: String(selectedAgency.amount_usd ?? "0"),
            notes: selectedAgency.notes,
            paymentStatus: normalizeAgencyPaymentStatus(selectedAgency.payment_status),
            creationToken: String(Math.abs(selectedAgency.id)),
            sessionToken,
          });
          selectedAgency.id = newId;
        } else {
          await callTauri("update_agency", {
            id: selectedAgency.id,
            oldAgentName: selectedAgency.old_agent_name,
            carType: selectedAgency.car_type,
            newAgentName: selectedAgency.new_agent_name,
            carNumber: selectedAgency.car_number,
            carModel: selectedAgency.car_model,
            color: selectedAgency.color,
            phone: toEnglishDigits(selectedAgency.phone),
            amountIqd: String(selectedAgency.amount_iqd ?? "0"),
            amountUsd: String(selectedAgency.amount_usd ?? "0"),
            notes: selectedAgency.notes,
            paymentStatus: normalizeAgencyPaymentStatus(selectedAgency.payment_status),
            sessionToken,
          });
        }
        await fetchAgencies();
        await onRefresh();
        setSelectedAgency(null);
        setAgenciesTab("list");
      } catch (err) {
        console.error("Agency save failed:", err);
        alert("فشل حفظ الوكالة: " + (err instanceof Error ? err.message : String(err)));
      } finally {
        agencySaveInFlightRef.current = false;
        setSaving(false);
      }
    }
  };

  const handleCancelAgency = async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (selectedAgency) {
      if (selectedAgency.id > 0 && !selectedAgency.old_agent_name.trim() && !selectedAgency.new_agent_name.trim()) {
        try {
          await callTauri("delete_agency", { id: selectedAgency.id });
          await fetchAgencies();
        } catch (err) {
          console.error("Failed to delete empty agency on cancel:", err);
        }
      }
    }
    setSelectedAgency(null);
    initialAgencyRef.current = "";
    setAgenciesTab("list");
  };

  const handleAgencySaveConfirmSave = async () => {
    if (agencySaveInFlightRef.current) return;
    if (isDuplicateAgencyPlate) {
      const input = document.getElementById("agency-car-number") as HTMLElement | null;
      input?.classList.add("input--error");
      input?.focus();
      return;
    }
    await handleSaveAgency();
    setShowAgencySaveConfirm(false);
    pendingAgencyActionRef.current = null;
    pendingAgencyCloseRef.current?.();
    pendingAgencyCloseRef.current = null;
  };

  const handleAgencySaveConfirmDiscard = () => {
    setSelectedAgency(null);
    initialAgencyRef.current = "";
    setAgenciesTab("list");
    setShowAgencySaveConfirm(false);
    pendingAgencyActionRef.current = null;
    pendingAgencyCloseRef.current?.();
    pendingAgencyCloseRef.current = null;
  };

  const tryCancelAgency = () => {
    if (agencyDirty && selectedAgency) {
      setShowAgencySaveConfirm(true);
    } else {
      void handleCancelAgency();
    }
  };

  useEffect(() => {
    onDirtyChange?.(agencyDirty);
  }, [agencyDirty, onDirtyChange]);

  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = {
      request: (afterClose?: () => void) => {
        if (agencyDirty && selectedAgency && agenciesTab === "details") {
          pendingAgencyCloseRef.current = afterClose ?? null;
          setShowAgencySaveConfirm(true);
        } else {
          afterClose?.();
        }
      },
    };
    return () => { requestCloseRef.current = null; };
  });

  useEffect(() => {
    void fetchAgencies();
  }, [fetchAgencies]);

  useEffect(() => {
    onAddAgencyChange?.({ action: handleAddNewAgency });
    return () => {
      onAddAgencyChange?.(null);
    };
  }, [onAddAgencyChange, handleAddNewAgency]);

  const filteredAgencies = useMemo(() => {
    if (!agenciesSearch.trim()) return agencies;
    const q = agenciesSearch.trim().toLowerCase();
    return agencies.filter((a) =>
      a.old_agent_name.toLowerCase().includes(q) ||
      a.new_agent_name.toLowerCase().includes(q) ||
      a.car_number.toLowerCase().includes(q) ||
      a.phone.toLowerCase().includes(q) ||
      a.notes.toLowerCase().includes(q)
    );
  }, [agencies, agenciesSearch]);

  const sortedAgencies = useMemo(() => {
    return [...filteredAgencies].sort((a, b) => a.id - b.id);
  }, [filteredAgencies]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(sortedAgencies.length / PAGE_SIZE) - 1);
    setPage(lastPage);
  }, [sortedAgencies.length, agenciesSearch]);

  const totalPages = Math.max(1, Math.ceil(sortedAgencies.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const pageAgencies = useMemo(() => {
    return sortedAgencies.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [sortedAgencies, currentPage]);

  const loadAgency = useCallback(async (agency: Agency) => {
    const normalized = normalizeAgency(agency);
    setSelectedAgency(normalized);
    initialAgencyRef.current = JSON.stringify(normalized);
    setAgenciesTab("details");
  }, []);

  const handleDeleteAgency = async () => {
    if (!deleteAgencyConfirm) return;
    setSaving(true);
    try {
      if (deleteAgencyConfirm.id > 0) {
        await callTauri("delete_agency", { id: deleteAgencyConfirm.id });
      }
      if (selectedAgency?.id === deleteAgencyConfirm.id) {
        setSelectedAgency(null);
        setAgenciesTab("list");
      }
      setDeleteAgencyConfirm(null);
      await fetchAgencies();
      await onRefresh();
    } catch {
      alert("تعذر حذف الوكالة");
    } finally {
      setSaving(false);
    }
  };

  const resetTxForm = (type: string) => {
    setTxForm({ type, amount: 0, date: todayIsoDate(), notes: "", currency: "IQD" });
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgency) return;
    const dateStr = txForm.date?.trim() || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(txForm.amount) || txForm.amount <= 0) {
      // تمييز الحقل الفارغ
      const formEl = (e.target as HTMLElement).closest?.('.form') || document.querySelector('.modal-dialog .form');
      if (formEl) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const dateInput = formEl.querySelector('input[type="text"]') as HTMLElement;
          if (dateInput) { dateInput.classList.add("input--error"); dateInput.focus(); }
        } else {
          const amountInput = formEl.querySelector('input[inputmode]') as HTMLElement;
          if (amountInput) { amountInput.classList.add("input--error"); amountInput.focus(); }
        }
      }
      return;
    }
    setSaving(true);
    try {
      await callTauri("add_agency_transaction", {
        agencyId: selectedAgency.id,
        type: txForm.type,
        amount: txForm.amount,
        date: dateStr,
        notes: txForm.notes || null,
        currency: txForm.currency,
        sessionToken,
      });
      resetTxForm(txForm.type);
      setShowTxModal(false);
      await onRefresh();
    } catch {
      alert("تعذر إضافة المعاملة");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deleteTxConfirm) return;
    try {
      await callTauri("delete_agency_transaction", { id: deleteTxConfirm.id });
      setDeleteTxConfirm(null);
      await onRefresh();
    } catch {
      alert("تعذر حذف المعاملة");
    }
  };

  const filteredAgenciesForSearch = useMemo(() => {
    const q = agenciesSearch.trim().toLowerCase();
    if (!q) return [];
    return agencies.filter((a) =>
      a.old_agent_name.toLowerCase().includes(q) ||
      a.new_agent_name.toLowerCase().includes(q) ||
      a.car_number.toLowerCase().includes(q) ||
      a.phone.toLowerCase().includes(q) ||
      a.notes.toLowerCase().includes(q)
    );
  }, [agencies, agenciesSearch]);

  useEffect(() => {
    if (agenciesSearchOpen) {
      const t = setTimeout(() => agenciesSearchInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    } else {
      setAgenciesSearch("");
    }
  }, [agenciesSearchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (agenciesSearchOpen) {
          onAgenciesSearchClose?.();
          return;
        }
        if (showTxModal) {
          setShowTxModal(false);
          return;
        }
        if (deleteTxConfirm) {
          setDeleteTxConfirm(null);
          return;
        }
        if (deleteAgencyConfirm) {
          setDeleteAgencyConfirm(null);
          return;
        }
        if (showAgencySaveConfirm) {
          setShowAgencySaveConfirm(false);
          pendingAgencyCloseRef.current = null;
          return;
        }
        if (agenciesTab === "details") {
          tryCancelAgency();
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agenciesSearchOpen, onAgenciesSearchClose, agenciesTab, showTxModal, deleteTxConfirm, deleteAgencyConfirm, showAgencySaveConfirm]);

  return (
    <div className="customers-page agencies-page">
      {/* ── شريط الأدوات ── */}
      <div className="cars-page__toolbar unified-toolbar">
        <div className="unified-toolbar__right">
          <div className="cars-tabs financial-tabs">
            {AGENCIES_TABS.map((tab) => {
              const isActive = agenciesTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${tab.id === "list" ? "top-btn-one" : "top-btn-two"} ${isActive ? (tab.id === "list" ? "top-btn-one--active" : "top-btn-two--active") : ""}`.trim()}
                  onClick={() => {
                    if (tab.id === "list") {
                      if (agenciesTab === "details" && agencyDirty && selectedAgency) {
                        setShowAgencySaveConfirm(true);
                        return;
                      }
                      const now = Date.now();
                      if (now - lastListTabClickRef.current < 300) {
                        lastListTabClickRef.current = 0;
                        void handleAddNewAgency();
                        return;
                      }
                      lastListTabClickRef.current = now;
                    }
                    if (tab.id === "details" && !selectedAgency) return;
                    setAgenciesTab(tab.id);
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="unified-toolbar__center">
          {/* تم إزالة تفاصيل الوكيل من هنا بناءً على الطلب */}
        </div>
        <div className="unified-toolbar__left">
          {agenciesTab === "list" && (
            <>
              <div className="currency-card currency-card--usd">
                <PriceDisplay amount={moneySum(agencies, (a) => a.amount_usd)} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={moneySum(agencies, (a) => a.amount_iqd)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── المحتوى الرئيسي ── */}
      {loading ? (
        <div className="loading-state" style={{ minHeight: "300px" }}>
          <p>جاري تحميل الوكالات...</p>
        </div>
      ) : agenciesTab === "list" ? (
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
            <div className="table-wrapper partner-debtors-scroll">
              <table className="data-table partners-data-table agencies-table">
                <thead>
                  <tr>
                    <th className="col-seq">ت</th>
                    <th className="col-date">التاريخ</th>
                    <th className="col-car-num">رقم السيارة</th>
                    <th className="col-new-agent">الوكيل الجديد</th>
                    <th className="col-notes">الملاحظات</th>
                    <th className="col-money">المبلغ</th>
                    <th className="col-delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageAgencies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-cell">لا توجد وكالات مسجلة</td>
                    </tr>
                  ) : (
                    pageAgencies.map((agency, idx) => {
                      const paymentStatus = normalizeAgencyPaymentStatus(agency.payment_status);
                      const amountColor = paymentStatus === "واصل" ? "var(--green)" : "var(--red)";
                      return (
                        <tr
                          key={agency.id}
                          className="customers-tr"
                          onClick={() => loadAgency(agency)}
                          title="اضغط لعرض التفاصيل"
                        >
                          <td className="cell-num col-seq">{currentPage * PAGE_SIZE + idx + 1}</td>
                          <td className="col-date">{formatDisplayDate(agency.date)}</td>
                          <td className="col-car-num" title={agency.car_number || ""}>
                            <span className="agency-cell-clip">{agency.car_number || "—"}</span>
                          </td>
                          <td className="col-new-agent cell-bold" title={agency.new_agent_name || ""}>
                            <span className="agency-cell-clip">{agency.new_agent_name}</span>
                          </td>
                          <td className="col-notes" title={formatNotesText(agency.notes) || ""}>
                            <span className="agency-cell-clip">{formatNotesText(agency.notes) || "—"}</span>
                          </td>
                          <td className="col-money cell-bold" title="مبلغ الوكالة">
                            <div className="agency-amounts" style={{ color: amountColor }}>
                              {compareMoney(agency.amount_usd, 0) > 0 && (
                                <span className="agency-amount" dir="ltr">
                                  <PriceDisplay amount={agency.amount_usd} currency="USD" noColor />
                                </span>
                              )}
                              {compareMoney(agency.amount_iqd, 0) > 0 && (
                                <span className="agency-amount" dir="ltr">
                                  <PriceDisplay amount={agency.amount_iqd} noColor />
                                </span>
                              )}
                              {compareMoney(agency.amount_usd, 0) <= 0 && compareMoney(agency.amount_iqd, 0) <= 0 && <span className="agency-amount agency-amount--empty">—</span>}
                            </div>
                          </td>
                          <td className="col-delete">
                            <button
                              type="button"
                              className="partner-inline-delete-btn"
                              title="حذف"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteAgencyConfirm(agency);
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {pageAgencies.length > 0 && Array.from({ length: Math.max(0, PAGE_SIZE - pageAgencies.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} style={{ pointerEvents: "none" }} className="customers-tr opacity-25">
                      <td className="col-seq">&nbsp;</td>
                      <td className="col-date">&nbsp;</td>
                      <td className="col-car-num">&nbsp;</td>
                      <td className="col-new-agent">&nbsp;</td>
                      <td className="col-notes">&nbsp;</td>
                      <td className="col-money">&nbsp;</td>
                      <td className="col-delete">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : agenciesTab === "details" && selectedAgency ? (
        <div className="agency-unified-details" onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (e.key === "Enter" && target.tagName !== "TEXTAREA") {
            e.preventDefault();
            if (!saving && !isDuplicateAgencyPlate) void handleSaveAgency();
          }
        }}>
          <div className="agency-details-layout">
            <aside className="agency-finance-corner" aria-label="حالة ومبلغ الوكالة">
              <div className="agency-finance-corner__title">حالة ومبلغ الوكالة</div>
              <div className="agency-field agency-field--full">
                <label className="agency-label">حالة المبلغ</label>
                <div className="agency-payment-switch" role="radiogroup" aria-label="حالة المبلغ">
                  {AGENCY_PAYMENT_STATUSES.map((status) => {
                    const isActive = normalizeAgencyPaymentStatus(selectedAgency.payment_status) === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={`agency-payment-switch__option agency-payment-switch__option--${status === "واصل" ? "received" : "pending"}${isActive ? " is-active" : ""}`}
                        onClick={() => setSelectedAgency({ ...selectedAgency, payment_status: status })}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="agency-field agency-field--full">
                <label className="agency-label">المبلغ (دينار عراقي)</label>
                <PriceInput
                  value={String(selectedAgency.amount_iqd)}
                  onChange={(val) => { setSelectedAgency({ ...selectedAgency, amount_iqd: Number(val) || 0 }); }}
                />
              </div>
              <div className="agency-field agency-field--full">
                <label className="agency-label">المبلغ (دولار أمريكي)</label>
                <PriceInput
                  value={String(selectedAgency.amount_usd)}
                  onChange={(val) => { setSelectedAgency({ ...selectedAgency, amount_usd: Number(val) || 0 }); }}
                  currency="USD"
                />
              </div>
            </aside>

            <div className="agency-details-main">
              <div className="agency-section">
                <div className="agency-section__title">بيانات الوكلاء</div>
                <div className="agency-fields-row agency-fields-row--three">
                  <div className="agency-field agency-field--lg">
                    <label className="agency-label">الوكيل القديم</label>
                    <TextInput
                      id="agency-old-agent"
                      inputSize="sm"
                      value={selectedAgency.old_agent_name}
                      onChange={(e) => { setSelectedAgency({ ...selectedAgency, old_agent_name: e.target.value }); }}
                    />
                  </div>
                  <div className="agency-field agency-field--lg">
                    <label className="agency-label">الوكيل الجديد</label>
                    <TextInput
                      id="agency-new-agent"
                      inputSize="sm"
                      value={selectedAgency.new_agent_name}
                      onChange={(e) => { setSelectedAgency({ ...selectedAgency, new_agent_name: e.target.value }); }}
                    />
                  </div>
                  <div className="agency-field agency-field--lg">
                    <label className="agency-label">رقم الهاتف</label>
                    <TextInput
                      inputSize="sm"
                      value={selectedAgency.phone || ""}
                      autoComplete="new-password"
                      dir="ltr"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => { setSelectedAgency({ ...selectedAgency, phone: toEnglishDigits((e.target as HTMLInputElement).value) }); }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSelectedAgency({ ...selectedAgency, phone: toEnglishDigits(e.target.value) }); }}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setSelectedAgency({ ...selectedAgency, phone: toEnglishDigits(e.target.value) }); }}
                    />
                  </div>
                </div>
              </div>

              <div className="agency-section">
                <div className="agency-section__title">بيانات السيارة</div>
                <div className="agency-fields-row">
                  <div className="agency-field agency-field--lg">
                    <label className="agency-label">نوع السيارة</label>
                    <TextInput
                      id="agency-car-type"
                      inputSize="sm"
                      value={selectedAgency.car_type || ""}
                      onChange={(e) => { setSelectedAgency({ ...selectedAgency, car_type: e.target.value }); }}
                    />
                  </div>
                  <div className="agency-field agency-field--sm">
                    <label className="agency-label">الموديل</label>
                    <YearScrollField
                      id="agency-car-year"
                      value={selectedAgency.car_model}
                      onChange={(year) => { setSelectedAgency({ ...selectedAgency, car_model: year }); }}
                    />
                  </div>
                </div>
                <div className="agency-fields-row">
                  <div className="agency-field agency-field--md">
                    <label className="agency-label" style={isDuplicateAgencyPlate ? { color: "#ff5a5a" } : undefined}>
                      {isDuplicateAgencyPlate ? "رقم اللوحة مضاف!" : "رقم اللوحة"}
                    </label>
                    <TextInput
                      id="agency-car-number"
                      inputSize="sm"
                      type="text"
                      inputMode="decimal"
                      value={selectedAgency.car_number}
                      dir="ltr"
                      className={isDuplicateAgencyPlate ? "input--error" : undefined}
                      onInput={(e: React.FormEvent<HTMLInputElement>) => { setSelectedAgency({ ...selectedAgency, car_number: toEnglishDigits((e.target as HTMLInputElement).value).replace(/[^\w\s\u0600-\u06FF-]/g, "") }); }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSelectedAgency({ ...selectedAgency, car_number: toEnglishDigits(e.target.value).replace(/[^\w\s\u0600-\u06FF-]/g, "") }); }}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => { setSelectedAgency({ ...selectedAgency, car_number: toEnglishDigits(e.target.value).replace(/[^\w\s\u0600-\u06FF-]/g, "") }); }}
                    />
                  </div>
                  <div className="agency-field agency-field--md">
                    <label className="agency-label">لون السيارة</label>
                    <TextInput
                      id="agency-color"
                      inputSize="sm"
                      value={selectedAgency.color || ""}
                      onChange={(e) => { setSelectedAgency({ ...selectedAgency, color: e.target.value }); }}
                    />
                  </div>
                </div>
              </div>

              <div className="agency-section agency-section--notes">
                <div className="agency-section__title">الملاحظات</div>
                <div className="agency-field agency-field--notes">
                  <textarea
                    className="agency-notes-input"
                    value={selectedAgency.notes || ""}
                    onChange={(e) => setSelectedAgency({ ...selectedAgency, notes: e.target.value })}
                    placeholder="اختياري"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── أزرار العمليات ── */}
          <div style={{ display: "flex", gap: "12px", marginTop: "24px", justifyContent: "flex-start", direction: "rtl" }}>
            <GoldFxButton
              type="button"
              variant="green"
              style={{
                flex: 1,
                margin: 0,
                ...(saving || isDuplicateAgencyPlate ? { opacity: 0.42, cursor: "not-allowed", filter: "grayscale(0.55)" } : {}),
              }}
              onClick={handleSaveAgency}
              disabled={saving || isDuplicateAgencyPlate}
            >
              <span className="gold-fx-btn__label">{saving ? "جاري الحفظ..." : "حفظ"}</span>
            </GoldFxButton>
            <GoldFxButton
              type="button"
              variant="gray"
              style={{ flex: 1, margin: 0, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)" }}
              onClick={tryCancelAgency}
            >
              <span className="gold-fx-btn__label">إلغاء الأمر</span>
            </GoldFxButton>
          </div>

        </div>
      ) : null}

      {/* ── نافذة تأكيد حفظ التعديلات في الوكالة ── */}
      {showAgencySaveConfirm && (
        <div className="fx-confirm-overlay" role="presentation" onClick={() => setShowAgencySaveConfirm(false)}>
          <div
            className="fx-confirm-dialog"
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="fx-confirm-title">هل تريد حفظ التعديلات؟</h3>
            <p className="fx-confirm-message">
              لديك تعديلات غير محفوظة. هل تريد حفظها قبل المغادرة؟
            </p>
            <div className="fx-confirm-actions">
              <ActionButton
                type="button"
                variant="success"
                onClick={() => void handleAgencySaveConfirmSave()}
                disabled={saving || isDuplicateAgencyPlate}
              >
                {saving ? "جاري الحفظ..." : "نعم"}
              </ActionButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={handleAgencySaveConfirmDiscard}
                disabled={saving}
              >
                لا
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة البحث المنبثقة ── */}
      {agenciesSearchOpen && (
        <div className="search-overlay" onClick={() => onAgenciesSearchClose?.()}>
          <div
            className="search-popup"
            onClick={(e) => e.stopPropagation()}
            role="search"
            aria-label="بحث في الوكالات"
          >
            <div className="search-popup__header">
              <span className="search-popup__icon" aria-hidden>✉</span>
              <span className="search-popup__title">بحث في الوكالات</span>
              {agenciesSearch.trim() && (
                <span className="search-popup__badge">{filteredAgenciesForSearch.length}</span>
              )}
              <button
                type="button"
                className="search-popup__close"
                onClick={() => onAgenciesSearchClose?.()}
                aria-label="إغلاق البحث"
              >
                ✕
              </button>
            </div>

            <div className="search-popup__body">
              <span className="search-popup__search-icon" aria-hidden>🔍</span>
              <input
                ref={agenciesSearchInputRef}
                type="search"
                className="search-popup__input"
                placeholder="ابحث باسم الوكيل أو رقم السيارة..."
                value={agenciesSearch}
                onChange={(e) => {
                  setAgenciesSearch(e.target.value);
                  setAgenciesSearchHighlightIdx(0);
                }}
                onKeyDown={(e) => {
                  const results = filteredAgenciesForSearch.slice(0, 8);
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAgenciesSearchHighlightIdx((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAgenciesSearchHighlightIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results.length > 0) {
                    e.preventDefault();
                    const agency = results[agenciesSearchHighlightIdx] ?? results[0];
                    onAgenciesSearchClose?.();
                    void loadAgency(agency);
                  }
                }}
                autoComplete="off"
                dir="rtl"
              />
              {agenciesSearch && (
                <button
                  type="button"
                  className="search-popup__clear"
                  onClick={() => { setAgenciesSearch(""); setAgenciesSearchHighlightIdx(0); }}
                  aria-label="مسح البحث"
                >
                  ✕
                </button>
              )}
            </div>

            {agenciesSearch.trim() && (
              <div className="search-popup__results">
                {filteredAgenciesForSearch.length === 0 ? (
                  <div className="search-popup__empty">
                    <span className="search-popup__empty-icon" aria-hidden>📋</span>
                    <span>لا توجد وكالات مطابقة</span>
                  </div>
                ) : (
                  <ul className="search-popup__list" role="listbox">
                    {filteredAgenciesForSearch.slice(0, 8).map((agency, resultIdx) => {
                      const isHighlighted = resultIdx === agenciesSearchHighlightIdx;
                      const q = agenciesSearch.trim();
                      const highlight = (text: string) => {
                        if (!q) return text;
                        const idx = text.toLowerCase().indexOf(q.toLowerCase());
                        if (idx === -1) return text;
                        return (
                          <>
                            {text.slice(0, idx)}
                            <mark className="search-popup__mark">{text.slice(idx, idx + q.length)}</mark>
                            {text.slice(idx + q.length)}
                          </>
                        );
                      };
                      return (
                        <li
                          key={agency.id}
                          className={`search-popup__item${isHighlighted ? " search-popup__item--active" : ""}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onMouseEnter={() => setAgenciesSearchHighlightIdx(resultIdx)}
                          onClick={() => {
                            onAgenciesSearchClose?.();
                            void loadAgency(agency);
                          }}
                        >
                          <div className="search-popup__item-main">
                            <span className="search-popup__item-model">{highlight(agency.old_agent_name)}</span>
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "var(--fs-xs)" }}>→ {agency.new_agent_name}</span>
                          </div>
                          <div className="search-popup__item-sub">
                            <span className="search-popup__item-plate">{highlight(agency.car_number)}</span>
                            <span className="search-popup__item-dot" aria-hidden>•</span>
                            <span>{agency.phone || "—"}</span>
                          </div>
                        </li>
                      );
                    })}
                    {filteredAgenciesForSearch.length > 8 && (
                      <li className="search-popup__more">
                        و {filteredAgenciesForSearch.length - 8} وكالة أخرى...
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── نافذة إضافة معاملة ── */}
      {showTxModal && selectedAgency && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowTxModal(false)}>
          <div className="modal-dialog" role="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 className="modal-dialog__title">
              {txForm.type === "ايداع" ? "إيداع" : "سحب"} - {selectedAgency.new_agent_name}
            </h3>
            <form className="form" onSubmit={handleAddTransaction}>
              <div className="form-group">
                <label className="label">التاريخ</label>
                <UnifiedDateField
                  value={txForm.date}
                  onChange={(date) => setTxForm({ ...txForm, date })}
                />
              </div>
              <div className="form-group">
                <PriceInput
                  label="المبلغ"
                  value={txForm.amount ? String(txForm.amount) : ""}
                  onChange={(val) => setTxForm({ ...txForm, amount: Number(val) || 0 })}
                  currency={txForm.currency}
                  onCurrencyChange={(curr) => setTxForm({ ...txForm, currency: curr })}
                />
              </div>
              <div className="form-group">
                <label className="label">ملاحظة</label>
                <textarea
                  className="input"
                  value={txForm.notes}
                  onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                  onFocus={(e) => setTimeout(() => e.target.select(), 0)}
                  placeholder="اختياري"
                  rows={2}
                  style={{ resize: "none", width: "100%" }}
                />
              </div>
              {/* ── أزرار العمليات ── */}
              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <GoldFxButton
                  type="submit"
                  variant="green"
                  style={{ flex: 1, margin: 0 }}
                  disabled={saving}
                >

                  <span className="gold-fx-btn__label">{saving ? "جاري الحفظ..." : "حفظ"}</span>
                </GoldFxButton>
                <GoldFxButton
                  type="button"
                  variant="red"
                  style={{ flex: 1, margin: 0 }}
                  onClick={() => setShowTxModal(false)}
                >
                  <span className="gold-fx-btn__label">إلغاء الأمر</span>
                </GoldFxButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── تأكيد حذف المعاملة ── */}
      <ConfirmDialog
        open={!!deleteTxConfirm}
        title="تأكيد حذف المعاملة"
        message={<span>هل تريد حذف هذه المعاملة بقيمة ({deleteTxConfirm ? <PriceDisplay amount={deleteTxConfirm.amount} currency={deleteTxConfirm.currency} /> : ""})؟ لا يمكن التراجع عن هذا الإجراء.</span>}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        onConfirm={() => void handleDeleteTransaction()}
        onCancel={() => setDeleteTxConfirm(null)}
      />

      {/* ── تأكيد حذف الوكالة ── */}
      <ConfirmDialog
        open={!!deleteAgencyConfirm}
        title="تأكيد حذف الوكالة"
        message={`هل تريد حذف وكالة «${deleteAgencyConfirm?.old_agent_name || ""} → ${deleteAgencyConfirm?.new_agent_name || ""}» وكل معاملاتها؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="نعم، احذف"
        cancelLabel="إلغاء"
        danger
        loading={saving}
        onConfirm={() => void handleDeleteAgency()}
        onCancel={() => setDeleteAgencyConfirm(null)}
      />
    </div>
  );
}
