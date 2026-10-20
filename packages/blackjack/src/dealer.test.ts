import { describe, expect, it } from 'vitest';
import { fullShoe } from './analysis.ts';
import { BLACKJACK, BUST, dealerOutcomes, OUTCOME_COUNT } from './dealer.ts';

/** Plays out every ordered sequence of dealer draws: slow, but independent of the state graph. */
function bruteForce(counts: number[], up: number, hitsSoft17: boolean): number[] {
  const out = new Array(OUTCOME_COUNT).fill(0);
  const visit = (hard: number, hasAce: boolean, cards: number, chance: number): void => {
    const left = counts.reduce((sum, count) => sum + count, 0);
    for (let i = 0; i < 10; i++) {
      if (counts[i] === 0) continue;
      const p = (chance * counts[i]) / left;
      const nextHard = hard + i + 1;
      const ace = hasAce || i === 0;
      const soft = ace && nextHard <= 11;
      const total = soft ? nextHard + 10 : nextHard;
      if (total === 21 && cards === 1) out[BLACKJACK] += p;
      else if (total > 21) out[BUST] += p;
      else if (total > 17 || (total === 17 && !(soft && hitsSoft17))) out[total - 17] += p;
      else {
        counts[i]--;
        visit(nextHard, ace, cards + 1, p);
        counts[i]++;
      }
    }
  };
  visit(up + 1, up === 0, 1, 1);
  return out;
}

describe('dealerOutcomes', () => {
  it.each([
    [0, false],
    [0, true],
    [1, true],
    [5, false],
    [9, true],
  ])('matches a brute-force playout from a single deck (up index %i, H17 %s)', (up, hitsSoft17) => {
    const counts = fullShoe(1);
    counts[up]--;
    const fast = dealerOutcomes(counts, up, hitsSoft17);
    const slow = bruteForce(Array.from(counts), up, hitsSoft17);
    for (let k = 0; k < OUTCOME_COUNT; k++) expect(fast[k]).toBeCloseTo(slow[k], 14);
    expect(fast.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 14);
  });

  it('gives the dealer blackjack chance of the hole card', () => {
    const counts = fullShoe(6);
    counts[0]--;
    expect(dealerOutcomes(counts, 0, false)[BLACKJACK]).toBeCloseTo(96 / 311, 14);
  });

  // Wizard of Odds, blackjack appendix 2A: one deck, dealer stands on soft 17, given no dealer blackjack.
  it.each([
    [1, 0.169815],
    [2, 0.352973],
    [3, 0.375588],
    [4, 0.402803],
    [5, 0.428905],
    [6, 0.420823],
    [7, 0.259854],
    [8, 0.238627],
    [9, 0.233442],
    [10, 0.232499],
  ])('matches the published single-deck bust chance under a %i', (upValue, published) => {
    const up = upValue - 1;
    const counts = fullShoe(1);
    counts[up]--;
    const outcomes = dealerOutcomes(counts, up, false);
    expect(outcomes[BUST] / (1 - outcomes[BLACKJACK])).toBeCloseTo(published, 6);
  });

  it('busts a 6 more often when hitting soft 17', () => {
    const counts = fullShoe(6);
    counts[5]--;
    expect(dealerOutcomes(counts, 5, true)[BUST]).toBeGreaterThan(dealerOutcomes(counts, 5, false)[BUST]);
  });
});
