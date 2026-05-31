import { invoke } from "@tauri-apps/api/core";
import type { Car, CarFormState, Partner, PartnerTransaction } from "../types";

const isTauri = () => import.meta.env.TAURI_ENV_PLATFORM !== undefined;

function generateMockTxId(): number {
  return parseInt(crypto.randomUUID().replace(/-/g, "").slice(0, 12), 16);
}

function mockStorageKey(command: string): string {
  if (command.includes("car")) return "mock_cars";
  if (command.includes("partner")) return "mock_partners";
  return "mock_default";
}

function mapMockCar(args: Record<string, unknown>): Car {
  const status = (args.status as Car["status"]) ?? "متوفرة";
  const paymentType = args.paymentType as Car["payment_type"] | undefined;
  const plateNum = String(args.num ?? "").trim();
  const province = String(args.province ?? "").trim();
  // المفتاح الأساسي = رقم اللوحة + المحافظة
  const carNumber = province ? `${plateNum} ${province}` : plateNum;
  return {
    car_number: carNumber,
    car_plate_num: plateNum,
    car_province: province,
    chassis_number: String(args.chassis ?? "") || null,
    car_model: String(args.model ?? ""),
    car_year: String(args.year ?? ""),
    car_name: String(args.name ?? ""),
    color: String(args.color ?? ""),
    details: String(args.details ?? ""),
    purchase_price: Number(args.purchase) || 0,
    selling_price: Number(args.selling) || 0,
    status,
    payment_type: status === "مبيوعة" ? paymentType ?? "كاش" : undefined,
    cash_price: status === "مبيوعة" && (paymentType === "كاش" || paymentType === "موعد") ? Number(args.amountPaid) || 0 : 0,
    amount_paid: status === "مبيوعة" && paymentType === "اقساط" ? Number(args.amountPaid) || 0 : 0,
    amount_remaining: Number(args.amountRemaining) || 0,
    installment_months: Number(args.installmentMonths) || 0,
    monthly_payment: Number(args.monthlyPayment) || 0,
    buyer_name: String(args.buyerName ?? "") || null,
    buyer_phone: String(args.phone ?? "") || null,
    purchase_date: String(args.purchaseDate ?? "") || null,
    sale_date: String(args.saleDate ?? "") || null,
    delivery_date: String(args.deliveryDate ?? "") || null,
    first_payment_date: String(args.firstPaymentDate ?? "") || null,
  };
}

function recalculateMockPartnerTotal(partnerName: string, kind: string) {
  const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
  const txns = allTx.filter((tx) => tx.partner_name === partnerName && tx.kind === kind);
  const partners: Partner[] = JSON.parse(localStorage.getItem("mock_partners") ?? "[]");
  const pIdx = partners.findIndex((p) => p.partner_name === partnerName && p.kind === kind);
  if (pIdx < 0) return;

  partners[pIdx].total_amount = txns.reduce((total, tx) => {
    if (tx.type_ === "ايداع") return total + tx.amount;
    if (tx.type_ === "سحب") return total - tx.amount;
    return total;
  }, 0);
  localStorage.setItem("mock_partners", JSON.stringify(partners));
}

async function mockInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const key = mockStorageKey(command);

  if (command === "get_cars") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const item = mapMockCar(args);
    const next = existing.filter((c) => c.car_number !== item.car_number);
    next.push(item);
    localStorage.setItem(key, JSON.stringify(next));
    return undefined as T;
  }

  if (command === "delete_car") {
    const existing: Car[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const target = String(args.num ?? "").trim();
    const next = existing.filter((c) => c.car_number.trim() !== target);
    localStorage.setItem(key, JSON.stringify(next));
    return undefined as T;
  }

  if (command === "get_partners") {
    const raw = localStorage.getItem(key);
    return (raw ? JSON.parse(raw) : []) as T;
  }

  if (command === "add_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const existingIdx = existing.findIndex((p) => p.partner_name === name && p.kind === kind);
    if (existingIdx >= 0) {
      existing[existingIdx] = { ...existing[existingIdx], phone: String(args.phone ?? "").trim(), kind };
    } else {
      existing.push({
        partner_name: name,
        phone: String(args.phone ?? "").trim(),
        total_amount: 0,
        kind,
      });
    }
    localStorage.setItem(key, JSON.stringify(existing));
    return undefined as T;
  }

  if (command === "update_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const oldName = String(args.old_name ?? "").trim();
    const oldKind = String(args.old_kind ?? "شريك").trim();
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const idx = existing.findIndex((p) => p.partner_name === oldName && p.kind === oldKind);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], partner_name: name, phone: String(args.phone ?? "").trim(), kind };
      localStorage.setItem(key, JSON.stringify(existing));
      if (oldName !== name || oldKind !== kind) {
        const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
        localStorage.setItem(
          "mock_partner_transactions",
          JSON.stringify(
            allTx.map((tx) =>
              tx.partner_name === oldName && tx.kind === oldKind
                ? { ...tx, partner_name: name, kind }
                : tx,
            ),
          ),
        );
      }
    }
    return undefined as T;
  }

  if (command === "delete_partner") {
    const existing: Partner[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const name = String(args.name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const next = existing.filter((p) => !(p.partner_name === name && p.kind === kind));
    localStorage.setItem(key, JSON.stringify(next));
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.partner_name === name && tx.kind === kind))),
    );
    return undefined as T;
  }

  if (command === "get_partner_transactions") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    return allTx.filter((tx) => tx.partner_name === partnerName && tx.kind === kind) as T;
  }

  if (command === "add_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const partnerName = String(args.partner_name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const newTx: PartnerTransaction = {
      id: generateMockTxId(),
      partner_name: partnerName,
      kind,
      type_: String(args.type_ ?? ""),
      amount: Number(args.amount) || 0,
      date: String(args.date ?? ""),
      notes: args.notes ? String(args.notes) : null,
    };
    allTx.push(newTx);
    localStorage.setItem("mock_partner_transactions", JSON.stringify(allTx));
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "update_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    const next = allTx.map((tx) =>
      tx.id === id
        ? {
            ...tx,
            type_: String(args.type_ ?? ""),
            amount: Number(args.amount) || 0,
            date: String(args.date ?? ""),
            notes: args.notes ? String(args.notes) : null,
          }
        : tx,
    );
    localStorage.setItem("mock_partner_transactions", JSON.stringify(next));
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  if (command === "delete_partner_transaction") {
    const allTx: PartnerTransaction[] = JSON.parse(localStorage.getItem("mock_partner_transactions") ?? "[]");
    const id = Number(args.id);
    const partnerName = String(args.partner_name ?? "").trim();
    const kind = String(args.kind ?? "شريك").trim();
    localStorage.setItem(
      "mock_partner_transactions",
      JSON.stringify(allTx.filter((tx) => !(tx.id === id))),
    );
    recalculateMockPartnerTotal(partnerName, kind);
    return undefined as T;
  }

  throw new Error(`أمر غير معروف: ${command}`);
}

/** يبني حمولة add_car متوافقة مع أوامر Rust */
export function buildCarInvokeArgs(form: CarFormState) {
  const isSold = form.status === "مبيوعة";
  const isDelivery = isSold && form.paymentType === "موعد";
  const isInstallment = isSold && form.paymentType === "اقساط";
  const months = Math.max(1, form.installmentMonths || 1);
  const remaining = Number(form.amountRemaining) || 0;

  return {
    num: form.num.trim(),
    province: form.province.trim(),
    chassis: form.chassis.trim(),
    model: form.model.trim(),
    year: form.year.trim(),
    name: form.name.trim(),
    color: form.color.trim(),
    details: form.details.trim(),
    purchase: Number(form.purchase) || 0,
    selling: Number(form.selling) || 0,
    status: form.status,
    paymentType: isSold ? form.paymentType : null,
    amountPaid: isSold ? Number(form.amountPaid) || 0 : null,
    amountRemaining: isInstallment ? remaining : null,
    installmentMonths: isInstallment ? months : null,
    monthlyPayment: isInstallment ? remaining / months : null,
    buyerName: isSold ? form.buyerName.trim() || null : null,
    phone: isSold ? form.phone.trim() || null : null,
    purchaseDate: form.purchaseDate || null,
    saleDate: isSold ? form.saleDate || null : null,
    deliveryDate: isDelivery ? form.deliveryDate || null : null,
    firstPaymentDate: isInstallment ? form.firstPaymentDate || null : null,
  };
}

export async function callTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }

  console.warn(`[وضع المتصفح] استدعاء: ${command}`, args);
  return mockInvoke<T>(command, args);
}
