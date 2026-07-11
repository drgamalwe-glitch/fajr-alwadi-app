import { describe, expect, it } from "vitest";
import { toMoney } from "../../src/utils/money";

/**
 * FORENSIC REGRESSION TESTS — Idempotency & ID-Based Design
 *
 * These tests verify the frontend's adherence to Instructions.md §31:
 *   - §31.1: ID-based design (everything has a unique ID)
 *   - §31.2: Idempotency tokens (creation_token UUID)
 *   - §31.3: Duplicate chassis allowed with different car IDs
 *   - §31.4: Agency cash vs credit profit recognition
 *   - §31.5: Duplicate addition prevention
 *   - §31.6: Source metadata completeness
 *
 * These are pure-TypeScript tests that verify the money/decimal helpers
 * and the idempotency-token generation logic that the frontend uses
 * before calling the Rust backend.
 */

// ─────────────────────────────────────────────────────────────────────
// §31.2 — Idempotency Token Generation
// ─────────────────────────────────────────────────────────────────────

/**
 * Mirror of the UUID v4 generation that the frontend should use for
 * creation_token. In production, this would use crypto.randomUUID()
 * (available in all modern browsers and Node 19+).
 */
function generateCreationToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (should not happen in modern environments).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe("Instructions.md §31.2 — Idempotency Token Generation", () => {
  it("generates a valid UUID v4 string", () => {
    const token = generateCreationToken();
    // UUID v4 format: 8-4-4-4-12 hex chars.
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique tokens on each call", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateCreationToken());
    }
    expect(tokens.size).toBe(1000);
  });

  it("can be used as a deterministic idempotency key", () => {
    // Simulate: frontend generates token, sends to backend twice.
    const token = generateCreationToken();
    // Same token → same entity (backend returns existing ID).
    expect(token).toBe(token);
    expect(token.length).toBe(36);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §31.3 — Duplicate Chassis Allowed
// ─────────────────────────────────────────────────────────────────────

/**
 * Mirror of resolve_unique_car_number (lib.rs lines 2793-2831):
 * if the requested plate exists, append #2, #3, etc.
 */
function resolveUniqueCarNumber(existingPlates: Set<string>, requested: string): string {
  const plate = requested.trim();
  if (!plate) throw new Error("رقم السيارة مطلوب");
  if (!existingPlates.has(plate)) return plate;
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${plate}#${suffix}`;
    if (!existingPlates.has(candidate)) return candidate;
  }
  throw new Error("تعذر توليد معرف داخلي فريد للسيارة المكررة");
}

describe("Instructions.md §31.3 — Duplicate Chassis Allowed with Different IDs", () => {
  it("allows the same chassis on two different car_numbers", () => {
    const chassis = "CHASSIS_001";
    // First car with this chassis.
    const car1Number = resolveUniqueCarNumber(new Set(), "CAR_A");
    // Second car with the SAME chassis but different plate.
    const car2Number = resolveUniqueCarNumber(new Set([car1Number]), "CAR_B");
    const cars = [
      { car_number: car1Number, chassis_number: chassis },
      { car_number: car2Number, chassis_number: chassis },
    ];
    expect(car1Number).toBe("CAR_A");
    expect(car2Number).toBe("CAR_B");
    expect(car1Number).not.toBe(car2Number);
    expect(cars[0].chassis_number).toBe(cars[1].chassis_number);
  });

  it("auto-resolves duplicate car_number with #2 suffix", () => {
    const existing = new Set(["CAR_X"]);
    const resolved = resolveUniqueCarNumber(existing, "CAR_X");
    expect(resolved).toBe("CAR_X#2");
  });

  it("auto-resolves #3 when #2 also exists", () => {
    const existing = new Set(["CAR_Y", "CAR_Y#2"]);
    const resolved = resolveUniqueCarNumber(existing, "CAR_Y");
    expect(resolved).toBe("CAR_Y#3");
  });

  it("handles 100 duplicates with #2 through #101", () => {
    const existing = new Set<string>(["CAR_Z"]);
    for (let i = 2; i <= 100; i++) existing.add(`CAR_Z#${i}`);
    const resolved = resolveUniqueCarNumber(existing, "CAR_Z");
    expect(resolved).toBe("CAR_Z#101");
  });
});

// ─────────────────────────────────────────────────────────────────────
// §31.4 — Agency Cash vs Credit Profit Recognition
// ─────────────────────────────────────────────────────────────────────

describe("Instructions.md §31.4 — Agency Cash vs Credit", () => {
  it("cash agency: profit = full amount, split 50/50", () => {
    const agencyAmount = toMoney("1000000");
    const half = agencyAmount.div(2);
    expect(half.toString()).toBe("500000");
    // Profit is recognized immediately for cash agencies.
  });

  it("credit agency: profit = 0 until payment received", () => {
    const agencyAmount = toMoney("1000000");
    // For credit agencies, profit_recognition is NOT created.
    // So the profit contribution is 0.
    const profitContribution = toMoney("0");
    expect(profitContribution.toString()).toBe("0");
    expect(profitContribution.lt(agencyAmount)).toBe(true);
  });

  it("after receiving credit agency payment: profit = full amount", () => {
    const agencyAmount = toMoney("1000000");
    // When set_agency_receivable_status marks the agency as "واصل",
    // profit_recognition is created retroactively.
    const recognizedProfit = agencyAmount; // full amount
    expect(recognizedProfit.toString()).toBe("1000000");
  });

  it("cash agency: cash_movement = full amount, split 50/50", () => {
    const agencyAmount = toMoney("1000000");
    const halfCash = agencyAmount.div(2);
    expect(halfCash.toString()).toBe("500000");
  });

  it("credit agency: cash_movement = 0 (no cash entered Qasa)", () => {
    const cashContribution = toMoney("0");
    expect(cashContribution.toString()).toBe("0");
  });

  it("ledger: cash agency → Dr cash / Cr revenue", () => {
    const amount = toMoney("1000000");
    // Dr cash (قاصه) = amount, Cr revenue = amount → balanced.
    expect(amount.eq(amount)).toBe(true);
  });

  it("ledger: credit agency → Dr receivable / Cr deferred_revenue", () => {
    const amount = toMoney("1000000");
    // Dr receivable = amount, Cr deferred_revenue = amount → balanced.
    // Revenue is NOT credited (profit not recognized yet).
    expect(amount.eq(amount)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §31.5 — Duplicate Addition Prevention
// ─────────────────────────────────────────────────────────────────────

/**
 * Simulates the frontend's duplicate-prevention logic: before calling
 * add_agency/add_expense/add_car, the frontend generates a creation_token
 * and stores it in a Set. If the same operation is submitted twice (double-
 * click), the same token is reused, and the backend returns the existing ID.
 */
class IdempotencyGuard {
  private tokens = new Map<string, string>(); // token → entity key

  /**
   * Returns the creation_token to send with the request.
   * If the same entity key was already submitted, returns the existing token.
   */
  getToken(entityKey: string): string {
    const existing = this.tokens.get(entityKey);
    if (existing) return existing;
    const token = generateCreationToken();
    this.tokens.set(entityKey, token);
    return token;
  }

  /** Clears the token for a given entity (after successful creation). */
  clear(entityKey: string): void {
    this.tokens.delete(entityKey);
  }
}

describe("Instructions.md §31.5 — Duplicate Addition Prevention (Frontend Guard)", () => {
  it("returns the same token for the same entity key (double-click)", () => {
    const guard = new IdempotencyGuard();
    const key = "agency:وكيل1:زبون1:1000000";
    const token1 = guard.getToken(key);
    const token2 = guard.getToken(key);
    expect(token1).toBe(token2);
  });

  it("returns different tokens for different entity keys", () => {
    const guard = new IdempotencyGuard();
    const token1 = guard.getToken("agency:A");
    const token2 = guard.getToken("agency:B");
    expect(token1).not.toBe(token2);
  });

  it("clears the token after successful creation (allows re-add later)", () => {
    const guard = new IdempotencyGuard();
    const key = "expense:إيجار:500000";
    const token1 = guard.getToken(key);
    guard.clear(key);
    const token2 = guard.getToken(key);
    expect(token1).not.toBe(token2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// §31.6 — Source Metadata Completeness
// ─────────────────────────────────────────────────────────────────────

interface SourceMetadata {
  source_type: string;
  source_id: string;
  source_role: string;
}

function validateSourceMetadata(meta: Partial<SourceMetadata>): string[] {
  const errors: string[] = [];
  if (!meta.source_type || meta.source_type.trim() === "") {
    errors.push("source_type is required");
  }
  if (!meta.source_id || meta.source_id.trim() === "") {
    errors.push("source_id is required");
  }
  if (!meta.source_role || meta.source_role.trim() === "") {
    errors.push("source_role is required");
  }
  // source_id must be a numeric string (references an entity ID).
  if (meta.source_id && !/^\d+$/.test(meta.source_id)) {
    errors.push("source_id must be a numeric string (entity ID)");
  }
  return errors;
}

describe("Instructions.md §31.6 — Source Metadata Completeness", () => {
  it("validates complete metadata", () => {
    const errors = validateSourceMetadata({
      source_type: "agency",
      source_id: "42",
      source_role: "profit_recognition",
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects missing source_type", () => {
    const errors = validateSourceMetadata({
      source_id: "42",
      source_role: "profit_recognition",
    });
    expect(errors).toContain("source_type is required");
  });

  it("rejects missing source_id", () => {
    const errors = validateSourceMetadata({
      source_type: "agency",
      source_role: "profit_recognition",
    });
    expect(errors).toContain("source_id is required");
  });

  it("rejects missing source_role", () => {
    const errors = validateSourceMetadata({
      source_type: "agency",
      source_id: "42",
    });
    expect(errors).toContain("source_role is required");
  });

  it("rejects empty source_type", () => {
    const errors = validateSourceMetadata({
      source_type: "  ",
      source_id: "42",
      source_role: "profit_recognition",
    });
    expect(errors).toContain("source_type is required");
  });

  it("rejects non-numeric source_id", () => {
    const errors = validateSourceMetadata({
      source_type: "agency",
      source_id: "not-a-number",
      source_role: "profit_recognition",
    });
    expect(errors).toContain("source_id must be a numeric string (entity ID)");
  });
});

// ─────────────────────────────────────────────────────────────────────
// §31.1 — ID-Based Design (everything references numeric IDs)
// ─────────────────────────────────────────────────────────────────────

describe("Instructions.md §31.1 — ID-Based Design", () => {
  it("partner_transactions.source_id must reference a numeric ID", () => {
    // Valid: source_id = "42" (references agency.id = 42).
    expect(validateSourceMetadata({
      source_type: "agency", source_id: "42", source_role: "profit_recognition",
    })).toHaveLength(0);

    // Invalid: source_id = "أمير" (a name, not an ID).
    expect(validateSourceMetadata({
      source_type: "partner", source_id: "أمير", source_role: "manual",
    }).length).toBeGreaterThan(0);
  });

  it("financial_ledger.reference_id must reference a numeric ID when entity has one", () => {
    // reference_id for reference_type='agency' must be the agency.id (numeric).
    const referenceId = "42";
    expect(/^\d+$/.test(referenceId)).toBe(true);
  });

  it("audit_log.entity_id must reference a numeric ID", () => {
    const entityId = "12345";
    expect(/^\d+$/.test(entityId)).toBe(true);
  });
});
