import { COMMON_RULES } from './common-rules.ts';
import results from './results/jacks-or-better.json' with { type: 'json' };
import type { StrategyChart, StrategyFamily, StrategyResults, StrategyRule } from './types.ts';

const R = COMMON_RULES;
type RuleId = keyof typeof R;
const chart = (paytableIds: string[], level: StrategyChart['level'], ids: RuleId[]): StrategyChart => ({
  paytableIds,
  level,
  rules: ids.map((id): StrategyRule => R[id]),
});

/** Best: everything down to unsuited K-Q / K-J is the same for 9/6 and 8/5. */
const BEST_TOP: RuleId[] = [
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
  'suited-tj',
  'unsuited-kq-kj',
];

/** 9/6 pays more for flushes, so suited 10-Q and 10-K climb: above A-x and above a lone king. */
const BEST_9_6: RuleId[] = [
  ...BEST_TOP,
  'suited-tq',
  'unsuited-ak-aq-aj',
  'suited-tk',
  'one-j-q-k',
  'one-ace',
  'three-to-straight-flush-c',
  'discard-all',
];

const BEST_8_5: RuleId[] = [
  ...BEST_TOP,
  'unsuited-ak-aq-aj',
  'suited-tq',
  'one-j-q-k',
  'suited-tk',
  'one-ace',
  'three-to-straight-flush-c',
  'discard-all',
];

/** Easy: 15 lines, no exceptions; the same for 9/6 and 8/5. */
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

export const jacksOrBetter: StrategyFamily = {
  id: 'jacks-or-better',
  charts: [
    chart(['jacks-or-better-9-6', 'jacks-or-better-8-5'], 'easy', EASY),
    chart(['jacks-or-better-9-6'], 'best', BEST_9_6),
    chart(['jacks-or-better-8-5'], 'best', BEST_8_5),
  ],
  results: results as StrategyResults,
};
