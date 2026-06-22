# تقرير حالات الفشل

**التاريخ:** 2026-06-22T15:37:43.370Z

**الحالة:** FAIL

**إجمالي السيناريوهات:** 23
**الناجحة:** 9
**الفاشلة:** 14
**الجزئية:** 0

## حالة جميع السيناريوهات

### S01: S01: Cash car purchase — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S05: S05: Cash sale after cash purchase — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S08: S08: Cash sale with car expense — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S09: S09: Cash sale at loss — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S10: S10: Installment - after down payment — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S11: S11: Installment - after one installment — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S12: S12: Installment - after all payments — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S22: S22: General expense — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S23: S23: General expense after car profit — ناجح

- ORACLE: ناجح
- BACKEND_DB: ناجح
- CHROMIUM_UI: ناجح

### S63: الدوال القرائية لا تكتب — فشل

### A: بيع سيارة كاش (شراء ثم بيع) — فشل

### B: B1: Installment - After Down Payment — فشل

### C: C: General Expense — فشل

### S53: حذف سيارة متوفرة — فشل

### S54: حذف سيارة مبيوعة كاش — فشل

### S25: حذف مصروف عام — فشل

### S56: حالة الشركة بعد عمليات مختلطة — فشل

### S59: بطاقة الربح = توزيع الأرباح — فشل

### S60: فصل العملات — IQD و USD — فشل

### S61: مصروف عام بالدولار — فشل

### S47: إيداع الشركاء — فشل

### S49: منع إنشاء شريك ثالث — فشل

### S50: منع حذف شريك — فشل
