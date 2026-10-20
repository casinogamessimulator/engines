import { describe, expect, it } from 'vitest';
import { actionEvs, optimalAction, simpleAction } from './advisor.ts';
import { parseCards } from './cards.ts';
import { analyzeFlop, BOARD_SCALE, FLOP_BOARDS, flopHoleIndex } from './exact.ts';
import { flopEv, preflopEv, riverEv } from './odds.ts';
import preflop from './results/preflop.json' with { type: 'json' };
import { applyAction, createRound } from './round.ts';
import { STARTING_HANDS, exampleHole, parseStartingHand } from './starting-hands.ts';
import { dealerOuts, simpleFlopBets, simplePreflopRaises, simpleRiverBets } from './strategy.ts';

const cards = parseCards;

describe('river', () => {
  // Wizard of Odds' worked example of the simple strategy's dealer-outs rule: the player's 9 plays as a
  // kicker; 15 cards pair the board and 8 out-kick (jacks and queens), so 23 outs: fold. The Wizard's
  // calculator gives the 1x raise an EV of −2.136364.
  it('matches the published dealer-outs example', () => {
    const hole = cards('9h 4c');
    const board = cards('Kc 7c 2h Ac Ts');
    expect(dealerOuts(hole, board)).toBe(23);
    expect(simpleRiverBets(hole, board)).toBe(false);
    const ev = riverEv(hole, board);
    expect(ev.bet).toBeCloseTo(-2.136364, 6);
    expect(ev.best).toBe('fold');
  });

  it('counts dealer hands exactly', () => {
    const { counts } = riverEv(cards('Ac Ad'), cards('Ah As Kd 7c 2h'));
    // Player has quad aces: the dealer only wins with a straight flush, which this board can't make.
    expect(counts).toMatchObject({ total: 990, lose: 0, tie: 0, win: 990 });
    // A broadway board with no flush possible: every dealer hand ties, so playing is worth 0.
    const tie = riverEv(cards('2c 3d'), cards('Ah Kd Qc Js Th'));
    expect(tie.counts).toMatchObject({ tie: 990, win: 0, lose: 0 });
    expect(tie.bet).toBe(0);
  });
});

describe('flop', () => {
  it('agrees with the fast counting the exact analysis uses', () => {
    const flop = cards('Ah 7d 2c');
    const analysis = analyzeFlop(flop);
    for (const text of ['Kh Qh', '7c 7s', '3d 4d', 'As 2h', '9s 8s']) {
      const hole = cards(text);
      const h = flopHoleIndex(analysis, hole[0], hole[1]);
      const ev = flopEv(hole, flop);
      const scale = BOARD_SCALE * FLOP_BOARDS;
      expect((2 * analysis.sumD[h] + analysis.sumC[h]) / scale).toBeCloseTo(ev.bet, 12);
      expect(analysis.optimalRiver[h] / scale).toBeCloseTo(ev.check, 12);

      // The simple strategy's river results, rule by rule, against the direct versions in strategy.ts.
      let simple = 0;
      const rest = analysis.rest.filter((c) => !hole.includes(c));
      for (let t = 0; t < rest.length; t++) {
        for (let r = t + 1; r < rest.length; r++) {
          const board = [...flop, rest[t], rest[r]];
          simple += simpleRiverBets(hole, board) ? riverEv(hole, board).bet : -2;
        }
      }
      expect(analysis.simpleRiver[h] / scale).toBeCloseTo(simple / FLOP_BOARDS, 12);
      expect(analysis.simpleFlopBets[h] === 1).toBe(simpleFlopBets(hole, flop));
    }
  }, 30_000);

  it('bets big hands and checks weak ones', () => {
    expect(flopEv(cards('Ac As'), cards('Ah 7d 2c')).best).toBe('bet');
    expect(flopEv(cards('3d 4c'), cards('Ah 9d Kc')).best).toBe('check');
  });
});

describe('preflop', () => {
  it('has all 169 starting hands in index order', () => {
    expect(preflop.hands).toHaveLength(169);
    preflop.hands.forEach((row, i) => expect(row.hand).toBe(STARTING_HANDS[i].label));
  });

  it.each([
    ['AA', 'raise4'],
    ['AKs', 'raise4'],
    ['A2o', 'raise4'],
    ['K2s', 'raise4'],
    ['K5o', 'raise4'],
    ['K4o', 'check'],
    ['Q6s', 'raise4'],
    ['Q5s', 'check'],
    ['Q8o', 'raise4'],
    ['Q7o', 'check'],
    ['J8s', 'raise4'],
    ['J7s', 'check'],
    ['JTo', 'raise4'],
    ['J9o', 'check'],
    ['33', 'raise4'],
    ['22', 'check'],
    ['T9s', 'check'],
    ['72o', 'check'],
  ])('%s: %s', (label, best) => {
    expect(preflopEv(exampleHole(parseStartingHand(label))).best).toBe(best);
  });

  it('never prefers 3x to 4x', () => {
    for (const row of preflop.hands) expect(row.best).not.toBe('raise3');
  });

  it('matches the simple strategy on every starting hand', () => {
    // The published simple strategy's preflop rule is exactly the optimal one.
    for (const hand of STARTING_HANDS) {
      expect(simplePreflopRaises(exampleHole(hand)), hand.label).toBe(preflopEv(exampleHole(hand)).best === 'raise4');
    }
  });

  it('gives the same EV for every suit combination of a class', () => {
    expect(preflopEv(cards('Ac Kc'))).toEqual(preflopEv(cards('Kh Ah')));
    expect(preflopEv(cards('7c 7d')).hand).toBe('77');
  });
});

describe('advisor', () => {
  it('ranks the legal actions on every street', () => {
    let round = createRound({ ante: 1, seed: 2024 });
    expect(actionEvs(round)).toHaveLength(3);
    round = applyAction(round, { type: 'check' });
    const flop = actionEvs(round);
    expect(flop.map((a) => a.action.type).sort()).toEqual(['check', 'play']);
    expect(flop[0].ev).toBeGreaterThanOrEqual(flop[1].ev);
    round = applyAction(round, { type: 'check' });
    expect(actionEvs(round).map((a) => a.action.type).sort()).toEqual(['fold', 'play']);
    expect(optimalAction(round)).toEqual(actionEvs(round)[0].action);
    expect(simpleAction(round)).not.toBeNull();
    round = applyAction(round, { type: 'fold' });
    expect(actionEvs(round)).toEqual([]);
    expect(optimalAction(round)).toBeNull();
  });
});
