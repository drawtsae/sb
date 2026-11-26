/** A second press of the same control within this window is a double click: dropped. */
export const GUARD_MS = 300;

/**
 * Returns `pass(action)`: true when `action` was not accepted in the last GUARD_MS. Only repeats
 * of the same action are dropped, so a quick sequence of different actions still goes through.
 */
export function createActionGuard(now: () => number = () => performance.now()) {
  const last = new Map<string, number>();
  return (action: string): boolean => {
    const t = now();
    const prev = last.get(action);
    if (prev !== undefined && t - prev < GUARD_MS) return false;
    last.set(action, t);
    return true;
  };
}
