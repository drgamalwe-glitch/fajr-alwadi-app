"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { BUTTON_MOTION } from "../../theme/ui/buttons";

type GoldFxVariant = "gold" | "green" | "red" | "gray";

interface GoldFxButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: GoldFxVariant;
  isBack?: boolean;
  isSidebarAction?: boolean;
  children?: ReactNode;
}

const GoldFxButton = forwardRef<HTMLButtonElement, GoldFxButtonProps>(
  (
    {
      className,
      variant,
      isBack,
      isSidebarAction,
      disabled,
      children,
      whileHover,
      whileTap,
      transition,
      ...props
    },
    ref,
  ) => (
    <motion.button
      ref={ref}
      disabled={disabled}
      className={cn(
        "gold-fx-btn",
        variant && `gold-fx-btn--${variant}`,
        isBack && "gold-fx-back-btn",
        isSidebarAction && "gold-fx-btn--sidebar-action",
        className,
      )}
      whileHover={disabled ? undefined : (whileHover ?? BUTTON_MOTION.hoverScale)}
      whileTap={disabled ? undefined : (whileTap ?? BUTTON_MOTION.tapScale)}
      transition={transition ?? BUTTON_MOTION.spring}
      {...props}
    >
      {children}
    </motion.button>
  ),
);

GoldFxButton.displayName = "GoldFxButton";
export { GoldFxButton };
export type { GoldFxButtonProps, GoldFxVariant };
