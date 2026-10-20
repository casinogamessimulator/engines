// Exact analysis of every ante bonus and pair plus paytable. Writes src/analysis.json (house edges,
// outcome probabilities, the derived strategy threshold) and src/hand-evs.json (the EV of playing each
// of the 1,755 hand classes under the default ante bonus, strongest first; folding is -1). Under a second per ante bonus table.
// Re-run after adding or changing a paytable: pnpm analysis
import { writeFileSync } from 'node:fs';
import { analyzeGame, analyzePairPlus, anteBonusPaytables, DEFAULT_ANTE_BONUS, pairPlusPaytables } from '../src/index.ts';

const round = (x: number) => Number(x.toPrecision(12));

const anteBonus: Record<string, unknown> = {};
let defaultHands: unknown[] = [];
for (const table of anteBonusPaytables) {
  const started = performance.now();
  const { hands, ...game } = analyzeGame(table);
  if (table === DEFAULT_ANTE_BONUS) {
    defaultHands = hands.map(({ hand, combinations, counts, play }) => ({ hand, combinations, counts, play: round(play) }));
  }
  anteBonus[table.id] = {
    ...game,
    houseEdge: round(game.houseEdge),
    elementOfRisk: round(game.elementOfRisk),
    playProbability: round(game.playProbability),
    dealerQualifiesProbability: round(game.dealerQualifiesProbability),
    winProbability: round(game.winProbability),
    pushProbability: round(game.pushProbability),
    lossProbability: round(game.lossProbability),
    netDistribution: game.netDistribution.map((n) => ({ ...n, probability: round(n.probability) })),
  };
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  console.log(
    `${table.id.padEnd(32)} house edge ${(game.houseEdge * 100).toFixed(4)}%, element of risk ${(game.elementOfRisk * 100).toFixed(4)}%, ` +
      `plays ${game.threshold.lowestPlayed}+, folds ${game.threshold.highestFolded}- (${game.threshold.separates ? 'one threshold' : 'NO single threshold'}) (${seconds}s)`,
  );
}

const pairPlus: Record<string, unknown> = {};
for (const table of pairPlusPaytables) {
  const result = analyzePairPlus(table);
  pairPlus[table.id] = { ...result, houseEdge: round(result.houseEdge) };
  console.log(`${table.id.padEnd(32)} house edge ${(result.houseEdge * 100).toFixed(4)}%`);
}

writeFileSync(new URL('../src/analysis.json', import.meta.url), JSON.stringify({ anteBonus, pairPlus }, null, 2) + '\n');
writeFileSync(new URL('../src/hand-evs.json', import.meta.url), '[\n' + defaultHands.map((h) => JSON.stringify(h)).join(',\n') + '\n]\n');
