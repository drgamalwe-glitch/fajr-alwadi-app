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
  primary: "act-btn--primary",
  secondary: "act-btn--secondary",
  ghost: "act-btn--ghost",
  danger: "act-btn--danger",
  success: "act-btn--success",
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
          "act-btn",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-page",
          variantStyles[variant],
          iconOnly && "!p-2.5",
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
