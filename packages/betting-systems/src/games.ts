import {
  BANKER_WINS,
  BANKER_WINS_THREE_CARD_SEVEN,
  DEFAULT_RULES,
  exactOdds,
  houseEdge as baccaratHouseEdge,
  playCoupFast,
  PLAYER_WINS,
  Shoe,
  TIE,
  type TableRules,
  type Variant,
} from '@cgs/baccarat';
import {
  getBet,
  getWheel,
  houseEdge as rouletteHouseEdge,
  isZero,
  type EvenMoneyBetKind,
  type EvenMoneyRule,
  type RandomInt,
  type WheelId,
} from '@cgs/roulette';

/** A table for one session: resolves bets one at a time from the session's random stream. */
export interface GameTable {
  /** Resolves a bet of `stake` and returns what is paid back, stake included (0 when lost). */
  play(stake: number): number;
  /** Spins or hands dealt so far: an imprisoned roulette bet takes more than one spin to resolve. */
  readonly rounds: number;
}

/** Any game the simulator can bet on. Implement this to plug in another game. */
export interface Game {
  label: string;
  /** Exact house edge per bet, the value the simulated loss per unit wagered converges to. */
  houseEdge: number;
  open(randomInt: RandomInt): GameTable;
}

export interface RouletteGameSpec {
  type: 'roulette';
  wheel: WheelId;
  /** Which even-money bet. Default red. */
  bet?: EvenMoneyBetKind;
  /** Default none. */
  evenMoney?: EvenMoneyRule;
}

export interface BaccaratGameSpec {
  type: 'baccarat';
  /** Default 8. */
  decks?: number;
  bet: 'banker' | 'player';
  /** Default standard (5% commission on banker wins). */
  variant?: Variant;
}

/** Plain data, so a simulation's inputs can go in a shareable URL. */
export type GameSpec = RouletteGameSpec | BaccaratGameSpec;

const LOSE = 0;
const WIN = 2;
const HALF = 0.5;
const PRISON = -1;

/** An even-money roulette bet, spun on the real wheel from the session's random stream. */
export function rouletteGame({ wheel: wheelId, bet: kind = 'red', evenMoney = 'none' }: Omit<RouletteGameSpec, 'type'>): Game {
  const wheel = getWheel(wheelId);
  const bet = getBet(wheel, kind);
  const pocketCount = wheel.order.length;
  // What one unit returns for each pocket index a spin can land on.
  const returns = new Float64Array(pocketCount);
  const zero = new Uint8Array(pocketCount);
  wheel.order.forEach((pocket, i) => {
    zero[i] = isZero(pocket) ? 1 : 0;
    if (bet.pockets.includes(pocket)) returns[i] = WIN;
    else if (!isZero(pocket) || evenMoney === 'none') returns[i] = LOSE;
    else returns[i] = evenMoney === 'la-partage' ? HALF : PRISON;
  });
  const rules = { evenMoney };
  return {
    label: `${wheel.name} roulette, ${kind}${evenMoney === 'none' ? '' : `, ${evenMoney}`}`,
    houseEdge: rouletteHouseEdge(wheel, bet, rules),
    open(randomInt) {
      let rounds = 0;
      return {
        get rounds() {
          return rounds;
        },
        play(stake) {
          rounds++;
          const unit = returns[randomInt(pocketCount)];
          if (unit !== PRISON) return stake * unit;
          // In prison: spin until the bet is freed or lost.
          let level = 1;
          for (;;) {
            rounds++;
            const i = randomInt(pocketCount);
            if (returns[i] === WIN) {
              if (--level === 0) return stake;
            } else if (!zero[i] || evenMoney === 'en-prison') return 0;
            else if (evenMoney === 'en-prison-multi') level++;
          }
        },
      };
    },
  };
}

/** A banker or player bet, dealt from a real seeded shoe that reshuffles at the cut card. */
export function baccaratGame({ decks = 8, bet, variant = 'standard' }: Omit<BaccaratGameSpec, 'type'>): Game {
  const rules: TableRules = { ...DEFAULT_RULES, variant };
  // What one unit returns for each playCoupFast result code.
  const returns = new Float64Array(4);
  returns[TIE] = 1;
  if (bet === 'player') returns[PLAYER_WINS] = 2;
  else {
    returns[BANKER_WINS] = variant === 'no-commission' ? 2 : 2 - rules.commission;
    returns[BANKER_WINS_THREE_CARD_SEVEN] = variant === 'no-commission' ? 1 : returns[BANKER_WINS];
  }
  return {
    label: `Baccarat (${decks} decks${variant === 'no-commission' ? ', no commission' : ''}), ${bet}`,
    houseEdge: baccaratHouseEdge(exactOdds(decks), bet, rules),
    open(randomInt) {
      const shoe = new Shoe({ decks, randomInt });
      let rounds = 0;
      return {
        get rounds() {
          return rounds;
        },
        play(stake) {
          rounds++;
          return stake * returns[playCoupFast(shoe)];
        },
      };
    },
  };
}

export function createGame(spec: GameSpec): Game {
  return spec.type === 'roulette' ? rouletteGame(spec) : baccaratGame(spec);
}
