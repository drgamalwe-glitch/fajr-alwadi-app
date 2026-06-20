/** المحافظات العراقية الـ 19 */
export const IRAQ_PROVINCES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "النجف",
  "كربلاء",
  "الأنبار",
  "ديالى",
  "صلاح الدين",
  "بابل",
  "واسط",
  "ذي قار",
  "ميسان",
  "المثنى",
  "القادسية",
  "كركوك",
  "السليمانية",
  "دهوك",
  "حلبجة",
] as const;

/** موديلات BYD */
export const BYD_MODELS = [
  "SEAL 5",
  "DESTROYER",
  "QIN PLUS",
  "SEAL 3",
  "K5",
] as const;

/** ألوان السيارات الشائعة */
export const CAR_COLORS = [
  "أبيض",
  "أسود",
  "رمادي",
  "فضي",
  "أزرق",
  "أزرق داكن",
  "أحمر",
  "بني",
  "بيج",
  "ذهبي",
  "أخضر",
  "برتقالي",
  "بنفسجي",
  "وردي",
  "أبيض لؤلؤي",
  "رمادي داكن",
] as const;

/** سنوات الصنع ديناميكية من السنة القادمة → 2000 */
const currentYear = new Date().getFullYear();
export const CAR_YEARS: string[] = Array.from(
  { length: (currentYear + 1) - 2000 + 1 },
  (_, i) => String((currentYear + 1) - i),
);
