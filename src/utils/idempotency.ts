/**
 * IdempotencyGuard — prevents duplicate creation requests from double-clicks
 * or network retries.
 *
 * FORENSIC FIX (re-audit 2026-07-11, FORENSIC-FRONT-2-4):
 * Per Instructions.md §31.2, every create operation must accept an optional
 * `creation_token` (UUID v4). If the same token is submitted twice, the
 * backend returns the original entity's ID without creating a duplicate.
 *
 * This module provides:
 *   1. `generateCreationToken()` — generates a UUID v4 token.
 *   2. `IdempotencyGuard` — tracks in-flight tokens to prevent the SAME
 *      frontend session from submitting the same token twice before the
 *      first request completes.
 *
 * Usage in a create flow:
 *   const token = generateCreationToken();
 *   const guard = new IdempotencyGuard();
 *   await guard.run(token, () => callTauri("add_car", { ..., creationToken: token }));
 */

/**
 * Generate a UUID v4 creation token.
 * Uses crypto.randomUUID() when available (modern browsers, Node ≥ 19),
 * falls back to a manual RFC 4122 v4 implementation.
 */
export function generateCreationToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Manual fallback: RFC 4122 v4
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    // Math.random fallback (non-cryptographic, but sufficient for idempotency)
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Set version (4) and variant (10xx)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

/**
 * IdempotencyGuard — prevents concurrent submission of the same token.
 * If a token is already in-flight, the second call returns the same promise
 * (deduplication at the frontend level).
 */
export class IdempotencyGuard {
  private inflight = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` with the given `token`. If a call with the same token is already
   * in-flight, returns the same promise instead of calling `fn` again.
   */
  async run<T>(token: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(token);
    if (existing) {
      return existing as Promise<T>;
    }
    const promise = fn().finally(() => {
      this.inflight.delete(token);
    });
    this.inflight.set(token, promise);
    return promise;
  }

  /** Check if a token is currently in-flight. */
  isInFlight(token: string): boolean {
    return this.inflight.has(token);
  }

  /** Clear all in-flight tokens (for testing). */
  clear(): void {
    this.inflight.clear();
  }
}

/** Shared singleton guard for the app. */
export const idempotencyGuard = new IdempotencyGuard();
