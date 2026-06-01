"use client";

import {
  type InputHTMLAttributes,
  forwardRef,
  useCallback,
  useRef,
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
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
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
      if (!/^-?\d*\.?\d*$/.test(pasted)) {
        e.preventDefault();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9.-]/g, "");
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
            "flex items-center gap-2 rounded-xl border px-4 py-2 number-input-wrapper",
            "bg-black/50 backdrop-blur-xl",
            "transition-all duration-300",
            "border-slate-800/60",
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
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              props.onBlur?.(e);
            }}
            className={cn(
              "w-20 bg-transparent text-left text-xl font-bold tabular-nums text-white outline-none",
              "placeholder:text-slate-600",
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
