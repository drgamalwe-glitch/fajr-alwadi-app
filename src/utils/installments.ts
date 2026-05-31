import type { Car } from "../types";

export interface InstallmentAlert {
  buyerName: string;
  phone: string;
  dueDate: string;
  monthlyPayment: number;
  status: "overdue" | "due_today" | "upcoming";
  daysDifference: number;
}

export function formatToYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * يحلل تاريخ بصيغة YYYY-MM-DD بالمنطقة الزمنية المحلية لتفادي مشاكل فروقات التوقيت UTC
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.replace(/\//g, "-").trim();
  const parts = clean.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // الشهر يبدأ من 0 في JS
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d);
    }
  }
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

/** @deprecated يستخدم checkInstallmentsFromTransactions بدلاً منه */
export function checkInstallments(cars: Car[]): InstallmentAlert[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  console.log("🔍 [checkInstallments] اليوم:", todayStart.toISOString(), "| إجمالي السيارات:", cars.length);

  const alerts: InstallmentAlert[] = [];

  for (const car of cars) {
    // التحقق من أن السيارة مبيوعة بالأقساط ولديها بيانات كافية
    if (
      car.status !== "مبيوعة" ||
      car.payment_type !== "اقساط" ||
      !car.first_payment_date ||
      !car.installment_months
    ) {
      console.log(`⏩ تخطي السيارة [${car.car_number}]: status=${car.status} | payment_type=${car.payment_type} | first_payment_date=${car.first_payment_date} | installment_months=${car.installment_months}`);
      continue;
    }

    const remaining = car.amount_remaining ?? 0;
    if (remaining <= 0) {
      console.log(`⏩ تخطي السيارة [${car.car_number}]: المبلغ المتبقي = ${remaining} (مسددة بالكامل)`);
      continue;
    }

    // استخدام التحليل الآمن والخالي من مشاكل المناطق الزمنية
    const firstDate = parseLocalDate(car.first_payment_date);

    let monthly = car.monthly_payment ?? 0;
    const totalMonths = car.installment_months;

    // حساب احترازي للقسط الشهري في حال كان 0 أو فارغاً في قاعدة البيانات
    if (monthly <= 0 && totalMonths > 0) {
      monthly = remaining / totalMonths;
    }
    if (monthly <= 0) {
      console.log(`⏩ تخطي السيارة [${car.car_number}]: القسط الشهري = ${monthly}`);
      continue;
    }

    const name = car.car_name ?? "";
    const buyer = car.buyer_name ?? "";

    // حساب عدد الدفعات المدفوعة تلقائياً بناءً على المبلغ المتبقي لعدم إظهار تنبيهات عنها
    const remainingMonths = Math.round(remaining / monthly);
    const paidCount = Math.max(0, totalMonths - remainingMonths);

    console.log(`✅ فحص السيارة [${car.car_number}] ${name}: أول دفعة=${car.first_payment_date} | إجمالي أشهر=${totalMonths} | مدفوع=${paidCount} | متبقي=${remaining} | شهري=${monthly}`);

    for (let i = paidCount; i < totalMonths; i++) {
      // حساب تاريخ الاستحقاق الفعلي لهذا الشهر بالمنطقة الزمنية المحلية
      const due = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
      const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      
      // فرق الأيام الدقيق والآمن بالملي ثانية
      const diffTime = dueStart.getTime() - todayStart.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      console.log(`  → دفعة ${i+1}: تاريخ استحقاق=${formatToYmd(due)} | فرق الأيام=${diffDays}`);

      // تصنيف حالة القسط بدقة
      if (diffDays < 0) {
        alerts.push({
          buyerName: buyer,
          phone: "",
          dueDate: formatToYmd(due),
          monthlyPayment: monthly,
          status: "overdue",
          daysDifference: Math.abs(diffDays),
        });
        break;
      } else if (diffDays === 0) {
        alerts.push({
          buyerName: buyer,
          phone: "",
          dueDate: formatToYmd(due),
          monthlyPayment: monthly,
          status: "due_today",
          daysDifference: 0,
        });
        break;
      } else if (diffDays <= 1) {
        alerts.push({
          buyerName: buyer,
          phone: "",
          dueDate: formatToYmd(due),
          monthlyPayment: monthly,
          status: "upcoming",
          daysDifference: diffDays,
        });
        break;
      } else {
        // القسط المستقبلي الأول - لا تكمل المزيد
        console.log(`  → القسط ${i+1} مستقبلي بـ ${diffDays} يوم، لا تنبيه لهذه السيارة`);
        break;
      }
    }
  }

  console.log("📊 [checkInstallments] إجمالي التنبيهات:", alerts.length, alerts);
  return alerts;
}

/* ═══════════════════════════════════════════
   DebtAlert — نظام التنبيهات من ديون العملاء
   المصدر: partner_transactions (type_ = "سحب")
   التاريخ: تاريخ الاستحقاق الفعلي من الحركة
   ═══════════════════════════════════════════ */

export interface DebtAlert {
  buyerName: string;
  phone: string;
  carName: string;
  amount: number;
  status: "overdue" | "due_today" | "upcoming";
  daysDifference: number;
  dueDate: string;
}

export interface DebtRecord {
  buyerName: string;
  phone: string;
  carName: string;
  amount: number;
  date: string;
}

/**
 * يحول سجلات partner_transactions إلى InstallmentAlert[]
 * للعرض في جدول الأقساط
 * ملاحظات التنسيق: "قسط 1/12 - carName - carNumber"
 */
export function transactionsToInstallmentAlerts(
  transactions: {
    partner_name: string;
    phone: string;
    amount: number;
    date: string;
  }[],
): InstallmentAlert[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const alerts: InstallmentAlert[] = [];

  for (const tx of transactions) {
    if (!tx.date) continue;
    const due = parseLocalDate(tx.date);
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffTime = dueStart.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let status: InstallmentAlert["status"];
    let daysDifference: number;

    if (diffDays < 0) {
      status = "overdue";
      daysDifference = Math.abs(diffDays);
    } else if (diffDays === 0) {
      status = "due_today";
      daysDifference = 0;
    } else {
      continue;
    }

    alerts.push({
      buyerName: tx.partner_name || "عميل",
      phone: tx.phone || "",
      dueDate: tx.date,
      monthlyPayment: tx.amount,
      status,
      daysDifference,
    });
  }

  return alerts;
}

export function checkDebtAlerts(debts: DebtRecord[]): DebtAlert[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const alerts: DebtAlert[] = [];

  for (const debt of debts) {
    if (!debt.date) continue;
    const due = parseLocalDate(debt.date);
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffTime = dueStart.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      alerts.push({
        buyerName: debt.buyerName || "عميل",
        phone: debt.phone || "",
        carName: debt.carName || "",
        amount: debt.amount || 0,
        status: "overdue",
        daysDifference: Math.abs(diffDays),
        dueDate: debt.date,
      });
    } else if (diffDays === 0) {
      alerts.push({
        buyerName: debt.buyerName || "عميل",
        phone: debt.phone || "",
        carName: debt.carName || "",
        amount: debt.amount || 0,
        status: "due_today",
        daysDifference: 0,
        dueDate: debt.date,
      });
    } else if (diffDays <= 3) {
      alerts.push({
        buyerName: debt.buyerName || "عميل",
        phone: debt.phone || "",
        carName: debt.carName || "",
        amount: debt.amount || 0,
        status: "upcoming",
        daysDifference: diffDays,
        dueDate: debt.date,
      });
    }
  }

  return alerts;
}

