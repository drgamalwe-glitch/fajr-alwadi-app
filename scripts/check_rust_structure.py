#!/usr/bin/env python3
"""Lightweight offline structural checks for the Rust backend.

This is not a replacement for `cargo check`; it exists so the project can still
reject common accidental syntax/registration regressions in environments where
Rust tooling is unavailable.
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUST = ROOT / "src-tauri" / "src" / "lib.rs"


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"[PASS] {message}")


def scan_delimiters(text: str) -> None:
    pairs = {')': '(', ']': '[', '}': '{'}
    stack: list[tuple[str, int, int]] = []
    i = 0
    line = 1
    col = 1
    state = "code"
    block_depth = 0
    raw_hashes = 0

    def advance(ch: str) -> None:
        nonlocal line, col
        if ch == "\n":
            line += 1
            col = 1
        else:
            col += 1

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if state == "code":
            if ch == "/" and nxt == "/":
                state = "line_comment"
                advance(ch); advance(nxt); i += 2; continue
            if ch == "/" and nxt == "*":
                state = "block_comment"; block_depth = 1
                advance(ch); advance(nxt); i += 2; continue
            # Rust raw strings: r"...", r#"..."#, br#"..."#
            raw_start = None
            if ch == "r":
                raw_start = i
            elif ch == "b" and nxt == "r":
                raw_start = i + 1
            if raw_start is not None:
                j = raw_start + 1
                while j < len(text) and text[j] == "#":
                    j += 1
                if j < len(text) and text[j] == '"':
                    raw_hashes = j - (raw_start + 1)
                    while i <= j:
                        advance(text[i]); i += 1
                    state = "raw_string"
                    continue
            if ch == '"':
                state = "string"; advance(ch); i += 1; continue
            if ch == "'":
                # Lifetimes are not character literals. Treat as a character
                # literal only if a closing quote appears within a short range.
                closing = i + 1
                escaped = False
                found = False
                while closing < min(len(text), i + 8):
                    c = text[closing]
                    if not escaped and c == "'":
                        found = True; break
                    escaped = (not escaped and c == "\\")
                    if c != "\\":
                        escaped = False
                    closing += 1
                if found:
                    state = "char"; advance(ch); i += 1; continue
            if ch in "([{":
                stack.append((ch, line, col))
            elif ch in ")]}":
                if not stack:
                    fail(f"unmatched closing delimiter {ch!r} at {line}:{col}")
                opening, open_line, open_col = stack.pop()
                if opening != pairs[ch]:
                    fail(
                        f"mismatched delimiters {opening!r} at {open_line}:{open_col} "
                        f"and {ch!r} at {line}:{col}"
                    )
            advance(ch); i += 1; continue

        if state == "line_comment":
            advance(ch); i += 1
            if ch == "\n":
                state = "code"
            continue

        if state == "block_comment":
            if ch == "/" and nxt == "*":
                block_depth += 1
                advance(ch); advance(nxt); i += 2; continue
            if ch == "*" and nxt == "/":
                block_depth -= 1
                advance(ch); advance(nxt); i += 2
                if block_depth == 0:
                    state = "code"
                continue
            advance(ch); i += 1; continue

        if state == "string":
            if ch == "\\":
                advance(ch); i += 1
                if i < len(text):
                    advance(text[i]); i += 1
                continue
            advance(ch); i += 1
            if ch == '"':
                state = "code"
            continue

        if state == "char":
            if ch == "\\":
                advance(ch); i += 1
                if i < len(text):
                    advance(text[i]); i += 1
                continue
            advance(ch); i += 1
            if ch == "'":
                state = "code"
            continue

        if state == "raw_string":
            if ch == '"' and text[i + 1:i + 1 + raw_hashes] == "#" * raw_hashes:
                advance(ch); i += 1
                for _ in range(raw_hashes):
                    advance(text[i]); i += 1
                state = "code"
                continue
            advance(ch); i += 1

    if state in {"string", "char", "raw_string", "block_comment"}:
        fail(f"unterminated lexical state: {state}")
    if stack:
        opening, open_line, open_col = stack[-1]
        fail(f"unclosed delimiter {opening!r} opened at {open_line}:{open_col}")
    ok("balanced Rust delimiters and terminated strings/comments")


def extract_function(text: str, name: str) -> str:
    match = re.search(rf"\bfn\s+{re.escape(name)}\s*\(", text)
    if not match:
        fail(f"missing required function {name}")
    brace = text.find("{", match.end())
    if brace < 0:
        fail(f"function {name} has no body")
    # Delimiter scan already validated braces; simple depth is safe enough here
    # after stripping strings/comments approximately.
    depth = 0
    i = brace
    state = "code"
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if ch == "/" and nxt == "/": state = "line"; i += 2; continue
            if ch == "/" and nxt == "*": state = "block"; i += 2; continue
            if ch == '"': state = "str"; i += 1; continue
            if ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[match.start(): i + 1]
            i += 1
        elif state == "line":
            if ch == "\n": state = "code"
            i += 1
        elif state == "block":
            if ch == "*" and nxt == "/": state = "code"; i += 2
            else: i += 1
        elif state == "str":
            if ch == "\\": i += 2
            elif ch == '"': state = "code"; i += 1
            else: i += 1
    fail(f"could not extract function {name}")
    return ""


def main() -> int:
    text = RUST.read_text(encoding="utf-8")
    scan_delimiters(text)

    names = re.findall(r"(?m)^\s*(?:pub\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", text)
    duplicates = sorted(name for name, count in Counter(names).items() if count > 1)
    if duplicates:
        fail("duplicate Rust function definitions: " + ", ".join(duplicates))
    ok(f"{len(names)} unique Rust function definitions")

    temporary_words = ("TO" + "DO", "FIX" + "ME", "HA" + "CK", "WORK" + "AROUND")
    forbidden_markers = [word for word in temporary_words if re.search(rf"\b{word}\b", text, flags=re.I)]
    if forbidden_markers:
        fail(f"temporary markers remain in Rust source: {len(forbidden_markers)}")
    ok("no temporary-work markers")

    for legacy in ("add_car_expense_record", "delete_car_expense_record"):
        if re.search(rf"\b{legacy}\b", text):
            fail(f"legacy write API still present: {legacy}")
    ok("legacy non-atomic car-expense write APIs removed")

    expense_fn = extract_function(text, "apply_car_expense_changes")
    required_expense_tokens = (
        "transaction()",
        "require_admin_session",
        "DELETE FROM car_expenses WHERE id = ?1 AND car_number = ?2",
        "if affected != 1",
        "rebuild_sold_car_accounting_after_cost_change",
        "db.commit()",
    )
    for token in required_expense_tokens:
        if token not in expense_fn:
            fail(f"atomic car-expense function missing safeguard: {token}")
    ok("atomic car-expense transaction safeguards present")

    auth_fn = extract_function(text, "require_admin_session")
    for token in ("sessions", "expires_at > ?2", "must_change_password"):
        if token not in auth_fn:
            fail(f"admin session gate missing: {token}")
    ok("financial compatibility path requires a live admin session")

    vin_tokens = (
        "idx_cars_chassis_unique",
        "normalize_chassis_value",
        "ensure_unique_chassis",
        "ON cars(chassis_number COLLATE NOCASE)",
    )
    for token in vin_tokens:
        if token not in text:
            fail(f"VIN integrity protection missing: {token}")
    ok("normalized VIN validation and database uniqueness migration present")

    critical_functions = (
        "get_financial_summary",
        "calculate_profit_totals_since",
        "get_profit_distribution_summary",
        "recalculate_partner_total",
        "car_expenses_for_profit",
        "recognized_installment_profit_for_car",
        "calculate_customer_payment_profit",
        "apply_partner_transaction_splits",
        "apply_car_expense_changes",
    )
    for name in critical_functions:
        body = extract_function(text, name)
        if re.search(r"query_row[\s\S]{0,500}?\.unwrap_or(?:_default|_else)?\s*\(", body):
            fail(f"critical function {name} still masks query_row errors with unwrap_or")
    ok("critical accounting functions propagate SQLite query errors")

    if ".filter_map(|r| r.ok())" in text:
        fail("financial row iteration still discards SQLite row errors")
    ok("SQLite row iteration does not discard errors with filter_map(r.ok())")

    # Common accidental compile error: using ? in a closure explicitly returning bool.
    if re.search(r"\|[^|]*\|\s*->\s*bool\s*\{[^{}]*\?", text, flags=re.S):
        fail("found ? operator inside a closure declared -> bool")
    ok("no obvious Result/bool closure mismatch")

    handler = re.search(r"tauri::generate_handler!\s*\[([\s\S]*?)\]\s*\)", text)
    if not handler:
        fail("Tauri generate_handler block not found")
    handler_names = [x.strip() for x in handler.group(1).split(",") if x.strip()]
    missing = [name for name in handler_names if not re.search(rf"\bfn\s+{re.escape(name)}\s*\(", text)]
    if missing:
        fail("handler references missing functions: " + ", ".join(missing))
    if len(handler_names) != len(set(handler_names)):
        fail("duplicate command registration in Tauri handler")
    ok(f"{len(handler_names)} Tauri command registrations resolve uniquely")

    print("Rust structural audit completed successfully (offline, non-compiling check).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
