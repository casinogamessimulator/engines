export type Decks = 1 | 2 | 4 | 6 | 8;

/** Which first two cards the player may double on. "9-11" and "10-11" mean hard totals only. */
export type DoubleRule = 'any' | '9-11' | '10-11';

/**
 * Late: after the dealer checks for blackjack (or, with no hole card, a surrendered hand still loses its whole bet
 * to a dealer blackjack). Early: before the check, so half the bet is lost even against a dealer blackjack.
 */
export type SurrenderRule = 'none' | 'late' | 'early';

/** Peek: US hole card, the dealer checks for blackjack under an ace or ten. None: European, no hole card. */
export type HoleCardRule = 'peek' | 'none';

export interface Rules {
  decks: Decks;
  dealerHitsSoft17: boolean;
  double: DoubleRule;
  doubleAfterSplit: boolean;
  /** Most hands a player can split into: 2 = split once, 4 = resplit up to four hands. */
  maxHands: 2 | 3 | 4;
  resplitAces: boolean;
  /** Without it, each split ace gets one card. */
  hitSplitAces: boolean;
  surrender: SurrenderRule;
  blackjackPays: '3:2' | '6:5';
  holeCard: HoleCardRule;
  /**
   * With no hole card: a dealer blackjack takes only the original bet, and doubles and splits are returned
   * (the "OBO" rule). It plays exactly like a peek game. Ignored with a hole card, where it's always the case.
   */
  originalBetsOnly: boolean;
}

/** A common Las Vegas Strip shoe game: 6 decks, H17, DAS, late surrender, resplit to 4, 3:2. */
export const DEFAULT_RULES: Rules = {
  decks: 6,
  dealerHitsSoft17: true,
  double: 'any',
  doubleAfterSplit: true,
  maxHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  surrender: 'late',
  blackjackPays: '3:2',
  holeCard: 'peek',
  originalBetsOnly: false,
};

export function makeRules(overrides: Partial<Rules> = {}): Rules {
  const rules = { ...DEFAULT_RULES, ...overrides };
  validateRules(rules);
  return rules;
}

export function validateRules(rules: Rules): void {
  if (![1, 2, 4, 6, 8].includes(rules.decks)) throw new Error(`Unsupported number of decks: ${rules.decks}`);
  if (![2, 3, 4].includes(rules.maxHands)) throw new Error(`maxHands must be 2, 3 or 4, not ${rules.maxHands}`);
  if (!['any', '9-11', '10-11'].includes(rules.double)) throw new Error(`Unknown double rule ${rules.double}`);
  if (!['none', 'late', 'early'].includes(rules.surrender)) throw new Error(`Unknown surrender rule ${rules.surrender}`);
  if (!['3:2', '6:5'].includes(rules.blackjackPays)) throw new Error(`Unknown blackjack payout ${rules.blackjackPays}`);
  if (!['peek', 'none'].includes(rules.holeCard)) throw new Error(`Unknown hole card rule ${rules.holeCard}`);
}

/** What a winning blackjack pays per unit bet. */
export function blackjackPayout(rules: Rules): number {
  return rules.blackjackPays === '3:2' ? 1.5 : 1.2;
}

/**
 * True when a dealer blackjack costs only the original bet, so the player's decisions only matter when the dealer
 * doesn't have one: a peek game, or no hole card with the OBO rule.
 */
export function dealerBlackjackTakesOriginalOnly(rules: Rules): boolean {
  return rules.holeCard === 'peek' || rules.originalBetsOnly;
}

/** Whether the double rule allows doubling a two-card hand with this total. */
export function doubleAllowedOn(rules: Rules, total: number, soft: boolean): boolean {
  if (rules.double === 'any') return true;
  if (soft) return false;
  return rules.double === '9-11' ? total >= 9 && total <= 11 : total >= 10 && total <= 11;
}

/** A short readable id, e.g. "6d-h17-das-rs4-ls". Defaults are left out: 3:2, double any, peek. */
export function rulesId(rules: Rules): string {
  const parts = [`${rules.decks}d`, rules.dealerHitsSoft17 ? 'h17' : 's17'];
  if (rules.double !== 'any') parts.push(`d${rules.double.replace('-', '')}`);
  parts.push(rules.doubleAfterSplit ? 'das' : 'ndas');
  parts.push(`rs${rules.maxHands}`);
  if (rules.resplitAces) parts.push('rsa');
  if (rules.hitSplitAces) parts.push('hsa');
  if (rules.surrender !== 'none') parts.push(rules.surrender === 'late' ? 'ls' : 'es');
  if (rules.blackjackPays === '6:5') parts.push('6to5');
  if (rules.holeCard === 'none') parts.push(rules.originalBetsOnly ? 'enhc-obo' : 'enhc');
  return parts.join('-');
}

/** The rules a rulesId() names, or null when the id isn't one. */
export function parseRulesId(id: string): Rules | null {
  const parts = id.split('-');
  const take = (part: string): boolean => {
    const index = parts.indexOf(part);
    if (index < 0) return false;
    parts.splice(index, 1);
    return true;
  };
  const decks = Number(/^(\d)d$/.exec(parts.shift() ?? '')?.[1]);
  const soft17 = parts.shift();
  if (soft17 !== 'h17' && soft17 !== 's17') return null;
  const double = take('d911') ? '9-11' : take('d1011') ? '10-11' : 'any';
  const das = take('das') ? true : take('ndas') ? false : null;
  const maxHands = take('rs2') ? 2 : take('rs3') ? 3 : take('rs4') ? 4 : null;
  if (das === null || maxHands === null) return null;
  const resplitAces = take('rsa');
  const hitSplitAces = take('hsa');
  const surrender = take('ls') ? 'late' : take('es') ? 'early' : 'none';
  const sixFive = take('6to5');
  const enhc = take('enhc');
  const obo = enhc && take('obo');
  if (parts.length > 0) return null;
  try {
    const rules = makeRules({
      decks: decks as Decks,
      dealerHitsSoft17: soft17 === 'h17',
      double,
      doubleAfterSplit: das,
      maxHands,
      resplitAces,
      hitSplitAces,
      surrender,
      blackjackPays: sixFive ? '6:5' : '3:2',
      holeCard: enhc ? 'none' : 'peek',
      originalBetsOnly: obo,
    });
    return rulesId(rules) === id ? rules : null;
  } catch {
    return null;
  }
}
