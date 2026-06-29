import type { Car, Partner } from "../types";
import {
  compareMoney,
  formatMoney,
  moneyAdd,
  moneyDiv,
  moneyMul,
  moneySub,
  moneySum,
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
  if (!profit.isPositive() || !sellingPrice.isPositive()) return "0.0";
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

export function computeDashboardStats(cars: Car[], partners: Partner[] = []) {
  const availableCars = cars.filter((c) => c.status === "متوفرة");
  // Match Cars > المعروض totals: available cars only, purchase price plus car-specific expenses.
  const totalInventoryValue = moneySum(availableCars, (c) => moneyAdd(c.purchase_price, c.expenses_sum || 0));
  const iqdInventory = moneySum(
    availableCars.filter((c) => c.currency !== "USD"),
    (c) => moneyAdd(c.purchase_price, c.expenses_sum || 0),
  );
  const usdInventory = moneySum(
    availableCars.filter((c) => c.currency === "USD"),
    (c) => moneyAdd(c.purchase_price, c.expenses_sum || 0),
  );

  const partnersTotal = moneySum(
    partners.filter((p) => p.kind === "شريك"),
    (p) => p.total_amount,
  );

  const investorsTotal = moneySum(
    partners.filter((p) => p.kind === "مستثمر"),
    (p) => p.total_amount,
  );

  const netCapital = moneySub(moneyAdd(totalInventoryValue, partnersTotal), investorsTotal);

  return {
    totalInventoryValue,
    iqdInventory,
    usdInventory,
    partnersTotal,
    investorsTotal,
    netCapital,
  };
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
  if (num === 0) return "صفر";
  let result = "";
  const billions = Math.floor(num / 1_000_000_000);
  num %= 1_000_000_000;
  const millions = Math.floor(num / 1_000_000);
  num %= 1_000_000;
  const thousands = Math.floor(num / 1_000);
  num %= 1_000;
  const below = num;

  if (billions > 0) {
    if (billions === 1) result += "مليار ";
    else if (billions === 2) result += "ملياران ";
    else result += smallNumberToWords(billions) + "مليار ";
  }
  if (millions > 0) {
    if (millions === 1) result += "مليون ";
    else if (millions === 2) result += "مليونان ";
    else result += smallNumberToWords(millions) + (millions > 10 ? "مليون " : "ملايين ");
  }
  if (thousands > 0) {
    if (thousands === 1) result += "ألف ";
    else if (thousands === 2) result += "ألفان ";
    else result += smallNumberToWords(thousands) + (thousands > 10 ? "ألف " : "آلاف ");
  }
  if (below > 0) {
    result += smallNumberToWords(below);
  }

  return result.trim();
}
