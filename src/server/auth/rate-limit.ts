// 5 failed logins per 15 minutes per email+ip. In-memory (single process).
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

const g = globalThis as unknown as { __sbLoginFailures?: Map<string, number[]> };
const store = (): Map<string, number[]> => (g.__sbLoginFailures ??= new Map());

export function loginRateKey(email: string, headers: { get(name: string): string | null }): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return `${email.toLowerCase()}|${ip}`;
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

export function resetLoginRate(key: string): void {
  store().delete(key);
}

export function resetRateLimitForTests(): void {
  store().clear();
}
