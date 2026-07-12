import { useEffect, useRef, useState, useMemo } from "react";
import type { CarFormState, Partner, CarExpenseRecord } from "../types";
import { callTauri } from "../api/tauri";
import { SearchableCombobox } from "./SearchableCombobox";
import { QuickAddPartnerModal } from "./QuickAddPartnerModal";

import { toChassisText } from "../utils/keyboardLayout";
import { normalizePhoneNumber, toEnglishDigits } from "../utils/numberInput";
import { compareMoney, moneyAdd, moneyDiv, moneySub, moneySum } from "../utils/money";
import { todayIsoDate } from "../utils/dateSegments";
import { normalizeVehicleIdentifier } from "../utils/vehicle";
import { UnifiedDateField } from "./UnifiedDateField";
import { YearScrollField } from "./YearScrollField";
import {
  TextInput,
  NumberInput,
  PriceDisplay,
  PriceInput,
  type Currency,
} from "@/components/ui";

function toEn(v: string) { return toEnglishDigits(v); }

interface CarFormPanelProps {
  form: CarFormState;
  isEditing: boolean;
  onChange: (patch: Partial<CarFormState>) => void;
  onSubmit: (e: React.FormEvent) => Promise<boolean>;
  onSaveComplete?: () => void;
  onClose?: () => void;
  embedMode?: boolean;
  onSwitchToSpecs?: () => void;
  onExpenseDirtyChange?: (dirty: boolean) => void;
  onFormValidityChange?: (isValid: boolean) => void;
  onNavigateToPartner?: (name: string, kind?: string) => void;
  initialPage?: 0 | 1;
  saleFieldsLocked?: boolean;
  receivedInstallmentsTotal?: number;
  sessionToken?: string | null;
}

export function CarFormPanel({
  form, isEditing,
  onChange, onSubmit, onSaveComplete, onClose,
  embedMode = false,
  onSwitchToSpecs,
  onExpenseDirtyChange,
  onFormValidityChange,
  onNavigateToPartner,
  initialPage = 0,
  saleFieldsLocked = false,
  receivedInstallmentsTotal = 0,
  sessionToken,
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
  // نافذة الإضافة السريعة للممول / الشركة / الزبون
  const [quickAddKind, setQuickAddKind] = useState<"ممول" | "شركة" | "زبون" | null>(null);
  const [existingCars, setExistingCars] = useState<any[]>([]);

  useEffect(() => {
    setFormPage(initialPage);
  }, [initialPage, form.oldNum, form.num]);

  useEffect(() => {
    callTauri<any[]>("get_cars")
      .then((res) => setExistingCars(res || []))
      .catch(console.error);
  }, []);

  const isPlateDuplicate = form.num.trim() !== "" && (() => {
    const normalizedNum = form.num.trim().toLowerCase().replace(/\s/g, "");
    return existingCars.some((c) => {
      if (isEditing && form.oldNum && (c.car_number || "").trim().toLowerCase() === form.oldNum.trim().toLowerCase()) {
        return false;
      }
      return (c.car_plate_num || c.car_number || "").trim().toLowerCase().replace(/\s/g, "") === normalizedNum;
    });
  })();

  const isChassisDuplicate = form.chassis.trim() !== "" && (() => {
    const normalizedChassis = normalizeVehicleIdentifier(form.chassis);
    return existingCars.some((c) => {
      if (isEditing && form.oldNum && (c.car_number || "").trim().toLowerCase() === form.oldNum.trim().toLowerCase()) {
        return false;
      }
      return normalizeVehicleIdentifier(c.chassis_number) === normalizedChassis;
    });
  })();



  const reloadPartners = () =>
    callTauri<Partner[]>("get_partners")
      .then((res) => {
        setAllPartners(res || []);
        return res || [];
      })
      .catch((err) => {
        console.error(err);
        return [] as Partner[];
      });

  useEffect(() => {
    reloadPartners();
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
    if (!expenseDesc.trim() || compareMoney(expenseAmt, 0) <= 0) return;
    const carNumber = form.num.trim();
    const newExpense: CarExpenseRecord = {
      id: -Date.now(), // Unique temporary negative ID
      date: todayIsoDate(),
      description: expenseDesc.trim(),
      amount: expenseAmt,
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
    const additions = carExpenses
      .filter((exp) => exp.id < 0)
      .map((exp) => ({
        description: exp.description,
        amount: exp.amount,
        date: exp.date,
        currency: exp.currency || "IQD",
      }));

    if (expenseDesc.trim() && compareMoney(expenseAmt, 0) > 0) {
      additions.push({
        description: expenseDesc.trim(),
        amount: expenseAmt,
        date: todayIsoDate(),
        currency: expenseCurrency,
      });
    }

    if (deletedExpenseIds.length === 0 && additions.length === 0) return;

    await callTauri("apply_car_expense_changes", {
      carNumber: form.num.trim(),
      chassis: form.chassis,
      deleteIds: deletedExpenseIds,
      additions,
      sessionToken: sessionToken || null,
    });

    setDeletedExpenseIds([]);
    setCarExpenses((prev) => prev.filter((exp) => exp.id > 0));
    setExpenseDesc("");
    setExpenseAmt("");
    onExpenseDirtyChange?.(false);
  };

  const isSold = form.status === "مبيوعة";

  const isFormValid = useMemo(() => {
    // 1. Check basic specs (always required)
    if (!form.model.trim()) return false;
    if (!form.year.trim()) return false;
    if (!form.color.trim()) return false;
    if (!form.num.trim()) return false;
    if (!form.chassis.trim()) return false;
    if (form.purchase === "" || Number(form.purchase) <= 0) return false;

    // 2. Check purchase type financer/company select
    if (form.purchaseType === "تمويل" || form.purchaseType === "شركة") {
      if (!form.financerName.trim()) return false;
    }

    // 3. Check sale fields if the car is sold
    if (isSold) {
      if (form.selling === "" || Number(form.selling) <= 0) return false;
      if (!form.buyerName.trim()) return false;
      if (!form.phone.trim()) return false;
      if (form.amountPaid === "" || Number(form.amountPaid) < 0) return false;

      if (form.paymentType !== "كاش") {
        if (form.amountRemaining === "" || Number(form.amountRemaining) < 0) return false;
      }

      if (form.paymentType === "اقساط") {
        if (form.installmentMonths === "" || Number(form.installmentMonths) <= 0) return false;
        if (!(form.firstPaymentDate || form.deliveryDate)?.trim()) return false;
      }

      if (form.paymentType === "موعد") {
        if (!(form.deliveryDate || form.firstPaymentDate)?.trim()) return false;
      }
    }

    return true;
  }, [
    form.model,
    form.year,
    form.color,
    form.num,
    form.chassis,
    form.purchase,
    form.purchaseType,
    form.financerName,
    isSold,
    form.selling,
    form.buyerName,
    form.phone,
    form.amountPaid,
    form.paymentType,
    form.amountRemaining,
    form.installmentMonths,
    form.firstPaymentDate,
    form.deliveryDate,
  ]);

  useEffect(() => {
    onFormValidityChange?.(isFormValid);
  }, [isFormValid, onFormValidityChange]);
  const installmentMonths = Number(form.installmentMonths) || 1;
  const amountRemaining = Number(form.amountRemaining) || 0;

  const monthly = form.paymentType === "اقساط" && installmentMonths > 0
    ? moneyDiv(amountRemaining, installmentMonths).toNumber() : 0;
  const formRef = useRef<HTMLFormElement>(null);

  const prevAutoType = useRef(form.paymentType);

  // When car status changes to not sold, switch away from sale details tab
  useEffect(() => {
    if (!isSold && formPage === 1) {
      setFormPage(0);
    }
  }, [isSold, formPage]);

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

    if (isPlateDuplicate) {
      alert("تنبيه: رقم اللوحة موجود سابقاً، وسيتم حفظ السيارة بمعرّف مختلف.");
    }
    // FORENSIC FIX (re-audit 2026-07-11, FORENSIC-FRONT-2-2):
    // Per Instructions.md §31.3, duplicate chassis numbers MUST be allowed.
    // The same physical vehicle may be purchased, sold, and re-purchased multiple
    // times. Each cycle is an independent accounting event with its own car_number
    // and its own cost basis. Rejecting duplicates here violates §31.3.
    // We now show an informational notice instead of blocking the save.
    if (isChassisDuplicate) {
      alert("تنبيه: رقم الشاصي مستخدم لسيارة أخرى. سيتم حفظ السيارة بمعرّف مختلف (يسمح بتكرار الشاصي وفق §31.3).");
    }

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
      // F9: use Decimal-based comparison instead of JS float subtraction to avoid precision drift.
      const expected = moneyAdd(form.amountPaid, form.amountRemaining, receivedInstallmentsTotal);
      if (compareMoney(moneySub(form.selling, expected), 0) !== 0) {
        if (receivedInstallmentsTotal > 0) {
          alert("تنبيه: مجموع (المقدمة + المبلغ المتبقي + الأقساط الواصلة) يجب أن يساوي سعر البيع!");
        } else {
          alert("تنبيه: مجموع (المبلغ المدفوع + المبلغ المتبقي) يجب أن يساوي سعر البيع!");
        }
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

    const carSaved = await onSubmit(e);
    if (!carSaved) return;

    try {
      await saveExpenseChanges();
    } catch (dbErr) {
      console.error("Failed to save expenses to database:", dbErr);
      alert("تم حفظ السيارة، لكن تعذر حفظ تغييرات مصروفاتها: " + (dbErr instanceof Error ? dbErr.message : String(dbErr)));
      return;
    }

    onSaveComplete?.();
  };

  const patchEnglishText = (key: "num" | "chassis", value: string) => {
    const next = key === "chassis" ? toChassisText(value) : toEn(value);
    onChange({ [key]: next } as Pick<CarFormState, typeof key>);
  };

  const handlePhoneBeforeInput = (e: React.FormEvent<HTMLInputElement>) => {
    const data = (e.nativeEvent as InputEvent).data;
    if (!data) return;
    const normalized = normalizePhoneNumber(data);
    if (normalized === data) return;
    e.preventDefault();

    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = normalizePhoneNumber(
      `${input.value.slice(0, start)}${normalized}${input.value.slice(end)}`
    );
    onChange({ phone: next });
    requestAnimationFrame(() => {
      const pos = start + normalized.length;
      input.setSelectionRange(pos, pos);
    });
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
            ...(isSold ? [{ page: 1, label: "تفاصيل البيع" }] : []),
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
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                      {isPlateDuplicate ? (
                        <span style={{ color: "#ef4444", fontSize: "var(--font-size)", fontWeight: "bold" }}>
                          رقم اللوحة موجود
                        </span>
                      ) : (
                        <span>رقم اللوحة</span>
                      )}
                    </label>
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
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1 text-center" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                      {isChassisDuplicate ? (
                        <span style={{ color: "#ef4444", fontSize: "var(--font-size)", fontWeight: "bold" }}>
                          رقم الشاصي موجود
                        </span>
                      ) : (
                        <span>رقم الشاصي</span>
                      )}
                    </label>
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
                        const expensesTotal = moneySum(carExpenses, (e) => e.amount);
                        const total = moneyAdd(form.purchase, expensesTotal);
                        return (
                          <div
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 0.75rem",
                              background: "var(--textinputbg)",
                              border: "1px solid var(--textinputborder)",
                              borderRadius: "var(--all-radius)",
                              color: "var(--textinputtext)",
                              fontWeight: 700,
                              fontSize: "var(--fs-base)",
                              direction: "ltr",
                              opacity: 0.8,
                              justifyContent: "center",
                            }}
                          >
                            <PriceDisplay amount={total} currency={form.currency} noColor />
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
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SearchableCombobox
                              value={form.financerName}
                              onChange={(name) => onChange({ financerName: name })}
                              onOpenChange={setIsSelectOpen}
                              placeholder="اختر الممول"
                              options={allPartners.filter(p => (p.kind || "").trim().replace(/ة/g, "ه") === "ممول").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                            />
                          </div>
                          <button
                            type="button"
                            title="إضافة ممول جديد"
                            onClick={() => setQuickAddKind("ممول")}
                            style={{
                              flexShrink: 0,
                              width: "34px",
                              height: "34px",
                              borderRadius: "var(--all-radius)",
                              border: "1px solid rgba(59,130,246,0.4)",
                              background: "rgba(59,130,246,0.12)",
                              color: "#93c5fd",
                              fontSize: "18px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              lineHeight: 1,
                              transition: "background 0.18s",
                            }}
                          >
                            +
                          </button>
                        </div>
                      )}

                      {form.purchaseType === "شركة" && (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SearchableCombobox
                              value={form.financerName}
                              onChange={(name) => onChange({ financerName: name })}
                              onOpenChange={setIsSelectOpen}
                              placeholder="اختر الشركة"
                              options={allPartners.filter((p) => (p.kind || "").trim().replace(/ة/g, "ه") === "شركه").map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                            />
                          </div>
                          <button
                            type="button"
                            title="إضافة شركة جديدة"
                            onClick={() => setQuickAddKind("شركة")}
                            style={{
                              flexShrink: 0,
                              width: "34px",
                              height: "34px",
                              borderRadius: "var(--all-radius)",
                              border: "1px solid rgba(251,146,60,0.4)",
                              background: "rgba(251,146,60,0.12)",
                              color: "#fdba74",
                              fontSize: "18px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              lineHeight: 1,
                              transition: "background 0.18s",
                            }}
                          >
                            +
                          </button>
                        </div>
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
                      onCurrencyChange={setExpenseCurrency}
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
                              <PriceDisplay amount={exp.amount} currency={exp.currency} noColor />
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
                    onClick={() => {
                      if (saleFieldsLocked) return;
                      onChange({ paymentType: opt.value });
                    }}
                    disabled={saleFieldsLocked}
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
                  {form.paymentType === "اقساط" || form.paymentType === "موعد" ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <SearchableCombobox
                          value={form.buyerName}
                          onChange={(name) => {
                            if (saleFieldsLocked) return;
                            const partner = allPartners.find((p) => p.partner_name === name);
                            onChange({
                              buyerName: name,
                              ...(partner ? { phone: partner.phone } : {}),
                            });
                          }}
                          onOpenChange={setIsSelectOpen}
                          placeholder="اختر الزبون"
                          disabled={saleFieldsLocked}
                          options={allPartners
                            .filter((p) => (p.kind || "").trim().replace(/ة/g, "ه") === "زبون")
                            .map((p) => ({ label: p.partner_name, value: p.partner_name, kind: p.kind }))}
                        />
                      </div>
                      {form.buyerName.trim() && form.status === "مبيوعة" && onNavigateToPartner && (
                        <button
                          type="button"
                          title="الانتقال إلى حساب الزبون"
                          onClick={() => onNavigateToPartner(form.buyerName, "زبون")}
                          style={{
                            flexShrink: 0,
                            width: "34px",
                            height: "34px",
                            borderRadius: "var(--all-radius)",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            background: "rgba(16, 185, 129, 0.12)",
                            color: "rgb(110, 231, 183)",
                            fontSize: "18px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.18s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(16, 185, 129, 0.25)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(16, 185, 129, 0.12)";
                          }}
                        >
                          👤
                        </button>
                      )}
                      <button
                        type="button"
                        title="إضافة زبون جديد"
                        onClick={() => setQuickAddKind("زبون")}
                        style={{
                          flexShrink: 0,
                          width: "34px",
                          height: "34px",
                          borderRadius: "var(--all-radius)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          background: "rgba(59, 130, 246, 0.12)",
                          color: "rgb(147, 197, 253)",
                          fontSize: "18px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          lineHeight: 1,
                          transition: "background 0.18s",
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <TextInput
                      id="buyer-name"
                      inputSize="sm"
                      value={form.buyerName}
                      onChange={(e) => onChange({ buyerName: e.target.value })}
                      placeholder="الاسم"
                      required={isSold}
                      disabled={saleFieldsLocked}
                      tabIndex={1}
                    />
                  )}
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
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="07XX XXX XXXX"
                    onBeforeInput={handlePhoneBeforeInput}
                    onInput={(e: React.FormEvent<HTMLInputElement>) => {
                      onChange({ phone: normalizePhoneNumber((e.target as HTMLInputElement).value) });
                    }}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      onChange({ phone: normalizePhoneNumber(e.target.value) });
                    }}
                    onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                      onChange({ phone: normalizePhoneNumber(e.target.value) });
                    }}
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
                        disabled={saleFieldsLocked}
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
                        disabled={saleFieldsLocked}
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
                        disabled={saleFieldsLocked}
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
                      <div
                        style={{
                          height: "34px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--textinputbg)",
                          border: "1px solid var(--textinputborder)",
                          borderRadius: "var(--all-radius)",
                          color: "var(--car-accent-light)",
                          fontWeight: "bold",
                          direction: "ltr",
                        }}
                      >
                        <PriceDisplay amount={monthly} currency={form.saleCurrency} noColor />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {/* نافذة الإضافة السريعة للممول / الشركة / الزبون */}
          {quickAddKind && (
            <QuickAddPartnerModal
              kind={quickAddKind}
              onClose={() => setQuickAddKind(null)}
              onSaved={(name, savedPhone) => {
                const currentKind = quickAddKind;
                const phone = normalizePhoneNumber(savedPhone);
                if (currentKind === "زبون") {
                  onChange({ buyerName: name, phone });
                } else {
                  onChange({ financerName: name });
                }
                setQuickAddKind(null);
                reloadPartners().then((updatedPartners) => {
                  const partner = updatedPartners?.find((p) => p.partner_name === name);
                  if (currentKind === "زبون" && !phone && partner?.phone) {
                    onChange({ buyerName: name, phone: normalizePhoneNumber(partner.phone) });
                  }
                });
              }}
            />
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
