# Hold’em vs. Dealer engine

7-card evaluator, round engine, exact EV of every decision on each street, starting-hand table and the trips side bet.

- **Method:** Exact enumeration
- **Checked against:** House edge 2.185% of the ante with optimal play, element of risk 0.526%, trips paytables.
- **Used by:** [Hold’em vs. Dealer on Casino Games Simulator](https://casinogamessimulator.com/holdem-vs-dealer/strategy/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
