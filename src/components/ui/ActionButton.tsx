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
    "bg-gradient-to-br from-[#61030b] to-[#3d0207] text-white shadow-lg shadow-[#61030b]/20 hover:shadow-[#61030b]/40 border border-[#8b0713]/30",
  secondary:
    "bg-gradient-to-br from-[#d8a85a] to-[#c4953f] text-[#100306] shadow-lg shadow-[#d8a85a]/20 hover:shadow-[#d8a85a]/40 border border-[#d8a85a]/30",
  ghost:
    "bg-black/50 text-text-secondary backdrop-blur-xl border border-slate-800/60 hover:bg-[#10b981]/10 hover:text-white hover:border-[#10b981]/30",
  danger:
    "bg-gradient-to-br from-[#ff6b6b] to-[#cc3333] text-white shadow-lg shadow-[#ff6b6b]/20 hover:shadow-[#ff6b6b]/40 border border-[#ff6b6b]/30",
  success:
    "bg-gradient-to-br from-[#55f5aa] to-[#22b573] text-[#0d0f14] shadow-lg shadow-[#55f5aa]/20 hover:shadow-[#55f5aa]/40 border border-[#55f5aa]/30",
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
