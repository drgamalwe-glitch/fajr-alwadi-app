export type CarStatus = "متوفرة" | "مبيوعة";
export type PaymentType = "كاش" | "موعد" | "اقساط";

export interface CarPartner {
  car_number: string;
  partner_name: string;
  amount: number;
  currency: string;
  kind?: string | null;
}

export interface Car {
  car_number: string;
  car_plate_num: string;
  car_province: string;
  chassis_number?: string | null;
  car_model: string;
  car_year: string;
  car_name: string;
  color: string;
  details: string;
  purchase_price: number;
  selling_price: number;
  status: CarStatus;
  payment_type?: PaymentType | null;
  cash_price?: number | null;
  amount_paid?: number | null;
  amount_remaining?: number | null;
  installment_months?: number | null;
  monthly_payment?: number | null;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  purchase_date?: string | null;
  sale_date?: string | null;
  delivery_date?: string | null;
  first_payment_date?: string | null;
  purchase_time?: string | null;
  sale_time?: string | null;
  expenses_sum?: number | null;
  currency?: string | null;
  sale_currency?: string | null;
  purchase_payment_type?: string | null;
  sale_payment_type?: string | null;
  purchase_type?: string | null;
  financer_name?: string | null;
  commission_type?: string | null;
  commission_value?: number | null;
  car_partners?: CarPartner[] | null;
}

export interface Partner {
  partner_name: string;
  phone: string;
  total_amount: number;
  kind: string;
  total_withdrawals: number;
}

export interface UnifiedAccount {
  partner_name: string;
  phone: string | null;
  iqd_balance: number;
  usd_balance: number;
  kind: string;
}

export interface PartnerTransaction {
  id: number;
  partner_name: string;
  kind: string;
  type_: string;
  amount: number;
  date: string;
  notes: string | null;
  currency?: string | null;
  paymentType?: string | null;
  payment_type?: string | null;
  time?: string | null;
}

export interface ExpenseEntry {
  id: number;
  description: string;
  amount: number;
  date: string;
  time: string;
  notes: string | null;
  currency?: string | null;
  car_number?: string | null;
}

export interface CarExpenseRecord {
  id: number;
  car_number: string;
  description: string;
  amount: number;
  date: string;
  currency?: string | null;
}

export interface CashRegisterEntry {
  id: number;
  date: string;
  time: string;
  type_: string;
  amount: number;
  description: string;
  notes: string | null;
  balance: number;
  currency?: string | null;
}

export interface Agency {
  id: number;
  old_agent_name: string;
  car_number: string;
  car_model: string;
  color: string;
  new_agent_name: string;
  phone: string;
  amount_usd: number;
  amount_iqd: number;
  notes: string;
  date: string;
  time: string;
}

export interface AgencyTransaction {
  id: number;
  agency_id: number;
  date: string;
  time: string;
  type_: string;
  amount: number;
  currency?: string | null;
  notes: string | null;
}

export type TabId = "dashboard" | "cars" | "partners" | "partners-financial" | "debtors" | "cashregister" | "expenses" | "financial-accounts" | "financial-transactions" | "agencies";

export interface FinancialSummary {
  iqd_balance: number;
  usd_balance: number;
  inventory_value: number;
  total_investments: number;
  total_partner_capital: number;
  total_debtors: number;
  net_capital: number;
  total_expenses: number;
}

export interface CarFormState {
  num: string;
  province: string;
  chassis: string;
  model: string;
  year: string;
  name: string;
  color: string;
  details: string;
  purchase: string;
  selling: string;
  status: CarStatus;
  paymentType: PaymentType;
  amountPaid: string;
  amountRemaining: string;
  installmentMonths: string;
  buyerName: string;
  phone: string;
  purchaseDate: string;
  saleDate: string;
  deliveryDate: string;
  firstPaymentDate: string;
  currency: "IQD" | "USD";
  saleCurrency: "IQD" | "USD";
  purchasePaymentType: "قاصه" | "ماستر";
  salePaymentType: "قاصه" | "ماستر";
  purchaseType: "كاش" | "شراكه" | "تمويل" | "شركة";
  financerName: string;
  commissionType: "نسبة" | "مقطوع" | "لا يوجد";
  commissionValue: string;
  carPartners: { partner_name: string; amount: string; currency: "IQD" | "USD"; kind?: string }[];
  oldNum?: string;
}
