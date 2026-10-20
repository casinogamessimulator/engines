import { describe, expect, it } from 'vitest';
import { bestHolds, holdToIndexes, analyzeHand, indexesToHold, isOptimalHold } from './analyze.ts';
import { parseCards, shuffle, newDeck } from './cards.ts';
import { getPaytable, payouts } from './paytables.ts';
import { ReturnTable } from './returns.ts';

const jacks96 = payouts(getPaytable('jacks-or-better-9-6'), 5);
const best = (hand: string, pays = jacks96) => holdToIndexes(bestHolds(analyzeHand(parseCards(hand), pays))[0].hold);

describe('analyzeHand', () => {
  it('scores all 32 holds, best first', () => {
    const options = analyzeHand(parseCards('2h 7c 9d Js Kh'), jacks96);
    expect(options).toHaveLength(32);
    expect(new Set(options.map((o) => o.hold)).size).toBe(32);
    for (let i = 1; i < options.length; i++) expect(options[i - 1].ev).toBeGreaterThanOrEqual(options[i].ev);
  });

  it('pays a pat royal flush 4,000 at max bet', () => {
    const [top] = analyzeHand(parseCards('Ah Kh Qh Jh Th'), jacks96);
    expect(top).toEqual({ hold: 0b11111, ev: 4000 });
  });

  // Textbook 9/6 Jacks or Better plays.
  it('breaks a pat flush for four to a royal', () => {
    expect(best('Ah Kh Qh Jh 3h')).toEqual([0, 1, 2, 3]);
  });
  it('holds a high pair over four to a flush', () => {
    expect(best('Js Jh 4h 8h 2h')).toEqual([0, 1]);
  });
  it('holds a low pair over four to an outside straight', () => {
    expect(best('5s 5h 6d 7c 8h')).toEqual([0, 1]);
  });
  it('holds four to an outside straight with no high cards', () => {
    expect(best('2s 5h 6d 7c 8h')).toEqual([1, 2, 3, 4]);
  });
  it('holds three to a royal over a four-card flush', () => {
    expect(best('Kh Qh Jh 4h 9c')).toEqual([0, 1, 2]);
  });

  it('agrees with the counting method on random deals', () => {
    const table = new ReturnTable(jacks96);
    for (let round = 0; round < 25; round++) {
      const hand = shuffle(newDeck()).slice(0, 5).sort((a, b) => a - b);
      const counted = table.holdEvs(hand);
      for (const { hold, ev } of analyzeHand(hand, jacks96)) expect(counted[hold]).toBeCloseTo(ev, 9);
    }
  });

  it('accepts every best hold and rejects worse ones', () => {
    const options = analyzeHand(parseCards('2c 3d 4h 7s 9c'), jacks96);
    for (const option of bestHolds(options)) expect(isOptimalHold(options, option.hold)).toBe(true);
    expect(isOptimalHold(options, indexesToHold([0, 1, 2, 3, 4]))).toBe(false);
  });
});
