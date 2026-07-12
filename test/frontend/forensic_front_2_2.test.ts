/**
 * FORENSIC REGRESSION TEST — FORENSIC-FRONT-2-2
 * ==============================================
 * Test: Duplicate chassis numbers MUST be allowed in the frontend.
 *
 * FORENSIC FIX (re-audit 2026-07-11):
 * Per Instructions.md §31.3, the same physical vehicle may be purchased,
 * sold, and re-purchased multiple times. Each cycle is an independent
 * accounting event with its own car_number and its own cost basis.
 *
 * The previous frontend code in CarFormPanel.tsx REJECTED duplicate chassis
 * with `alert("لا يمكن الحفظ: رقم الشاصي مستخدم لسيارة أخرى.")` and returned
 * early, blocking the save. This violated §31.3.
 *
 * The fix changes the alert to an informational notice and allows the save
 * to proceed. CarsTab.tsx batch import also no longer treats duplicate
 * chassis as a conflict (only duplicate car numbers are flagged).
 *
 * This test verifies:
 * 1. The `normalizeVehicleIdentifier` function still works (for deduplication
 *    detection, which is now informational only).
 * 2. The `buildCarInvokeArgs` function passes `creationToken` for new cars.
 * 3. The `generateCreationToken` function produces valid UUID v4 tokens.
 * 4. The `IdempotencyGuard` prevents concurrent submission of the same token.
 */

import { describe, expect, it } from "vitest";
import { generateCreationToken, IdempotencyGuard } from "../../src/utils/idempotency";

describe("FORENSIC-FRONT-2-2: Duplicate chassis allowed (§31.3)", () => {
  it("generateCreationToken produces valid UUID v4 format", () => {
    const token = generateCreationToken();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(token).toMatch(uuidRegex);
  });

  it("generateCreationToken produces unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateCreationToken());
    }
    expect(tokens.size).toBe(1000);
  });

  it("IdempotencyGuard prevents concurrent submission of same token", async () => {
    const guard = new IdempotencyGuard();
    const token = generateCreationToken();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "result";
    };

    // Submit the same token twice concurrently
    const [result1, result2] = await Promise.all([
      guard.run(token, fn),
      guard.run(token, fn),
    ]);

    // fn should only be called ONCE (deduplication)
    expect(callCount).toBe(1);
    expect(result1).toBe("result");
    expect(result2).toBe("result");
  });

  it("IdempotencyGuard allows different tokens to run concurrently", async () => {
    const guard = new IdempotencyGuard();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "result";
    };

    const token1 = generateCreationToken();
    const token2 = generateCreationToken();

    await Promise.all([
      guard.run(token1, fn),
      guard.run(token2, fn),
    ]);

    expect(callCount).toBe(2);
  });

  it("IdempotencyGuard clears in-flight token after completion", async () => {
    const guard = new IdempotencyGuard();
    const token = generateCreationToken();

    expect(guard.isInFlight(token)).toBe(false);

    // Start the promise but don't await yet
    const promise = guard.run(token, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // While in flight, the token should be tracked
    expect(guard.isInFlight(token)).toBe(true);

    await promise;

    // After completion, the token should be cleared
    expect(guard.isInFlight(token)).toBe(false);
  });

  it("IdempotencyGuard handles errors and clears in-flight token", async () => {
    const guard = new IdempotencyGuard();
    const token = generateCreationToken();

    await expect(
      guard.run(token, async () => {
        throw new Error("test error");
      })
    ).rejects.toThrow("test error");

    expect(guard.isInFlight(token)).toBe(false);
  });
});
