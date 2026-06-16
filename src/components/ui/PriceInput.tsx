"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { toEnglishDigits } from "../../utils/numberInput";

type Currency = "USD" | "IQD";

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  currency?: Currency;
  onCurrencyChange?: (currency: Currency) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
  min?: number;
  required?: boolean;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

const currencyConfig = {
  USD: {
    symbol: "USD",
    decimalScale: 2 as const,
    color: "#10b981",
  },
  IQD: {
    symbol: "IQ",
    decimalScale: 0 as const,
    color: "#f59e0b",
  },
};

export function PriceInput({
  value,
  onChange,
  currency: externalCurrency,
  onCurrencyChange,
  id,
  label,
  placeholder = "0",
  disabled = false,
  className,
  containerClassName,
  min = 0,
  required = false,
  tabIndex,
  onKeyDown: externalOnKeyDown,
  onBlur: externalOnBlur,
}: PriceInputProps) {
  const [internalCurrency, setInternalCurrency] = useState<Currency>("IQD");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // مرجع للاحتفاظ بآخر قيمة رقمية مدخلة لمنع مشاكل الـ Async ومشاكل الأسهم
  const latestFloatValue = useRef<number | undefined>(parseFloat(value) || 0);

  // تحويل الأرقام العربية إلى إنجليزية قبل معالجة NumericFormat
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const handler = (e: InputEvent) => {
      if (!e.data) return;
      if (/[\u0660-\u0669\u06f0-\u06f9]/.test(e.data)) {
        e.preventDefault();

        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const normalized = toEnglishDigits(e.data);

        const newValue = el.value.slice(0, start) + normalized + el.value.slice(end);

        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        nativeSetter?.call(el, newValue);

        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };

    el.addEventListener("beforeinput", handler);
    return () => el.removeEventListener("beforeinput", handler);
  }, []);

  const currency = externalCurrency ?? internalCurrency;
  const config = currencyConfig[currency];

  const setCurrency = useCallback(
    (c: Currency) => {
      if (externalCurrency === undefined) {
        setInternalCurrency(c);
      }
      onCurrencyChange?.(c);
    },
    [externalCurrency, onCurrencyChange],
  );

  const toggleCurrency = (e: React.MouseEvent) => {
    e.preventDefault();
    const next = currency === "USD" ? "IQD" : "USD";
    setCurrency(next);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
  };

  const handleValueChange = (vals: { value: string; floatValue: number | undefined }) => {
    latestFloatValue.current = vals.floatValue;
    onChange(vals.value);
  };

  // معالجة حركة الأسهم الآمنة تماماً بدون تعليق المتصفح
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentVal = latestFloatValue.current || 0;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentVal === 0) {
        onChange("1000");
      } else {
        onChange(String(currentVal * 1000));
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentVal > 0) {
        const nextVal = Math.floor(currentVal / 1000);
        onChange(nextVal <= 0 ? "" : String(nextVal));
      }
    }
    externalOnKeyDown?.(e);
  };

  const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
    (e.target as HTMLInputElement).select();
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.select(), 0);
  };

  return (
    <div className={cn("relative flex flex-col gap-1.5", containerClassName)}>
      {label && (
        <label
          htmlFor={id}
          className="app-input-label text-xs font-bold tracking-wide text-right block w-full"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {/* Glow الخلفية المحيطة — تدار بالكامل بالـ CSS لضمان انطفائها فور خروج التركيز */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
          <div
            className="input-glow absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(216, 168, 90, 0.08), transparent 70%)",
            }}
          />
        </div>

        <div
          className={cn(
            "app-input-wrapper relative flex items-stretch w-full rounded-xl border overflow-hidden",
            "bg-white/[0.03] backdrop-blur-xl",
            "transition-all duration-300",
            "border-white/10",
            disabled && "opacity-48 pointer-events-none",
            className,
          )}
        >
          {/* زر العملة الأنحف والأرفع w-12 */}
          <button
            type="button"
            onClick={toggleCurrency}
            disabled={disabled}
            className="relative flex items-center justify-center w-14 h-auto min-h-[40px] cursor-pointer select-none border-l border-white/10 shrink-0 bg-transparent outline-none transition-colors"
            title={currency === "USD" ? "دولار أمريكي" : "دينار عراقي"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={currency}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="font-bold text-base pointer-events-none select-none inline-block"
                style={{ color: config.color }}
              >
                {config.symbol}
              </motion.span>
            </AnimatePresence>
          </button>

          {/* حقل إدخال الأرقام المصحح بالكامل */}
          <NumericFormat
            id={id}
            getInputRef={inputRef}
            value={value === "" ? "" : value}
            onValueChange={handleValueChange}
            thousandSeparator=","
            decimalScale={config.decimalScale}
            allowNegative={false}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onBlur={() => {
              const currentVal = latestFloatValue.current;
              if (currentVal !== undefined && currentVal < min) {
                onChange(String(min));
              } else if ((value === "" || currentVal === undefined) && required) {
                onChange(String(min));
              }
              externalOnBlur?.();
            }}
            tabIndex={tabIndex}
            onKeyDown={handleKeyDown}
            onClick={handleInputClick}
            onFocus={handleInputFocus}
            className="app-input-field w-full min-w-0 bg-transparent text-xl font-bold placeholder:text-white/35 outline-none py-0 px-4 text-center flex-1"
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
}

export type { Currency, PriceInputProps };