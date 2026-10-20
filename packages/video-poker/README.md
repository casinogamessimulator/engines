# Video poker engine

Hand evaluator, paytables, best-hold analyzer for any 5 cards, exact returns and hand frequencies for every paytable, and Easy/Best strategy charts scored over all 2,598,960 deals.

- **Method:** Exact enumeration
- **Checked against:** Wizard of Odds' returns for 5 paytables, to 6 decimals.
- **Used by:** [Video poker on Casino Games Simulator](https://casinogamessimulator.com/video-poker/strategy/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
