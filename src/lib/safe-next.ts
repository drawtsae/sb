/** Only same-origin relative paths: a single leading "/", no "//", no backslashes or control chars. */
export function safeNext(raw: unknown, fallback = "/events"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}
