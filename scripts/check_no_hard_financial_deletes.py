#!/usr/bin/env python3
"""Fail when production Rust contains an unclassified hard delete of financial data."""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "src-tauri" / "src" / "legacy"
ALLOWLIST_PATH = ROOT / "scripts" / "hard_delete_allowlist.json"
EXCLUDED_FILES = {"db_init.rs", "tests_module.rs", "auth_users.rs"}
FINANCIAL_TABLES = {
    "financial_ledger",
    "partner_transactions",
    "cars",
    "car_sales",
    "installments",
    "customer_installment_payment_events",
    "expenses",
    "car_expenses",
    "agencies",
    "agency_transactions",
    "accounts",
    "partners",
}
ALLOWED_CLASSIFICATIONS = {
    "non_financial",
    "migration_only",
    "test_only",
    "ephemeral_generated_row_inside_atomic_rebuild",
}
DELETE_RE = re.compile(
    rf"\bDELETE\s+FROM\s+({'|'.join(sorted(FINANCIAL_TABLES, key=len, reverse=True))})\b",
    re.IGNORECASE,
)
FUNCTION_RE = re.compile(r"(?m)^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\b")


@dataclass(frozen=True, order=True)
class Finding:
    path: str
    function: str
    table: str
    line: int

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.path, self.function, self.table)


def matching_brace(source: str, opening: int) -> int:
    depth = 0
    state = "code"
    block_depth = 0
    raw_hashes = 0
    index = opening
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if state == "line_comment":
            if char == "\n":
                state = "code"
        elif state == "block_comment":
            if char == "/" and next_char == "*":
                block_depth += 1
                index += 1
            elif char == "*" and next_char == "/":
                block_depth -= 1
                index += 1
                if block_depth == 0:
                    state = "code"
        elif state == "string":
            if char == "\\":
                index += 1
            elif char == '"':
                state = "code"
        elif state == "char":
            if char == "\\":
                index += 1
            elif char == "'":
                state = "code"
        elif state == "raw":
            if char == '"' and source.startswith("#" * raw_hashes, index + 1):
                index += raw_hashes
                state = "code"
        else:
            if char == "/" and next_char == "/":
                state = "line_comment"
                index += 1
            elif char == "/" and next_char == "*":
                state = "block_comment"
                block_depth = 1
                index += 1
            elif char == '"':
                state = "string"
            elif char == "'" and next_char and next_char != " ":
                state = "char"
            elif char == "r":
                raw_match = re.match(r'r(#{0,16})"', source[index:])
                if raw_match:
                    raw_hashes = len(raw_match.group(1))
                    index += len(raw_match.group(0)) - 1
                    state = "raw"
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index
        index += 1
    return len(source)


def function_spans(source: str) -> list[tuple[int, int, str]]:
    spans = []
    for match in FUNCTION_RE.finditer(source):
        opening = source.find("{", match.end())
        if opening < 0:
            continue
        spans.append((match.start(), matching_brace(source, opening), match.group(1)))
    return spans


def scan() -> list[Finding]:
    findings = []
    for path in sorted(LEGACY.glob("*.rs")):
        if path.name in EXCLUDED_FILES:
            continue
        source = path.read_text(encoding="utf-8")
        spans = function_spans(source)
        relative = path.relative_to(ROOT).as_posix()
        for match in DELETE_RE.finditer(source):
            owners = [span for span in spans if span[0] <= match.start() <= span[1]]
            function = max(owners, default=(0, 0, "<module>"), key=lambda span: span[0])[2]
            findings.append(
                Finding(
                    relative,
                    function,
                    match.group(1).lower(),
                    source.count("\n", 0, match.start()) + 1,
                )
            )
    return sorted(findings)


def load_allowlist() -> dict[tuple[str, str, str], dict[str, str]]:
    raw = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("hard-delete allowlist must be a JSON array")
    entries = {}
    required = {"path", "function", "table", "classification", "reason", "test_name"}
    for index, entry in enumerate(raw, 1):
        if not isinstance(entry, dict) or set(entry) != required:
            raise ValueError(f"allowlist entry {index} must contain exactly {sorted(required)}")
        if entry["classification"] not in ALLOWED_CLASSIFICATIONS:
            raise ValueError(f"allowlist entry {index} has an invalid classification")
        if not entry["reason"].strip() or not entry["test_name"].strip():
            raise ValueError(f"allowlist entry {index} requires reason and test_name")
        key = (entry["path"], entry["function"], entry["table"])
        if key in entries:
            raise ValueError(f"duplicate allowlist entry: {key}")
        entries[key] = entry
    return entries


def main() -> int:
    try:
        allowlist = load_allowlist()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"HARD_DELETE_GATE_ERROR: {error}", file=sys.stderr)
        return 2
    findings = scan()
    finding_keys = {finding.key for finding in findings}
    violations = [finding for finding in findings if finding.key not in allowlist]
    stale = sorted(set(allowlist) - finding_keys)
    if violations or stale:
        for finding in violations:
            print(
                f"UNCLASSIFIED {finding.path}:{finding.line} "
                f"function={finding.function} table={finding.table}"
            )
        for path, function, table in stale:
            print(f"STALE_ALLOWLIST path={path} function={function} table={table}")
        print(
            f"HARD_DELETE_GATE_FAILED findings={len(findings)} "
            f"unclassified={len(violations)} stale={len(stale)}"
        )
        return 1
    print(
        f"HARD_DELETE_GATE_PASSED findings={len(findings)} "
        f"classified={len(allowlist)} unclassified=0"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
