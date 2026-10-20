// Computes the exact house edge of every craps bet and rule variant and writes src/edges.json, for the odds and
// house-edge tables on the site. Takes well under a second. Re-run after changing a payout or rule: pnpm edges
import { writeFileSync } from 'node:fs';
import { createRules, houseEdge, houseEdges, lineOddsEdges, POINT_NUMBERS, type CrapsRules } from '../src/index.ts';

const round = (x: number) => Number(x.toPrecision(10));
const edgesOf = (rules: CrapsRules) =>
  Object.fromEntries(
    houseEdges(rules).map((e) => [e.key, { edge: round(e.edge), perRoll: round(e.edgePerRoll), excludingTies: round(e.edgeExcludingTies) }]),
  );
const byPoint = (type: 'buy' | 'lay', rules: CrapsRules) =>
  Object.fromEntries(POINT_NUMBERS.map((number) => [number, round(houseEdge({ type, number }, rules).edge)]));

const field: Record<string, number> = {};
for (const two of [2, 3]) {
  for (const twelve of [2, 3]) field[`${two}x-${twelve}x`] = round(houseEdge({ type: 'field' }, createRules({ fieldTwo: two, fieldTwelve: twelve })).edge);
}

const edges = {
  /** Default rules (see DEFAULT_RULES): commission on the win, field 2x on 2 and 3x on 12. */
  bets: edgesOf(createRules()),
  field,
  buy: { win: byPoint('buy', createRules({ buyCommission: 'win' })), upfront: byPoint('buy', createRules({ buyCommission: 'upfront' })) },
  lay: { win: byPoint('lay', createRules({ layCommission: 'win' })), upfront: byPoint('lay', createRules({ layCommission: 'upfront' })) },
  odds: Object.fromEntries(lineOddsEdges().map((o) => [o.limit, { pass: round(o.pass), dontPass: round(o.dontPass) }])),
};

writeFileSync(new URL('../src/edges.json', import.meta.url), JSON.stringify(edges, null, 2) + '\n');
for (const [key, { edge, perRoll }] of Object.entries(edges.bets)) {
  console.log(key.padEnd(16), `${(edge * 100).toFixed(3)}%`.padStart(8), `${(perRoll * 100).toFixed(3)}% per roll`.padStart(18));
}
console.log('field', field, '\nbuy', edges.buy, '\nlay', edges.lay, '\nodds', edges.odds);
