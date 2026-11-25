// Token Radar v4: the whole model, one file. main.ts runs it under Node to write board.json; the page runs the
// same bytes on the raw snapshot rows and checks it gets the same board (integrity() in 02-app.js).
// impliedValue = launchValue (what the token is worth if it launches) x launchOdds (peers' record by age).
// No protocol is named here: every coefficient is fitted from the snapshot at run time and tested held-out.
(function (root, make) {
  var M = make();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.RadarModel = M;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- Assumptions: the only numbers not fitted from the snapshot. The page prints them and lets you move three. ----
  var ASSUME = {
    ticket: 5000, // dollars deposited by the plan (what-if: 1,000 / 5,000 / 25,000)
    share: 0.07, // share of a new token's value handed to depositors, pro rata (what-if: 3.5% / 7% / 14%)
    tbill: 0.04, // yearly yield the same dollars would earn doing nothing (what-if: 0 / 4% / 8%)
    hour_usd: 25, // what an hour of the farmer's work must return before a plan is called FARM
    weeks: 12, // how long the plan holds
    horizon_y: 2, // launch odds: a token within this many years
    bridge_usd: 1.5,
    gas_usd: { Ethereum: 4, Bitcoin: 3, Tron: 1.2, Binance: 0.15, Avalanche: 0.1, Arbitrum: 0.08, Base: 0.05, 'OP Mainnet': 0.05, 'Hyperliquid L1': 0.05, Solana: 0.02, Polygon: 0.02, Sui: 0.02, Aptos: 0.02 },
    gas_default: 0.25,
    stop: 0.3, // leave early if TVL falls this far
    refits: 100, // bootstrap refits behind every rank range and standard error
  };
  // The house watchlist's own rules (input/README.md): these are products of another asset, not launches to come.
  var OUT = { Bridge: 'bridge', 'Canonical Bridge': 'bridge', 'Liquid Staking': 'staked', 'Liquid Restaking': 'staked', 'Restaked BTC': 'staked', CEX: 'exchange' };
  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  var PRODUCT = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
  var GROUPS = [['watch', 'Ranked · watchlist'], ['off', 'Ranked · off-list, above the floor'], ['early', 'Ranked · early, below the floor'], ['comp', 'Token trades · priced comp'], ['token', 'Token recorded · no usable cap'],
    ['bridge', 'Out · bridge'], ['staked', 'Out · staked form of a token'], ['exchange', 'Out · exchange custody'], ['version', 'Out · versioned release'], ['wrapped', 'Out · wrapped or staked by name']];

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function num(a, b) { return a - b; }
  function quant(sorted, q) { return sorted[clamp(Math.round(q * (sorted.length - 1)), 0, sorted.length - 1)]; }
  function median(xs) { return quant(xs.slice().sort(num), 0.5); }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function tokenOf(p) { return p.gecko_id || p.symbol; }
  function ageDays(p, asOf) { return p.listed_at ? Math.max(1, Math.round((Date.parse(asOf) - Date.parse(p.listed_at)) / 864e5)) : null; }
  /** Solve A x = b by Gaussian elimination with pivoting. */
  function solve(A, b) {
    var n = b.length, m = A.map(function (r, i) { return r.concat([b[i]]); }), c, r, j;
    for (c = 0; c < n; c++) {
      var best = c;
      for (r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[best][c])) best = r;
      var t = m[c]; m[c] = m[best]; m[best] = t;
      for (r = 0; r < n; r++) if (r !== c) { var f = m[r][c] / m[c][c]; for (j = c; j <= n; j++) m[r][j] -= f * m[c][j]; }
    }
    return m.map(function (row, i) { return row[n] / row[i]; });
  }

  // ---- 1. The ledger: every snapshot protocol lands in exactly one group ----
  /** The group of one protocol: ranked (by tier), a token that trades, or left out by a house rule. */
  function groupOf(p, watch, floor, priced) {
    if (watch[p.slug]) return 'watch';
    var out = OUT[p.category] || (EXCHANGE.test(p.name) ? 'exchange' : PRODUCT.test(p.name) ? 'wrapped' : null);
    if (tokenOf(p)) return !out && priced[tokenOf(p)] ? 'comp' : 'token';
    return out || (VERSIONED.test(p.name) ? 'version' : p.tvl_usd >= floor ? 'off' : 'early');
  }
  /** One unit of evidence: a pre-token protocol, or one token with every stand-alone protocol that records it. */
  function unitOf(key, members, asOf, medAge) {
    var tvl = 0, g = 0, age = null, chains = {}, big = members[0], cap = 0;
    members.forEach(function (p) {
      tvl += p.tvl_usd; g += p.tvl_usd * clamp(p.change_7d === null ? 0 : p.change_7d, -50, 100) / 100;
      var a = ageDays(p, asOf); if (a !== null && (age === null || a > age)) age = a;
      p.chains.forEach(function (c) { chains[c] = 1; });
      if (p.tvl_usd > big.tvl_usd) big = p;
      if (p.mcap_usd > cap) cap = p.mcap_usd;
    });
    return { key: key, slug: big.slug, name: big.name, category: big.category || 'none', tvl: tvl, growth: g / tvl, age: age === null ? medAge : age, dated: age !== null, listed: age === null ? '' : String(1e7 - age), chains: Math.max(1, Object.keys(chains).length), chain_list: Object.keys(chains).sort(), cap: cap, y: tokenOf(big) ? 1 : 0, n: members.length };
  }
  /** ledgerOf: group all protocols, build the candidates, the token units and the priced comps. */
  function ledgerOf(snapshot) {
    var asOf = snapshot.as_of, all = snapshot.protocols.slice().sort(function (a, b) { return a.slug < b.slug ? -1 : 1; }), watch = {}, byToken = {}, priced = {};
    snapshot.watchlist.forEach(function (s) { watch[s] = 1; });
    var medAge = median(all.filter(function (p) { return p.listed_at; }).map(function (p) { return ageDays(p, asOf); }));
    all.forEach(function (p) {
      if (!tokenOf(p) || OUT[p.category] || EXCHANGE.test(p.name) || PRODUCT.test(p.name)) return;
      (byToken[tokenOf(p)] = byToken[tokenOf(p)] || []).push(p);
    });
    var tokens = Object.keys(byToken).sort().map(function (k) { return unitOf('token:' + k, byToken[k], asOf, medAge); });
    tokens.forEach(function (u) { if (u.cap > 0) priced[u.key.slice(6)] = 1; });
    var ledger = [], cands = [];
    all.forEach(function (p) {
      var g = groupOf(p, watch, snapshot.floor_usd, priced);
      ledger.push({ slug: p.slug, group: g });
      if (g === 'watch' || g === 'off' || g === 'early') { var u = unitOf(p.slug, [p], asOf, medAge); u.tier = g; u.change_7d = p.change_7d; cands.push(u); }
    });
    return { ledger: ledger, cands: cands, tokens: tokens, comps: tokens.filter(function (u) { return u.cap > 0; }) };
  }

  // ---- 2. launchValue: what a protocol's token is worth once it trades, fitted on the tokens that do ----
  var VALUE_TERMS = [['size', 'size curve, ln TVL'], ['cat', 'category effect, shrunk'], ['growth', '7-day TVL growth'], ['age', 'years listed, ln'], ['chains', 'chain count, ln']];
  var ODDS_TERMS = [['age', 'years listed, ln'], ['cat', 'category token share, shrunk'], ['size', 'size, ln TVL'], ['growth', '7-day TVL growth'], ['chains', 'chain count, ln']];
  var SHRINK = 8; // pseudo-observations pulling a category's effect or share toward the field's
  function xOf(u, T, share, age) {
    var x = [1];
    if (T.size) x.push(Math.log(u.tvl / 1e8));
    if (T.growth) x.push(u.growth);
    if (T.age) x.push(Math.log(1 + (age === undefined ? u.age : age) / 365));
    if (T.chains) x.push(Math.log(u.chains));
    if (T.cat && share) x.push(share(u));
    return x;
  }
  function namesOf(T, cat) { return ['base'].concat(T.size ? ['ln(TVL / $100M)'] : [], T.growth ? ['7-day growth'] : [], T.age ? ['ln(1 + years listed)'] : [], T.chains ? ['ln chains'] : [], T.cat && cat ? [cat] : []); }
  /** Least squares of ln(cap) on the kept terms; with no size term the slope on TVL is held at 1 (a flat multiple). */
  function fitValue(train, T) {
    var X = train.map(function (u) { return xOf(u, T); }), k = X[0].length, A = [], g = [], i, j, cat = {};
    var y = train.map(function (u) { return Math.log(u.cap) - (T.size ? 0 : Math.log(u.tvl)); });
    for (i = 0; i < k; i++) { A.push([]); g.push(0); for (j = 0; j < k; j++) A[i].push(i === j ? 1e-9 : 0); }
    X.forEach(function (x, r) { for (i = 0; i < k; i++) { g[i] += x[i] * y[r]; for (j = 0; j < k; j++) A[i][j] += x[i] * x[j]; } });
    var beta = solve(A, g);
    if (T.cat) {
      var sum = {}, n = {};
      train.forEach(function (u, r) { sum[u.category] = (sum[u.category] || 0) + y[r] - dot(X[r], beta); n[u.category] = (n[u.category] || 0) + 1; });
      Object.keys(sum).sort().forEach(function (c) { cat[c] = sum[c] / (n[c] + SHRINK); });
    }
    return { T: T, beta: beta, cat: cat, ln: function (u) { return dot(xOf(u, T), beta) + (T.size ? 0 : Math.log(u.tvl)) + (cat[u.category] || 0); } };
  }
  /** Older 60% of the dated units fit, the newer 40% are priced: never the other way round. */
  function walk(units) {
    var d = units.filter(function (u) { return u.dated; }).sort(function (a, b) { return b.age - a.age || (a.key < b.key ? -1 : 1); }), cut = Math.floor(d.length * 0.6);
    return { train: d.slice(0, cut), test: d.slice(cut) };
  }
  /** Typical miss as a multiple (x2 = half or double the real cap) and the share priced within x3. */
  function missOf(res) { var a = res.map(Math.abs).sort(num); return { x: r4(Math.exp(quant(a, 0.5))), in3: r4(a.filter(function (v) { return v <= Math.log(3); }).length / a.length) }; }
  function leaveOut(units, T) { return units.map(function (u, i) { return Math.log(u.cap) - fitValue(units.filter(function (_, j) { return j !== i; }), T).ln(u); }); }
  /** holdOut: the two blind tests of a value model. Each token is priced by a fit that never saw it. */
  function holdOut(comps, T) {
    var w = walk(comps), m = fitValue(w.train, T);
    return { loo: missOf(leaveOut(comps, T)), wf: missOf(w.test.map(function (u) { return Math.log(u.cap) - m.ln(u); })) };
  }
  /** steady: the share of 100 seeded bootstrap refits in which a term's coefficient keeps the sign of the full fit. */
  function steady(units, T, key, fit) {
    var order = ['size', 'growth', 'age', 'chains', 'cat'].filter(function (k) { return T[k]; }), at = 1 + order.indexOf(key), co = function (m) { return (m.beta || m.b)[at]; };
    var seed = 977, rand = function () { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; }, full = co(fit(units, T)), same = 0;
    if (full === undefined) return null;
    for (var b = 0; b < ASSUME.refits; b++) if (co(fit(units.map(function () { return units[Math.floor(rand() * units.length)]; }), T)) * full > 0) same++;
    return r4(same / ASSUME.refits);
  }
  /** valueLadder: add one term at a time; it stays only if both blind misses fall by 1% or more and its sign holds in 90% of refits. */
  function valueLadder(comps) {
    var T = {}, base = holdOut(comps, T), rows = [{ term: 'flat cap/TVL multiple', loo: base.loo, wf: base.wf, sign: null, kept: 'baseline' }];
    VALUE_TERMS.forEach(function (t) {
      var T2 = Object.assign({}, T); T2[t[0]] = true;
      var h = holdOut(comps, T2), sign = t[0] === 'cat' ? null : steady(comps, T2, t[0], fitValue), kept = h.loo.x < base.loo.x * 0.99 && h.wf.x < base.wf.x * 0.99 && (sign === null || sign >= 0.9);
      rows.push({ term: '+ ' + t[1], loo: h.loo, wf: h.wf, sign: sign, kept: kept ? 'kept' : 'tested, not kept' });
      if (kept) { T = T2; base = h; }
    });
    return { T: T, rows: rows };
  }
  /** rangeOf: the printed P25-P75 and P10-P90 come from leave-one-out misses; their honesty is checked on the newer tokens. */
  function rangeOf(comps, T) {
    var q = function (res) { var s = res.slice().sort(num); return [quant(s, 0.1), quant(s, 0.25), quant(s, 0.75), quant(s, 0.9)]; };
    var w = walk(comps), m = fitValue(w.train, T), old = q(leaveOut(w.train, T)), in50 = 0, in80 = 0;
    w.test.forEach(function (u) { var e = Math.log(u.cap) - m.ln(u); if (e >= old[1] && e <= old[2]) in50++; if (e >= old[0] && e <= old[3]) in80++; });
    return { q: q(leaveOut(comps, T)).map(r4), in50: in50, in80: in80, of: w.test.length };
  }

  // ---- 3. launchOdds: the peers' record of who has a token by what age ----
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }
  /** A category's share of peers with a token, pulled toward the field's rate; a row never counts itself. */
  function shareOf(train) {
    var s = {}, yes = 0, own = new Set(train);
    train.forEach(function (u) { var c = s[u.category] || (s[u.category] = [0, 0]); c[0] += u.y; c[1]++; yes += u.y; });
    var base = yes / train.length;
    return function (u) { var c = s[u.category] || [0, 0], o = own.has(u) ? 1 : 0; return (c[0] - o * u.y + SHRINK * base) / (c[1] - o + SHRINK); };
  }
  /** Logistic fit of "records a token" on the kept terms, by Newton steps with a light ridge. */
  function fitOdds(train, T) {
    var share = shareOf(train), X = train.map(function (u) { return xOf(u, T, share); }), k = X[0].length, b = X[0].map(function () { return 0; }), i, j;
    for (var it = 0; it < 25; it++) {
      var A = [], g = [];
      for (i = 0; i < k; i++) { A.push([]); g.push(i ? -1e-3 * b[i] : 0); for (j = 0; j < k; j++) A[i].push(i === j ? 1e-3 : 0); }
      X.forEach(function (x, r) { var q = sigmoid(dot(x, b)), e = train[r].y - q, w = q * (1 - q); for (i = 0; i < k; i++) { g[i] += e * x[i]; for (j = 0; j < k; j++) A[i][j] += w * x[i] * x[j]; } });
      solve(A, g).forEach(function (d, n) { b[n] += d; });
    }
    return { T: T, b: b, p: function (u, age) { return sigmoid(dot(xOf(u, T, share, age), b)); } };
  }
  /** Brier score (0 is perfect) and the share called right at 50%, on peers the fit never saw. */
  function scoreOdds(fit, test) {
    var sq = 0, hit = 0;
    test.forEach(function (u) { var q = fit.p(u); sq += (q - u.y) * (q - u.y); if ((q >= 0.5 ? 1 : 0) === u.y) hit++; });
    return { brier: sq / test.length, hit: hit / test.length, n: test.length };
  }
  function oddsHoldOut(peers, T) {
    var sq = 0, hit = 0, f, w = walk(peers);
    for (f = 0; f < 10; f++) {
      var s = scoreOdds(fitOdds(peers.filter(function (_, i) { return i % 10 !== f; }), T), peers.filter(function (_, i) { return i % 10 === f; }));
      sq += s.brier * s.n; hit += s.hit * s.n;
    }
    var wf = scoreOdds(fitOdds(w.train, T), w.test);
    return { fold: { brier: r4(sq / peers.length), hit: r4(hit / peers.length) }, wf: { brier: r4(wf.brier), hit: r4(wf.hit) } };
  }
  /** oddsLadder: a term stays only if the ten-fold and the walk-forward Brier scores both fall and its sign holds in 90% of refits. */
  function oddsLadder(peers) {
    var T = {}, base = oddsHoldOut(peers, T), rows = [{ term: 'base rate of peers', fold: base.fold, wf: base.wf, sign: null, kept: 'baseline' }];
    ODDS_TERMS.forEach(function (t) {
      var T2 = Object.assign({}, T); T2[t[0]] = true;
      var h = oddsHoldOut(peers, T2), sign = steady(peers, T2, t[0], fitOdds), kept = h.fold.brier < base.fold.brier * 0.995 && h.wf.brier < base.wf.brier * 0.995 && sign >= 0.9;
      rows.push({ term: '+ ' + t[1], fold: h.fold, wf: h.wf, sign: sign, kept: kept ? 'kept' : 'tested, not kept' });
      if (kept) { T = T2; base = h; }
    });
    return { T: T, rows: rows };
  }
  /** launchOdds: of peers like this one with no token at its age, the share that record one within the horizon.
   *  (F(age + horizon) - F(age)) / (1 - F(age)): it falls as a protocol goes on with no token. */
  function launchOdds(fit, u) {
    var now = fit.p(u), then = fit.p(u, u.age + ASSUME.horizon_y * 365);
    return { now: now, then: then, odds: fit.T.age ? clamp((then - now) / (1 - now), 0.01, 0.95) : now };
  }
  /** impliedValue = launchValue x launchOdds, for one candidate under one pair of fits. */
  function impliedValue(value, odds, u) { return Math.exp(value.ln(u)) * launchOdds(odds, u).odds; }

  /** rankRange: refit both models on resampled evidence; each row's 5th-95th percentile rank and each coefficient's s.e. */
  function rankRange(L, VT, OT) {
    var seed = 20261114, rand = function () { seed = (seed + 0x6d2b79f5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    var pick = function (xs) { return xs.map(function () { return xs[Math.floor(rand() * xs.length)]; }); };
    var ranks = L.cands.map(function () { return []; }), coef = [];
    for (var b = 0; b < ASSUME.refits; b++) {
      var v = fitValue(pick(L.comps), VT), o = fitOdds(pick(L.peers), OT);
      L.cands.map(function (u, i) { return [impliedValue(v, o, u), i]; }).sort(function (x, y) { return y[0] - x[0] || x[1] - y[1]; }).forEach(function (x, r) { ranks[x[1]].push(r + 1); });
      coef.push(v.beta.concat(o.b));
    }
    var se = coef[0].map(function (_, c) { var m = 0, s = 0; coef.forEach(function (r) { m += r[c] / coef.length; }); coef.forEach(function (r) { s += (r[c] - m) * (r[c] - m); }); return r4(Math.sqrt(s / (coef.length - 1))); });
    return { ranks: ranks.map(function (r) { r.sort(num); return [quant(r, 0.05), quant(r, 0.95)]; }), se: se };
  }

  // ---- 4. farmPlan: costed, timed steps for one ticket, netted against fees and the T-bill the dollars forgo ----
  // [label, how to enter, weekly upkeep, on-chain transactions a week, the risk that ends the farm early]
  var PLAY = {
    Lending: ['Supply and borrow', 'supply a blue-chip asset and borrow no more than 25% against it', 'check the health factor and repay if the borrow passes 35%', 0, 'the health factor nears 1.5'],
    Dexs: ['Liquidity and swaps', 'add liquidity to the deepest stable pair', 'make one small swap through its own router and check the pool range', 1, 'impermanent loss passes 2%'],
    Derivatives: ['Margin and volume', 'deposit margin and open a small hedged position', 'roll the hedged position once and keep margin above three times the requirement', 1, 'funding paid passes 1% of the ticket'],
    'Risk Curators': ['Curated vault', 'deposit into the curator\'s largest vault', 'read the vault\'s allocation and log the balance', 0, 'the vault takes a bad-debt mark or pauses withdrawals'],
    'Onchain Capital Allocator': ['Allocator vault', 'deposit into its largest strategy vault', 'read the strategy report and log the balance', 0, 'the strategy reports a loss or pauses withdrawals'],
    RWA: ['Tokenised asset', 'pass the identity check, then mint or buy its token and hold it in your own wallet', 'check the price against the stated net asset value', 0, 'the token trades more than 1% under its net asset value'],
    'Basis Trading': ['Yield-bearing dollar', 'mint or buy its yield-bearing token and hold it', 'check the peg and the funding it earns', 0, 'the peg slips more than 1% or funding turns negative for a week'],
    CDP: ['Mint against collateral', 'open a vault and mint its stablecoin at twice the minimum collateral ratio', 'check the collateral ratio and top up if it nears 1.5 times the minimum', 0, 'the stablecoin slips more than 1% off its peg'],
    Yield: ['Yield vault', 'deposit the asset its main vault names', 'log the balance and any points shown', 0, 'the vault pauses withdrawals or its yield source changes'],
    _: ['Core product', 'make one deposit into its core product', 'make one small follow-up action and log it', 1, 'withdrawals are paused or the team says a snapshot was already taken'],
  };
  PLAY['Yield Aggregator'] = PLAY['Liquidity Manager'] = PLAY.Yield;
  function gasOf(chain) { var g = ASSUME.gas_usd[chain]; return g === undefined ? ASSUME.gas_default : g; }
  function usd(x) { var a = Math.abs(x), s = a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2); return (x < 0 ? '-$' : '$') + s; }
  /** farmPlan: fees, hours, the ticket's slice of the launch, the net, a verdict, and the steps. Pure: the page re-prices it for other tickets. */
  function farmPlan(r, ticket, share, tbill) {
    var chain = r.chain_list[0] || 'Ethereum', A = ASSUME, W = A.weeks, days = W * 7, play = PLAY[r.category] || PLAY._;
    r.chain_list.forEach(function (c) { if (gasOf(c) < gasOf(chain)) chain = c; });
    var gas = gasOf(chain), fund = gas + (chain === 'Ethereum' ? 0 : A.bridge_usd), upkeep = play[3] * W * gas;
    var fees = fund + 2 * gas + upkeep + gas + 2 * gas, hours = (10 + 15 + 10 + 15 + 5 * W + 5 + 10 + 10) / 60;
    var slice = (r.implied * share * ticket) / (r.tvl_usd + ticket), carry = (ticket * tbill * days) / 365, net = slice - fees - carry;
    var edge = (r.implied * share) / r.tvl_usd - (tbill * days) / 365; // net per dollar deposited, before fees
    var up = function (x) { return Math.ceil(x / 50) * 50; };
    var paysFrom = edge > 0 ? up(fees / edge) : null, farmFrom = edge > 0 ? up((fees + A.hour_usd * hours) / edge) : null;
    var verdict = net > 0 && net / hours >= A.hour_usd ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
    var floorTvl = r.tvl_usd * (1 - A.stop);
    var steps = [
      'Setup (10 min, $0): make a fresh wallet on ' + chain + ' used for this farm only, and keep its seed phrase on paper.',
      'Verify (15 min, $0): open ' + r.name + ' from its DefiLlama listing, never from an ad or a reply; check its contracts and audits, that it still records no token, and whether it shows a points page.',
      'Fund (10 min, ' + usd(fund) + '): send ' + usd(ticket) + ' of stablecoin and gas money to ' + chain + ', the cheapest of its ' + r.chains + ' chain' + (r.chains === 1 ? '' : 's') + ' (about ' + usd(gas) + ' a transaction).',
      'Enter (15 min, ' + usd(2 * gas) + ' for approve + deposit): ' + play[1] + ', starting with a $100 test.',
      'Upkeep (5 min a week for ' + W + ' weeks, ' + usd(upkeep) + '): ' + play[2] + '; programmes tend to score time held and active weeks.',
      'Stop rule (5 min, $0): leave early if ' + play[4] + ', if TVL falls under ' + usd(floorTvl) + ' (-' + A.stop * 100 + '% from ' + usd(r.tvl_usd) + '), or if a token is announced with nothing for depositors.',
      'Claim (10 min, ' + usd(gas) + '): if a token launches, claim only on ' + r.name + '\'s own site and never pay to claim; at the implied ' + usd(r.implied) + ' this ticket\'s slice is about ' + usd(slice) + '.',
      'Exit (10 min, ' + usd(2 * gas) + ' for withdraw + revoke): after ' + days + ' days or at the claim, withdraw, revoke the approvals and send the funds back.',
      'Budget: slice ' + usd(slice) + ' - fees ' + usd(fees) + ' - T-bill forgone ' + usd(carry) + ' = net ' + usd(net) + ' for ' + hours.toFixed(1) + ' h of work, ' + usd(net / hours) + ' an hour: ' + verdict + (paysFrom === null ? '. No ticket size pays: the slice per dollar is under the T-bill.' : '. Pays from a ' + usd(paysFrom) + ' ticket, clears $' + A.hour_usd + ' an hour from ' + usd(farmFrom) + '.'),
    ];
    return { play: play[0], chain: chain, gas: gas, ticket: ticket, days: days, fees: r4(fees), hours: r4(hours), slice: r4(slice), carry: r4(carry), net: r4(net), per_hour: r4(net / hours), pays_from: paysFrom, farm_from: farmFrom, verdict: verdict, steps: steps };
  }

  // ---- 5. buildRadar: fit, test, price, rank, and account for every protocol ----
  function buildRadar(snapshot) {
    var L = ledgerOf(snapshot);
    L.peers = L.cands.concat(L.tokens).filter(function (u) { return u.dated; }).sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    var vl = valueLadder(L.comps), ol = oddsLadder(L.peers), value = fitValue(L.comps, vl.T), odds = fitOdds(L.peers, ol.T), range = rangeOf(L.comps, vl.T);
    var boot = rankRange(L, vl.T, ol.T), vNames = namesOf(vl.T), oNames = namesOf(ol.T, 'category token share');
    var rows = L.cands.map(function (u, i) {
      var ln = value.ln(u), o = launchOdds(odds, u), x = xOf(u, vl.T), e = function (q) { return Math.round(Math.exp(ln + q)); };
      return { slug: u.slug, name: u.name, category: u.category, tier: u.tier, tvl_usd: u.tvl, change_7d: u.change_7d, chains: u.chains, chain_list: u.chain_list, age_days: u.age, age_known: u.dated,
        parts: x.map(function (v, n) { return [vNames[n], r4(v), Math.exp(v * value.beta[n])]; }).concat(vl.T.cat ? [['category ' + u.category, 1, Math.exp(value.cat[u.category] || 0)]] : []),
        value: e(0), p10: e(range.q[0]), p25: e(range.q[1]), p75: e(range.q[2]), p90: e(range.q[3]), had: r4(o.now), will: r4(o.then), odds: r4(o.odds), implied: Math.max(1, Math.round(Math.exp(ln) * o.odds)), range: boot.ranks[i] };
    });
    rows.sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank = i + 1; r.plan = farmPlan(r, ASSUME.ticket, ASSUME.share, ASSUME.tbill); });
    var count = {}; L.ledger.forEach(function (l) { count[l.group] = (count[l.group] || 0) + 1; });
    var ages = [[0, 1], [1, 2], [2, 3], [3, 99]].map(function (b) { var p = L.peers.filter(function (u) { return u.age / 365 >= b[0] && u.age / 365 < b[1]; }); return { from: b[0], to: b[1], peers: p.length, share: r4(p.filter(function (u) { return u.y; }).length / p.length) }; });
    return {
      meta: { as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, protocols: L.ledger.length, watchlist: snapshot.watchlist.length, ranked: rows.length, comps: L.comps.length, peers: L.peers.length, peers_with_token: L.peers.filter(function (u) { return u.y; }).length, seal: seal(rows) },
      groups: GROUPS.map(function (g) { return { key: g[0], label: g[1], n: count[g[0]] || 0 }; }), ledger: L.ledger,
      value: { names: vNames, beta: value.beta.map(r4), se: boot.se.slice(0, value.beta.length), cat: value.cat, ladder: vl.rows, range: range },
      odds: { names: oNames, b: odds.b.map(r4), se: boot.se.slice(value.beta.length), ladder: ol.rows, ages: ages },
      assume: ASSUME, rows: rows,
      comps: L.comps.map(function (u) { return { name: u.name, category: u.category, tvl_usd: u.tvl, mcap_usd: u.cap, n: u.n, fitted: Math.round(Math.exp(value.ln(u))) }; }).sort(function (a, b) { return b.mcap_usd - a.mcap_usd; }),
    };
  }
  /** seal: one checksum over every rank, slug and implied value, so the page can prove it redrew main.ts's board. */
  function seal(rows) {
    var h = 0x811c9dc5, s = rows.map(function (r) { return r.rank + r.slug + r.implied; }).join('|');
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16);
  }
  /** board.json's rows: what the gate reads, plus the figures behind each value. */
  function boardRows(radar) {
    return radar.rows.map(function (r) {
      return { rank: r.rank, slug: r.slug, name: r.name, implied_value_usd: r.implied, value_if_launched_usd: r.value, p25_usd: r.p25, p75_usd: r.p75, launch_odds: r.odds, rank_low: r.range[0], rank_high: r.range[1], tier: r.tier,
        verdict: r.plan.verdict, net_usd: r.plan.net, net_per_hour_usd: r.plan.per_hour, pays_from_usd: r.plan.pays_from, farm_steps: r.plan.steps };
    });
  }

  return { ASSUME: ASSUME, buildRadar: buildRadar, boardRows: boardRows, farmPlan: farmPlan, seal: seal, usd: usd };
});
