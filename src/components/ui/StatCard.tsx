import React from "react";
import { cn } from "../../lib/utils";

type StatCardVariant = "safe" | "master" | "profit" | "inventory" | "default";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  variant?: StatCardVariant;
  isLoss?: boolean;
}

// ألوان الأيقونة لكل variant — تتطابق مع متغيرات dashboard.css
const variantAccent: Record<StatCardVariant, string> = {
  safe:      "var(--dc-safe-accent)",
  master:    "var(--dc-master-accent)",
  profit:    "var(--dc-profit-accent)",
  inventory: "var(--dc-inventory-accent)",
  default:   "var(--smiles, #d4af37)",
};

export function StatCard({
  icon: Icon,
  label,
  children,
  className,
  style,
  variant = "default",
  isLoss = false,
}: StatCardProps) {
  const accent = isLoss ? "var(--dc-loss-accent)" : variantAccent[variant];

  return (
    <article
      className={cn(
        "stat-card",
        variant !== "default" && `stat-card--${variant}`,
        isLoss && "stat-card--loss",
        className,
      )}
      style={style}
    >
      {/* نقطة النبض */}
      <div className="stat-card__pulse" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />

      {/* رأس البطاقة: اسم + أيقونة */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <span style={{
          fontSize: "var(--fs-sm)",
          color: "var(--gray)",
          fontWeight: "700",
          letterSpacing: "0.03em",
        }}>
          {label}
        </span>

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "38px",
          height: "38px",
          borderRadius: "11px",
          background: `var(--dc-card-icon-bg, rgba(255,255,255,0.07))`,
          border: `1px solid ${accent}38`,
          color: accent,
          boxShadow: `0 0 16px ${accent}22`,
          flexShrink: 0,
          transition: "box-shadow 0.3s",
        }}>
          <Icon size={17} strokeWidth={2.3} />
        </div>
      </div>

      {/* المحتوى (الأرقام) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        {children}
      </div>

      {/* خط الزخرفة السفلي */}
      <div className="stat-card__bar" />
    </article>
  );
}
