/** إزالة بيانات العمولة وروابط الأقساط الداخلية من نص الملاحظة للعرض */
export function formatNotesText(notes: string | null | undefined): string {
  if (!notes) return "";
  let text = notes.trim();
  if (text.includes(" - عمولة:")) {
    text = text.split(" - عمولة:")[0].trim();
  }
  return text
    .replace(/\s*\|\s*قسط#\d+\s*/g, "")
    .replace(/\s*#بيع_سيارة_[^\s|،,؛)]+/g, "")
    .replace(/(?:رقم\s+)?الشاصي\s*[:：]?\s*/g, "")
    .replace(/شاصي\s*[:：]?\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

/** دمج التفاصيل والملاحظات في نص واحد مختصر بلون أسود */
export function formatLedgerDetails(
  description?: string | null,
  notes?: string | null,
): string {
  if (notes?.startsWith("تم تسديد الممول") || notes?.startsWith("تم تسليم الممول")) {
    const note = formatNotesText(notes);
    return note || "—";
  }

  const desc = (description || "").trim();
  const note = formatNotesText(notes);

  if (!desc && !note) return "—";
  if (!note) return desc;
  if (!desc) return note;
  if (desc === note || desc.includes(note) || note.includes(desc)) {
    return desc.length >= note.length ? desc : note;
  }
  return `${desc} — ${note}`;
}
