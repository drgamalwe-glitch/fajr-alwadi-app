import { useEffect, useRef } from "react";
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
  maxYear = 2026,
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
    <input
      ref={inputRef}
      id={id}
      className="input year-scroll-field"
      type="text"
      inputMode="decimal"
      dir="ltr"
      disabled={disabled}
      required={required}
      defaultValue={display}
      placeholder="سنة"
      aria-label="سنة الصنع"
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
  );
}
