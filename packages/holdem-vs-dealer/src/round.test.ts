import { describe, expect, it } from 'vitest';
import { formatCards, newDeck, parseCards } from './cards.ts';
import { riverEv } from './odds.ts';
import { getTripsPaytable } from './paytables.ts';
import { applyAction, createRound, dealerCards, legalActions, playerCards, settle, visibleBoard, type Action, type Round } from './round.ts';

/** A round with a stacked deck: player, dealer and board cards first, the rest after. */
function stacked(player: string, dealer: string, board: string, bets: { ante?: number; trips?: number } = {}): Round {
  const top = parseCards(`${player} ${dealer} ${board}`);
  const deck = [...top, ...newDeck().filter((c) => !top.includes(c))];
  return { ...createRound({ ante: bets.ante ?? 10, trips: bets.trips ?? 0, seed: 1 }), deck };
}

const play = (m: 1 | 2 | 3 | 4): Action => ({ type: 'play', multiple: m });
const CHECK: Action = { type: 'check' };
const FOLD: Action = { type: 'fold' };

function playOut(round: Round, ...actions: Action[]): Round {
  return actions.reduce(applyAction, round);
}

describe('round flow', () => {
  it('deals the same cards from the same seed', () => {
    const a = createRound({ ante: 5, seed: 123 });
    const b = createRound({ ante: 5, seed: 123 });
    const c = createRound({ ante: 5, seed: 124 });
    expect(a.deck).toEqual(b.deck);
    expect(a.deck).not.toEqual(c.deck);
    expect([...a.deck].sort((x, y) => x - y)).toEqual(newDeck());
  });

  it('offers the right actions on each street and reveals cards as it goes', () => {
    let round = createRound({ ante: 5, seed: 7 });
    expect(legalActions(round)).toEqual([CHECK, play(3), play(4)]);
    expect(visibleBoard(round)).toEqual([]);
    expect(dealerCards(round)).toBeNull();
    round = applyAction(round, CHECK);
    expect(round.street).toBe('flop');
    expect(legalActions(round)).toEqual([CHECK, play(2)]);
    expect(visibleBoard(round)).toHaveLength(3);
    round = applyAction(round, CHECK);
    expect(round.street).toBe('river');
    expect(legalActions(round)).toEqual([play(1), FOLD]);
    expect(visibleBoard(round)).toHaveLength(5);
    round = applyAction(round, play(1));
    expect(round.street).toBe('complete');
    expect(legalActions(round)).toEqual([]);
    expect(dealerCards(round)).toEqual(round.deck.slice(2, 4));
    expect(round.play).toBe(5);
    expect(round.settlement).not.toBeNull();
  });

  it('rejects illegal actions', () => {
    const round = createRound({ ante: 5, seed: 7 });
    expect(() => applyAction(round, play(2))).toThrow();
    expect(() => applyAction(round, FOLD)).toThrow();
    expect(() => applyAction(applyAction(round, CHECK), play(4))).toThrow();
    expect(() => applyAction(playOut(round, CHECK, CHECK), CHECK)).toThrow();
    expect(() => applyAction(playOut(round, play(4)), CHECK)).toThrow();
    expect(() => createRound({ ante: 0 })).toThrow();
  });

  it('is plain data that survives JSON', () => {
    const round = playOut(createRound({ ante: 5, trips: 5, seed: 99 }), CHECK);
    const restored = JSON.parse(JSON.stringify(round)) as Round;
    expect(restored).toEqual(round);
    expect(playOut(restored, play(2))).toEqual(playOut(round, play(2)));
  });
});

describe('settlement', () => {
  it('pushes the ante when the dealer does not qualify', () => {
    // Player A-K high beats the dealer's Q high; no pair for the dealer.
    const won = playOut(stacked('Ac Kd', 'Qh 3s', '2c 5d 8h 9s Jc'), play(4)).settlement!;
    expect(won).toMatchObject({ outcome: 'win', dealerQualifies: false, ante: 0, blind: 0, play: 40, total: 40 });
    // Dealer K high beats the player's Q high, still not qualifying: ante pushes, play and blind lose.
    const lost = playOut(stacked('Qc 3d', 'Kh 4s', '2c 5d 8h 9s Jc'), play(4)).settlement!;
    expect(lost).toMatchObject({ outcome: 'lose', dealerQualifies: false, ante: 0, blind: -10, play: -40, total: -50 });
  });

  it('pays the ante and play when the player beats a qualifying dealer', () => {
    const s = playOut(stacked('Ac Ad', 'Kh Ks', '2c 5d 8h 9s Jc'), play(4)).settlement!;
    expect(s).toMatchObject({ outcome: 'win', dealerQualifies: true, ante: 10, blind: 0, play: 40, total: 50 });
    expect(s.playerHand).toBe('Pair');
  });

  it('pays the blind by its paytable on a straight or better', () => {
    const blind = (player: string, board: string): number =>
      playOut(stacked(player, '2d 3d', board), play(4)).settlement!.blind;
    expect(blind('Ah Kh', 'Qh Jh Th 4c 2s')).toBe(5000); // royal 500:1
    expect(blind('9h 8h', '7h 6h 5h Kc 2s')).toBe(500); // straight flush 50:1
    expect(blind('9h 9c', '9d 9s 5h Kc 2s')).toBe(100); // quads 10:1
    expect(blind('9h 9c', '9d 5s 5h Kc 2s')).toBe(30); // full house 3:1
    expect(blind('Ah 8h', 'Th 6h 4h Kc 2s')).toBe(15); // flush 3:2
    expect(blind('9c 8d', '7h 6s 5h Kc 2s')).toBe(10); // straight 1:1
    expect(blind('9c 9d', '9h 6s 5h Kc 2s')).toBe(0); // trips: push
  });

  it('loses the blind on a loss even with a big hand', () => {
    // Player's straight loses to the dealer's flush.
    const s = playOut(stacked('9c 8d', 'Ah 2h', '7h 6h 5h Kc 2s'), CHECK, CHECK, play(1)).settlement!;
    expect(s).toMatchObject({ outcome: 'lose', ante: -10, blind: -10, play: -10, total: -30 });
  });

  it('pushes everything on a tie', () => {
    // Board plays for both: broadway straight.
    const s = playOut(stacked('2c 3d', '2h 4s', 'Ah Kd Qc Js Th'), CHECK, play(2)).settlement!;
    expect(s).toMatchObject({ outcome: 'tie', ante: 0, blind: 0, play: 0, total: 0 });
  });

  it('loses ante and blind on a fold, and still settles trips', () => {
    const s = playOut(stacked('9c 9d', 'Ah As', '9h 6s 5h Kc 2s', { trips: 5 }), CHECK, CHECK, FOLD).settlement!;
    expect(s).toMatchObject({ outcome: 'fold', ante: -10, blind: -10, play: 0, trips: 15, total: -5 });
  });

  it('pays trips by the round paytable, and loses it below trips', () => {
    const royal = playOut(stacked('Ah Kh', '2d 3d', 'Qh Jh Th 4c 2s', { trips: 5 }), play(4)).settlement!;
    expect(royal.trips).toBe(250);
    const fullHouse = { ...stacked('9h 9c', '2d 3d', '9d 5s 5h Kc 2s', { trips: 5 }), tripsPaytable: getTripsPaytable('50-40-30-8-6-5-3') };
    expect(playOut(fullHouse, play(4)).settlement!.trips).toBe(40);
    const pair = playOut(stacked('9h 9c', '2d 3d', 'Td 5s 4h Kc 2s', { trips: 5 }), play(4)).settlement!;
    expect(pair.trips).toBe(-5);
    const none = playOut(stacked('9h 9c', '2d 3d', 'Td 5s 4h Kc 2s'), play(4)).settlement!;
    expect(none.trips).toBe(0);
  });

  it('reports both best hands', () => {
    const s = playOut(stacked('Ac Ad', 'Kh Ks', '2c 5d 8h 9s Jc'), play(4)).settlement!;
    expect(formatCards(s.playerBest)).toBe('Ad Ac Jc 9s 8h');
    expect(formatCards(s.dealerBest)).toBe('Ks Kh Jc 9s 8h');
  });

  it('agrees with the exact river EV over every dealer hand', () => {
    // Settle a 1x play against all 990 dealer hands and compare with the counting in odds.ts.
    for (const [player, board] of [
      ['Kh 4c', 'Kc 7c 2h Ac Ts'],
      ['9h 4c', 'Kc 7c 2h Ac Ts'],
      ['5d 4d', 'Ad 2d 3c 9d Kh'],
      ['Qs Qd', 'Qh 7h 7c 2h 3h'],
    ]) {
      const hole = parseCards(player);
      const cards = parseCards(board);
      const unseen = newDeck().filter((c) => !hole.includes(c) && !cards.includes(c));
      let sum = 0;
      let n = 0;
      for (let i = 0; i < unseen.length; i++) {
        for (let j = i + 1; j < unseen.length; j++) {
          const round = stacked(player, '', board);
          const deck = [...hole, unseen[i], unseen[j], ...cards];
          const full: Round = { ...round, deck: [...deck, ...newDeck().filter((c) => !deck.includes(c))], play: round.ante };
          sum += settle(full, false).total / round.ante;
          n++;
        }
      }
      expect(n).toBe(990);
      expect(sum / n).toBeCloseTo(riverEv(hole, cards).bet, 12);
    }
  });

  it('exposes the player cards from the deck', () => {
    expect(formatCards(playerCards(stacked('Ac Kd', 'Qh 3s', '2c 5d 8h 9s Jc')))).toBe('Ac Kd');
  });
});
