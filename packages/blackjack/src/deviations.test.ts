import { describe, expect, it } from 'vitest';
import { analyzeHand } from './analyzer.ts';
import { parseCards } from './cards.ts';
import { dealtAtCount, getCountingSystem, runningCount, trueCount } from './counting.ts';
import {
  DEVIATIONS,
  FAB_4,
  ILLUSTRIOUS_18,
  basicPlay,
  deviationCards,
  deviationCount,
  deviationFor,
  deviationPlay,
  deviationUpCard,
  getDeviation,
  indexPlay,
} from './deviations.ts';
import { act, deal, legalActions, newGameWithShoe } from './game.ts';
import { makeRules } from './rules.ts';
import { stackedShoe } from './shoe.ts';

const hiLo = getCountingSystem('hi-lo');
const H17_LS = makeRules({ decks: 6, dealerHitsSoft17: true, surrender: 'late' });
const S17_NO_SURRENDER = makeRules({ decks: 6, dealerHitsSoft17: false, surrender: 'none' });

/** A decision dealt from a stacked shoe: player card, up card, player card, hole card (a 2, so nothing ends early). */
function spot(rules: ReturnType<typeof makeRules>, player: string, up: string, declineInsurance = false) {
  const [a, b] = parseCards(player.replace(/(..)(..)/, '$1 $2'));
  let game = deal(newGameWithShoe(rules, stackedShoe([a, parseCards(up)[0], b, parseCards('2c')[0], ...parseCards('5c 5d 5h 5s')])), 1);
  if (declineInsurance) game = act(game, 'noInsurance');
  const round = game.round!;
  return { cards: round.hands[0].cards, up: round.dealer[0], legal: legalActions(game) };
}

describe('the Illustrious 18 and Fab 4', () => {
  it('are the published lists, with insurance first', () => {
    expect(ILLUSTRIOUS_18).toHaveLength(18);
    expect(FAB_4).toHaveLength(4);
    expect(ILLUSTRIOUS_18[0].id).toBe('insurance');
    expect(getDeviation('16v10')).toMatchObject({ index: 0, above: 'stand', below: 'hit' });
    expect(new Set(DEVIATIONS.map((d) => d.id)).size).toBe(DEVIATIONS.length);
  });

  it('say the play on each side of the index and which side is basic strategy', () => {
    const sixteen = getDeviation('16v10');
    expect(indexPlay(sixteen, 0)).toBe('stand');
    expect(indexPlay(sixteen, -0.5)).toBe('hit');
    expect(basicPlay(sixteen)).toBe('hit');
    expect(deviationPlay(sixteen)).toBe('stand');
    expect(deviationCount(sixteen)).toBe(2);
    const twelve = getDeviation('12v5');
    expect(basicPlay(twelve)).toBe('stand');
    expect(deviationPlay(twelve)).toBe('hit');
    expect(deviationCount(twelve)).toBe(-4);
  });

  it('give each deviation sample cards that make its hand', () => {
    for (const deviation of DEVIATIONS) {
      const cards = deviationCards(deviation);
      const values = cards.map((c) => Math.min(10, (c >> 2) + 2 > 10 ? ((c >> 2) === 12 ? 1 : 10) : (c >> 2) + 2));
      if (deviation.hand.kind === 'hard') expect(values[0] + values[1]).toBe(deviation.hand.total);
      if (deviation.hand.kind === 'pair') expect(values).toEqual([10, 10]);
      expect(deviationUpCard(deviation) >> 2).toBe(deviation.up === 1 ? 12 : deviation.up === 10 ? 8 : deviation.up - 2);
    }
  });
});

describe('deviationFor', () => {
  it('finds the index play for a hard total against the up card', () => {
    const s = spot(S17_NO_SURRENDER, 'Ts6d', 'Th');
    expect(deviationFor(S17_NO_SURRENDER, s, 1)).toMatchObject({ deviation: { id: '16v10' }, play: 'stand' });
    expect(deviationFor(S17_NO_SURRENDER, s, -1)).toMatchObject({ deviation: { id: '16v10' }, play: 'hit' });
  });

  it('leaves the no-surrender stand indices alone where the hand can be surrendered', () => {
    const s = spot(H17_LS, 'Ts6d', 'Th');
    expect(s.legal).toContain('surrender');
    expect(deviationFor(H17_LS, s, 3)).toBeNull();
    // 15 against a ten: the Fab 4 surrender index applies instead.
    const fifteen = spot(H17_LS, 'Ts5d', 'Th');
    expect(deviationFor(H17_LS, fifteen, 0)).toMatchObject({ deviation: { id: '15v10r' }, play: 'surrender' });
    expect(deviationFor(H17_LS, fifteen, -1)).toMatchObject({ deviation: { id: '15v10r' }, play: 'hit' });
  });

  it('treats a pair of 8s as a split, not a 16, and tens as a pair', () => {
    expect(deviationFor(S17_NO_SURRENDER, spot(S17_NO_SURRENDER, '8s8d', 'Th'), 2)).toBeNull();
    expect(deviationFor(S17_NO_SURRENDER, spot(S17_NO_SURRENDER, 'TsJd', '6h'), 4)).toMatchObject({ deviation: { id: 'TTv6' }, play: 'split' });
    expect(deviationFor(S17_NO_SURRENDER, spot(S17_NO_SURRENDER, 'TsJd', '6h'), 3.5)).toMatchObject({ deviation: { id: 'TTv6' }, play: 'stand' });
  });

  it('only doubles on the first two cards and skips the soft-17 entries when the dealer hits soft 17', () => {
    const eleven = spot(S17_NO_SURRENDER, '8s3d', 'Ah', true);
    expect(deviationFor(S17_NO_SURRENDER, eleven, 1)).toMatchObject({ deviation: { id: '11vA' }, play: 'double' });
    expect(deviationFor(H17_LS, spot(H17_LS, '8s3d', 'Ah', true), 1)).toBeNull();
    // Three cards making 10: no double, so no index.
    const three = { ...spot(S17_NO_SURRENDER, '4s3d', 'Th'), cards: parseCards('4s 3d 3h'), legal: ['hit', 'stand'] as const };
    expect(deviationFor(S17_NO_SURRENDER, three, 5)).toBeNull();
    // A multi-card 16 against a 10 still follows the stand index.
    const multi = { ...three, cards: parseCards('4s 3d 9h') };
    expect(deviationFor(S17_NO_SURRENDER, multi, 0)).toMatchObject({ deviation: { id: '16v10' }, play: 'stand' });
  });

  it('calls insurance at +3', () => {
    const s = spot(H17_LS, 'Ts6d', 'Ah');
    expect(s.legal).toEqual(['insurance', 'noInsurance']);
    expect(deviationFor(H17_LS, s, 3)).toMatchObject({ deviation: { id: 'insurance' }, play: 'insurance' });
    expect(deviationFor(H17_LS, s, 2.5)).toMatchObject({ play: 'noInsurance' });
  });
});

describe('dealtAtCount', () => {
  it('deals the asked share of the shoe with exactly the running count the true count implies', () => {
    for (const [decksLeft, tc] of [
      [2, 3],
      [1, -2],
      [4.5, 1],
      [2, -4],
      [1, 7],
    ]) {
      const dealt = dealtAtCount(hiLo, 6, decksLeft, tc);
      expect(dealt).toHaveLength(312 - Math.round(decksLeft * 52));
      const running = runningCount(hiLo, dealt, 6);
      expect(running).toBe(Math.round(tc * decksLeft));
      expect(Math.abs(trueCount(running, 312 - dealt.length) - tc)).toBeLessThanOrEqual(0.5 / decksLeft + 1e-9);
    }
  });

  it('never deals more of a value than the shoe holds', () => {
    const dealt = dealtAtCount(hiLo, 6, 1, 7);
    const byValue = new Map<number, number>();
    for (const card of dealt) {
      const rank = card >> 2;
      const value = rank === 12 ? 1 : Math.min(10, rank + 2);
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
    }
    for (const [value, n] of byValue) expect(n).toBeLessThanOrEqual(value === 10 ? 96 : 24);
  });

  it('turns the 16 vs 10 index into exact EVs that cross near zero', () => {
    const rules = S17_NO_SURRENDER;
    const ev = (tc: number) => {
      const seen = dealtAtCount(hiLo, 6, 2, tc);
      const analysis = analyzeHand(rules, { cards: parseCards('Ts 6d'), up: parseCards('Th')[0], seen });
      const of = (action: string) => analysis.actions.find((a) => a.action === action)!.ev;
      return of('stand') - of('hit');
    };
    expect(ev(-2)).toBeLessThan(0);
    expect(ev(3)).toBeGreaterThan(0);
  });
});
