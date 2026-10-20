# 3-Card vs. Dealer engine

3-card evaluator, round engine, and every player hand against every dealer hand (407,170,400 deals), including the queen-6-4 rule.

- **Method:** Exact enumeration
- **Checked against:** All 9 ante bonus and 16 pair plus paytables within 0.01 points; ante bonus 5/4/1 3.37%.
- **Used by:** [3-Card vs. Dealer on Casino Games Simulator](https://casinogamessimulator.com/3-card-vs-dealer/strategy/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
