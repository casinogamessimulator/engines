# Blackjack engine

Configurable rules, shoe and game engine, finite-deck dealer probabilities, the EV of every action, the basic strategy chart and house edge for any rule set, and card counting: the seven common systems as data, running and true counts, a shoe composition at any true count (so the analyzer prices every play exactly at that count), and the Illustrious 18 and Fab 4 index plays.

- **Method:** Combinatorial analysis
- **Checked against:** Wizard of Odds' house edge calculator for 22 rule sets (within 0.005 points), dealer bust tables and strategy charts; card counting tags and the Illustrious 18 and Fab 4 indices as published (Schlesinger, Wong).
- **Used by:** [Blackjack on Casino Games Simulator](https://casinogamessimulator.com/blackjack/strategy/)

Run `pnpm test` here for the checks, and see `scripts/` for the precomputations whose results ship as JSON in `src/`.
