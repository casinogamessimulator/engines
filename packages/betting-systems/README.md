# Betting systems engine

Martingale, Paroli, Fibonacci, D’Alembert and Labouchère, and a seeded session simulator on roulette or baccarat.

- **Method:** Seeded simulation
- **Checked against:** Loss per unit wagered converges to the exact house edge (tested).
- **Used by:** [Betting systems on Casino Games Simulator](https://casinogamessimulator.com/roulette/betting-systems/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
