import { describe, expect, it } from 'vitest';
import { parseCards } from './cards.ts';
import { act, type Action, deal, type Game, legalActions, newGame, newGameWithShoe } from './game.ts';
import { makeRules, type Rules } from './rules.ts';
import { stackedShoe } from './shoe.ts';

/**
 * Deals from a stacked shoe. Order: player, dealer up, player, then the hole card in peek games; then whatever the
 * round draws next.
 */
function start(rules: Partial<Rules>, cards: string, bet = 10): Game {
  return deal(newGameWithShoe(makeRules(rules), stackedShoe(parseCards(cards))), bet);
}

function play(game: Game, ...actions: Action[]): Game {
  return actions.reduce(act, game);
}

const peek: Partial<Rules> = { holeCard: 'peek', surrender: 'none' };
const european: Partial<Rules> = { holeCard: 'none', surrender: 'none' };

describe('naturals', () => {
  it('pays 3:2 at once, without the dealer drawing', () => {
    const game = start(peek, 'Ah 9c Kd 6s 5d');
    expect(game.round!.phase).toBe('done');
    expect(game.round!.dealer).toHaveLength(2);
    expect(game.round!.settlement!.hands[0]).toEqual({ outcome: 'blackjack', staked: 10, net: 15 });
  });

  it('pays 6:5 when the table does', () => {
    expect(start({ ...peek, blackjackPays: '6:5' }, 'Ah 9c Kd 6s').round!.settlement!.net).toBe(12);
  });

  it('pushes against a dealer blackjack', () => {
    const game = play(start(peek, 'Ah Ac Kd Ks'), 'noInsurance');
    expect(game.round!.settlement!.hands[0].outcome).toBe('push');
    expect(game.round!.settlement!.dealerBlackjack).toBe(true);
  });

  it('a split hand making 21 is not a blackjack and loses to a dealer blackjack (no hole card)', () => {
    let game = start(european, 'Ad Kc As Kh Qh Ah');
    expect(game.round!.phase).toBe('player');
    game = act(game, 'split');
    // Each split ace gets one card: K, Q. The dealer then draws an ace for blackjack.
    expect(game.round!.settlement!.hands.map((hand) => hand.outcome)).toEqual(['lose', 'lose']);
    expect(game.round!.settlement!.net).toBe(-20);
  });
});

describe('dealer blackjack with a hole card', () => {
  it('ends the round under a ten before the player acts, taking only the original bet', () => {
    const game = start(peek, '9h Kc 7d As');
    expect(game.round!.phase).toBe('done');
    expect(game.round!.peeked).toBe(true);
    expect(game.round!.settlement!.net).toBe(-10);
  });

  it('offers insurance under an ace; insurance pays 2:1', () => {
    let game = start(peek, '9h Ac 7d Ks');
    expect(game.round!.phase).toBe('insurance');
    expect(legalActions(game)).toEqual(['insurance', 'noInsurance']);
    game = act(game, 'insurance');
    const settlement = game.round!.settlement!;
    expect(settlement.insurance).toBe(10);
    expect(settlement.hands[0].net).toBe(-10);
    expect(settlement.net).toBe(0);
  });

  it('loses the insurance when the dealer has no blackjack, then play goes on', () => {
    let game = play(start(peek, '9h Ac 7d 6s Tc'), 'insurance');
    expect(game.round!.phase).toBe('player');
    game = act(game, 'stand');
    expect(game.round!.settlement!.insurance).toBe(-5);
    expect(game.round!.settlement!.net).toBe(-15);
  });

  it('even money: a blackjack plus insurance wins one unit either way', () => {
    const dealerBlackjack = play(start(peek, 'Ah Ac Kd Ks'), 'insurance');
    const noBlackjack = play(start(peek, 'Ah Ac Kd 7s'), 'insurance');
    expect(dealerBlackjack.round!.settlement!.net).toBe(10);
    expect(noBlackjack.round!.settlement!.net).toBe(10);
  });
});

describe('surrender timing', () => {
  it('late surrender with a hole card: half the bet, and impossible against a blackjack', () => {
    const noBlackjack = start({ ...peek, surrender: 'late' }, 'Th Kc 6d 7s');
    expect(legalActions(noBlackjack)).toContain('surrender');
    expect(act(noBlackjack, 'surrender').round!.settlement!.net).toBe(-5);
    const blackjack = start({ ...peek, surrender: 'late' }, 'Th Kc 6d As');
    expect(blackjack.round!.phase).toBe('done');
    expect(blackjack.round!.settlement!.net).toBe(-10);
  });

  it('early surrender with a hole card: decided before the check, half the bet even against a blackjack', () => {
    const rules = { ...peek, surrender: 'early' } as const;
    const game = start(rules, 'Th Kc 6d As 5h');
    expect(game.round!.phase).toBe('player');
    expect(game.round!.peeked).toBe(false);
    expect(act(game, 'surrender').round!.settlement!.net).toBe(-5);
    // Any other decision lets the dealer check first: the hit is never carried out.
    const hit = act(game, 'hit');
    expect(hit.round!.settlement!.net).toBe(-10);
    expect(hit.round!.hands[0].cards).toHaveLength(2);
  });

  it('late surrender without a hole card loses the whole bet to a dealer blackjack', () => {
    const late = act(start({ ...european, surrender: 'late' }, 'Th Kc 6d As'), 'surrender');
    expect(late.round!.settlement!.hands[0]).toMatchObject({ outcome: 'lose', net: -10 });
    const early = act(start({ ...european, surrender: 'early' }, 'Th Kc 6d As'), 'surrender');
    expect(early.round!.settlement!.net).toBe(-5);
  });

  it('is only offered on the first two cards of an unsplit hand', () => {
    let game = start({ ...peek, surrender: 'late' }, '8h 9c 8d 7s 3c 4d');
    expect(legalActions(game)).toContain('surrender');
    game = act(game, 'split');
    expect(legalActions(game)).not.toContain('surrender');
  });
});

describe('no hole card', () => {
  it('the dealer draws the second card after the player; a blackjack takes doubles too', () => {
    let game = start(european, '6h Tc 5d');
    expect(game.round!.dealer).toHaveLength(1);
    game = deal(newGameWithShoe(makeRules(european), stackedShoe(parseCards('6h Tc 5d 9s As'))), 10);
    game = act(game, 'double');
    expect(game.round!.settlement!.hands[0]).toMatchObject({ outcome: 'lose', staked: 20, net: -20 });
  });

  it('with OBO a dealer blackjack takes only the original bet', () => {
    const rules = { ...european, originalBetsOnly: true };
    const game = act(deal(newGameWithShoe(makeRules(rules), stackedShoe(parseCards('6h Tc 5d 9s As'))), 10), 'double');
    expect(game.round!.settlement!.net).toBe(-10);
  });
});

describe('splitting', () => {
  it('split aces get one card each and can’t be hit', () => {
    let game = start(peek, 'Ah 6c Ad 9s Kd 5h 9c');
    game = act(game, 'split');
    const round = game.round!;
    expect(round.phase).toBe('done');
    expect(round.hands.map((hand) => hand.cards.length)).toEqual([2, 2]);
    // A-K after a split is 21 but pays even money. The dealer: 6 9 9 busts.
    expect(round.settlement!.hands.map((hand) => [hand.outcome, hand.net])).toEqual([
      ['win', 10],
      ['win', 10],
    ]);
  });

  it('resplits aces only when allowed, and never hits them without the rule', () => {
    const cards = 'Ah 6c Ad 9s Ac 5h 9c 9d 8h';
    const noResplit = act(start(peek, cards), 'split');
    expect(noResplit.round!.phase).toBe('done');
    const resplit = act(start({ ...peek, resplitAces: true }, cards), 'split');
    expect(legalActions(resplit)).toEqual(['stand', 'split']);
    const hitSplitAces = act(start({ ...peek, hitSplitAces: true }, 'Ah 6c Ad 9s 2c'), 'split');
    expect(legalActions(hitSplitAces)).toContain('hit');
  });

  it('stops at the maximum number of hands', () => {
    let game = start({ ...peek, maxHands: 3 }, '8h 6c 8d 9s 8c 8s 2d 3d 4d 5d');
    game = act(game, 'split'); // first hand draws 8: can resplit
    expect(legalActions(game)).toContain('split');
    game = act(game, 'split'); // three hands; the first draws 8 again
    expect(game.round!.hands).toHaveLength(3);
    expect(legalActions(game)).not.toContain('split');
  });

  it('doubles after a split only with DAS', () => {
    const cards = '5h 6c 5d 9s 6d 5c Th Td Tc';
    const withDas = act(start({ ...peek, doubleAfterSplit: true }, cards), 'split');
    expect(legalActions(withDas)).toContain('double');
    const noDas = act(start({ ...peek, doubleAfterSplit: false }, cards), 'split');
    expect(legalActions(noDas)).not.toContain('double');
  });

  it('splits any two ten-value cards', () => {
    expect(legalActions(start(peek, 'Kh 6c Qd 9s'))).toContain('split');
  });
});

describe('doubling rules', () => {
  it('9-11 and 10-11 allow hard totals only', () => {
    expect(legalActions(start({ ...peek, double: '9-11' }, '5h 6c 4d 9s'))).toContain('double');
    expect(legalActions(start({ ...peek, double: '10-11' }, '5h 6c 4d 9s'))).not.toContain('double');
    expect(legalActions(start({ ...peek, double: '9-11' }, 'Ah 6c 8d 9s'))).not.toContain('double');
    expect(legalActions(start({ ...peek, double: 'any' }, 'Ah 6c 7d 9s'))).toContain('double');
  });

  it('a double takes exactly one card and doubles the stake', () => {
    const game = act(start(peek, '5h 6c 6d 9s 2c Tc'), 'double');
    const hand = game.round!.hands[0];
    expect(hand.cards).toHaveLength(3);
    expect(game.round!.settlement!.hands[0]).toMatchObject({ outcome: 'win', staked: 20, net: 20 });
  });
});

describe('dealer play', () => {
  it('stands or hits soft 17 by the rules', () => {
    // The player stands on 19; the dealer has A6 with a 2 to come.
    const cards = 'Th Ac 9d 6s 2c';
    const s17 = play(start({ ...peek, dealerHitsSoft17: false }, cards), 'noInsurance', 'stand');
    expect(s17.round!.dealer).toHaveLength(2);
    expect(s17.round!.settlement!.hands[0].outcome).toBe('win');
    const h17 = play(start({ ...peek, dealerHitsSoft17: true }, cards), 'noInsurance', 'stand');
    expect(h17.round!.dealer).toHaveLength(3);
    expect(h17.round!.settlement!.dealerTotal).toBe(19);
    expect(h17.round!.settlement!.hands[0].outcome).toBe('push');
  });

  it('doesn’t draw when every hand busted', () => {
    const game = act(start(peek, 'Th 5c 6d 9s Kc 2d'), 'hit');
    expect(game.round!.settlement!.hands[0].outcome).toBe('bust');
    expect(game.round!.dealer).toHaveLength(2);
  });
});

describe('state', () => {
  it('is plain data: a JSON round trip plays on identically', () => {
    const playRound = (game: Game): Game => {
      game = deal(game, 10);
      while (game.round!.phase !== 'done') game = act(game, legalActions(game)[0] === 'insurance' ? 'noInsurance' : 'hit');
      return game;
    };
    let game = newGame(makeRules(), { seed: 'replay' });
    for (let i = 0; i < 20; i++) game = playRound(game);
    const copy = JSON.parse(JSON.stringify(game)) as Game;
    let a = game;
    let b = copy;
    for (let i = 0; i < 20; i++) {
      a = playRound(a);
      b = playRound(b);
    }
    expect(b).toEqual(a);
  });

  it('the same seed deals the same cards', () => {
    const first = deal(newGame(makeRules(), { seed: 42 }), 10);
    const second = deal(newGame(makeRules(), { seed: 42 }), 10);
    const other = deal(newGame(makeRules(), { seed: 43 }), 10);
    expect(second.round).toEqual(first.round);
    expect(other.shoe.cards).not.toEqual(first.shoe.cards);
  });

  it('rejects illegal actions', () => {
    const game = start(peek, 'Th 5c 6d 9s');
    expect(() => act(game, 'insurance')).toThrow();
    expect(() => deal(game, 10)).toThrow();
  });
});
