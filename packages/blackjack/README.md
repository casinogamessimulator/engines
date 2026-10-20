# Blackjack engine

Configurable rules, shoe and game engine, finite-deck dealer probabilities, the EV of every action, the basic strategy chart and house edge for any rule set.

- **Method:** Combinatorial analysis
- **Checked against:** Wizard of Odds' house edge calculator for 22 rule sets (within 0.005 points), dealer bust tables and strategy charts.
- **Used by:** [Blackjack on Casino Games Simulator](https://casinogamessimulator.com/blackjack/strategy/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
