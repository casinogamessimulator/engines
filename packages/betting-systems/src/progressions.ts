/**
 * Betting progressions. Each one turns the history of rounds into the next bet; none of them can change
 * the house edge, which is what the simulator shows.
 *
 * A round is a win when it returned more than the stake, a loss when it returned less (a la partage half
 * loss counts as a loss) and a push when it returned the stake (a baccarat tie, a bet freed from prison),
 * which leaves every progression where it was.
 */

export type ProgressionId = 'flat' | 'martingale' | 'paroli' | 'fibonacci' | 'dalembert' | 'labouchere';

export const PROGRESSION_IDS: readonly ProgressionId[] = [
  'flat',
  'martingale',
  'paroli',
  'fibonacci',
  'dalembert',
  'labouchere',
];

export interface Round {
  /** Amount actually bet. */
  stake: number;
  /** Amount paid back, stake included. */
  returned: number;
}

/** A running progression for one session. Mutable so a simulation can run millions of rounds without allocating. */
export interface ProgressionState {
  /** The bet the system wants next, before table limits and the bankroll get a say. */
  nextBet(): number;
  record(round: Round): void;
}

export interface Progression {
  id: ProgressionId;
  name: string;
  start(baseBet: number): ProgressionState;
}

export interface ProgressionOptions {
  /** Paroli: consecutive wins before going back to the base bet. Default 3. */
  paroliWins?: number;
  /** Labouchère: the starting line, in units of the base bet. Default [1, 2, 3, 4]. */
  labouchereLine?: readonly number[];
}

const resultOf = (round: Round): 1 | -1 | 0 => (round.returned > round.stake ? 1 : round.returned < round.stake ? -1 : 0);

const flat: Progression = {
  id: 'flat',
  name: 'Flat betting',
  start: (baseBet) => ({ nextBet: () => baseBet, record: () => {} }),
};

/** Double the bet after every loss, back to the base bet after a win. */
const martingale: Progression = {
  id: 'martingale',
  name: 'Martingale',
  start(baseBet) {
    let bet = baseBet;
    return {
      nextBet: () => bet,
      record(round) {
        const result = resultOf(round);
        if (result > 0) bet = baseBet;
        else if (result < 0) bet *= 2;
      },
    };
  },
};

/** Reverse Martingale: double after every win, back to the base bet after a loss or after `wins` wins in a row. */
function paroli(wins: number): Progression {
  if (!(Number.isInteger(wins) && wins >= 1)) throw new Error(`Invalid Paroli streak ${wins}`);
  return {
    id: 'paroli',
    name: 'Paroli (reverse Martingale)',
    start(baseBet) {
      let streak = 0;
      return {
        nextBet: () => baseBet * 2 ** streak,
        record(round) {
          const result = resultOf(round);
          if (result > 0) streak = streak + 1 >= wins ? 0 : streak + 1;
          else if (result < 0) streak = 0;
        },
      };
    },
  };
}

/** Bets follow 1, 1, 2, 3, 5, 8… units: one step up after a loss, two steps back after a win. */
const fibonacci: Progression = {
  id: 'fibonacci',
  name: 'Fibonacci',
  start(baseBet) {
    const sequence = [1, 1];
    let step = 0;
    return {
      nextBet: () => baseBet * sequence[step],
      record(round) {
        const result = resultOf(round);
        if (result > 0) step = Math.max(0, step - 2);
        else if (result < 0) {
          step++;
          if (step === sequence.length) sequence.push(sequence[step - 1] + sequence[step - 2]);
        }
      },
    };
  },
};

/** One unit more after a loss, one unit less after a win, never below one unit. */
const dalembert: Progression = {
  id: 'dalembert',
  name: "D'Alembert",
  start(baseBet) {
    let units = 1;
    return {
      nextBet: () => baseBet * units,
      record(round) {
        const result = resultOf(round);
        if (result > 0) units = Math.max(1, units - 1);
        else if (result < 0) units++;
      },
    };
  },
};

/**
 * Cancellation system: bet the first plus the last number of the line. A win crosses both off, a loss adds the
 * amount lost to the end. Crossing off the whole line wins the line's total; then it starts over.
 */
function labouchere(initialLine: readonly number[]): Progression {
  if (!initialLine.length || initialLine.some((n) => !(n > 0))) throw new Error('Invalid Labouchère line');
  return {
    id: 'labouchere',
    name: 'Labouchère',
    start(baseBet) {
      // A deque in a plain array: the line is line[head..line.length).
      let line = [...initialLine];
      let head = 0;
      return {
        nextBet() {
          const size = line.length - head;
          return baseBet * (size === 1 ? line[head] : line[head] + line[line.length - 1]);
        },
        record(round) {
          const result = resultOf(round);
          if (result > 0) {
            head++;
            if (line.length > head) line.pop();
            if (line.length === head) {
              line = [...initialLine];
              head = 0;
            } else if (head > 64 && head * 2 > line.length) {
              line = line.slice(head);
              head = 0;
            }
          } else if (result < 0) line.push((round.stake - round.returned) / baseBet);
        },
      };
    },
  };
}

export function createProgression(id: ProgressionId, options: ProgressionOptions = {}): Progression {
  switch (id) {
    case 'flat':
      return flat;
    case 'martingale':
      return martingale;
    case 'paroli':
      return paroli(options.paroliWins ?? 3);
    case 'fibonacci':
      return fibonacci;
    case 'dalembert':
      return dalembert;
    case 'labouchere':
      return labouchere(options.labouchereLine ?? [1, 2, 3, 4]);
    default:
      throw new Error(`Unknown progression "${id}"`);
  }
}

export interface TableLimits {
  tableMin: number;
  tableMax: number;
}

/**
 * The bet that actually goes down: the system's bet, capped by the table maximum and by the bankroll,
 * and raised to the table minimum. 0 when the bankroll cannot cover the minimum (bust).
 */
export function placeBet(wanted: number, bankroll: number, limits: TableLimits): number {
  if (bankroll < limits.tableMin) return 0;
  return Math.max(limits.tableMin, Math.min(wanted, limits.tableMax, bankroll));
}

/**
 * The next bet for a bankroll and a history of rounds: replays the history through the progression.
 * Without limits, only the bankroll caps it.
 */
export function nextBet(
  progression: Progression,
  baseBet: number,
  bankroll: number,
  history: readonly Round[],
  limits: TableLimits = { tableMin: 0, tableMax: Infinity },
): number {
  const state = progression.start(baseBet);
  for (const round of history) state.record(round);
  return placeBet(state.nextBet(), bankroll, limits);
}
