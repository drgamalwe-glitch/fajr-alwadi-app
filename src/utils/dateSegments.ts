import { toEnglishDigits } from "./numberInput";

export const todayIsoDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const normalizeIsoDate = (value: string) => {
  const english = toEnglishDigits(value)
    .replace(/[\/.،,ـ_\s]+/g, "-")
    .replace(/[^\d-]/g, "");
  const compact = english.replace(/\D/g, "");
  if (!english.includes("-") && compact.length >= 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  const parts = english.split("-").filter(Boolean);
  if (parts.length >= 3) {
    const [year, month, day] = parts;
    return `${year.slice(0, 4).padStart(4, "0")}-${month.slice(0, 2).padStart(2, "0")}-${day.slice(0, 2).padStart(2, "0")}`;
  }
  return english;
};

export const getYear = (value: string) => (value.split("-")[0] || "");
export const getMonth = (value: string) => (value.split("-")[1] || "");
export const getDay = (value: string) => (value.split("-")[2] || "");

export const daysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

export const combineIsoDate = (year: string, month: string, day: string) =>
  `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

export const normalizeYearValue = (value: string, fallback = new Date().getFullYear()) => {
  const digits = toEnglishDigits(value).replace(/\D/g, "").slice(0, 4);
  const parsed = parseInt(digits, 10);
  return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
};

/** تغيير آخر رقمين فقط (مثلاً 2024 → 2025) */
export const bumpYearLastTwo = (
  year: number,
  delta: number,
  minYear = 2000,
  maxYear = new Date().getFullYear() + 1,
) => {
  const prefix = Math.floor(year / 100);
  let suffix = year % 100;
  suffix = (suffix + delta + 100) % 100;
  let next = prefix * 100 + suffix;
  if (next < minYear) next = minYear;
  if (next > maxYear) next = maxYear;
  return next;
};

export const selectYearLastTwoDigits = (input: HTMLInputElement) => {
  const len = input.value.length;
  input.setSelectionRange(Math.max(0, len - 2), len);
};

export const formatDisplayDate = (isoDate: string): string => {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
};
