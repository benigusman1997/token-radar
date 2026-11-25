// Photograph the dashboard for screenshots/: the board, a protocol's detail view, a filtered view.
// Not part of the entry's run (main.ts needs no browser). Usage, after `node main.ts --preview --output out`:
//   node tools/shoot.mjs <out dir> <path to playwright-core>
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve(process.argv[2] ?? 'out');
const { chromium } = createRequire(import.meta.url)(resolve(process.argv[3] ?? 'node_modules/playwright-core'));
const page0 = pathToFileURL(join(out, 'dashboard', 'index.html')).href;
// The detail shot shows the best-ranked row the model says to farm, read from the board the program wrote.
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
const pick = board.find((r) => r.verdict === 'FARM') ?? board[0];
const shots = [
  ['1-board.jpg', '#radar'],
  ['2-detail.jpg', `#p=${pick.slug}`],
  ['3-filtered.jpg', '#f=verdict:FARM;sort:per_hour'],
];
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
for (const [name, hash] of shots) {
  await page.goto('about:blank');
  await page.goto(page0 + hash);
  await page.waitForSelector(hash.startsWith('#p=') ? '#detail table' : '#view table');
  await page.screenshot({ path: join('screenshots', name), type: 'jpeg', quality: 82 });
  console.log(name, hash, '|', await page.evaluate(() => document.getElementById('count').textContent), '| checks:', await page.evaluate(() => [...document.querySelectorAll('#checks span')].map((c) => c.textContent.trim()).join(' ; ')));
}
await browser.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
