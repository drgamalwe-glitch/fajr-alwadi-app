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
  car_type: string;
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

export type TabId = "dashboard" | "company-status" | "cars" | "partners" | "partners-financial" | "debtors" | "cashregister" | "expenses" | "financial-accounts" | "financial-transactions" | "agencies" | "profit-distribution" | "users";

export interface FinancialSummary {
  cash_iqd: number;
  cash_usd: number;
  inventory_value_iqd: number;
  inventory_value_usd: number;
  total_investments_iqd: number;
  total_investments_usd: number;
  total_partner_capital_iqd: number;
  total_partner_capital_usd: number;
  total_debtors_iqd: number;
  total_debtors_usd: number;
  total_expenses_iqd: number;
  total_expenses_usd: number;
  net_capital_iqd: number;
  net_capital_usd: number;
  monthly_profits_iqd: number;
  monthly_profits_usd: number;
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
  purchasePaymentType: "قاصه" | "خارج القاصة" | "ماستر";
  salePaymentType: "قاصه" | "خارج القاصة" | "ماستر";
  purchaseType: "كاش" | "تمويل" | "شركة";
  financerName: string;
  commissionType: "نسبة" | "مقطوع" | "لا يوجد";
  commissionValue: string;
  oldNum?: string;
}

export interface PartnerDistributionInfo {
  partner_name: string;
  capital_iqd: number;
  capital_usd: number;
  drawings_iqd: number;
  drawings_usd: number;
}

export interface ProfitDistributionSummary {
  undistributed_iqd: number;
  undistributed_usd: number;
  partners: PartnerDistributionInfo[];
}

export interface PartnerProfitShareInput {
  partner_name: string;
  profit_share: number;
  drawings_deducted: number;
  amount_reinvested: number;
  amount_paid: number;
}

export interface ProfitDistribution {
  id: number;
  date: string;
  time: string;
  total_profit: number;
  currency: string;
  notes: string | null;
}

export interface PartnerProfitShare {
  id: number;
  distribution_id: number;
  partner_name: string;
  profit_share: number;
  drawings_deducted: number;
  amount_reinvested: number;
  amount_paid: number;
  currency: string;
}

export interface ProfitDistributionDetail {
  distribution: ProfitDistribution;
  shares: PartnerProfitShare[];
}
