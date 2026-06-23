# Accounting Tests — Fajr Alwadi

This folder contains all accounting verification files for the Fajr Alwadi project.

## Folder Structure

```
test/accounting/
├── README.md                  ← This file
├── reports/
│   ├── current/               ← Latest test reports
│   │   ├── ACCOUNTING_TEST_RESULTS.md
│   │   ├── ACCOUNTING_TEST_SUMMARY.json
│   │   ├── ACCOUNTING_TEST_FAILURES.md
│   │   ├── ACCOUNTING_TEST_COVERAGE.md
│   │   ├── ACCOUNTING_TEST_PLAN.md
│   │   ├── ACCOUNTING_FIX_LOG.md
│   │   └── AUDIT_RESULTS.md
│   └── archive/               ← Historical reports
├── state/                     ← Checkpoint, progress, all-results
│   ├── ACCOUNTING_TEST_CHECKPOINT.json
│   ├── ACCOUNTING_TEST_PROGRESS.json
│   └── all-results.json
├── runners/                   ← Test runner scripts
│   ├── fast-scan-no-fix.ts
│   ├── consolidate-reports.ts
│   ├── write-coverage.ts
│   └── write-plan.ts
├── oracle/                    ← Pure accounting calculations (ORACLE layer)
├── backend/                   ← Backend DB tests (BACKEND_DB layer)
├── shared/                    ← Shared test helpers
├── bridge/                    ← E2E_BRIDGE test command helpers
└── e2e/                       ← Playwright UI tests (CHROMIUM_UI layer)
```

## Running Tests

### Fast scan (E2E_BRIDGE, no fixes applied)

```bash
npm run test:accounting:fast-scan-no-fix
```

Scans all pending scenarios via the E2E_BRIDGE (Node.js SQLite mock). Does not apply fixes.

### Resume from last checkpoint

```bash
npm run test:accounting:scan-resume
```

### Run next pending scenario only

```bash
npm run test:accounting:scan-next
```

### Run a specific scenario by ID

```bash
npm run test:accounting:scan-scenario -- S04
```

### Run full 3-layer accounting suite

```bash
npm run test:accounting:fast    # ORACLE + BACKEND_DB + consolidate
npm run test:accounting:full    # ORACLE + BACKEND_DB + CHROMIUM_UI + consolidate
```

### Consolidate reports

```bash
npm run test:consolidate
```

## Important Notes

- **E2E_BRIDGE is NOT the real Tauri backend.** It is a Node.js SQLite mock used for fast iterative testing. Results from E2E_BRIDGE are useful for quick verification but are NOT sufficient for final delivery sign-off.
- **Final delivery still requires real Tauri verification.** Run the full test suite against the actual Tauri backend before marking scenarios as delivered.
- The 3-layer approach (ORACLE → BACKEND_DB → CHROMIUM_UI) ensures each scenario is validated at the calculation, database, and UI levels.

## Latest Results

- Total scenarios: 71
- Passed: 51
- Failed: 20
- Pending: 0
- Coverage: 100%

Failed scenarios are listed in `test/accounting/reports/current/ACCOUNTING_FIX_LOG.md`.
