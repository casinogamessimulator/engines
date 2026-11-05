# Casino Games Simulator engines

The math behind [Casino Games Simulator](https://casinogamessimulator.com): free casino game simulators with virtual chips, exact odds and
strategy trainers. Each engine is pure TypeScript with no runtime dependencies, computes its numbers exactly wherever
that's feasible (by counting every deal, not by sampling), and is checked by tests against published figures.

| Engine | Method | Checked against | Live |
|---|---|---|---|
| [Video poker](packages/video-poker) | Exact enumeration | Wizard of Odds' returns for 5 paytables, to 6 decimals. | [site](https://casinogamessimulator.com/video-poker/strategy/) |
| [Blackjack](packages/blackjack) | Combinatorial analysis | Wizard of Odds' house edge calculator for 22 rule sets (within 0.005 points), dealer bust tables and strategy charts; card counting tags and the Illustrious 18 and Fab 4 indices as published (Schlesinger, Wong). | [site](https://casinogamessimulator.com/blackjack/strategy/) |
| [Roulette](packages/roulette) | Combinatorial analysis | 2.70%, 5.26%, 7.69%, 7.89% (five-number bet), 1.35% (la partage). | [site](https://casinogamessimulator.com/roulette/odds/) |
| [Baccarat](packages/baccarat) | Exact enumeration | Wizard of Odds' outcome counts (exact match): banker 1.06%, player 1.24%, tie 14.36% at 8:1. | [site](https://casinogamessimulator.com/baccarat/odds/) |
| [Betting systems](packages/betting-systems) | Seeded simulation | Loss per unit wagered converges to the exact house edge (tested). | [site](https://casinogamessimulator.com/roulette/betting-systems/) |
| [Craps](packages/craps) | Combinatorial analysis | Pass 1.41% (7/495), don’t pass 1.36% (3/220), place 6/8 1.52%, field and props. | [site](https://casinogamessimulator.com/craps/odds/) |
| [Pai Gow Poker](packages/pai-gow) | Exact enumeration + seeded simulation | Hand counts match Wizard of Odds exactly; house edge 2.72% (95% CI 2.713–2.728%) vs. the published 2.7212%. | [site](https://casinogamessimulator.com/pai-gow/house-way/) |
| [Hold’em vs. Dealer](packages/holdem-vs-dealer) | Exact enumeration | House edge 2.185% of the ante with optimal play, element of risk 0.526%, trips paytables. | [site](https://casinogamessimulator.com/holdem-vs-dealer/strategy/) |
| [3-Card vs. Dealer](packages/three-card) | Exact enumeration | All 9 ante bonus and 16 pair plus paytables within 0.01 points; ante bonus 5/4/1 3.37%. | [site](https://casinogamessimulator.com/3-card-vs-dealer/strategy/) |

How each figure is produced, and what's approximated, is explained in detail on the site's
[methodology page](https://casinogamessimulator.com/methodology/).

## Use

The packages are TypeScript sources (Node 22+ runs them directly; bundlers like Vite import them as they are). They
aren't on npm yet: clone the repo, then

```bash
pnpm install
pnpm test
```

For example, the best hold for a video poker hand:

```ts
import { analyzeHand, getPaytable, MAX_COINS, parseCards, payouts } from '@cgs/video-poker';

const hand = parseCards('As Ks Qs Js 2h');
const [best] = analyzeHand(hand, payouts(getPaytable('jacks-or-better-9-6'), MAX_COINS));
console.log(best.hold, best.ev); // 15 (keep the first four cards), 92.7... coins per 5-coin bet
```

Each package's tests show the rest of its API, and `scripts/` holds the precomputations whose results ship as JSON.

## Games and names

"Hold'em vs. Dealer" and "3-Card vs. Dealer" follow the rules of two commercial casino games under generic names. Game
rules can't be owned, but those games' names are trademarks of their owners; this project isn't affiliated with or
endorsed by them.

## License

[MIT](LICENSE). You can use, change and share the engines, including commercially, as long as the copyright notice
stays with them. A link back to https://casinogamessimulator.com is appreciated.
