import { cardSortIndex } from "./deck";

const HIDDEN = "__hidden__";

/**
 * Mode (most frequent vote). Ties broken by earliest card in deck order (smaller sort index).
 * Ignores null/undefined and HIDDEN sentinel.
 */
export function computeConsensus(votes: (string | null | undefined)[]): string | null {
  const counted = votes.filter(
    (v): v is string => v != null && v !== "" && v !== HIDDEN,
  );
  if (counted.length === 0) return null;

  const freq = new Map<string, number>();
  for (const v of counted) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = -1;

  for (const [value, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      best = value;
    } else if (count === bestCount && best !== null) {
      if (cardSortIndex(value) < cardSortIndex(best)) {
        best = value;
      }
    }
  }

  return best;
}

export { HIDDEN };
