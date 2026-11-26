// 5 failed logins per 15 minutes per email+ip. In-memory (single process).
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

const g = globalThis as unknown as { __sbLoginFailures?: Map<string, number[]> };
const store = (): Map<string, number[]> => (g.__sbLoginFailures ??= new Map());

/**
 * Client IP for rate limiting. X-Forwarded-For is only trusted as far as TRUST_PROXY_HOPS
 * reverse proxies we control: each one appends the address it saw, so the real client is the
 * entry `hops` from the right. Anything further left was sent by the client and can be faked.
 * 0 (default, app published directly) ignores the header entirely.
 */
function clientIp(headers: { get(name: string): string | null }): string {
  const hops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "", 10);
  if (!Number.isInteger(hops) || hops < 1) return "local";
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain.length >= hops ? chain[chain.length - hops] : "local";
}

export function loginRateKey(email: string, headers: { get(name: string): string | null }): string {
  return `${email.toLowerCase()}|${clientIp(headers)}`;
}

function recent(key: string, now: number): number[] {
  const list = (store().get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) store().set(key, list);
  else store().delete(key);
  return list;
}

export function checkLoginRate(
  key: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const list = recent(key, now);
  if (list.length < MAX_FAILURES) return { allowed: true, retryAfterSec: 0 };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((list[0] + WINDOW_MS - now) / 1000)),
  };
}

export function recordLoginFailure(key: string, now: number = Date.now()): void {
  const list = recent(key, now);
  list.push(now);
  store().set(key, list);
}

/**
 * Check and, if allowed, synchronously count the attempt as a provisional failure.
 * Must be called before any await so concurrent requests cannot all pass the check.
 * Clear with resetLoginRate on success.
 */
export function reserveLoginAttempt(
  key: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  const r = checkLoginRate(key, now);
  if (r.allowed) recordLoginFailure(key, now);
  return r;
}

export function resetLoginRate(key: string): void {
  store().delete(key);
}

export function resetRateLimitForTests(): void {
  store().clear();
}
