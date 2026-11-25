/** Build a play order for `count` tracks. `rng` returns values in [0,1). */
export function buildOrder(
  count: number,
  shuffle: boolean,
  rng: () => number,
  avoidFirst?: number,
): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  if (!shuffle) return order;
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && avoidFirst !== undefined && order[0] === avoidFirst) {
    const k = 1 + Math.floor(rng() * (order.length - 1));
    [order[0], order[k]] = [order[k], order[0]];
  }
  return order;
}

/** Advance one step; on wrap go to pos 0, reshuffling when shuffle is on. */
export function nextPosition(
  order: number[],
  pos: number,
  shuffle: boolean,
  rng: () => number,
): { order: number[]; pos: number } {
  if (order.length === 0) return { order: [], pos: 0 };
  if (pos + 1 < order.length) return { order, pos: pos + 1 };
  if (shuffle) {
    return { order: buildOrder(order.length, true, rng, order[pos]), pos: 0 };
  }
  return { order, pos: 0 };
}
