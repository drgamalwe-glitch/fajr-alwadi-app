# مصفوفة التغطية — اختبارات المحاسبة

**التاريخ:** 2026-06-22T15:37:43.916Z

## ملخص

- إجمالي السيناريوهات: 71
- مُنفذ: 20
- مخطط: 51
- نسبة التغطية: 28%

## مصفوفة التغطية

| المعرف | المجموعة | الاسم | ORACLE | BACKEND_DB | CHROMIUM_UI | الحالة |
|---|---|---|---|---|---|---|
| S01 | CAR_PURCHASE | شراء سيارة كاش | ✅ | ✅ | ✅ | مُنفذ |
| S02 | CAR_PURCHASE | شراء سيارة بالتمويل | ❌ | ❌ | ❌ | مخطط |
| S03 | CAR_PURCHASE | شراء سيارة عن طريق شركة | ❌ | ❌ | ❌ | مخطط |
| S04 | CAR_PURCHASE | شراء سيارة بالدولار | ❌ | ❌ | ❌ | مخطط |
| S05 | CASH_SALES | بيع كاش بعد شراء كاش | ✅ | ✅ | ✅ | مُنفذ |
| S06 | CASH_SALES | بيع كاش بعد شراء بالتمويل | ❌ | ❌ | ❌ | مخطط |
| S07 | CASH_SALES | بيع كاش بعد شراء عن طريق شركة | ❌ | ❌ | ❌ | مخطط |
| S08 | CASH_SALES | بيع كاش مع مصروف سيارة | ✅ | ✅ | ❌ | مُنفذ |
| S09 | CASH_SALES | بيع كاش بخسارة | ✅ | ✅ | ❌ | مُنفذ |
| S10 | INSTALLMENTS | بيع بالاقساط — بعد المقدمة | ✅ | ✅ | ❌ | مُنفذ |
| S11 | INSTALLMENTS | بيع بالاقساط — بعد قسط واحد | ✅ | ✅ | ❌ | مُنفذ |
| S12 | INSTALLMENTS | بيع بالاقساط — بعد كل الدفعات | ✅ | ✅ | ❌ | مُنفذ |
| S13 | INSTALLMENTS | دفع زائد في الاقساط | ❌ | ❌ | ❌ | مخطط |
| S14 | INSTALLMENTS | إقفال القسط الأخير | ❌ | ❌ | ❌ | مخطط |
| S15 | INSTALLMENTS | اقساط مع مصروف سيارة | ❌ | ❌ | ❌ | مخطط |
| S16 | TERM_SALES | بيع بمدة — مع مقدمة | ❌ | ❌ | ❌ | مخطط |
| S17 | TERM_SALES | بيع بمدة — الدفعة الأخيرة | ❌ | ❌ | ❌ | مخطط |
| S18 | CAR_EXPENSES | مصروف سيارة قبل البيع | ❌ | ❌ | ❌ | مخطط |
| S19 | CAR_EXPENSES | مصروف سيارة بعد البيع | ❌ | ❌ | ❌ | مخطط |
| S20 | CAR_EXPENSES | تعديل مصروف سيارة | ❌ | ❌ | ❌ | مخطط |
| S21 | CAR_EXPENSES | حذف مصروف سيارة | ❌ | ❌ | ❌ | مخطط |
| S22 | GENERAL_EXPENSES | مصروف عام | ✅ | ✅ | ✅ | مُنفذ |
| S23 | GENERAL_EXPENSES | مصروف عام بعد ربح سيارة | ✅ | ✅ | ❌ | مُنفذ |
| S24 | GENERAL_EXPENSES | تعديل مصروف عام | ❌ | ❌ | ❌ | مخطط |
| S25 | GENERAL_EXPENSES | حذف مصروف عام | ❌ | ✅ | ❌ | مُنفذ |
| S26 | INVESTORS | إيداع مستثمر | ❌ | ❌ | ❌ | مخطط |
| S27 | INVESTORS | سحب مستثمر | ❌ | ❌ | ❌ | مخطط |
| S28 | INVESTORS | مستثمر + شراء سيارة | ❌ | ❌ | ❌ | مخطط |
| S29 | INVESTORS | حذف مستثمر برصيد | ❌ | ❌ | ❌ | مخطط |
| S30 | FUNDERS | تمويل ممول | ❌ | ❌ | ❌ | مخطط |
| S31 | FUNDERS | سداد ممول | ❌ | ❌ | ❌ | مخطط |
| S32 | FUNDERS | سداد جزئي لممول | ❌ | ❌ | ❌ | مخطط |
| S33 | FUNDERS | سداد ممول مع عمولة | ❌ | ❌ | ❌ | مخطط |
| S34 | FUNDERS | حذف ممول برصيد | ❌ | ❌ | ❌ | مخطط |
| S35 | COMPANIES | شراء عن طريق شركة | ❌ | ❌ | ❌ | مخطط |
| S36 | COMPANIES | سداد شركة | ❌ | ❌ | ❌ | مخطط |
| S37 | COMPANIES | سداد جزئي لشركة | ❌ | ❌ | ❌ | مخطط |
| S38 | COMPANIES | حذف شركة برصيد | ❌ | ❌ | ❌ | مخطط |
| S39 | AGENCIES | ربح وكالة بالدينار | ❌ | ❌ | ❌ | مخطط |
| S40 | AGENCIES | ربح وكالة بالدولار | ❌ | ❌ | ❌ | مخطط |
| S41 | AGENCIES | وكالتان بنفس الاسم والتاريخ | ❌ | ❌ | ❌ | مخطط |
| S42 | AGENCIES | حذف معاملة وكالة واحدة | ❌ | ❌ | ❌ | مخطط |
| S43 | CUSTOMERS | رصيد الزبون بعد الاقساط | ❌ | ❌ | ❌ | مخطط |
| S44 | CUSTOMERS | الزبون يدفع قسطاً | ❌ | ❌ | ❌ | مخطط |
| S45 | CUSTOMERS | الزبون يدفع كل الاقساط | ❌ | ❌ | ❌ | مخطط |
| S46 | CUSTOMERS | طباعة كشف حساب زبون | ❌ | ❌ | ❌ | مخطط |
| S47 | PARTNERS | إيداع الشركاء | ✅ | ✅ | ❌ | مُنفذ |
| S48 | PARTNERS | سحب شريك | ❌ | ❌ | ❌ | مخطط |
| S49 | PARTNERS | منع شريك ثالث | ✅ | ✅ | ❌ | مُنفذ |
| S50 | PARTNERS | منع حذف شريك | ✅ | ✅ | ❌ | مُنفذ |
| S51 | DELETE_EDIT | تعديل شراء سيارة متوفرة | ❌ | ❌ | ❌ | مخطط |
| S52 | DELETE_EDIT | تعديل سعر بيع سيارة مبيوعة | ❌ | ❌ | ❌ | مخطط |
| S53 | DELETE_EDIT | حذف سيارة متوفرة | ❌ | ✅ | ❌ | مُنفذ |
| S54 | DELETE_EDIT | حذف سيارة مبيوعة كاش | ❌ | ✅ | ❌ | مُنفذ |
| S55 | DELETE_EDIT | حذف سيارة مبيوعة بالاقساط | ❌ | ❌ | ❌ | مخطط |
| S56 | DASHBOARD | حالة الشركة — عمليات مختلطة | ✅ | ✅ | ✅ | مُنفذ |
| S57 | DASHBOARD | قاصة = بطاقة القاصة | ❌ | ❌ | ❌ | مخطط |
| S58 | DASHBOARD | الكاش = بطاقة رأس المال | ❌ | ❌ | ❌ | مخطط |
| S59 | DASHBOARD | الربح = بطاقة الربح | ✅ | ✅ | ❌ | مُنفذ |
| S60 | CURRENCY | فصل الدينار والدولار | ❌ | ✅ | ❌ | مُنفذ |
| S61 | CURRENCY | مصروف عام بالدولار | ❌ | ✅ | ❌ | مُنفذ |
| S62 | CURRENCY | منع خلط العملات | ❌ | ❌ | ❌ | مخطط |
| S63 | READ_ONLY | أمان الدوال القرائية | ✅ | ✅ | ❌ | مُنفذ |
| S64 | PRINT | طباعة كشف حساب شريك | ❌ | ❌ | ❌ | مخطط |
| S65 | PRINT | طباعة كشف حساب زبون | ❌ | ❌ | ❌ | مخطط |
| S66 | PRINT | تصدير قاعدة البيانات | ❌ | ❌ | ❌ | مخطط |
| S67 | FULL_FLOWS | دورة عمل كاش كاملة | ❌ | ❌ | ❌ | مخطط |
| S68 | FULL_FLOWS | دورة اقساط كاملة | ❌ | ❌ | ❌ | مخطط |
| S69 | FULL_FLOWS | دورة تمويل | ❌ | ❌ | ❌ | مخطط |
| S70 | FULL_FLOWS | دورة شركة | ❌ | ❌ | ❌ | مخطط |
| S71 | FULL_FLOWS | دورة مستثمر | ❌ | ❌ | ❌ | مخطط |

## السيناريوهات المُنفذة

### S01: شراء سيارة كاش

- **المجموعة:** CAR_PURCHASE
- **الاسم:** Cash car purchase
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** نعم

### S05: بيع كاش بعد شراء كاش

- **المجموعة:** CASH_SALES
- **الاسم:** Cash sale after cash purchase
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** نعم

### S08: بيع كاش مع مصروف سيارة

- **المجموعة:** CASH_SALES
- **الاسم:** Cash sale with car expense
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S09: بيع كاش بخسارة

- **المجموعة:** CASH_SALES
- **الاسم:** Cash sale at loss
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S10: بيع بالاقساط — بعد المقدمة

- **المجموعة:** INSTALLMENTS
- **الاسم:** Installment - after down payment
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S11: بيع بالاقساط — بعد قسط واحد

- **المجموعة:** INSTALLMENTS
- **الاسم:** Installment - after one installment
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S12: بيع بالاقساط — بعد كل الدفعات

- **المجموعة:** INSTALLMENTS
- **الاسم:** Installment - after all payments
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S22: مصروف عام

- **المجموعة:** GENERAL_EXPENSES
- **الاسم:** General expense
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** نعم

### S23: مصروف عام بعد ربح سيارة

- **المجموعة:** GENERAL_EXPENSES
- **الاسم:** General expense after car profit
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S25: حذف مصروف عام

- **المجموعة:** GENERAL_EXPENSES
- **الاسم:** Delete general expense
- **ORACLE:** لا
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S47: إيداع الشركاء

- **المجموعة:** PARTNERS
- **الاسم:** Partner deposits
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S49: منع شريك ثالث

- **المجموعة:** PARTNERS
- **الاسم:** Block third partner
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S50: منع حذف شريك

- **المجموعة:** PARTNERS
- **الاسم:** Block partner deletion
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S53: حذف سيارة متوفرة

- **المجموعة:** DELETE_EDIT
- **الاسم:** Delete available car
- **ORACLE:** لا
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S54: حذف سيارة مبيوعة كاش

- **المجموعة:** DELETE_EDIT
- **الاسم:** Delete sold cash car
- **ORACLE:** لا
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S56: حالة الشركة — عمليات مختلطة

- **المجموعة:** DASHBOARD
- **الاسم:** Company status mixed ops
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** نعم

### S59: الربح = بطاقة الربح

- **المجموعة:** DASHBOARD
- **الاسم:** Profit tab = profit card
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S60: فصل الدينار والدولار

- **المجموعة:** CURRENCY
- **الاسم:** IQD/USD separation
- **ORACLE:** لا
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S61: مصروف عام بالدولار

- **المجموعة:** CURRENCY
- **الاسم:** USD general expense
- **ORACLE:** لا
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا

### S63: أمان الدوال القرائية

- **المجموعة:** READ_ONLY
- **الاسم:** Read-only safety
- **ORACLE:** نعم
- **BACKEND_DB:** نعم
- **CHROMIUM_UI:** لا


## السيناريوهات المخطط لها

- **S02:** شراء سيارة بالتمويل (CAR_PURCHASE)
- **S03:** شراء سيارة عن طريق شركة (CAR_PURCHASE)
- **S04:** شراء سيارة بالدولار (CAR_PURCHASE)
- **S06:** بيع كاش بعد شراء بالتمويل (CASH_SALES)
- **S07:** بيع كاش بعد شراء عن طريق شركة (CASH_SALES)
- **S13:** دفع زائد في الاقساط (INSTALLMENTS)
- **S14:** إقفال القسط الأخير (INSTALLMENTS)
- **S15:** اقساط مع مصروف سيارة (INSTALLMENTS)
- **S16:** بيع بمدة — مع مقدمة (TERM_SALES)
- **S17:** بيع بمدة — الدفعة الأخيرة (TERM_SALES)
- **S18:** مصروف سيارة قبل البيع (CAR_EXPENSES)
- **S19:** مصروف سيارة بعد البيع (CAR_EXPENSES)
- **S20:** تعديل مصروف سيارة (CAR_EXPENSES)
- **S21:** حذف مصروف سيارة (CAR_EXPENSES)
- **S24:** تعديل مصروف عام (GENERAL_EXPENSES)
- **S26:** إيداع مستثمر (INVESTORS)
- **S27:** سحب مستثمر (INVESTORS)
- **S28:** مستثمر + شراء سيارة (INVESTORS)
- **S29:** حذف مستثمر برصيد (INVESTORS)
- **S30:** تمويل ممول (FUNDERS)
- **S31:** سداد ممول (FUNDERS)
- **S32:** سداد جزئي لممول (FUNDERS)
- **S33:** سداد ممول مع عمولة (FUNDERS)
- **S34:** حذف ممول برصيد (FUNDERS)
- **S35:** شراء عن طريق شركة (COMPANIES)
- **S36:** سداد شركة (COMPANIES)
- **S37:** سداد جزئي لشركة (COMPANIES)
- **S38:** حذف شركة برصيد (COMPANIES)
- **S39:** ربح وكالة بالدينار (AGENCIES)
- **S40:** ربح وكالة بالدولار (AGENCIES)
- **S41:** وكالتان بنفس الاسم والتاريخ (AGENCIES)
- **S42:** حذف معاملة وكالة واحدة (AGENCIES)
- **S43:** رصيد الزبون بعد الاقساط (CUSTOMERS)
- **S44:** الزبون يدفع قسطاً (CUSTOMERS)
- **S45:** الزبون يدفع كل الاقساط (CUSTOMERS)
- **S46:** طباعة كشف حساب زبون (CUSTOMERS)
- **S48:** سحب شريك (PARTNERS)
- **S51:** تعديل شراء سيارة متوفرة (DELETE_EDIT)
- **S52:** تعديل سعر بيع سيارة مبيوعة (DELETE_EDIT)
- **S55:** حذف سيارة مبيوعة بالاقساط (DELETE_EDIT)
- **S57:** قاصة = بطاقة القاصة (DASHBOARD)
- **S58:** الكاش = بطاقة رأس المال (DASHBOARD)
- **S62:** منع خلط العملات (CURRENCY)
- **S64:** طباعة كشف حساب شريك (PRINT)
- **S65:** طباعة كشف حساب زبون (PRINT)
- **S66:** تصدير قاعدة البيانات (PRINT)
- **S67:** دورة عمل كاش كاملة (FULL_FLOWS)
- **S68:** دورة اقساط كاملة (FULL_FLOWS)
- **S69:** دورة تمويل (FULL_FLOWS)
- **S70:** دورة شركة (FULL_FLOWS)
- **S71:** دورة مستثمر (FULL_FLOWS)