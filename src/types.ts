export type CarStatus = "متوفرة" | "مبيوعة";
export type PaymentType = "كاش" | "موعد" | "اقساط";

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
}

export interface Partner {
  partner_name: string;
  phone: string;
  total_amount: number;
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
}

export interface ExpenseEntry {
  id: number;
  description: string;
  amount: number;
  date: string;
  time: string;
  notes: string | null;
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
}

export type TabId = "dashboard" | "cars" | "partners" | "investors" | "debtors" | "cashregister" | "expenses";

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
}
