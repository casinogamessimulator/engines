# Pai Gow Poker engine

53-card evaluator with the joker, all 21 ways to set a hand, the Foxwoods house way, an EV-based setter, and round settlement.

- **Method:** Exact enumeration + seeded simulation
- **Checked against:** Hand counts match Wizard of Odds exactly; house edge 2.72% (95% CI 2.713–2.728%) vs. the published 2.7212%.
- **Used by:** [Pai Gow Poker on Casino Games Simulator](https://casinogamessimulator.com/pai-gow/house-way/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
