// A small, single-purpose clock abstraction for token expiry checks.
// Deliberately well-factored: one job, one reason to change.

export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

const SKEW_MS = 30_000;

/** True if `expiresAtMs` is in the past (allowing for a small clock skew). */
export function isExpired(expiresAtMs: number, clock: Clock = systemClock): boolean {
  return expiresAtMs <= clock.now() - SKEW_MS;
}

/** Milliseconds until expiry; 0 if already expired. */
export function timeUntilExpiry(expiresAtMs: number, clock: Clock = systemClock): number {
  return Math.max(0, expiresAtMs - clock.now());
}
