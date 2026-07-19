/**
 * CarsTab helper functions extracted from CarsTab.tsx.
 * Pure functions, type definitions, and constants.
 */

import type { Car, CarFormState } from "../types";
import { normalizePhoneNumber } from "../utils/numberInput";
import {
  compareMoney,
  moneyDiv,
  moneySub,
  moneySum,
  moneyToStorage,
  type MoneyInput,
} from "../utils/money";

// ── Types ───────────────────────────────────────────────────────────────

/** Panel mode */
export type PanelMode = "edit" | "new" | "batch";

export type CarSortKey =
  | "model"
  | "year"
  | "color"
  | "number"
  | "chassis"
  | "purchase"
  | "selling"
  | "profit";

export type CarsTabId = "available" | "sold";

export interface BatchCarRow {
  model: string;
  year: string;
  color: string;
  purchase: string;
  currency: "IQD" | "USD";
  purchaseType: "كاش" | "تمويل" | "شركة";
  financerName: string;
  num: string;
  chassis: string;
}

export interface BatchDuplicateConflict {
  rowIdx: number;
  rowNum: string;
  rowChassis: string;
  conflictType: "num" | "chassis" | "both";
  conflictWith: string;
}

// ── Constants ───────────────────────────────────────────────────────────

export const SORT_LABELS: Record<CarSortKey, string> = {
  model: "نوع السيارة",
  year: "الموديل",
  color: "اللون",
  number: "رقم السيارة",
  chassis: "رقم الشاصي",
  purchase: "اجمالي التكلفة",
  selling: "سعر البيع",
  profit: "الأرباح",
};

export const CARS_TABS: { id: CarsTabId; label: string }[] = [
  { id: "available", label: "المعروض" },
  { id: "sold", label: "المبــــــــــــــــــاع" },
];

// ── Form helpers ────────────────────────────────────────────────────────

export const emptyForm = (): CarFormState => ({
  num: "",
  chassis: "",
  model: "",
  year: "",
  name: "",
  color: "",
  details: "",
  purchase: "",
  selling: "",
  status: "متوفرة",
  paymentType: "كاش",
  amountPaid: "",
  amountRemaining: "",
  installmentMonths: "1",
  buyerName: "",
  phone: "",
  purchaseDate: "",
  saleDate: "",
  deliveryDate: "",
  firstPaymentDate: "",
  currency: "IQD",
  saleCurrency: "IQD",
  purchasePaymentType: "قاصه",
  salePaymentType: "قاصه",
  purchaseType: "كاش",
  financerName: "",
  commissionType: "لا يوجد",
  commissionValue: "",
});

export function carToForm(car: Car): CarFormState {
  return {
    carId: car.id,
    expectedVersion: car.version,
    num: car.car_plate_num ?? car.car_number,
    oldNum: car.car_number,
    chassis: car.chassis_number ?? "",
    model: car.car_model ?? "",
    year: car.car_year ?? "",
    name: car.car_name,
    color: car.color ?? "",
    details: car.details ?? "",
    purchase: String(car.purchase_price ?? 0),
    selling: String(car.selling_price ?? 0),
    status: car.status,
    paymentType: car.payment_type ?? "كاش",
    amountPaid: String(car.amount_paid ?? car.cash_price ?? 0),
    amountRemaining: String(car.amount_remaining ?? 0),
    installmentMonths: String(car.installment_months ?? 1),
    buyerName: car.buyer_name ?? "",
    phone: normalizePhoneNumber(car.buyer_phone ?? ""),
    purchaseDate: car.purchase_date ?? "",
    saleDate: car.sale_date ?? "",
    deliveryDate: car.delivery_date ?? "",
    firstPaymentDate: car.first_payment_date ?? "",
    currency: (car.currency as "IQD" | "USD") ?? "IQD",
    saleCurrency: (car.sale_currency as "IQD" | "USD") ?? "IQD",
    purchasePaymentType: "قاصه",
    salePaymentType: "قاصه",
    purchaseType:
      car.purchase_type === "تمويل" ||
      car.purchase_type === "شركة" ||
      car.purchase_type === "دين"
        ? car.purchase_type === "دين"
          ? "تمويل"
          : car.purchase_type
        : "كاش",
    financerName: car.financer_name ?? "",
    commissionType:
      (car.commission_type as CarFormState["commissionType"]) ?? "لا يوجد",
    commissionValue: String(car.commission_value ?? 0),
  };
}

export const createEmptyBatchRows = (count: number): BatchCarRow[] =>
  Array.from({ length: count }, () => ({
    model: "",
    year: "",
    color: "",
    purchase: "",
    currency: "IQD" as const,
    purchaseType: "كاش" as const,
    financerName: "",
    num: "",
    chassis: "",
  }));

export const rowToFormState = (
  row: BatchCarRow,
  purchaseDate: string,
): CarFormState => ({
  num: row.num,
  chassis: row.chassis,
  model: row.model,
  year: row.year,
  name: [row.model, row.year].filter(Boolean).join(" "),
  color: row.color,
  details: "",
  purchase: row.purchase,
  selling: "",
  status: "متوفرة",
  paymentType: "كاش",
  amountPaid: "",
  amountRemaining: "",
  installmentMonths: "1",
  buyerName: "",
  phone: "",
  purchaseDate,
  saleDate: "",
  deliveryDate: "",
  firstPaymentDate: "",
  currency: row.currency,
  saleCurrency: "IQD",
  purchasePaymentType: "قاصه",
  salePaymentType: "قاصه",
  purchaseType: row.purchaseType,
  financerName: row.financerName,
  commissionType: "لا يوجد",
  commissionValue: "",
});

export const sumMoneyValues = (values: readonly MoneyInput[]): string =>
  moneyToStorage(moneySum(values, (value) => value));

export const remainingSaleBalance = (
  selling: MoneyInput,
  downPayment: MoneyInput,
  receivedInstallments: MoneyInput,
): string => {
  const remaining = moneySub(moneySub(selling, downPayment), receivedInstallments);
  return moneyToStorage(remaining.isNegative() ? 0 : remaining);
};

// ── Sold-car change detection ───────────────────────────────────────────

export const getUnpaidInstallmentMonths = (
  formData: CarFormState,
  receivedInstallmentsCount: number,
) => Math.max(1, (Number(formData.installmentMonths) || 1) - receivedInstallmentsCount);

/** Check if sold-car sale fields changed — triggers update_sold_car_with_accounting */
export function hasSoldCarSaleAccountingChange(
  originalCar: Car | undefined,
  formData: CarFormState,
  receivedInstallmentsCount: number,
): boolean {
  if (!originalCar || originalCar.status !== "مبيوعة") return false;
  if (formData.status !== "مبيوعة") return false;
  return (
    compareMoney(moneySub(originalCar.selling_price, formData.selling), 0) !== 0
    || (originalCar.sale_currency ?? "IQD") !== (formData.saleCurrency || "IQD")
    || (originalCar.payment_type ?? "") !== formData.paymentType
    || compareMoney(moneySub(originalCar.amount_paid ?? 0, formData.amountPaid ?? 0), 0) !== 0
    || compareMoney(moneySub(originalCar.amount_remaining ?? 0, formData.amountRemaining ?? 0), 0) !== 0
    || Number(originalCar.installment_months ?? 1) !== Number(formData.installmentMonths ?? 1) + 0
    || compareMoney(moneySub(originalCar.monthly_payment ?? 0, moneyDiv(formData.amountRemaining ?? 0, getUnpaidInstallmentMonths(formData, receivedInstallmentsCount))), 0) !== 0
    || (originalCar.buyer_name ?? "") !== formData.buyerName.trim()
    || normalizePhoneNumber(originalCar.buyer_phone ?? "") !== normalizePhoneNumber(formData.phone)
    || (originalCar.sale_date ?? "") !== (formData.saleDate ?? "")
    || (originalCar.delivery_date ?? "") !== (formData.deliveryDate ?? "")
    || (originalCar.first_payment_date ?? "") !== (formData.firstPaymentDate ?? "")
  );
}

/** Check if sold-car cost fields changed — forces backend rebuild regardless of skipSaleAccounting */
export function hasSoldCarCostAccountingChange(
  originalCar: Car | undefined,
  formData: CarFormState,
): boolean {
  if (!originalCar || originalCar.status !== "مبيوعة") return false;
  if (formData.status !== "مبيوعة") return false;
  const originalPurchaseType =
    originalCar.purchase_type === "دين"
      ? "تمويل"
      : (originalCar.purchase_type ?? "كاش");
  return (
    compareMoney(moneySub(originalCar.purchase_price, formData.purchase), 0) !== 0
    || (originalCar.currency ?? "IQD") !== (formData.currency || "IQD")
    || originalPurchaseType !== (formData.purchaseType || "كاش")
    || (originalCar.financer_name ?? "") !== (formData.financerName ?? "")
    || (originalCar.purchase_payment_type ?? "") !== (formData.purchasePaymentType ?? "")
  );
}

/** Check if sold-car identity field changed (car_number) */
export function hasSoldCarIdentityChange(
  originalCar: Car | undefined,
  formData: CarFormState,
): boolean {
  if (!originalCar || originalCar.status !== "مبيوعة") return false;
  if (formData.status !== "مبيوعة") return false;
  return (
    (originalCar.car_plate_num ?? originalCar.car_number ?? "") !==
    formData.num.trim()
  );
}
