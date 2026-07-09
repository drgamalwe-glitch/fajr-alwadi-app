import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { toEnglishDigits } from "../utils/numberInput";
import {
  bumpYearLastTwo,
  normalizeYearValue,
  selectYearLastTwoDigits,
} from "../utils/dateSegments";

interface YearScrollFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  minYear?: number;
  maxYear?: number;
  disabled?: boolean;
  required?: boolean;
}

function sanitize(s: string): string {
  return toEnglishDigits(s).replace(/\D/g, "").slice(0, 4);
}

export function YearScrollField({
  id,
  value,
  onChange,
  minYear = 2000,
  maxYear = new Date().getFullYear() + 1,
  disabled,
  required,
}: YearScrollFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const fallback = new Date().getFullYear();

  useEffect(() => {
    if (disabled || composing.current) return;
    const el = inputRef.current;
    if (!el) return;
    const clean = sanitize(el.value);
    const current = clean || String(fallback);
    if (current === normalizeYearValue(value, fallback)) return;
    if (document.activeElement !== el) {
      el.value = normalizeYearValue(value, fallback);
    }
  }, [value, disabled]);

  const handleInput = () => {
    if (composing.current) return;
    const el = inputRef.current;
    if (!el) return;
    const cleaned = sanitize(el.value);
    const origLen = el.value.length;
    el.value = cleaned;
    const diff = origLen - cleaned.length;
    if (diff > 0) {
      const start = (el.selectionStart ?? 0) - diff;
      el.setSelectionRange(Math.max(0, start), Math.max(0, start));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = sanitize(e.currentTarget.value);
    const normalized = normalizeYearValue(raw, fallback);
    const n = parseInt(normalized, 10);
    if (n < minYear) onChange(String(minYear));
    else if (n > maxYear) onChange(String(maxYear));
    else onChange(normalized);
  };

  const display = normalizeYearValue(value, fallback);

  return (
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
          "app-input-wrapper-sm relative flex items-center w-full rounded-xl border px-3 py-1.5",
          "bg-white/[0.03] backdrop-blur-xl",
          "transition-all duration-300",
          "border-white/10",
          disabled && "opacity-48 pointer-events-none",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          className="app-input-field-sm w-full min-w-0 bg-transparent text-sm font-semibold placeholder:text-white/35 outline-none text-center flex-1"
          type="text"
          inputMode="decimal"
          dir="ltr"
          disabled={disabled}
          required={required}
          defaultValue={display}
          placeholder="سنة"
          aria-label="الموديل"
          autoComplete="off"
          onInput={handleInput}
          onFocus={(e) => selectYearLastTwoDigits(e.target)}
          onClick={(e) => selectYearLastTwoDigits(e.currentTarget)}
          onMouseUp={(e) => e.preventDefault()}
          onBlur={handleBlur}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => {
            composing.current = false;
            handleInput();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const el = inputRef.current;
              if (!el) return;
              const delta = e.key === "ArrowUp" ? 1 : -1;
              const next = String(bumpYearLastTwo(
                parseInt(normalizeYearValue(value, fallback), 10) || fallback,
                delta, minYear, maxYear,
              ));
              el.value = next;
              onChange(next);
            }
          }}
          onWheel={(e) => {
            e.preventDefault();
            const el = inputRef.current;
            if (!el) return;
            const delta = e.deltaY > 0 ? -1 : 1;
            const next = String(bumpYearLastTwo(
              parseInt(normalizeYearValue(value, fallback), 10) || fallback,
              delta, minYear, maxYear,
            ));
            el.value = next;
            onChange(next);
          }}
        />
      </div>
    </div>
  );
}
