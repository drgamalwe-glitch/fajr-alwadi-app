import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import type { CarFormState, Partner, CarExpenseRecord } from "../types";
import { callTauri } from "../api/tauri";

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

interface PortalPopupProps {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
  width: number;
  align?: "left" | "right" | "center";
  style?: React.CSSProperties;
}

function PortalPopup({ triggerRef, children, width, align = "center", style }: PortalPopupProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    let left = rect.left;
    if (align === "center") {
      left = rect.left + rect.width / 2;
    } else if (align === "right") {
      left = rect.right;
    }

    setCoords({
      top: rect.bottom + 8,
      left: left,
    });
  }, [triggerRef, align]);

  useEffect(() => {
    updateCoords();

    window.addEventListener("resize", updateCoords);

    const scrollParent = triggerRef.current?.closest(".car-dashboard__scrollable");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", updateCoords);
    }

    return () => {
      window.removeEventListener("resize", updateCoords);
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", updateCoords);
      }
    };
  }, [updateCoords, triggerRef]);

  if (!coords) return null;

  return createPortal(
    <motion.div
      className="purchase-popup"
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 1000,
        background: "rgba(13, 15, 20, 0.45)",
        backdropFilter: "blur(25px) saturate(180%)",
        WebkitBackdropFilter: "blur(25px) saturate(180%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "14px",
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
        padding: "16px",
        width: `${width}px`,
        textAlign: "right",
        x: align === "center" ? "-50%" : align === "right" ? "-100%" : "0%",
        ...style
      } as any}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>,
    document.body
  );
}

interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string; subLabel?: string }[];
  placeholder?: string;
  onOpenChange?: (open: boolean) => void;
  clearOptionText?: string;
  onClear?: () => void;
  style?: React.CSSProperties;
  dropdownStyle?: React.CSSProperties;
  suffix?: string;
}

function SearchableCombobox({
  value,
  onChange,
  options,
  placeholder = "",
  onOpenChange,
  clearOptionText,
  onClear,
  style,
  dropdownStyle,
  suffix
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const handleOpen = () => {
    updateCoords();
    setIsOpen(true);
    onOpenChange?.(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    onOpenChange?.(false);
    setSearch(value || "");
  };

  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    window.addEventListener("resize", updateCoords);
    const scrollParent = triggerRef.current?.closest(".car-dashboard__scrollable");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", updateCoords);
    }

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) return;
      if (target.closest(".combobox-portal-content")) return;
      handleClose();
    };

    document.addEventListener("mousedown", handleOutside);

    return () => {
      window.removeEventListener("resize", updateCoords);
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", updateCoords);
      }
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [isOpen, updateCoords, value, onOpenChange]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          ref={triggerRef}
          type="text"
          dir="rtl"
          value={search}
          onFocus={handleOpen}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) handleOpen();
          }}
          placeholder={placeholder}
          className="input text-right"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            height: "44px",
            padding: suffix ? "0 0.75rem 0 2.2rem" : "0 0.75rem",
            color: "#fff",
            fontWeight: 700,
            fontSize: "var(--fs-base)",
            width: "100%",
            outline: "none",
            ...style
          }}
        />
        {suffix && (
          <span style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "var(--fs-xs)", color: "#a78bfa", fontWeight: 700, pointerEvents: "none" }}>
            {suffix}
          </span>
        )}
      </div>

      {isOpen && coords && createPortal(
        <motion.div
          className="combobox-portal-content"
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: "fixed",
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 1100,
            background: "rgba(13, 15, 20, 0.75)",
            backdropFilter: "blur(25px) saturate(180%)",
            WebkitBackdropFilter: "blur(25px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
            maxHeight: "220px",
            overflowY: "auto",
            padding: "4px",
            textAlign: "right",
            ...dropdownStyle
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {clearOptionText && onClear && (
            <div
              onClick={() => {
                onClear();
                handleClose();
              }}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "var(--fs-base)",
                color: "#f87171",
                borderBottom: "1px solid rgba(255,255,255,0.05)"
              }}
              className="hover:bg-red-500/10"
            >
              {clearOptionText}
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div style={{ padding: "8px 12px", color: "rgba(255,255,255,0.4)", fontSize: "var(--fs-base)" }}>
              لا توجد نتائج مطابقة
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <div
                onClick={() => {
                  onChange(opt.value);
                  handleClose();
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "var(--fs-base)",
                  fontWeight: 700,
                  color: value === opt.value ? "var(--gold-light)" : "#fff",
                  background: value === opt.value ? "rgba(216,168,90,0.12)" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
                className="hover:bg-white/5"
              >
                <span>{opt.label}</span>
                {opt.subLabel && <span style={{ fontSize: "var(--fs-sm)", opacity: 0.5, fontWeight: 700 }}>{opt.subLabel}</span>}
              </div>
            ))
          )}
        </motion.div>,
        document.body
      )}
    </div>
  );
}

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
  const [carExpenses, setCarExpenses] = useState<CarExpenseRecord[]>([]);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmt, setExpenseAmt] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState<"IQD" | "USD">("IQD");
  const [openPopup, setOpenPopup] = useState<"كاش" | "شراكه" | "تمويل" | null>(null);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  // ── نظام الصفحتين: 0 = مواصفات السيارة، 1 = تفاصيل البيع ──
  const [formPage, setFormPage] = useState(0);

  const cashBtnRef = useRef<HTMLButtonElement>(null);
  const partnerBtnRef = useRef<HTMLButtonElement>(null);
  const financeBtnRef = useRef<HTMLButtonElement>(null);

  const getBtnRef = (opt: "كاش" | "شراكه" | "تمويل") => {
    if (opt === "كاش") return cashBtnRef;
    if (opt === "شراكه") return partnerBtnRef;
    return financeBtnRef;
  };

  useEffect(() => {
    callTauri<Partner[]>("get_partners")
      .then((res) => setAllPartners(res || []))
      .catch(console.error);
  }, []);

  // Close purchase popups when clicking outside
  useEffect(() => {
    if (!openPopup) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (isSelectOpen) return;

      const target = e.target as HTMLElement;
      if (target.closest(".purchase-popup")) return;
      if (target.closest(".payment-type-btn")) return;
      if (
        target.closest("[data-radix-portal]") ||
        target.closest(".SelectMenuContent") ||
        target.closest(".z-\\[1100\\]") ||
        target.closest("[role='listbox']")
      ) {
        return;
      }
      setOpenPopup(null);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [openPopup, isSelectOpen]);

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

  const handleAddExpense = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim() || !Number(expenseAmt)) return;
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
      await callTauri("add_car_expense_record", {
        carNumber,
        description: expenseDesc.trim(),
        amount: Number(expenseAmt) || 0,
        date: todayIsoDate(),
        currency: expenseCurrency,
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
          onWheel={(e) => {
            const target = e.target as HTMLElement;
            const scrollable = target.closest("[data-inner-scroll]") as HTMLElement | null;
            if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
              const atTop = scrollable.scrollTop === 0;
              const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 2;
              if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
            }
            e.preventDefault();
            const now = Date.now();
            if ((e.currentTarget as any).__lastWheel && now - (e.currentTarget as any).__lastWheel < 600) return;
            (e.currentTarget as any).__lastWheel = now;
            if (e.deltaY > 0) {
              setFormPage(p => Math.min(1, p + 1));
            } else {
              setFormPage(p => Math.max(0, p - 1));
            }
          }}
        >
          {/* ─── Page 1: Car Specs + Purchase + Expenses ─── */}
          {formPage === 0 && (
            <div className="grid grid-cols-3 gap-4">
              {/* Column 1: Vehicle Specs */}
              <div className="bg-[var(--car-bg-card)] rounded-xl p-3 flex flex-col gap-3">
                <h4 className="text-[var(--car-fs-title)] font-bold text-[var(--car-accent)] border-b border-[var(--car-border-light)] pb-1.5">
                  📋 مواصفات المركبة
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">نوع السيارة</label>
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
                  <div className="max-w-24">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">سنة الصنع</label>
                    <YearScrollField
                      id="car-year"
                      value={form.year}
                      onChange={(year) => onChange({ year })}
                      required
                    />
                  </div>
                  <div className="max-w-32">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">اللون</label>
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
                  <div className="max-w-28">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">رقم اللوحة</label>
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
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">رقم الشاسي</label>
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
              <div className="bg-[var(--car-bg-card)] rounded-xl p-3 flex flex-col gap-3">
                <h4 className="text-[var(--car-fs-title)] font-bold text-[var(--car-accent)] border-b border-[var(--car-border-light)] pb-1.5">
                  💰 تفاصيل الشراء
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 max-w-40">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">سعر الشراء</label>
                    <PriceInput
                      id="car-purchase"
                      value={form.purchase}
                      onChange={(purchase) => onChange({ purchase })}
                      currency={form.currency as Currency}
                      onCurrencyChange={(currency) => onChange({ currency })}
                      required
                    />
                  </div>
                  <div className="max-w-44">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">تاريخ الشراء</label>
                    <UnifiedDateField
                      value={form.purchaseDate}
                      onChange={(purchaseDate) => onChange({ purchaseDate })}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">طريقة الشراء</label>
                    <div className="payment-type-selector" style={{ position: "relative", display: "flex", gap: "4px" }}>
                      {(["كاش", "شراكه", "تمويل"] as const).map((opt) => (
                        <div key={opt} style={{ position: "relative", flex: 1 }}>
                          <button
                            ref={getBtnRef(opt)}
                            type="button"
                            className={`payment-type-btn payment-type-btn--${opt === "كاش" ? "green" : opt === "شراكه" ? "purple" : "blue"} ${form.purchaseType === opt ? "payment-type-btn--active" : ""}`}
                            onClick={() => {
                              onChange({ purchaseType: opt });
                              setOpenPopup(openPopup === opt ? null : opt);
                            }}
                            style={{ width: "100%" }}
                          >
                            {opt === "كاش" ? (form.purchasePaymentType === "قاصه" ? "كاش (قاصة)" : "كاش (ماستر)") : opt === "شراكه" ? "شراكه" : `تمويل${form.financerName ? `: ${form.financerName}` : ""}`} {form.purchaseType === opt ? "▾" : ""}
                          </button>

                          {openPopup === opt && (
                            <PortalPopup
                              triggerRef={getBtnRef(opt)}
                              width={opt === "كاش" ? 220 : opt === "شراكه" ? 540 : 320}
                              align={opt === "كاش" ? "left" : opt === "شراكه" ? "center" : "right"}
                              style={
                                opt === "كاش"
                                  ? { background: "rgba(12, 28, 18, 0.65)", border: "1px solid rgba(34, 197, 94, 0.25)" }
                                  : opt === "شراكه"
                                    ? { background: "rgba(22, 14, 36, 0.65)", border: "1px solid rgba(168, 85, 247, 0.25)" }
                                    : { background: "rgba(10, 20, 35, 0.65)", border: "1px solid rgba(59, 130, 246, 0.25)" }
                              }
                            >
                              {opt === "كاش" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <label className="cf-label" style={{ marginBottom: "6px", fontSize: "var(--fs-xs)", textAlign: "center", color: "var(--gold-light)" }}>🏦 حساب السحب</label>
                                  <div className="payment-type-selector" style={{ flexDirection: "column", gap: "6px", border: "none", background: "none", padding: 0 }}>
                                    {(["قاصه", "ماستر"] as const).map((subOpt) => (
                                      <button
                                        key={subOpt}
                                        type="button"
                                        className={`payment-type-btn payment-type-btn--${subOpt === "قاصه" ? "qasa" : "master"} ${form.purchasePaymentType === subOpt ? "payment-type-btn--active" : ""}`}
                                        onClick={() => {
                                          onChange({ purchasePaymentType: subOpt });
                                          setOpenPopup(null);
                                        }}
                                        style={{ width: "100%", padding: "10px 16px", borderRadius: "8px", fontSize: "var(--fs-base)", fontWeight: 700 }}
                                      >
                                        {subOpt === "قاصه" ? "💵 قاصة" : "💳 ماستر كارد"}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {opt === "شراكه" && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.6rem",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                                    <h4 style={{ color: "#a78bfa", fontSize: "var(--fs-sm)", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                      👥 الشركاء المساهمين
                                    </h4>
                                    {Number(form.purchase) > 0 && (() => {
                                      const totalContrib = (form.carPartners || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
                                      const remaining = Number(form.purchase) - totalContrib;
                                      return (
                                        <span style={{ fontSize: "var(--fs-xs)", color: remaining === 0 ? "#22c55e" : "#f97316", fontWeight: 700 }}>
                                          {remaining === 0 ? "✓ مكتمل" : `متبقي: ${remaining.toLocaleString("ar-IQ")} IQ`}
                                        </span>
                                      );
                                    })()}
                                  </div>

                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "250px", overflowY: "auto", paddingLeft: "4px" }}>
                                    {(() => {
                                      const totalPurchase = Number(form.purchase) || 0;
                                      const amt = Number(fajrPartner?.amount) || 0;
                                      const pct = totalPurchase > 0 ? ((amt / totalPurchase) * 100).toFixed(1) : "0";
                                      return (
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.6rem",
                                            background: "rgba(139,92,246,0.08)",
                                            border: "1px solid rgba(139,92,246,0.2)",
                                            padding: "0.45rem 0.65rem",
                                            borderRadius: "10px",
                                          }}
                                        >
                                          <div style={{ width: "230px", flexShrink: 0, position: "relative" }}>
                                            <div
                                              dir="rtl"
                                              className="input flex items-center justify-between text-right"
                                              style={{
                                                background: "rgba(255,255,255,0.03)",
                                                border: "1px solid rgba(139,92,246,0.15)",
                                                borderRadius: "8px",
                                                height: "44px",
                                                padding: "0 0.75rem 0 2.2rem",
                                                color: "#fff",
                                                fontWeight: 700,
                                                fontSize: "var(--fs-base)",
                                                position: "relative"
                                              }}
                                            >
                                              <span>فجر الوادي</span>
                                              <span style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "var(--fs-sm)", color: "#a78bfa", fontWeight: 700 }}>
                                                {pct}%
                                              </span>
                                            </div>
                                          </div>

                                          <div style={{ width: "230px", flexShrink: 0 }}>
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
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.6rem",
                                            background: "rgba(139,92,246,0.08)",
                                            border: "1px solid rgba(139,92,246,0.2)",
                                            padding: "0.45rem 0.65rem",
                                            borderRadius: "10px",
                                          }}
                                        >
                                          <div style={{ width: "230px", flexShrink: 0 }}>
                                            <SearchableCombobox
                                              value={otherPartnerName}
                                              onChange={handleOtherPartnerNameChange}
                                              onOpenChange={setIsSelectOpen}
                                              placeholder="➕ اختر الشريك الآخر"
                                              clearOptionText="❌ إلغاء الشريك الآخر"
                                              onClear={() => handleOtherPartnerNameChange("no_other_partner")}
                                              options={allPartners
                                                .filter((p) => p.kind === "مستثمر" && p.partner_name !== "فجر الوادي")
                                                .map((p) => ({
                                                  label: p.partner_name,
                                                  value: p.partner_name,
                                                  subLabel: p.kind
                                                }))}
                                              style={{ height: "44px", fontSize: "var(--fs-base)", border: "1px solid rgba(139,92,246,0.15)" }}
                                              dropdownStyle={{ background: "rgba(22, 14, 36, 0.85)", border: "1px solid rgba(168, 85, 247, 0.25)" }}
                                              suffix={otherPartnerName ? `${pct}%` : "0%"}
                                            />
                                          </div>

                                          <div style={{ width: "230px", flexShrink: 0 }}>
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
                                        <div style={{ marginTop: "0.35rem" }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-xs)", marginBottom: "0.25rem", opacity: 0.65 }}>
                                            <span>إجمالي المساهمات</span>
                                            <span>{Math.round(pct)}%</span>
                                          </div>
                                          <div style={{ height: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "10px", overflow: "hidden" }}>
                                            <div
                                              style={{
                                                height: "100%",
                                                width: `${Math.min(100, pct)}%`,
                                                background: pct >= 100 ? "linear-gradient(90deg,#22c55e,#16a34a)" : "linear-gradient(90deg,#8b5cf6,#a78bfa)",
                                                borderRadius: "10px",
                                                transition: "width 0.3s",
                                              }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}

                              {opt === "تمويل" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <label className="cf-label" style={{ marginBottom: "6px", fontSize: "var(--fs-xs)", textAlign: "center", color: "#60a5fa" }}>🏦 اسم الممول</label>
                                  <SearchableCombobox
                                    value={form.financerName}
                                    onChange={(name) => {
                                      onChange({ financerName: name });
                                      setOpenPopup(null);
                                    }}
                                    onOpenChange={setIsSelectOpen}
                                    placeholder="➕ اختر الممول"
                                    clearOptionText="❌ إلغاء الممول"
                                    onClear={() => onChange({ financerName: "" })}
                                    options={allPartners
                                      .filter((p) => p.kind === "ممول")
                                      .map((p) => ({
                                        label: p.partner_name,
                                        value: p.partner_name,
                                      }))}
                                    style={{ height: "44px", fontSize: "var(--fs-base)" }}
                                    dropdownStyle={{ background: "rgba(10, 20, 35, 0.85)", border: "1px solid rgba(59, 130, 246, 0.25)" }}
                                  />
                                </div>
                              )}
                            </PortalPopup>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 3: Expenses */}
              <div className="bg-[var(--car-bg-card)] rounded-xl p-3 flex flex-col gap-3">
                <h4 className="text-[var(--car-fs-title)] font-bold text-[var(--car-accent)] border-b border-[var(--car-border-light)] pb-1.5">
                  💸 مصاريف السيارة الخاصة
                </h4>
                <div className="flex items-center gap-2">
                  <TextInput
                    inputSize="sm"
                    placeholder="وصف المصروف..."
                    value={expenseDesc}
                    onChange={(e) => setExpenseDesc(e.target.value)}
                    containerClassName="flex-1"
                  />
                  <div className="w-32 shrink-0">
                    <PriceInput
                      value={expenseAmt}
                      onChange={setExpenseAmt}
                      currency={expenseCurrency}
                      onCurrencyChange={(cur) => setExpenseCurrency(cur as any)}
                    />
                  </div>
                  <ActionButton
                    type="button"
                    onClick={handleAddExpense}
                    variant="danger"
                    className="!px-3 !py-1 text-[var(--car-fs-body)] shrink-0"
                  >
                    إضافة
                  </ActionButton>
                </div>
                {carExpenses.length > 0 ? (
                  <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                    {carExpenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="group flex items-center justify-between px-3 py-2 bg-[var(--car-bg-page)] rounded-lg hover:bg-[var(--car-bg-expense-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="opacity-0 group-hover:opacity-100 text-[var(--car-btn-delete)] text-[var(--car-fs-body)] shrink-0 transition-opacity"
                            title="حذف المصروف"
                          >
                            ✕
                          </button>
                          <span className="text-[var(--car-fs-body)] text-[var(--car-text-primary)] font-medium truncate">
                            {exp.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[var(--car-fs-body)] text-[var(--car-text-muted)]">{exp.date}</span>
                          <span className="text-[var(--car-fs-body)] font-bold text-[var(--car-accent-light)] w-20 text-right">
                            {exp.amount.toLocaleString()} {exp.currency === "USD" ? "USD" : "IQ"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--car-fs-body)] text-[var(--car-text-muted)] text-center py-3">لا توجد مصاريف مضافة</p>
                )}
              </div>
            </div>
          )}

          {/* ─── Page 2: Sale Details ─── */}
          {formPage === 1 && (
            <div className="grid grid-cols-3 gap-4">
              {/* Payment Type - Column 1 */}
              <div className="col-span-1 bg-[var(--car-bg-card)] rounded-xl p-3 flex flex-col gap-2">
                <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">نوع الدفع</label>
                {([
                  { label: "كاش", value: "كاش" as const, color: "emerald" },
                  { label: "موعد تسليم", value: "موعد" as const, color: "violet" },
                  { label: "اقساط", value: "اقساط" as const, color: "blue" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange({ paymentType: opt.value })}
                    className={`w-full h-10 rounded-lg text-[var(--car-fs-button)] font-bold transition-all ${form.paymentType === opt.value
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

              {/* Sale Fields - Columns 2-3 */}
              <div className="col-span-2 bg-[var(--car-bg-card)] rounded-xl p-3">
                <h4 className="text-[var(--car-fs-title)] font-bold text-[var(--car-accent)] border-b border-[var(--car-border-light)] pb-1.5 mb-3">
                  💰 تفاصيل البيع والعميل
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">سعر البيع</label>
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
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">تاريخ البيع</label>
                    <UnifiedDateField
                      value={form.saleDate}
                      onChange={(saleDate) => onChange({ saleDate })}
                      tabIndex={3}
                    />
                  </div>
                  <div>
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">اسم المشتري</label>
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
                    <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">رقم الهاتف</label>
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
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">المقدمة المستلمة</label>
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
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">المتبقي</label>
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
                    <div className="col-span-2">
                      <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">موعد التسليم</label>
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
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">تاريخ القسط الأول</label>
                        <UnifiedDateField
                          id="first-payment-date"
                          value={form.firstPaymentDate}
                          onChange={(v) => onChange({ firstPaymentDate: v })}
                          tabIndex={9}
                        />
                      </div>
                      <div>
                        <label className="text-[var(--car-fs-label)] text-[var(--car-text-label)] block mb-1">الأشهر</label>
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
                      <div className="col-span-2 flex items-center justify-between px-3 py-2 bg-[var(--car-bg-page)] rounded-lg mt-1">
                        <span className="text-[var(--car-fs-label)] text-[var(--car-text-label)]">القسط الشهري</span>
                        <span className="text-[var(--car-fs-button)] font-bold text-[var(--car-accent-light)]">
                          {monthly.toLocaleString("ar-IQ")} {form.saleCurrency === "USD" ? "USD" : "IQ"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom Action Bar ── */}
        <div className="flex justify-end gap-3 pt-3 border-t border-[var(--car-border)] flex-shrink-0">
          <ActionButton type="button" variant="ghost" onClick={onClose} disabled={saving} className="!px-8">
            إلغاء الأمر
          </ActionButton>
          <ActionButton type="submit" variant="success" disabled={saving} className="!px-10">
            {saving
              ? "جاري الحفظ..."
              : isEditing && isSold && form.status !== "مبيوعة"
                ? "بيع السيارة"
                : isEditing
                  ? "تعديل وحفظ البيانات"
                  : "تأكيد إضافة السيارة"}
          </ActionButton>
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
