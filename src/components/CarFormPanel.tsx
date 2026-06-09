import { useEffect, useRef, useState } from "react";
import type { CarFormState, Partner, UnifiedAccount, CarExpenseRecord } from "../types";
import { callTauri } from "../api/tauri";
import "../styles/monsadilah.css";
import { SearchableCombobox } from "./SearchableCombobox";

import { arabicKeyboardToEnglish, englishKeyboardToArabic, toChassisText } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import { YearScrollField } from "./YearScrollField";
import {
  ActionButton,
  TextInput,
  NumberInput,
  PriceInput,
  type Currency,
} from "@/components/ui";

function toEn(v: string) { return toEnglishDigits(v); }

interface CarFormPanelProps {
  form: CarFormState;
  isEditing: boolean;
  saving: boolean;
  onChange: (patch: Partial<CarFormState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose?: () => void;
  embedMode?: boolean;
}

export function CarFormPanel({
  form, isEditing, saving,
  onChange, onSubmit, onClose,
  embedMode = false,
}: CarFormPanelProps) {
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [unifiedAccounts, setUnifiedAccounts] = useState<UnifiedAccount[]>([]);
  const [carExpenses, setCarExpenses] = useState<CarExpenseRecord[]>([]);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [, setIsSelectOpen] = useState(false);
  // ── نظام الصفحتين: 0 = مواصفات السيارة، 1 = تفاصيل البيع ──
  const [formPage, setFormPage] = useState(0);

  useEffect(() => {
    callTauri<Partner[]>("get_partners")
      .then((res) => setAllPartners(res || []))
      .catch(console.error);
    callTauri<UnifiedAccount[]>("get_unified_accounts")
      .then((res) => setUnifiedAccounts(res || []))
      .catch(console.error);
  }, []);

  const loadCarExpenses = () => {
    if (!form.num) return;
    const carNumber = [form.num.trim(), form.province.trim()].filter(Boolean).join(" ");
    callTauri<CarExpenseRecord[]>("get_car_expense_records", { carNumber })
      .then((res) => {
        setCarExpenses(res || []);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadCarExpenses();
  }, [form.num, form.province]);

  const prevPage = useRef(formPage);
  useEffect(() => {
    if (prevPage.current === 0 && formPage === 1) {
      if (expenseDesc.trim() && Number(expenseAmt) > 0) {
        void handleAddExpense();
      }
    }
    prevPage.current = formPage;
  }, [formPage]);

  const handleAddExpense = async () => {
    if (!expenseDesc.trim() || !Number(expenseAmt) || !form.num) return;
    const carNumber = [form.num.trim(), form.province.trim()].filter(Boolean).join(" ");
    try {
      await callTauri("add_expense", {
        description: expenseDesc.trim(),
        amount: Number(expenseAmt) || 0,
        date: todayIsoDate(),
        notes: `مصروف مخصص للسيارة ${form.name || form.model || "سيارة"} رقم ${carNumber}`,
        currency: expenseCurrency,
        carNumber,
      });
      setExpenseDesc("");
      setExpenseAmt("");
      loadCarExpenses();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    try {
      await callTauri("delete_car_expense_record", { id });
      loadCarExpenses();
    } catch (err) {
      console.error(err);
    }
  };

  const hasSellingPrice = form.selling !== "" && Number(form.selling) > 0;
  const hasBuyerName = form.buyerName.trim() !== "";
  const isSold = hasSellingPrice && hasBuyerName;
  const installmentMonths = Number(form.installmentMonths) || 1;
  const amountRemaining = Number(form.amountRemaining) || 0;

  const monthly = form.paymentType === "اقساط" && installmentMonths > 0
    ? amountRemaining / installmentMonths : 0;
  const formRef = useRef<HTMLFormElement>(null);

  // Find "فجر الوادي" partner entry
  const fajrPartner = (form.carPartners || []).find(p => p.partner_name === "فجر الوادي");
  // Find the other partner entry (first one that isn't "فجر الوادي")
  const otherPartner = (form.carPartners || []).find(p => p.partner_name !== "فجر الوادي");

  const handleFajrAmountChange = (amount: string) => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name === "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], amount };
    } else {
      nextPartners.push({ partner_name: "فجر الوادي", amount, currency: form.currency });
    }
    onChange({ carPartners: nextPartners });
  };

  const handleFajrCurrencyChange = (currency: "IQD" | "USD") => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name === "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], currency };
    } else {
      nextPartners.push({ partner_name: "فجر الوادي", amount: "", currency });
    }
    onChange({ carPartners: nextPartners });
  };

  const handleOtherPartnerNameChange = (name: string) => {
    const nextPartners = (form.carPartners || []).filter(p => p.partner_name === "فجر الوادي");
    if (name && name !== "no_other_partner") {
      const existingOther = (form.carPartners || []).find(p => p.partner_name !== "فجر الوادي");
      const amount = existingOther ? existingOther.amount : "";
      const currency = existingOther ? existingOther.currency : form.currency;

      const found = allPartners.find(p => p.partner_name === name);
      const kind = found ? found.kind : "شريك";

      nextPartners.push({ partner_name: name, amount, currency, kind });
    }
    onChange({ carPartners: nextPartners });
  };

  const handleOtherPartnerAmountChange = (amount: string) => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name !== "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], amount };
    } else {
      const existingOtherName = otherPartner ? otherPartner.partner_name : "";
      if (existingOtherName) {
        nextPartners.push({ partner_name: existingOtherName, amount, currency: form.currency });
      }
    }
    onChange({ carPartners: nextPartners });
  };

  const handleOtherPartnerCurrencyChange = (currency: "IQD" | "USD") => {
    const nextPartners = [...(form.carPartners || [])];
    const idx = nextPartners.findIndex(p => p.partner_name !== "فجر الوادي");
    if (idx > -1) {
      nextPartners[idx] = { ...nextPartners[idx], currency };
    } else {
      const existingOtherName = otherPartner ? otherPartner.partner_name : "";
      if (existingOtherName) {
        nextPartners.push({ partner_name: existingOtherName, amount: "", currency });
      }
    }
    onChange({ carPartners: nextPartners });
  };


  /* مزامنة حالة السيارة تلقائياً */
  useEffect(() => {
    const desiredStatus: "متوفرة" | "مبيوعة" = isSold ? "مبيوعة" : "متوفرة";
    if (form.status !== desiredStatus) {
      onChange({ status: desiredStatus });
      if (isSold && !form.saleDate) {
        onChange({ saleDate: todayIsoDate() });
      }
    }
  }, [isSold]);

  const prevAutoType = useRef(form.paymentType);

  useEffect(() => {
    const pt = form.paymentType;
    if (pt === prevAutoType.current) return;

    const patch: Partial<CarFormState> = {};
    const existingDate = form.deliveryDate || form.firstPaymentDate;
    if (pt === "موعد" && !form.deliveryDate) {
      patch.deliveryDate = existingDate || todayIsoDate();
    }
    if (pt === "اقساط" && !form.firstPaymentDate) {
      patch.firstPaymentDate = existingDate || todayIsoDate();
    }
    if (Object.keys(patch).length > 0) {
      onChange(patch);
    }
    prevAutoType.current = pt;
  }, [form.paymentType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!formEl) return;

    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));

    const checks: { id: string; valid: () => boolean }[] = [
      { id: "car-model", valid: () => !!form.model.trim() },
      { id: "car-year", valid: () => !!form.year.trim() },
      { id: "car-color", valid: () => !!form.color.trim() },
      { id: "car-num", valid: () => !!form.num.trim() },
      { id: "car-chassis", valid: () => !!form.chassis.trim() },
      { id: "car-purchase", valid: () => form.purchase !== "" && Number(form.purchase) > 0 },
    ];

    if (isSold) {
      checks.push(
        { id: "car-selling", valid: () => form.selling !== "" && Number(form.selling) > 0 },
        { id: "buyer-name", valid: () => !!form.buyerName.trim() },
      );
      if (form.paymentType !== "كاش") {
        checks.push(
          { id: "amount-paid", valid: () => form.amountPaid !== "" && Number(form.amountPaid) >= 0 },
          { id: "amount-remaining", valid: () => form.amountRemaining !== "" && Number(form.amountRemaining) >= 0 },
        );
      }
      if (form.paymentType === "اقساط") {
        checks.push(
          { id: "installment-months", valid: () => form.installmentMonths !== "" && Number(form.installmentMonths) > 0 },
          { id: "first-payment-date", valid: () => !!(form.firstPaymentDate || form.deliveryDate)?.trim() },
        );
      }
      if (form.paymentType === "موعد") {
        checks.push(
          { id: "first-payment-date", valid: () => !!(form.deliveryDate || form.firstPaymentDate)?.trim() },
        );
      }
    }

    for (const { id, valid } of checks) {
      try {
        if (!valid()) {
          const el = formEl.querySelector<HTMLElement>(`#${id}`);
          el?.classList.add("input--error");
          el?.focus();
          formEl.classList.add("form--submitted");
          return;
        }
      } catch (err) {
        console.error(`Validation error for #${id}:`, err);
        return;
      }
    }

    onSubmit(e);
  };

  const patchEnglishText = (key: "num" | "chassis", value: string) => {
    const next = key === "chassis" ? toChassisText(value) : toEn(value);
    onChange({ [key]: next } as Pick<CarFormState, typeof key>);
  };

  const formContent = (
    <form
      id="car-form"
      className="flex flex-col overflow-hidden relative bg-[var(--car-bg-page)] font-arabic"
      style={{
        ...(embedMode ? { flex: 1, minHeight: 0 } : { height: "100%", maxHeight: "100%" }),
      }}
      onSubmit={handleSubmit}
      ref={formRef}
      onInput={(e) => {
        const target = e.target as HTMLElement;
        target.classList.remove("input--error");
        const formEl = formRef.current;
        if (formEl && !formEl.querySelector(".input--error")) {
          formEl.classList.remove("form--submitted");
        }
      }}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        target.classList.remove("input--error");
        const formEl = formRef.current;
        if (formEl && !formEl.querySelector(".input--error")) {
          formEl.classList.remove("form--submitted");
        }
      }}
    >
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        {/* ── حالة السيارة ── */}
        <div className="flex justify-center flex-shrink-0">
          <span
            className={`px-5 py-1.5 rounded-full text-sm font-bold tracking-wide transition-all duration-300 ${
              isSold
                ? "bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                : "bg-green-500/15 text-green-400 border border-green-500/30 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
            }`}
          >
            {isSold ? "مبــــاع" : "متــــوفر"}
          </span>
        </div>

        {/* ── Tabs ── */}
        <div className="flex justify-center gap-8 border-b border-[var(--car-border)] flex-shrink-0">
          {[
            { page: 0, label: "🚗 مواصفات السيارة" },
            { page: 1, label: "💰 تفاصيل البيع" },
          ].map(({ page, label }) => (
            <button
              key={page}
              type="button"
              onClick={() => { setFormPage(page); }}
              className={`pb-2 text-[var(--car-fs-button)] font-bold transition-colors ${formPage === page
                  ? "text-[var(--car-accent)] border-b-2 border-[var(--car-accent)]"
                  : "text-[var(--car-text-muted)] border-b-2 border-transparent hover:text-gray-300"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Scrollable Content ── */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-0.5 car-dashboard__scrollable"
          data-inner-scroll="true"
        >
          {/* ─── Page 1: Car Specs + Purchase + Expenses ─── */}
          {formPage === 0 && (
            <div className="car-form-grid">
              {/* Column 1: Vehicle Specs */}
              <div className="car-form-card car-form-card--specs" id="specs-container">
                <h4 className="car-form-group-title">
                  مواصفات المركبة
                </h4>
                <div className="grid grid-cols-4" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                  <div className="col-span-3 flex" style={{ gap: "var(--car-gap-x)" }}>
                    <div className="flex-[2_1_0%] min-w-0">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">نوع السيارة</label>
                      <TextInput
                        id="car-model"
                        inputSize="sm"
                        value={form.model}
                        onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish((e.target as HTMLInputElement).value).toUpperCase() })}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish(e.target.value).toUpperCase() })}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ model: arabicKeyboardToEnglish(e.target.value).toUpperCase() })}
                        placeholder="الموديل"
                        dir="ltr"
                        required
                        autoFocus={!isEditing}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">الموديل</label>
                      <YearScrollField
                        id="car-year"
                        value={form.year}
                        onChange={(year) => onChange({ year })}
                        required
                      />
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اللون</label>
                    <TextInput
                      id="car-color"
                      inputSize="sm"
                      value={form.color}
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic((e.target as HTMLInputElement).value) })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic(e.target.value) })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ color: englishKeyboardToArabic(e.target.value) })}
                      placeholder="لون"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">رقم اللوحة</label>
                    <TextInput
                      id="car-num"
                      inputSize="sm"
                      type="text"
                      inputMode="decimal"
                      value={form.num}
                      dir="ltr"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ num: toEn((e.target as HTMLInputElement).value).replace(/\D/g, "") })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/\D/g, "") })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/\D/g, "") })}
                      onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
                      placeholder="12345"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">رقم الشاصي</label>
                    <TextInput
                      id="car-chassis"
                      inputSize="sm"
                      value={form.chassis}
                      dir="ltr"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => patchEnglishText("chassis", (e.target as HTMLInputElement).value)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => patchEnglishText("chassis", e.target.value)}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => patchEnglishText("chassis", e.target.value)}
                      placeholder="VIN"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Column 2: Purchase Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--car-gap-x)" }}>
                <div className="car-form-card car-form-card--purchase" id="purchase-container">
                  <h4 className="car-form-group-title">
                    تفاصيل الشراء
                  </h4>
                  <div className="grid grid-cols-2" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                    <div>
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">سعر الشراء</label>
                      <PriceInput
                        id="car-purchase"
                        value={form.purchase}
                        onChange={(purchase) => onChange({ purchase })}
                        currency={form.currency as Currency}
                        onCurrencyChange={(currency) => onChange({ currency })}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اجمالي التكلفة</label>
                      {(() => {
                        const expensesTotal = carExpenses.reduce((s, e) => s + e.amount, 0);
                        const total = (Number(form.purchase) || 0) + expensesTotal;
                        return (
                          <div
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 0.75rem",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              borderRadius: "8px",
                              color: "#22c55e",
                              fontWeight: 700,
                              fontSize: "var(--fs-base)",
                              direction: "ltr",
                              opacity: 0.8,
                              justifyContent: "center",
                            }}
                          >
                            {total.toLocaleString("en-US")} {form.currency === "USD" ? "USD" : "IQ"}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="col-span-2">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">طريقة الشراء</label>
                      <div className="payment-type-selector" style={{ display: "flex", gap: "4px" }}>
                        {(["كاش", "شراكه", "تمويل", "شركة"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`payment-type-btn payment-type-btn--${opt === "كاش" ? "green" : opt === "شراكه" ? "purple" : opt === "تمويل" ? "blue" : "orange"} ${form.purchaseType === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => onChange({ purchaseType: opt })}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                {form.purchaseType && (
                  <div className="bg-[var(--car-bg-card)] rounded-xl p-3">
                    {form.purchaseType === "شراكه" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {(() => {
                          const totalPurchase = Number(form.purchase) || 0;
                          const amt = Number(fajrPartner?.amount) || 0;
                          const pct = totalPurchase > 0 ? ((amt / totalPurchase) * 100).toFixed(1) : "0";
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ flex: 1 }}>
                                <div className="input flex items-center justify-between text-right" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: "8px", height: "44px", padding: "0 0.75rem 0 2.2rem", color: "#fff", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-base)" }}>
                                  <span>فجر الوادي</span>
                                  <span style={{ fontSize: "var(--fs-xs)", color: "#a78bfa", fontWeight: "var(--fw-bold)" }}>
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <PriceInput
                                  value={fajrPartner?.amount || ""}
                                  onChange={handleFajrAmountChange}
                                  currency={(fajrPartner?.currency || form.currency) as "IQD" | "USD"}
                                  onCurrencyChange={handleFajrCurrencyChange}
                                  className="h-[44px]"
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {(() => {
                          const totalPurchase = Number(form.purchase) || 0;
                          const amt = Number(otherPartner?.amount) || 0;
                          const pct = totalPurchase > 0 ? ((amt / totalPurchase) * 100).toFixed(1) : "0";
                          const otherPartnerName = otherPartner?.partner_name || "";
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ flex: 1 }}>
                                {(() => {
                                  const opts = allPartners.filter((p) => {
                                    const k = (p.kind || "").trim().replace(/ة/g, "ه");
                                    return k === "مستثمر" && p.partner_name !== "فجر الوادي";
                                  }).map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }));
                                  return (
                                <SearchableCombobox
                                  value={otherPartnerName}
                                  onChange={handleOtherPartnerNameChange}
                                  onOpenChange={setIsSelectOpen}
                                  placeholder="اختر الشريك الآخر"
                                  options={opts}
                                  suffix={otherPartnerName ? `${pct}%` : "0%"}
                                  />
                                  );
                                })()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <PriceInput
                                  value={otherPartner?.amount || ""}
                                  onChange={handleOtherPartnerAmountChange}
                                  currency={(otherPartner?.currency || form.currency) as "IQD" | "USD"}
                                  onCurrencyChange={handleOtherPartnerCurrencyChange}
                                  disabled={!otherPartnerName}
                                  className="h-[44px]"
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {Number(form.purchase) > 0 && (() => {
                          const totalContrib = (form.carPartners || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
                          const pct = (totalContrib / Number(form.purchase)) * 100;
                          return (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-xs)", marginBottom: "4px", opacity: 0.65 }}>
                                <span>إجمالي المساهمات</span>
                                <span>{Math.round(pct)}%</span>
                              </div>
                              <div style={{ height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 100 ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#8b5cf6,#a78bfa)", borderRadius: "10px", transition: "width 0.3s" }} />
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {form.purchaseType === "تمويل" && (
                      <SearchableCombobox
                        value={form.financerName}
                        onChange={(name) => onChange({ financerName: name })}
                        onOpenChange={setIsSelectOpen}
                        placeholder="اختر الممول"
                        options={allPartners.filter(p => (p.kind || "").trim().replace(/ة/g, "ه") === "ممول").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                       />
                    )}

                    {form.purchaseType === "شركة" && (
                      <SearchableCombobox
                        value={form.financerName}
                        onChange={(name) => onChange({ financerName: name })}
                        onOpenChange={setIsSelectOpen}
                        placeholder="اختر الشركة"
                        options={allPartners.filter((p) => (p.kind || "").trim().replace(/ة/g, "ه") === "شركه").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                      />
                    )}
                  </div>
                )}
                </div>
              </div>

              {/* Column 3: Expenses */}
              <div className="car-form-card car-form-card--expenses" id="expenses-container">
                <h4 className="car-form-group-title">
                  مصاريف السيارة الخاصة
                </h4>
                <div className="flex items-center" style={{ gap: "var(--car-gap-x)" }}>
                  <TextInput
                    inputSize="sm"
                    placeholder="وصف المصروف..."
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddExpense();
                      }
                    }}
                    containerClassName="flex-1"
                  />
                  <div className="w-40 shrink-0">
                    <PriceInput
                      value={expenseAmt}
                      onChange={setExpenseAmt}
                      currency={expenseCurrency}
                      onCurrencyChange={(cur) => setExpenseCurrency(cur as any)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddExpense();
                        }
                      }}
                      onBlur={() => {
                        if (expenseDesc.trim() && Number(expenseAmt) > 0) {
                          setTimeout(() => void handleAddExpense(), 150);
                        }
                      }}
                    />
                  </div>
                </div>
                {carExpenses.length > 0 ? (
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-right" style={{ fontSize: "var(--car-fs-body)" }}>
                      <thead>
                        <tr className="border-b border-[var(--car-border)] text-[var(--car-text-muted)]">
                          <th className="pb-2 font-medium w-8"></th>
                          <th className="pb-2 font-medium text-center">التاريخ</th>
                          <th className="pb-2 font-medium text-center">نوع المصروف</th>
                          <th className="pb-2 font-medium text-center">السعر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {carExpenses.map((exp) => (
                          <tr
                            key={exp.id}
                            className="group border-b border-[var(--car-border-light)] transition-colors hover:bg-[var(--car-bg-inactive-hover)]"
                          >
                            <td className="py-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="opacity-0 group-hover:opacity-100 text-[var(--car-btn-delete)] transition-opacity text-xs"
                                title="حذف المصروف"
                              >
                                ✕
                              </button>
                            </td>
                            <td className="py-1.5 text-center text-[var(--car-text-muted)]" style={{ fontSize: "var(--car-fs-body)" }}>
                              {exp.date}
                            </td>
                            <td className="py-1.5 text-center text-[var(--car-text-primary)] font-medium">
                              {exp.description}
                            </td>
                            <td className="py-1.5 text-center font-bold text-[var(--car-accent-light)] whitespace-nowrap">
                              {exp.amount.toLocaleString()} {exp.currency === "USD" ? "USD" : "IQ"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[var(--car-fs-body)] text-[var(--car-text-muted)] text-center py-3">لا توجد مصاريف مضافة</p>
                )}
              </div>
            </div>
          )}

          {/* ─── Page 2: Sale Details ─── */}
          {formPage === 1 && (
            <div className="car-form-card car-form-card--sale" id="sale-container" style={{ maxWidth: "820px", margin: "0 auto", width: "100%" }}>
              <h4 className="car-form-group-title">
                تفاصيل البيع والعميل
              </h4>
              <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-2">نوع الدفع</label>
              <div className="flex mb-4" style={{ gap: "var(--car-gap-x)" }}>
                {([
                  { label: "كاش", value: "كاش" as const, color: "emerald" },
                  { label: "موعد تسليم", value: "موعد" as const, color: "violet" },
                  { label: "اقساط", value: "اقساط" as const, color: "blue" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ paymentType: opt.value })}
                    className={`flex-1 h-10 rounded-lg text-[var(--car-fs-button)] font-bold transition-all ${form.paymentType === opt.value
                        ? opt.color === "emerald"
                          ? "bg-[var(--car-btn-cash)] text-white shadow-md"
                          : opt.color === "violet"
                            ? "bg-[var(--car-btn-delivery)] text-white shadow-md"
                            : "bg-[var(--car-btn-installment)] text-white shadow-md"
                        : "bg-[var(--car-bg-inactive)] text-[var(--car-text-label)] hover:bg-[var(--car-bg-inactive-hover)]"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
                <div className="grid grid-cols-3" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">سعر البيع</label>
                    <PriceInput
                      id="car-selling"
                      value={form.selling}
                      onChange={(selling) => onChange({ selling })}
                      currency={form.saleCurrency as Currency}
                      onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                      required={isSold}
                      tabIndex={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onChange({ amountPaid: form.selling });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">تاريخ البيع</label>
                    <UnifiedDateField
                      value={form.saleDate}
                      onChange={(saleDate) => onChange({ saleDate })}
                      tabIndex={3}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اسم المشتري</label>
                    <TextInput
                      id="buyer-name"
                      inputSize="sm"
                      value={form.buyerName}
                      onChange={(e) => onChange({ buyerName: e.target.value })}
                      placeholder="الاسم"
                      required={isSold}
                      tabIndex={4}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">رقم الهاتف</label>
                    <TextInput
                      id="buyer-phone"
                      inputSize="sm"
                      value={form.phone}
                      autoComplete="new-password"
                      dir="ltr"
                      placeholder="07XX XXX XXXX"
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ phone: toEn((e.target as HTMLInputElement).value).replace(/[^\d+\s()-]/g, "") })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ phone: toEn(e.target.value).replace(/[^\d+\s()-]/g, "") })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ phone: toEn(e.target.value).replace(/[^\d+\s()-]/g, "") })}
                      tabIndex={5}
                    />
                  </div>

                  {/* Non-cash fields */}
                  {form.paymentType !== "كاش" && (
                    <>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">المقدمة المستلمة</label>
                        <PriceInput
                          id="amount-paid"
                          value={form.amountPaid}
                          onChange={(amountPaid) => onChange({ amountPaid })}
                          currency={form.saleCurrency as Currency}
                          onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                          required={isSold}
                          tabIndex={2}
                        />
                      </div>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">المتبقي</label>
                        <PriceInput
                          id="amount-remaining"
                          value={form.amountRemaining}
                          onChange={(amountRemaining) => onChange({ amountRemaining })}
                          currency={form.saleCurrency as Currency}
                          onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                          required={isSold}
                          disabled
                          tabIndex={6}
                        />
                      </div>
                    </>
                  )}

                  {/* Delivery date */}
                  {form.paymentType === "موعد" && (
                    <div className="col-span-3">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">موعد التسليم</label>
                      <UnifiedDateField
                        id="first-payment-date"
                        value={form.deliveryDate}
                        onChange={(v) => onChange({ deliveryDate: v })}
                        tabIndex={9}
                      />
                    </div>
                  )}

                  {/* Installment fields */}
                  {form.paymentType === "اقساط" && (
                    <>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">تاريخ القسط الأول</label>
                        <UnifiedDateField
                          id="first-payment-date"
                          value={form.firstPaymentDate}
                          onChange={(v) => onChange({ firstPaymentDate: v })}
                          tabIndex={9}
                        />
                      </div>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">الأشهر</label>
                        <NumberInput
                          id="installment-months"
                          value={form.installmentMonths}
                          min={1}
                          step={1}
                          onChange={(v) => onChange({ installmentMonths: String(Math.max(1, Number(v) || 1)) })}
                          required
                          tabIndex={8}
                          hideArrows
                        />
                      </div>
                      <div className="col-span-3 flex flex-col items-center gap-1 px-3 py-3 bg-[var(--car-bg-page)] rounded-lg mt-1">
                        <span className="text-[var(--car-fs-label)] text-[var(--car-text-label)]">القسط الشهري</span>
                        <span className="text-[var(--car-fs-button)] font-bold text-[var(--car-accent-light)] text-lg">
                          {monthly.toLocaleString("en-US")} {form.saleCurrency === "USD" ? "USD" : "IQ"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
          )}
        </div>
      </div>
    </form>
  );

  if (embedMode) {
    return formContent;
  }

  return (
    <div className="modal-overlay modal-overlay--soft" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog--car modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        <div className="car-dialog-panel" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div className="car-dialog-panel__body" style={{ padding: 0, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            {formContent}
          </div>
        </div>
      </div>
    </div>
  );
}
