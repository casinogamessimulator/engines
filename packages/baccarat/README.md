# Baccarat engine

Punto banco drawing rules, shoe, and exact outcome counts over every ordered six-card draw for 1, 6 and 8 decks.

- **Method:** Exact enumeration
- **Checked against:** Wizard of Odds' outcome counts (exact match): banker 1.06%, player 1.24%, tie 14.36% at 8:1.
- **Used by:** [Baccarat on Casino Games Simulator](https://casinogamessimulator.com/baccarat/odds/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
