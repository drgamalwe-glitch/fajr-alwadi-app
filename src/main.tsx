import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme/globals.css";
import "./theme/buttons.css";
import "./theme/qasa.css";
import "./theme/capital.css";
import "./theme/profit.css";
import "./theme/inventory.css";
import { syncThemeToCSS } from "./theme";

// Synchronize design system tokens to CSS custom properties
syncThemeToCSS();

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
      } catch { /* بعض العناصر لا تدعم setSelectionRange */ }
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

/** إلغاء التصحيح الكتابي والإكمال التلقائي من جميع حقول الإدخال عالمياً */
document.addEventListener(
  "focusin",
  (e: Event) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.setAttribute("spellcheck", "false");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocapitalize", "off");
    }
  },
  true
);


function applyAutoZoom() {
  const baseWidth = 1920;
  const baseHeight = 1000; // الارتفاع النموذجي لمنطقة العرض (Viewport) في شاشات 1080p

  const width = window.innerWidth;
  const height = window.innerHeight;

  const scaleX = width / baseWidth;
  const scaleY = height / baseHeight;

  // حساب نسبة التكبير/التصغير بناءً على البعد الأكثر تقييداً
  let zoomFactor = Math.min(scaleX, scaleY);

  // إبقاء التكبير في حدود آمنة بين 0.50 و 1.25 لضمان تطابق أبعاد وارتفاعات التصميم بالكامل
  const finalZoom = Math.max(0.50, Math.min(1.25, zoomFactor));

  document.documentElement.style.zoom = String(finalZoom);
}

// تشغيل دالة الزوم تلقائياً عند تحميل الصفحة وتغيير حجم النافذة
if (typeof window !== "undefined") {
  window.addEventListener("resize", applyAutoZoom);
  window.addEventListener("load", applyAutoZoom);
  
  // تنفيذ فوري وعند فترات زمنية متتابعة لضمان التقاط أبعاد الشاشة بعد تكبير النافذة (Maximize)
  applyAutoZoom();
  setTimeout(applyAutoZoom, 50);
  setTimeout(applyAutoZoom, 150);
  setTimeout(applyAutoZoom, 300);
  setTimeout(applyAutoZoom, 600);
  setTimeout(applyAutoZoom, 1000);
}

function bootstrapApplication() {
  if (import.meta.env.VITE_E2E === "1") {
    // The WDIO frontend bridge initializes asynchronously. Rendering must not
    // wait for it, otherwise a slow bridge startup leaves the native window
    // blank and the test runner cannot even reach the login screen.
    void import("@wdio/tauri-plugin").catch((error) => {
      console.error("[e2e] failed to initialize the WDIO frontend bridge", error);
    });
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrapApplication();
