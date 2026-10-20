import { describe, expect, it } from 'vitest';
import type { BetSpec } from './bets.ts';
import { createSeededRandom, type Dice, rollDice } from './dice.ts';
import type { RulesOverrides } from './rules.ts';
import {
  chipsOnTable,
  CrapsError,
  createTable,
  maxOddsFor,
  placeBet,
  removeBet,
  roll,
  setOdds,
  setWorking,
  type TableState,
} from './table.ts';

function table(bets: [BetSpec, number][] = [], rules?: RulesOverrides, bankroll = 1000): TableState {
  return bets.reduce((t, [spec, amount]) => placeBet(t, spec, amount), createTable({ rules, bankroll }));
}

function rollAll(t: TableState, ...rolls: Dice[]) {
  let result;
  for (const dice of rolls) ({ table: t, result } = roll(t, dice));
  return { table: t, result: result! };
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof CrapsError) return error.code;
    throw error;
  }
  return undefined;
}

describe('come-out and point', () => {
  it('pays pass on a natural and stays on the come-out', () => {
    const { table: t, result } = roll(table([[{ type: 'pass' }, 10]]), [5, 2]);
    expect(result.event).toBe('natural');
    expect(t.point).toBeNull();
    expect(t.bankroll).toBe(1010);
    expect(t.bets).toHaveLength(0);
  });

  it('loses pass and pays don\'t pass on craps, but bars the 12', () => {
    const start = table([[{ type: 'pass' }, 10], [{ type: 'dontPass' }, 10]]);
    expect(roll(start, [1, 2]).table.bankroll).toBe(1000);
    const boxcars = roll(start, [6, 6]);
    expect(boxcars.result.event).toBe('craps');
    expect(boxcars.table.bankroll).toBe(990); // pass lost, don't pass pushed and handed back
    expect(boxcars.result.settlements.map((s) => s.action)).toEqual(['lose', 'push']);
  });

  it('sets the point, then makes it or sevens out', () => {
    const start = table([[{ type: 'pass' }, 10], [{ type: 'dontPass' }, 10]]);
    const set = roll(start, [2, 2]);
    expect(set.result.event).toBe('point-set');
    expect(set.table.point).toBe(4);
    expect(set.table.bets.map((b) => b.point)).toEqual([4, 4]);
    expect(roll(set.table, [3, 3]).result.event).toBe('no-decision');
    const made = roll(set.table, [1, 3]);
    expect(made.result.event).toBe('point-made');
    expect(made.table.point).toBeNull();
    expect(made.table.bankroll).toBe(1000);
    const out = roll(set.table, [3, 4]);
    expect(out.result.event).toBe('seven-out');
    expect(out.table.point).toBeNull();
  });

  it('only takes pass bets on the come-out and come bets with a point', () => {
    expect(errorCode(() => table([[{ type: 'come' }, 10]]))).toBe('point-required');
    const on = roll(createTable(), [3, 3]).table;
    expect(errorCode(() => placeBet(on, { type: 'pass' }, 10))).toBe('come-out-only');
    expect(errorCode(() => placeBet(on, { type: 'dontPass' }, 10))).toBe('come-out-only');
    expect(placeBet(on, { type: 'come' }, 10).bets).toHaveLength(1);
  });
});

describe('contract bets', () => {
  it('lets pass come down before the point, not after', () => {
    const before = table([[{ type: 'pass' }, 10]]);
    expect(removeBet(before, before.bets[0].id).bankroll).toBe(1000);
    const after = roll(before, [4, 4]).table;
    expect(errorCode(() => removeBet(after, after.bets[0].id))).toBe('contract-bet');
  });

  it("lets don't pass come down at any time", () => {
    const after = roll(table([[{ type: 'dontPass' }, 10]]), [4, 4]).table;
    expect(removeBet(after, after.bets[0].id).bankroll).toBe(1000);
  });

  it('locks a come bet once it travels', () => {
    const on = rollAll(table(), [3, 3]).table;
    const come = placeBet(on, { type: 'come' }, 10);
    expect(removeBet(come, come.bets[0].id).bankroll).toBe(1000);
    const traveled = roll(come, [4, 5]).table;
    expect(traveled.bets[0].point).toBe(9);
    expect(errorCode(() => removeBet(traveled, traveled.bets[0].id))).toBe('contract-bet');
  });
});

describe('odds', () => {
  it('pays true odds and respects the limit', () => {
    let t = roll(table([[{ type: 'pass' }, 10]], { oddsLimit: '3-4-5x' }), [2, 3]).table;
    const id = t.bets[0].id;
    expect(maxOddsFor(t, id)).toBe(40);
    expect(errorCode(() => setOdds(t, id, 50))).toBe('odds-limit');
    t = setOdds(t, id, 40);
    expect(t.bankroll).toBe(950);
    const won = roll(t, [1, 4]);
    expect(won.result.settlements[0].win).toBe(10 + 60);
    expect(won.table.bankroll).toBe(1000 + 70);
  });

  it('lets odds come down even on a contract bet', () => {
    let t = roll(table([[{ type: 'pass' }, 10]]), [2, 3]).table;
    t = setOdds(t, t.bets[0].id, 20);
    expect(setOdds(t, t.bets[0].id, 0).bankroll).toBe(990);
  });

  it("lays odds behind don't pass up to the win limit", () => {
    let t = roll(table([[{ type: 'dontPass' }, 10]], { oddsLimit: '3-4-5x' }), [2, 2]).table;
    expect(maxOddsFor(t, t.bets[0].id)).toBe(60);
    t = setOdds(t, t.bets[0].id, 60);
    const won = roll(t, [3, 4]);
    expect(won.result.settlements[0].win).toBe(10 + 30);
    expect(won.table.bankroll).toBe(1040);
  });

  it('has come odds off on the come-out by default: returned on a seven', () => {
    let t = rollAll(table(), [3, 3]).table;
    t = placeBet(t, { type: 'come' }, 10);
    t = roll(t, [2, 2]).table; // come bet to the 4
    const come = t.bets[0];
    t = setOdds(t, come.id, 20);
    t = roll(t, [3, 3]).table; // point 6 made: come-out next
    expect(t.point).toBeNull();
    const seven = roll(t, [3, 4]);
    expect(seven.result.settlements[0]).toMatchObject({ action: 'lose', oddsAction: 'push', returned: 20, net: -10 });
  });

  it('works come odds on the come-out when called on', () => {
    let t = rollAll(table(), [3, 3]).table;
    t = placeBet(t, { type: 'come' }, 10);
    t = rollAll(t, [2, 2], [3, 3]).table;
    t = setOdds(t, t.bets[0].id, 20);
    t = setWorking(t, t.bets[0].id, 'on');
    expect(roll(t, [3, 4]).result.settlements[0]).toMatchObject({ oddsAction: 'lose', returned: 0, net: -30 });
    expect(roll(t, [1, 3]).result.settlements[0]).toMatchObject({ oddsAction: 'win', win: 50, net: 50 });
  });
});

describe('working bets', () => {
  it('has place bets off on the come-out by default', () => {
    const t = table([[{ type: 'place', number: 6 }, 12]]);
    const seven = roll(t, [3, 4]);
    expect(seven.result.settlements).toHaveLength(0);
    expect(seven.table.bets).toHaveLength(1);
    expect(roll(t, [3, 4]).table.bankroll).toBe(988);
  });

  it('works place bets on the come-out when the rules say so', () => {
    const t = table([[{ type: 'place', number: 6 }, 12]], { workingOnComeOut: { place: true } });
    const six = roll(t, [2, 4]);
    expect(six.result.settlements[0]).toMatchObject({ action: 'win', win: 14, staysUp: true });
    expect(six.table.bankroll).toBe(988 + 14);
  });

  it('lets the player call a bet off with a point on', () => {
    let t = roll(table(), [5, 5]).table;
    t = placeBet(t, { type: 'place', number: 8 }, 6);
    t = setWorking(t, t.bets[0].id, 'off');
    expect(roll(t, [3, 4]).table.bets).toHaveLength(1);
  });

  it('keeps hardways off on the come-out by default', () => {
    const t = table([[{ type: 'hardway', number: 8 }, 5]]);
    expect(roll(t, [4, 4]).result.settlements).toHaveLength(0);
    const on = roll(t, [5, 5]).table; // point 10
    expect(roll(on, [4, 4]).result.settlements[0]).toMatchObject({ action: 'win', win: 45 });
    expect(roll(on, [2, 6]).result.settlements[0].action).toBe('lose');
  });
});

describe('bet payouts', () => {
  const pointOn = (bets: [BetSpec, number][], rules?: RulesOverrides) =>
    bets.reduce((t, [spec, amount]) => placeBet(t, spec, amount), roll(createTable({ rules }), [5, 5]).table);

  it('pays place and place to lose', () => {
    const t = pointOn([
      [{ type: 'place', number: 4 }, 5],
      [{ type: 'place', number: 5 }, 5],
      [{ type: 'placeToLose', number: 4 }, 11],
    ]);
    expect(roll(t, [1, 3]).result.settlements.map((s) => s.net)).toEqual([9, -11]);
    expect(roll(t, [2, 3]).result.settlements.map((s) => s.net)).toEqual([7]);
    expect(roll(t, [3, 4]).result.settlements.map((s) => s.net)).toEqual([-5, -5, 5]);
  });

  it('charges buy commission on the win', () => {
    const t = pointOn([[{ type: 'buy', number: 4 }, 20]]);
    const won = roll(t, [2, 2]);
    expect(won.result.settlements[0]).toMatchObject({ win: 39, commission: 1, staysUp: true });
  });

  it('charges buy commission up front, again after each win, and refunds it on take-down', () => {
    let t = pointOn([[{ type: 'buy', number: 10 }, 20]], { buyCommission: 'upfront' });
    expect(t.bankroll).toBe(979);
    const won = roll(t, [5, 5]);
    expect(won.result.settlements[0]).toMatchObject({ win: 40, commission: 1, returned: 39 });
    t = won.table;
    expect(removeBet(t, t.bets[0].id).bankroll).toBe(979 + 39 + 21);
  });

  it('charges lay commission on the win, on what the lay wins', () => {
    const t = pointOn([[{ type: 'lay', number: 4 }, 40]]);
    expect(roll(t, [3, 4]).result.settlements[0]).toMatchObject({ win: 19, commission: 1 });
    expect(roll(t, [1, 3]).result.settlements[0]).toMatchObject({ action: 'lose', net: -40 });
  });

  it('rounds winnings down to whole chips under floor rounding', () => {
    const t = pointOn([[{ type: 'place', number: 6 }, 5]], { rounding: 'floor' });
    expect(roll(t, [3, 3]).result.settlements[0].win).toBe(5);
  });

  it('pays big 6/8 even money', () => {
    const t = table([[{ type: 'big', number: 8 }, 10]]);
    expect(roll(t, [2, 6]).result.settlements[0].net).toBe(10);
  });

  it('pays the field by the rules', () => {
    const t = table([[{ type: 'field' }, 10]], { fieldTwo: 2, fieldTwelve: 3 });
    expect(roll(t, [1, 1]).result.settlements[0].net).toBe(20);
    expect(roll(t, [6, 6]).result.settlements[0].net).toBe(30);
    expect(roll(t, [4, 5]).result.settlements[0].net).toBe(10);
    expect(roll(t, [3, 5]).result.settlements[0].net).toBe(-10);
  });

  it('pays the one-roll props and takes them down', () => {
    const t = table([
      [{ type: 'any7' }, 5],
      [{ type: 'anyCraps' }, 5],
      [{ type: 'prop', total: 11 }, 5],
      [{ type: 'horn' }, 4],
      [{ type: 'cAndE' }, 2],
      [{ type: 'hop', dice: [6, 5] }, 1],
      [{ type: 'hop', dice: [3, 3] }, 1],
    ]);
    const yo = roll(t, [5, 6]);
    expect(yo.result.settlements.map((s) => s.net)).toEqual([-5, -5, 75, 12, 14, 15, -1]);
    expect(yo.table.bets).toHaveLength(0);
    const aces = roll(t, [1, 1]);
    expect(aces.result.settlements.map((s) => s.net)).toEqual([-5, 35, -5, 27, 6, -1, -1]);
    expect(roll(t, [3, 3]).result.settlements.map((s) => s.net)).toEqual([-5, -5, -5, -4, -2, -1, 30]);
    expect(roll(t, [4, 3]).result.settlements[0].net).toBe(20);
  });

  it('adds to a bet already on the spot', () => {
    const t = table([[{ type: 'field' }, 5], [{ type: 'field' }, 5], [{ type: 'hop', dice: [2, 1] }, 1], [{ type: 'hop', dice: [1, 2] }, 1]]);
    expect(t.bets.map((b) => b.amount)).toEqual([10, 2]);
  });
});

describe('bankroll', () => {
  it('refuses bets it can\'t cover', () => {
    expect(errorCode(() => table([[{ type: 'field' }, 11]], undefined, 10))).toBe('insufficient-funds');
    expect(errorCode(() => table([[{ type: 'field' }, -1]]))).toBe('invalid-amount');
    expect(errorCode(() => table([[{ type: 'place', number: 7 as 6 }, 5]]))).toBe('invalid-bet');
  });

  it('conserves chips over a long seeded session', () => {
    const random = createSeededRandom('conservation');
    let t = createTable({ bankroll: 100_000, rules: { buyCommission: 'upfront', layCommission: 'upfront' } });
    let netTotal = 0;
    let commissionUpfront = 0;
    for (let i = 0; i < 3000; i++) {
      const beforeBetting = t.bankroll + chipsOnTable(t);
      const has = (type: string) => t.bets.some((b) => b.spec.type === type && b.point === null);
      if (t.point === null && !has('pass')) t = placeBet(t, { type: 'pass' }, 10);
      if (t.point === null && !has('dontPass')) t = placeBet(t, { type: 'dontPass' }, 10);
      if (t.point !== null && !has('come')) t = placeBet(t, { type: 'come' }, 5);
      for (const bet of t.bets) {
        if (bet.point !== null && bet.odds === 0) t = setOdds(t, bet.id, maxOddsFor(t, bet.id));
      }
      for (const spec of [
        { type: 'place', number: 6 },
        { type: 'buy', number: 4 },
        { type: 'lay', number: 10 },
        { type: 'hardway', number: 8 },
        { type: 'field' },
        { type: 'horn' },
      ] as BetSpec[]) {
        if (!t.bets.some((b) => b.spec.type === spec.type)) t = placeBet(t, spec, 20);
      }
      const before = t.bankroll + chipsOnTable(t);
      commissionUpfront += beforeBetting - before;
      const next = roll(t, rollDice(random));
      t = next.table;
      netTotal += next.result.net;
      // What the roll settled is exactly what the player's chips (in hand and on the layout) changed by.
      expect(t.bankroll + chipsOnTable(t) - before).toBeCloseTo(next.result.net, 9);
    }
    expect(commissionUpfront).toBeGreaterThan(0);
    expect(t.bankroll + chipsOnTable(t) - 100_000).toBeCloseTo(netTotal - commissionUpfront, 6);
  });

  it('replays the same game from the same seed', () => {
    const play = (seed: string) => {
      const random = createSeededRandom(seed);
      let t = createTable();
      const events: string[] = [];
      for (let i = 0; i < 200; i++) {
        if (t.point === null && t.bets.length === 0) t = placeBet(t, { type: 'pass' }, 5);
        const next = roll(t, rollDice(random));
        t = next.table;
        events.push(`${next.result.dice.join('')}:${next.result.event}`);
      }
      return { events, bankroll: t.bankroll };
    };
    expect(play('abc')).toEqual(play('abc'));
    expect(play('abc').events).not.toEqual(play('abd').events);
  });
});
