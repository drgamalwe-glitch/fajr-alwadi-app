# Accounting Test Failures

**Generated:** 2026-06-23T04:47:47.908Z

## S04: USD cash car purchase

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** inventory_usd: expected 10000, got 0

**Expected:**
- inventoryUsd: 10,000
- qasaUsd: -10,000
- qasaIqd: 0

**Actual:**
- inventoryUsd: 0
- qasaUsd: -10,000
- qasaIqd: 0

## S13: Installment overpayment

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** profit cap: expected 10000000, got 10500000 (diff 500000); profit 10500000 exceeded cap 10,000,000; totalProfit: expected 10000000, got 10500000 (diff 500000)

**Expected:**
- profit: 10,000,000
- qasa: 11,000,000
- totalProfit: 10,000,000

**Actual:**
- profit: 10,500,000
- qasa: 11,000,000
- totalProfit: 10,500,000

## S15: Installment with car expense

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** profit with car expense: expected 2400000, got 2900000 (diff 500000); qasa: expected -4000000, got -6000000 (diff 2000000)

**Expected:**
- profit: 2,400,000
- qasa: -4,000,000

**Actual:**
- profit: 2,900,000
- qasa: -6,000,000

## S19: Car expense after sale

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa after expense: expected 6000000, got 7000000 (diff 1000000)

**Expected:**
- profitBefore: 8,000,000
- profitAfter: 8,000,000
- qasaAfter: 6,000,000

**Actual:**
- profitBefore: 8,000,000
- profitAfter: 8,000,000
- qasaAfter: 7,000,000

## S24: Edit general expense

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa after edit: expected -2000000, got -1000000 (diff 1000000)

**Expected:**
- qasa: -2,000,000
- profit: -2,000,000

**Actual:**
- qasa: -1,000,000
- profit: -2,000,000

## S26: Investor deposit

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** investments: expected 10000000, got 0 (diff 10000000)

**Expected:**
- qasa: 10,000,000
- partnerCash: 0
- profit: 0
- investments: 10,000,000

**Actual:**
- qasa: 10,000,000
- partnerCash: 0
- profit: 0
- investments: 0

## S27: Investor withdrawal

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** investments: expected 6000000, got 0 (diff 6000000)

**Expected:**
- qasa: 6,000,000
- investments: 6,000,000

**Actual:**
- qasa: 6,000,000
- investments: 0

## S28: Investor + car purchase

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** investments: expected 20000000, got 0 (diff 20000000)

**Expected:**
- qasa: 10,000,000
- inventory: 10,000,000
- investments: 20,000,000

**Actual:**
- qasa: 10,000,000
- inventory: 10,000,000
- investments: 0

## S29: Delete investor with balance

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** investments before: expected 5000000, got 0 (diff 5000000)

**Expected:**
- investmentsBefore: 5,000,000
- investmentsAfter: 0
- qasaAfter: 0

**Actual:**
- investmentsBefore: 0
- investmentsAfter: 0
- qasaAfter: 0

## S31: Funder repayment

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected -10000000, got 0 (diff 10000000); partnerCash: expected -10000000, got 0 (diff 10000000)

**Expected:**
- qasa: -10,000,000
- partnerCash: -10,000,000
- inventory: 10,000,000

**Actual:**
- qasa: 0
- partnerCash: 0
- inventory: 10,000,000

## S32: Partial funder repayment

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected -4000000, got 0 (diff 4000000); partnerCash: expected -4000000, got 0 (diff 4000000)

**Expected:**
- qasa: -4,000,000
- partnerCash: -4,000,000

**Actual:**
- qasa: 0
- partnerCash: 0

## S33: Funder repayment with commission

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected -10500000, got 0 (diff 10500000); partnerCash: expected -10500000, got 0 (diff 10500000)

**Expected:**
- qasa: -10,500,000
- partnerCash: -10,500,000

**Actual:**
- qasa: 0
- partnerCash: 0

## S36: Company repayment

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected -10000000, got 0 (diff 10000000); partnerCash: expected -10000000, got 0 (diff 10000000)

**Expected:**
- qasa: -10,000,000
- partnerCash: -10,000,000

**Actual:**
- qasa: 0
- partnerCash: 0

## S37: Partial company repayment

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected -3000000, got 0 (diff 3000000); partnerCash: expected -3000000, got 0 (diff 3000000)

**Expected:**
- qasa: -3,000,000
- partnerCash: -3,000,000

**Actual:**
- qasa: 0
- partnerCash: 0

## S42: Delete one agency transaction

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** one agency remains: expected 1, got 0

**Expected:**
- remainingCount: 1
- deletedGone: 0

**Actual:**
- remainingCount: 0
- deletedGone: 0

## S51: Edit available car purchase

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa after edit: expected -15000000, got -10000000 (diff 5000000)

**Expected:**
- inventoryBefore: 10,000,000
- qasaBefore: -10,000,000
- inventoryAfter: 15,000,000
- qasaAfter: -15,000,000

**Actual:**
- inventoryBefore: 10,000,000
- qasaBefore: -10,000,000
- inventoryAfter: 15,000,000
- qasaAfter: -10,000,000

## S55: Delete sold installment car

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa after delete: expected 0, got 1000000; profit after delete: expected 0, got 500000

**Expected:**
- qasaBefore: -4,000,000
- qasaAfter: 0
- profitAfter: 0
- inventoryAfter: 0

**Actual:**
- qasaBefore: -4,000,000
- qasaAfter: 1,000,000
- profitAfter: 500,000
- inventoryAfter: 0

## S69: Funder cycle

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected 8000000, got 18000000 (diff 10000000)

**Expected:**
- qasa: 8,000,000
- profit: 8,000,000

**Actual:**
- qasa: 18,000,000
- profit: 8,000,000

## S70: Company cycle

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** qasa: expected 8000000, got 18000000 (diff 10000000)

**Expected:**
- qasa: 8,000,000
- profit: 8,000,000

**Actual:**
- qasa: 18,000,000
- profit: 8,000,000

## S71: Investor cycle

- **Layer:** BACKEND_DB
- **Backend Mode:** E2E_BRIDGE
- **Failure Reason:** investments: expected 20000000, got 0 (diff 20000000)

**Expected:**
- qasa: 28,000,000
- profit: 8,000,000
- investments: 20,000,000

**Actual:**
- qasa: 28,000,000
- profit: 8,000,000
- investments: 0
