#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
"""
سكربت التدقيق والتحقق المحاسبي النهائي لبرنامج فجر الوادي.
الملف الثالث: accounting_tests/3_verify_project.py
"""

import argparse
import sys
import sqlite3
from decimal import Decimal
from pathlib import Path

# إضافة المجلد الحالي للمسار لاستيراد الملفات ذات الأسماء الرقمية
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent))

import importlib
seed_scenarios = importlib.import_module("1_seed_scenarios")
seed_everything = seed_scenarios.seed_everything

expected_accounting = importlib.import_module("2_expected_accounting")
calculate_expected_accounting = expected_accounting.calculate_expected_accounting
get_decimal = expected_accounting.get_decimal

class AuditFailure(Exception):
    pass

def run_verification(db_path: Path, strict: bool = False, only_errors: bool = False, save_report: bool = False) -> int:
    """تشغيل الفحوصات المحاسبية وكتابة التقرير"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. احتساب القيم المتوقعة
    expected_data = calculate_expected_accounting(str(db_path))
    exp_balances = expected_data["expected_balances"]
    exp_partner_balances = expected_data["expected_partner_balances"]
    exp_car_results = expected_data["expected_car_results"]
    exp_customer_results = expected_data["expected_customer_results"]
    exp_summary = expected_data["expected_summary"]

    # كتل التقارير والأخطاء
    failed_checks = []
    total_checks_run = 0
    passed_checks_count = 0
    
    # دالة مساعدة لتسجيل الفشل
    def log_failure(check_num: int, title: str, expected, actual, diff, source: str, cause: str):
        err = {
            "check": check_num,
            "title": title,
            "expected": expected,
            "actual": actual,
            "diff": diff,
            "source": source,
            "cause": cause
        }
        failed_checks.append(err)
        if not only_errors:
            print(f"❌ FAIL Check {check_num}: {title}")
            print(f"   المتوقع: {expected}")
            print(f"   الفعلي: {actual}")
            print(f"   الفرق: {diff}")
            print(f"   المصدر: {source}")
            print(f"   السبب المحتمل: {cause}\n")

    print("🔍 البدء في تدقيق المعاملات المالية وقاعدة البيانات...\n")

    # ----------------------------------------------------
    # الفحص 1: توازن القيود المحاسبية SUM(debit) == SUM(credit)
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute(
        """
        SELECT 
            reference_type, 
            CASE 
                WHEN reference_type = 'expense' AND type_ IN ('مصروف سيارة', 'دفع مصروف سيارة') THEN 'car_expense'
                WHEN reference_type = 'expense' THEN 'general_expense'
                ELSE 'other'
            END as expense_sub_type,
            reference_id, 
            currency, 
            SUM(debit) as deb, 
            SUM(credit) as cred 
        FROM financial_ledger 
        GROUP BY reference_type, expense_sub_type, reference_id, currency
        """
    )
    ledger_groups = cursor.fetchall()
    f1_passed = True
    for gp in ledger_groups:
        deb = get_decimal(gp["deb"])
        cred = get_decimal(gp["cred"])
        if abs(deb - cred) > Decimal("0.0"):
            f1_passed = False
            desc_type = f"{gp['reference_type']} ({gp['expense_sub_type']})" if gp['reference_type'] == 'expense' else gp['reference_type']
            log_failure(
                1,
                f"عدم توازن القيد لـ {desc_type} ({gp['reference_id']}) - {gp['currency']}",
                f"Debit {deb} == Credit {cred}",
                f"Debit {deb} != Credit {cred}",
                abs(deb - cred),
                "financial_ledger",
                "قيد مزدوج غير متوازن في الدفتر المالي (المدين لا يساوي الدائن)"
            )
    if f1_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 1: جميع قيود الدفتر المالي متوازنة تماماً.")

    # ----------------------------------------------------
    # الفحص 2: منع القيود المكررة غير المبررة
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute(
        """
        SELECT reference_type, reference_id, account_type, account_id, type_, currency, debit, credit, COUNT(*) as cnt
        FROM financial_ledger
        GROUP BY reference_type, reference_id, account_type, account_id, type_, currency, debit, credit
        HAVING cnt > 1
        """
    )
    duplicates = cursor.fetchall()
    if duplicates:
        for dp in duplicates:
            log_failure(
                2,
                f"قيد مكرر لـ {dp['reference_type']} ({dp['reference_id']}) - {dp['account_type']}",
                "قيد فريد واحد",
                f"مكرر {dp['cnt']} مرات",
                dp['cnt'] - 1,
                "financial_ledger",
                "تكرار إدخال القيد نفسه في الدفتر المالي نتيجة لخلل في معالجة التحديث أو الحفظ"
            )
    else:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 2: لا يوجد قيود مكررة غير مبررة.")

    # ----------------------------------------------------
    # الفحص 3: مطابقة أرصدة الحسابات العامة بالكامل
    # ----------------------------------------------------
    total_checks_run += 1
    # جلب الأرصدة الفعلية من دفتر الأستاذ المالي
    cursor.execute(
        """
        SELECT account_type, account_id, currency, SUM(debit) as deb, SUM(credit) as cred
        FROM financial_ledger
        GROUP BY account_type, account_id, currency
        """
    )
    actual_balances = cursor.fetchall()
    act_bal_dict = {}
    for ab in actual_balances:
        a_type = ab["account_type"]
        a_id = ab["account_id"] or "قاصه"
        curr = ab["currency"]
        deb = get_decimal(ab["deb"])
        cred = get_decimal(ab["cred"])
        
        # حسب طبيعة الحساب (مدين أو دائن)
        if a_type in ["cash", "inventory", "receivable", "drawings", "expense", "profit_distribution"]:
            balance = deb - cred
        else: # capital, revenue, investor, funder, payable
            balance = cred - deb
            
        act_bal_dict[(a_type, a_id, curr)] = balance

    f3_passed = True
    # مطابقة الحسابات المتوقعة مع الفعلية
    all_keys = set(exp_balances.keys()).union(act_bal_dict.keys())
    for key in all_keys:
        a_type, a_id, curr = key
        
        # استثناء الحسابات الخاصة بعمليات الحذف أو الحسابات اللحظية للنظام
        if a_type == "system" or a_id == "deletion":
            continue
            
        exp_val = exp_balances.get(key, Decimal("0.0"))
        act_val = act_bal_dict.get(key, Decimal("0.0"))
        
        # لبيانات التدقيق [PY_AUDIT] أو التدقيق العام
        if abs(exp_val - act_val) > Decimal("0.0"):
            f3_passed = False
            log_failure(
                3,
                f"اختلاف الرصيد للحساب العام {a_type} / {a_id} / {curr}",
                exp_val,
                act_val,
                abs(exp_val - act_val),
                "financial_ledger",
                "عدم تطابق رصيد الحساب المحتسب بالدفتر المالي مع حركة المستندات الخام"
            )
    if f3_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 3: أرصدة الدفتر المالي مطابقة تماماً للمستندات الخام.")

    # ----------------------------------------------------
    # الفحص 4: مطابقة أرصدة الكاش (cash) لكل عملة
    # ----------------------------------------------------
    total_checks_run += 1
    f4_passed = True
    for curr in ["IQD", "USD"]:
        exp_cash = exp_summary[f"cash_{curr.lower()}"]
        
        # الفعلي من الدفتر المالي للحساب cash
        actual_cash = Decimal("0.0")
        for k, v in act_bal_dict.items():
            if k[0] == "cash" and k[2] == curr:
                actual_cash += v
                
        if abs(exp_cash - actual_cash) > Decimal("0.0"):
            f4_passed = False
            log_failure(
                4,
                f"اختلاف نقدية الصندوق (الكاش) لعملة {curr}",
                exp_cash,
                actual_cash,
                abs(exp_cash - actual_cash),
                "financial_ledger (cash)",
                "اختلاف الصندوق النقدي نتيجة لعدم تسجيل مقبوضات أو مدفوعات نقدية في الدفتر"
            )
    if f4_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 4: مطابقة أرصدة الصندوق النقدي (الكاش) ناجحة.")

    # ----------------------------------------------------
    # الفحص 5: مطابقة المخزون (inventory) للسيارات
    # ----------------------------------------------------
    total_checks_run += 1
    f5_passed = True
    for key, val in exp_car_results.items():
        curr = val["currency"]
        status = val["status"]
        
        # الرصيد المتوقع في المخزون
        exp_inv = val["cost"] if status == "متوفرة" else Decimal("0.0")
        
        # الرصيد الفعلي من الدفتر المالي للمخزون للسيارة
        act_inv = act_bal_dict.get(("inventory", key, curr), Decimal("0.0"))
        
        if abs(exp_inv - act_inv) > Decimal("0.0"):
            f5_passed = False
            log_failure(
                5,
                f"اختلاف قيمة مخزون السيارة {key} ({curr})",
                exp_inv,
                act_inv,
                abs(exp_inv - act_inv),
                "financial_ledger (inventory)",
                "عدم تخفيض المخزون عند البيع أو عدم رسملة المصروفات على السيارة بشكل صحيح"
            )
    if f5_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 5: مطابقة قيم المخزون للسيارات ناجحة.")

    # ----------------------------------------------------
    # الفحص 6: مطابقة المدينين (receivable) لكل زبون وعملة
    # ----------------------------------------------------
    total_checks_run += 1
    f6_passed = True
    for key, exp_rec in exp_customer_results.items():
        cust_name, curr = key
        
        act_rec = act_bal_dict.get(("receivable", cust_name, curr), Decimal("0.0"))
        
        if abs(exp_rec - act_rec) > Decimal("0.0"):
            f6_passed = False
            log_failure(
                6,
                f"اختلاف مديونية الزبون {cust_name} ({curr})",
                exp_rec,
                act_rec,
                abs(exp_rec - act_rec),
                "financial_ledger (receivable)",
                "عدم انعكاس الأقساط المسددة أو الديون الجديدة للزبون في الدفتر المالي"
            )
    if f6_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 6: مطابقة مديونيات الزبائن ناجحة.")

    # ----------------------------------------------------
    # الفحص 7: مطابقة المستثمرين (investor)
    # ----------------------------------------------------
    total_checks_run += 1
    f7_passed = True
    for key in all_keys:
        a_type, a_id, curr = key
        if a_type == "investor":
            exp_val = exp_balances.get(key, Decimal("0.0"))
            act_val = act_bal_dict.get(key, Decimal("0.0"))
            if abs(exp_val - act_val) > Decimal("0.0"):
                f7_passed = False
                log_failure(
                    7,
                    f"اختلاف رصيد المستثمر {a_id} ({curr})",
                    exp_val,
                    act_val,
                    abs(exp_val - act_val),
                    "financial_ledger (investor)",
                    "حركات إيداع أو سحب للمستثمر لم يتم تسجيلها أو ترحيلها بشكل صحيح"
                )
    if f7_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 7: مطابقة أرصدة المستثمرين ناجحة.")

    # ----------------------------------------------------
    # الفحص 8: مطابقة الممولين (funder)
    # ----------------------------------------------------
    total_checks_run += 1
    f8_passed = True
    for key in all_keys:
        a_type, a_id, curr = key
        if a_type == "funder":
            exp_val = exp_balances.get(key, Decimal("0.0"))
            act_val = act_bal_dict.get(key, Decimal("0.0"))
            if abs(exp_val - act_val) > Decimal("0.0"):
                f8_passed = False
                log_failure(
                    8,
                    f"اختلاف رصيد الممول {a_id} ({curr})",
                    exp_val,
                    act_val,
                    abs(exp_val - act_val),
                    "financial_ledger (funder)",
                    "عدم ترحيل التزام التمويل عند الشراء أو سداد التمويل للممول بالكامل"
                )
    if f8_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 8: مطابقة أرصدة الممولين ناجحة.")

    # ----------------------------------------------------
    # الفحص 9: مطابقة الشركات الدائنة (payable)
    # ----------------------------------------------------
    total_checks_run += 1
    f9_passed = True
    for key in all_keys:
        a_type, a_id, curr = key
        if a_type == "payable":
            exp_val = exp_balances.get(key, Decimal("0.0"))
            act_val = act_bal_dict.get(key, Decimal("0.0"))
            if abs(exp_val - act_val) > Decimal("0.0"):
                f9_passed = False
                log_failure(
                    9,
                    f"اختلاف رصيد الشركة الدائنة {a_id} ({curr})",
                    exp_val,
                    act_val,
                    abs(exp_val - act_val),
                    "financial_ledger (payable)",
                    "عدم ترحيل التزام الشراء من شركة أو سداد المستحقات للشركة"
                )
    if f9_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 9: مطابقة أرصدة الشركات ناجحة.")

    # ----------------------------------------------------
    # الفحص 10: مطابقة الإيرادات (revenue)
    # ----------------------------------------------------
    total_checks_run += 1
    f10_passed = True
    for key in all_keys:
        a_type, a_id, curr = key
        if a_type == "revenue":
            exp_val = exp_balances.get(key, Decimal("0.0"))
            act_val = act_bal_dict.get(key, Decimal("0.0"))
            if abs(exp_val - act_val) > Decimal("0.0"):
                f10_passed = False
                log_failure(
                    10,
                    f"اختلاف قيمة إيرادات المصدر {a_id} ({curr})",
                    exp_val,
                    act_val,
                    abs(exp_val - act_val),
                    "financial_ledger (revenue)",
                    "إيراد بيع سيارة أو إيرادات وكالات لم تُدرج بشكل صحيح بالدفتر المالي"
                )
    if f10_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 10: مطابقة قيم الإيرادات ناجحة.")

    # ----------------------------------------------------
    # الفحص 11: مطابقة المصروفات وتكلفة المبيعات (expense)
    # ----------------------------------------------------
    total_checks_run += 1
    f11_passed = True
    for key in all_keys:
        a_type, a_id, curr = key
        if a_type == "expense":
            exp_val = exp_balances.get(key, Decimal("0.0"))
            act_val = act_bal_dict.get(key, Decimal("0.0"))
            if abs(exp_val - act_val) > Decimal("0.0"):
                f11_passed = False
                log_failure(
                    11,
                    f"اختلاف قيمة مصروفات المصدر {a_id} ({curr})",
                    exp_val,
                    act_val,
                    abs(exp_val - act_val),
                    "financial_ledger (expense)",
                    "تكلفة مبيعات سيارة مبيوعة أو مصروف عام غير مدرج بالكامل"
                )
    if f11_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 11: مطابقة قيم المصروفات وتكلفة المبيعات ناجحة.")

    # ----------------------------------------------------
    # الفحص 12: مطابقة أرصدة رأس المال / المسحوبات / الشركاء في جدول partners
    # ----------------------------------------------------
    total_checks_run += 1
    f12_passed = True
    # جلب أرصدة الشركاء الحالية من جدول partners
    cursor.execute("SELECT partner_name, iqd_balance, usd_balance FROM partners WHERE kind = 'شريك'")
    act_partners = cursor.fetchall()
    
    for ap in act_partners:
        p_name = ap["partner_name"]
        for curr in ["IQD", "USD"]:
            exp_bal = exp_partner_balances.get((p_name, curr), Decimal("0.0"))
            act_bal = get_decimal(ap[f"{curr.lower()}_balance"])
            
            if abs(exp_bal - act_bal) > Decimal("0.0"):
                f12_passed = False
                log_failure(
                    12,
                    f"اختلاف الرصيد الإجمالي للشريك {p_name} لعملة {curr}",
                    exp_bal,
                    act_bal,
                    abs(exp_bal - act_bal),
                    "partners table balance",
                    "عدم توزيع الأرباح أو تكاليف الشراء والمصروفات على حساب الشريك بشكل متطابق"
                )
    if f12_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 12: مطابقة أرصدة الشركاء في جدول الحسابات ناجحة.")

    # ----------------------------------------------------
    # الفحص 13: مطابقة أرباح وتوزيع تكاليف السيارات
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute("SELECT * FROM cars WHERE status = 'مبيوعة'")
    sold_cars = cursor.fetchall()
    f13_passed = True
    
    for car in sold_cars:
        car_number = car["car_number"]
        name = car["car_name"]
        curr = car["currency"] or "IQD"
        s_curr = car["sale_currency"] or curr
        p_price = get_decimal(car["purchase_price"])
        s_price = get_decimal(car["selling_price"])
        pay_type = car["payment_type"] or "كاش"
        
        # جلب مصروفات السيارة
        cursor.execute("SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", (car_number,))
        exp_sum = get_decimal(cursor.fetchone()[0])
        total_cost = p_price + exp_sum
        profit = s_price - total_cost
        
        # نتحقق هل تم توزيع التكاليف والأرباح للشركاء (فقط للبيع الكاش)
        if pay_type == "كاش":
            # التكلفة 50/50
            cursor.execute(
                "SELECT COUNT(*) FROM partner_transactions WHERE notes LIKE ? AND type = 'ايداع بيع سيارة'",
                (f"%ايداع بيع سيارة {name.strip()}%",)
            )
            cost_split_count = cursor.fetchone()[0]
            if cost_split_count < 2:
                f13_passed = False
                log_failure(
                    13,
                    f"نقص توزيع تكاليف بيع السيارة {car_number}",
                    "توزيع التكلفة على الشريكين أمير ومنتصر بالتساوي",
                    f"وجد {cost_split_count} معاملات توزيع",
                    2 - cost_split_count,
                    "partner_transactions",
                    "لم يتم تحويل أو استرداد تكلفة السيارة لحسابات الشركاء 50/50 بعد البيع كاش"
                )
                
            # الأرباح 50/50 (إذا تطابقت العملة وكان هناك ربح)
            if curr == s_curr and profit > 0.0:
                cursor.execute(
                    "SELECT COUNT(*) FROM partner_transactions WHERE notes LIKE ? AND type = 'ايداع ارباح سيارة'",
                    (f"%ايداع ارباح سيارة {name.strip()}%",)
                )
                profit_split_count = cursor.fetchone()[0]
                if profit_split_count < 2:
                    f13_passed = False
                    log_failure(
                        13,
                        f"نقص توزيع أرباح بيع السيارة {car_number}",
                        "توزيع الأرباح على الشريكين بالتساوي",
                        f"وجد {profit_split_count} معاملات توزيع",
                        2 - profit_split_count,
                        "partner_transactions",
                        "لم يتم توزيع صافي ربح السيارة لحسابات الشركاء 50/50 بعد البيع كاش"
                    )
    if f13_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 13: توزيعات تكاليف وأرباح السيارات مطابقة للقواعد.")

    # ----------------------------------------------------
    # الفحص 14: مطابقة أرباح الوكالات وحصص الشركاء
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute("SELECT * FROM agencies")
    agencies_list = cursor.fetchall()
    f14_passed = True
    
    for ag in agencies_list:
        old_agent = ag["old_agent_name"]
        new_agent = ag["new_agent_name"]
        desc = f"وكالة {old_agent.strip()} {new_agent.strip()}"
        amount_usd = get_decimal(ag["amount_usd"])
        amount_iqd = get_decimal(ag["amount_iqd"])
        
        if amount_usd > 0.0:
            cursor.execute("SELECT COUNT(*) FROM partner_transactions WHERE notes LIKE ? AND currency = 'USD'", (f"%{desc}%",))
            split_usd = cursor.fetchone()[0]
            if split_usd < 2:
                f14_passed = False
                log_failure(14, f"نقص توزيع ربح الوكالة بالدولار: {desc}", 2, split_usd, 2 - split_usd, "partner_transactions", "لم يتم تقسيم ربح الوكالة بالدولار على الشركاء")
                
        if amount_iqd > 0.0:
            cursor.execute("SELECT COUNT(*) FROM partner_transactions WHERE notes LIKE ? AND currency = 'IQD'", (f"%{desc}%",))
            split_iqd = cursor.fetchone()[0]
            if split_iqd < 2:
                f14_passed = False
                log_failure(14, f"نقص توزيع ربح الوكالة بالدينار: {desc}", 2, split_iqd, 2 - split_iqd, "partner_transactions", "لم يتم تقسيم ربح الوكالة بالدينار على الشركاء")
                
    if f14_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 14: أرباح الوكالات وزعت على الشركاء 50/50 بنجاح.")

    # ----------------------------------------------------
    # الفحص 15: مطابقة الأقساط والمقدمات المدفوعة
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute("SELECT * FROM cars WHERE payment_type = 'اقساط'")
    inst_cars = cursor.fetchall()
    f15_passed = True
    
    for car in inst_cars:
        car_number = car["car_number"]
        selling_price = get_decimal(car["selling_price"])
        amount_paid = get_decimal(car["amount_paid"])
        amount_remaining = get_decimal(car["amount_remaining"])
        
        # التأكد من صحة المعادلة: البيع = المقدمة + المتبقي
        if abs(selling_price - (amount_paid + amount_remaining)) > Decimal("0.0"):
            f15_passed = False
            log_failure(
                15,
                f"عدم تطابق معادلة الأقساط للسيارة {car_number}",
                selling_price,
                amount_paid + amount_remaining,
                abs(selling_price - (amount_paid + amount_remaining)),
                "cars table",
                "خلل في احتساب المتبقي أو المقدمة عند تسجيل بيع الأقساط"
            )
    if f15_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 15: معادلات الأقساط والمقدمات للسيارات صحيحة.")

    # ----------------------------------------------------
    # الفحص 16: سلامة التعديل والحذف (عدم تكرار أو بقاء قيود وهمية)
    # ----------------------------------------------------
    total_checks_run += 1
    # نتحقق من عدم وجود قيود يتيمة في الدفتر المالي (لا تنتمي لمستند صحيح)
    f16_passed = True
    cursor.execute("SELECT DISTINCT reference_type, reference_id FROM financial_ledger")
    ref_entries = cursor.fetchall()
    
    for ref in ref_entries:
        ref_type = ref["reference_type"]
        ref_id = ref["reference_id"]
        
        # التحقق حسب النوع
        if ref_type == "car":
            cursor.execute("SELECT COUNT(*) FROM cars WHERE car_number = ?", (ref_id,))
            if cursor.fetchone()[0] == 0:
                f16_passed = False
                log_failure(16, f"قيد يتيم في الدفتر للسيارة {ref_id}", "سيارة موجودة بقاعدة البيانات", "سيارة محذوفة", 1, "financial_ledger", "تم حذف السيارة ولكن بقيت قيودها المحاسبية في الدفتر المالي")
        elif ref_type == "partner_transaction":
            cursor.execute("SELECT COUNT(*) FROM partner_transactions WHERE id = ?", (ref_id,))
            if cursor.fetchone()[0] == 0:
                f16_passed = False
                log_failure(16, f"قيد يتيم للحركة المالية رقم {ref_id}", "حركة مالية موجودة", "حركة مالية محذوفة", 1, "financial_ledger", "تم حذف حركة شريك/عميل دون حذف قيودها المقابلة في الدفتر المالي")
        elif ref_type == "expense":
            cursor.execute("SELECT type_ FROM financial_ledger WHERE reference_type = 'expense' AND reference_id = ?", (ref_id,))
            types = [r[0] for r in cursor.fetchall()]
            is_car_exp = any(t in ('مصروف سيارة', 'دفع مصروف سيارة') for t in types)
            is_gen_exp = any(t in ('مصروف عام', 'دفع مصروف') for t in types)
            
            if is_car_exp:
                cursor.execute("SELECT COUNT(*) FROM car_expenses WHERE id = ?", (ref_id,))
                if cursor.fetchone()[0] == 0:
                    f16_passed = False
                    log_failure(16, f"قيد يتيم لمصروف السيارة رقم {ref_id}", "مصروف سيارة موجود", "مصروف سيارة محذوف", 1, "financial_ledger", "تم حذف مستند مصروف السيارة وبقيت آثاره في الدفتر المالي")
            if is_gen_exp:
                cursor.execute("SELECT COUNT(*) FROM expenses WHERE id = ?", (ref_id,))
                if cursor.fetchone()[0] == 0:
                    f16_passed = False
                    log_failure(16, f"قيد يتيم للمصروف العام رقم {ref_id}", "مصروف عام موجود", "مصروف عام محذوف", 1, "financial_ledger", "تم حذف مستند المصروف العام وبقيت آثاره في الدفتر المالي")
        elif ref_type == "agency":
            cursor.execute("SELECT COUNT(*) FROM agencies WHERE id = ?", (ref_id,))
            if cursor.fetchone()[0] == 0:
                f16_passed = False
                log_failure(16, f"قيد يتيم للوكالة رقم {ref_id}", "وكالة موجودة", "وكالة محذوفة", 1, "financial_ledger", "تم حذف الوكالة دون إزالة قيود أرباحها من الدفتر")
        elif ref_type == "agency_transaction":
            cursor.execute("SELECT COUNT(*) FROM agency_transactions WHERE id = ?", (ref_id,))
            if cursor.fetchone()[0] == 0:
                f16_passed = False
                log_failure(16, f"قيد يتيم لحركة الوكالة رقم {ref_id}", "حركة وكالة موجودة", "حركة وكالة محذوفة", 1, "financial_ledger", "تم حذف حركة وكالة فرعية وبقيت قيودها")

    if f16_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 16: لا توجد قيود يتيمة أو متبقيات محاسبية غير سليمة.")

    # ----------------------------------------------------
    # الفحص 17: سلامة وصحة البيانات (عدم وجود حقول فارغة أو قيم سالبة للقيود)
    # ----------------------------------------------------
    total_checks_run += 1
    f17_passed = True
    
    # أ. عدم وجود قيم debit و credit كلاهما أكبر من صفر في نفس السطر
    cursor.execute("SELECT COUNT(*) FROM financial_ledger WHERE debit > 0 AND credit > 0")
    if cursor.fetchone()[0] > 0:
        f17_passed = False
        log_failure(17, "قيد يحتوي مدين ودائن معاً في سطر واحد", "أحدهما صفر", "كلاهما أكبر من صفر", 1, "financial_ledger", "قيد خاطئ يحتوي قيمتين مدين ودائن في نفس السطر")
        
    # ب. لا توجد قيم سالبة
    cursor.execute("SELECT COUNT(*) FROM financial_ledger WHERE debit < 0 OR credit < 0")
    if cursor.fetchone()[0] > 0:
        f17_passed = False
        log_failure(17, "قيد يحتوي قيم سالبة", "القيم موجبة أو صفر", "توجد قيم سالبة", 1, "financial_ledger", "قيد يحتوي قيم سالبة للمدين أو الدائن")
        
    # ج. عملة فارغة أو نوع الحساب فارغ
    cursor.execute("SELECT COUNT(*) FROM financial_ledger WHERE currency = '' OR currency IS NULL OR account_type = '' OR account_type IS NULL")
    if cursor.fetchone()[0] > 0:
        f17_passed = False
        log_failure(17, "حقول العملة أو نوع الحساب فارغة في الدفتر المالي", "مملوءة بالكامل", "توجد قيم فارغة", 1, "financial_ledger", "وجود قيود يتيمة بلا فئة حساب أو عملة محددة")

    if f17_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 17: سلامة وصحة حقول وقيم القيود ناجحة.")

    # ----------------------------------------------------
    # الفحص 18: مطابقة لوحة معلومات المدير (Dashboard Summary)
    # ----------------------------------------------------
    total_checks_run += 1
    # جلب القيم الفعلية عن طريق الاستعلامات كما تفعل الدالة get_financial_summary في Rust
    act_summary = {}
    
    # 1. الكاش
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'cash' AND currency = ?", (curr,))
        act_summary[f"cash_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])
        
    # 2. المخزون
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'inventory' AND currency = ?", (curr,))
        act_summary[f"inventory_value_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])
        
    # 3. الاستثمارات
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'investor' AND currency = ?", (curr,))
        act_summary[f"total_investments_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])
        
    # 4. رأس المال الاسمي
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(credit - debit), 0.0) FROM financial_ledger WHERE account_type = 'capital' AND currency = ?", (curr,))
        act_summary[f"total_partner_capital_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])
        
    # 5. ذمم المدينين
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'receivable' AND currency = ?", (curr,))
        act_summary[f"total_debtors_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])
        
    # 6. إجمالي المصاريف
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(debit - credit), 0.0) FROM financial_ledger WHERE account_type = 'expense' AND currency = ?", (curr,))
        act_summary[f"total_expenses_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])
        
    # 7. صافي رأس مال الشركاء الفعلي التراكمي
    for curr in ["IQD", "USD"]:
        cursor.execute("SELECT COALESCE(SUM(CASE WHEN ? = 'IQD' THEN iqd_balance ELSE usd_balance END), 0.0) FROM partners WHERE kind = 'شريك'", (curr,))
        act_summary[f"net_capital_{curr.lower()}"] = get_decimal(cursor.fetchone()[0])

    f18_passed = True
    for key, exp_val in exp_summary.items():
        act_val = act_summary.get(key, Decimal("0.0"))
        if abs(exp_val - act_val) > Decimal("0.0"):
            f18_passed = False
            log_failure(
                18,
                f"لوحة القيادة: اختلاف قيمة {key}",
                exp_val,
                act_val,
                abs(exp_val - act_val),
                "dashboard summary queries",
                "خلل في معادلة الملخص المالي للوحة القيادة نتيجة لعدم توازن الدفتر المالي أو أرصدة الحسابات"
            )
            
    if f18_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 18: مطابقة أرقام لوحة المعلومات (Dashboard) ناجحة.")

    # ----------------------------------------------------
    # الفحص 19: مطابقة كشوف الحسابات وتكامل الحسابات
    # ----------------------------------------------------
    total_checks_run += 1
    # نتحقق لكل جهة (زبون، مستثمر، ممول، شركة، شريك) أن مجموع حركاتها في partner_transactions
    # يطابق تماماً رصيدها المسجل في جدول partners
    cursor.execute("SELECT partner_name, kind, iqd_balance, usd_balance FROM partners")
    accounts_verify = cursor.fetchall()
    f19_passed = True
    
    for av in accounts_verify:
        name = av["partner_name"]
        kind = av["kind"]
        
        for curr in ["IQD", "USD"]:
            # الحساب بطريقة تراكمية للحركات كما يفعل النظام
            cursor.execute(
                """
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = ?
                AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                AND type NOT LIKE 'تحويل%'
                """,
                (name, kind, curr)
            )
            dep = get_decimal(cursor.fetchone()[0])
            
            cursor.execute(
                """
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = ?
                AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                AND type NOT LIKE 'تحويل%'
                """,
                (name, kind, curr)
            )
            draw = get_decimal(cursor.fetchone()[0])
            
            # حسب نوع الحساب
            if kind == "زبون":
                cursor.execute(
                    """
                    SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                    WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = ?
                    AND type LIKE 'باقي%'
                    AND type NOT LIKE 'تحويل%'
                    """,
                    (name, kind, curr)
                )
                exp_b = get_decimal(cursor.fetchone()[0])
            elif kind in ["مستثمر", "ممول", "شركة"]:
                exp_b = draw - dep
            else: # شريك
                exp_b = dep - draw
                
            actual_b = get_decimal(av[f"{curr.lower()}_balance"])
            
            if abs(exp_b - actual_b) > Decimal("0.0"):
                f19_passed = False
                log_failure(
                    19,
                    f"كشف الحساب: عدم تكامل الأرصدة للحساب {name} ({kind}) - {curr}",
                    exp_b,
                    actual_b,
                    abs(exp_b - actual_b),
                    "partners vs partner_transactions",
                    "عدم مطابقة رصيد كشف الحساب التراكمي مع القيمة التراكمية في جدول الحسابات partners"
                )
    if f19_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 19: مطابقة كشوف الحسابات وتكامل الجداول ناجحة.")

    # ----------------------------------------------------
    # الفحص 20: فحص العملات المنفردة (فصل IQD عن USD تماماً)
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute("SELECT DISTINCT currency FROM financial_ledger")
    currencies = [row[0] for row in cursor.fetchall()]
    f20_passed = True
    
    for c in currencies:
        if c not in ["IQD", "USD"]:
            f20_passed = False
            log_failure(
                20,
                f"وجود عملة غير مدعومة أو فارغة: '{c}'",
                "IQD / USD",
                c,
                1,
                "financial_ledger",
                "دمج عملات غير محددة أو وجود عملة فارغة بالدفتر المالي"
            )
            
    # تحقق من عدم وجود أي سجل يدمج العملتين في عملية واحدة بالدفتر المالي
    cursor.execute(
        """
        SELECT 
            reference_type, 
            CASE 
                WHEN reference_type = 'expense' AND type_ IN ('مصروف سيارة', 'دفع مصروف سيارة') THEN 'car_expense'
                WHEN reference_type = 'expense' THEN 'general_expense'
                ELSE 'other'
            END as expense_sub_type,
            reference_id, 
            COUNT(DISTINCT currency) as c_cnt
        FROM financial_ledger
        GROUP BY reference_type, expense_sub_type, reference_id
        HAVING c_cnt > 1
        """
    )
    mixed_currencies = cursor.fetchall()
    # استثناء عمليات النظام والسيارات التي لها عملة شراء IQD وعملة بيع USD أو العكس بشكل قانوني
    for mc in mixed_currencies:
        ref_type = mc["reference_type"]
        ref_id = mc["reference_id"]
        sub_type = mc["expense_sub_type"]
        if ref_type == "car":
            # التحقق هل عملة الشراء تختلف عن عملة البيع بشكل صحيح
            cursor.execute("SELECT currency, sale_currency FROM cars WHERE car_number = ?", (ref_id,))
            row = cursor.fetchone()
            if row and row["currency"] != row["sale_currency"]:
                # هذا دمج مسموح وموثق لاختلاف عملة البيع عن الشراء
                continue
        
        f20_passed = False
        desc_type = f"{ref_type} ({sub_type})" if ref_type == "expense" else ref_type
        log_failure(
            20,
            f"دمج عملات في مستند واحد ({desc_type} / {ref_id})",
            "عملة واحدة لكل حركة غير مستثناة",
            f"دمج {mc['c_cnt']} عملات مختلفة في مستند واحد",
            mc['c_cnt'] - 1,
            "financial_ledger",
            "خلط عملات مختلفة في عملية مالية واحدة دون استثناء بيع/شراء موثق"
        )
        
    if f20_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 20: فصل عملات IQD عن USD مطبق بنجاح ودقة.")

    # ----------------------------------------------------
    # الفحص 21: إغلاق الأقساط بالكامل ومسار الأرباح بعد سداد الزبون
    # ----------------------------------------------------
    total_checks_run += 1
    cursor.execute("SELECT * FROM cars WHERE status = 'مبيوعة' AND payment_type = 'اقساط'")
    installment_cars = cursor.fetchall()
    f21_passed = True
    fully_settled_count = 0

    for car in installment_cars:
        car_number = car["car_number"]
        car_name = car["car_name"]
        chassis = car["chassis_number"]
        buyer = car["buyer_name"]
        curr = car["currency"] or "IQD"
        s_curr = car["sale_currency"] or curr
        selling_price = get_decimal(car["selling_price"])
        amount_paid = get_decimal(car["amount_paid"])
        amount_remaining = get_decimal(car["amount_remaining"])
        purchase_price = get_decimal(car["purchase_price"])

        cursor.execute("SELECT COALESCE(SUM(amount), 0.0) FROM car_expenses WHERE car_number = ?", (car_number,))
        car_expenses_sum = get_decimal(cursor.fetchone()[0])
        total_cost = purchase_price + car_expenses_sum
        profit = selling_price - total_cost

        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0.0)
            FROM partner_transactions
            WHERE partner_name = ?
              AND kind = 'زبون'
              AND type LIKE 'تسديد قسط%'
              AND COALESCE(currency, 'IQD') = ?
              AND (notes LIKE ? OR notes LIKE ?)
            """,
            (buyer, s_curr, f"%{chassis}%", f"%{car_number}%")
        )
        installment_payments = get_decimal(cursor.fetchone()[0])

        if amount_paid + installment_payments < selling_price:
            continue

        fully_settled_count += 1

        cursor.execute(
            """
            SELECT COALESCE(SUM(debit), 0.0)
            FROM financial_ledger
            WHERE reference_type = 'car'
              AND reference_id = ?
              AND account_type = 'receivable'
              AND account_id = ?
              AND currency = ?
            """,
            (car_number, buyer, s_curr)
        )
        receivable_opened = get_decimal(cursor.fetchone()[0])

        cursor.execute(
            """
            SELECT COALESCE(SUM(fl.credit), 0.0)
            FROM financial_ledger fl
            JOIN partner_transactions pt
              ON fl.reference_type = 'partner_transaction'
             AND fl.reference_id = CAST(pt.id AS TEXT)
            WHERE fl.account_type = 'receivable'
              AND fl.account_id = ?
              AND fl.currency = ?
              AND pt.kind = 'زبون'
              AND pt.type LIKE 'تسديد قسط%'
              AND (pt.notes LIKE ? OR pt.notes LIKE ?)
            """,
            (buyer, s_curr, f"%{chassis}%", f"%{car_number}%")
        )
        receivable_closed = get_decimal(cursor.fetchone()[0])
        actual_remaining = receivable_opened - receivable_closed

        if abs(actual_remaining) > Decimal("0.0"):
            f21_passed = False
            log_failure(
                21,
                f"لم تُغلق ذمة الزبون بالكامل للسيارة {car_number}",
                Decimal("0.0"),
                actual_remaining,
                abs(actual_remaining),
                "financial_ledger (receivable)",
                "تسديد كامل الأقساط لم ينعكس كتخفيض كامل لحساب الزبون المدين"
            )

        cursor.execute(
            """
            SELECT COALESCE(SUM(fl.debit), 0.0)
            FROM financial_ledger fl
            LEFT JOIN partner_transactions pt
              ON fl.reference_type = 'partner_transaction'
             AND fl.reference_id = CAST(pt.id AS TEXT)
            WHERE fl.account_type = 'cash'
              AND fl.currency = ?
              AND (
                    (fl.reference_type = 'car' AND fl.reference_id = ? AND fl.type_ = 'مقدمة سيارة')
                 OR (pt.kind = 'زبون' AND pt.type LIKE 'تسديد قسط%' AND (pt.notes LIKE ? OR pt.notes LIKE ?))
              )
            """,
            (s_curr, car_number, f"%{chassis}%", f"%{car_number}%")
        )
        actual_cash_collected = get_decimal(cursor.fetchone()[0])

        if abs(actual_cash_collected - selling_price) > Decimal("0.0"):
            f21_passed = False
            log_failure(
                21,
                f"مقبوضات الأقساط لا تساوي سعر البيع للسيارة {car_number}",
                selling_price,
                actual_cash_collected,
                abs(selling_price - actual_cash_collected),
                "financial_ledger (cash)",
                "المقدمة وتسديدات الأقساط لم تصل كاملة إلى حساب الكاش"
            )

        cursor.execute(
            """
            SELECT partner_name, COALESCE(SUM(amount), 0.0) AS amount
            FROM partner_transactions
            WHERE kind = 'شريك'
              AND type = 'ايداع بيع سيارة'
              AND COALESCE(currency, 'IQD') = ?
              AND (notes LIKE ? OR notes LIKE ?)
            GROUP BY partner_name
            """,
            (curr, f"%{chassis}%", f"%{car_number}%")
        )
        cost_rows = {row["partner_name"]: get_decimal(row["amount"]) for row in cursor.fetchall()}

        for partner in ["أمير", "منتصر"]:
            actual_cost_share = cost_rows.get(partner, Decimal("0.0"))
            expected_cost_share = total_cost / Decimal("2")
            if abs(actual_cost_share - expected_cost_share) > Decimal("0.0"):
                f21_passed = False
                log_failure(
                    21,
                    f"إرجاع كلفة سيارة الأقساط {car_number} للشريك {partner} غير صحيح",
                    expected_cost_share,
                    actual_cost_share,
                    abs(expected_cost_share - actual_cost_share),
                    "partner_transactions",
                    "بعد سداد كامل الأقساط يجب إرجاع كلفة السيارة للشركاء 50/50"
                )

        if curr == s_curr and profit > 0.0:
            cursor.execute(
                """
                SELECT partner_name, COALESCE(SUM(amount), 0.0) AS amount
                FROM partner_transactions
                WHERE kind = 'شريك'
                  AND type = 'ايداع ارباح سيارة'
                  AND COALESCE(currency, 'IQD') = ?
                  AND (notes LIKE ? OR notes LIKE ?)
                GROUP BY partner_name
                """,
                (curr, f"%{chassis}%", f"%{car_number}%")
            )
            profit_rows = {row["partner_name"]: get_decimal(row["amount"]) for row in cursor.fetchall()}

            for partner in ["أمير", "منتصر"]:
                actual_profit_share = profit_rows.get(partner, Decimal("0.0"))
                expected_profit_share = profit / Decimal("2")
                if abs(actual_profit_share - expected_profit_share) > Decimal("0.0"):
                    f21_passed = False
                    log_failure(
                        21,
                        f"ربح سيارة الأقساط {car_number} لم يذهب للشريك {partner} بشكل صحيح",
                        expected_profit_share,
                        actual_profit_share,
                        abs(expected_profit_share - actual_profit_share),
                        "partner_transactions",
                        "بعد سداد كامل الأقساط يجب أن يذهب صافي ربح السيارة إلى الشركاء 50/50"
                    )

    if fully_settled_count == 0:
        f21_passed = False
        log_failure(
            21,
            "لا يوجد سيناريو سيارة أقساط مسددة بالكامل",
            "سيارة أقساط واحدة على الأقل مغلقة بالكامل",
            "لم يتم العثور على أي سيارة أقساط مكتملة السداد",
            1,
            "cars / partner_transactions",
            "بيانات الاختبار لا تغطي مسار إغلاق الأقساط بالكامل وتوزيع الربح"
        )

    if f21_passed:
        passed_checks_count += 1
        if not only_errors: print("✅ الفحص 21: إغلاق الأقساط بالكامل يصفّر ذمة الزبون ويوزع الكلفة والربح على الشركاء.")

    # ----------------------------------------------------
    # إنتاج وحفظ التقرير المحاسبي
    # ----------------------------------------------------
    conn.close()
    
    failed_checks_count = len(failed_checks)
    print("\n==================================================")
    print(f"📊 ملخص فحص التدقيق المحاسبي للبرنامج:")
    print(f"   عدد الفحوصات الإجمالي: {total_checks_run}")
    print(f"   الناجحة: {passed_checks_count}")
    print(f"   الفاشلة: {failed_checks_count}")
    print("==================================================\n")

    if save_report:
        report_path = db_path.with_name("accounting_audit_report.txt")
        report_lines = [
            "تقرير فحص التدقيق المحاسبي لبرنامج فجر الوادي",
            "=" * 50,
            f"قاعدة البيانات: {db_path}",
            f"عدد الفحوصات الإجمالي: {total_checks_run}",
            f"الفحوصات الناجحة: {passed_checks_count}",
            f"الفحوصات الفاشلة: {failed_checks_count}",
            "",
            "النتيجة النهائية: " + ("PASSED" if failed_checks_count == 0 else "FAILED"),
            "",
        ]
        if failed_checks:
            report_lines.append("تفاصيل الفحوصات الفاشلة:")
            for err in failed_checks:
                report_lines.extend([
                    f"- فحص {err['check']}: {err['title']}",
                    f"  المتوقع: {err['expected']}",
                    f"  الفعلي: {err['actual']}",
                    f"  الفرق: {err['diff']}",
                    f"  المصدر: {err['source']}",
                    f"  السبب المحتمل: {err['cause']}",
                    "",
                ])
        else:
            report_lines.append("كل القيود والحركات والأرصدة الاختبارية مطابقة للقواعد المحاسبية المحددة.")

        report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
        print(f"📝 تم حفظ تقرير التدقيق في: {report_path}")

    if failed_checks_count == 0:
        print("✅ ACCOUNTING AUDIT PASSED")
        print("كل القيود والحركات والأرصدة الاختبارية مطابقة للقواعد المحاسبية المحددة.\n")
        return 0
    else:
        print("❌ ACCOUNTING AUDIT FAILED")
        print("يوجد اختلافات محاسبية يجب إصلاحها قبل التسليم.\n")
        
        # طباعة المشاكل بالتفصيل للمستخدم
        for err in failed_checks:
            print(f"⚠️ خطأ فحص {err['check']}: {err['title']}")
            print(f"   المتوقع: {err['expected']}")
            print(f"   الفعلي: {err['actual']}")
            print(f"   الفرق: {err['diff']}")
            print(f"   السبب: {err['cause']}\n")
            
        return 1

def main():
    parser = argparse.ArgumentParser(description="أداة التدقيق والتحقق المحاسبي لقاعدة بيانات فجر الوادي")
    parser.add_argument("--db", default="src-tauri/fjr_alwadi_data.db", help="مسار قاعدة البيانات SQLite")
    parser.add_argument("--seed", action="store_true", help="تشغيل تعبئة البيانات أولاً")
    parser.add_argument("--strict", action="store_true", help="تفعيل المطابقة الصارمة الخالية من أي تفاوت")
    parser.add_argument("--only-errors", action="store_true", help="طباعة الأخطاء والمخالفات فقط")
    parser.add_argument("--report", action="store_true", help="حفظ تقرير المطابقة بصيغة ملف تقرير")
    args = parser.parse_args()
    
    db_path = Path(args.db).resolve()
    
    if args.seed:
        print("🌱 جاري تهيئة وحقن سيناريوهات الاختبار أولاً...")
        seed_everything(db_path)
        print("--------------------------------------------------\n")
        
    exit_code = run_verification(db_path, strict=args.strict, only_errors=args.only_errors, save_report=args.report)
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
