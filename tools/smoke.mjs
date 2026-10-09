// Headless smoke test: loads index.html from file:// in Chromium at an iPhone viewport,
// fails on any console error, drives touch + keyboard input, and screenshots the scene.
//
//   cd tools && npm install && node smoke.mjs
//
// jsdelivr may be unreachable from CI sandboxes, so the exact pinned three.js build is
// served from node_modules for the importmap URL (same file the CDN serves).
import { chromium, devices } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(here, 'out');
mkdirSync(outDir, { recursive: true });

const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const cdnUrl = html.match(/"three":\s*"([^"]+)"/)[1];
const threeVersion = cdnUrl.match(/three@([\d.]+)/)[1];
const localThree = readFileSync(path.join(here, 'node_modules/three/build/three.module.js'));
const localPkg = JSON.parse(readFileSync(path.join(here, 'node_modules/three/package.json'), 'utf8'));
if (localPkg.version !== threeVersion) throw new Error(`tools three ${localPkg.version} != pinned ${threeVersion}`);

const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL', m); };
const ok = (m) => console.log('  ok  ', m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const { defaultBrowserType, ...iphone } = devices['iPhone 13'];
const context = await browser.newContext({ ...iphone });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
await context.route(cdnUrl, (route) => route.fulfill({
  status: 200, body: localThree,
  headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' },
}));

const query = process.argv.includes('--debug') ? '?debug&seed=12345' : '?seed=12345';
const url = pathToFileURL(path.join(root, 'index.html')).href + query;
console.log('Loading', url, `(viewport ${iphone.viewport.width}x${iphone.viewport.height}, three ${threeVersion})`);
await page.goto(url);
await page.waitForFunction(() => window.__pedro && window.__pedro.ready, null, { timeout: 15000 });
await sleep(500);
const snap = () => page.evaluate(() => window.__pedro.snapshot());
await page.screenshot({ path: path.join(outDir, '1-title.png') });

const cdp = await context.newCDPSession(page);
const W = iphone.viewport.width, H = iphone.viewport.height;
async function swipe(dx) {
  const x0 = W / 2, y0 = H * 0.6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 5, y: y0 }] });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tap(x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// --- Start via tap ---
let s = await snap();
s.state === 'title' ? ok('title screen shown') : fail('expected title, got ' + s.state);
await tap(W / 2, H / 2);
await sleep(300);
s = await snap();
s.state === 'play' ? ok('tap starts the run') : fail('tap did not start run: ' + s.state);
const startLane = s.lane;

// --- Tap right half / left half ---
await tap(W * 0.8, H * 0.6); await sleep(250);
s = await snap();
s.lane === startLane + 1 ? ok(`tap right: lane ${startLane} -> ${s.lane}`) : fail(`tap right: expected ${startLane + 1}, got ${s.lane}`);
await tap(W * 0.2, H * 0.6); await sleep(250);
s = await snap();
s.lane === startLane ? ok(`tap left: lane -> ${s.lane}`) : fail(`tap left: expected ${startLane}, got ${s.lane}`);

// --- Swipes ---
await swipe(120); await sleep(250);
s = await snap();
s.lane === startLane + 1 ? ok(`swipe right: lane -> ${s.lane}`) : fail(`swipe right: expected ${startLane + 1}, got ${s.lane}`);
await swipe(-120); await sleep(250);
s = await snap();
s.lane === startLane ? ok(`swipe left: lane -> ${s.lane}`) : fail(`swipe left: expected ${startLane}, got ${s.lane}`);

// --- Keyboard + input buffering (second press during tween is queued) ---
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await sleep(500);
s = await snap();
s.lane === startLane + 2 ? ok(`keyboard ArrowRight x2 (buffered): lane -> ${s.lane}`) : fail(`buffered keys: expected ${startLane + 2}, got ${s.lane}`);
await page.keyboard.press('a'); await sleep(250);
s = await snap();
s.lane === startLane + 1 ? ok(`keyboard A: lane -> ${s.lane}`) : fail(`key A: expected ${startLane + 1}, got ${s.lane}`);
// Clamp at road edge
for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowLeft'); await sleep(200); }
s = await snap();
s.lane === 0 ? ok('lane clamps at left edge') : fail('edge clamp: lane ' + s.lane);
!s.tweening && Math.abs(s.x - (-5.4)) < 0.01 ? ok('tween settles exactly on lane center') : fail('tween did not settle: x=' + s.x);

// --- Rendering ---
await sleep(1500);
const probe = await page.evaluate(() => window.__pedro.renderProbe());
probe.opaque > 60 && probe.distinctColors > 8
  ? ok(`scene renders (${probe.w}x${probe.h} buffer, ${probe.opaque}/144 opaque samples, ${probe.distinctColors} colors)`)
  : fail('scene looks blank: ' + JSON.stringify(probe));
s = await snap();
s.mph > 70 && s.miles > 0 ? ok(`speed rising: ${s.mph.toFixed(1)} mph at ${s.miles.toFixed(3)} mi`) : fail('no forward progress');

// --- Traffic spawns, collision ends the run, game over, restart ---
{
  let t = Date.now(), sawTraffic = false;
  while (Date.now() - t < 8000) { s = await snap(); if (s.liveHazards > 0) { sawTraffic = true; break; } await sleep(200); }
  sawTraffic ? ok(`traffic spawning (${s.liveHazards} live hazards, ${s.rows} rows)`) : fail('no traffic spawned');
  await sleep(1200);
  await page.screenshot({ path: path.join(outDir, '3-traffic.png') });
  // Sit still in one lane: traffic must eventually hit us.
  t = Date.now();
  let sawCrashing = false;
  while (Date.now() - t < 90000) { s = await snap(); if (s.state === 'crashing') sawCrashing = true; if (s.state === 'over') break; await sleep(40); }
  s.state === 'over' ? ok(`collision -> crash -> game over at ${s.miles.toFixed(2)} mi, score ${Math.floor(s.score)}`) : fail('never crashed (state ' + s.state + ')');
  sawCrashing ? ok('slow-mo spin-out state observed before game over') : fail('no crashing state observed');
  await tap(W / 2, H / 2); await sleep(60);
  s = await snap();
  s.state === 'over' ? ok('restart ignored during lockout') : fail('restart lockout missing');
  s.roast && !s.roast.includes('{') ? ok(`roast line: "${s.roast}"`) : fail('bad roast line: ' + s.roast);
  await page.screenshot({ path: path.join(outDir, '4-gameover.png') });
  await sleep(700);
  await page.keyboard.press(' '); await sleep(250);
  s = await snap();
  s.state === 'play' && s.miles < 0.05 && s.seed === 12345 ? ok('Space restarts instantly with the same ?seed') : fail('restart failed: ' + JSON.stringify(s));
}

// --- Auto-pause on visibilitychange ---
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
});
s = await snap();
s.state === 'paused' ? ok('auto-pauses on visibilitychange') : fail('did not pause: ' + s.state);
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
await page.keyboard.press('Enter'); await sleep(100);
s = await snap();
s.state === 'play' ? ok('any key resumes from pause') : fail('did not resume: ' + s.state);

// --- Autopilot: follow the guaranteed-open lane via real key events, dodging as late as safely possible.
// If the fairness invariant holds in real-time play, this bot never crashes.
async function autopilot(label, query, seconds, expect) {
  const p2 = await context.newPage();
  const errs = [];
  p2.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p2.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p2.goto(pathToFileURL(path.join(root, 'index.html')).href + query);
  await p2.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await p2.keyboard.press('Enter');
  await p2.evaluate(() => {
    const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    const LC = 0.15, MARGIN = 0.12;
    function tick() {
      const c = window.__pedro.corridor();
      if (c.state !== 'play') return;
      requestAnimationFrame(tick);
      if (c.tweening || !c.rows.length) return;
      // the row we are inside (or the next one, once the current one is behind us)
      const row = c.rows[0];
      if (c.lane === row.g) return;
      const n = Math.abs(row.g - c.lane);
      const late = c.sigma >= row.A - c.v * (n * LC + MARGIN);
      if (late || c.sigma >= row.A) key(row.g > c.lane ? 'ArrowRight' : 'ArrowLeft');
    }
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  let st;
  while (Date.now() - t0 < seconds * 1000) {
    st = await p2.evaluate(() => window.__pedro.snapshot());
    if (st.state !== 'play') break;
    await sleep(500);
  }
  await p2.screenshot({ path: path.join(outDir, `5-autopilot-${label}.png`) });
  st.state === 'play'
    ? ok(`autopilot ${label}: no crash over ${((Date.now() - t0) / 1000).toFixed(0)} s, ${st.miles.toFixed(2)} mi, ${st.mph.toFixed(0)} mph, ${st.nearMisses} close calls`)
    : fail(`autopilot ${label}: crashed at ${st.miles.toFixed(2)} mi (seed ${st.seed})`);
  if (expect) expect(st);
  if (errs.length) fail(`autopilot ${label} console errors: ` + errs.join(' | '));
  await p2.close();
  return st;
}
await autopilot('milestone', '?debug&seed=777&start=2.75', 25, (st) => {
  st.milestoneHit ? ok('passed 3 mi: "PEDRO MADE IT TO GAME NIGHT!" banner fired') : fail('milestone not reached');
  st.nearMisses > 0 ? ok(`near-miss bonus awarded (${st.nearMisses})`) : fail('no near misses recorded');
});
await autopilot('brutal', '?debug&seed=4242&start=8', 30);

// --- Extra checks registered by later increments ---
const extra = await page.evaluate(() => (window.__pedro.selfTest ? window.__pedro.selfTest() : []));
for (const r of extra) (r.pass ? ok : fail)(r.name + (r.detail ? ' — ' + r.detail : ''));

await page.screenshot({ path: path.join(outDir, '2-play.png') });


if (consoleErrors.length) fail('console errors:\n    ' + consoleErrors.join('\n    '));
else ok('no console errors');

await browser.close();
console.log(failures.length ? `\nSMOKE FAILED (${failures.length})` : '\nSMOKE PASSED', '— screenshots in tools/out/');
process.exit(failures.length ? 1 : 0);
