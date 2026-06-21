#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
"""
سكربت احتساب القيود والنتائج المحاسبية المتوقعة بشكل مستقل تماماً من الجداول الخام.
الملف الثاني: accounting_tests/2_expected_accounting.py
"""

import sqlite3
from decimal import Decimal
from pathlib import Path

def get_decimal(val) -> Decimal:
    """تحويل القيمة إلى Decimal بأمان ودقة"""
    if val is None:
        return Decimal("0.0")
    try:
        return Decimal(str(val))
    except (ValueError, TypeError):
        return Decimal("0.0")

def is_deposit_type(tx_type: str) -> bool:
    """التحقق مما إذا كانت الحركة عبارة عن إيداع/مقبوضات"""
    return (
        tx_type.startswith("ايداع")
        or tx_type.startswith("إيداع")
        or tx_type.startswith("مقدمة")
        or tx_type.startswith("تسديد")
        or tx_type.startswith("استلام")
        or tx_type.startswith("إستلام")
        or tx_type.startswith("إعادة استثمار")
        or tx_type.startswith("تسوية")
    )

def calculate_expected_accounting(db_path: str) -> dict:
    """احتساب كافة الحسابات والنتائج المحاسبية المتوقعة بشكل مستقل"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # القواميس لحفظ النتائج المتوقعة
    expected_balances = {}          # المفتاح: (account_type, account_id, currency) -> balance (Decimal)
    expected_partner_balances = {}  # المفتاح: (partner_name, currency) -> {'capital': Decimal, 'drawings': Decimal, 'profit': Decimal}
    expected_car_results = {}       # المفتاح: car_number -> {'cost': Decimal, 'selling': Decimal, 'profit': Decimal, 'status': str}
    expected_customer_results = {}  # المفتاح: (customer_name, currency) -> expected_receivable (Decimal)
    expected_summary = {}           # أرقام الملخص للـ Dashboard
    expected_profit_distribution = {}

    # دالة مساعدة لتحديث رصيد الحساب العام
    def add_balance(acc_type: str, acc_id: str | None, curr: str, amount: Decimal):
        acc_id = acc_id.strip() if acc_id else "قاصه"
        curr = curr.strip() if curr else "IQD"
        key = (acc_type.strip(), acc_id, curr)
        expected_balances[key] = expected_balances.get(key, Decimal("0.0")) + amount

    # ==========================================
    # 1. تحليل السيارات والمصروفات الخاصة بها والمبيعات
    # ==========================================
    cursor.execute("SELECT * FROM cars")
    cars = cursor.fetchall()
    
    for car in cars:
        car_number = car["car_number"]
        name = car["car_name"]
        purchase_price = get_decimal(car["purchase_price"])
        selling_price = get_decimal(car["selling_price"])
        curr = car["currency"] or "IQD"
        s_curr = car["sale_currency"] or curr
        status = car["status"]
        p_type = car["purchase_type"] or "كاش"
        p_reg = car["purchase_payment_type"] or "قاصه"
        buyer = car["buyer_name"]
        
        # جلب مصروفات هذه السيارة
        cursor.execute("SELECT amount FROM car_expenses WHERE car_number = ?", (car_number,))
        exp_rows = cursor.fetchall()
        car_expenses_sum = sum(get_decimal(r["amount"]) for r in exp_rows)
        
        total_cost = purchase_price + car_expenses_sum
        expected_car_results[car_number] = {
            "cost": total_cost,
            "selling": selling_price if status == "مبيوعة" else Decimal("0.0"),
            "profit": (selling_price - total_cost) if status == "مبيوعة" else Decimal("0.0"),
            "status": status,
            "currency": curr,
            "sale_currency": s_curr
        }

        # أ. قيد الشراء
        if purchase_price > 0.0:
            # زيادة المخزون
            add_balance("inventory", car_number, curr, purchase_price)
            
            if p_type == "كاش":
                # سحب نقدي لشراء سيارة كاش
                add_balance("cash", p_reg, curr, -purchase_price)
            elif p_type in ["تمويل", "دين"]:
                f_name = car["financer_name"] or "ممول عام"
                # زيادة التزام الممول
                add_balance("funder", f_name, curr, purchase_price)
            elif p_type == "شركة":
                c_name = car["financer_name"] or "شركة عامة"
                # زيادة التزام الشركة
                add_balance("payable", c_name, curr, purchase_price)

        # ب. معالجة مصروفات السيارة
        if car_expenses_sum > 0.0:
            # المصروفات تزيد المخزون
            add_balance("inventory", car_number, curr, car_expenses_sum)
            # وتدفع من القاصة
            add_balance("cash", "قاصه", curr, -car_expenses_sum)

        # ج. قيد البيع
        if status == "مبيوعة":
            # إيراد البيع
            add_balance("revenue", car_number, s_curr, selling_price)
            
            # تكلفة المبيعات وتخفيض المخزون
            add_balance("expense", car_number, curr, total_cost)
            add_balance("inventory", car_number, curr, -total_cost)
            
            # طريقة استلام ثمن البيع
            sale_payment = car["payment_type"] or "كاش"
            amount_paid = get_decimal(car["amount_paid"])
            amount_remaining = get_decimal(car["amount_remaining"])
            
            if sale_payment == "كاش":
                add_balance("cash", "قاصه", s_curr, selling_price)
            else:
                # بيع أقساط أو موعد
                if amount_paid > 0.0:
                    add_balance("cash", "قاصه", s_curr, amount_paid)
                if amount_remaining > 0.0:
                    add_balance("receivable", buyer, s_curr, amount_remaining)
                    # تسجيل رصيد متوقع مدين للزبون
                    cust_key = (buyer, s_curr)
                    expected_customer_results[cust_key] = expected_customer_results.get(cust_key, Decimal("0.0")) + amount_remaining

    # ==========================================
    # 2. تحليل المصروفات العامة (ليست لسيارة محددة)
    # ==========================================
    cursor.execute("SELECT * FROM expenses WHERE car_number IS NULL OR car_number = ''")
    expenses = cursor.fetchall()
    
    for exp in expenses:
        amount = get_decimal(exp["amount"])
        curr = exp["currency"] or "IQD"
        desc = exp["description"]
        
        # زيادة المصروفات العامة
        add_balance("expense", desc, curr, amount)
        # خروج النقدية من القاصة
        add_balance("cash", "قاصه", curr, -amount)

    # ==========================================
    # 3. تحليل الوكالات وحركاتها المباشرة
    # ==========================================
    cursor.execute("SELECT * FROM agencies")
    agencies = cursor.fetchall()
    
    for ag in agencies:
        agency_id = str(ag["id"])
        old_agent = ag["old_agent_name"]
        new_agent = ag["new_agent_name"]
        desc = f"وكالة {old_agent} {new_agent}"
        amount_usd = get_decimal(ag["amount_usd"])
        amount_iqd = get_decimal(ag["amount_iqd"])
        
        if amount_usd > 0.0:
            add_balance("cash", "قاصه", "USD", amount_usd)
            add_balance("revenue", "agency", "USD", amount_usd)
        if amount_iqd > 0.0:
            add_balance("cash", "قاصه", "IQD", amount_iqd)
            add_balance("revenue", "agency", "IQD", amount_iqd)

    # حركات الوكالات
    cursor.execute("SELECT * FROM agency_transactions")
    ag_txs = cursor.fetchall()
    
    for tx in ag_txs:
        agency_id = str(tx["agency_id"])
        tx_type = tx["type_"]
        amount = get_decimal(tx["amount"])
        curr = tx["currency"] or "IQD"
        
        if tx_type == "ايداع":
            add_balance("cash", "قاصه", curr, amount)
            add_balance("revenue", "agency", curr, amount)
        else: # سحب
            add_balance("revenue", "agency", curr, -amount)
            add_balance("cash", "قاصه", curr, -amount)

    # ==========================================
    # 4. تحليل حركات الشركاء والجهات العامة (الزبائن والممولين والمستثمرين والشركات)
    # ==========================================
    cursor.execute("SELECT * FROM partner_transactions")
    pt_rows = cursor.fetchall()
    
    for pt in pt_rows:
        name = pt["partner_name"]
        kind = pt["kind"]
        tx_type = pt["type"]
        amount = get_decimal(pt["amount"])
        curr = pt["currency"] or "IQD"
        payment_reg = pt["payment_type"] or "قاصه"
        
        is_dep = is_deposit_type(tx_type)
        
        # تجنب العمليات الخاصة بتوزيع الشركاء عند الشراء/البيع والمصروفات
        # لأنها مسجلة بشكل مستقل في جدول السيارات والوكالات والمصروفات
        # وسنقوم بمعالجة حصص الشركاء بشكل تجميعي لاحقاً لمنع التكرار
        is_internal_split = (
            tx_type.startswith("سحب شراء سيارة")
            or tx_type.startswith("ايداع بيع سيارة")
            or tx_type.startswith("مقدمة بيع سيارة")
            or tx_type.startswith("سحب مصروف")
            or tx_type.startswith("سحب تسديد")
            or tx_type.startswith("ايداع ارباح وكالة")
            or tx_type.startswith("ايداع ارباح سيارة")
            or tx_type.startswith("تسديد قسط") and kind != "زبون"
            or tx_type.startswith("باقي")
            or tx_type.startswith("تحويل")
            or tx_type.startswith("توزيع أرباح")
            or tx_type.startswith("سحب أرباح")
            or tx_type.startswith("تسوية مسحوبات")
            or tx_type.startswith("إعادة استثمار")
            or (pt["notes"] and "ارجاع (الكاش" in pt["notes"])
            or (pt["notes"] and "شراكة سيارة" in pt["notes"])
        )
        
        if kind == "زبون":
            # حركات الزبائن تؤثر على حساب receivable و كاش القاصة
            # نتجنب حركات 'مقدمة' للعميل لأنها مدرجة بالفعل في رصيد المتبقي عند بيع السيارة
            if tx_type == "مقدمة" or tx_type.startswith("مقدمة"):
                continue
            cust_key = (name, curr)
            if is_dep:
                # الزبون سدد مديونيته
                add_balance("cash", "قاصه", curr, amount)
                add_balance("receivable", name, curr, -amount)
                expected_customer_results[cust_key] = expected_customer_results.get(cust_key, Decimal("0.0")) - amount
            else:
                # الزبون سحب نقدية أو زادت مديونيته
                add_balance("receivable", name, curr, amount)
                add_balance("cash", "قاصه", curr, -amount)
                expected_customer_results[cust_key] = expected_customer_results.get(cust_key, Decimal("0.0")) + amount
                
        elif kind == "شريك" and not is_internal_split:
            # حركات الشركاء الشخصية (إيداع رأس مال، أو مسحوبات شخصية)
            if is_dep:
                add_balance("cash", payment_reg, curr, amount)
                add_balance("capital", name, curr, amount)
            else:
                # مسحوبات الشركاء الشخصية
                add_balance("drawings", name, curr, amount)
                add_balance("cash", payment_reg, curr, -amount)
                
        elif kind == "مستثمر" and not is_internal_split:
            # المستثمر
            if is_dep:
                add_balance("cash", "قاصه", curr, amount)
                add_balance("investor", name, curr, amount)
            else:
                add_balance("investor", name, curr, -amount)
                add_balance("cash", "قاصe" if payment_reg == "قاصe" else "قاصه", curr, -amount)
                
        elif kind == "ممول" and not is_internal_split:
            # الممول
            if is_dep:
                add_balance("funder", name, curr, amount)
                add_balance("cash", payment_reg, curr, amount)
            else:
                # تسديد تمويل للممول
                add_balance("funder", name, curr, -amount)
                add_balance("cash", "قاصه", curr, -amount)
                
        elif kind == "شركة" and not is_internal_split:
            # الشركة
            if is_dep:
                add_balance("payable", name, curr, amount)
                add_balance("cash", payment_reg, curr, amount)
            else:
                # تسديد للشركة
                add_balance("payable", name, curr, -amount)
                add_balance("cash", "قاصه", curr, -amount)

    # ==========================================
    # 5. تحليل توزيعات الأرباح اليدوية (profit_distributions) [تم إلغاء التوزيع اليدوي]
    # ==========================================
    pass

    # ==========================================
    # 6. احتساب صافي حقوق الشركاء (أمير ومنتصر) 50% لكل منهما
    # ==========================================
    # نقوم باحتساب كافة توزيعات السيارات والوكالات والمصروفات والعمولات والتمويلات يدوياً للشركاء
    partners = ["أمير", "منتصر"]
    
    # هيكل لكل شريك لحفظ إجمالي حركاته بعملاته
    partner_stats = {}
    def add_partner_stat(p_name: str, curr: str, stat_type: str, val: Decimal):
        key = (p_name, curr)
        if key not in partner_stats:
            partner_stats[key] = {
                "deposits": Decimal("0.0"),
                "withdrawals": Decimal("0.0")
            }
        partner_stats[key][stat_type] += val

    # أ. الشراء والبيع والمصروفات والعمولات
    # 1. شراء سيارة كاش: 50% سحب شراء سيارة (سحوبات)
    for car in cars:
        curr = car["currency"] or "IQD"
        s_curr = car["sale_currency"] or curr
        purchase_price = get_decimal(car["purchase_price"])
        selling_price = get_decimal(car["selling_price"])
        p_type = car["purchase_type"] or "كاش"
        status = car["status"]
        car_number = car["car_number"]
        name = car["car_name"]
        
        # جلب مصروفات السيارة
        cursor.execute("SELECT amount FROM car_expenses WHERE car_number = ?", (car_number,))
        exp_rows = cursor.fetchall()
        car_expenses_sum = sum(get_decimal(r["amount"]) for r in exp_rows)
        total_cost = purchase_price + car_expenses_sum
        
        # كلفة الشراء (لكل أنواع الشراء في النظام يتم تسجيل سحب شراء سيارة 50% للشركاء)
        if purchase_price > 0.0:
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", purchase_price / 2)
                
        # مصروفات السيارة: سحب مصروف 50% للشركاء
        if car_expenses_sum > 0.0:
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", car_expenses_sum / 2)
                
        # بيع السيارة كاش:
        if status == "mbioua" or status == "مبيوعة":
            sale_payment = car["payment_type"] or "كاش"
            if sale_payment == "كاش":
                # إيداع بيع سيارة (إرجاع الكلفة) 50%
                for p in partners:
                    add_partner_stat(p, curr, "deposits", total_cost / 2)
                
                # إيداع أرباح سيارة 50%
                usd_to_iqd_rate = Decimal("1500.0")
                if curr == s_curr:
                    profit = selling_price - total_cost
                elif curr == "USD" and s_curr == "IQD":
                    profit = selling_price - (total_cost * usd_to_iqd_rate)
                elif curr == "IQD" and s_curr == "USD":
                    profit = selling_price - (total_cost / usd_to_iqd_rate)
                else:
                    profit = Decimal("0.0")

                if profit > 0.0:
                    for p in partners:
                        add_partner_stat(p, s_curr, "deposits", profit / 2)
            elif sale_payment == "اقساط":
                paid_installments = Decimal("0.0")
                chassis = car["chassis_number"]
                for pt in pt_rows:
                    notes = pt["notes"] or ""
                    if (
                        pt["kind"] == "زبون"
                        and pt["type"].startswith("تسديد قسط")
                        and (chassis in notes or car_number in notes)
                        and (pt["currency"] or "IQD") == s_curr
                    ):
                        paid_installments += get_decimal(pt["amount"])

                amount_paid = get_decimal(car["amount_paid"])
                amount_remaining = get_decimal(car["amount_remaining"])
                if amount_paid + paid_installments >= selling_price and amount_remaining > 0.0:
                    for p in partners:
                        add_partner_stat(p, curr, "deposits", total_cost / 2)

                    usd_to_iqd_rate = Decimal("1500.0")
                    if curr == s_curr:
                        profit = selling_price - total_cost
                    elif curr == "USD" and s_curr == "IQD":
                        profit = selling_price - (total_cost * usd_to_iqd_rate)
                    elif curr == "IQD" and s_curr == "USD":
                        profit = selling_price - (total_cost / usd_to_iqd_rate)
                    else:
                        profit = Decimal("0.0")

                    if profit > 0.0:
                        for p in partners:
                            add_partner_stat(p, s_curr, "deposits", profit / 2)

    # 2. المصروفات العامة: سحب مصروف 50% للشركاء
    for exp in expenses:
        amount = get_decimal(exp["amount"])
        curr = exp["currency"] or "IQD"
        for p in partners:
            add_partner_stat(p, curr, "withdrawals", amount / 2)

    # 3. الوكالات الأساسية: إيداع أرباح وكالة 50%
    for ag in agencies:
        amount_usd = get_decimal(ag["amount_usd"])
        amount_iqd = get_decimal(ag["amount_iqd"])
        
        if amount_usd > 0.0:
            for p in partners:
                add_partner_stat(p, "USD", "deposits", amount_usd / 2)
        if amount_iqd > 0.0:
            for p in partners:
                add_partner_stat(p, "IQD", "deposits", amount_iqd / 2)

    # حركات الوكالات الفرعية:
    for tx in ag_txs:
        amount = get_decimal(tx["amount"])
        curr = tx["currency"] or "IQD"
        tx_type = tx["type_"]
        
        if tx_type == "ايداع":
            for p in partners:
                add_partner_stat(p, curr, "deposits", amount / 2)
        else: # سحب
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", amount / 2)

    # 4. تسديد المستثمرين والممولين والشركات:
    # نقوم بفحص حركات partner_transactions لمعرفة التسديدات ونخصمها 50% من الشركاء
    for pt in pt_rows:
        name = pt["partner_name"]
        kind = pt["kind"]
        tx_type = pt["type"]
        amount = get_decimal(pt["amount"])
        curr = pt["currency"] or "IQD"
        
        is_dep = is_deposit_type(tx_type)
        
        # أ. تسديد مستثمر (سحب)
        if kind == "مستثمر" and not is_dep:
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", amount / 2)
                
        # ب. تسديد ممول (سحب)
        elif kind == "ممول" and not is_dep:
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", amount / 2)
                
        # ج. تمويل من ممول (تمويل)
        elif kind == "ممول" and tx_type.startswith("تمويل") and amount > 0.0:
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", amount / 2)
                
        # د. تسديد شركة (سحب)
        elif kind == "شركة" and not is_dep:
            for p in partners:
                add_partner_stat(p, curr, "withdrawals", amount / 2)

    # 5. الحركات الشخصية المباشرة (إيداع وسحب الشريك) والتوزيع اليدوي للأرباح
    for pt in pt_rows:
        name = pt["partner_name"]
        kind = pt["kind"]
        tx_type = pt["type"]
        amount = get_decimal(pt["amount"])
        curr = pt["currency"] or "IQD"
        
        is_dep = is_deposit_type(tx_type)
        
        # إيداع شخصي أو مسحوبات شخصية
        if kind == "شريك":
            # تجنب العمليات التوزيعية التي قمنا باحتسابها بشكل مجمع أعلاه
            is_internal = (
                tx_type.startswith("سحب شراء سيارة")
                or tx_type.startswith("ايداع بيع سيارة")
                or tx_type.startswith("ايداع ارباح سيارة")
                or tx_type.startswith("سحب مصروف")
                or tx_type.startswith("سحب تسديد")
                or tx_type.startswith("ايداع ارباح وكالة")
                or tx_type.startswith("تسديد قسط")
                or tx_type.startswith("باقي")
                or tx_type.startswith("تحويل")
            )
            if not is_internal:
                if is_dep:
                    add_partner_stat(name, curr, "deposits", amount)
                else:
                    add_partner_stat(name, curr, "withdrawals", amount)



    # احتساب الصافي المتوقع لكل شريك وعملة
    for key, stats in partner_stats.items():
        p_name, curr = key
        net_balance = stats["deposits"] - stats["withdrawals"]
        expected_partner_balances[key] = net_balance

    # ==========================================
    # 7. مطابقة أرقام لوحة المعلومات (Dashboard Summary)
    # ==========================================
    # نجمع أرصدة الحسابات لتمثيل الفئات العامة
    cash_iqd = Decimal("0.0")
    cash_usd = Decimal("0.0")
    inventory_iqd = Decimal("0.0")
    inventory_usd = Decimal("0.0")
    investments_iqd = Decimal("0.0")
    investments_usd = Decimal("0.0")
    capital_iqd = Decimal("0.0")
    capital_usd = Decimal("0.0")
    debtors_iqd = Decimal("0.0")
    debtors_usd = Decimal("0.0")
    expenses_iqd = Decimal("0.0")
    expenses_usd = Decimal("0.0")
    
    # حساب الكاش والمخزون والمدينين
    for k, v in expected_balances.items():
        acc_type, acc_id, curr = k
        if acc_type == "cash":
            if curr == "IQD": cash_iqd += v
            else: cash_usd += v
        elif acc_type == "inventory":
            if curr == "IQD": inventory_iqd += v
            else: inventory_usd += v
        elif acc_type == "investor":
            if curr == "IQD": investments_iqd += v
            else: investments_usd += v
        elif acc_type == "capital":
            if curr == "IQD": capital_iqd += v
            else: capital_usd += v
        elif acc_type == "receivable":
            if curr == "IQD": debtors_iqd += v
            else: debtors_usd += v
        elif acc_type == "expense":
            if curr == "IQD": expenses_iqd += v
            else: expenses_usd += v

    # صافي رأس المال التراكمي للشركاء (حقوق الملكية)
    net_capital_iqd = Decimal("0.0")
    net_capital_usd = Decimal("0.0")
    for key, bal in expected_partner_balances.items():
        p_name, curr = key
        if curr == "IQD":
            net_capital_iqd += bal
        else:
            net_capital_usd += bal

    expected_summary = {
        "cash_iqd": cash_iqd,
        "cash_usd": cash_usd,
        "inventory_value_iqd": inventory_iqd,
        "inventory_value_usd": inventory_usd,
        "total_investments_iqd": investments_iqd,
        "total_investments_usd": investments_usd,
        "total_partner_capital_iqd": capital_iqd,
        "total_partner_capital_usd": capital_usd,
        "total_debtors_iqd": debtors_iqd,
        "total_debtors_usd": debtors_usd,
        "total_expenses_iqd": expenses_iqd,
        "total_expenses_usd": expenses_usd,
        "net_capital_iqd": net_capital_iqd,
        "net_capital_usd": net_capital_usd
    }

    conn.close()

    return {
        "expected_balances": expected_balances,
        "expected_partner_balances": expected_partner_balances,
        "expected_car_results": expected_car_results,
        "expected_customer_results": expected_customer_results,
        "expected_summary": expected_summary
    }
