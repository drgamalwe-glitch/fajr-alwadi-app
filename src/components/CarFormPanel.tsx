import { useEffect, useRef, useState } from "react";
import type { CarFormState, Partner, CarExpenseRecord } from "../types";
import { callTauri } from "../api/tauri";
import { SearchableCombobox } from "./SearchableCombobox";

import { toChassisText } from "../utils/keyboardLayout";
import { toEnglishDigits } from "../utils/numberInput";
import { todayIsoDate } from "../utils/dateSegments";
import { UnifiedDateField } from "./UnifiedDateField";
import { YearScrollField } from "./YearScrollField";
import {
  TextInput,
  NumberInput,
  PriceInput,
  type Currency,
} from "@/components/ui";

function toEn(v: string) { return toEnglishDigits(v); }

interface CarFormPanelProps {
  form: CarFormState;
  isEditing: boolean;
  onChange: (patch: Partial<CarFormState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose?: () => void;
  embedMode?: boolean;
  onSwitchToSpecs?: () => void;
  onExpenseDirtyChange?: (dirty: boolean) => void;
}

export function CarFormPanel({
  form, isEditing,
  onChange, onSubmit, onClose,
  embedMode = false,
  onSwitchToSpecs,
  onExpenseDirtyChange,
}: CarFormPanelProps) {
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [carExpenses, setCarExpenses] = useState<CarExpenseRecord[]>([]);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [, setIsSelectOpen] = useState(false);
  // ── نظام الصفحتين: 0 = مواصفات السيارة، 1 = تفاصيل البيع ──
  const [formPage, setFormPage] = useState(0);
  const [deletedExpenseIds, setDeletedExpenseIds] = useState<number[]>([]);

  useEffect(() => {
    callTauri<Partner[]>("get_partners")
      .then((res) => setAllPartners(res || []))
      .catch(console.error);
  }, []);

  const loadCarExpenses = () => {
    if (!form.num) return;
    const carNumber = form.num.trim();
    callTauri<CarExpenseRecord[]>("get_car_expense_records", { carNumber })
      .then((res) => {
        setCarExpenses(res || []);
      })
      .catch(console.error);
  };

  useEffect(() => {
    setDeletedExpenseIds([]);
    loadCarExpenses();
  }, [form.num]);

  useEffect(() => {
    onExpenseDirtyChange?.(
      Boolean(
        expenseDesc.trim() ||
        expenseAmt.trim() ||
        carExpenses.some((exp) => exp.id < 0) ||
        deletedExpenseIds.length > 0
      )
    );
  }, [expenseDesc, expenseAmt, carExpenses, deletedExpenseIds, onExpenseDirtyChange]);

  const prevPage = useRef(formPage);
  useEffect(() => {
    if (prevPage.current === 0 && formPage === 1) {
      if (expenseDesc.trim() && Number(expenseAmt) > 0) {
        handleAddExpense();
      }
    }
    prevPage.current = formPage;
  }, [formPage]);

  const handleAddExpense = () => {
    if (!expenseDesc.trim() || !Number(expenseAmt)) return;
    const carNumber = form.num.trim();
    const newExpense: CarExpenseRecord = {
      id: -Date.now(), // Unique temporary negative ID
      date: todayIsoDate(),
      description: expenseDesc.trim(),
      amount: Number(expenseAmt) || 0,
      currency: expenseCurrency,
      car_number: carNumber,
    };
    setCarExpenses((prev) => [...prev, newExpense]);
    setExpenseDesc("");
    setExpenseAmt("");
  };

  const handleDeleteExpense = (id: number) => {
    if (id > 0) {
      setDeletedExpenseIds((prev) => [...prev, id]);
    }
    setCarExpenses((prev) => prev.filter((exp) => exp.id !== id));
  };

  const saveExpenseChanges = async () => {
    const carNumber = form.num.trim();

    for (const id of deletedExpenseIds) {
      await callTauri("delete_car_expense_record", { id });
    }

    for (const exp of carExpenses) {
      if (exp.id < 0) {
        await callTauri("add_expense", {
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          notes: `مصروف مخصص للسيارة ${form.name || form.model || "سيارة"} رقم ${carNumber}`,
          currency: exp.currency,
          carNumber,
        });
      }
    }

    const pendingAmount = Number(expenseAmt) || 0;
    if (expenseDesc.trim() && pendingAmount > 0) {
      await callTauri("add_expense", {
        description: expenseDesc.trim(),
        amount: pendingAmount,
        date: todayIsoDate(),
        notes: `مصروف مخصص للسيارة ${form.name || form.model || "سيارة"} رقم ${carNumber}`,
        currency: expenseCurrency,
        carNumber,
      });
    }

    setDeletedExpenseIds([]);
    setCarExpenses((prev) => prev.filter((exp) => exp.id > 0));
    setExpenseDesc("");
    setExpenseAmt("");
    onExpenseDirtyChange?.(false);
  };

  const isSold = form.status === "مبيوعة";
  const installmentMonths = Number(form.installmentMonths) || 1;
  const amountRemaining = Number(form.amountRemaining) || 0;

  const monthly = form.paymentType === "اقساط" && installmentMonths > 0
    ? amountRemaining / installmentMonths : 0;
  const formRef = useRef<HTMLFormElement>(null);

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

  const validateSpecs = (): boolean => {
    const formEl = formRef.current;
    if (!formEl) return false;
    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));
    formEl.classList.remove("form--submitted");

    const checks: { id: string; valid: () => boolean }[] = [
      { id: "car-model", valid: () => !!form.model.trim() },
      { id: "car-year", valid: () => !!form.year.trim() },
      { id: "car-color", valid: () => !!form.color.trim() },
      { id: "car-num", valid: () => !!form.num.trim() },
      { id: "car-chassis", valid: () => !!form.chassis.trim() },
      { id: "car-purchase", valid: () => form.purchase !== "" && Number(form.purchase) > 0 },
    ];

    if (form.purchaseType === "تمويل" || form.purchaseType === "شركة") {
      checks.push({
        id: "financer-select",
        valid: () => !!form.financerName.trim(),
      });
    }

    for (const { id, valid } of checks) {
      try {
        if (!valid()) {
          const el = formEl.querySelector<HTMLElement>(`#${id}`);
          el?.classList.add("input--error");
          if (id === "financer-select") {
            const input = el?.querySelector<HTMLInputElement>('.combobox-trigger');
            input?.focus();
          } else {
            el?.focus();
          }
          formEl.classList.add("form--submitted");
          return false;
        }
      } catch (err) {
        console.error(`Validation error for #${id}:`, err);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formEl = formRef.current;
    if (!formEl) return;

    formEl.querySelectorAll(".input--error").forEach(el => el.classList.remove("input--error"));
    formEl.classList.remove("form--submitted");

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
        { id: "buyer-phone", valid: () => !!form.phone.trim() },
        { id: "amount-paid", valid: () => form.amountPaid !== "" && Number(form.amountPaid) >= 0 },
      );
      if (form.paymentType !== "كاش") {
        checks.push(
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

    // Task 5: التحقق من اختيار الشركة أو الممول
    if (form.purchaseType === "تمويل" || form.purchaseType === "شركة") {
      checks.push({
        id: "financer-select",
        valid: () => !!form.financerName.trim(),
      });
    }

    const saleFields = ["car-selling", "buyer-name", "amount-paid", "amount-remaining", "installment-months", "first-payment-date", "buyer-phone"];
    let firstErrorId: string | null = null;
    let firstSaleErrorId: string | null = null;

    for (const { id, valid } of checks) {
      try {
        if (!valid()) {
          const el = formEl.querySelector<HTMLElement>(`#${id}`);
          el?.classList.add("input--error");
          formEl.classList.add("form--submitted");
          if (!firstErrorId) {
            firstErrorId = id;
            if (id === "financer-select") {
              const input = el?.querySelector<HTMLInputElement>('.combobox-trigger');
              input?.focus();
            } else {
              el?.focus();
            }
          }
          if (!firstSaleErrorId && saleFields.includes(id)) {
            firstSaleErrorId = id;
          }
        }
      } catch (err) {
        console.error(`Validation error for #${id}:`, err);
        return;
      }
    }

    if (isSold) {
      const selling = Number(form.selling) || 0;
      const paid = Number(form.amountPaid) || 0;
      const remaining = Number(form.amountRemaining) || 0;
      if (Math.abs(selling - (paid + remaining)) > 0.01) {
        alert("تنبيه: مجموع (المبلغ المدفوع + المبلغ المتبقي) يجب أن يساوي سعر البيع!");
        const elPaid = formEl.querySelector<HTMLElement>("#amount-paid");
        const elRemaining = formEl.querySelector<HTMLElement>("#amount-remaining");
        elPaid?.classList.add("input--error");
        elRemaining?.classList.add("input--error");
        elPaid?.focus();
        formEl.classList.add("form--submitted");
        if (formPage === 0) {
          setFormPage(1);
        }
        return;
      }
    }

    if (formEl.classList.contains("form--submitted")) {
      if (formPage === 0 && firstSaleErrorId) {
        setFormPage(1);
        setTimeout(() => {
          const el = formEl.querySelector<HTMLElement>(`#${firstSaleErrorId}`);
          el?.focus();
        }, 100);
      }
      return;
    }

    // حفظ التغييرات في المصاريف بقاعدة البيانات SQLite فقط عند تأكيد الحفظ
    try {
      await saveExpenseChanges();
    } catch (dbErr) {
      console.error("Failed to save expenses to database:", dbErr);
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
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3 relative">
        {/* ── شارة حالة السيارة (سويتش toggle أنيق) ── */}
        <div className="absolute right-4 top-10 -translate-y-1/2 z-20">
          <button
            type="button"
            data-testid="status-toggle"
            className={`status-toggle ${isSold ? "status-toggle--sold" : "status-toggle--available"}`}
            onClick={() => {
              if (isSold) {
                onChange({
                  status: "متوفرة",
                  selling: "0",
                  amountPaid: "0",
                  amountRemaining: "0",
                  installmentMonths: "1",
                  buyerName: "",
                  phone: "",
                  saleDate: "",
                  deliveryDate: "",
                  firstPaymentDate: "",
                  paymentType: "كاش",
                });
                setFormPage(0);
                onSwitchToSpecs?.();
              } else {
                if (!validateSpecs()) return;
                onChange({
                  status: "مبيوعة",
                  ...(!form.saleDate ? { saleDate: todayIsoDate() } : {}),
                });
                setFormPage(1);
              }
            }}
            title={isSold ? "إلغاء البيع وإرجاع السيارة للمعروض" : "تحويل إلى مباع"}
          >
            <span className="status-toggle__icon">
              <span className="status-toggle__track">
                <span className="status-toggle__thumb" />
              </span>
            </span>
            <span className="status-toggle__label">
              <span className="status-toggle__text">{isSold ? "مباع" : "متوفر"}</span>
              {!isSold && <span className="status-toggle__pulse" />}
            </span>
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex justify-center gap-4 border-b border-[var(--car-border)] pb-3 flex-shrink-0">
          {[
            { page: 0, label: "مواصفات السيارة" },
            { page: 1, label: "تفاصيل البيع" },
          ].map(({ page, label }) => (
            <button
              key={page}
              type="button"
              onClick={() => { setFormPage(page); }}
              className={`car-form-tab text-[var(--car-fs-button)] ${formPage === page ? "is-active" : ""}`}
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
                        onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ model: (e.target as HTMLInputElement).value.toUpperCase() })}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ model: e.target.value.toUpperCase() })}
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ model: e.target.value.toUpperCase() })}
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
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ color: (e.target as HTMLInputElement).value })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ color: e.target.value })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ color: e.target.value })}
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
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onChange({ num: toEn((e.target as HTMLInputElement).value).replace(/[^\w\s\u0600-\u06FF-]/g, "") })}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/[^\w\s\u0600-\u06FF-]/g, "") })}
                      onBlur={(e: React.FocusEvent<HTMLInputElement>) => onChange({ num: toEn(e.target.value).replace(/[^\w\s\u0600-\u06FF-]/g, "") })}
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
                              background: "var(--textinputbg)",
                              border: "1px solid var(--textinputborder)",
                              borderRadius: "8px",
                              color: "var(--textinputtext)",
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
                        {(["كاش", "تمويل", "شركة"] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className={`payment-type-btn payment-type-btn--${opt === "كاش" ? "green" : opt === "تمويل" ? "blue" : "orange"} ${form.purchaseType === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => {
                              if (opt !== form.purchaseType) {
                                onChange({ purchaseType: opt, financerName: "" });
                              }
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {(form.purchaseType === "تمويل" || form.purchaseType === "شركة") && (
                    <div id="financer-select" className="bg-[var(--car-bg-card)] rounded-xl p-3">
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
                        handleAddExpense();
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
                          handleAddExpense();
                        }
                      }}
                      onBlur={() => {
                        if (expenseDesc.trim() && Number(expenseAmt) > 0) {
                          setTimeout(() => handleAddExpense(), 150);
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
                  { label: "موعد تسليم", value: "موعد" as const, color: "gold" },
                  { label: "اقساط", value: "اقساط" as const, color: "red" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`payment-type-${opt.value}`}
                    onClick={() => onChange({ paymentType: opt.value })}
                    className={`flex-1 h-10 rounded-lg text-[var(--car-fs-button)] font-bold transition-all ${form.paymentType === opt.value
                      ? opt.color === "emerald"
                        ? "bg-[var(--car-btn-cash)] text-white shadow-md"
                        : opt.color === "gold"
                          ? "text-white shadow-md"
                          : "text-white shadow-md"
                      : "bg-[var(--car-bg-inactive)] text-[var(--car-text-label)] hover:bg-[var(--car-bg-inactive-hover)]"
                      }`}
                    style={form.paymentType === opt.value && opt.color === "gold" ? { background: "#d8a85a" } : form.paymentType === opt.value && opt.color === "red" ? { background: "var(--red)" } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3" style={{ columnGap: "var(--car-gap-x)", rowGap: "var(--car-gap-y)" }}>
                <div>
                  <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">اسم المشتري</label>
                  <TextInput
                    id="buyer-name"
                    inputSize="sm"
                    value={form.buyerName}
                    onChange={(e) => onChange({ buyerName: e.target.value })}
                    placeholder="الاسم"
                    required={isSold}
                    tabIndex={1}
                  />
                </div>
                <div>
                  <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">سعر البيع</label>
                  <PriceInput
                    id="car-selling"
                    value={form.selling}
                    onChange={(selling) => onChange({ selling })}
                    currency={form.saleCurrency as Currency}
                    onCurrencyChange={(saleCurrency) => onChange({ saleCurrency })}
                    required={isSold}
                    tabIndex={2}
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
                    tabIndex={4}
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
                        tabIndex={5}
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
                    <div>
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center">القسط الشهري</label>
                      <TextInput
                        inputSize="sm"
                        value={`${monthly.toLocaleString("en-US")} ${form.saleCurrency === "USD" ? "USD" : "IQ"}`}
                        disabled
                        dir="ltr"
                        style={{ color: "var(--car-accent-light)", fontWeight: "bold" }}
                      />
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
