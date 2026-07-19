#!/usr/bin/env python3
"""Fail when production Rust delegates decimal-money arithmetic to SQLite."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "src-tauri" / "src"
EXCLUDED = {
    "tests_module.rs",
}
PATTERNS = (
    ("SQLite SUM on production data", re.compile(r"\bSUM\s*\(")),
    ("SQLite REAL coercion", re.compile(r"\bCAST\s*\([^\n)]*\bAS\s+REAL\b", re.IGNORECASE)),
)


def main() -> int:
    findings: list[str] = []
    for path in sorted(SOURCE_ROOT.rglob("*.rs")):
        if path.name in EXCLUDED or "tests" in path.parts:
            continue
        source = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(source.splitlines(), 1):
            if line.lstrip().startswith("//"):
                continue
            for label, pattern in PATTERNS:
                if pattern.search(line):
                    findings.append(
                        f"{path.relative_to(ROOT)}:{line_number}: {label}: {line.strip()}"
                    )
    if findings:
        print("Exact-money SQL gate failed:", file=sys.stderr)
        print("\n".join(findings), file=sys.stderr)
        return 1
    print("Exact-money SQL gate passed: no SUM/REAL coercion in production Rust.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
