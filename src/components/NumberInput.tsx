import { useEffect, useRef, useState } from "react";
import { formatThousands, toEnglishDigits } from "../utils/numberInput";

interface NumberInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  disabled?: boolean;
  wheelMultiply?: number;
  step?: number;
  required?: boolean;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function sanitize(s: string): string {
  let r = toEnglishDigits(s);
  r = r.replace(/[^0-9.]/g, "");
  const parts = r.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : r;
}

function fmt(v: string): string {
  if (v === "") return "";
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return "";
  return formatThousands(n);
}

export function NumberInput({
  id,
  value,
  onChange,
  className = "input",
  placeholder,
  min = 0,
  disabled = false,
  wheelMultiply,
  step = 10,
  required = false,
  tabIndex,
  onKeyDown,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [display, setDisplay] = useState(() => fmt(value));

  useEffect(() => {
    if (document.activeElement === inputRef.current) {
      setDisplay(value);
    } else {
      setDisplay(fmt(value));
    }
  }, [value]);

  const handleInput = () => {
    if (composing.current) return;
    const el = inputRef.current;
    if (!el) return;
    const cleaned = sanitize(el.value);
    setDisplay(cleaned);
    const parsed = parseFloat(cleaned);
    const clamped = !isNaN(parsed) ? (parsed < min ? min : parsed) : 0;
    onChange(clamped === 0 && cleaned === "" ? "" : String(clamped));
  };

  const handleBlur = () => {
    const el = inputRef.current;
    if (!el) return;
    const cleaned = sanitize(el.value);
    const parsed = parseFloat(cleaned);
    const clamped = !isNaN(parsed) ? (parsed < min ? min : parsed) : 0;
    const next = clamped === 0 && cleaned === "" ? "" : String(clamped);
    if (next !== value) onChange(next);
    setDisplay(clamped === 0 ? "" : formatThousands(clamped));
  };

  const handleFocus = () => {
    const el = inputRef.current;
    if (!el) return;
    setDisplay(sanitize(el.value));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const current = parseFloat(value) || 0;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = wheelMultiply
        ? current * wheelMultiply
        : current + (e.shiftKey ? step * 10 : step);
      onChange(String(next < min ? min : next));
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = wheelMultiply
        ? Math.floor(current / wheelMultiply)
        : current - (e.shiftKey ? step * 10 : step);
      onChange(String(next < min ? min : next));
    }
    onKeyDown?.(e);
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      className={className}
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      tabIndex={tabIndex}
      dir="ltr"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      style={{ textAlign: "left" }}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => {
        composing.current = false;
        handleInput();
      }}
      onWheel={(e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const s = e.shiftKey ? step * 10 : step;
        const current = parseFloat(value) || 0;
        const next = current + delta * s;
        onChange(String(next < min ? min : next));
      }}
    />
  );
}
