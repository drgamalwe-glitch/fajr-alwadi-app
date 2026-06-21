#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
"""
سكربت تهيئة وتعبئة سيناريوهات الاختبار المحاسبي لبرنامج فجر الوادي.
الملف الأول: accounting_tests/1_seed_scenarios.py
"""

import argparse
import shutil
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

# العلامة الثابتة لبيانات التدقيق
AUDIT_MARK = "[PY_AUDIT]"
AUDIT_PREFIX = "[PY_AUDIT]"
BASE_DATE = datetime(2026, 6, 1)

def get_date(offset_days: int) -> str:
    """إرجاع تاريخ بتنسيق YYYY-MM-DD مع إزاحة بالبيانات"""
    return (BASE_DATE + timedelta(days=offset_days)).strftime("%Y-%m-%d")

def get_time(offset_minutes: int) -> str:
    """إرجاع وقت بتنسيق HH:MM مع إزاحة"""
    return f"{8 + (offset_minutes // 60) % 12:02d}:{offset_minutes % 60:02d}"

def make_backup(db_path: Path):
    """إنشاء نسخة احتياطية من قاعدة البيانات قبل أي تعديل"""
    if db_path.exists():
        backup_path = db_path.with_name(f"{db_path.name}.bak")
        shutil.copy2(db_path, backup_path)
        print(f"✅ تم إنشاء نسخة احتياطية في: {backup_path}")
    else:
        raise FileNotFoundError(f"لم يتم العثور على قاعدة البيانات في المسار: {db_path}")

def cleanup_audit_data(conn: sqlite3.Connection):
    """تنظيف كافة سجلات الاختبار السابقة من السيناريوهات والسكربتات"""
    print("🧹 جاري تنظيف بيانات التدقيق والاختبار السابقة...")
    
    # 1. جلب أرقام السيارات ومعرفات العمليات التي سيتم حذفها
    cursor = conn.cursor()
    
    # سيارات
    cursor.execute("SELECT car_number FROM cars WHERE details LIKE ? OR details LIKE ? OR car_number LIKE 'TS-%'", (f"%{AUDIT_MARK}%", "%[TEST_SEED]%"))
    car_numbers = [row[0] for row in cursor.fetchall()]
    
    # حسابات الشركاء والعملاء
    cursor.execute("SELECT partner_name FROM partners WHERE partner_name LIKE ? OR partner_name LIKE '%زبون%' OR partner_name LIKE '%مستثمر%' OR partner_name LIKE '%ممول%' OR partner_name LIKE '%شركة%'", (f"{AUDIT_PREFIX}%",))
    partner_names = [row[0] for row in cursor.fetchall()]
    
    # وكالات
    cursor.execute("SELECT id FROM agencies WHERE notes LIKE ? OR notes LIKE ? OR old_agent_name LIKE 'اختبار%' OR new_agent_name LIKE 'اختبار%' OR id = 1", (f"%{AUDIT_MARK}%", "%[TEST_SEED]%"))
    agency_ids = [row[0] for row in cursor.fetchall()]
    
    # مصروفات عامة ومصروفات سيارات
    cursor.execute("SELECT id FROM expenses WHERE notes LIKE ? OR notes LIKE ? OR description LIKE ? OR description LIKE 'اختبار%'", (f"%{AUDIT_MARK}%", "%[TEST_SEED]%", f"{AUDIT_PREFIX}%"))
    expense_ids = [row[0] for row in cursor.fetchall()]
    
    cursor.execute("SELECT id FROM car_expenses WHERE description LIKE ? OR description LIKE 'اختبار%' OR car_number LIKE 'TS-%'", (f"{AUDIT_PREFIX}%",))
    car_expense_ids = [row[0] for row in cursor.fetchall()]
    
    # توزيعات الأرباح
    try:
        cursor.execute("SELECT id FROM profit_distributions WHERE notes LIKE ? OR notes LIKE ?", (f"%{AUDIT_MARK}%", "%[TEST_SEED]%"))
        distribution_ids = [row[0] for row in cursor.fetchall()]
    except sqlite3.OperationalError:
        distribution_ids = []

    # حذف من الجداول
    def delete_by_in(table: str, col: str, values: list):
        if not values:
            return
        placeholders = ",".join("?" for _ in values)
        cursor.execute(f"DELETE FROM {table} WHERE {col} IN ({placeholders})", tuple(values))

    # حذف قيود دفتر الأستاذ المرتبطة بالبيانات الاختبارية
    if car_numbers:
        delete_by_in("financial_ledger", "reference_id", car_numbers)
        # حذف مصروفات السيارات للسيارات الاختبارية
        delete_by_in("car_expenses", "car_number", car_numbers)
    if agency_ids:
        delete_by_in("financial_ledger", "reference_id", [str(x) for x in agency_ids])
        delete_by_in("agency_transactions", "agency_id", agency_ids)
        delete_by_in("agencies", "id", agency_ids)
        
    all_expenses = [str(x) for x in (expense_ids + car_expense_ids)]
    if all_expenses:
        delete_by_in("financial_ledger", "reference_id", all_expenses)
        
    if distribution_ids:
        delete_by_in("financial_ledger", "reference_id", [str(x) for x in distribution_ids])
        try:
            delete_by_in("partner_profit_shares", "distribution_id", distribution_ids)
            delete_by_in("profit_distributions", "id", distribution_ids)
        except sqlite3.OperationalError:
            pass

    # حذف القيود التي تحتوي على العلامة في الملاحظات أو التفاصيل
    cursor.execute("DELETE FROM financial_ledger WHERE notes LIKE ? OR description LIKE ? OR notes LIKE ? OR description LIKE ?", (f"%{AUDIT_MARK}%", f"%{AUDIT_MARK}%", "%[TEST_SEED]%", "%[TEST_SEED]%"))
    cursor.execute("DELETE FROM partner_transactions WHERE notes LIKE ? OR partner_name LIKE ? OR notes LIKE ? OR partner_name LIKE 'اختبار%' OR notes LIKE '%324%' OR notes LIKE '%23f2%' OR notes LIKE '%wef%'", (f"%{AUDIT_MARK}%", f"{AUDIT_PREFIX}%", "%[TEST_SEED]%"))
    cursor.execute("DELETE FROM agency_transactions WHERE notes LIKE ? OR notes LIKE ?", (f"%{AUDIT_MARK}%", "%[TEST_SEED]%"))
    cursor.execute("DELETE FROM cash_register WHERE notes LIKE ? OR description LIKE ? OR notes LIKE ? OR description LIKE ?", (f"%{AUDIT_MARK}%", f"%{AUDIT_MARK}%", "%[TEST_SEED]%", "%[TEST_SEED]%"))
    cursor.execute("DELETE FROM expenses WHERE notes LIKE ? OR description LIKE ? OR notes LIKE ? OR description LIKE 'اختبار%' OR description = 'wef'", (f"%{AUDIT_MARK}%", f"{AUDIT_PREFIX}%", "%[TEST_SEED]%"))
    cursor.execute("DELETE FROM expenses WHERE id NOT IN (SELECT CAST(reference_id AS INTEGER) FROM financial_ledger WHERE reference_type = 'expense')")
    cursor.execute("DELETE FROM car_expenses WHERE description LIKE ? OR description LIKE 'اختبار%'", (f"{AUDIT_PREFIX}%",))
    
    if car_numbers:
        delete_by_in("car_partners", "car_number", car_numbers)
        delete_by_in("cars", "car_number", car_numbers)
        
    if partner_names:
        delete_by_in("partners", "partner_name", partner_names)
        
    # حذف المستخدمين الوهميين
    cursor.execute("DELETE FROM users WHERE username LIKE 'audit_user_%' OR username LIKE 'test_seed_user_%'")
    
    conn.commit()
    print("✅ تم تنظيف كافة بيانات التدقيق والاختبار السابقة بنجاح.")

# دالة مساعدة لكتابة قيد في دفتر الأستاذ المالي (تطابق منطق Rust)
def record_ledger(
    conn: sqlite3.Connection,
    date: str,
    time: str,
    account_type: str,
    account_id: str | None,
    debit: float,
    credit: float,
    currency: str,
    reference_type: str,
    reference_id: str,
    type_: str,
    description: str,
    notes: str | None = None,
):
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO financial_ledger (
            date, time, account_type, account_id, debit, credit, currency, 
            reference_type, reference_id, type_, description, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            date.strip(),
            time.strip(),
            account_type.strip(),
            account_id.strip() if account_id else None,
            debit,
            credit,
            currency.strip(),
            reference_type.strip(),
            str(reference_id).strip(),
            type_.strip(),
            description.strip(),
            notes.strip() if notes else None,
        ),
    )

def distribute_to_partners_50(
    conn: sqlite3.Connection,
    amount: float,
    currency: str,
    date: str,
    time: str,
    payment_type: str,
    tx_type: str,
    notes: str,
):
    """توزيع المبالغ بالتساوي 50% على الشركاء أمير ومنتصر"""
    cursor = conn.cursor()
    partners = ["أمير", "منتصر"]
    per_partner = amount / 2.0
    
    for p_name in partners:
        # إدخال المعاملة في جدول حركات الشركاء
        cursor.execute(
            """
            INSERT INTO partner_transactions (
                partner_name, kind, type, amount, date, time, notes, currency, payment_type
            ) VALUES (?, 'شريك', ?, ?, ?, ?, ?, ?, ?)
            """,
            (p_name, tx_type, per_partner, date, time, notes, currency, payment_type),
        )

def seed_accounts(conn: sqlite3.Connection):
    """تجهيز حسابات الشركاء والجهات الاختبارية"""
    cursor = conn.cursor()
    
    # التأكد من وجود الشركاء الأساسيين
    cursor.execute("INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES ('أمير', '07808425228', 0.0, 'شريك')")
    cursor.execute("INSERT OR IGNORE INTO partners (partner_name, phone, total_amount, kind) VALUES ('منتصر', '07812541714', 0.0, 'شريك')")
    
    # إضافة الحسابات الاختبارية المصنفة
    accounts = [
        (f"{AUDIT_PREFIX} زبون اختبار", "07700000001", "زبون"),
        (f"{AUDIT_PREFIX} مستثمر اختبار", "07700000002", "مستثمر"),
        (f"{AUDIT_PREFIX} ممول اختبار", "07700000003", "ممول"),
        (f"{AUDIT_PREFIX} شركة اختبار", "07700000004", "شركة"),
    ]
    
    for name, phone, kind in accounts:
        cursor.execute(
            """
            INSERT INTO partners (partner_name, phone, total_amount, kind, iqd_balance, usd_balance)
            VALUES (?, ?, 0.0, ?, 0.0, 0.0)
            """,
            (name, phone, kind),
        )
    
    conn.commit()
    print("✅ تم تجهيز الحسابات والشركاء.")

def seed_cars_scenarios(conn: sqlite3.Connection):
    """إدخال السيارات العشر التي تمثل كافة الحالات"""
    cursor = conn.cursor()
    
    # تعريف بيانات السيارات وسيناريوهاتها
    # 1. سيارة شراء كاش ومتوفرة (IQD)
    car_1 = {
        "car_number": "TS-001 بغداد",
        "car_plate_num": "TS-001",
        "chassis_number": "CH-AUDIT-001",
        "car_model": "Camry",
        "car_year": "2022",
        "car_name": "تويوتا كامري متوفرة كاش",
        "color": "أبيض",
        "purchase_price": 10000000.0, # 10 مليون دينار
        "currency": "IQD",
        "status": "متوفرة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "purchase_date": get_date(1),
        "purchase_time": get_time(10),
    }

    # 2. سيارة شراء كاش وبيع كاش (IQD)
    car_2 = {
        "car_number": "TS-002 بغداد",
        "car_plate_num": "TS-002",
        "chassis_number": "CH-AUDIT-002",
        "car_model": "Sportage",
        "car_year": "2021",
        "car_name": "كيا سبورتج كاش كاش",
        "color": "أسود",
        "purchase_price": 10000000.0,
        "selling_price": 15000000.0, # 15 مليون دينار
        "currency": "IQD",
        "status": "مبيوعة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "payment_type": "كاش",
        "amount_paid": 15000000.0,
        "amount_remaining": 0.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(2),
        "purchase_time": get_time(20),
        "sale_date": get_date(5),
        "sale_time": get_time(25),
    }

    # 3. سيارة شراء كاش وبيع أقساط (IQD)
    car_3 = {
        "car_number": "TS-003 بغداد",
        "car_plate_num": "TS-003",
        "chassis_number": "CH-AUDIT-003",
        "car_model": "Elantra",
        "car_year": "2020",
        "car_name": "هيونداي النترا أقساط",
        "color": "فضي",
        "purchase_price": 10000000.0,
        "selling_price": 15000000.0,
        "currency": "IQD",
        "status": "مبيوعة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "payment_type": "اقساط",
        "amount_paid": 3000000.0, # مقدمة 3 مليون
        "amount_remaining": 12000000.0, # متبقي 12 مليون
        "installment_months": 12,
        "monthly_payment": 1000000.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(3),
        "purchase_time": get_time(30),
        "sale_date": get_date(6),
        "sale_time": get_time(35),
    }

    # 4. سيارة شراء كاش وبيع موعد (IQD)
    car_4 = {
        "car_number": "TS-004 بغداد",
        "car_plate_num": "TS-004",
        "chassis_number": "CH-AUDIT-004",
        "car_model": "Tucson",
        "car_year": "2022",
        "car_name": "هيونداي توسان بيع موعد",
        "color": "أحمر",
        "purchase_price": 10000000.0,
        "selling_price": 15000000.0,
        "currency": "IQD",
        "status": "مبيوعة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "payment_type": "موعد",
        "amount_paid": 3000000.0,
        "amount_remaining": 12000000.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(4),
        "purchase_time": get_time(40),
        "sale_date": get_date(7),
        "sale_time": get_time(45),
    }

    # 5. سيارة شراء تمويل وبيع كاش (IQD)
    car_5 = {
        "car_number": "TS-005 بغداد",
        "car_plate_num": "TS-005",
        "chassis_number": "CH-AUDIT-005",
        "car_model": "Sorento",
        "car_year": "2023",
        "car_name": "كيا سورينتو تمويل كاش",
        "color": "رصاصي",
        "purchase_price": 10000000.0,
        "selling_price": 15000000.0,
        "currency": "IQD",
        "status": "مبيوعة",
        "purchase_type": "تمويل",
        "financer_name": f"{AUDIT_PREFIX} ممول اختبار",
        "payment_type": "كاش",
        "amount_paid": 15000000.0,
        "amount_remaining": 0.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(5),
        "purchase_time": get_time(50),
        "sale_date": get_date(8),
        "sale_time": get_time(55),
    }

    # 6. سيارة شراء من شركة وبيع أقساط أو موعد (IQD)
    car_6 = {
        "car_number": "TS-006 بغداد",
        "car_plate_num": "TS-006",
        "chassis_number": "CH-AUDIT-006",
        "car_model": "Optima",
        "car_year": "2020",
        "car_name": "كيا اوبتيما من شركة أقساط",
        "color": "أزرق",
        "purchase_price": 10000000.0,
        "selling_price": 15000000.0,
        "currency": "IQD",
        "status": "مبيوعة",
        "purchase_type": "شركة",
        "financer_name": f"{AUDIT_PREFIX} شركة اختبار",
        "payment_type": "اقساط",
        "amount_paid": 3000000.0,
        "amount_remaining": 12000000.0,
        "installment_months": 12,
        "monthly_payment": 1000000.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(6),
        "purchase_time": get_time(60),
        "sale_date": get_date(9),
        "sale_time": get_time(65),
    }

    # 7. سيارة عليها مصروف ثم تم بيعها (IQD)
    car_7 = {
        "car_number": "TS-007 بغداد",
        "car_plate_num": "TS-007",
        "chassis_number": "CH-AUDIT-007",
        "car_model": "Accent",
        "car_year": "2019",
        "car_name": "هيونداي اكسنت مع مصروف",
        "color": "ماروني",
        "purchase_price": 10000000.0,
        "selling_price": 15000000.0,
        "currency": "IQD",
        "status": "مبيوعة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "payment_type": "كاش",
        "amount_paid": 15000000.0,
        "amount_remaining": 0.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(7),
        "purchase_time": get_time(70),
        "sale_date": get_date(10),
        "sale_time": get_time(75),
        "car_expenses": [
            {"description": f"{AUDIT_PREFIX} تصليح وصبغ", "amount": 500000.0, "date": get_date(8), "time": get_time(72)}
        ]
    }

    # 8. سيارة USD للتأكد من فصل العملات (USD)
    car_8 = {
        "car_number": "TS-008 بغداد",
        "car_plate_num": "TS-008",
        "chassis_number": "CH-AUDIT-008",
        "car_model": "Land Cruiser",
        "car_year": "2024",
        "car_name": "لاندكروزر دولار كاش كاش",
        "color": "لؤلؤي",
        "purchase_price": 10000.0, # 10 آلاف دولار
        "selling_price": 13000.0, # 13 ألف دولار
        "currency": "USD",
        "status": "مبيوعة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "payment_type": "كاش",
        "amount_paid": 13000.0,
        "amount_remaining": 0.0,
        "buyer_name": f"{AUDIT_PREFIX} زبون اختبار",
        "purchase_date": get_date(8),
        "purchase_time": get_time(80),
        "sale_date": get_date(11),
        "sale_time": get_time(85),
        "car_expenses": [
            {"description": f"{AUDIT_PREFIX} غسيل وتلميع دولار", "amount": 500.0, "date": get_date(9), "time": get_time(82)}
        ]
    }

    # 9. سيارة IQD للتأكد من الدينار (متوفرة)
    car_9 = {
        "car_number": "TS-009 بغداد",
        "car_plate_num": "TS-009",
        "chassis_number": "CH-AUDIT-009",
        "car_model": "Cerato",
        "car_year": "2021",
        "car_name": "كيا سيراتو متوفرة دينار",
        "color": "أخضر",
        "purchase_price": 8000000.0,
        "currency": "IQD",
        "status": "متوفرة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "purchase_date": get_date(9),
        "purchase_time": get_time(90),
    }

    # 10. سيارة يتم تعديلها أو إعادة تسجيلها للتأكد من عدم تكرار القيود
    car_10 = {
        "car_number": "TS-010 بغداد",
        "car_plate_num": "TS-010",
        "chassis_number": "CH-AUDIT-010",
        "car_model": "Avalon",
        "car_year": "2020",
        "car_name": "تويوتا افالون معدلة",
        "color": "ذهبي",
        "purchase_price": 12000000.0,
        "currency": "IQD",
        "status": "متوفرة",
        "purchase_type": "كاش",
        "purchase_payment_type": "قاصه",
        "purchase_date": get_date(10),
        "purchase_time": get_time(100),
    }

    all_cars = [car_1, car_2, car_3, car_4, car_5, car_6, car_7, car_8, car_9, car_10]

    for car in all_cars:
        car_number = car["car_number"]
        name = car["car_name"]
        purchase_price = car["purchase_price"]
        curr = car["currency"]
        p_type = car["purchase_type"]
        p_date = car["purchase_date"]
        p_time = car["purchase_time"]
        
        # INSERT INTO cars
        cursor.execute(
            """
            INSERT INTO cars (
                car_number, car_plate_num, chassis_number, car_model, car_year,
                car_name, color, details, purchase_price, currency, sale_currency,
                selling_price, status, payment_type, cash_price, amount_paid,
                amount_remaining, installment_months, monthly_payment, buyer_name,
                buyer_phone, purchase_date, sale_date, purchase_payment_type, purchase_time, 
                sale_time, purchase_type, financer_name, commission_type, commission_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                car_number,
                car["car_plate_num"],
                car["chassis_number"],
                car["car_model"],
                car["car_year"],
                name,
                car["color"],
                f"{AUDIT_MARK} {name}",
                purchase_price,
                curr,
                car.get("sale_currency", curr),
                car.get("selling_price", 0.0),
                car["status"],
                car.get("payment_type"),
                car.get("selling_price") if car.get("payment_type") == "كاش" else None,
                car.get("amount_paid"),
                car.get("amount_remaining"),
                car.get("installment_months"),
                car.get("monthly_payment"),
                car.get("buyer_name"),
                "07700000000" if car.get("buyer_name") else None,
                p_date,
                car.get("sale_date"),
                car.get("purchase_payment_type", "قاصه"),
                p_time,
                car.get("sale_time", "00:00"),
                p_type,
                car.get("financer_name"),
                "لا يوجد",
                0.0
            )
        )

        # إضافة قيود الشراء في الدفتر المالي وحركات الشركاء
        record_ledger(conn, p_date, p_time, "inventory", car_number, purchase_price, 0.0, curr, "car", car_number, "شراء سيارة", f"شراء سيارة: {name} ({car_number})", AUDIT_MARK)
        
        if p_type == "كاش":
            p_reg = car.get("purchase_payment_type", "قاصه")
            record_ledger(conn, p_date, p_time, "cash", p_reg, 0.0, purchase_price, curr, "car", car_number, "شراء سيارة كاش", f"سحب نقدي لشراء سيارة: {name} ({car_number}) من {p_reg}", AUDIT_MARK)
            
            # توزيع 50% سحب شراء سيارة للشركاء
            note = f"سحب شراء سيارة {name} (شاصي: {car['chassis_number']})"
            distribute_to_partners_50(conn, purchase_price, curr, p_date, p_time, p_reg, "سحب شراء سيارة", f"{AUDIT_MARK} {note}")
            
        elif p_type in ["تمويل", "شركة"]:
            acc_type = "funder" if p_type == "تمويل" else "payable"
            f_name = car["financer_name"]
            record_ledger(conn, p_date, p_time, acc_type, f_name, 0.0, purchase_price, curr, "car", car_number, "تمويل شراء سيارة" if p_type == "تمويل" else "شراء سيارة عن طريق شركة", f"تمويل شراء سيارة: {name} ({car_number}) من قبل {f_name}", AUDIT_MARK)
            
            # في Rust يتم كتابة معاملة سحب للممول كأنه سحب من الشركاء 50/50 لتغطية الالتزام لاحقاً
            note = f"سحب شراء سيارة {name} (شاصي: {car['chassis_number']})"
            distribute_to_partners_50(conn, purchase_price, curr, p_date, p_time, "قاصه", "سحب شراء سيارة", f"{AUDIT_MARK} {note}")

        # إضافة المصروفات الخاصة بالسيارة إن وجدت
        expenses_sum = 0.0
        for exp in car.get("car_expenses", []):
            exp_desc = exp["description"]
            exp_amt = exp["amount"]
            exp_date = exp["date"]
            exp_time = exp["time"]
            expenses_sum += exp_amt
            
            # إدراج في جدول car_expenses
            cursor.execute(
                "INSERT INTO car_expenses (car_number, description, amount, date, currency, time) VALUES (?, ?, ?, ?, ?, ?)",
                (car_number, exp_desc, exp_amt, exp_date, curr, exp_time)
            )
            cursor.execute("SELECT last_insert_rowid()")
            exp_id = cursor.fetchone()[0]
            
            # قيود الدفتر المالي للمصروف
            record_ledger(conn, exp_date, exp_time, "inventory", car_number, exp_amt, 0.0, curr, "expense", str(exp_id), "مصروف سيارة", f"مصروف سيارة {car_number} - {exp_desc}", AUDIT_MARK)
            record_ledger(conn, exp_date, exp_time, "cash", "قاصه", 0.0, exp_amt, curr, "expense", str(exp_id), "دفع مصروف سيارة", f"دفع مصروف سيارة: {car_number} - {exp_desc}", AUDIT_MARK)
            
            # توزيع المصروف 50% على الشركاء كـ سحب مصروف
            p_note = f"سحب مصروف سيارة {name} - {exp_desc} (رقم المصروف: {exp_id})"
            distribute_to_partners_50(conn, exp_amt, curr, exp_date, exp_time, "قاصه", "سحب مصروف", f"{AUDIT_MARK} {p_note}")

        # إضافة قيود البيع إن كانت مبيوعة
        if car["status"] == "مبيوعة":
            s_date = car["sale_date"]
            s_time = car["sale_time"]
            selling_price = car["selling_price"]
            s_curr = car.get("sale_currency", curr)
            payment_type = car["payment_type"]
            amount_paid = car["amount_paid"]
            amount_remaining = car["amount_remaining"]
            buyer = car["buyer_name"]
            
            # قيد الإيراد الكلي
            record_ledger(conn, s_date, s_time, "revenue", car_number, 0.0, selling_price, s_curr, "car", car_number, "بيع سيارة", f"إيراد بيع سيارة {name} ({car_number}) إلى {buyer}", AUDIT_MARK)
            
            if payment_type == "كاش":
                # قيد صندوق الكاش
                record_ledger(conn, s_date, s_time, "cash", "قاصه", selling_price, 0.0, s_curr, "car", car_number, "بيع سيارة كاش", f"استلام نقدي بيع سيارة {name} ({car_number})", AUDIT_MARK)
                
                # توزيع التكلفة والربح كاش على الشركاء
                total_cost = purchase_price + expenses_sum
                
                # 1. إيداع بيع سيارة (إرجاع التكلفة) 50/50
                cost_note = f"ايداع بيع سيارة {name} {car['chassis_number']}"
                distribute_to_partners_50(conn, total_cost, curr, s_date, s_time, "قاصه", "ايداع بيع سيارة", f"{AUDIT_MARK} {cost_note}")
                
                # 2. إيداع أرباح سيارة 50/50 (فقط عند تطابق العملة والربح إيجابي)
                if curr == s_curr:
                    profit = selling_price - total_cost
                    if profit > 0.0:
                        profit_note = f"ايداع ارباح سيارة {name} {car['chassis_number']}"
                        distribute_to_partners_50(conn, profit, curr, s_date, s_time, "قاصه", "ايداع ارباح سيارة", f"{AUDIT_MARK} {profit_note}")
            else:
                # بيع أقساط أو موعد
                if amount_paid > 0.0:
                    record_ledger(conn, s_date, s_time, "cash", "قاصه", amount_paid, 0.0, s_curr, "car", car_number, "مقدمة سيارة", f"مقدمة سيارة {name} ({car_number})", AUDIT_MARK)
                    
                    # إدخال معاملة مقدمة للزبون في جدول حركات الشركاء
                    cursor.execute(
                        """
                        INSERT INTO partner_transactions (
                            partner_name, kind, type, amount, date, time, notes, currency, payment_type
                        ) VALUES (?, 'زبون', 'مقدمة', ?, ?, ?, ?, ?, 'قاصه')
                        """,
                        (buyer, amount_paid, s_date, s_time, f"{AUDIT_MARK} مقدمة بيع سيارة {name} (شاصي: {car['chassis_number']})", s_curr)
                    )
                    
                if amount_remaining > 0.0:
                    record_ledger(conn, s_date, s_time, "receivable", buyer, amount_remaining, 0.0, s_curr, "car", car_number, "مدينون بيع سيارة", f"ذمة مدينة متبقية بيع سيارة {name} ({car_number}) على {buyer}", AUDIT_MARK)
            
            # قيد تكلفة المبيعات وتخفيض المخزون
            total_cogs = purchase_price + expenses_sum
            if total_cogs > 0.0:
                record_ledger(conn, s_date, s_time, "expense", car_number, total_cogs, 0.0, curr, "car", car_number, "تكلفة المبيعات", f"تكلفة بيع سيارة {name} ({car_number})", AUDIT_MARK)
                record_ledger(conn, s_date, s_time, "inventory", car_number, 0.0, total_cogs, curr, "car", car_number, "تخفيض المخزون بيع سيارة", f"إخراج سيارة {name} ({car_number}) من المخزون", AUDIT_MARK)

    conn.commit()
    print("✅ تم تعبئة بيانات السيارات العشر مع القيود وتوزيعات التكلفة والربح.")

def seed_financial_transactions(conn: sqlite3.Connection):
    """إدخال حركات محاسبية عامة مثل إيداعات وسحوبات الشركاء والجهات العامة"""
    cursor = conn.cursor()
    
    # 1. شريك إيداع وسحب
    # إيداع أمير 50 مليون دينار كاش
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES ('أمير', 'شريك', 'ايداع', 50000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (get_date(12), get_time(10), f"{AUDIT_MARK} إيداع شريك أمير")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(12), get_time(10), "cash", "قاصه", 50000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "ايداع شريك", f"إيداع شريك: أمير", AUDIT_MARK)
    record_ledger(conn, get_date(12), get_time(10), "capital", "أمير", 0.0, 50000000.0, "IQD", "partner_transaction", str(tx_id), "ايداع شريك رأس مال", f"إيداع رأس مال الشريك أمير", AUDIT_MARK)

    # سحب منتصر 2 مليون دينار كاش (مسحوبات شخصية)
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES ('منتصر', 'شريك', 'سحب شريك', 2000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (get_date(13), get_time(15), f"{AUDIT_MARK} سحب شريك منتصر")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(13), get_time(15), "drawings", "منتصر", 2000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "سحب شريك مصروف", f"مسحوبات الشريك منتصر", AUDIT_MARK)
    record_ledger(conn, get_date(13), get_time(15), "cash", "قاصه", 0.0, 2000000.0, "IQD", "partner_transaction", str(tx_id), "سحب شريك", f"سحب نقدي شريك: منتصر", AUDIT_MARK)

    # 2. مستثمر إيداع وسحب
    # إيداع مستثمر اختبار 10 آلاف دولار
    m_investor = f"{AUDIT_PREFIX} مستثمر اختبار"
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'مستثمر', 'ايداع', 10000.0, ?, ?, ?, 'USD', 'قاصه')
        """,
        (m_investor, get_date(14), get_time(20), f"{AUDIT_MARK} إيداع مستثمر دولار")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(14), get_time(20), "cash", "قاصه", 10000.0, 0.0, "USD", "partner_transaction", str(tx_id), "ايداع مستثمر", f"إيداع مستثمر: {m_investor}", AUDIT_MARK)
    record_ledger(conn, get_date(14), get_time(20), "investor", m_investor, 0.0, 10000.0, "USD", "partner_transaction", str(tx_id), "ايداع مستثمر اموال", f"إيداع أموال المستثمر {m_investor}", AUDIT_MARK)

    # سحب مستثمر اختبار 3 آلاف دولار
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'مستثمر', 'سحب', 3000.0, ?, ?, ?, 'USD', 'قاصه')
        """,
        (m_investor, get_date(15), get_time(25), f"{AUDIT_MARK} سحب مستثمر دولار")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(15), get_time(25), "investor", m_investor, 3000.0, 0.0, "USD", "partner_transaction", str(tx_id), "سحب مستثمر اموال", f"سحب أموال المستثمر {m_investor}", AUDIT_MARK)
    record_ledger(conn, get_date(15), get_time(25), "cash", "قاصه", 0.0, 3000.0, "USD", "partner_transaction", str(tx_id), "سحب مستثمر", f"سحب نقدي مستثمر: {m_investor}", AUDIT_MARK)
    
    # توزيع سداد المستثمر 50/50 على الشركاء في جدول حركات الشركاء
    distribute_to_partners_50(conn, 3000.0, "USD", get_date(15), get_time(25), "قاصه", "سحب تسديد", f"{AUDIT_MARK} سحب لتسديد المستثمر {m_investor}")

    # 3. ممول إيداع وتسديد
    m_funder = f"{AUDIT_PREFIX} ممول اختبار"
    # إيداع تمويل 20 مليون دينار (لا يدخل القاصة مباشرة بل يمثل استلام تمويل خارجي)
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'ممول', 'ايداع', 20000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (m_funder, get_date(16), get_time(30), f"{AUDIT_MARK} استلام تمويل خارجي")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(16), get_time(30), "funder", m_funder, 0.0, 20000000.0, "IQD", "partner_transaction", str(tx_id), "تمويل ممول اموال", f"استلام تمويل من الممول {m_funder}", AUDIT_MARK)
    record_ledger(conn, get_date(16), get_time(30), "cash", "قاصه", 20000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "تمويل ممول نقدي", f"استلام نقدي من الممول: {m_funder}", AUDIT_MARK)
    
    # تسديد الممول 5 مليون دينار كاش من القاصة
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'ممول', 'سحب', 5000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (m_funder, get_date(17), get_time(35), f"{AUDIT_MARK} تسديد للممول كاش")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(17), get_time(35), "funder", m_funder, 5000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "سداد ممول اموال", f"تسديد تمويل للممول {m_funder}", AUDIT_MARK)
    record_ledger(conn, get_date(17), get_time(35), "cash", "قاصه", 0.0, 5000000.0, "IQD", "partner_transaction", str(tx_id), "سداد ممول نقدي", f"سداد نقدي للممول: {m_funder}", AUDIT_MARK)
    
    # توزيع سداد الممول 50/50 على الشركاء في جدول حركات الشركاء
    distribute_to_partners_50(conn, 5000000.0, "IQD", get_date(17), get_time(35), "قاصه", "سحب تسديد", f"{AUDIT_MARK} سحب لتسديد الممول {m_funder}")

    # 4. شركة إيداع أو سحب
    m_company = f"{AUDIT_PREFIX} شركة اختبار"
    # سداد للشركة 4 مليون دينار كاش من القاصة
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'شركة', 'سحب', 4000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (m_company, get_date(18), get_time(40), f"{AUDIT_MARK} تسديد للشركة كاش سحب نقدي")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(18), get_time(40), "payable", m_company, 4000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "سحب شركة اموال", f"سحب حساب شركة {m_company}", AUDIT_MARK)
    record_ledger(conn, get_date(18), get_time(40), "cash", "قاصه", 0.0, 4000000.0, "IQD", "partner_transaction", str(tx_id), "سحب شركة نقدي", f"سداد نقدي لحساب الشركة: {m_company}", AUDIT_MARK)
    
    # توزيع سداد الشركة 50/50 على الشركاء
    distribute_to_partners_50(conn, 4000000.0, "IQD", get_date(18), get_time(40), "قاصه", "سحب تسديد", f"{AUDIT_MARK} سحب لتسديد الشركة {m_company}")

    # 5. تسديد أقساط زبون
    # الزبون يسدد قسطاً جزئياً ثم يغلق كامل متبقي السيارة النترا TS-003.
    m_buyer = f"{AUDIT_PREFIX} زبون اختبار"
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'زبون', 'تسديد قسط', 1000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (m_buyer, get_date(19), get_time(45), f"{AUDIT_MARK} تسديد قسط سيارة هيونداي النترا (شاصي: CH-AUDIT-003)")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(19), get_time(45), "cash", "قاصه", 1000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "ايداع زبون", f"إيداع زبون: {m_buyer}", AUDIT_MARK)
    record_ledger(conn, get_date(19), get_time(45), "receivable", m_buyer, 0.0, 1000000.0, "IQD", "partner_transaction", str(tx_id), "ايداع زبون مديونية", f"تخفيض مديونية الزبون {m_buyer}", AUDIT_MARK)

    # تسديد كامل باقي أقساط TS-003: 11,000,000 بعد القسط الجزئي، ثم توزيع الكلفة والربح على الشركاء.
    cursor.execute(
        """
        INSERT INTO partner_transactions (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, 'زبون', 'تسديد قسط', 11000000.0, ?, ?, ?, 'IQD', 'قاصه')
        """,
        (m_buyer, get_date(19), get_time(50), f"{AUDIT_MARK} تسديد كامل أقساط سيارة هيونداي النترا (شاصي: CH-AUDIT-003)")
    )
    tx_id = cursor.lastrowid
    record_ledger(conn, get_date(19), get_time(50), "cash", "قاصه", 11000000.0, 0.0, "IQD", "partner_transaction", str(tx_id), "ايداع زبون", f"إيداع إغلاق أقساط زبون: {m_buyer}", AUDIT_MARK)
    record_ledger(conn, get_date(19), get_time(50), "receivable", m_buyer, 0.0, 11000000.0, "IQD", "partner_transaction", str(tx_id), "ايداع زبون مديونية", f"إغلاق مديونية السيارة TS-003 للزبون {m_buyer}", AUDIT_MARK)

    distribute_to_partners_50(
        conn,
        10000000.0,
        "IQD",
        get_date(19),
        get_time(50),
        "قاصه",
        "ايداع بيع سيارة",
        f"{AUDIT_MARK} ايداع بيع سيارة هيونداي النترا أقساط CH-AUDIT-003 بعد تسديد كامل الأقساط",
    )
    distribute_to_partners_50(
        conn,
        5000000.0,
        "IQD",
        get_date(19),
        get_time(50),
        "قاصه",
        "ايداع ارباح سيارة",
        f"{AUDIT_MARK} ايداع ارباح سيارة هيونداي النترا أقساط CH-AUDIT-003 بعد تسديد كامل الأقساط",
    )

    # 6. مصروف عام
    # مصروف كهرباء وإنترنت 200,000 دينار
    cursor.execute(
        """
        INSERT INTO expenses (description, amount, date, time, notes, currency, car_number)
        VALUES ('مصروف كهرباء وإنترنت', 200000.0, ?, ?, ?, 'IQD', NULL)
        """,
        (get_date(20), get_time(50), f"{AUDIT_MARK} مصروف تشغيلي")
    )
    exp_id = cursor.lastrowid
    record_ledger(conn, get_date(20), get_time(50), "expense", "مصروف كهرباء وإنترنت", 200000.0, 0.0, "IQD", "expense", str(exp_id), "مصروف عام", "مصروف كهرباء وإنترنت", AUDIT_MARK)
    record_ledger(conn, get_date(20), get_time(50), "cash", "قاصه", 0.0, 200000.0, "IQD", "expense", str(exp_id), "دفع مصروف", "دفع مصروف: مصروف كهرباء وإنترنت", AUDIT_MARK)
    
    # توزيع المصروف 50% على الشركاء
    distribute_to_partners_50(conn, 200000.0, "IQD", get_date(20), get_time(50), "قاصه", "سحب مصروف", f"{AUDIT_MARK} سحب مصروف مصروف كهرباء وإنترنت")

    # 7. وكالات وحركاتها
    # إدراج وكالة بربح 150,000 دينار (IQD)
    cursor.execute(
        """
        INSERT INTO agencies (
            old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time
        ) VALUES ('بائع اختبار اول', 'خصوصي', '11111 بغداد', '2018', 'سلفر', 'مشتري اختبار اول', '07900000001', 0.0, 150000.0, ?, ?, ?)
        """,
        (f"{AUDIT_MARK} وكالة بربح دينار", get_date(21), get_time(55))
    )
    agency_id_1 = cursor.lastrowid
    record_ledger(conn, get_date(21), get_time(55), "cash", "قاصه", 150000.0, 0.0, "IQD", "agency", str(agency_id_1), "أرباح وكالة", f"وكالة بائع اختبار اول مشتري اختبار اول", AUDIT_MARK)
    record_ledger(conn, get_date(21), get_time(55), "revenue", "agency", 0.0, 150000.0, "IQD", "agency", str(agency_id_1), "أرباح وكالة إيراد", f"وكالة بائع اختبار اول مشتري اختبار اول", AUDIT_MARK)
    
    # توزيع ربح الوكالة 50% على الشركاء
    distribute_to_partners_50(conn, 150000.0, "IQD", get_date(21), get_time(55), "قاصه", "ايداع ارباح وكالة", f"{AUDIT_MARK} ايداع ارباح وكالة بائع اختبار اول مشتري اختبار اول رئيسي")

    # إدراج وكالة بربح 100 دولار (USD)
    cursor.execute(
        """
        INSERT INTO agencies (
            old_agent_name, car_type, car_number, car_model, color, new_agent_name, phone, amount_usd, amount_iqd, notes, date, time
        ) VALUES ('بائع اختبار ثان', 'خصوصي', '22222 بغداد', '2020', 'أبيض', 'مشتري اختبار ثان', '07900000002', 100.0, 0.0, ?, ?, ?)
        """,
        (f"{AUDIT_MARK} وكالة بربح دولار", get_date(22), get_time(60))
    )
    agency_id_2 = cursor.lastrowid
    record_ledger(conn, get_date(22), get_time(60), "cash", "قاصه", 100.0, 0.0, "USD", "agency", str(agency_id_2), "أرباح وكالة", f"وكالة بائع اختبار ثان مشتري اختبار ثان", AUDIT_MARK)
    record_ledger(conn, get_date(22), get_time(60), "revenue", "agency", 0.0, 100.0, "USD", "agency", str(agency_id_2), "أرباح وكالة إيراد", f"وكالة بائع اختبار ثان مشتري اختبار ثان", AUDIT_MARK)
    
    # توزيع ربح الوكالة 50% على الشركاء بالدولار
    distribute_to_partners_50(conn, 100.0, "USD", get_date(22), get_time(60), "قاصه", "ايداع ارباح وكالة", f"{AUDIT_MARK} ايداع ارباح وكالة بائع اختبار ثان مشتري اختبار ثان رئيسي")

    # حركة وكالة إيداع 50,000 دينار على الوكالة الأولى
    cursor.execute(
        "INSERT INTO agency_transactions (agency_id, date, time, type_, amount, currency, notes) VALUES (?, ?, ?, 'ايداع', 50000.0, 'IQD', ?)",
        (agency_id_1, get_date(23), get_time(65), f"{AUDIT_MARK} حركة إيداع")
    )
    ag_tx_id_1 = cursor.lastrowid
    record_ledger(conn, get_date(23), get_time(65), "cash", "قاصه", 50000.0, 0.0, "IQD", "agency_transaction", str(ag_tx_id_1), "إيداع وكالة", f"إيداع حركة وكالة رقم {agency_id_1}", AUDIT_MARK)
    record_ledger(conn, get_date(23), get_time(65), "revenue", "agency", 0.0, 50000.0, "IQD", "agency_transaction", str(ag_tx_id_1), "إيداع وكالة إيراد", f"إيراد حركة وكالة رقم {agency_id_1}", AUDIT_MARK)
    
    # توزيع حركة وكالة إيداع 50% على الشركاء
    distribute_to_partners_50(conn, 50000.0, "IQD", get_date(23), get_time(65), "قاصه", "ايداع ارباح وكالة", f"{AUDIT_MARK} ايداع ارباح وكالة بائع اختبار اول مشتري اختبار اول حركة")

    # حركة وكالة سحب 20 دولار على الوكالة الثانية
    cursor.execute(
        "INSERT INTO agency_transactions (agency_id, date, time, type_, amount, currency, notes) VALUES (?, ?, ?, 'سحب', 20.0, 'USD', ?)",
        (agency_id_2, get_date(24), get_time(70), f"{AUDIT_MARK} حركة سحب")
    )
    ag_tx_id_2 = cursor.lastrowid
    record_ledger(conn, get_date(24), get_time(70), "revenue", "agency", 20.0, 0.0, "USD", "agency_transaction", str(ag_tx_id_2), "سحب وكالة إيراد", f"تخفيض إيراد حركة وكالة رقم {agency_id_2}", AUDIT_MARK)
    record_ledger(conn, get_date(24), get_time(70), "cash", "قاصه", 0.0, 20.0, "USD", "agency_transaction", str(ag_tx_id_2), "سحب وكالة", f"سحب نقدي حركة وكالة رقم {agency_id_2}", AUDIT_MARK)
    
    # توزيع حركة وكالة سحب 50% على الشركاء
    distribute_to_partners_50(conn, 20.0, "USD", get_date(24), get_time(70), "قاصه", "سحب مصروف", f"{AUDIT_MARK} سحب مصروف حركة وكالة بائع اختبار ثان مشتري اختبار ثان")

    conn.commit()
    print("✅ تم تسجيل العمليات المالية والوكالات وحركاتها.")



def recalculate_partners_balances(conn: sqlite3.Connection):
    """إعادة احتساب الأرصدة التراكمية في جدول partners بناءً على جدول الحركات"""
    cursor = conn.cursor()
    cursor.execute("SELECT partner_name, kind FROM partners")
    rows = cursor.fetchall()
    
    for name, kind in rows:
        # حساب إجمالي الإيداعات بالدينار
        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'IQD'
            AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
            AND type NOT LIKE 'تحويل%'
            """,
            (name, kind)
        )
        dep_iqd = cursor.fetchone()[0]
        
        # حساب إجمالي السحوبات بالدينار
        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'IQD'
            AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
            AND type NOT LIKE 'تحويل%'
            """,
            (name, kind)
        )
        draw_iqd = cursor.fetchone()[0]
        
        # حساب إجمالي الإيداعات بالدولار
        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'USD'
            AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
            AND type NOT LIKE 'تحويل%'
            """,
            (name, kind)
        )
        dep_usd = cursor.fetchone()[0]
        
        # حساب إجمالي السحوبات بالدولار
        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
            WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'USD'
            AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
            AND type NOT LIKE 'تحويل%'
            """,
            (name, kind)
        )
        draw_usd = cursor.fetchone()[0]
        
        # تطبيق نفس المنطق المستخدم في Rust لتحديث الأرصدة
        if kind == "زبون":
            cursor.execute(
                """
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'IQD'
                AND type LIKE 'باقي%'
                AND type NOT LIKE 'تحويل%'
                """,
                (name, kind)
            )
            draw_iqd = cursor.fetchone()[0]
            cursor.execute(
                """
                SELECT COALESCE(SUM(amount), 0.0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'USD'
                AND type LIKE 'باقي%'
                AND type NOT LIKE 'تحويل%'
                """,
                (name, kind)
            )
            draw_usd = cursor.fetchone()[0]
            iqd, usd = draw_iqd, draw_usd
        elif kind in ["مستثمر", "ممول", "شركة"]:
            iqd, usd = draw_iqd - dep_iqd, draw_usd - dep_usd
        else: # شريك
            iqd, usd = dep_iqd - draw_iqd, dep_usd - draw_usd
            
        cursor.execute(
            "UPDATE partners SET total_amount = ?, iqd_balance = ?, usd_balance = ? WHERE partner_name = ? AND kind = ?",
            (iqd + usd, iqd, usd, name, kind)
        )
        
    conn.commit()
    print("✅ تم إعادة احتساب أرصدة الحسابات الإجمالية وتحديث جدول partners.")

def seed_everything(db_path: Path):
    """تشغيل كافة خطوات حقن السيناريوهات داخل قاعدة البيانات"""
    make_backup(db_path)
    
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    
    try:
        conn.execute("BEGIN TRANSACTION")
        cleanup_audit_data(conn)
        seed_accounts(conn)
        seed_cars_scenarios(conn)
        seed_financial_transactions(conn)
        recalculate_partners_balances(conn)
        conn.commit()
        print("🎉 تم حقن كافة سيناريوهات الاختبار المحاسبي [PY_AUDIT] بنجاح!")
    except Exception as e:
        conn.rollback()
        print(f"❌ حدث خطأ أثناء الحقن وتم التراجع عن كافة التغييرات: {e}")
        raise e
    finally:
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="حقن سيناريوهات اختبار التدقيق المحاسبي لقاعدة بيانات فجر الوادي")
    parser.add_argument("--db", default="src-tauri/fjr_alwadi_data.db", help="مسار قاعدة البيانات SQLite")
    args = parser.parse_args()
    
    db_path = Path(args.db).resolve()
    seed_everything(db_path)

if __name__ == "__main__":
    main()
