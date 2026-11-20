# Token Radar — pre-token protocols ranked by implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/benigusman1997/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/benigusman1997/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from a sealed DefiLlama snapshot (14 Nov 2026): 758 protocols, 40 on the watchlist. The board ranks 226 pre-token protocols by an implied launch value derived only from the snapshot's own figures — TVL, seven-day growth, time running with no token, and chain spread — calibrated per category against the live-token protocols that already trade (their median market-cap-to-TVL multiple). Every row carries a concrete farm plan with costs and times. The dashboard is a static page (no network): sortable board, filters, a detail view per protocol with the full model breakdown, and a live-token comps view.

Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

Then open `out/dashboard/index.html`. Node 22 or later, standard library only. The program runs twice with identical output.

## How the value is built

```
multiple[category] = median(market cap / TVL) of that category's live-token protocols
base      = TVL x multiple[category]          (global median as fallback)
growth    = 1 + clamp(change_7d, -60, 120)% x 0.5
maturity  = 0.6 + min(age_days, 1095) / 1095 x 0.4
chains    = 1 + 0.05 x min(chains - 1, 4)
implied   = TVL x multiple x growth x maturity x chains
```

No protocol name is ever special-cased. The implied value is this entry's own claim, never a prediction that a token will be issued or what it will be worth.

---

<sub>Entered on [make.fun](https://make.fun/?ref=9s0rhqbz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
