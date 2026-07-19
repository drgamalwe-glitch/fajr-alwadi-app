#!/usr/bin/env python3
"""Reject text identity predicates inside production financial write paths."""

from __future__ import annotations

import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from check_no_hard_financial_deletes import EXCLUDED_FILES, LEGACY, ROOT, function_spans


FORBIDDEN = {
    "car_number",
    "partner_name",
    "buyer_name",
    "financer_name",
    "company_name",
    "investor_name",
    "chassis_number",
    "car_plate_num",
    "notes",
    "source_id",
    "related_source_id",
    "reference_id",
}
WRITE_FUNCTION_RE = re.compile(
    r"^(?:add|apply|cancel|create|deduct|delete|distribute|ensure|insert|migrate|"
    r"rebuild|recalculate|record|reverse|sell|sync|update|validate)_"
)
MIGRATION_ONLY_FUNCTIONS = {
    "migrate_existing_data_to_ledger",
    "ensure_sales_cogs_entries",
}
SQL_RE = re.compile(r"\b(?:SELECT|UPDATE|DELETE|INSERT|REPLACE)\b", re.IGNORECASE)
PREDICATE_RE = re.compile(r"\b(?:WHERE|JOIN)\b([\s\S]*)", re.IGNORECASE)


@dataclass(frozen=True, order=True)
class Finding:
    path: str
    line: int
    function: str
    identifiers: tuple[str, ...]
    predicate: str


def rust_strings(source: str) -> list[tuple[int, str]]:
    strings: list[tuple[int, str]] = []
    index = 0
    block_depth = 0
    while index < len(source):
        if block_depth:
            if source.startswith("/*", index):
                block_depth += 1
                index += 2
            elif source.startswith("*/", index):
                block_depth -= 1
                index += 2
            else:
                index += 1
            continue
        if source.startswith("//", index):
            newline = source.find("\n", index + 2)
            index = len(source) if newline < 0 else newline + 1
            continue
        if source.startswith("/*", index):
            block_depth = 1
            index += 2
            continue
        raw = re.match(r'r(#{0,16})"', source[index:])
        if raw:
            hashes = raw.group(1)
            body_start = index + len(raw.group(0))
            terminator = '"' + hashes
            end = source.find(terminator, body_start)
            if end < 0:
                break
            strings.append((index, source[body_start:end]))
            index = end + len(terminator)
            continue
        if source[index] == '"':
            start = index
            index += 1
            chars: list[str] = []
            while index < len(source):
                if source[index] == "\\" and index + 1 < len(source):
                    chars.extend((source[index], source[index + 1]))
                    index += 2
                elif source[index] == '"':
                    index += 1
                    break
                else:
                    chars.append(source[index])
                    index += 1
            strings.append((start, "".join(chars)))
            continue
        index += 1
    return strings


def scan() -> list[Finding]:
    findings: list[Finding] = []
    for path in sorted(LEGACY.glob("*.rs")):
        if path.name in EXCLUDED_FILES:
            continue
        source = path.read_text(encoding="utf-8")
        spans = function_spans(source)
        relative = path.relative_to(ROOT).as_posix()
        for position, sql in rust_strings(source):
            owners = [span for span in spans if span[0] <= position <= span[1]]
            if not owners:
                continue
            owner = max(owners, key=lambda span: span[0])
            if "#[cfg(any())]" in source[max(0, owner[0] - 120) : owner[0]]:
                continue
            function = owner[2]
            if (
                function in MIGRATION_ONLY_FUNCTIONS
                or not WRITE_FUNCTION_RE.match(function)
                or not SQL_RE.search(sql)
            ):
                continue
            predicate_match = PREDICATE_RE.search(sql)
            if not predicate_match:
                continue
            predicate = re.split(
                r"\b(?:ORDER\s+BY|GROUP\s+BY|LIMIT|RETURNING)\b",
                predicate_match.group(1),
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0]
            # A full-payload, time-bounded duplicate guard is validation, not an
            # accounting identity join. It may compare display fields safely.
            if "julianday" in predicate.lower() and "operations" in predicate.lower():
                continue
            identifiers = tuple(
                sorted(
                    identifier
                    for identifier in FORBIDDEN
                    if re.search(rf"\b{re.escape(identifier)}\b", predicate, re.IGNORECASE)
                )
            )
            if identifiers:
                findings.append(
                    Finding(
                        relative,
                        source.count("\n", 0, position) + 1,
                        function,
                        identifiers,
                        " ".join(predicate.split())[:180],
                    )
                )
    return sorted(set(findings))


def main() -> int:
    findings = scan()
    if findings:
        if "--summary" in sys.argv:
            for function, count in sorted(Counter(f.function for f in findings).items()):
                print(f"{function}: {count}")
        else:
            for finding in findings:
                print(
                    f"TEXT_IDENTITY_WRITE {finding.path}:{finding.line} "
                    f"function={finding.function} identifiers={','.join(finding.identifiers)} "
                    f"predicate={finding.predicate}"
                )
        print(f"NUMERIC_WRITE_IDENTITY_FAILED violations={len(findings)}")
        return 1
    print("NUMERIC_WRITE_IDENTITY_PASSED violations=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
