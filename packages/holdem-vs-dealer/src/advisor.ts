import { flopEv, FOLD_EV, preflopEv, riverEv } from './odds.ts';
import houseEdges from './results/house-edge.json' with { type: 'json' };
import { playerCards, visibleBoard, type Action, type Round } from './round.ts';
import { simpleFlopBets, simplePreflopRaises, simpleRiverBets } from './strategy.ts';

/** The exact EV (per unit of ante, ante and blind and play bets) of each legal action, best first. */
export interface ActionEv {
  action: Action;
  ev: number;
}

/**
 * EV of every option on the round's current street. Preflop reads the precomputed table; the flop
 * enumerates about a million outcomes (tens of milliseconds, fine for a Web Worker); the river is instant.
 */
export function actionEvs(round: Round): ActionEv[] {
  const hole = playerCards(round);
  const board = visibleBoard(round);
  let evs: ActionEv[];
  switch (round.street) {
    case 'preflop': {
      const ev = preflopEv(hole);
      evs = [
        { action: { type: 'play', multiple: 4 }, ev: ev.raise4 },
        { action: { type: 'play', multiple: 3 }, ev: ev.raise3 },
        { action: { type: 'check' }, ev: ev.check },
      ];
      break;
    }
    case 'flop': {
      const ev = flopEv(hole, board);
      evs = [
        { action: { type: 'play', multiple: 2 }, ev: ev.bet },
        { action: { type: 'check' }, ev: ev.check },
      ];
      break;
    }
    case 'river': {
      const ev = riverEv(hole, board);
      evs = [
        { action: { type: 'play', multiple: 1 }, ev: ev.bet },
        { action: { type: 'fold' }, ev: FOLD_EV },
      ];
      break;
    }
    case 'complete':
      return [];
  }
  return evs.sort((a, b) => b.ev - a.ev);
}

/** The action with the highest exact EV. */
export function optimalAction(round: Round): Action | null {
  return actionEvs(round)[0]?.action ?? null;
}

/** The Wizard of Odds simple strategy's action (see strategy.ts). */
export function simpleAction(round: Round): Action | null {
  const hole = playerCards(round);
  const board = visibleBoard(round);
  switch (round.street) {
    case 'preflop':
      return simplePreflopRaises(hole) ? { type: 'play', multiple: 4 } : { type: 'check' };
    case 'flop':
      return simpleFlopBets(hole, board) ? { type: 'play', multiple: 2 } : { type: 'check' };
    case 'river':
      return simpleRiverBets(hole, board) ? { type: 'play', multiple: 1 } : { type: 'fold' };
    case 'complete':
      return null;
  }
}

export interface StrategyHouseEdge {
  /** Of the ante: −EV per round per unit of ante. */
  houseEdge: number;
  /** Of everything wagered (ante + blind + play): houseEdge / averageWager. */
  elementOfRisk: number;
  averageWager: number;
  averagePlayBet: number;
  raisePreflop: number;
  betFlop: number;
  betRiver: number;
  fold: number;
}

/** Exact house edges from scripts/compute-exact.ts. */
export const HOUSE_EDGE: { optimal: StrategyHouseEdge; simple: StrategyHouseEdge } = {
  optimal: houseEdges.optimal,
  simple: houseEdges.simple,
};
