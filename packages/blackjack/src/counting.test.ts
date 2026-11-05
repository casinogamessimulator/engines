import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.ts';
import { cardTag, COUNTING_SYSTEMS, dealtCards, deckSum, getCountingSystem, runningCount, tagCounts, trueCount } from './counting.ts';
import { createShoe, drawCard } from './shoe.ts';

describe('counting systems', () => {
  it('balanced systems sum to zero over a deck, KO adds four per deck', () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(deckSum(system), system.id).toBe(system.balanced ? 0 : 4);
    }
  });

  it('every system tags all ten card values, with the level as its largest tag (halves count doubled)', () => {
    for (const system of COUNTING_SYSTEMS) {
      expect(system.tags).toHaveLength(11);
      const scale = system.tags.some((tag) => tag % 1 !== 0) ? 2 : 1;
      expect(Math.max(...system.tags.slice(1).map((tag) => Math.abs(tag) * scale)), system.id).toBe(system.level);
    }
  });

  it('Hi-Lo tags 2–6 +1, 7–9 0, tens and aces −1', () => {
    const hiLo = getCountingSystem('hi-lo');
    const cards = parseCards('2c 3d 4h 5s 6c 7d 8h 9s Tc Jd Qh Ks Ac');
    expect(cards.map((card) => cardTag(hiLo, card))).toEqual([1, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1, -1]);
    expect(tagCounts(hiLo)).toEqual([
      { tag: 1, cards: 20 },
      { tag: 0, cards: 12 },
      { tag: -1, cards: 20 },
    ]);
  });

  it('runs the count over the cards seen', () => {
    const hiLo = getCountingSystem('hi-lo');
    expect(runningCount(hiLo, parseCards('5c Kd 2h 9s Ac'))).toBe(0);
    expect(runningCount(hiLo, parseCards('5c 6d 2h 3s'))).toBe(4);
    expect(runningCount(hiLo, parseCards('Tc Jd Qh Ks Ac'))).toBe(-5);
  });

  it('Wong Halves counts in halves without floating point noise', () => {
    const halves = getCountingSystem('halves');
    expect(runningCount(halves, parseCards('2c 7d 9h'))).toBe(0.5);
    expect(runningCount(halves, parseCards('5c 5d 2h Tc'))).toBe(2.5);
  });

  it('KO starts a six-deck shoe at −20 and ends it at +4', () => {
    const ko = getCountingSystem('ko');
    expect(runningCount(ko, [], 6)).toBe(-20);
    let shoe = createShoe(6, { seed: 7, penetration: 1 });
    const all: number[] = [];
    while (shoe.next < shoe.cards.length) {
      const [card, next] = drawCard(shoe);
      all.push(card);
      shoe = next;
    }
    expect(runningCount(ko, all, 6)).toBe(4);
    expect(dealtCards(shoe)).toEqual(all);
  });

  it('converts to a true count per deck left', () => {
    expect(trueCount(6, 156)).toBe(2);
    expect(trueCount(-3, 78)).toBe(-2);
    expect(trueCount(4, 0)).toBe(4 * 52);
  });

  it('a whole deck counts to zero in every balanced system', () => {
    let shoe = createShoe(1, { seed: 3, penetration: 1 });
    while (shoe.next < shoe.cards.length) shoe = drawCard(shoe)[1];
    for (const system of COUNTING_SYSTEMS.filter((s) => s.balanced)) {
      expect(runningCount(system, dealtCards(shoe)), system.id).toBe(0);
    }
  });
});
