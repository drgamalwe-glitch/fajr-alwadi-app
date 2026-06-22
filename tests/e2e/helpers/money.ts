export function parseMoney(text: string): number {
  if (!text) return NaN;
  const cleaned = text.replace(/[^\d.,\-]/g, "").replace(/,/g, "");
  return parseFloat(cleaned) || 0;
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en");
}
