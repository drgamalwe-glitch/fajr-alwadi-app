import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

/** تحويل الأرقام العربية/الشرقية إلى أرقام إنجليزية غربية */
function toWesternDigits(str: string): string {
  return str
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** مصيدة عالمية: تحول أي رقم عربي يُكتب في أي حقل إلى رقم إنجليزي */
document.addEventListener(
  "input",
  (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target || !("value" in target)) return;
    const converted = toWesternDigits(target.value);
    if (converted !== target.value) {
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      target.value = converted;
      // الحفاظ على موقع المؤشر بعد التحويل
      try {
        target.setSelectionRange(start, end);
      } catch (_) { /* بعض العناصر لا تدعم setSelectionRange */ }
      // إطلاق حدث React الداخلي لمزامنة الحالة
      const nativeInput = Object.getOwnPropertyDescriptor(
        target.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        "value"
      );
      if (nativeInput?.set) {
        nativeInput.set.call(target, converted);
        target.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  },
  true // capture phase — قبل React
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
