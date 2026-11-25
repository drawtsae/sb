/** Seconds -> "m:ss" (or "m:ss.d" when there is a fractional part, to 0.1 s). */
export function formatTime(sec: number): string {
  const total = Math.max(0, Math.round(sec * 10) / 10);
  let m = Math.floor(total / 60);
  let s = Math.round((total - m * 60) * 10) / 10;
  if (s >= 60) {
    m += 1;
    s = 0;
  }
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 10);
  return `${m}:${String(whole).padStart(2, "0")}${frac ? `.${frac}` : ""}`;
}

/** "1:05", "65", "1:05.5" or "65,5" -> seconds (rounded to 0.1), or null when not a time. */
export function parseTime(text: string): number | null {
  const t = text.trim().replace(",", ".");
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const minutes = m[1] ? Number(m[1]) : 0;
  const seconds = Number(m[2]);
  if (m[1] && seconds >= 60) return null;
  return Math.round((minutes * 60 + seconds) * 10) / 10;
}
