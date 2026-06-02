"use client";

import { type InputHTMLAttributes, forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

interface TextInputCustomProps {
  leadingIcon?: React.ElementType;
  trailingIcon?: React.ElementType;
  prefix?: string;
  suffix?: string;
  label?: string;
  containerClassName?: string;
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & TextInputCustomProps;

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      className,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      prefix,
      suffix,
      label,
      id,
      placeholder,
      containerClassName,
      value,
      ...props
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== "" && value !== null;
    const showFloating = isFocused || hasValue;

    return (
      <div className={cn("relative flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-bold tracking-wide text-text-muted"
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
              "relative flex items-center gap-2 rounded-xl border px-4 py-2 w-full",
              "bg-white/[0.03] backdrop-blur-xl",
              "transition-all duration-300",
              "border-white/10",
              props.disabled && "opacity-48 pointer-events-none",
            )}
          >
            {LeadingIcon && (
              <LeadingIcon
                className="h-5 w-5 shrink-0 text-text-muted"
                aria-hidden="true"
              />
            )}

            {prefix && (
              <span className="shrink-0 text-base font-medium text-text-muted">
                {prefix}
              </span>
            )}

            <input
              ref={ref}
              id={id}
              value={value}
              placeholder={showFloating || !label ? placeholder : undefined}
              onFocus={(e) => {
                setIsFocused(true);
                props.onFocus?.(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                props.onBlur?.(e);
              }}
              className={cn(
                "w-full bg-transparent text-xl font-bold text-white outline-none",
                "placeholder:text-white/35",
                "file:mr-2 file:rounded-pill file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-bold file:text-text-secondary file:transition-colors hover:file:bg-white/20",
                className,
              )}
              {...props}
            />

            {suffix && (
              <span className="shrink-0 text-base font-medium text-text-muted">
                {suffix}
              </span>
            )}

            {TrailingIcon && (
              <TrailingIcon
                className="h-5 w-5 shrink-0 text-text-muted"
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

TextInput.displayName = "TextInput";

export { TextInput };
export type { TextInputProps };
