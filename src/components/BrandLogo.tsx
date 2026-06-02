/**
 * الشعار SVG بحدود خضراء مفرّغ الداخل — outline style
 */

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
      src="/logo-outline.svg"
      alt="شعار شركة فجر الوادي لتجارة السيارات"
      className={`brand-logo-img brand-logo-outline ${sizeClass[size]} ${className}`.trim()}
      draggable={false}
    />
  );
}
