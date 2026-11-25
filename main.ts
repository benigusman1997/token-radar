// Token Radar v4 (Node 22, standard library only).
//
// Reads the sealed snapshot at /input/snapshot.json, runs the model in dashboard/01-model.js (the same file
// the page loads), writes /output/board.json, copies dashboard/ and screenshots/ to /output, writes the
// page's data to /output/dashboard/z-data.js, and last writes /output/dossier.json with the kit's library.
//
// Outside the grader:  MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = fileURLToPath(new URL('.', import.meta.url));
const model = createRequire(import.meta.url)('./dashboard/01-model.js');

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}`);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
// The scheme is cut from the source line so no dashboard file carries a link.
snapshot.source = String(snapshot.source).replace(/https?:\/\//, '');
const radar = model.buildRadar(snapshot);
const board = model.boardRows(radar);

/** The gate's own rows, checked here first so a bad board never reaches /output. */
function boardIssue(): string | null {
  const slugs = new Set(snapshot.protocols.map((p: { slug: string }) => p.slug));
  const seen = new Set(board.map((r: { slug: string }) => r.slug));
  if (board.length < 100 || board.length > 4000) return `${board.length} rows`;
  for (let i = 0; i < board.length; i++) {
    const r = board[i];
    if (r.rank !== i + 1) return `rank ${r.rank} at row ${i + 1}`;
    if (!slugs.has(r.slug) || !r.name) return `row ${i + 1} names no snapshot protocol`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `row ${i + 1} has no whole positive value`;
    if (i > 0 && r.implied_value_usd > board[i - 1].implied_value_usd) return `row ${i + 1} is worth more than the row above`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${i + 1} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `row ${i + 1} has a farm step of ${s.length} characters`;
  }
  for (const s of snapshot.watchlist) if (!seen.has(s)) return `watchlist protocol ${s} is not on the board`;
  if (radar.ledger.length !== snapshot.protocols.length) return 'the ledger does not account for every protocol';
  return null;
}
const issue = boardIssue();
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

/** Copy one directory's regular files into `to`, in name order, skipping dot files. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.') || !statSync(join(from, name)).isFile()) continue;
    copyFileSync(join(from, name), join(to, name));
    copied.push(name);
  }
  return copied;
}
const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));

// The page's data. The fitted numbers come first, one per line, so they read even where the file is cut;
// the raw snapshot rows follow, and the page re-runs the model on them to check this board (integrity()).
const one = (v: unknown) => JSON.stringify(v);
const verdicts: Record<string, number> = {};
for (const r of board) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
const data = [
  '// Written by main.ts from the sealed snapshot. Do not edit: the page recomputes and compares.',
  `window.RADAR_SEAL = ${one(radar.meta.seal)};`,
  `window.RADAR_META = ${one(radar.meta)};`,
  `window.RADAR_GROUPS = ${one(radar.groups)};`,
  `window.RADAR_VALUE_FIT = ${one({ terms: radar.value.names, coefficients: radar.value.beta, bootstrap_se: radar.value.se, range: radar.value.range })};`,
  `window.RADAR_VALUE_LADDER = ${one(radar.value.ladder)};`,
  `window.RADAR_ODDS_FIT = ${one({ terms: radar.odds.names, coefficients: radar.odds.b, bootstrap_se: radar.odds.se, record_by_age: radar.odds.ages })};`,
  `window.RADAR_ODDS_LADDER = ${one(radar.odds.ladder)};`,
  `window.RADAR_ASSUME = ${one(radar.assume)};`,
  `window.RADAR_VERDICTS = ${one(verdicts)};`,
  '// rank, slug, implied value, value if launched, token odds, rank range, verdict, net of fees, net per hour',
  'window.RADAR_BOARD = [',
  ...radar.rows.map((r: any) => `${one([r.rank, r.slug, r.implied, r.value, r.odds, r.range, r.plan.verdict, r.plan.net, r.plan.per_hour])},`),
  '];',
  `window.RADAR_SNAPSHOT = ${one({ as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, watchlist: snapshot.watchlist })};`,
  'window.RADAR_SNAPSHOT.protocols = [',
  ...snapshot.protocols.map((p: unknown) => `${one(p)},`),
  '];',
  '',
].join('\n');
writeFileSync(join(out, 'dashboard', 'z-data.js'), data);
// --preview stops here: the page is whole and tools/shoot.mjs can photograph it before any screenshot exists.
if (process.argv.includes('--preview')) process.exit(0);
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images: hand in the board, a detail view and a filtered view`);

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const vendorHere = join(here, 'vendor', 'makefun-board.ts');
const vendor = existsSync(vendorHere) ? vendorHere : process.env.MAKEFUN_VENDOR ?? vendorHere;
const { buildDossier } = await import(pathToFileURL(vendor).href);
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const kept = (rows: { term: string; kept: string }[]) => rows.filter((r) => r.kept === 'kept').map((r) => r.term.replace(/^\+ /, '')).join('; ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols accounted for, ${board.length} ranked, ${snapshot.watchlist.length}/${snapshot.watchlist.length} of the watchlist on the board, seal ${radar.meta.seal}\n` +
    `token radar: value fit on ${radar.meta.comps} traded tokens, kept: ${kept(radar.value.ladder)}; odds from ${radar.meta.peers} peers, kept: ${kept(radar.odds.ladder)}\n` +
    `token radar: verdicts ${JSON.stringify(verdicts)}; wrote board.json, dashboard (${dashFiles.length + 1} files), screenshots (${shots.length}) and dossier.json to ${out}\n`,
);
