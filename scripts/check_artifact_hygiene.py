#!/usr/bin/env python3
"""
scripts/check_artifact_hygiene.py

FORENSIC FIX (re-audit 2026-07-11, ARTIFACT-HYGIENE-1):
Release packages MUST NOT contain databases, backups, credentials, tokens,
secrets, or customer data. This scanner walks the project tree and fails the
build/packaging step if any forbidden artifact is detected.

See §7.3 of the executive prompt.

Usage:
    python3 scripts/check_artifact_hygiene.py [project_root]

Exit codes:
    0 — no forbidden artifacts found
    1 — forbidden artifacts found (printed to stderr)
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Forbidden file patterns — any of these in the project tree is a hygiene
# violation. Patterns are matched against the relative path using glob-style
# semantics. Case-insensitive on Windows-style paths.
# ---------------------------------------------------------------------------

FORBIDDEN_PATTERNS = [
    # SQLite databases and sidecar files
    r"(^|/)\.git/",                        # never ship git internals
    r"(^|/)node_modules/",                 # never ship node_modules
    r"(^|/)target/",                       # never ship Rust target/
    r"(^|/)dist/",                         # never ship vite dist/
    r"(^|/)build/",                        # never ship build/
    r"(^|/).*\.db$",                       # any *.db
    r"(^|/).*\.sqlite$",                   # any *.sqlite
    r"(^|/).*\.sqlite3$",                  # any *.sqlite3
    r"(^|/).*\.db-journal$",               # SQLite rollback journal
    r"(^|/).*\.db-wal$",                   # SQLite WAL
    r"(^|/).*\.db-shm$",                   # SQLite shared memory
    r"(^|/)backups?/",                     # backups directory
    r"(^|/).*\.bak$",                      # .bak files
    r"(^|/)initial_admin_password\.txt$",  # the legacy credentials file
    r"(^|/).*password.*\.txt$",            # any *password*.txt
    r"(^|/).*secret.*\.(txt|json|env)$",   # any *secret*.{txt,json,env}
    r"(^|/).*token.*\.(txt|json|env)$",    # any *token*.{txt,json,env}
    r"(^|/)\.env$",                        # dotenv files
    r"(^|/)\.env\..*$",                    # dotenv variants
    r"(^|/)credentials\.json$",            # credentials JSON
    r"(^|/)service-account.*\.json$",      # GCP service account JSON
    r"(^|/).*\.pem$",                      # PEM private keys
    r"(^|/).*\.key$",                      # private key files
    r"(^|/).*\.p12$",                      # PKCS#12 keystores
    r"(^|/).*\.log$",                      # log files
    r"(^|/).*\.tap$",                      # TAP test output
    r"(^|/).*\.lcov$",                     # lcov coverage
    r"(^|/)coverage/",                     # coverage directory
    r"(^|/).*\.coverage$",                 # coverage data
    r"(^|/)\.DS_Store$",                   # macOS finder cache
    r"(^|/)Thumbs\.db$",                   # Windows thumbnail cache
    r"(^|/)playwright-report/",            # playwright HTML report
    r"(^|/)test-results/",                 # playwright test-results
    r"(^|/)\.vscode/",                     # editor config (user-specific)
    r"(^|/)\.idea/",                       # JetBrains IDE config
]

# Patterns that are allowed even if they look suspicious (e.g. fixture files
# inside test directories). Matched as exact path prefixes.
ALLOWED_PREFIXES = [
    "test/fixtures/",   # test fixture data is intentional
    "src-tauri/icons/", # icon assets stay
]

def is_forbidden(rel_path: str) -> tuple[bool, str | None]:
    """Return (True, reason) if the path matches a forbidden pattern."""
    # Normalize to forward slashes
    p = rel_path.replace("\\", "/")
    for allowed in ALLOWED_PREFIXES:
        if p.startswith(allowed):
            return (False, None)
    for pat in FORBIDDEN_PATTERNS:
        if re.search(pat, p, re.IGNORECASE):
            return (True, pat)
    return (False, None)


def scan(root: Path) -> list[tuple[Path, str]]:
    violations: list[tuple[Path, str]] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune ignored directories early so we don't waste time
        for d in list(dirnames):
            full = Path(dirpath) / d
            rel = str(full.relative_to(root))
            bad, _ = is_forbidden(rel + "/")
            if bad:
                violations.append((full, "directory"))
                dirnames.remove(d)  # don't recurse
        for f in filenames:
            full = Path(dirpath) / f
            rel = str(full.relative_to(root))
            bad, pat = is_forbidden(rel)
            if bad:
                violations.append((full, pat or "file"))
    return violations


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not root.exists():
        print(f"ERROR: project root {root} does not exist", file=sys.stderr)
        return 2

    # Special check: the legacy credentials file must NOT exist anywhere.
    creds = root / "src-tauri" / "initial_admin_password.txt"
    if creds.exists():
        print(
            f"FORBIDDEN: {creds} still exists — delete it before packaging",
            file=sys.stderr,
        )
        return 1

    violations = scan(root)
    if not violations:
        print(f"OK: artifact hygiene scan passed for {root}")
        return 0

    print(f"FAIL: {len(violations)} forbidden artifact(s) found in {root}:", file=sys.stderr)
    for path, pat in violations:
        try:
            rel = path.relative_to(root)
        except ValueError:
            rel = path
        print(f"  - {rel}   (matched: {pat})", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
