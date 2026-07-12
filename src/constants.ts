export const PAGE_SIZE = 13;

export const CAR_STATUS_OPTIONS = ["متوفرة", "مبيوعة"] as const;
export const PAYMENT_TYPE_OPTIONS = ["كاش", "موعد", "اقساط"] as const;
export const PURCHASE_TYPE_OPTIONS = ["كاش", "تمويل", "شركة"] as const;
export const COMMISSION_TYPE_OPTIONS = ["نسبة", "مقطوع", "لا يوجد"] as const;
export const CURRENCY_OPTIONS = ["IQD", "USD"] as const;
export const PAYMENT_ACCOUNT_OPTIONS = ["قاصه"] as const;

export const TRANSACTION_TYPES = ["ايداع", "سحب"] as const;

export const AGENCY_TABS = [
  { id: "list" as const, label: "الوكالات" },
  { id: "details" as const, label: "تفاصيل" },
] as const;

export const FINANCIAL_ACCOUNT_TABS = [
  { id: "قاصه" as const, label: "قاصه" },
] as const;

export const SECTION_TABS: Record<string, readonly string[]> = {
  dashboard: ["dashboard", "company-status"],
  cars: ["available", "sold"],
  "partners-financial": ["customers", "personal", "receivables", "liabilities"],
  "financial-accounts": ["قاصه", "الكاش"],
};
