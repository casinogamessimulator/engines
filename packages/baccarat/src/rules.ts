/** Punto banco drawing rules. No decisions: the tableau below decides every hand. */

/** Either side's first two cards total 8 or 9: both stand. */
export const isNatural = (total: number): boolean => total >= 8;

/** The player draws on 0-5 and stands on 6-7. */
export const playerDraws = (playerTotal: number): boolean => playerTotal <= 5;

/**
 * Whether the banker draws, given the banker's two-card total and the value of the player's third card
 * (null when the player stood, in which case the banker draws on 0-5 like the player).
 */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThird !== 8;
    case 4:
      return playerThird >= 2 && playerThird <= 7;
    case 5:
      return playerThird >= 4 && playerThird <= 7;
    case 6:
      return playerThird === 6 || playerThird === 7;
    default:
      return false;
  }
}

export type Outcome = 'banker' | 'player' | 'tie';

export type Bet = Outcome;

/**
 * - standard: banker wins pay 19 to 20 (5% commission).
 * - no-commission: banker wins pay even money, except a banker win with a three-card 7, which pushes.
 */
export type Variant = 'standard' | 'no-commission';

export interface TableRules {
  variant: Variant;
  /** Commission on banker wins in the standard game. Default 0.05. */
  commission: number;
  /** Tie pays this to 1. Default 8. */
  tiePays: number;
}

export const DEFAULT_RULES: TableRules = { variant: 'standard', commission: 0.05, tiePays: 8 };

export interface CoupSummary {
  outcome: Outcome;
  /** The banker won with three cards totaling 7 (pushes the banker bet in the no-commission game). */
  bankerThreeCardSeven: boolean;
}

/**
 * Amount paid back for a bet of `amount`, stake included (0 when lost).
 * Banker and player bets push on a tie.
 */
export function payBet(bet: Bet, amount: number, coup: CoupSummary, rules: TableRules = DEFAULT_RULES): number {
  if (bet === 'tie') return coup.outcome === 'tie' ? amount * (rules.tiePays + 1) : 0;
  if (coup.outcome === 'tie') return amount;
  if (coup.outcome !== bet) return 0;
  if (bet === 'player') return amount * 2;
  if (rules.variant === 'no-commission') return coup.bankerThreeCardSeven ? amount : amount * 2;
  return amount * (2 - rules.commission);
}
