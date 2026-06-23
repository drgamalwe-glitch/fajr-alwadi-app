# نتائج اختبارات المحاسبة — فجر الوادي

**التاريخ:** 2026-06-23T04:47:47.907Z

**وضع الخلفية:** E2E_BRIDGE (ليس Tauri الحقيقي — محاكاة Node.js فقط)

**النتيجة النهائية:** فشل

| السيناريو | النتيجة |
|---|---|
| S03: Company car purchase | ناجح |
| S04: USD cash car purchase | فشل |
| S06: Cash sale after funded purchase | ناجح |
| S07: Cash sale after company purchase | ناجح |
| S13: Installment overpayment | فشل |
| S14: Final installment exact close | ناجح |
| S15: Installment with car expense | فشل |
| S16: Term sale with down payment | ناجح |
| S17: Term sale final payment | ناجح |
| S18: Car expense before sale | ناجح |
| S19: Car expense after sale | فشل |
| S20: Edit car expense | ناجح |
| S21: Delete car expense | ناجح |
| S24: Edit general expense | فشل |
| S26: Investor deposit | فشل |
| S27: Investor withdrawal | فشل |
| S28: Investor + car purchase | فشل |
| S29: Delete investor with balance | فشل |
| S30: Funder financing | ناجح |
| S31: Funder repayment | فشل |
| S32: Partial funder repayment | فشل |
| S33: Funder repayment with commission | فشل |
| S34: Delete funder with balance | ناجح |
| S35: Company purchase | ناجح |
| S36: Company repayment | فشل |
| S37: Partial company repayment | فشل |
| S38: Delete company with balance | ناجح |
| S39: Agency profit IQD | ناجح |
| S40: Agency profit USD | ناجح |
| S41: Two agencies same names/date | ناجح |
| S42: Delete one agency transaction | فشل |
| S43: Customer balance after installment | ناجح |
| S44: Customer pays one installment | ناجح |
| S45: Customer pays all installments | ناجح |
| S46: Print customer statement | ناجح |
| S48: Partner withdrawal | ناجح |
| S51: Edit available car purchase | فشل |
| S52: Edit sold car sale price | ناجح |
| S55: Delete sold installment car | فشل |
| S57: Qasa tab = Qasa card | ناجح |
| S58: Cash tab = partner cash card | ناجح |
| S62: Mixed currency blocked | ناجح |
| S64: Print partner statement | ناجح |
| S65: Print customer statement | ناجح |
| S66: Export database | ناجح |
| S67: Full cash business cycle | ناجح |
| S68: Full installment cycle | ناجح |
| S69: Funder cycle | فشل |
| S70: Company cycle | فشل |
| S71: Investor cycle | فشل |

- إجمالي السيناريوهات: 50
- ناجح: 30
- فشل: 20

### أسباب الفشل

- **S04 / BACKEND_DB:** inventory_usd: expected 10000, got 0
- **S13 / BACKEND_DB:** profit cap: expected 10000000, got 10500000 (diff 500000); profit 10500000 exceeded cap 10,000,000; totalProfit: expected 10000000, got 10500000 (diff 500000)
- **S15 / BACKEND_DB:** profit with car expense: expected 2400000, got 2900000 (diff 500000); qasa: expected -4000000, got -6000000 (diff 2000000)
- **S19 / BACKEND_DB:** qasa after expense: expected 6000000, got 7000000 (diff 1000000)
- **S24 / BACKEND_DB:** qasa after edit: expected -2000000, got -1000000 (diff 1000000)
- **S26 / BACKEND_DB:** investments: expected 10000000, got 0 (diff 10000000)
- **S27 / BACKEND_DB:** investments: expected 6000000, got 0 (diff 6000000)
- **S28 / BACKEND_DB:** investments: expected 20000000, got 0 (diff 20000000)
- **S29 / BACKEND_DB:** investments before: expected 5000000, got 0 (diff 5000000)
- **S31 / BACKEND_DB:** qasa: expected -10000000, got 0 (diff 10000000); partnerCash: expected -10000000, got 0 (diff 10000000)
- **S32 / BACKEND_DB:** qasa: expected -4000000, got 0 (diff 4000000); partnerCash: expected -4000000, got 0 (diff 4000000)
- **S33 / BACKEND_DB:** qasa: expected -10500000, got 0 (diff 10500000); partnerCash: expected -10500000, got 0 (diff 10500000)
- **S36 / BACKEND_DB:** qasa: expected -10000000, got 0 (diff 10000000); partnerCash: expected -10000000, got 0 (diff 10000000)
- **S37 / BACKEND_DB:** qasa: expected -3000000, got 0 (diff 3000000); partnerCash: expected -3000000, got 0 (diff 3000000)
- **S42 / BACKEND_DB:** one agency remains: expected 1, got 0
- **S51 / BACKEND_DB:** qasa after edit: expected -15000000, got -10000000 (diff 5000000)
- **S55 / BACKEND_DB:** qasa after delete: expected 0, got 1000000; profit after delete: expected 0, got 500000
- **S69 / BACKEND_DB:** qasa: expected 8000000, got 18000000 (diff 10000000)
- **S70 / BACKEND_DB:** qasa: expected 8000000, got 18000000 (diff 10000000)
- **S71 / BACKEND_DB:** investments: expected 20000000, got 0 (diff 20000000)
