"use client";

import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
} from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { motion } from "motion/react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

const SelectMenu = SelectPrimitive.Root;
SelectMenu.displayName = "SelectMenu";

const SelectMenuGroup = SelectPrimitive.Group;
SelectMenuGroup.displayName = "SelectMenuGroup";

const SelectMenuValue = SelectPrimitive.Value;
SelectMenuValue.displayName = "SelectMenuValue";

const SelectMenuTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "group flex items-center gap-2 rounded-xl border px-4 py-2 text-xl font-bold",
        "bg-white/[0.03] backdrop-blur-xl w-full",
        "transition-all duration-300",
        "border-white/10",
        "data-[state=open]:border-[#d8a85a]/50 data-[state=open]:shadow-[0_0_0_3px_rgba(216,168,90,0.12),0_20px_50px_-15px_rgba(216,168,90,0.15)]",
        "focus:border-[#d8a85a]/50 focus:shadow-[0_0_0_3px_rgba(216,168,90,0.12),0_20px_50px_-15px_rgba(216,168,90,0.15)]",
        "focus-visible:outline-none",
        "disabled:opacity-48 disabled:pointer-events-none",
        "data-[placeholder]:text-white/35",
        "text-white",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          className={cn(
            "mr-auto h-4 w-4 shrink-0 text-text-muted",
            "transition-transform duration-250 ease-out",
            "group-data-[state=open]:rotate-180",
          )}
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectMenuTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectMenuContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-sm",
          "bg-[#0d0f14] border border-white/10 backdrop-blur-xl",
          "shadow-glow",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1 text-text-muted">
          <ChevronDown className="h-3 w-3 rotate-180" />
        </SelectPrimitive.ScrollUpButton>

        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <SelectPrimitive.Viewport
            className={cn(
              "p-1",
              position === "popper" &&
                "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
        </motion.div>

        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1 text-text-muted">
          <ChevronDown className="h-3 w-3" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectMenuContent.displayName = SelectPrimitive.Content.displayName;

const SelectMenuItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm",
        "text-text-secondary transition-colors duration-150",
        "data-[highlighted]:bg-gold/10 data-[highlighted]:text-text-primary",
        "data-[disabled]:opacity-48 data-[disabled]:pointer-events-none",
        "outline-none",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5 text-gold" />
        </SelectPrimitive.ItemIndicator>
      </span>

      <SelectPrimitive.ItemText asChild>
        <span>{children}</span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectMenuItem.displayName = SelectPrimitive.Item.displayName;

const SelectMenuSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-white/5", className)}
      {...props}
    />
  );
});
SelectMenuSeparator.displayName = SelectPrimitive.Separator.displayName;

const SelectMenuLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-xs font-bold text-text-muted", className)}
      {...props}
    />
  );
});
SelectMenuLabel.displayName = SelectPrimitive.Label.displayName;

export {
  SelectMenu,
  SelectMenuGroup,
  SelectMenuValue,
  SelectMenuTrigger,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuLabel,
};
