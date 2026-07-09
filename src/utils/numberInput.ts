/** تحويل الأرقام العربية/الهندية/الفارسية إلى أرقام إنجليزية */
export function cleanAndNormalizeNumbers(value: string): string {
  if (!value) return "";
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** alias */
export const normalizeNumbers = cleanAndNormalizeNumbers;

export function toEnglishDigits(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff]/g, "");
}

export function normalizePhoneNumber(value: string): string {
  return toEnglishDigits(value)
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[^\d+\s()-]/g, "")
    .trim();
}

/** تحويل نص بفواصل آلاف إلى رقم */
export function parseFormattedNumber(value: string): number {
  const english = toEnglishDigits(value)
    .replace(/[٬،\s]/g, ",")
    .replace(/٫/g, ".");
  const cleaned = english.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** عرض رقم بفاصل آلاف (1,234,567) */
export function formatThousands(value: number): string {
  if (value === 0) return "0";
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/** تحويل الأرقام العربية (٠-٩) إلى إنجليزية (0-9) */
export function parseArabicNumbers(input: string | number): string {
  if (input === undefined || input === null) return "";
  return String(input)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** معالجة حقل رقمي — يبقي الأرقام والنقطة فقط */
export function handleNumericInput(value: string): string {
  const converted = parseArabicNumbers(value);
  return converted.replace(/[^0-9.]/g, "");
}
