import type { MoneyValue } from "./utils/money";

export type CarStatus = "متوفرة" | "مبيوعة";
export type PaymentType = "كاش" | "موعد" | "اقساط";

export interface CarPartner {
  car_number: string;
  partner_name: string;
  amount: MoneyValue;
  currency: string;
  kind?: string | null;
}

export interface Car {
  car_number: string;
  car_plate_num: string;
  chassis_number?: string | null;
  car_model: string;
  car_year: string;
  car_name: string;
  color: string;
  details: string;
  purchase_price: MoneyValue;
  selling_price: MoneyValue;
  status: CarStatus;
  payment_type?: PaymentType | null;
  cash_price?: MoneyValue;
  amount_paid?: MoneyValue;
  amount_remaining?: MoneyValue;
  installment_months?: number | null;
  monthly_payment?: MoneyValue;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  purchase_date?: string | null;
  sale_date?: string | null;
  delivery_date?: string | null;
  first_payment_date?: string | null;
  purchase_time?: string | null;
  sale_time?: string | null;
  expenses_sum?: MoneyValue;
  currency?: string | null;
  sale_currency?: string | null;
  purchase_payment_type?: string | null;
  sale_payment_type?: string | null;
  purchase_type?: string | null;
  financer_name?: string | null;
  commission_type?: string | null;
  commission_value?: MoneyValue;
  car_partners?: CarPartner[] | null;
}

export interface Partner {
  partner_name: string;
  phone: string;
  total_amount: MoneyValue;
  iqd_balance: MoneyValue;
  usd_balance: MoneyValue;
  kind: string;
  total_withdrawals: MoneyValue;
}

export interface UnifiedAccount {
  partner_name: string;
  phone: string | null;
  iqd_balance: MoneyValue;
  usd_balance: MoneyValue;
  kind: string;
}

export interface PartnerTransaction {
  id: number;
  partner_name: string;
  kind: string;
  type_: string;
  amount: MoneyValue;
  date: string;
  notes: string | null;
  currency?: string | null;
  paymentType?: string | null;
  payment_type?: string | null;
  time?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_role?: string | null;
  affects_qasa?: number;
  affects_partner_cash?: number;
  affects_profit?: number;
  related_source_type?: string | null;
  related_source_id?: string | null;
  original_amount?: MoneyValue | null;
  current_amount?: MoneyValue | null;
  actual_paid_amount?: MoneyValue | null;
  paid_event_id?: number | null;
  due_date?: string | null;
  ledger_batch_id?: string | null;
  is_reversed?: number;
}

export interface InstallmentPreviewRow {
  installment_id: number;
  due_date: string;
  old_amount: MoneyValue;
  new_amount: MoneyValue;
  currency: string;
  status: string;
}

export interface InstallmentPaymentPreview {
  installment_id: number;
  current_amount: MoneyValue;
  actual_paid_amount: MoneyValue;
  difference_amount: MoneyValue;
  affected_count: number;
  redistribution_direction: string;
  preview_installments: InstallmentPreviewRow[];
}

export interface ExpenseEntry {
  id: number;
  description: string;
  amount: MoneyValue;
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
  amount: MoneyValue;
  date: string;
  currency?: string | null;
}

export interface CashRegisterEntry {
  id: number;
  date: string;
  time: string;
  type_: string;
  amount: MoneyValue;
  description: string;
  notes: string | null;
  balance: MoneyValue;
  currency?: string | null;
}

export interface Agency {
  id: number;
  old_agent_name: string;
  car_type: string;
  car_number: string;
  car_model: string;
  color: string;
  new_agent_name: string;
  phone: string;
  amount_usd: MoneyValue;
  amount_iqd: MoneyValue;
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
  amount: MoneyValue;
  currency?: string | null;
  notes: string | null;
}

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  profile_image?: string | null;
}

export interface LoginResult {
  success: boolean;
  user?: UserInfo | null;
  error?: string | null;
}

export type TabId = "dashboard" | "company-status" | "cars" | "partners-financial" | "cashregister" | "expenses" | "financial-accounts" | "financial-transactions" | "agencies" | "profit-distribution" | "users";

export interface FinancialSummary {
  cash_iqd: MoneyValue;
  cash_usd: MoneyValue;
  qasa_iqd: MoneyValue;
  qasa_usd: MoneyValue;
  inventory_value_iqd: MoneyValue;
  inventory_value_usd: MoneyValue;
  total_investments_iqd: MoneyValue;
  total_investments_usd: MoneyValue;
  total_partner_capital_iqd: MoneyValue;
  total_partner_capital_usd: MoneyValue;
  total_debtors_iqd: MoneyValue;
  total_debtors_usd: MoneyValue;
  total_expenses_iqd: MoneyValue;
  total_expenses_usd: MoneyValue;
  deferred_revenue_iqd: MoneyValue;
  deferred_revenue_usd: MoneyValue;
  deferred_expense_iqd: MoneyValue;
  deferred_expense_usd: MoneyValue;
  net_capital_iqd: MoneyValue;
  net_capital_usd: MoneyValue;
  monthly_profits_iqd: MoneyValue;
  monthly_profits_usd: MoneyValue;
}

export interface CarFormState {
  num: string;
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
  purchasePaymentType?: "قاصه";
  salePaymentType?: "قاصه";
  purchaseType: "كاش" | "تمويل" | "شركة";
  financerName: string;
  commissionType: "نسبة" | "مقطوع" | "لا يوجد";
  commissionValue: string;
  oldNum?: string;
}

export interface PartnerDistributionInfo {
  partner_name: string;
  profit_iqd: MoneyValue;
  profit_usd: MoneyValue;
  drawings_iqd: MoneyValue;
  drawings_usd: MoneyValue;
}

export interface ProfitDistributionSummary {
  undistributed_iqd: MoneyValue;
  undistributed_usd: MoneyValue;
  partners: PartnerDistributionInfo[];
  expenses_iqd: MoneyValue;
  expenses_usd: MoneyValue;
}

export interface PartnerProfitShareInput {
  partner_name: string;
  profit_share: MoneyValue;
  drawings_deducted: MoneyValue;
  amount_reinvested: MoneyValue;
  amount_paid: MoneyValue;
}

export interface ProfitDistribution {
  id: number;
  date: string;
  time: string;
  total_profit: MoneyValue;
  currency: string;
  notes: string | null;
}

export interface PartnerProfitShare {
  id: number;
  distribution_id: number;
  partner_name: string;
  profit_share: MoneyValue;
  drawings_deducted: MoneyValue;
  amount_reinvested: MoneyValue;
  amount_paid: MoneyValue;
  currency: string;
}

export interface ProfitDistributionDetail {
  distribution: ProfitDistribution;
  shares: PartnerProfitShare[];
}
