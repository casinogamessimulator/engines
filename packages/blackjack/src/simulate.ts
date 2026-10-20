import { act, deal, newGame } from './game.ts';
import type { Rules } from './rules.ts';
import { shuffleShoe } from './shoe.ts';
import { basicStrategyAction, type StrategyChart } from './strategy.ts';

export interface SimulationOptions {
  rounds: number;
  seed?: number | string;
  /** Reshuffle before every round, as the analysis assumes. Otherwise deal to a cut card at `penetration`. */
  continuousShuffle?: boolean;
  penetration?: number;
}

export interface SimulationResult {
  rounds: number;
  /** Average net result per round, per unit of the initial bet (negative = the house's edge). */
  mean: number;
  /** Standard error of the mean; a 95% confidence interval is mean ± 1.96 × this. */
  standardError: number;
}

/** Plays rounds through the game engine with the chart's decisions (never insurance). */
export function simulate(rules: Rules, chart: StrategyChart, options: SimulationOptions): SimulationResult {
  let game = newGame(rules, { seed: options.seed ?? 1, penetration: options.penetration });
  let sum = 0;
  let sumOfSquares = 0;
  for (let i = 0; i < options.rounds; i++) {
    if (options.continuousShuffle) game = { ...game, shoe: shuffleShoe(game.shoe) };
    game = deal(game, 1);
    while (game.round!.phase !== 'done') game = act(game, basicStrategyAction(chart, game));
    const net = game.round!.settlement!.net;
    sum += net;
    sumOfSquares += net * net;
  }
  const mean = sum / options.rounds;
  const variance = (sumOfSquares - options.rounds * mean * mean) / (options.rounds - 1);
  return { rounds: options.rounds, mean, standardError: Math.sqrt(variance / options.rounds) };
}
