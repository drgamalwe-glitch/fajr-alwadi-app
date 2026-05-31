/**
 * الشعار يُستورد مباشرة من logo.png في جذر المشروع.
 * عند استبدال الملف أثناء التطوير يتحدّث تلقائياً.
 */
import logoSrc from "../../logo.png";

type LogoSize = "sm" | "md" | "lg";

interface BrandLogoProps {
  size?: LogoSize;
  className?: string;
}

const sizeClass: Record<LogoSize, string> = {
  sm: "brand-logo-img--sm",
  md: "brand-logo-img--md",
  lg: "brand-logo-img--lg",
};

export function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  return (
    <img
      src={logoSrc}
      alt="شعار شركة فجر الوادي لتجارة السيارات"
      className={`brand-logo-img ${sizeClass[size]} ${className}`.trim()}
      draggable={false}
    />
  );
}
