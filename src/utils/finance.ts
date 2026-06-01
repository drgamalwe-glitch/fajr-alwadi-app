import type { Car, Partner } from "../types";

export function carNetProfit(car: Car): number {
  if (car.status !== "مبيوعة") return 0;
  return car.selling_price - car.purchase_price;
}

export function carProfitPercentage(car: Car): string {
  const profit = carNetProfit(car);
  if (profit <= 0 || car.purchase_price <= 0) return "0.0";
  return ((profit / car.purchase_price) * 100).toFixed(1);
}

export function formatIqd(amount: number): string {
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${num} د.ع`;
}

/** الرقم فقط بدون وحدة */
export function formatNumber(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function computeDashboardStats(cars: Car[], partners: Partner[] = []) {
  const availableCars = cars.filter((c) => c.status === "متوفرة");
  const totalInventoryValue = availableCars.reduce((sum, c) => sum + c.purchase_price, 0);
  const iqdInventory = availableCars
    .filter((c) => c.currency !== "USD")
    .reduce((sum, c) => sum + c.purchase_price, 0);
  const usdInventory = availableCars
    .filter((c) => c.currency === "USD")
    .reduce((sum, c) => sum + c.purchase_price, 0);

  const partnersTotal = partners
    .filter((p) => p.kind === "شريك")
    .reduce((sum, p) => sum + p.total_amount, 0);

  const investorsTotal = partners
    .filter((p) => p.kind === "مستثمر")
    .reduce((sum, p) => sum + p.total_amount, 0);

  const netCapital = totalInventoryValue + partnersTotal - investorsTotal;

  return {
    totalInventoryValue,
    iqdInventory,
    usdInventory,
    partnersTotal,
    investorsTotal,
    netCapital,
  };
}
