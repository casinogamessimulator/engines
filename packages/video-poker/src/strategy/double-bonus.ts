import { HandClass } from '../evaluate.ts';
import { COMMON_RULES } from './common-rules.ts';
import {
  ACE,
  ALL,
  distinctRanks,
  fourToStraight,
  type Hand,
  highCount,
  INDEX_SETS,
  isOutsideStraightDraw,
  JACK,
  KING,
  maskOf,
  ofAKind,
  QUEEN,
  suited,
  TEN,
  withRanks,
} from './hand.ts';
import results from './results/double-bonus.json' with { type: 'json' };
import { defineRules } from './types.ts';
import type { StrategyChart, StrategyFamily, StrategyResults, StrategyRule } from './types.ts';

// Double Bonus Poker 10/7 and Double Double Bonus Poker 9/6: Easy and Best charts. Rules only these games
// need (three aces, aces with a 2-3-4 kicker, …) go in LOCAL_RULES (see common-rules.ts for the format).
// Two pair pays only 1 and four aces pay 160 (400 with a 2-4 kicker in Double Double Bonus), so aces are worth
// more and two pair less than in Jacks or Better; 10/7 also pays more for straights and flushes.

const NINE = 7;
/** 2s, 3s and 4s: the quads that pay extra, and (with aces) the kickers Double Double Bonus pays for. */
const isLow = (rank: number) => rank <= 2;
const tripsRank = (h: Hand) => {
  const trips = ofAKind(h, 3);
  return trips.length ? h.ranks[trips[0]] : null;
};
/** 3 suited cards whose number of high cards passes `high`. */
const threeToFlush = (h: Hand, high: (count: number) => boolean) => {
  for (const indexes of INDEX_SETS[3]) if (suited(h, indexes) && high(highCount(h, indexes))) return maskOf(indexes);
  return null;
};

/** 3 to a royal flush whose cards pass `accept`. */
const threeToRoyal = (h: Hand, accept: (indexes: number[]) => boolean) => {
  for (const indexes of INDEX_SETS[3]) {
    if (suited(h, indexes) && indexes.every((i) => h.ranks[i] >= TEN) && distinctRanks(h, indexes) && accept(indexes)) {
      return maskOf(indexes);
    }
  }
  return null;
};

const LOCAL_RULES = defineRules({
  // Double Double Bonus pays four aces with a 2-4, and four 2s-4s with an A-4, at least twice as much.
  'pat-royal-straight-flush-quads-kicker': {
    text: {
      en: 'Royal flush, straight flush or four of a kind (keep an A, 2, 3 or 4 as the fifth card)',
      es: 'Escalera real, escalera de color o póker (guarda un A, 2, 3 o 4 como quinta carta)',
      'pt-br': 'Royal flush, straight flush ou quadra (segure um A, 2, 3 ou 4 como quinta carta)',
    },
    example: 'Ac Ad Ah As 3c',
    match: (h) => {
      if (h.handClass === HandClass.RoyalFlush || h.handClass === HandClass.StraightFlush) return ALL;
      const quads = ofAKind(h, 4);
      if (!quads.length) return null;
      const kicker = [0, 1, 2, 3, 4].find((i) => !quads.includes(i))!;
      return isLow(h.ranks[kicker]) || h.ranks[kicker] === ACE ? ALL : maskOf(quads);
    },
  },
  // Ahead of the full house: draw two to three aces rather than keep aces full.
  'three-aces': {
    text: {
      en: 'Three aces, even from a full house',
      es: 'Trío de ases, aunque tengas full',
      'pt-br': 'Trinca de ases, mesmo com full house',
    },
    example: 'Ac Ad Ah',
    match: (h) => (tripsRank(h) === ACE ? maskOf(ofAKind(h, 3)) : null),
  },
  'pair-of-aces': {
    text: {
      en: 'Pair of aces',
      es: 'Pareja de ases',
      'pt-br': 'Par de ases',
    },
    example: 'Ac Ad',
    match: (h) => {
      if (h.handClass !== HandClass.HighPair && h.handClass !== HandClass.TwoPair) return null;
      const aces = [0, 1, 2, 3, 4].filter((i) => h.ranks[i] === ACE);
      return aces.length === 2 ? maskOf(aces) : null;
    },
  },
  'four-to-flush-three-high': {
    text: {
      en: '4 to a flush with 3 high cards',
      es: '4 cartas de color con 3 cartas altas',
      'pt-br': '4 cartas para flush com 3 cartas altas',
    },
    example: '2c Jc Qc Ac',
    match: (h) => {
      for (const indexes of INDEX_SETS[4]) if (suited(h, indexes) && highCount(h, indexes) >= 3) return maskOf(indexes);
      return null;
    },
  },
  'three-to-flush-two-high': {
    text: {
      en: '3 to a flush with 2 high cards',
      es: '3 cartas de color con 2 cartas altas',
      'pt-br': '3 cartas para flush com 2 cartas altas',
    },
    example: '7h Jh Kh',
    match: (h) => threeToFlush(h, (high) => high === 2),
  },
  'three-to-flush-one-high': {
    text: {
      en: '3 to a flush with 1 high card',
      es: '3 cartas de color con 1 carta alta',
      'pt-br': '3 cartas para flush com 1 carta alta',
    },
    example: '4s 8s Qs',
    match: (h) => threeToFlush(h, (high) => high === 1),
  },
  'three-to-flush': {
    text: {
      en: '3 to a flush',
      es: '3 cartas de color',
      'pt-br': '3 cartas para flush',
    },
    example: '3d 6d 9d',
    match: (h) => threeToFlush(h, () => true),
  },
  'three-to-royal-no-ace': {
    text: {
      en: '3 to a royal flush without an ace',
      es: '3 cartas de escalera real sin as',
      'pt-br': '3 cartas para royal flush sem ás',
    },
    example: 'Qs Js Ts',
    match: (h) => threeToRoyal(h, (indexes) => indexes.every((i) => h.ranks[i] !== ACE)),
  },
  'suited-akq-akj-aqj': {
    text: {
      en: 'Suited A-K-Q, A-K-J or A-Q-J',
      es: 'A-K-Q, A-K-J o A-Q-J del mismo palo',
      'pt-br': 'A-K-Q, A-K-J ou A-Q-J do mesmo naipe',
    },
    example: 'Ac Qc Jc',
    match: (h) =>
      threeToRoyal(h, (indexes) => indexes.some((i) => h.ranks[i] === ACE) && indexes.every((i) => h.ranks[i] !== TEN)),
  },
  'suited-kqj-qjt': {
    text: {
      en: 'Suited K-Q-J or Q-J-10',
      es: 'K-Q-J o Q-J-10 del mismo palo',
      'pt-br': 'K-Q-J ou Q-J-10 do mesmo naipe',
    },
    example: 'Kd Qd Jd',
    match: (h) => withRanks(h, [KING, QUEEN, JACK], true) ?? withRanks(h, [QUEEN, JACK, TEN], true),
  },
  'suited-9tj-9jq': {
    text: {
      en: 'Suited 9-10-J or 9-J-Q',
      es: '9-10-J o 9-J-Q del mismo palo',
      'pt-br': '9-10-J ou 9-J-Q do mesmo naipe',
    },
    example: '9s Ts Js',
    match: (h) => withRanks(h, [NINE, TEN, JACK], true) ?? withRanks(h, [NINE, JACK, QUEEN], true),
  },
  'unsuited-tjq': {
    text: {
      en: '10-J-Q, mixed suits',
      es: '10-J-Q de distintos palos',
      'pt-br': '10-J-Q de naipes diferentes',
    },
    example: 'Tc Jd Qh',
    match: (h) => withRanks(h, [TEN, JACK, QUEEN], false),
  },
  'unsuited-9tjq': {
    text: {
      en: '9-10-J-Q, mixed suits',
      es: '9-10-J-Q de distintos palos',
      'pt-br': '9-10-J-Q de naipes diferentes',
    },
    example: '9c Td Jh Qs',
    match: (h) => withRanks(h, [NINE, TEN, JACK, QUEEN], false),
  },
  'four-to-straight-2-high': {
    text: {
      en: '4 to a straight with 2 or more high cards',
      es: '4 cartas de escalera con 2 cartas altas o más',
      'pt-br': '4 cartas para sequência com 2 cartas altas ou mais',
    },
    example: '8c 9d Jh Qs',
    match: (h) => fourToStraight(h, (_, high) => high >= 2),
  },
  'four-to-straight-1-high': {
    text: {
      en: '4 to a straight with a high card',
      es: '4 cartas de escalera con una carta alta',
      'pt-br': '4 cartas para sequência com uma carta alta',
    },
    example: '7c 8d 9h Js',
    match: (h) => fourToStraight(h, (_, high) => high >= 1),
  },
  'four-to-inside-straight-2-high': {
    text: {
      en: '4 to an inside straight with 2 high cards',
      es: '4 cartas de escalera interna con 2 cartas altas',
      'pt-br': '4 cartas para sequência interna com 2 cartas altas',
    },
    example: '8c 9d Jh Qs',
    match: (h) => fourToStraight(h, (ranks, high) => !isOutsideStraightDraw(ranks) && high === 2),
  },
  'four-to-inside-straight-1-high': {
    text: {
      en: '4 to an inside straight with 1 high card',
      es: '4 cartas de escalera interna con 1 carta alta',
      'pt-br': '4 cartas para sequência interna com 1 carta alta',
    },
    example: '7c 8d 9h Js',
    match: (h) => fourToStraight(h, (ranks, high) => !isOutsideStraightDraw(ranks) && high === 1),
  },
  'four-to-inside-straight': {
    text: {
      en: '4 to an inside straight',
      es: '4 cartas de escalera interna',
      'pt-br': '4 cartas para sequência interna',
    },
    example: '5c 6d 8h 9s',
    match: (h) => fourToStraight(h, (ranks) => !isOutsideStraightDraw(ranks)),
  },
});

const R = { ...COMMON_RULES, ...LOCAL_RULES };
type RuleId = keyof typeof R;
export const chart = (paytableIds: string[], level: StrategyChart['level'], ids: RuleId[]): StrategyChart => ({
  paytableIds,
  level,
  rules: ids.map((id): StrategyRule => R[id]),
});

/** Best, Double Bonus 10/7: aces full is broken up for three aces; straights and flushes climb. */
const BEST_DOUBLE_BONUS: RuleId[] = [
  'pat-royal-straight-flush-quads',
  'four-to-royal',
  'three-aces',
  'pat-full-house-flush-straight-trips',
  'four-to-straight-flush',
  'two-pair',
  'pair-of-aces',
  'four-to-flush-three-high',
  'suited-kqj-qjt',
  'high-pair',
  'four-to-flush',
  'three-to-royal',
  'four-to-outside-straight',
  'suited-9tj-9jq',
  'low-pair',
  'four-to-inside-straight-4-high',
  'three-to-straight-flush-a',
  'four-to-inside-straight-3-high',
  'suited-qj',
  'three-to-flush-two-high',
  'suited-kq-kj',
  'four-to-inside-straight-2-high',
  'three-to-straight-flush-b',
  'suited-ak-aq-aj',
  'four-to-inside-straight-1-high',
  'unsuited-tjq',
  'suited-tj',
  'unsuited-jqk',
  'unsuited-jq',
  'three-to-flush-one-high',
  'suited-tq',
  'three-to-straight-flush-c',
  'unsuited-kq-kj',
  'one-ace',
  'suited-tk',
  'one-j-q-k',
  'four-to-inside-straight',
  'three-to-flush',
  'discard-all',
];

/** Best, Double Double Bonus 9/6: aces are kept alone (up to 400 per coin with a 2-4 kicker), even over two pair. */
const BEST_DOUBLE_DOUBLE_BONUS: RuleId[] = [
  'pat-royal-straight-flush-quads-kicker',
  'four-to-royal',
  'three-aces',
  'pat-full-house-flush-straight-trips',
  'four-to-straight-flush',
  'pair-of-aces',
  'two-pair',
  'high-pair',
  'three-to-royal-no-ace',
  'unsuited-tjqk',
  'suited-akq-akj-aqj',
  'four-to-flush',
  'three-to-royal',
  'unsuited-9tjq',
  'low-pair',
  'four-to-outside-straight',
  'three-to-straight-flush-a',
  'four-to-inside-straight-4-high',
  'suited-qj',
  'suited-kq-kj',
  'suited-ak-aq-aj',
  'four-to-inside-straight-3-high',
  'three-to-straight-flush-b',
  'four-to-inside-straight-2-high',
  'unsuited-jqk',
  'unsuited-jq',
  'one-ace',
  'suited-tj',
  'unsuited-kq-kj',
  'suited-tq',
  'suited-tk',
  'one-j-q-k',
  'three-to-straight-flush-c',
  'four-to-inside-straight',
  'discard-all',
];

/** Easy, Double Bonus 10/7: 17 lines, no exceptions. Straights pay 5, so 4 to any straight is worth a draw. */
const EASY_DOUBLE_BONUS: RuleId[] = [
  'pat-royal-straight-flush-quads',
  'four-to-royal',
  'pat-full-house-flush-straight-trips',
  'two-pair',
  'high-pair',
  'four-to-flush',
  'three-to-royal',
  'four-to-outside-straight',
  'low-pair',
  'three-to-straight-flush',
  'four-to-straight-1-high',
  'two-suited-high',
  'three-to-flush-one-high',
  'two-high-cards',
  'one-high-card',
  'four-to-inside-straight',
  'discard-all',
];

/** Easy, Double Double Bonus 9/6: 17 lines, no exceptions. A lone ace beats an ace with another unsuited high card. */
const EASY_DOUBLE_DOUBLE_BONUS: RuleId[] = [
  'pat-royal-straight-flush-quads-kicker',
  'four-to-royal',
  'pat-full-house-flush-straight-trips',
  'pair-of-aces',
  'two-pair',
  'high-pair',
  'four-to-flush',
  'three-to-royal',
  'low-pair',
  'four-to-outside-straight',
  'three-to-straight-flush',
  'two-suited-high',
  'four-to-straight-2-high',
  'one-ace',
  'two-high-cards',
  'one-high-card',
  'discard-all',
];

export const doubleBonus: StrategyFamily = {
  id: 'double-bonus',
  charts: [
    chart(['double-bonus-10-7'], 'easy', EASY_DOUBLE_BONUS),
    chart(['double-bonus-10-7'], 'best', BEST_DOUBLE_BONUS),
    chart(['double-double-bonus-9-6'], 'easy', EASY_DOUBLE_DOUBLE_BONUS),
    chart(['double-double-bonus-9-6'], 'best', BEST_DOUBLE_DOUBLE_BONUS),
  ],
  results: results as StrategyResults,
};
