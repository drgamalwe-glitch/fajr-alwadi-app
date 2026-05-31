function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const clean = dateStr.replace(/\//g, "-").trim();
  const parts = clean.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
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

function formatToYmd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function checkInstallments(cars) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  console.log("Current time:", now.toString());
  console.log("Today start local:", todayStart.toString());

  const alerts = [];

  for (const car of cars) {
    if (
      car.status !== "مبيوعة" ||
      car.payment_type !== "اقساط" ||
      !car.first_payment_date ||
      !car.installment_months
    ) {
      console.log("Car skipped due to basic validation:", car.car_name);
      continue;
    }

    const remaining = car.amount_remaining ?? 0;
    if (remaining <= 0) {
      console.log("Car skipped due to remaining <= 0:", car.car_name);
      continue;
    }

    const firstDate = parseLocalDate(car.first_payment_date);
    console.log("First payment date parsed:", firstDate.toString());

    let monthly = car.monthly_payment ?? 0;
    const totalMonths = car.installment_months;

    if (monthly <= 0 && totalMonths > 0) {
      monthly = remaining / totalMonths;
    }
    if (monthly <= 0) {
      console.log("Car skipped due to monthly <= 0:", car.car_name);
      continue;
    }

    const remainingMonths = Math.round(remaining / monthly);
    const paidCount = Math.max(0, totalMonths - remainingMonths);

    console.log("Analytics:", {
      remaining,
      monthly,
      totalMonths,
      remainingMonths,
      paidCount
    });

    for (let i = paidCount; i < totalMonths; i++) {
      const due = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate());
      const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      
      const diffTime = dueStart.getTime() - todayStart.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      console.log(`Checking installment index ${i}:`, {
        dueStr: formatToYmd(due),
        dueStartStr: dueStart.toString(),
        diffDays
      });

      if (diffDays < 0) {
        alerts.push({
          carNumber: car.car_number,
          carName: car.car_name,
          buyerName: car.buyer_name,
          monthIndex: i + 1,
          dueDate: formatToYmd(due),
          monthlyPayment: monthly,
          status: "overdue",
          daysDifference: Math.abs(diffDays),
        });
        break;
      } else if (diffDays === 0) {
        alerts.push({
          carNumber: car.car_number,
          carName: car.car_name,
          buyerName: car.buyer_name,
          monthIndex: i + 1,
          dueDate: formatToYmd(due),
          monthlyPayment: monthly,
          status: "due_today",
          daysDifference: 0,
        });
        break;
      } else if (diffDays <= 2) {
        alerts.push({
          carNumber: car.car_number,
          carName: car.car_name,
          buyerName: car.buyer_name,
          monthIndex: i + 1,
          dueDate: formatToYmd(due),
          monthlyPayment: monthly,
          status: "upcoming",
          daysDifference: diffDays,
        });
        break;
      }
    }
  }

  return alerts;
}

// Test with a mock car representing yesterday's installment (May 29, 2026)
// Today is May 30, 2026
const mockCars = [
  {
    car_number: "12345 بغداد",
    car_name: "BYD 2026",
    status: "مبيوعة",
    payment_type: "اقساط",
    first_payment_date: "2026-05-29",
    installment_months: 10,
    amount_remaining: 10000000,
    monthly_payment: 1000000,
    buyer_name: "أحمد",
  }
];

const results = checkInstallments(mockCars);
console.log("Calculated alerts:", JSON.stringify(results, null, 2));
