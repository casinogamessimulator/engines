// Plays a preset through the game engine with its chart and compares the result with the analytic house edge:
//   pnpm simulate [rules id] [rounds] [seed] [--cut-card]
// e.g. pnpm simulate 6d-h17-das-rs4-ls 2000000. Reshuffles every round unless --cut-card (75% penetration).
import { presetResult } from '../src/results.ts';
import { simulate } from '../src/simulate.ts';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const cutCard = process.argv.includes('--cut-card');
const id = args[0] ?? '6d-h17-das-rs4-ls';
const rounds = Number(args[1] ?? 1_000_000);
const seed = args[2] ?? 'simulate';
const preset = presetResult(id);
if (!preset) throw new Error(`No preset "${id}"`);

const started = performance.now();
const result = simulate(preset.rules, preset.chart, { rounds, seed, continuousShuffle: !cutCard, penetration: 0.75 });
const pct = (value: number): string => `${(value * 100).toFixed(4)}%`;
const edge = -result.mean;
const halfWidth = 1.96 * result.standardError;
console.log(`${id}, ${rounds.toLocaleString('en')} rounds, seed "${seed}", ${cutCard ? 'cut card at 75%' : 'continuous shuffle'}`);
console.log(`simulated house edge ${pct(edge)} ± ${pct(halfWidth)} (95%): [${pct(edge - halfWidth)}, ${pct(edge + halfWidth)}]`);
console.log(`analytic  house edge ${pct(preset.houseEdge)} (basic strategy)`);
console.log(`${((performance.now() - started) / 1000).toFixed(1)}s`);
