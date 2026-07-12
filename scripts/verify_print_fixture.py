#!/usr/bin/env python3
"""Offline structural verification for the generated React-PDF A4 fixture."""
from __future__ import annotations

import re
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"PRINT FIXTURE FAILED: {message}")


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: verify_print_fixture.py <pdf-path>")

    path = Path(sys.argv[1])
    if not path.is_file():
        fail(f"file not found: {path}")

    data = path.read_bytes()
    if len(data) < 50_000:
        fail("generated PDF is unexpectedly small")

    page_count = len(re.findall(rb"/Type\s*/Page(?!s)", data))
    if page_count < 4:
        fail(f"expected a multi-page stress fixture, found {page_count} page(s)")

    boxes = re.findall(
        rb"/MediaBox\s*\[\s*0(?:\.0+)?\s+0(?:\.0+)?\s+([0-9.]+)\s+([0-9.]+)\s*\]",
        data,
    )
    if len(boxes) != page_count:
        fail(f"found {len(boxes)} media boxes for {page_count} pages")

    for index, (raw_width, raw_height) in enumerate(boxes, start=1):
        width = float(raw_width)
        height = float(raw_height)
        if abs(width - 595.28) > 0.2 or abs(height - 841.89) > 0.2:
            fail(f"page {index} is not A4 portrait: {width:.2f} x {height:.2f} pt")

    print(f"PRINT FIXTURE PASSED: {page_count} A4 portrait pages, {len(data)} bytes")


if __name__ == "__main__":
    main()
