"use client";

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "../../lib/utils";

type ActionButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

interface ActionButtonCustomProps {
  leadingIcon?: React.ElementType;
  trailingIcon?: React.ElementType;
  variant?: ActionButtonVariant;
  iconOnly?: boolean;
}

type ActionButtonProps = Omit<HTMLMotionProps<"button">, "ref"> &
  ActionButtonCustomProps &
  Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "form"> & {
    children?: ReactNode;
  };

const variantStyles: Record<ActionButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-green-500/18 to-green-500/4 text-green-300 hover:text-white border border-green-500/40 hover:border-green-500/65 shadow-md shadow-green-500/10 hover:shadow-green-500/20",
  secondary:
    "bg-gradient-to-br from-amber-500/18 to-amber-500/4 text-[#fef9c3] hover:text-white border border-[#d8a85a]/40 hover:border-[#d8a85a]/65 shadow-md shadow-amber-500/10 hover:shadow-amber-500/20",
  ghost:
    "bg-black/40 text-text-secondary backdrop-blur-xl border border-slate-800/60 hover:bg-green-500/10 hover:text-white hover:border-green-500/30",
  danger:
    "bg-gradient-to-br from-red-500/18 to-red-500/4 text-red-300 hover:text-white border border-red-500/40 hover:border-red-500/65 shadow-md shadow-red-500/10 hover:shadow-red-500/20",
  success:
    "bg-gradient-to-br from-green-400/20 to-green-600/5 text-green-300 hover:text-white border border-green-400/45 hover:border-green-400/70 shadow-md shadow-green-400/10 hover:shadow-green-400/20",
};

const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      className,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      variant = "primary",
      iconOnly = false,
      children,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    return (
      <motion.button
        ref={ref}
        disabled={disabled}
        whileHover={disabled ? undefined : { scale: 1.03, filter: "brightness(1.08)" }}
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 24,
          mass: 0.5,
        }}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-pill",
          "px-6 py-2.5 text-sm font-bold leading-none tracking-wide",
          "transition-colors duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-page",
          "disabled:opacity-48 disabled:pointer-events-none",
          "select-none",
          variantStyles[variant],
          iconOnly && "p-2.5",
          className,
        )}
        {...props}
      >
        {LeadingIcon && (
          <LeadingIcon
            className={cn("shrink-0", iconOnly ? "h-5 w-5" : "h-4 w-4")}
            aria-hidden="true"
          />
        )}
        {!iconOnly && children && <span>{children}</span>}
        {TrailingIcon && !iconOnly && (
          <TrailingIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </motion.button>
    );
  },
);

ActionButton.displayName = "ActionButton";

export { ActionButton };
export type { ActionButtonProps, ActionButtonVariant };
