import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.ts';
import { getAnteBonusPaytable, getPairPlusPaytable } from './paytables.ts';
import { seedRng } from './rng.ts';
import { dealCards, dealRound, decide, DEFAULT_RULES, fold, play, type Round } from './round.ts';

const deal = (player: string, dealer: string, ante = 10, pairPlus = 0, rules = DEFAULT_RULES) =>
  dealCards(parseCards(player), parseCards(dealer), { ante, pairPlus }, rules);

describe('dealRound', () => {
  it('deals the same cards from the same seed', () => {
    const first = dealRound(seedRng(42), { ante: 5, pairPlus: 5 });
    const second = dealRound(seedRng(42), { ante: 5, pairPlus: 5 });
    expect(second).toEqual(first);
    expect(new Set([...first.round.player, ...first.round.dealer]).size).toBe(6);
    expect(dealRound(seedRng(43), { ante: 5, pairPlus: 5 }).round.player).not.toEqual(first.round.player);
  });

  it('continues a session from the returned generator state', () => {
    let rng = seedRng('session');
    const deals: string[] = [];
    for (let i = 0; i < 20; i++) {
      const next = dealRound(rng, { ante: 1, pairPlus: 0 });
      deals.push(next.round.player.join());
      rng = next.rng;
    }
    expect(new Set(deals).size).toBeGreaterThan(15);
    // Replaying from the seed gives the identical sequence.
    let replay = seedRng('session');
    for (let i = 0; i < 20; i++) {
      const next = dealRound(replay, { ante: 1, pairPlus: 0 });
      expect(next.round.player.join()).toBe(deals[i]);
      replay = next.rng;
    }
  });

  it('survives a JSON round trip at every step', () => {
    const { round, rng } = dealRound(seedRng(7), { ante: 10, pairPlus: 5 });
    const restored = JSON.parse(JSON.stringify({ round, rng })) as { round: Round; rng: typeof rng };
    expect(restored).toEqual({ round, rng });
    expect(play(restored.round)).toEqual(play(round));
    expect(dealRound(restored.rng, { ante: 1, pairPlus: 0 })).toEqual(dealRound(rng, { ante: 1, pairPlus: 0 }));
  });

  it('deals every card about equally often', () => {
    const counts = new Array<number>(52).fill(0);
    let rng = seedRng(1);
    const rounds = 10_000;
    for (let i = 0; i < rounds; i++) {
      const next = dealRound(rng, { ante: 1, pairPlus: 0 });
      for (const card of next.round.player) counts[card]++;
      rng = next.rng;
    }
    const expected = (rounds * 3) / 52;
    for (const count of counts) expect(Math.abs(count - expected)).toBeLessThan(expected * 0.2);
  });

  it('rejects bad bets', () => {
    expect(() => dealRound(seedRng(1), { ante: 0, pairPlus: 0 })).toThrow();
    expect(() => dealRound(seedRng(1), { ante: -5, pairPlus: 0 })).toThrow();
    expect(() => dealRound(seedRng(1), { ante: Number.NaN, pairPlus: 0 })).toThrow();
  });
});

describe('settlement', () => {
  it('pays the ante and pushes the play when the dealer does not qualify', () => {
    const round = play(deal('Kh 9c 4d', 'Jc Td 8h'));
    expect(round.settlement).toMatchObject({
      outcome: 'dealer-not-qualified',
      dealerQualifies: false,
      ante: 10,
      play: 0,
      anteBonus: 0,
      net: 10,
      wagered: 20,
      returned: 30,
    });
  });

  it('pays the ante bonus even when the player loses', () => {
    const round = play(deal('5c 6d 7h', 'As Ks Qs'));
    expect(round.settlement).toMatchObject({ outcome: 'lose', ante: -10, play: -10, anteBonus: 10, net: -10 });
    const trips = play(deal('3c 3d 3h', '8s 9s Ts'));
    expect(trips.settlement).toMatchObject({ outcome: 'lose', anteBonus: 40, net: 20 });
  });

  it('pays the ante bonus when the dealer does not qualify', () => {
    const round = play(deal('9h Th Jh', '2c 5d 8s'));
    expect(round.settlement).toMatchObject({ outcome: 'dealer-not-qualified', ante: 10, play: 0, anteBonus: 50, net: 60 });
  });

  it('pays both bets on a win and pushes both on a tie', () => {
    expect(play(deal('Ah Ad 4c', 'Kh Kd Qc')).settlement).toMatchObject({ outcome: 'win', ante: 10, play: 10, net: 20 });
    expect(play(deal('Ah Kd 4c', 'Ac Kh 4d')).settlement).toMatchObject({
      outcome: 'tie',
      ante: 0,
      play: 0,
      net: 0,
      returned: 20,
    });
  });

  it('loses only the ante on a fold', () => {
    const round = fold(deal('Jh 8c 3d', 'Qc 5d 2h'));
    expect(round.decision).toBe('fold');
    expect(round.settlement).toMatchObject({ outcome: 'fold', ante: -10, play: 0, anteBonus: 0, net: -10, wagered: 10 });
  });

  it('settles pair plus on the player hand alone', () => {
    const win = play(deal('7h 7c 2d', 'Ac Ad Kh', 10, 5));
    expect(win.settlement).toMatchObject({ outcome: 'lose', pairPlus: 5, net: -15 });
    const straight = play(deal('5c 6d 7h', 'As Ks Qs', 10, 5));
    expect(straight.settlement?.pairPlus).toBe(30);
    const loss = play(deal('Ah Kd 4c', '2c 3d 5h', 10, 5));
    expect(loss.settlement).toMatchObject({ pairPlus: -5, net: 5 });
  });

  it('keeps pair plus in action on a fold unless the rules say otherwise', () => {
    // Folding a flush is a mistake, but the bet still has to settle somehow.
    expect(fold(deal('2c 5c 7c', 'Ac Ad Kh', 10, 5)).settlement).toMatchObject({ pairPlus: 15, net: 5 });
    const strict = { ...DEFAULT_RULES, pairPlusLostOnFold: true };
    expect(fold(deal('2c 5c 7c', 'Ac Ad Kh', 10, 5, strict)).settlement).toMatchObject({ pairPlus: -5, net: -15 });
  });

  it('settles a pair-plus-only round at once', () => {
    const round = deal('Qs Ks As', '2c 3d 5h', 0, 10, {
      ...DEFAULT_RULES,
      pairPlus: getPairPlusPaytable('pair-plus-1-3-6-30-40-200'),
    });
    expect(round.phase).toBe('settled');
    expect(round.settlement).toMatchObject({ outcome: null, ante: 0, pairPlus: 2000, net: 2000, wagered: 10 });
    expect(() => play(round)).toThrow();
  });

  it('uses the configured ante bonus table', () => {
    const rules = { ...DEFAULT_RULES, anteBonus: getAnteBonusPaytable('ante-bonus-50-10-4-3-0') };
    expect(play(deal('Qs Ks As', '2c 3d 5h', 10, 0, rules)).settlement?.anteBonus).toBe(500);
    expect(play(deal('Qh Kh Ah', '2c 3d 5h', 10, 0, rules)).settlement?.anteBonus).toBe(100);
    expect(play(deal('Qh Kd Ah', '2c 3d 5h', 10, 0, rules)).settlement?.anteBonus).toBe(0);
  });

  it('settles a round only once', () => {
    const settled = play(deal('Ah Kd 4c', '2c 3d 5h'));
    expect(() => fold(settled)).toThrow();
    expect(() => decide(deal('Ah Kd 4c', '2c 3d 5h'), 'raise' as 'play')).toThrow();
  });

  it('does not mutate the round it is given', () => {
    const round = deal('Ah Kd 4c', '2c 3d 5h');
    const copy = structuredClone(round);
    play(round);
    expect(round).toEqual(copy);
  });
});
