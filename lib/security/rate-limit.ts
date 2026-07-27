/**
 * Action rate-limit placeholder.
 *
 * Future: integrate Redis / Upstash (or similar) to enforce per-user and
 * per-action quotas for expensive or sensitive operations (duplicate scan,
 * merge, import/export, document upload).
 *
 * Env vars (planned, not required yet):
 * - RATE_LIMIT_REDIS_URL
 * - RATE_LIMIT_UPSTASH_REDIS_REST_URL
 * - RATE_LIMIT_UPSTASH_REDIS_REST_TOKEN
 * - RATE_LIMIT_ENABLED=true
 *
 * Current behavior: no-op (always allows). Call sites stay ready for enforcement.
 */

export type RateLimitResult = {
  allowed: true;
  remaining?: number;
};

/**
 * Assert that `userId` may perform `actionKey`.
 * Throws when limited (future). Today always resolves successfully.
 */
export async function assertActionAllowed(
  actionKey: string,
  userId: string | null | undefined,
): Promise<RateLimitResult> {
  void actionKey;
  void userId;
  // No-op placeholder — wire Redis/Upstash here before production hardening.
  return { allowed: true };
}
