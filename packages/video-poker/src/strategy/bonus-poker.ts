import { COMMON_RULES } from './common-rules.ts';
import { ACE, fourToStraight, INDEX_SETS, isOutsideStraightDraw, JACK, KING, maskOf, suited, TEN } from './hand.ts';
import results from './results/bonus-poker.json' with { type: 'json' };
import { defineRules, type StrategyChart, type StrategyFamily, type StrategyResults, type StrategyRule } from './types.ts';

// Bonus Poker 8/5 and Bonus Poker Deluxe 9/6: Easy and Best charts. Rules only these games need go in
// LOCAL_RULES (see common-rules.ts for the format).
const LOCAL_RULES = defineRules({
  // Deluxe pays 6 for a flush, so the A-10 royal draws (the weakest 3 to a royal) give way to 4 to a flush.
  'four-to-flush-ace-ten-royal': {
    text: {
      en: '4 to a flush with an A, a 10 and a J, Q or K',
      es: '4 cartas de color con A, 10 y una J, Q o K',
      'pt-br': '4 cartas para flush com A, 10 e um J, Q ou K',
    },
    example: 'Ac Qc Tc 6c',
    match: (h) => {
      for (const indexes of INDEX_SETS[4]) {
        const ranks = indexes.map((i) => h.ranks[i]);
        if (suited(h, indexes) && ranks.includes(ACE) && ranks.includes(TEN) && ranks.some((r) => r >= JACK && r <= KING)) {
          return maskOf(indexes);
        }
      }
      return null;
    },
  },
  // Deluxe pays two pair only 1, so a pair is worth less and inside straights climb.
  'four-to-inside-straight-2-high': {
    text: {
      en: '4 to an inside straight with 2 high cards',
      es: '4 cartas de escalera interna con 2 cartas altas',
      'pt-br': '4 cartas para sequência interna com 2 cartas altas',
    },
    example: 'Kc Qd Th 9s',
    match: (h) => fourToStraight(h, (ranks, high) => !isOutsideStraightDraw(ranks) && high === 2),
  },
  'four-to-inside-straight-no-high': {
    text: {
      en: '4 to an inside straight with no high cards',
      es: '4 cartas de escalera interna sin cartas altas',
      'pt-br': '4 cartas para sequência interna sem cartas altas',
    },
    example: '5c 6d 7h 9s',
    match: (h) => fourToStraight(h, (ranks, high) => !isOutsideStraightDraw(ranks) && high === 0),
  },
});

const R = { ...COMMON_RULES, ...LOCAL_RULES };
type RuleId = keyof typeof R;
export const chart = (paytableIds: string[], level: StrategyChart['level'], ids: RuleId[]): StrategyChart => ({
  paytableIds,
  level,
  rules: ids.map((id): StrategyRule => R[id]),
});

/** The bigger four-of-a-kind pays barely move the draws: this is Jacks or Better 8/5 with K-Q / K-J over 10-J. */
const BEST_8_5: RuleId[] = [
  'pat-royal-straight-flush-quads',
  'four-to-royal',
  'pat-full-house-flush-straight-trips',
  'four-to-straight-flush',
  'two-pair',
  'high-pair',
  'three-to-royal',
  'four-to-flush',
  'unsuited-tjqk',
  'low-pair',
  'four-to-outside-straight',
  'three-to-straight-flush-a',
  'four-to-inside-straight-4-high',
  'suited-qj',
  'suited-kq-kj',
  'suited-ak-aq-aj',
  'four-to-inside-straight-3-high',
  'three-to-straight-flush-b',
  'unsuited-jqk',
  'unsuited-jq',
  'unsuited-kq-kj',
  'suited-tj',
  'unsuited-ak-aq-aj',
  'suited-tq',
  'one-j-q-k',
  'suited-tk',
  'one-ace',
  'three-to-straight-flush-c',
  'discard-all',
];

/** Deluxe: flushes pay 6 and two pair only 1, so 4 to a flush and inside straights gain ground. */
const BEST_DELUXE_9_6: RuleId[] = [
  'pat-royal-straight-flush-quads',
  'four-to-royal',
  'pat-full-house-flush-straight-trips',
  'four-to-straight-flush',
  'two-pair',
  'high-pair',
  'four-to-flush-ace-ten-royal',
  'three-to-royal',
  'four-to-flush',
  'unsuited-tjqk',
  'low-pair',
  'four-to-outside-straight',
  'three-to-straight-flush-a',
  'four-to-inside-straight-4-high',
  'suited-qj',
  'suited-kq-kj',
  'suited-ak-aq-aj',
  'four-to-inside-straight-3-high',
  'three-to-straight-flush-b',
  'unsuited-jqk',
  'four-to-inside-straight-2-high',
  'unsuited-jq',
  'suited-tj',
  'unsuited-kq-kj',
  'suited-tq',
  'unsuited-ak-aq-aj',
  'suited-tk',
  'one-j-q-k',
  'one-ace',
  'three-to-straight-flush-c',
  'four-to-inside-straight-no-high',
  'discard-all',
];

/** Easy: the same 15 lines as Jacks or Better, so one chart covers all three games. */
const EASY: RuleId[] = [
  'pat-royal-straight-flush-quads',
  'four-to-royal',
  'pat-full-house-flush-straight-trips',
  'four-to-straight-flush',
  'two-pair',
  'high-pair',
  'three-to-royal',
  'four-to-flush',
  'low-pair',
  'four-to-outside-straight',
  'two-suited-high',
  'three-to-straight-flush',
  'two-high-cards',
  'suited-ten-high',
  'one-high-card',
  'discard-all',
];

export const bonusPoker: StrategyFamily = {
  id: 'bonus-poker',
  charts: [
    chart(['bonus-poker-8-5', 'bonus-poker-deluxe-9-6'], 'easy', EASY),
    chart(['bonus-poker-8-5'], 'best', BEST_8_5),
    chart(['bonus-poker-deluxe-9-6'], 'best', BEST_DELUXE_9_6),
  ],
  results: results as StrategyResults,
};
