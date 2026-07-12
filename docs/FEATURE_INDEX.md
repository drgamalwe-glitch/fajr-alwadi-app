# FEATURE INDEX — فهرس الميزات

> **ملاحظة تحديث إعادة التدقيق (2026-07-11):** يربط كل ميزة بالملفات والأوامر والجداول والاختبارات.

## 1. السيارات (Cars)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| إضافة سيارة | `CarsTab.tsx`, `CarFormPanel.tsx`, `legacy.rs::add_car` | `add_car` | cars, car_partners, car_expenses, financial_ledger, partner_transactions | `test_critical_1_car_expense_rejects_chassis_car_number_mismatch` |
| بيع سيارة متوفرة | `CarsTab.tsx`, `legacy.rs::sell_car_with_accounting` | `sell_car_with_accounting` | cars, financial_ledger, partner_transactions, cash_register | — |
| بيع سيارة جديدة مباشرة | `CarsTab.tsx`, `legacy.rs::save_and_sell_car_with_accounting` | `save_and_sell_car_with_accounting` | cars, financial_ledger, partner_transactions, cash_register | `save_and_sell_car_with_accounting call shape includes sessionToken field` |
| تعديل سيارة مبيوعة | `CarsTab.tsx`, `legacy.rs::update_sold_car_with_accounting` | `update_sold_car_with_accounting` | cars, financial_ledger | — |
| حذف سيارة | `legacy.rs::delete_car` | `delete_car` | cars, car_partners, car_expenses (restrict via v36 trigger), financial_ledger | — |
| قائمة السيارات | `CarsTab.tsx`, `legacy.rs::get_cars` | `get_cars` | cars | — |

## 2. مصروفات السيارة (Car Expenses)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| إضافة/حذف مصروفات سيارة | `CarFormPanel.tsx`, `legacy.rs::apply_car_expense_changes` | `apply_car_expense_changes` | car_expenses, financial_ledger, partner_transactions | `test_critical_1_*`, `test_critical_2_*` |
| قائمة مصروفات سيارة | `legacy.rs::get_car_expense_records` | `get_car_expense_records` | car_expenses | — |

## 3. الشركاء (Partners)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| إضافة شريك | `PartnersTab.tsx`, `legacy.rs::add_partner` | `add_partner` | partners | — |
| تعديل/حذف شريك | `PartnersTab.tsx`, `legacy.rs::update_partner/delete_partner` | `update_partner`, `delete_partner` | partners, partner_transactions (cascade) | — |
| حركة شريك | `PartnersTab.tsx`, `legacy.rs::add_partner_transaction` | `add_partner_transaction` | partner_transactions, financial_ledger | IDEMPOTENCY-1 test |
| توزيع 50/50 | `legacy.rs::distribute_to_partners_50_with_effects`, `split_partner_amount_50_by_currency` | (داخلية) | partner_transactions | `test_critical_4_*` (4 اختبارات) |
| سداد ممول من الشركاء | `legacy.rs::pay_financier_from_partners` | `pay_financier_from_partners` | partner_transactions, financial_ledger | — |
| تسوية شركة عبر ممول | `legacy.rs::settle_company_through_funder` | `settle_company_through_funder` | partner_transactions, financial_ledger | — |

## 4. الوكالات (Agencies)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| إضافة وكالة | `AgenciesTab.tsx`, `legacy.rs::add_agency` | `add_agency` | agencies, agency_transactions, financial_ledger, partner_transactions | — |
| تعديل/حذف وكالة | `AgenciesTab.tsx`, `legacy.rs::update_agency/delete_agency` | `update_agency`, `delete_agency` | agencies, agency_transactions (cascade) | — |
| تحصيل وكالة | `legacy.rs::add_agency_transaction` | `add_agency_transaction` | agency_transactions, financial_ledger, partner_transactions | — |
| حالة التحصيل | `legacy.rs::set_agency_receivable_status` | `set_agency_receivable_status` | agencies | — |
| الإيراد المؤجل | `legacy.rs::calculate_deferred_revenue_from_unrecognized_profit` | (داخلية) | financial_ledger | `test_agency_cash_vs_credit` (script) |

## 5. الأقساط (Installments)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| سداد قسط | `legacy.rs::pay_customer_installment` | `pay_customer_installment` | partner_transactions, financial_ledger, customer_installment_schedule | `check_installment_profit.py` (script) |
| عكس دفعة | `legacy.rs::reverse_customer_installment_payment` | `reverse_customer_installment_payment` | partner_transactions, financial_ledger | — |
| معاينة إعادة التوزيع | `legacy.rs::preview_installment_payment_redistribution` | `preview_installment_payment_redistribution` | (read-only) | — |
| إعادة حساب الجدول | `legacy.rs::recalculate_installment_schedule` | `recalculate_installment_schedule` | customer_installment_schedule | — |
| تحديث المقدمة | `legacy.rs::update_customer_sale_down_payment` | `update_customer_sale_down_payment` | cars, financial_ledger, partner_transactions | — |
| حالة القسط | `legacy.rs::set_customer_installment_status` | `set_customer_installment_status` | customer_installment_schedule | — |

## 6. المصروفات العامة (Expenses)

| الميزة | الملفات | الأوامر | الجداول |
|---|---|---|---|
| إضافة مصروف عام | `ExpensesTab.tsx`, `legacy.rs::add_expense` | `add_expense` | expenses, financial_ledger, partner_transactions |
| تعديل/حذف | `legacy.rs::update_expense/delete_expense` | `update_expense`, `delete_expense` | expenses, financial_ledger |
| القائمة | `legacy.rs::get_expenses` | `get_expenses` | expenses |

## 7. المستخدمون والجلسات (Users & Sessions)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| تسجيل الدخول | `LoginScreen.tsx`, `legacy.rs::login` | `login` | users, sessions | `test_init_db_bootstraps_primary_admin_*` |
| تسجيل الخروج | `legacy.rs::logout` | `logout` | sessions | — |
| إدارة المستخدمين | `UsersTab.tsx`, `legacy.rs::get_users/add_user/update_user/delete_user` | `get_users`, `add_user`, `update_user`, `delete_user` | users | — |
| تغيير كلمة المرور | `legacy.rs::change_password` | `change_password` | users | — |
| التحقق من الجلسة | `legacy.rs::require_admin_session` | (داخلية) | sessions, users | `test_admin_session_survives_primary_admin_username_change` |

## 8. التقارير (Reports)

| الميزة | الملفات | الأوامر | الجداول | الاختبارات |
|---|---|---|---|---|
| الملخص المالي | `Dashboard.tsx`, `legacy.rs::get_financial_summary` | `get_financial_summary` | financial_ledger, partner_transactions, expenses | — |
| حالة الشركة | `CompanyStatusTab.tsx`, `legacy.rs::get_company_status` | `get_company_status` | financial_ledger, partner_transactions, partners | `test_critical_3_get_company_status_does_not_call_sibling_command` |
| الذمم الموحدة | `legacy.rs::get_unified_accounts` | `get_unified_accounts` | partners, partner_transactions | — |
| توزيع الأرباح | `ProfitDistributionTab.tsx`, `legacy.rs::get_profit_distribution_summary` | `get_profit_distribution_summary` | partner_transactions, cars | — |
| الكاش | `CashRegisterTab.tsx`, `legacy.rs::get_cash_register_entries` | `get_cash_register_entries` | cash_register, partner_transactions | — |
| الحسابات المالية | `FinancialAccountsTab.tsx`, `legacy.rs::get_unified_accounts` | `get_unified_accounts` | partners, partner_transactions | — |
| الحركات المالية | `FinancialTransactionsTab.tsx` | (مدمج من عدة commands) | financial_ledger | — |

## 9. البنية التحتية (Infrastructure)

| الميزة | الملفات | الأوامر | الجداول |
|---|---|---|---|
| النسخ الاحتياطي | `legacy.rs::run_backup_loop` | (داخلية) | (نسخة من ملف DB) |
| الاستعادة | `legacy.rs::restore_from_backup` | `restore_from_backup` | (استبدال ملف DB) |
| تصدير Excel | `legacy.rs::export_database_to_excel` | `export_database_to_excel` | (read-only) |
| فتح PDF | `legacy.rs::open_temp_pdf` | `open_temp_pdf` | — |
| فتح واتساب | `legacy.rs::open_whatsapp` | `open_whatsapp` | — |
| إدارة الخلفيات | `legacy.rs::rename_background/delete_background/get_backgrounds/get_selected_background/set_selected_background` | نفسها | (ملفات) |

## 10. الطباعة والتصدير

| الميزة | الملفات |
|---|---|
| كشف حساب شريك PDF | `src/pdf/PartnerStatementPDF.tsx`, `src/pdf/printStatement.ts` |
| أنماط PDF | `src/pdf/pdfStyles.ts` |

## 11. الإعدادات والثيم

| الميزة | الملفات |
|---|---|
| الثيم | `src/theme/` (tokens, ui, glass, *.css) |
| الإصدار | `src/version.ts` |
| الثوابت | `src/constants.ts` |
| الأنواع | `src/types.ts` |
