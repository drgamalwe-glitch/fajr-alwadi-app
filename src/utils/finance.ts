import type { Car } from "../types";
import {
  compareMoney,
  formatMoney,
  moneyAdd,
  moneyDiv,
  moneyMul,
  moneySub,
  type MoneyValue,
} from "./money";

export function carNetProfit(car: Car): MoneyValue {
  if (car.status !== "مبيوعة") return "0";
  // Fixed: calculate car profit with Decimal so sale price, purchase price, and car expenses do not pass through JS floating point.
  const totalCost = moneyAdd(car.purchase_price, car.expenses_sum || 0);
  return moneySub(car.selling_price, totalCost);
}

export function compareCarNetProfit(left: Car, right: Car): number {
  return compareMoney(carNetProfit(left), carNetProfit(right));
}

export function carProfitPercentage(car: Car): string {
  // Fixed: Instructions.md defines profit ratio as full profit / selling price, not full profit / car cost.
  const totalCost = moneyAdd(car.purchase_price, car.expenses_sum || 0);
  const profit = moneySub(car.selling_price, totalCost);
  const sellingPrice = moneyAdd(car.selling_price);
  // Allow negative percentages (losses). Only guard against division by zero.
  if (!sellingPrice.isPositive()) return "0.0";
  return moneyMul(moneyDiv(profit, sellingPrice), 100).toDecimalPlaces(1).toFixed(1);
}

export function formatIqd(amount: MoneyValue): string {
  const num = formatMoney(amount, "IQD");
  return `${num} IQ`;
}

/** الرقم فقط بدون وحدة */
export function formatNumber(amount: MoneyValue): string {
  return formatMoney(amount, "IQD");
}

const arabicOnesMale = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];

function smallNumberToWords(n: number): string {
  if (n <= 0) return "";
  const small = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر"];
  if (n <= 12) return small[n] + " ";
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let result = "";
  if (hundreds > 0) {
    if (hundreds === 1) result += "مئة";
    else if (hundreds === 2) result += "مئتان";
    else result += arabicOnesMale[hundreds] + " مئة";
    result += rest > 0 ? " و" : " ";
  }
  if (rest === 0) {
    // done
  } else if (rest <= 12) {
    result += small[rest] + " ";
  } else if (rest < 20) {
    result += arabicOnesMale[rest % 10] + " عشر ";
  } else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    const tensWords = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    if (units > 0) result += arabicOnesMale[units] + " و";
    result += tensWords[tens] + " ";
  }
  return result;
}

export function numberToArabicWords(num: number): string {
  // Audit fix #29: handle negatives explicitly and round fractional input
  // instead of silently misbehaving on non-integer amounts.
  if (!Number.isFinite(num)) return "";
  const isNegative = num < 0;
  let value = Math.round(Math.abs(num));
  if (value === 0) return "صفر";

  const billions = Math.floor(value / 1_000_000_000);
  value %= 1_000_000_000;
  const millions = Math.floor(value / 1_000_000);
  value %= 1_000_000;
  const thousands = Math.floor(value / 1_000);
  value %= 1_000;
  const below = value;

  // Audit fix #29: join the magnitude groups with "و" per Arabic grammar
  // (e.g. "مليون وخمسة آلاف" instead of "مليون خمسة آلاف").
  const parts: string[] = [];
  if (billions > 0) {
    if (billions === 1) parts.push("مليار");
    else if (billions === 2) parts.push("ملياران");
    else parts.push((smallNumberToWords(billions) + (billions > 10 ? "مليار" : "مليارات")).trim());
  }
  if (millions > 0) {
    if (millions === 1) parts.push("مليون");
    else if (millions === 2) parts.push("مليونان");
    else parts.push((smallNumberToWords(millions) + (millions > 10 ? "مليون" : "ملايين")).trim());
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("ألف");
    else if (thousands === 2) parts.push("ألفان");
    else parts.push((smallNumberToWords(thousands) + (thousands > 10 ? "ألف" : "آلاف")).trim());
  }
  if (below > 0) {
    parts.push(smallNumberToWords(below).trim());
  }

  const joined = parts.join(" و");
  return (isNegative ? "سالب " : "") + joined;
}
