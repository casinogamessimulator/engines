// Times 10,000 sessions of each progression on roulette and baccarat, the size of a run the site will make in a
// browser worker (target: about 1-2 s). Run: pnpm benchmark
import { PROGRESSION_IDS, simulate, type GameSpec } from '../src/index.ts';

const games: GameSpec[] = [
  { type: 'roulette', wheel: 'double-zero', bet: 'red' },
  { type: 'roulette', wheel: 'single-zero', bet: 'red', evenMoney: 'en-prison' },
  { type: 'baccarat', decks: 8, bet: 'banker' },
];

for (const game of games) {
  for (const progression of PROGRESSION_IDS) {
    const started = performance.now();
    const result = simulate({
      game,
      progression,
      bankroll: 1_000,
      baseBet: 10,
      tableMin: 10,
      tableMax: 1_000,
      stopWin: 500,
      stopLoss: null,
      maxRounds: 1_000,
      sessions: 10_000,
      seed: 'benchmark',
    });
    const ms = performance.now() - started;
    const name = `${game.type === 'roulette' ? `${game.wheel}${game.evenMoney ? ` ${game.evenMoney}` : ''}` : 'baccarat banker'} ${progression}`;
    console.log(
      name.padEnd(40),
      `${ms.toFixed(0).padStart(5)} ms`,
      `${(result.averageRounds * result.sessions / 1e6).toFixed(2)}M bets`,
      `bust ${(result.bustRate * 100).toFixed(1)}%`,
      `up ${(result.upRate * 100).toFixed(1)}%`,
      `loss/wagered ${(result.lossPerUnitWagered * 100).toFixed(2)}% (edge ${(result.houseEdge * 100).toFixed(2)}%)`,
    );
  }
}
