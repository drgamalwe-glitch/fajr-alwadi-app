"use client";

import {
  type InputHTMLAttributes,
  forwardRef,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

interface NumberInputCustomProps {
  leadingIcon?: React.ElementType;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  hideArrows?: boolean;
}

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value"
> &
  NumberInputCustomProps & {
    value: string | number;
    onChange?: (value: string) => void;
    onValueChange?: (value: number) => void;
  };

function toNum(v: string | number): number {
  if (typeof v === "number") return v;
  const n = parseFloat(v.replace(/[٫٬،,]/g, "."));
  return isNaN(n) ? 0 : n;
}

function normalizeNumberText(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫٬،,]/g, ".");
}

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      leadingIcon: LeadingIcon,
      suffix,
      min = -Infinity,
      max = Infinity,
      step = 1,
      value,
      onChange,
      onValueChange,
      id,
      disabled = false,
      placeholder,
      required,
      hideArrows = false,
      ...props
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const numericValue = toNum(value);

    // Normalize Arabic digits before processing via beforeinput event listener
    useEffect(() => {
      const el = inputRef.current;
      if (!el) return;

      const handler = (e: InputEvent) => {
        if (!e.data) return;
        if (/[\u0660-\u0669\u06f0-\u06f9٫٬،,]/.test(e.data)) {
          e.preventDefault();

          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? 0;
          const normalized = normalizeNumberText(e.data);

          const newValue = el.value.slice(0, start) + normalized + el.value.slice(end);

          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          )?.set;
          nativeSetter?.call(el, newValue);

          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };

      el.addEventListener("beforeinput", handler as any);
      return () => el.removeEventListener("beforeinput", handler as any);
    }, []);

    const clamp = useCallback(
      (v: number) => Math.min(Math.max(v, min), max),
      [min, max],
    );

    const commitValue = useCallback(
      (v: number) => {
        const clamped = clamp(v);
        if (clamped !== numericValue) {
          onChange?.(String(clamped));
          onValueChange?.(clamped);
        }
      },
      [clamp, numericValue, onChange, onValueChange],
    );

    const increment = useCallback(() => {
      commitValue(numericValue + step);
    }, [commitValue, numericValue, step]);

    const decrement = useCallback(() => {
      commitValue(numericValue - step);
    }, [commitValue, numericValue, step]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") {
        e.preventDefault();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        increment();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        decrement();
      }
      props.onKeyDown?.(e);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      const normalized = normalizeNumberText(pasted);
      if (!/^-?\d*\.?\d*$/.test(normalized)) {
        e.preventDefault();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const normalizedValue = normalizeNumberText(e.target.value);
      
      const raw = normalizedValue.replace(/[^0-9.-]/g, "");
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = clamp(parsed);
        if (clamped !== numericValue) {
          onValueChange?.(clamped);
          onChange?.(String(clamped));
        }
      } else if (raw === "" || raw === "-") {
        onValueChange?.(0);
        onChange?.("0");
      }
    };

    const spinButtonClass =
      "flex items-center justify-center px-2 py-1 text-text-muted transition-colors duration-150 hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none";

    return (
      <div className="relative flex items-center">
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
            "app-input-wrapper flex items-center gap-2 rounded-xl border px-4 py-2 number-input-wrapper",
            "bg-white/[0.03] backdrop-blur-xl",
            "transition-all duration-300",
            "border-white/10",
            disabled && "opacity-48 pointer-events-none",
          )}
        >
          {LeadingIcon && (
            <LeadingIcon
              className="h-5 w-5 shrink-0 text-text-muted"
              aria-hidden="true"
            />
          )}

          <input
            ref={(node) => {
              inputRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            id={id}
            type="text"
            inputMode="decimal"
            value={value}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            dir="ltr"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={(e) => {
              setTimeout(() => e.target.select(), 0);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              props.onBlur?.(e);
            }}
            className={cn(
              "app-input-field w-full bg-transparent text-center text-xl font-bold tabular-nums outline-none",
              "placeholder:text-white/35",
              className,
            )}
            {...props}
          />

          {suffix && (
            <span className="shrink-0 text-sm font-semibold text-text-muted">
              {suffix}
            </span>
          )}

          {!hideArrows && (
            <div className="flex flex-col -mr-1">
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || numericValue >= max}
                onClick={increment}
                className={cn(spinButtonClass, "rounded-t-sm")}
                aria-label="Increase value"
              >
                <ChevronUp className="h-4 w-4" />
              </button>

              <div className="h-px bg-white/5" />

              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || numericValue <= min}
                onClick={decrement}
                className={cn(spinButtonClass, "rounded-b-sm")}
                aria-label="Decrease value"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";

export { NumberInput };
export type { NumberInputProps };
