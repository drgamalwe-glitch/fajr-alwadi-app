#!/usr/bin/env python3
"""
سكربت تعبئة بيانات اختبارية لبرنامج فجر الوادي.

يشغل من مسار البرنامج الرئيسي:
    python3 test.py

السكربت يعمل مباشرة على قاعدة البيانات الأصلية، يحذف بيانات الاختبار السابقة فقط،
ثم يحقن سيارات وحسابات وحركات ووكالات ومصروفات تغطي كل جزء من البرنامج واختبار كافة الحقول.
"""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "src-tauri" / "fjr_alwadi_data.db"
TEST_MARK = "[TEST_SEED]"
TEST_PREFIX = "اختبار"
BASE_DATE = datetime(2026, 6, 1)


@dataclass(frozen=True)
class Account:
    name: str
    phone: str
    kind: str


def day(offset: int) -> str:
    return (BASE_DATE + timedelta(days=offset)).strftime("%Y-%m-%d")


def clock(offset: int) -> str:
    return f"{8 + (offset % 10):02d}:{(offset * 7) % 60:02d}"


def round_amount(idx: int, base: int, step: int) -> float:
    """
    يولّد مبلغاً مالياً "نظيفاً" قابلاً للتحقق اليدوي بالعين المجردة
    (مضاعفات صحيحة لـ base/step مثل ١٠، ١٠٠، ١٠٠٠، ١٠٠٠٠، ١٠٠٠٠٠، ١٠٠٠٠٠٠)
    بدل أرقام عشوائية صعبة الجمع والطرح ذهنياً عند تتبع الأخطاء.
    idx يبدأ من 1 فما فوق.
    """
    return float(base + (idx - 1) * step)


def half(amount: float) -> float:
    """نصف المبلغ بالضبط — يبقى رقماً صحيحاً ونظيفاً طالما المبلغ الأصلي مضاعف زوجي."""
    return amount / 2


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise FileNotFoundError(f"لم أجد قاعدة البيانات: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def execute(conn: sqlite3.Connection, sql: str, params: Iterable = ()) -> sqlite3.Cursor:
    return conn.execute(sql, tuple(params))


def record_ledger(
    conn: sqlite3.Connection,
    *,
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
) -> None:
    execute(
        conn,
        """
        INSERT INTO financial_ledger
            (date, time, account_type, account_id, debit, credit, currency,
             reference_type, reference_id, type_, description, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            reference_id.strip(),
            type_.strip(),
            description.strip(),
            notes.strip() if notes else None,
        ),
    )


def cleanup_previous_seed(conn: sqlite3.Connection) -> None:
    car_numbers = [
        r["car_number"]
        for r in conn.execute(
            "SELECT car_number FROM cars WHERE details LIKE ? OR car_number LIKE 'TS-%'",
            (f"%{TEST_MARK}%",),
        )
    ]
    partner_names = [
        r["partner_name"]
        for r in conn.execute(
            "SELECT partner_name FROM partners WHERE partner_name LIKE ?",
            (f"{TEST_PREFIX}%",),
        )
    ]
    agency_ids = [
        str(r["id"])
        for r in conn.execute("SELECT id FROM agencies WHERE notes LIKE ?", (f"%{TEST_MARK}%",))
    ]
    expense_ids = [
        str(r["id"])
        for r in conn.execute(
            "SELECT id FROM expenses WHERE notes LIKE ? OR description LIKE ?",
            (f"%{TEST_MARK}%", f"{TEST_PREFIX}%"),
        )
    ]
    car_expense_ids = [
        str(r["id"])
        for r in conn.execute(
            "SELECT id FROM car_expenses WHERE description LIKE ? OR car_number LIKE 'TS-%'",
            (f"{TEST_PREFIX}%",),
        )
    ]
    distribution_ids = [
        str(r["id"])
        for r in conn.execute(
            "SELECT id FROM profit_distributions WHERE notes LIKE ?", (f"%{TEST_MARK}%",)
        )
    ]

    def delete_in(table: str, column: str, values: list[str]) -> None:
        if not values:
            return
        placeholders = ",".join("?" for _ in values)
        execute(conn, f"DELETE FROM {table} WHERE {column} IN ({placeholders})", values)

    for reference_type, ids in (
        ("car", car_numbers),
        ("agency", agency_ids),
        ("expense", expense_ids + car_expense_ids),
        ("profit_distribution", distribution_ids),
    ):
        delete_in("financial_ledger", "reference_id", ids)
        if ids:
            execute(
                conn,
                f"DELETE FROM financial_ledger WHERE reference_type = ? AND reference_id IN ({','.join('?' for _ in ids)})",
                [reference_type, *ids],
            )

    execute(conn, "DELETE FROM financial_ledger WHERE notes LIKE ? OR description LIKE ?", (f"%{TEST_MARK}%", f"%{TEST_MARK}%"))
    execute(conn, "DELETE FROM partner_transactions WHERE notes LIKE ? OR partner_name LIKE ?", (f"%{TEST_MARK}%", f"{TEST_PREFIX}%"))
    execute(conn, "DELETE FROM agency_transactions WHERE notes LIKE ?", (f"%{TEST_MARK}%",))
    execute(conn, "DELETE FROM cash_register WHERE notes LIKE ? OR description LIKE ?", (f"%{TEST_MARK}%", f"%{TEST_MARK}%"))
    execute(conn, "DELETE FROM users WHERE username LIKE 'test_seed_%'")

    delete_in("partner_profit_shares", "distribution_id", distribution_ids)
    delete_in("profit_distributions", "id", distribution_ids)
    delete_in("agency_transactions", "agency_id", agency_ids)
    delete_in("agencies", "id", agency_ids)
    delete_in("expenses", "id", expense_ids)
    delete_in("car_expenses", "id", car_expense_ids)
    delete_in("car_partners", "car_number", car_numbers)
    delete_in("cars", "car_number", car_numbers)

    if partner_names:
        placeholders = ",".join("?" for _ in partner_names)
        execute(conn, f"DELETE FROM partners WHERE partner_name IN ({placeholders})", partner_names)


def add_partner(conn: sqlite3.Connection, account: Account) -> None:
    execute(
        conn,
        """
        INSERT INTO partners (partner_name, phone, total_amount, kind)
        VALUES (?, ?, 0.0, ?)
        ON CONFLICT(partner_name, kind) DO UPDATE SET phone = excluded.phone
        """,
        (account.name, account.phone, account.kind),
    )


def is_deposit(tx_type: str) -> bool:
    return tx_type.startswith(("ايداع", "إيداع", "مقدمة", "تسديد", "استلام", "إستلام"))


def record_partner_ledger(conn: sqlite3.Connection, tx_id: int) -> None:
    tx = conn.execute(
        """
        SELECT partner_name, kind, type, amount, date, COALESCE(notes, '') AS notes,
               COALESCE(currency, 'IQD') AS currency,
               COALESCE(payment_type, 'قاصه') AS payment_type,
               COALESCE(time, '00:00') AS time
        FROM partner_transactions WHERE id = ?
        """,
        (tx_id,),
    ).fetchone()
    if not tx:
        return

    name = tx["partner_name"]
    kind = tx["kind"]
    tx_type = tx["type"]
    amount = float(tx["amount"])
    date = tx["date"]
    time = tx["time"]
    notes = tx["notes"]
    currency = tx["currency"]
    payment_type = tx["payment_type"]
    ref_id = str(tx_id)

    if (
        tx_type.startswith(("سحب شراء سيارة", "ايداع بيع سيارة", "مقدمة بيع سيارة", "سحب مصروف", "سحب تسديد"))
        or tx_type.startswith(("ايداع ارباح وكالة", "ايداع ارباح سيارة", "تسديد قسط"))
        or tx_type.startswith(("باقي", "تحويل", "توزيع أرباح", "سحب أرباح", "تسوية مسحوبات", "إعادة استثمار"))
        or "شراكة سيارة" in notes
    ):
        return

    dep = is_deposit(tx_type)
    if kind == "شريك":
        if dep:
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع شريك", description=f"إيداع شريك: {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="capital", account_id=name, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع شريك رأس مال", description=f"إيداع رأس مال الشريك {name}", notes=notes)
        elif tx_type.startswith("سحب"):
            record_ledger(conn, date=date, time=time, account_type="drawings", account_id=name, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب شريك مصروف", description=f"مسحوبات الشريك {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب شريك", description=f"سحب نقدي شريك: {name}", notes=notes)
    elif kind == "مستثمر":
        if dep:
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع مستثمر", description=f"إيداع مستثمر: {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="investor", account_id=name, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع مستثمر اموال", description=f"إيداع أموال المستثمر {name}", notes=notes)
        else:
            record_ledger(conn, date=date, time=time, account_type="investor", account_id=name, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب مستثمر اموال", description=f"سحب أموال المستثمر {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب مستثمر", description=f"سحب نقدي مستثمر: {name}", notes=notes)
    elif kind == "ممول":
        if dep:
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع ممول", description=f"إيداع ممول: {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="funder", account_id=name, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="تمويل ممول اموال", description=f"استلام تمويل من الممول {name}", notes=notes)
        else:
            record_ledger(conn, date=date, time=time, account_type="funder", account_id=name, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سداد ممول اموال", description=f"تسديد تمويل للممول {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سداد ممول نقدي", description=f"سداد نقدي للممول: {name}", notes=notes)
    elif kind == "شركة":
        if dep:
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع شركة", description=f"إيداع شركة: {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="payable", account_id=name, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ايداع شركة اموال", description=f"إيداع حساب شركة {name}", notes=notes)
        else:
            record_ledger(conn, date=date, time=time, account_type="payable", account_id=name, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب شركة اموال", description=f"سحب حساب شركة {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب شركة نقدي", description=f"سداد نقدي لحساب الشركة: {name}", notes=notes)
    elif kind == "زبون":
        if dep:
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="تسديد قسط", description=f"تسديد قسط من {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="receivable", account_id=name, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="تسديد قسط", description=f"تخفيض ذمة مدين {name}", notes=notes)
        else:
            record_ledger(conn, date=date, time=time, account_type="receivable", account_id=name, debit=amount, credit=0.0, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="ذمة مدينة جديدة", description=f"زيادة ذمة مدين {name}", notes=notes)
            record_ledger(conn, date=date, time=time, account_type="cash", account_id=payment_type, debit=0.0, credit=amount, currency=currency, reference_type="partner_transaction", reference_id=ref_id, type_="سحب مدين نقدي", description=f"سحب نقدي مدين: {name}", notes=notes)


def add_partner_transaction(
    conn: sqlite3.Connection,
    *,
    partner_name: str,
    kind: str,
    type_: str,
    amount: float,
    date: str,
    time: str,
    notes: str,
    currency: str,
    payment_type: str,
) -> int:
    execute(
        conn,
        """
        INSERT INTO partner_transactions
            (partner_name, kind, type, amount, date, time, notes, currency, payment_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (partner_name, kind, type_, amount, date, time, notes, currency, payment_type),
    )
    tx_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    record_partner_ledger(conn, tx_id)
    return tx_id


def partner_names_for_distribution(conn: sqlite3.Connection) -> list[str]:
    names = [
        r["partner_name"]
        for r in conn.execute(
            "SELECT partner_name FROM partners WHERE kind = 'شريك' ORDER BY partner_name"
        )
    ]
    return names


def distribute_to_partners(
    conn: sqlite3.Connection,
    *,
    amount: float,
    currency: str,
    date: str,
    time: str,
    payment_type: str,
    type_: str,
    notes: str,
) -> None:
    names = partner_names_for_distribution(conn)
    if not names:
        return
    each = amount / len(names)
    for name in names:
        add_partner_transaction(
            conn,
            partner_name=name,
            kind="شريك",
            type_=type_,
            amount=each,
            date=date,
            time=time,
            notes=notes,
            currency=currency,
            payment_type=payment_type,
        )


def add_car_expense(
    conn: sqlite3.Connection,
    *,
    car_number: str,
    description: str,
    amount: float,
    date: str,
    time: str,
    currency: str,
) -> int:
    execute(
        conn,
        "INSERT INTO car_expenses (car_number, description, amount, date, currency, time) VALUES (?, ?, ?, ?, ?, ?)",
        (car_number, description, amount, date, currency, time),
    )
    exp_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    record_ledger(conn, date=date, time=time, account_type="inventory", account_id=car_number, debit=amount, credit=0.0, currency=currency, reference_type="expense", reference_id=str(exp_id), type_="مصروف سيارة", description=f"مصروف سيارة {car_number} - {description}", notes=TEST_MARK)
    record_ledger(conn, date=date, time=time, account_type="cash", account_id="قاصه", debit=0.0, credit=amount, currency=currency, reference_type="expense", reference_id=str(exp_id), type_="دفع مصروف سيارة", description=f"دفع مصروف سيارة: {car_number} - {description}", notes=TEST_MARK)
    distribute_to_partners(conn, amount=amount, currency=currency, date=date, time=time, payment_type="قاصه", type_="سحب مصروف", notes=f"{TEST_MARK} سحب مصروف سيارة {car_number} - {description} (رقم المصروف: {exp_id})")
    return exp_id


def record_car_ledger(conn: sqlite3.Connection, car_number: str) -> None:
    car = conn.execute("SELECT * FROM cars WHERE car_number = ?", (car_number,)).fetchone()
    if not car:
        return
    name = car["car_name"]
    purchase_price = float(car["purchase_price"] or 0)
    purchase_currency = car["currency"] or "IQD"
    purchase_type = car["purchase_type"] or "كاش"
    purchase_date = car["purchase_date"] or day(0)
    purchase_time = car["purchase_time"] or "00:00"
    purchase_payment_type = car["purchase_payment_type"] or "قاصه"

    if purchase_price > 0:
        record_ledger(conn, date=purchase_date, time=purchase_time, account_type="inventory", account_id=car_number, debit=purchase_price, credit=0.0, currency=purchase_currency, reference_type="car", reference_id=car_number, type_="شراء سيارة", description=f"{TEST_MARK} شراء سيارة: {name} ({car_number})")
        if purchase_type in {"تمويل", "شركة", "دين"}:
            account_type = "payable" if purchase_type == "شركة" else "funder"
            funder = (car["financer_name"] or "ممول عام").strip()
            record_ledger(conn, date=purchase_date, time=purchase_time, account_type=account_type, account_id=funder, debit=0.0, credit=purchase_price, currency=purchase_currency, reference_type="car", reference_id=car_number, type_="تمويل شراء سيارة", description=f"{TEST_MARK} تمويل شراء سيارة: {name} ({car_number}) من قبل {funder}")
        else:
            record_ledger(conn, date=purchase_date, time=purchase_time, account_type="cash", account_id=purchase_payment_type, debit=0.0, credit=purchase_price, currency=purchase_currency, reference_type="car", reference_id=car_number, type_="شراء سيارة كاش", description=f"{TEST_MARK} سحب نقدي لشراء سيارة: {name} ({car_number}) من {purchase_payment_type}")

    if car["status"] != "مبيوعة":
        return

    sale_currency = car["sale_currency"] or "IQD"
    sale_price = float(car["selling_price"] or 0)
    sale_date = car["sale_date"] or day(0)
    sale_time = car["sale_time"] or "00:00"
    buyer = car["buyer_name"] or f"{TEST_PREFIX} مشتري"
    payment_type = car["payment_type"] or "كاش"
    paid = float(car["amount_paid"] if car["amount_paid"] is not None else sale_price)
    remaining = float(car["amount_remaining"] or 0)
    expenses_sum = float(conn.execute("SELECT COALESCE(SUM(amount), 0) FROM car_expenses WHERE car_number = ?", (car_number,)).fetchone()[0])
    total_cost = purchase_price + expenses_sum

    record_ledger(conn, date=sale_date, time=sale_time, account_type="revenue", account_id=car_number, debit=0.0, credit=sale_price, currency=sale_currency, reference_type="car", reference_id=car_number, type_="بيع سيارة", description=f"{TEST_MARK} إيراد بيع سيارة {name} ({car_number}) إلى {buyer}")
    if payment_type == "كاش":
        record_ledger(conn, date=sale_date, time=sale_time, account_type="cash", account_id="قاصه", debit=sale_price, credit=0.0, currency=sale_currency, reference_type="car", reference_id=car_number, type_="بيع سيارة كاش", description=f"{TEST_MARK} استلام نقدي بيع سيارة {name} ({car_number})")
        distribute_to_partners(conn, amount=total_cost, currency=sale_currency, date=sale_date, time=sale_time, payment_type="قاصه", type_="ايداع بيع سيارة", notes=f"{TEST_MARK} ايداع بيع سيارة {name} {car['chassis_number'] or ''}".strip())
        profit = sale_price - total_cost
        if profit > 0:
            distribute_to_partners(conn, amount=profit, currency=sale_currency, date=sale_date, time=sale_time, payment_type="قاصه", type_="ايداع ارباح سيارة", notes=f"{TEST_MARK} ايداع ارباح سيارة {name} {car['chassis_number'] or ''}".strip())
    else:
        if paid > 0:
            record_ledger(conn, date=sale_date, time=sale_time, account_type="cash", account_id="قاصه", debit=paid, credit=0.0, currency=sale_currency, reference_type="car", reference_id=car_number, type_="مقدمة سيارة", description=f"{TEST_MARK} مقدمة سيارة {name} ({car_number})")
        if remaining > 0:
            record_ledger(conn, date=sale_date, time=sale_time, account_type="receivable", account_id=buyer, debit=remaining, credit=0.0, currency=sale_currency, reference_type="car", reference_id=car_number, type_="مدينون بيع سيارة", description=f"{TEST_MARK} ذمة مدينة متبقية بيع سيارة {name} ({car_number}) على {buyer}")

    if total_cost > 0:
        record_ledger(conn, date=sale_date, time=sale_time, account_type="expense", account_id=car_number, debit=total_cost, credit=0.0, currency=purchase_currency, reference_type="car", reference_id=car_number, type_="تكلفة المبيعات", description=f"{TEST_MARK} تكلفة بيع سيارة {name} ({car_number})")
        record_ledger(conn, date=sale_date, time=sale_time, account_type="inventory", account_id=car_number, debit=0.0, credit=total_cost, currency=purchase_currency, reference_type="car", reference_id=car_number, type_="تخفيض المخزون بيع سيارة", description=f"{TEST_MARK} إخراج سيارة {name} ({car_number}) من المخزون")


def add_car(conn: sqlite3.Connection, idx: int, spec: dict) -> str:
    plate = f"TS-{idx:03d}"
    province = spec.get("province", "بغداد")
    car_number = f"{plate} {province}"
    purchase = float(spec["purchase"])
    selling = float(spec["selling"])
    payment_type = spec.get("payment_type")
    paid = spec.get("paid")
    remaining = spec.get("remaining")
    months = spec.get("months")
    monthly = (remaining / months) if remaining and months else None
    purchase_date = day(idx)
    sale_date = day(idx + 3) if spec["status"] == "مبيوعة" else None
    purchase_time = clock(idx)
    sale_time = clock(idx + 3) if sale_date else "00:00"
    chassis = f"CH-TEST-{idx:04d}"
    name = spec.get("name", f"{TEST_PREFIX} سيارة {idx:02d}")
    buyer = spec.get("buyer")

    execute(
        conn,
        """
        INSERT OR REPLACE INTO cars (
            car_number, car_plate_num, chassis_number, car_model, car_year,
            car_name, color, details, purchase_price, currency, sale_currency, selling_price,
            status, payment_type, cash_price, amount_paid, amount_remaining, installment_months,
            monthly_payment, buyer_name, buyer_phone, purchase_date, sale_date, delivery_date,
            first_payment_date, selling_currency, paid_currency, remaining_currency,
            purchase_payment_type, purchase_time, sale_time, purchase_type, financer_name,
            commission_type, commission_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            car_number,
            plate,
            chassis,
            spec.get("model", "Toyota"),
            str(2020 + (idx % 6)),
            name,
            spec.get("color", "أبيض لؤلؤي"),
            f"{TEST_MARK} كل حقول السيارة مملوءة: فتحة، شاشة، كاميرا، حساسات، تجربة رقم {idx}",
            purchase,
            spec.get("currency", "IQD"),
            spec.get("sale_currency", spec.get("currency", "IQD")),
            selling,
            spec["status"],
            payment_type,
            selling if payment_type == "كاش" else None,
            paid,
            remaining,
            months,
            monthly,
            buyer,
            f"0770{idx:07d}",
            purchase_date,
            sale_date,
            day(idx + 5) if sale_date else None,
            day(idx + 35) if payment_type == "اقساط" else None,
            spec.get("sale_currency", spec.get("currency", "IQD")),
            spec.get("sale_currency", spec.get("currency", "IQD")),
            spec.get("sale_currency", spec.get("currency", "IQD")),
            spec.get("purchase_payment_type", "قاصه"),
            purchase_time,
            sale_time,
            spec["purchase_type"],
            spec.get("financer"),
            spec.get("commission_type", "لا يوجد"),
            spec.get("commission_value", 0.0),
        ),
    )

    for exp_idx, amount in enumerate(spec.get("car_expenses", []), start=1):
        add_car_expense(
            conn,
            car_number=car_number,
            description=f"{TEST_PREFIX} مصروف سيارة {idx}-{exp_idx}",
            amount=amount,
            date=day(idx + exp_idx),
            time=clock(idx + exp_idx),
            currency=spec.get("currency", "IQD"),
        )

    record_car_ledger(conn, car_number)

    if payment_type in {"موعد", "اقساط"} and buyer:
        add_partner(conn, Account(buyer, f"0777{idx:07d}", "زبون"))
        if paid and paid > 0:
            add_partner_transaction(conn, partner_name=buyer, kind="زبون", type_="مقدمة", amount=paid, date=sale_date or purchase_date, time=sale_time, notes=f"{TEST_MARK} مقدمة بيع سيارة {name} (شاصي: {chassis})", currency=spec.get("sale_currency", spec.get("currency", "IQD")), payment_type="قاصه")
        if payment_type == "اقساط" and remaining:
            add_partner_transaction(conn, partner_name=buyer, kind="زبون", type_="تسديد قسط", amount=remaining / 3, date=day(idx + 35), time=clock(idx + 4), notes=f"{TEST_MARK} تسديد قسط سيارة {name} (شاصي: {chassis})", currency=spec.get("sale_currency", spec.get("currency", "IQD")), payment_type="قاصه")

    return car_number


def add_general_expense(conn: sqlite3.Connection, idx: int) -> None:
    currency = "USD" if idx % 5 == 0 else "IQD"
    # أرقام نظيفة: مضاعفات ١٠ دولار أو ١٠،٠٠٠ دينار، تسهّل المراجعة اليدوية
    amount = round_amount(idx, base=50, step=10) if currency == "USD" else round_amount(idx, base=50_000, step=10_000)
    date = day(10 + idx)
    time = clock(idx)
    description = f"{TEST_PREFIX} مصروف عام {idx:02d}"
    notes = f"{TEST_MARK} حقن خانة الملاحظات للمصروف رقم {idx}"
    execute(
        conn,
        "INSERT INTO expenses (description, amount, date, time, notes, currency, car_number) VALUES (?, ?, ?, ?, ?, ?, NULL)",
        (description, amount, date, time, notes, currency),
    )
    exp_id = str(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    record_ledger(conn, date=date, time=time, account_type="expense", account_id=description, debit=amount, credit=0.0, currency=currency, reference_type="expense", reference_id=exp_id, type_="مصروف عام", description=description, notes=notes)
    record_ledger(conn, date=date, time=time, account_type="cash", account_id="قاصه", debit=0.0, credit=amount, currency=currency, reference_type="expense", reference_id=exp_id, type_="دفع مصروف", description=f"{TEST_MARK} دفع مصروف: {description}", notes=notes)
    distribute_to_partners(conn, amount=amount, currency=currency, date=date, time=time, payment_type="قاصه", type_="سحب مصروف", notes=f"{TEST_MARK} سحب مصروف {description}")


def add_agency(conn: sqlite3.Connection, idx: int) -> int:
    date = day(35 + idx)
    time = clock(idx)
    # أرقام نظيفة: مضاعفات ٥٠ دولار أو ٥٠،٠٠٠ دينار
    amount_usd = round_amount(idx, base=100, step=50) if idx % 2 else 0
    amount_iqd = round_amount(idx, base=100_000, step=50_000) if idx % 2 == 0 else 0
    old_name = f"{TEST_PREFIX} موكل قديم {idx:02d}"
    new_name = f"{TEST_PREFIX} موكل جديد {idx:02d}"
    execute(
        conn,
        """
        INSERT INTO agencies
            (old_agent_name, car_type, car_number, car_model, color, new_agent_name,
             phone, amount_usd, amount_iqd, notes, date, time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            old_name,
            "خصوصي",
            f"وكالة-{idx:02d}",
            f"{2020 + idx % 5}",
            "أسود",
            new_name,
            f"0780{idx:07d}",
            amount_usd,
            amount_iqd,
            f"{TEST_MARK} وكالة اختبارية بكامل الحقول",
            date,
            time,
        ),
    )
    agency_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    desc = f"{TEST_MARK} وكالة {old_name} {new_name}"
    if amount_usd:
        record_ledger(conn, date=date, time=time, account_type="cash", account_id="قاصه", debit=amount_usd, credit=0.0, currency="USD", reference_type="agency", reference_id=str(agency_id), type_="أرباح وكالة", description=desc)
        record_ledger(conn, date=date, time=time, account_type="revenue", account_id="agency", debit=0.0, credit=amount_usd, currency="USD", reference_type="agency", reference_id=str(agency_id), type_="أرباح وكالة إيراد", description=desc)
        distribute_to_partners(conn, amount=amount_usd, currency="USD", date=date, time=time, payment_type="قاصه", type_="ايداع ارباح وكالة", notes=f"{TEST_MARK} ايداع ارباح وكالة {old_name} {new_name} رئيسي")
    if amount_iqd:
        record_ledger(conn, date=date, time=time, account_type="cash", account_id="قاصه", debit=amount_iqd, credit=0.0, currency="IQD", reference_type="agency", reference_id=str(agency_id), type_="أرباح وكالة", description=desc)
        record_ledger(conn, date=date, time=time, account_type="revenue", account_id="agency", debit=0.0, credit=amount_iqd, currency="IQD", reference_type="agency", reference_id=str(agency_id), type_="أرباح وكالة إيراد", description=desc)
        distribute_to_partners(conn, amount=amount_iqd, currency="IQD", date=date, time=time, payment_type="قاصه", type_="ايداع ارباح وكالة", notes=f"{TEST_MARK} ايداع ارباح وكالة {old_name} {new_name} رئيسي")
    for kind, amount, currency, offset in (
        ("ايداع", round_amount(idx, base=50_000, step=10_000), "IQD", 1),
        ("سحب", round_amount(idx, base=50, step=10), "USD", 2),
    ):
        add_agency_transaction(conn, agency_id, kind, amount, currency, day(35 + idx + offset), clock(idx + offset), f"{TEST_MARK} حركة وكالة {kind}")
    return agency_id


def add_agency_transaction(conn: sqlite3.Connection, agency_id: int, type_: str, amount: float, currency: str, date: str, time: str, notes: str) -> None:
    execute(
        conn,
        "INSERT INTO agency_transactions (agency_id, date, time, type_, amount, currency, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (agency_id, date, time, type_, amount, currency, notes),
    )
    tx_id = str(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    if type_ == "ايداع":
        record_ledger(conn, date=date, time=time, account_type="cash", account_id="قاصه", debit=amount, credit=0.0, currency=currency, reference_type="agency_transaction", reference_id=tx_id, type_="إيداع وكالة", description=f"{TEST_MARK} إيداع حركة وكالة رقم {agency_id}", notes=notes)
        record_ledger(conn, date=date, time=time, account_type="revenue", account_id="agency", debit=0.0, credit=amount, currency=currency, reference_type="agency_transaction", reference_id=tx_id, type_="إيداع وكالة إيراد", description=f"{TEST_MARK} إيراد حركة وكالة رقم {agency_id}", notes=notes)
    else:
        record_ledger(conn, date=date, time=time, account_type="revenue", account_id="agency", debit=amount, credit=0.0, currency=currency, reference_type="agency_transaction", reference_id=tx_id, type_="سحب وكالة إيراد", description=f"{TEST_MARK} تخفيض إيراد حركة وكالة رقم {agency_id}", notes=notes)
        record_ledger(conn, date=date, time=time, account_type="cash", account_id="قاصه", debit=0.0, credit=amount, currency=currency, reference_type="agency_transaction", reference_id=tx_id, type_="سحب وكالة", description=f"{TEST_MARK} سحب نقدي حركة وكالة رقم {agency_id}", notes=notes)


def add_users(conn: sqlite3.Connection) -> None:
    for idx in range(1, 4):
        password_hash = hashlib.sha256(f"test{idx}".encode("utf-8")).hexdigest()
        execute(
            conn,
            "INSERT INTO users (username, password_hash, display_name, profile_image) VALUES (?, ?, ?, ?)",
            (f"test_seed_user_{idx}", password_hash, f"{TEST_PREFIX} مستخدم {idx}", None),
        )


def add_profit_distribution(conn: sqlite3.Connection, partners: list[Account]) -> None:
    for idx, currency in enumerate(("IQD", "USD"), start=1):
        # أرقام نظيفة: مليون دينار / ألف دولار، تبقى صحيحة بعد القسمة والنسب أدناه
        total = 1_000_000 if currency == "IQD" else 1_000
        execute(
            conn,
            "INSERT INTO profit_distributions (date, time, total_profit, currency, notes) VALUES (?, ?, ?, ?, ?)",
            (day(55 + idx), clock(idx), total, currency, f"{TEST_MARK} توزيع أرباح اختبار {currency}"),
        )
        dist_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        share = total / len(partners)
        for account in partners:
            execute(
                conn,
                """
                INSERT INTO partner_profit_shares
                    (distribution_id, partner_name, profit_share, drawings_deducted,
                     amount_reinvested, amount_paid, currency)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (dist_id, account.name, share, share * 0.10, share * 0.20, share * 0.70, currency),
            )
        record_ledger(conn, date=day(55 + idx), time=clock(idx), account_type="profit_distribution", account_id=str(dist_id), debit=total, credit=0.0, currency=currency, reference_type="profit_distribution", reference_id=str(dist_id), type_="توزيع أرباح", description=f"{TEST_MARK} توزيع أرباح اختبار {currency}")


def recalculate_partners(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT partner_name, kind FROM partners").fetchall()
    for row in rows:
        name = row["partner_name"]
        kind = row["kind"]
        if kind == "زبون":
            iqd = conn.execute(
                "SELECT COALESCE(SUM(debit - credit), 0) FROM financial_ledger WHERE account_type = 'receivable' AND account_id = ? AND currency = 'IQD'",
                (name,),
            ).fetchone()[0]
            usd = conn.execute(
                "SELECT COALESCE(SUM(debit - credit), 0) FROM financial_ledger WHERE account_type = 'receivable' AND account_id = ? AND currency = 'USD'",
                (name,),
            ).fetchone()[0]
        else:
            deposits_iqd = conn.execute(
                """
                SELECT COALESCE(SUM(amount), 0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'IQD'
                  AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                  AND type NOT LIKE 'تحويل%'
                """,
                (name, kind),
            ).fetchone()[0]
            withdrawals_iqd = conn.execute(
                """
                SELECT COALESCE(SUM(amount), 0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'IQD'
                  AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                  AND type NOT LIKE 'تحويل%'
                """,
                (name, kind),
            ).fetchone()[0]
            deposits_usd = conn.execute(
                """
                SELECT COALESCE(SUM(amount), 0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'USD'
                  AND (type LIKE 'ايداع%' OR type LIKE 'إيداع%' OR type LIKE 'مقدمة%' OR type LIKE 'استلام%' OR type LIKE 'إستلام%' OR type LIKE 'إعادة استثمار%' OR type LIKE 'تسوية%' OR type LIKE 'تسديد%')
                  AND type NOT LIKE 'تحويل%'
                """,
                (name, kind),
            ).fetchone()[0]
            withdrawals_usd = conn.execute(
                """
                SELECT COALESCE(SUM(amount), 0) FROM partner_transactions
                WHERE partner_name = ? AND kind = ? AND COALESCE(currency, 'IQD') = 'USD'
                  AND (type LIKE 'سحب%' OR type LIKE 'باقي%')
                  AND type NOT LIKE 'تحويل%'
                """,
                (name, kind),
            ).fetchone()[0]
            if kind in {"مستثمر", "ممول", "شركة"}:
                iqd, usd = withdrawals_iqd - deposits_iqd, withdrawals_usd - deposits_usd
            else:
                iqd, usd = deposits_iqd - withdrawals_iqd, deposits_usd - withdrawals_usd
        execute(conn, "UPDATE partners SET total_amount = ?, iqd_balance = ?, usd_balance = ? WHERE partner_name = ? AND kind = ?", (float(iqd) + float(usd), iqd, usd, name, kind))


def seed_accounts(conn: sqlite3.Connection) -> tuple[list[Account], list[Account]]:
    # الشركاء الفعليون فقط (بدون إضافة أي شركاء آخرين)
    partners = [
        Account("أمير", "07808425228", "شريك"),
        Account("منتصر", "07812541714", "شريك"),
    ]
    accounts = partners + [
        Account(f"{TEST_PREFIX} مستثمر 01", "07720000001", "مستثمر"),
        Account(f"{TEST_PREFIX} مستثمر 02", "07720000002", "مستثمر"),
        Account(f"{TEST_PREFIX} ممول 01", "07730000001", "ممول"),
        Account(f"{TEST_PREFIX} ممول 02", "07730000002", "ممول"),
        Account(f"{TEST_PREFIX} شركة 01", "07740000001", "شركة"),
        Account(f"{TEST_PREFIX} شركة 02", "07740000002", "شركة"),
        Account(f"{TEST_PREFIX} زبون 01", "07750000001", "زبون"),
        Account(f"{TEST_PREFIX} زبون 02", "07750000002", "زبون"),
    ]
    for account in accounts:
        add_partner(conn, account)

    for idx, account in enumerate(accounts, start=1):
        # أرقام نظيفة: مضاعفات ١٠٠،٠٠٠ دينار أو ١٠٠ دولار، والحركة الثانية دائماً نصف الأولى بالضبط
        for currency, amount in (
            ("IQD", round_amount(idx, base=1_000_000, step=100_000)),
            ("USD", round_amount(idx, base=1_000, step=100)),
        ):
            safe_type = ["قاصه", "خارج القاصة", "مصرف"][idx % 3]
            if account.kind == "زبون":
                add_partner_transaction(conn, partner_name=account.name, kind=account.kind, type_="سحب", amount=amount, date=day(idx), time=clock(idx), notes=f"{TEST_MARK} فتح ذمة {currency}", currency=currency, payment_type=safe_type)
                add_partner_transaction(conn, partner_name=account.name, kind=account.kind, type_="تسديد", amount=half(amount), date=day(idx + 1), time=clock(idx + 1), notes=f"{TEST_MARK} تسديد ذمة {currency}", currency=currency, payment_type=safe_type)
            else:
                add_partner_transaction(conn, partner_name=account.name, kind=account.kind, type_="ايداع", amount=amount, date=day(idx), time=clock(idx), notes=f"{TEST_MARK} ايداع حساب {currency}", currency=currency, payment_type=safe_type)
                withdraw_type = "سحب شريك" if account.kind == "شريك" else "سحب"
                add_partner_transaction(conn, partner_name=account.name, kind=account.kind, type_=withdraw_type, amount=half(amount), date=day(idx + 1), time=clock(idx + 1), notes=f"{TEST_MARK} سحب حساب {currency}", currency=currency, payment_type=safe_type)
    return partners, accounts


def seed_cars(conn: sqlite3.Connection, partners: list[Account]) -> list[str]:
    funder = f"{TEST_PREFIX} ممول 01"
    company = f"{TEST_PREFIX} شركة 01"
    specs = []
    purchase_types = ["كاش", "تمويل", "شركة"]
    sale_methods = ["كاش", "موعد", "اقساط"]
    for idx in range(1, 21):
        purchase_type = purchase_types[(idx - 1) % len(purchase_types)]
        sold = idx <= 16
        payment_type = sale_methods[(idx - 1) % len(sale_methods)] if sold else None
        currency = "USD" if idx in {5, 11, 17} else "IQD"
        # أرقام نظيفة حسب العملة: مضاعفات ١،٠٠٠ دولار أو ١،٠٠٠،٠٠٠ دينار + هامش ربح ثابت ومضبوط
        if currency == "USD":
            purchase = round_amount(idx, base=15_000, step=1_000)
            selling = purchase + 2_000
        else:
            purchase = round_amount(idx, base=20_000_000, step=1_000_000)
            selling = purchase + 3_000_000
        paid = None
        remaining = None
        months = None
        buyer = f"{TEST_PREFIX} زبون 01" if sold else None
        if payment_type == "موعد":
            paid = half(selling)
            remaining = selling - paid
        elif payment_type == "اقساط":
            paid = selling * 0.25  # ربع المبلغ — يبقى رقماً صحيحاً نظيفاً لأن selling مضاعف مضبوط
            remaining = selling - paid
            months = 12
        elif payment_type == "كاش":
            paid = selling
            remaining = 0.0
        specs.append(
            {
                "purchase_type": purchase_type,
                "purchase": purchase,
                "selling": selling,
                "status": "مبيوعة" if sold else "متوفرة",
                "payment_type": payment_type,
                "paid": paid,
                "remaining": remaining,
                "months": months,
                "buyer": buyer,
                "currency": currency,
                "sale_currency": "USD" if idx in {5, 11} else "IQD",
                "purchase_payment_type": "خارج القاصة" if idx % 4 == 0 else "قاصه",
                "financer": funder if purchase_type == "تمويل" else company if purchase_type == "شركة" else None,
                "commission_type": ["لا يوجد", "نسبة", "مقطوع"][idx % 3],
                "commission_value": 5.0 if idx % 3 == 1 else 100_000 if idx % 3 == 2 else 0,
                "car_expenses": [round_amount(idx, base=100_000, step=50_000), round_amount(idx, base=50_000, step=25_000)] if idx <= 8 else [round_amount(idx, base=100_000, step=50_000)],
                "name": f"{TEST_PREFIX} {['تويوتا', 'كيا', 'هيونداي', 'نيسان'][idx % 4]} {idx:02d}",
                "model": ["Camry", "Sportage", "Elantra", "Altima"][idx % 4],
                "color": ["أبيض", "أسود", "رصاصي", "أزرق"][idx % 4],
            }
        )
    return [add_car(conn, idx, spec) for idx, spec in enumerate(specs, start=1)]


def seed_cash_register(conn: sqlite3.Connection) -> None:
    for idx, type_ in enumerate(("ايداع يدوي", "سحب يدوي"), start=1):
        execute(
            conn,
            "INSERT INTO cash_register (date, time, type, amount, description, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (day(60 + idx), clock(idx), type_, 100_000 * idx, f"{TEST_MARK} سجل قاصة قديم", f"{TEST_MARK} حركة cash_register اختبارية"),
        )


def seed_everything(db_path: Path) -> dict[str, int | str]:
    with connect(db_path) as conn:
        conn.execute("BEGIN")
        cleanup_previous_seed(conn)
        partners, _accounts = seed_accounts(conn)
        cars = seed_cars(conn, partners)
        for idx in range(1, 21):
            add_general_expense(conn, idx)
        for idx in range(1, 21):
            add_agency(conn, idx)
        add_users(conn)
        add_profit_distribution(conn, partners)
        seed_cash_register(conn)
        recalculate_partners(conn)
        conn.commit()

        summary = {
            "cars": conn.execute("SELECT COUNT(*) FROM cars WHERE details LIKE ?", (f"%{TEST_MARK}%",)).fetchone()[0],
            "sold_cars": conn.execute("SELECT COUNT(*) FROM cars WHERE details LIKE ? AND status = 'مبيوعة'", (f"%{TEST_MARK}%",)).fetchone()[0],
            "accounts": conn.execute("SELECT COUNT(*) FROM partners WHERE partner_name LIKE ?", (f"{TEST_PREFIX}%",)).fetchone()[0],
            "partner_transactions": conn.execute("SELECT COUNT(*) FROM partner_transactions WHERE notes LIKE ?", (f"%{TEST_MARK}%",)).fetchone()[0],
            "agencies": conn.execute("SELECT COUNT(*) FROM agencies WHERE notes LIKE ?", (f"%{TEST_MARK}%",)).fetchone()[0],
            "agency_transactions": conn.execute("SELECT COUNT(*) FROM agency_transactions WHERE notes LIKE ?", (f"%{TEST_MARK}%",)).fetchone()[0],
            "expenses": conn.execute("SELECT COUNT(*) FROM expenses WHERE notes LIKE ?", (f"%{TEST_MARK}%",)).fetchone()[0],
            "car_expenses": conn.execute("SELECT COUNT(*) FROM car_expenses WHERE description LIKE ?", (f"{TEST_PREFIX}%",)).fetchone()[0],
            "ledger": conn.execute("SELECT COUNT(*) FROM financial_ledger WHERE description LIKE ? OR notes LIKE ?", (f"%{TEST_MARK}%", f"%{TEST_MARK}%")).fetchone()[0],
            "users": conn.execute("SELECT COUNT(*) FROM users WHERE username LIKE 'test_seed_%'").fetchone()[0],
            "profit_distributions": conn.execute("SELECT COUNT(*) FROM profit_distributions WHERE notes LIKE ?", (f"%{TEST_MARK}%",)).fetchone()[0],
        }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="حقن بيانات اختبارية لقاعدة فجر الوادي")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="مسار قاعدة البيانات SQLite")
    args = parser.parse_args()
    db_path = Path(args.db).expanduser().resolve()
    summary = seed_everything(db_path)

    print("تم حقن بيانات الاختبار بنجاح على قاعدة البيانات الأصلية.")
    print(f"السيارات: {summary['cars']} منها مبيوعة: {summary['sold_cars']}")
    print(f"الحسابات الجديدة المحقونة: {summary['accounts']}")
    print(f"حركات الحسابات: {summary['partner_transactions']}")
    print(f"الوكالات: {summary['agencies']} / حركات الوكالات: {summary['agency_transactions']}")
    print(f"المصروفات العامة: {summary['expenses']} / مصروفات السيارات: {summary['car_expenses']}")
    print(f"قيود دفتر الأستاذ: {summary['ledger']}")
    print(f"المستخدمون: {summary['users']} / توزيعات الأرباح: {summary['profit_distributions']}")


if __name__ == "__main__":
    main()