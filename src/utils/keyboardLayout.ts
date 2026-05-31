import { toEnglishDigits } from "./numberInput";

const EN_TO_AR: Record<string, string> = {
  q: "ض",
  w: "ص",
  e: "ث",
  r: "ق",
  t: "ف",
  y: "غ",
  u: "ع",
  i: "ه",
  o: "خ",
  p: "ح",
  "[": "ج",
  "]": "د",
  a: "ش",
  s: "س",
  d: "ي",
  f: "ب",
  g: "ل",
  h: "ا",
  j: "ت",
  k: "ن",
  l: "م",
  ";": "ك",
  "'": "ط",
  z: "ئ",
  x: "ء",
  c: "ؤ",
  v: "ر",
  b: "لا",
  n: "ى",
  m: "ة",
  ",": "و",
  ".": "ز",
  "/": "ظ",
  "`": "ذ",
};

const AR_TO_EN = Object.fromEntries(
  Object.entries(EN_TO_AR).map(([en, ar]) => [ar, en]),
) as Record<string, string>;

export function englishKeyboardToArabic(value: string): string {
  return value.replace(/[A-Za-z[\];',./`]/g, (char) => {
    const lower = char.toLowerCase();
    return EN_TO_AR[lower] ?? char;
  });
}

export function arabicKeyboardToEnglish(value: string): string {
  return toEnglishDigits(value)
    .replace(/لا/g, "b")
    .replace(/[ضصثقفغعهخحجدشسيبلاتنمكطئءؤرىةوزظذ]/g, (char) => (
      AR_TO_EN[char] ?? char
    ));
}

export function toChassisText(value: string): string {
  return arabicKeyboardToEnglish(value).toUpperCase();
}
