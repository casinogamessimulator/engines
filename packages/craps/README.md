# Craps engine

Table state machine, every standard bet, and each bet as a small Markov chain for the exact edge per bet and per roll.

- **Method:** Combinatorial analysis
- **Checked against:** Pass 1.41% (7/495), don’t pass 1.36% (3/220), place 6/8 1.52%, field and props.
- **Used by:** [Craps on Casino Games Simulator](https://casinogamessimulator.com/craps/odds/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
