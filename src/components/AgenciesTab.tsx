import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { callTauri } from "../api/tauri";
import type { Agency, AgencyTransaction } from "../types";
import { ActionButton, NumberInput, PriceDisplay, PriceInput, TextInput } from "@/components/ui";
import { YearScrollField } from "./YearScrollField";
import { PAGE_SIZE } from "../constants";
import { handlePaginationKeyDown, handlePaginationWheel } from "../utils/pagination";
import { ConfirmDialog } from "./ConfirmDialog";
import { UnifiedDateField } from "./UnifiedDateField";
import { englishKeyboardToArabic } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import "../styles/partners.css";
import "../styles/cards.css";
import "../styles/cars.css";
import "../styles/agencies.css";
import "../styles/searching.css";

interface AgenciesTabProps {
  onRefresh: () => Promise<void>;
  agenciesSearchOpen?: boolean;
  onAgenciesSearchClose?: () => void;
}

const AGENCIES_TABS: { id: "list" | "details"; label: string }[] = [
  { id: "list", label: "الوكالات" },
  { id: "details", label: "تفاصيل" },
];

export function AgenciesTab({ onRefresh, agenciesSearchOpen, onAgenciesSearchClose }: AgenciesTabProps) {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [agenciesTab, setAgenciesTab] = useState<"list" | "details">("list");
  const lastListTabClickRef = useRef(0);
  const [agenciesSearch, setAgenciesSearch] = useState("");
  const [agenciesSearchHighlightIdx, setAgenciesSearchHighlightIdx] = useState(0);
  const agenciesSearchInputRef = useRef<HTMLInputElement>(null);
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [transactions, setTransactions] = useState<AgencyTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);

  const [txForm, setTxForm] = useState({ type: "ايداع" as string, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", currency: "IQD" as string });
  const [txCurrency, setTxCurrency] = useState<"IQD" | "USD">("IQD");

  const [deleteTxConfirm, setDeleteTxConfirm] = useState<AgencyTransaction | null>(null);
  const [deleteAgencyConfirm, setDeleteAgencyConfirm] = useState<Agency | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callTauri<Agency[]>("get_agencies");
      setAgencies(data ?? []);
    } catch (err) {
      console.error("Failed to fetch agencies:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddNewAgency = useCallback(async () => {
    try {
      const newId = await callTauri<number>("add_agency", {
        oldAgentName: "",
        carNumber: "",
        carModel: "",
        color: "",
        newAgentName: "",
        phone: "",
        amountUsd: 0,
        amountIqd: 0,
        notes: "",
      });
      const today = new Date().toISOString().slice(0, 10);
      const newAgency: Agency = {
        id: newId,
        old_agent_name: "",
        car_number: "",
        car_model: "",
        color: "",
        new_agent_name: "",
        phone: "",
        amount_usd: 0,
        amount_iqd: 0,
        notes: "",
        date: today,
        time: "",
      };
      setSelectedAgency(newAgency);
      setAgenciesTab("details");
      setTransactions([]);
      await fetchAgencies();
    } catch (err) {
      console.error("Failed to create agency:", err);
    }
  }, [fetchAgencies]);

  const handleAutoSave = useCallback((updatedAgency: Agency) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await callTauri("update_agency", {
          id: updatedAgency.id,
          oldAgentName: updatedAgency.old_agent_name,
          newAgentName: updatedAgency.new_agent_name,
          carNumber: updatedAgency.car_number,
          carModel: updatedAgency.car_model,
          color: updatedAgency.color,
          phone: toEnglishDigits(updatedAgency.phone),
          amountIqd: Number(updatedAgency.amount_iqd) || 0,
          amountUsd: Number(updatedAgency.amount_usd) || 0,
          notes: updatedAgency.notes
        });
        const data = await callTauri<Agency[]>("get_agencies");
        if (data) setAgencies(data);
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);
  }, []);

  useEffect(() => {
    void fetchAgencies();
  }, [fetchAgencies]);

  const filteredAgencies = useMemo(() => {
    if (!agenciesSearch.trim()) return agencies;
    const q = agenciesSearch.trim().toLowerCase();
    return agencies.filter((a) =>
      a.old_agent_name.toLowerCase().includes(q) ||
      a.new_agent_name.toLowerCase().includes(q) ||
      a.car_number.toLowerCase().includes(q) ||
      a.phone.toLowerCase().includes(q)
    );
  }, [agencies, agenciesSearch]);

  const sortedAgencies = useMemo(() => {
    return [...filteredAgencies].sort((a, b) => b.id - a.id);
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
    setSelectedAgency(agency);
    setAgenciesTab("details");
    setTransactionsLoading(true);
    try {
      const txs = await callTauri<AgencyTransaction[]>("get_agency_transactions", { agencyId: agency.id });
      setTransactions(txs ?? []);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  }, []);

  const handleDeleteAgency = async () => {
    if (!deleteAgencyConfirm) return;
    setSaving(true);
    try {
      await callTauri("delete_agency", { id: deleteAgencyConfirm.id });
      if (selectedAgency?.id === deleteAgencyConfirm.id) {
        setSelectedAgency(null);
        setTransactions([]);
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
    setTxForm({ type, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", currency: "IQD" });
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgency) return;
    const dateStr = txForm.date?.trim() || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(txForm.amount) || txForm.amount <= 0) {
      alert("الرجاء إدخال مبلغ صحيح والتاريخ");
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
        currency: txCurrency,
      });
      resetTxForm(txForm.type);
      const txs = await callTauri<AgencyTransaction[]>("get_agency_transactions", { agencyId: selectedAgency.id });
      setTransactions(txs ?? []);
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
      const txs = await callTauri<AgencyTransaction[]>("get_agency_transactions", { agencyId: deleteTxConfirm.agency_id });
      setTransactions(txs ?? []);
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
      a.phone.toLowerCase().includes(q)
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
        setShowTxModal(false);
        setDeleteTxConfirm(null);
        setDeleteAgencyConfirm(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [agenciesSearchOpen, onAgenciesSearchClose]);

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
                <PriceDisplay amount={agencies.reduce((s, a) => s + a.amount_usd, 0)} currency="USD" />
              </div>
              <div className="currency-card currency-card--iqd">
                <PriceDisplay amount={agencies.reduce((s, a) => s + a.amount_iqd, 0)} />
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
                    <th className="col-old-agent">الوكيل القديم</th>
                    <th className="col-car-num">رقم السيارة</th>
                    <th className="col-model">الموديل</th>
                    <th className="col-new-agent">الوكيل الجديد</th>
                    <th className="col-phone">رقم الهاتف</th>
                    <th className="col-money">المبلغ</th>
                    <th className="col-delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageAgencies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-cell">لا توجد وكالات مسجلة</td>
                    </tr>
                  ) : (
                    pageAgencies.map((agency, idx) => {
                      return (
                        <tr
                          key={agency.id}
                          className="customers-tr"
                          onClick={() => loadAgency(agency)}
                          title="اضغط لعرض التفاصيل"
                        >
                          <td className="cell-num col-seq">{currentPage * PAGE_SIZE + idx + 1}</td>
                          <td className="col-date">{agency.date || "—"}</td>
                          <td className="col-old-agent cell-bold">{agency.old_agent_name}</td>
                          <td className="col-car-num">{agency.car_number || "—"}</td>
                          <td className="col-model">{agency.car_model || "—"}</td>
                          <td className="col-new-agent cell-bold">{agency.new_agent_name}</td>
                          <td className="col-phone">{agency.phone || "—"}</td>
                          <td className="col-money cell-bold">
                            <div style={{ display: "flex", gap: "10px" }}>
  {agency.amount_usd > 0 && (
    <span style={{ color: "#10b981", fontSize: "var(--fs-xs)", direction: "ltr", display: "inline-block" }}>
      <PriceDisplay amount={agency.amount_usd} currency="USD" noColor />
    </span>
  )}
  {agency.amount_iqd > 0 && (
    <span style={{ color: "#d8a85a", fontSize: "var(--fs-xs)", direction: "ltr", display: "inline-block" }}>
      <PriceDisplay amount={agency.amount_iqd} noColor />
    </span>
                              )}
                              {agency.amount_usd <= 0 && agency.amount_iqd <= 0 && <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
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
                      <td className="col-old-agent">&nbsp;</td>
                      <td className="col-car-num">&nbsp;</td>
                      <td className="col-model">&nbsp;</td>
                      <td className="col-new-agent">&nbsp;</td>
                      <td className="col-phone">&nbsp;</td>
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
        <div className="agency-unified-details">

          {/* ── صف 1: الوكيلان والتاريخ ── */}
          <div className="agency-section">
            <div className="agency-section__title">بيانات الوكالة</div>
            <div className="agency-fields-row">
              <div className="agency-field agency-field--lg">
                <label className="agency-label">الوكيل القديم</label>
                <TextInput
                  inputSize="sm"
                  value={selectedAgency.old_agent_name}
                  onChange={(e) => { const next = { ...selectedAgency, old_agent_name: englishKeyboardToArabic(e.target.value) }; setSelectedAgency(next); handleAutoSave(next); }}
                  placeholder="اسم الوكيل القديم"
                />
              </div>
              <div className="agency-field agency-field--lg">
                <label className="agency-label">الوكيل الجديد</label>
                <TextInput
                  inputSize="sm"
                  value={selectedAgency.new_agent_name}
                  onChange={(e) => { const next = { ...selectedAgency, new_agent_name: englishKeyboardToArabic(e.target.value) }; setSelectedAgency(next); handleAutoSave(next); }}
                  placeholder="اسم الوكيل الجديد"
                />
              </div>
              <div className="agency-field agency-field--md">
                <label className="agency-label">رقم الهاتف</label>
                <TextInput
                  inputSize="sm"
                  value={selectedAgency.phone || ""}
                  autoComplete="new-password"
                  dir="ltr"
                  placeholder="07XX XXX XXXX"
                  onInput={(e: React.FormEvent<HTMLInputElement>) => { const v = toEnglishDigits((e.target as HTMLInputElement).value); const next = { ...selectedAgency, phone: v }; setSelectedAgency(next); handleAutoSave(next); }}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = toEnglishDigits(e.target.value); const next = { ...selectedAgency, phone: v }; setSelectedAgency(next); handleAutoSave(next); }}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => { const v = toEnglishDigits(e.target.value); const next = { ...selectedAgency, phone: v }; setSelectedAgency(next); handleAutoSave(next); }}
                />
              </div>
            </div>
          </div>

          {/* ── صف 2: بيانات السيارة ── */}
          <div className="agency-section">
            <div className="agency-section__title">بيانات السيارة</div>
            <div className="agency-fields-row">
              <div className="agency-field agency-field--sm">
                <label className="agency-label">رقم اللوحة</label>
                <TextInput
                  inputSize="sm"
                  type="text"
                  inputMode="decimal"
                  value={selectedAgency.car_number}
                  dir="ltr"
                  onInput={(e: React.FormEvent<HTMLInputElement>) => { const v = toEnglishDigits((e.target as HTMLInputElement).value).replace(/\D/g, ""); const next = { ...selectedAgency, car_number: v }; setSelectedAgency(next); handleAutoSave(next); }}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = toEnglishDigits(e.target.value).replace(/\D/g, ""); const next = { ...selectedAgency, car_number: v }; setSelectedAgency(next); handleAutoSave(next); }}
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => { const v = toEnglishDigits(e.target.value).replace(/\D/g, ""); const next = { ...selectedAgency, car_number: v }; setSelectedAgency(next); handleAutoSave(next); }}
                  placeholder="12345"
                />
              </div>
              <div className="agency-field agency-field--sm">
                <label className="agency-label">الموديل</label>
                <YearScrollField
                  id="agency-car-year"
                  value={selectedAgency.car_model}
                  onChange={(year) => { const next = { ...selectedAgency, car_model: year }; setSelectedAgency(next); handleAutoSave(next); }}
                />
              </div>
              <div className="agency-field agency-field--md">
                <label className="agency-label">لون السيارة</label>
                <TextInput
                  inputSize="sm"
                  value={selectedAgency.color || ""}
                  onChange={(e) => { const next = { ...selectedAgency, color: e.target.value }; setSelectedAgency(next); handleAutoSave(next); }}
                  placeholder="اللون"
                />
              </div>
            </div>
          </div>

          {/* ── صف 3: المبالغ ── */}
          <div className="agency-section">
            <div className="agency-section__title">المبالغ المالية</div>
            <div className="agency-fields-row">
              <div className="agency-field agency-field--lg">
                <label className="agency-label">المبلغ (دينار عراقي)</label>
                <PriceInput
                  value={selectedAgency.amount_iqd}
                  onChange={(val) => { const next = { ...selectedAgency, amount_iqd: val }; setSelectedAgency(next); handleAutoSave(next); }}
                  hideCurrency
                />
              </div>
              <div className="agency-field agency-field--lg">
                <label className="agency-label">المبلغ (دولار أمريكي)</label>
                <PriceInput
                  value={selectedAgency.amount_usd}
                  onChange={(val) => { const next = { ...selectedAgency, amount_usd: val }; setSelectedAgency(next); handleAutoSave(next); }}
                  currency="USD"
                  hideCurrency
                />
              </div>
            </div>
          </div>

        </div>
      ) : null}

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
                            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem" }}>→ {agency.new_agent_name}</span>
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
                <label className="label">المبلغ</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <NumberInput
                      value={String(txForm.amount)}
                      onChange={(val) => setTxForm({ ...txForm, amount: Number(val) || 0 })}
                      min={0}
                      hideArrows
                    />
                  </div>
                  <div className="payment-type-selector" style={{ flexShrink: 0, padding: "4px" }}>
                    {(["IQD", "USD"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`payment-type-btn ${txCurrency === opt ? "payment-type-btn--active" : ""}`}
                        onClick={() => setTxCurrency(opt)}
                        style={{ padding: "8px 12px", fontSize: "var(--fs-xs)" }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="label">ملاحظة</label>
                <textarea
                  className="input"
                  value={txForm.notes}
                  onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                  placeholder="اختياري"
                  rows={2}
                  style={{ resize: "none", width: "100%" }}
                />
              </div>
              <div className="modal-dialog__actions">
                <ActionButton type="button" variant="ghost" onClick={() => setShowTxModal(false)}>
                  إلغاء
                </ActionButton>
                <ActionButton type="submit" variant={txForm.type === "ايداع" ? "success" : "secondary"} disabled={saving}>
                  {saving ? "جاري الحفظ..." : "إضافة"}
                </ActionButton>
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
