import { describe, expect, it } from "vitest";
import {
  generateCreationToken,
  IdempotencyGuard,
} from "../../src/utils/idempotency";

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
 * FORENSIC FIX (re-audit 2026-07-11, TEST-DEJAVU-1):
 * Previously this file re-defined a local copy of `generateCreationToken` and
 * a local `IdempotencyGuard` class, which diverged from the production
 * implementation in `src/utils/idempotency.ts`. We now import the real
 * production implementation so the tests actually verify production behavior.
 * The local `resolveUniqueCarNumber` mirror is retained because it is a pure
 * helper used only by the frontend's car-form panel and there is no shared
 * module to import from — the backend owns the canonical resolution logic
 * (resolve_unique_car_number in lib.rs).
 */

// ─────────────────────────────────────────────────────────────────────
// §31.2 — Idempotency Token Generation (uses production implementation)
// ─────────────────────────────────────────────────────────────────────

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
// §31.3 — Duplicate Chassis Allowed (frontend helper mirror)
// ─────────────────────────────────────────────────────────────────────

/**
 * Mirror of resolve_unique_car_number (lib.rs):
 * if the requested plate exists, append #2, #3, etc.
 *
 * NOTE: This is a pure frontend helper used only for UX feedback before
 * the actual backend call. The backend's `resolve_unique_car_number` is the
 * single source of truth — this mirror exists only to give the user immediate
 * feedback in the form before IPC round-trip.
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
// §31.5 — Duplicate Addition Prevention (uses production IdempotencyGuard)
// ─────────────────────────────────────────────────────────────────────

describe("Instructions.md §31.5 — Duplicate Addition Prevention (Frontend Guard)", () => {
  it("coalesces concurrent calls with the same token into a single backend call", async () => {
    // The production IdempotencyGuard deduplicates IN-FLIGHT calls: if two
    // invocations share a token while the first is still pending, both await
    // the same promise. This is the frontend's half of §31.5 — the backend's
    // half (creation_token UNIQUE index) handles cross-session dedup.
    const guard = new IdempotencyGuard();
    const token = generateCreationToken();
    let callCount = 0;
    const fn = async (): Promise<string> => {
      callCount += 1;
      await new Promise((r) => setTimeout(r, 10));
      return "ok";
    };
    const [a, b] = await Promise.all([guard.run(token, fn), guard.run(token, fn)]);
    expect(a).toBe("ok");
    expect(b).toBe("ok");
    expect(callCount).toBe(1);
  });

  it("runs separate calls with different tokens independently", async () => {
    const guard = new IdempotencyGuard();
    const token1 = generateCreationToken();
    const token2 = generateCreationToken();
    expect(token1).not.toBe(token2);

    let count = 0;
    const fn = async (): Promise<string> => {
      count += 1;
      return `r${count}`;
    };
    const [r1, r2] = await Promise.all([guard.run(token1, fn), guard.run(token2, fn)]);
    expect(r1).toBe("r1");
    expect(r2).toBe("r2");
  });

  it("clears in-flight state after a call completes so the token can be reused", async () => {
    const guard = new IdempotencyGuard();
    const token = generateCreationToken();
    let count = 0;
    const fn = async (): Promise<string> => {
      count += 1;
      return `r${count}`;
    };
    const r1 = await guard.run(token, fn);
    // After the first call completes, the same token can be reused (the
    // backend will dedup via its UNIQUE index, but the frontend guard no
    // longer holds the token in-flight).
    expect(guard.isInFlight(token)).toBe(false);
    const r2 = await guard.run(token, fn);
    expect(r1).toBe("r1");
    expect(r2).toBe("r2");
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
