// Token Radar v4: the page. It trusts nothing it was handed: boot() re-runs RadarModel.buildRadar (01-model.js) on the raw
// snapshot rows in z-data.js, and integrity() compares the result, row by row and by seal, with the board main.ts wrote.
(function () {
  'use strict';
  var M = window.RadarModel, snap = window.RADAR_SNAPSHOT, A = M.ASSUME, radar, bySlug = {}, proto = {};
  var state = { tab: 'radar', q: '', cat: '', chain: '', verdict: '', tier: '', sort: 'rank', dir: 1, ticket: A.ticket, share: A.share, tbill: A.tbill, slug: null };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(x) { if (x === null) return '—'; var a = Math.abs(x), s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'K' : a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2); return (x < 0 ? '−$' : '$') + s; }
  function signed(x) { return (x > 0 ? '+' : '') + money(x); }
  function pct(x, d) { return (x * 100).toFixed(d || 0) + '%'; }
  function age(r) { return (r.age_days >= 365 ? (r.age_days / 365).toFixed(1) + ' y' : r.age_days + ' d') + (r.age_known ? '' : '*'); }
  function times(x) { return '×' + x.toFixed(2); }
  function table(head, rows, cls) { return '<table class="' + (cls || 't') + '"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + r.map(function (c, i) { return '<td' + (i ? ' class="n"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
  var TIER = { watch: 'watchlist', off: 'off-list', early: 'early' };

  /** integrity: six checks the page runs on itself against what main.ts wrote; each is [passed, text]. */
  function integrity() {
    var b = window.RADAR_BOARD, same = 0, sorted = true, n = radar.rows.length, w = radar.rows.filter(function (r) { return r.tier === 'watch'; }).length;
    radar.rows.forEach(function (r, i) { if (b[i] && b[i][0] === r.rank && b[i][1] === r.slug && b[i][2] === r.implied) same++; if (i && r.implied > radar.rows[i - 1].implied) sorted = false; });
    return [[same === n && b.length === n, 'this table = board.json: ' + same + ' of ' + b.length + ' rows recomputed here'], [radar.meta.seal === window.RADAR_SEAL, 'seal ' + radar.meta.seal + ' = main.ts'], [sorted, 'ranks 1–' + n + ' in order, values never rise'],
      [w === snap.watchlist.length, 'watchlist ' + w + ' of ' + snap.watchlist.length + ' ranked'], [radar.ledger.length === snap.protocols.length, 'ledger ' + radar.ledger.length + ' of ' + snap.protocols.length + ' protocols'],
      [radar.rows.every(function (r) { return r.plan.steps.length === 9; }), 'a costed, timed plan on every row']];
  }
  /** reprice: every plan again under the what-if ticket, drop share and T-bill; the ranking never moves. */
  function reprice() { radar.rows.forEach(function (r) { r.now = M.farmPlan(r, state.ticket, state.share, state.tbill); }); }
  function counts() { var c = { FARM: 0, THIN: 0, SKIP: 0 }; radar.rows.forEach(function (r) { c[r.now.verdict]++; }); return c; }

  // ---- The cover: KPIs, the formula, where all 758 protocols went, and the held-out evidence ----
  function renderSummary() {
    var v = radar.value, o = radar.odds, m = radar.meta, L = v.ladder, last = function (rows) { return rows.filter(function (r) { return r.kept !== 'tested, not kept'; }).pop(); };
    var vk = last(L), ok = last(o.ladder), rg = v.range, c = counts(), g = {}, total = radar.rows.reduce(function (a, r) { return a + r.implied; }, 0);
    radar.groups.forEach(function (x) { g[x.key] = x.n; });
    var best = radar.rows.slice().sort(function (a, b) { return b.now.per_hour - a.now.per_hour; }).slice(0, 3);
    var keptN = function (rows) { return rows.filter(function (r) { return r.kept === 'kept'; }).length + ' of ' + (rows.length - 1); };
    var k = [['Ranked, no token yet', m.ranked, g.watch + '/' + m.watchlist + ' watchlist · ' + g.off + ' off-list · ' + g.early + ' early, under ' + money(m.floor_usd)],
      ['Value miss, walk-forward', times(vk.wf.x) + ' <i>vs ' + times(L[0].wf.x) + ' flat</i>', 'older tokens price the newer; left out ' + times(vk.loo.x) + ' vs ' + times(L[0].loo.x)],
      ['Is the printed range honest?', pct(rg.in50 / rg.of) + ' · ' + pct(rg.in80 / rg.of), 'of ' + rg.of + ' newer caps inside P25–P75 · P10–P90 (stated 50% · 80%)'],
      ['Token odds vs base rate, Brier', ok.wf.brier.toFixed(3) + ' <i>vs ' + o.ladder[0].wf.brier.toFixed(3) + '</i>', 'walk-forward; ' + pct(ok.wf.hit) + ' of newer peers called right vs ' + pct(o.ladder[0].wf.hit)],
      ['Terms that survived every test', keptN(L) + ' · ' + keptN(o.ladder), 'value · odds; the rest are shown below, not used'],
      ['Worth farming, ' + money(state.ticket) + ' ticket', c.FARM + ' <i>of ' + m.ranked + '</i>', c.THIN + ' thin · ' + c.SKIP + ' skip · best ' + esc(best[0].name) + ' ' + signed(best[0].now.per_hour) + '/h']];
    var kpi = '<div class="kpi">' + k.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('') + '</div>';
    var formula = '<p class="formula"><code>impliedValue()</code> = <code>launchValue()</code> × <code>launchOdds()</code>. Launch value: ' + money(Math.exp(v.beta[0])) + ' at $100M TVL × ' + v.names.slice(1).map(function (n, i) { return 'exp(' + v.beta[i + 1] + ' × ' + esc(n) + ')'; }).join(' × ') + ', fitted on ' + m.comps + ' tokens that trade. Launch odds: of ' + m.peers + ' dated peers, the share like this one that gain a token within ' + A.horizon_y +
      ' years of its age. Rank is what the launch is worth; the verdict is what a ' + money(state.ticket) + ' ticket nets. The size curve\'s slope is ' + v.beta[1] + ', so a dollar in a big pool buys a thinner slice: the best farms are small (' + best.map(function (r) { return '<a href="#p=' + r.slug + '">' + esc(r.name) + '</a> ' + signed(r.now.per_hour) + '/h'; }).join(', ') + ').</p>';
    var bar = '<div class="panel"><h3>Protocol accounting <code>ledgerOf()</code> <em>all ' + m.protocols + ' snapshot protocols, each in exactly one group; implied on the board ' + money(total) + '</em></h3><div class="bar">' + radar.groups.map(function (x, i) { return '<i class="g' + i + '" style="flex:' + x.n + '"></i>'; }).join('') + '</div><div class="legend">' +
      radar.groups.map(function (x, i) { return '<span><i class="g' + i + '"></i>' + esc(x.label) + ' <b>' + x.n + '</b></span>'; }).join('') + '</div></div>';
    var mark = function (r) { return '<span class="' + (r.kept === 'kept' ? 'kept' : r.kept === 'baseline' ? 'mut' : 'not') + '">' + r.kept + '</span>'; };
    var ev = '<div class="panel ev"><h3>Out-of-sample evidence <code>valueLadder()</code> <code>oddsLadder()</code> <code>rangeOf()</code> <em>a term is kept only if both blind tests improve and its sign holds in 90% of ' + A.refits + ' bootstrap refits; ± is the s.e. across them</em></h3><div class="cols3"><div><h4>Value if a token launches · typical miss, ' + m.comps + ' traded tokens</h4>' +
      table(['term, added in order', 'left out', 'walk-fwd', 'sign holds', ''], L.map(function (r) { var x = [r.term, times(r.loo.x), times(r.wf.x), r.sign === null ? '' : pct(r.sign), mark(r)]; x.cls = r.kept === 'kept' ? 'on' : ''; return x; })) +
      '<p>Fitted: ' + v.names.map(function (n, i) { return esc(n) + ' ' + v.beta[i] + ' ± ' + v.se[i]; }).join(', ') + '. Within ×3 of the real cap: ' + pct(vk.loo.in3) + ' left out, ' + pct(vk.wf.in3) + ' newer.</p></div><div><h4>Token odds · Brier score (share called right), ' + m.peers + ' peers</h4>' +
      table(['term, added in order', 'ten-fold', 'walk-fwd', 'sign holds', ''], o.ladder.map(function (r) { var x = [r.term, r.fold.brier.toFixed(3) + ' (' + pct(r.fold.hit) + ')', r.wf.brier.toFixed(3) + ' (' + pct(r.wf.hit) + ')', r.sign === null ? '' : pct(r.sign), mark(r)]; x.cls = r.kept === 'kept' ? 'on' : ''; return x; })) +
      '<p>Fitted logit: ' + o.names.map(function (n, i) { return esc(n) + ' ' + o.b[i] + ' ± ' + o.se[i]; }).join(', ') + '.</p></div><div><h4>The record behind the odds</h4>' +
      table(['years listed', 'peers', 'record a token'], o.ages.map(function (a) { return [a.from + (a.to > 9 ? ' or more' : ' to ' + a.to), a.peers, pct(a.share)]; })) + scatter() +
      '<p>Reading it: a term that fails for value can still earn its place in the odds, which use ' + esc(o.names.slice(1).join(', ')) + '. The odds are the peers\' record (' + m.peers_with_token + ' of ' + m.peers + ' record a token), not a forecast: no row here says a token will launch.</p></div></div></div>';
    $('summary').innerHTML = kpi + formula + bar + ev;
  }
  /** scatter: market cap on TVL for the tokens that trade (amber) and value-if-launched for the board (teal), log axes. */
  function scatter() {
    var W = 300, H = 120, x = function (v) { return ((Math.log(v) - Math.log(4e6)) / Math.log(1e10 / 4e6)) * W; }, y = function (v) { return H - (clampLog(v) / Math.log(1e11 / 1e4)) * H; };
    function clampLog(v) { return Math.min(Math.max(Math.log(v) - Math.log(1e4), 0), Math.log(1e11 / 1e4)); }
    var dot = function (a, b, c) { return '<circle cx="' + x(a).toFixed(1) + '" cy="' + y(b).toFixed(1) + '" r="1.8" class="' + c + '"/>'; };
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="plot">' + radar.comps.map(function (c) { return dot(c.tvl_usd, c.mcap_usd, 'c'); }).join('') + radar.rows.map(function (r) { return dot(r.tvl_usd, r.value, 'b'); }).join('') +
      '<text x="2" y="10">cap $100B</text><text x="2" y="' + (H - 3) + '">$10K · TVL $4M</text><text x="' + (W - 2) + '" y="' + (H - 3) + '" text-anchor="end">TVL $10B</text></svg>';
  }

  // ---- The board: filter, sort, table ----
  var COLS = [['rank', '# · range'], ['name', 'Protocol'], ['tvl_usd', 'TVL'], ['change_7d', '7d'], ['age_days', 'No token for'], ['odds', 'Token odds'], ['value', 'If it launches'], ['implied', 'Implied value · P25–P75'], ['net', 'Verdict · net of fees'], ['per_hour', 'Net / hour'], ['play', 'Farm plan']];
  function key(r, k) { return k === 'net' ? r.now.net : k === 'per_hour' ? r.now.per_hour : k === 'play' ? r.now.play : r[k]; }
  function filtered() {
    var q = state.q.toLowerCase();
    return radar.rows.filter(function (r) {
      return (!q || (r.name + ' ' + r.slug + ' ' + r.category + ' ' + r.chain_list.join(' ')).toLowerCase().indexOf(q) >= 0) && (!state.cat || r.category === state.cat) && (!state.chain || r.chain_list.indexOf(state.chain) >= 0) && (!state.verdict || r.now.verdict === state.verdict) && (!state.tier || r.tier === state.tier);
    }).sort(function (a, b) { var x = key(a, state.sort), y = key(b, state.sort); return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * state.dir; });
  }
  function seg(id, field, opts) { $(id).innerHTML = opts.map(function (o) { return '<button data-f="' + field + '" data-v="' + o[0] + '"' + (String(state[field]) === String(o[0]) ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join(''); }
  function band(r) {
    var lo = Math.log(radar.rows[radar.rows.length - 1].p25 * r.odds), hi = Math.log(radar.rows[0].p75), f = function (v) { return clampPct(((Math.log(v) - lo) / (hi - lo)) * 100); };
    function clampPct(v) { return Math.max(0, Math.min(100, v)).toFixed(1); }
    return '<i class="band"><i style="left:' + f(r.p25 * r.odds) + '%;right:' + (100 - f(r.p75 * r.odds)) + '%"></i><u style="left:' + f(r.implied) + '%"></u></i>';
  }
  function renderBoard() {
    var rows = filtered(), c = counts(), n = radar.rows.length, t = {};
    radar.rows.forEach(function (r) { t[r.tier] = (t[r.tier] || 0) + 1; });
    seg('segV', 'verdict', [['', 'All ' + n], ['FARM', 'Farm ' + c.FARM], ['THIN', 'Thin ' + c.THIN], ['SKIP', 'Skip ' + c.SKIP]]);
    seg('segT', 'tier', [['', 'All tiers'], ['watch', 'Watchlist ' + t.watch], ['off', 'Off-list ' + t.off], ['early', 'Early ' + t.early]]);
    seg('segK', 'ticket', [[1000, '$1K'], [5000, '$5K'], [25000, '$25K']]); seg('segS', 'share', [[0.035, '3.5%'], [0.07, '7%'], [0.14, '14%']]); seg('segB', 'tbill', [[0, '0%'], [0.04, '4%'], [0.08, '8%']]);
    $('count').innerHTML = '<b>' + rows.length + '</b> of ' + n + ' rows · ' + money(rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0)) + ' TVL · ' + money(rows.reduce(function (a, r) { return a + r.implied; }, 0)) + ' implied' + (state.verdict || state.tier || state.cat || state.chain || state.q ? ' · <em>filtered</em>' : '') + (state.sort !== 'rank' ? ' · <em>sorted by ' + state.sort.replace('_', ' ') + (state.dir > 0 ? ', low to high' : ', high to low') + '</em>' : '');
    $('view').innerHTML = '<table class="board"><thead><tr>' + COLS.map(function (c, i) { return '<th data-sort="' + c[0] + '" class="' + (i > 1 && i < 10 ? 'n ' : '') + (state.sort === c[0] ? 'on' : '') + '">' + c[1] + (state.sort === c[0] ? (state.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        var p = r.now;
        return '<tr data-slug="' + r.slug + '"><td class="n"><b>' + r.rank + '</b><small>' + r.range[0] + '–' + r.range[1] + '</small></td><td><b>' + esc(r.name) + '</b> <em class="tier ' + r.tier + '">' + TIER[r.tier] + '</em><small>' + esc(r.category) + ' · ' + esc(p.chain) + (r.chains > 1 ? ' +' + (r.chains - 1) : '') + '</small></td><td class="n">' + money(r.tvl_usd) +
          '</td><td class="n ' + (r.change_7d > 0 ? 'up' : 'dn') + '">' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</td><td class="n">' + age(r) + '</td><td class="n">' + pct(r.odds) + '<i class="odds"><i style="width:' + pct(r.odds) + '"></i></i></td><td class="n">' + money(r.value) +
          '</td><td class="n"><b class="iv">' + money(r.implied) + '</b><small>' + money(r.p25 * r.odds) + '–' + money(r.p75 * r.odds) + '</small>' + band(r) + '</td><td class="n"><span class="v ' + p.verdict + '">' + p.verdict + '</span> <b class="' + (p.net > 0 ? 'up' : 'dn') + '">' + signed(p.net) + '</b><small>' + money(p.slice) + ' slice − ' + money(p.fees + p.carry) + ' costs</small></td><td class="n ' + (p.per_hour > 0 ? 'up' : 'dn') + '">' + signed(p.per_hour) +
          '</td><td>' + p.play + '<small>9 steps · ' + p.hours.toFixed(1) + ' h · ' + p.days + ' d · ' + (p.pays_from === null ? 'no ticket pays' : 'pays from ' + money(p.pays_from)) + '</small></td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---- Detail: how the figure is made, the peers that priced it, and the costed plan ----
  function renderDetail(r) {
    var v = radar.value, p = r.now, run = 1, n = radar.rows.length;
    var made = r.parts.map(function (x, i) { run *= x[2]; return [i ? esc(x[0]) + ' <small>this row ' + x[1] + ' × fitted ' + (v.beta[i] === undefined ? 'effect' : v.beta[i] + ' ± ' + v.se[i]) + '</small>' : 'Base <small>a token at $100M TVL, fitted on ' + radar.meta.comps + ' traded tokens</small>', i ? times(x[2]) : '', money(run)]; });
    var sum = function (a, b, c) { var x = [a, b, c]; x.cls = 'sum'; return x; };
    made.push(sum('= Value if a token launches <small>P25–P75 ' + money(r.p25) + '–' + money(r.p75) + ' · P10–P90 ' + money(r.p10) + '–' + money(r.p90) + ', from left-out misses</small>', '', money(r.value)));
    made.push(['Token odds <small>peers like it with a token by its age (' + age(r) + '): ' + pct(r.had) + '; by ' + A.horizon_y + ' years later: ' + pct(r.will) + '; so (' + pct(r.will) + ' − ' + pct(r.had) + ') ÷ (100% − ' + pct(r.had) + ')' + (r.age_known ? '' : '; undated, snapshot median age used') + '</small>', '×' + r.odds.toFixed(2), '']);
    made.push(sum('= Implied value <small>recomputed in this browser; board.json has ' + money(window.RADAR_BOARD[r.rank - 1][2]) + ' at rank ' + r.rank + '</small>', '', money(r.implied)));
    var peers = radar.comps.slice().sort(function (a, b) { return (a.category === r.category ? 0 : 9) + Math.abs(Math.log(a.tvl_usd / r.tvl_usd)) - (b.category === r.category ? 0 : 9) - Math.abs(Math.log(b.tvl_usd / r.tvl_usd)); }).slice(0, 6);
    var grid = [0.035, 0.07, 0.14].map(function (s) { return [pct(s, 1)].concat([1000, 5000, 25000].map(function (t) { var q = M.farmPlan(r, t, s, state.tbill); return '<span class="' + (q.net > 0 ? 'up' : 'dn') + (t === state.ticket && s === state.share ? ' cell' : '') + '">' + signed(q.net) + '</span>'; })); });
    var steps = p.steps.map(function (s, i) { var m = /^([^(:]+) \(([^,]+), ([^)]+)\): (.*)$/.exec(s); return m ? [i + 1, '<b>' + m[1] + '.</b> ' + esc(m[4]), m[3], m[2]] : sum(i + 1, esc(s), ''); });
    $('detail').innerHTML = '<a class="back" href="#radar">← Board</a><div class="dhead"><div><small>#' + r.rank + ' of ' + n + ' by implied value · rank ' + r.range[0] + '–' + r.range[1] + ' across ' + A.refits + ' bootstrap refits</small><h2>' + esc(r.name) + ' <em class="tier ' + r.tier + '">' + TIER[r.tier] + '</em> <span class="v ' + p.verdict + '">' + p.verdict + '</span></h2><p>' + esc(r.category) + ' · ' + esc(r.chain_list.slice(0, 4).join(', ')) + (r.chains > 4 ? ' +' + (r.chains - 4) : '') + ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + (r.change_7d === null ? '—' : r.change_7d.toFixed(1) + '%') + ' · ' + age(r) + ' on record with no token</p></div>' +
      '<div class="big"><small>implied value · a model estimate</small><b>' + money(r.implied) + '</b><small>if it launches ' + money(r.value) + ' × token odds ' + pct(r.odds) + '</small></div></div><div class="cols2"><section><div class="panel"><h3>How the figure is made <code>impliedValue()</code></h3>' + table(['step', 'multiple', 'running'], made, 't made') + '</div>' +
      '<div class="panel"><h3>Nearest priced peers · their tokens trade</h3>' + table(['token of', 'category', 'TVL', 'market cap', 'cap / TVL', 'the fit said'], peers.map(function (c) { return [esc(c.name) + (c.n > 1 ? ' <small>' + c.n + ' listings, one token</small>' : ''), esc(c.category), money(c.tvl_usd), money(c.mcap_usd), times(c.mcap_usd / c.tvl_usd), money(c.fitted)]; })) + '</div>' +
      '<div class="panel"><h3>Net by drop share × ticket <em>T-bill ' + pct(state.tbill) + '</em></h3>' + table(['share to depositors', '$1K', '$5K', '$25K'], grid) + '<p>Slice = implied value × share × ticket ÷ (TVL + ticket). Benchmarks: the same ' + money(p.ticket) + ' in a T-bill for ' + p.days + ' days earns ' + money(p.carry) + '; fees are covered above a share of ' + pct((p.fees + p.carry) / (p.slice / state.share), 1) + '.</p></div></section>' +
      '<section><div class="panel"><h3>Farm plan: ' + esc(p.play) + ' on ' + esc(p.chain) + ' · ' + money(p.ticket) + ' for ' + p.days + ' days <code>farmPlan()</code></h3><div class="tiles">' + [['ticket', money(p.ticket)], ['fees', money(p.fees)], ['T-bill forgone', money(p.carry)], ['slice', money(p.slice)], ['net', signed(p.net)], ['hands-on', p.hours.toFixed(1) + ' h'], ['net / hour', signed(p.per_hour)], ['pays from', money(p.pays_from)]].map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div>' +
      table(['#', 'step', 'cost', 'time'], steps, 't steps') + '</div><p class="note">Every figure is this radar\'s estimate from one DefiLlama snapshot (' + radar.meta.as_of + '), not a forecast and not financial advice. "Records no token" is DefiLlama\'s record, not proof that none exists.</p></section></div>';
  }

  // ---- The other tabs ----
  function renderTokens() {
    $('count').innerHTML = '<b>' + radar.comps.length + '</b> tokens that already trade with a market cap, one row per token: the value fit\'s evidence, never ranked';
    $('view').innerHTML = table(['Token of', 'Category', 'Listings', 'TVL', 'Market cap', 'Cap / TVL', 'The fit said', 'Off by'], radar.comps.map(function (c) { return [esc(c.name), esc(c.category), c.n, money(c.tvl_usd), money(c.mcap_usd), times(c.mcap_usd / c.tvl_usd), money(c.fitted), times(Math.exp(Math.abs(Math.log(c.mcap_usd / c.fitted))))]; }), 'board');
  }
  function renderLedger() {
    var q = state.q.toLowerCase(), label = {}, rows = radar.ledger.filter(function (l) { return !q || (proto[l.slug].name + ' ' + l.slug).toLowerCase().indexOf(q) >= 0; });
    radar.groups.forEach(function (g) { label[g.key] = g.label; });
    $('count').innerHTML = '<b>' + rows.length + '</b> of ' + radar.ledger.length + ' snapshot protocols, each with the one group it landed in';
    $('view').innerHTML = table(['Protocol', 'Category', 'TVL', 'Token', 'Group'], rows.map(function (l) { var p = proto[l.slug]; return [esc(p.name), esc(p.category || '—'), money(p.tvl_usd), esc(p.symbol || p.gecko_id || '—'), esc(label[l.group]) + (bySlug[l.slug] ? ' · #' + bySlug[l.slug].rank : '')]; }), 'board');
  }
  function csv() {
    var rows = [['rank', 'rank_low', 'rank_high', 'slug', 'name', 'tier', 'tvl_usd', 'value_if_launched_usd', 'launch_odds', 'implied_value_usd', 'verdict', 'net_usd', 'net_per_hour_usd']].concat(filtered().map(function (r) { return [r.rank, r.range[0], r.range[1], r.slug, '"' + r.name.replace(/"/g, '""') + '"', r.tier, r.tvl_usd, r.value, r.odds, r.implied, r.now.verdict, r.now.net, r.now.per_hour]; }));
    var a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n')); a.download = 'token-radar.csv'; a.click();
  }

  function render() {
    var d = state.slug && bySlug[state.slug];
    reprice();
    document.querySelectorAll('#tabs a').forEach(function (a) { a.className = a.getAttribute('href') === '#' + state.tab ? 'on' : ''; });
    $('checks').innerHTML = integrity().map(function (c) { return '<span class="' + (c[0] ? 'ok' : 'bad') + '">' + (c[0] ? '✓ ' : '✗ ') + esc(c[1]) + '</span>'; }).join('');
    $('detail').hidden = !d; $('board').hidden = !!d; $('filters').hidden = state.tab !== 'radar';
    if (d) return renderDetail(d);
    renderSummary();
    ({ radar: renderBoard, tokens: renderTokens, ledger: renderLedger })[state.tab]();
  }
  /** The address is the state: #radar, #tokens, #ledger, #p=slug, #f=verdict:FARM;tier:early;sort:per_hour */
  function route() {
    var h = decodeURIComponent(location.hash.slice(1)) || 'radar';
    state.slug = null;
    if (h.indexOf('p=') === 0) state.slug = h.slice(2);
    else if (h.indexOf('f=') === 0) { state.tab = 'radar'; h.slice(2).split(';').forEach(function (kv) { var i = kv.indexOf(':'), k = kv.slice(0, i), v = kv.slice(i + 1); if (k === 'sort') { state.sort = v; state.dir = v === 'rank' || v === 'name' ? 1 : -1; } else if (k in state) state[k] = typeof state[k] === 'number' ? +v : v; }); }
    else if (h === 'radar' || h === 'tokens' || h === 'ledger') state.tab = h;
    $('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain;
    render(); window.scrollTo(0, 0);
  }
  function boot() {
    radar = M.buildRadar(snap);
    snap.protocols.forEach(function (p) { proto[p.slug] = p; });
    radar.rows.forEach(function (r) { bySlug[r.slug] = r; });
    var cats = {}, chains = {}, opt = function (id, vals) { $(id).innerHTML += vals.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join(''); };
    radar.rows.forEach(function (r) { cats[r.category] = 1; r.chain_list.forEach(function (c) { chains[c] = 1; }); });
    opt('cat', Object.keys(cats).sort()); opt('chain', Object.keys(chains).sort());
    $('sub').textContent = 'DefiLlama snapshot ' + radar.meta.as_of + ' · ' + radar.meta.protocols + ' protocols · one model file prices board.json and this page, refitted here';
    ['q', 'cat', 'chain'].forEach(function (id) { $(id).addEventListener('input', function () { state[id] = $(id).value; render(); }); });
    $('reset').addEventListener('click', function () { location.hash = 'f=q:;cat:;chain:;verdict:;tier:;sort:rank;ticket:' + A.ticket + ';share:' + A.share + ';tbill:' + A.tbill; });
    $('csv').addEventListener('click', csv);
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-f]'), th = e.target.closest('th[data-sort]'), tr = e.target.closest('tr[data-slug]');
      if (b) { var f = b.getAttribute('data-f'), v = b.getAttribute('data-v'); state[f] = typeof state[f] === 'number' ? +v : v; render(); }
      else if (th) { var k = th.getAttribute('data-sort'); state.dir = state.sort === k ? -state.dir : k === 'rank' || k === 'name' || k === 'play' ? 1 : -1; state.sort = k; render(); }
      else if (tr && !e.target.closest('a')) location.hash = 'p=' + tr.getAttribute('data-slug');
    });
    window.addEventListener('hashchange', route);
    route();
  }
  boot();
})();
