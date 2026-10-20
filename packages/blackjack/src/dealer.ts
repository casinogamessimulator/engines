/*
 * Exact dealer outcome probabilities for a given shoe composition.
 *
 * The math works on card values by index: 0 = ace, 1..8 = 2..9, 9 = ten or face. A composition is an Int32Array of
 * 10 counts. Every draw the dealer can make is played out. The dealer's possible hands for an up card (as multisets:
 * the order cards came in doesn't change what's left in the shoe) form a fixed graph, built once; each composition
 * then pushes probability forward through it, which is a few thousand multiply-adds.
 */

export const ACE = 0;
export const TEN = 9;

/** Outcome slots: final totals 17..21, bust, blackjack. */
export const OUTCOME_COUNT = 7;
export const BUST = 5;
export const BLACKJACK = 6;

/** A multiset of card values as a number: count of value i in base-32 digit i (counts stay below 32). */
export const KEY_STEP: readonly number[] = Array.from({ length: 10 }, (_, i) => 32 ** i);

export function compositionKey(counts: ArrayLike<number>): number {
  let key = 0;
  for (let i = 0; i < 10; i++) key += counts[i] * KEY_STEP[i];
  return key;
}

/** Dealer hands that still draw, in order of cards drawn, with where each next card leads. */
interface DealerGraph {
  size: number;
  /** Cards drawn after the up card, per state. */
  drawnCount: Int32Array;
  /** drawn[state * 10 + i]: copies of value i among them. */
  drawn: Int32Array;
  /** next[state * 10 + i]: the state after drawing value i, or −1 − outcome when the dealer is done. */
  next: Int32Array;
}

const graphs = new Map<number, DealerGraph>();

function dealerGraph(upIndex: number, hitsSoft17: boolean): DealerGraph {
  const id = upIndex * 2 + (hitsSoft17 ? 1 : 0);
  const cached = graphs.get(id);
  if (cached) return cached;

  interface State {
    hard: number;
    hasAce: boolean;
    drawn: number[];
    count: number;
  }
  const states: State[] = [{ hard: upIndex + 1, hasAce: upIndex === ACE, drawn: new Array(10).fill(0), count: 0 }];
  const index = new Map<number, number>([[0, 0]]);
  const next: number[] = [];
  for (let s = 0; s < states.length; s++) {
    const state = states[s];
    for (let i = 0; i < 10; i++) {
      const hard = state.hard + i + 1;
      const hasAce = state.hasAce || i === ACE;
      const soft = hasAce && hard <= 11;
      const total = soft ? hard + 10 : hard;
      if (total === 21 && state.count === 0) next.push(-1 - BLACKJACK);
      else if (total > 21) next.push(-1 - BUST);
      else if (total > 17 || (total === 17 && !(soft && hitsSoft17))) next.push(-1 - (total - 17));
      else {
        const drawn = state.drawn.slice();
        drawn[i]++;
        const key = compositionKey(drawn);
        let target = index.get(key);
        if (target === undefined) {
          target = states.length;
          index.set(key, target);
          states.push({ hard, hasAce, drawn, count: state.count + 1 });
        }
        next.push(target);
      }
    }
  }
  const graph: DealerGraph = {
    size: states.length,
    drawnCount: Int32Array.from(states, (state) => state.count),
    drawn: Int32Array.from(states.flatMap((state) => state.drawn)),
    next: Int32Array.from(next),
  };
  graphs.set(id, graph);
  return graph;
}

let scratch = new Float64Array(0);

/**
 * Outcome probabilities when the dealer, holding `upIndex`, draws the hole card and plays out from `counts` (the up
 * card already removed).
 */
export function dealerOutcomes(counts: Int32Array, upIndex: number, hitsSoft17: boolean): Float64Array {
  const graph = dealerGraph(upIndex, hitsSoft17);
  if (scratch.length < graph.size) scratch = new Float64Array(graph.size);
  const reach = scratch;
  reach.fill(0, 0, graph.size);
  reach[0] = 1;
  let left = 0;
  for (let i = 0; i < 10; i++) left += counts[i];
  const out = new Float64Array(OUTCOME_COUNT);
  const { drawn, next, drawnCount } = graph;
  for (let s = 0; s < graph.size; s++) {
    const chance = reach[s];
    if (chance === 0) continue;
    const scale = chance / (left - drawnCount[s]);
    const base = s * 10;
    for (let i = 0; i < 10; i++) {
      const count = counts[i] - drawn[base + i];
      if (count <= 0) continue;
      const target = next[base + i];
      if (target >= 0) reach[target] += scale * count;
      else out[-1 - target] += scale * count;
    }
  }
  return out;
}
