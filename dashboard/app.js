// Token Radar dashboard: renders window.RADAR (written by main.ts from the sealed snapshot).
// No network, no fetch: every byte the page shows comes from data.js beside it.
// Views are hash-routed so each state has its own address:
//   #/                 the board
//   #detail/<slug>     one protocol's detail view and farm plan
//   #filter=cat:<c>&chain:<c>&q:<text>&watch:1   a filtered board

const D = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(v);
}
function pct(v) {
  if (v === null || v === undefined) return '<span class="flat">—</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}
function age(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 365) return (v / 365).toFixed(1) + 'y';
  return v + 'd';
}
function barWidth(v, max) {
  return Math.max(4, Math.round((Math.log10(Math.max(v, 1)) / Math.log10(Math.max(max, 2))) * 100));
}

const watchSlugs = new Set(D.watchlist || []);
const maxImplied = D.rows.length ? D.rows[0].implied_value_usd : 1;

const state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1 };

function fillSelects() {
  const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  for (const c of cats) $('cat').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`);
  for (const c of chains) $('chain').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`);
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  let rows = D.rows.filter((r) => {
    if (state.watch && !watchSlugs.has(r.slug)) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    return true;
  });
  const k = state.sort;
  rows = [...rows].sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const d = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return d * state.dir;
  });
  return rows;
}

function renderBoard() {
  const rows = filtered();
  $('count').textContent = `${rows.length} of ${D.rows.length} protocols`;
  $('rows').innerHTML = rows.map((r) => `
    <tr data-slug="${esc(r.slug)}">
      <td>${r.rank}</td>
      <td><span class="name">${esc(r.name)}${watchSlugs.has(r.slug) ? ' <span class="tag watch">WATCHLIST</span>' : ''}<small>${esc(r.slug)}</small></span></td>
      <td><span class="tag">${esc(r.category || '—')}</span></td>
      <td>${esc(r.chains.slice(0, 2).join(', '))}${r.chains.length > 2 ? ` +${r.chains.length - 2}` : ''}</td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num">${pct(r.change_7d)}</td>
      <td class="num">${age(r.age_days)}</td>
      <td><span class="val">${money(r.implied_value_usd)}</span><span class="bar"><i style="width:${barWidth(r.implied_value_usd, maxImplied)}%"></i></span></td>
    </tr>`).join('');
  document.querySelectorAll('#board th[data-sort]').forEach((th) => th.classList.toggle('on', th.dataset.sort === state.sort));
}

function renderStats() {
  const top10 = D.rows.slice(0, 10).reduce((s, r) => s + r.implied_value_usd, 0);
  $('asof').textContent = 'SNAPSHOT ' + D.as_of;
  $('source').textContent = D.source + '.';
  $('stats').innerHTML = `
    <div class="stat"><b>${D.watchlist_size}</b><span>Watchlist protocols</span></div>
    <div class="stat"><b>${D.board_size}</b><span>Board rows</span></div>
    <div class="stat"><b>${D.early_size}</b><span>Early finds below floor</span></div>
    <div class="stat"><b>${money(top10)}</b><span>Top 10 implied value</span></div>`;
}

function renderMultiples() {
  $('mult-rows').innerHTML = D.multiples.map((m) => `
    <tr><td>${esc(m.category)}</td><td class="num"><b>${m.multiple.toFixed(3)}×</b></td><td class="num">${m.comps}</td><td>${m.fallback ? 'Global median (too few comps)' : 'Category median'}</td></tr>`).join('') +
    `<tr><td><b>Global median</b></td><td class="num"><b>${D.global_multiple.toFixed(3)}×</b></td><td class="num">—</td><td>All live-token protocols</td></tr>`;
}

function renderLive() {
  $('live-rows').innerHTML = D.live.map((p) => `
    <tr><td><span class="name">${esc(p.name)}<small>${esc(p.slug)}</small></span></td>
    <td><span class="tag">${esc(p.category || '—')}</span></td>
    <td class="num">${money(p.tvl_usd)}</td><td class="num">${money(p.mcap_usd)}</td>
    <td class="num"><b>${p.multiple === null ? '—' : p.multiple.toFixed(2) + '×'}</b></td></tr>`).join('');
}

function stepParts(s) {
  const m = s.match(/^(.*?)\s*Cost:\s*(.*?)\s*Time:\s*(.*?)\.?$/);
  if (!m) return { text: s, cost: '', time: '' };
  return { text: m[1], cost: m[2], time: m[3] };
}

function openDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (!r) return;
  const comps = (D.comps.find((c) => c.category === r.category) || { top: [] }).top;
  const multRow = D.multiples.find((m) => m.category === (r.category || 'Uncategorised'));
  const multLabel = multRow && multRow.fallback ? 'global median — too few comps in category' : (r.category || 'Uncategorised') + ' median';
  const base = r.tvl_usd * r.base_multiple;
  $('detail').innerHTML = `
    <button class="close" id="close" aria-label="Close">×</button>
    <p class="eyebrow">RANK #${r.rank} ${watchSlugs.has(r.slug) ? '· WATCHLIST' : ''}</p>
    <h2>${esc(r.name)}</h2>
    <div class="meta">
      <span class="tag">${esc(r.category || '—')}</span>
      ${r.chains.map((c) => `<span class="tag">${esc(c)}</span>`).join('')}
      <span class="tag">No token recorded</span>
    </div>
    <div class="kv">
      <div><b>${money(r.implied_value_usd)}</b><span>Implied value</span></div>
      <div><b>${money(r.tvl_usd)}</b><span>TVL</span></div>
      <div><b>${r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}</b><span>TVL change, 7d</span></div>
      <div><b>${age(r.age_days)}</b><span>Tracked, no token</span></div>
    </div>
    <div class="model"><h3>How the value is built</h3><table><tbody>
      <tr><td>Base — TVL × ${r.base_multiple.toFixed(3)}× (${esc(multLabel)})</td><td>${money(base)}</td></tr>
      <tr><td>Growth — 7d change × 0.5</td><td>× ${r.growth_multiplier.toFixed(2)}</td></tr>
      <tr><td>Maturity — ${r.age_days === null ? 'age unknown' : r.age_days + ' days'} with no token</td><td>× ${r.maturity_multiplier.toFixed(2)}</td></tr>
      <tr><td>Reach — ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}</td><td>× ${r.chains_multiplier.toFixed(2)}</td></tr>
      <tr><td><b>Implied value</b></td><td><b>${money(r.implied_value_usd)}</b></td></tr>
    </tbody></table></div>
    <div class="farm"><h3>Farm plan — seven steps</h3><ol>
      ${r.farm_steps.map((s) => { const p = stepParts(s); return `<li><b>${esc(p.text)}</b><br><span class="cost">Cost: ${esc(p.cost)} · Time: ${esc(p.time)}</span></li>`; }).join('')}
    </ol></div>
    ${comps.length ? `<div class="model"><h3>Same-category comps that set the multiple</h3><table><tbody>
      ${comps.map((p) => `<tr><td>${esc(p.name)}</td><td>${money(p.mcap_usd)} / ${money(p.tvl_usd)}</td><td><b>${p.multiple === null ? '—' : p.multiple.toFixed(2) + '×'}</b></td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <p class="foot-note">Listed ${esc(r.listed_at || 'date unknown')} · Snapshot ${esc(D.as_of)} · Implied value is this radar's own claim, not a prediction.</p>`;
  $('overlay').hidden = false;
  $('close').onclick = closeDetail;
  document.body.style.overflow = 'hidden';
}
function closeDetail() {
  $('overlay').hidden = true;
  document.body.style.overflow = '';
  if (location.hash.startsWith('#detail/')) history.replaceState(null, '', '#/');
}

function applyHash() {
  const h = location.hash || '#/';
  if (h.startsWith('#detail/')) { openDetail(decodeURIComponent(h.slice(8))); return; }
  if (h.startsWith('#filter=')) {
    for (const part of h.slice(8).split('&')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const k = part.slice(0, i), v = decodeURIComponent(part.slice(i + 1));
      if (k === 'cat') state.cat = v;
      else if (k === 'chain') state.chain = v;
      else if (k === 'q') state.q = v;
      else if (k === 'watch') state.watch = v === '1';
    }
    $('cat').value = state.cat; $('chain').value = state.chain;
    $('q').value = state.q; $('watch').checked = state.watch;
  }
  renderBoard();
}

function bind() {
  $('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
  $('cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
  $('chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
  $('watch').addEventListener('change', (e) => { state.watch = e.target.checked; renderBoard(); });
  document.querySelectorAll('#board th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
    renderBoard();
  }));
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) { history.replaceState(null, '', '#detail/' + encodeURIComponent(tr.dataset.slug)); openDetail(tr.dataset.slug); }
  });
  $('overlay').addEventListener('click', (e) => { if (e.target === $('overlay')) closeDetail(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });
  window.addEventListener('hashchange', applyHash);
}

fillSelects();
renderStats();
renderMultiples();
renderLive();
bind();
applyHash();
document.querySelector('main').setAttribute('aria-busy', 'false');
