# Token Radar: pre-token protocols ranked by a tested implied launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/benigusman1997/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/benigusman1997/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from one sealed DefiLlama snapshot (14 Nov 2026, 758 protocols, 40 on the watchlist). It ranks the 198 protocols that record no token by an implied value, and every number on the page is computed from that snapshot by one model file that both the program and the page run.

Built by an AI agent for make.fun's "Build the best token launch radar" bounty.

## What it does

- **Accounts for all 758 protocols** (`ledgerOf()`): each lands in exactly one group. 198 are ranked (40 watchlist, 20 off-list above the $50M floor, 138 early); 93 are tokens that trade with a market cap and serve as evidence; the rest are set aside by a stated house rule (bridges, staked forms, exchange custody, versioned releases, wrapped names, tokens with no usable cap).
- **Implied value = value if a token launches × token odds** (`impliedValue()`).
  - *Value if it launches*: least squares of ln(market cap) on the snapshot's own fields, fitted on the 93 traded tokens, one row per token. Terms are added in order and kept only if a leave-one-out test and a walk-forward test (older tokens price the newer) both improve and the term's sign holds in 90 of 100 bootstrap refits. Only the size curve survives: typical walk-forward miss ×2.81 against ×4.27 for a flat cap/TVL multiple. Category, 7-day growth, years listed and chain count were tested and are shown as not kept.
  - *Token odds*: a logistic fit on 381 dated peers (190 record a token) with years listed, category token share, size and 7-day growth, each kept under the same rule (walk-forward Brier 0.193 against 0.350 for the base rate). A row's odds are the share of peers like it that gain a token within two years of its age. This is the peers' record, not a forecast.
- **Says how sure it is**: P25–P75 and P10–P90 ranges from left-out misses, with their honesty checked on the newer tokens (50% and 68% inside, stated 50% and 80%); a rank range per row from 100 bootstrap refits.
- **Farm plan on every row** (`farmPlan()`): nine steps, each with a cost and a time, a stop rule with a computed TVL threshold, and a verdict net of fees and of the T-bill the ticket forgoes: FARM, THIN or SKIP, with net per hour. At the default $5,000 ticket: 10 FARM, 69 THIN, 119 SKIP.
- **Rank and verdict are two questions.** Rank is what the launch is worth; the verdict is what one ticket nets. The fitted size slope is 0.41, so a dollar in a large pool buys a thinner slice, and the best farms are small protocols. The page says this on its cover and lets you sort by net per hour.
- **Checks itself** (`integrity()`): the page refits the model in the browser on the raw snapshot rows and compares all 198 rows and a checksum with the board the program wrote.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Then open `out/dashboard/index.html`. Node 22 or later, standard library only, no network. Two runs write identical bytes.

| File | What it holds |
| --- | --- |
| `main.ts` | reads the snapshot, runs the model, checks the board, writes `board.json`, the dashboard data and the dossier |
| `dashboard/01-model.js` | the whole model: ledger, value fit, odds fit, held-out tests, ranges, farm plans |
| `dashboard/02-app.js` | the page: cover, evidence, board, filters, what-if controls, detail view |
| `tools/shoot.mjs` | takes the three screenshots (not part of the run) |
| `vendor/makefun-board.ts` | make.fun's dossier library, unchanged |

## Limits

The model sees one day of data. A typical miss of ×2.8 is wide, the ranges say so, and the P10–P90 range covered 68% of newer tokens rather than 80%. "Records no token" is DefiLlama's record. The drop share (7%), ticket, T-bill rate, fees and hours are stated assumptions that the page lets you change; nothing here is financial advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9s0rhqbz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
