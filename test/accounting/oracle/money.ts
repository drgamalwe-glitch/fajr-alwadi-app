export function fmt(n: number): string {
  return n.toLocaleString("en");
}

export function near(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function half(amount: number): number {
  return amount / 2;
}

export function profitRatio(fullProfit: number, sellingPrice: number): number {
  return sellingPrice > 0 ? fullProfit / sellingPrice : 0;
}

export function paymentProfit(payment: number, ratio: number): number {
  return payment * ratio;
}

export function recognizedProfit(calculated: number, remaining: number): number {
  return Math.min(Math.max(calculated, 0), Math.max(remaining, 0));
}
