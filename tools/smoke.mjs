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
// Every test page skips the first-visit How to Play popup and starts from clean week-1 progress,
// unless its URL says `freshHelp` (first-visit test) or `keep` (progress persistence test).
// (Patches getItem instead of writing storage: touching localStorage from an init script on file:// makes
// Chromium drop it on reload.)
const TEST_INIT = () => {
  const q = location.search, get = Storage.prototype.getItem;
  Storage.prototype.getItem = function (k) {
    if (k === 'pedro.help' && !q.includes('freshHelp')) return '1';
    if ((k === 'pedro.week.max' || k === 'pedro.week.sel') && !q.includes('keep')) return null;
    return get.call(this, k);
  };
};
const context = await browser.newContext({ ...iphone });
await context.addInitScript(TEST_INIT);
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
await tap(W / 2, 40);       // above the title: the middle of the screen is the week picker
await sleep(300);
s = await snap();
s.state === 'play' ? ok('tap starts the run') : fail('tap did not start run: ' + s.state);
s.lives === 3 && s.livesShown === 3 ? ok('HUD shows 3 chouriço links') : fail(`lives at start: ${s.lives}, shown ${s.livesShown}`);
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
await page.waitForFunction(() => !window.__pedro.snapshot().tweening);   // previous swipe settled
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
const settled = () => page.waitForFunction(() => { const s = window.__pedro.snapshot(); return !s.tweening; }, null, { timeout: 10000 }).catch(() => {});
await sleep(150); await settled(); await sleep(100); await settled();   // both the move and the buffered move
s = await snap();
s.lane === startLane + 2 ? ok(`keyboard ArrowRight x2 (buffered): lane -> ${s.lane}`) : fail(`buffered keys: expected ${startLane + 2}, got ${s.lane}`);
await page.keyboard.press('a'); await sleep(100); await settled();
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
  // Steer into traffic: three chouriço links, then the wreck.
  await kamikaze(page);
  t = Date.now();
  let sawCrashing = false;
  const seen = {};
  while (Date.now() - t < 150000) {
    s = await snap();
    if (s.state === 'crashing') sawCrashing = true;
    if (s.state === 'play' && s.lives < 3 && !seen[s.lives]) {
      seen[s.lives] = { damage: s.damage, shown: s.livesShown, speech: s.lifeLine };
      if (s.lives === 2) await page.screenshot({ path: path.join(outDir, '3b-first-hit.png') });
      if (s.lives === 1) await page.screenshot({ path: path.join(outDir, '3c-second-hit.png') });
    }
    if (s.state === 'over') break;
    await sleep(40);
  }
  const L = (await page.evaluate(() => LIFE_LOST_LINES));
  for (const n of [2, 1]) {
    const e = seen[n];
    e && e.damage === 3 - n && e.shown === n && L.includes(e.speech)
      ? ok(`hit #${3 - n}: ${n} link(s) left, car damage stage ${e.damage}, Pedro: "${e.speech}"`)
      : fail(`hit #${3 - n} state: ${JSON.stringify(e)}`);
  }
  s.state === 'over' ? ok(`third hit -> crash -> game over at ${s.miles.toFixed(2)} mi, score ${Math.floor(s.score)}`) : fail('never crashed (state ' + s.state + ')');
  s.damage === 3 && s.livesShown === 0 ? ok('wreck shows final damage stage, no links left') : fail(`final damage ${s.damage}, shown ${s.livesShown}`);
  sawCrashing ? ok('slow-mo spin-out state observed before game over') : fail('no crashing state observed');
  await tap(W / 2, H * 0.1); await sleep(60);   // top of the screen, away from the name field
  s = await snap();
  s.state === 'over' ? ok('restart ignored during lockout') : fail('restart lockout missing');
  s.roast && !s.roast.includes('{') ? ok(`roast line: "${s.roast}"`) : fail('bad roast line: ' + s.roast);
  s.result === 'wrecked' && s.overTitle === 'Wrecked' && /^Week 1 · [\d.]+ mi short of game night$/.test(s.overSub) && s.overCta === 'Tap / Space to retry Week 1'
    ? ok(`wreck screen: "${s.overSub}", "${s.overCta}"`) : fail('wreck screen copy: ' + JSON.stringify({ r: s.result, t: s.overTitle, sub: s.overSub, cta: s.overCta }));
  await page.screenshot({ path: path.join(outDir, '4-gameover.png') });
  await sleep(700);
  await page.keyboard.press(' '); await sleep(250);
  s = await snap();
  s.state === 'play' && s.miles < 0.05 && s.seed !== 12345 ? ok(`Space restarts instantly; ?seed only replays the first run (new seed ${s.seed})`) : fail('restart failed: ' + JSON.stringify(s));
  s.week === 1 && s.weekMax === 1 && s.lives === 3 ? ok('a wreck retries the same week (Week 1, links refilled, nothing unlocked)') : fail(`after wreck: week ${s.week}, max ${s.weekMax}, lives ${s.lives}`);
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

// --- Pause menu: Resume / Restart week / Main menu (buttons and R / Q keys) ---
{
  const pp = await context.newPage();
  const errs = [];
  pp.on('pageerror', (e) => errs.push(e.message));
  const sn = () => pp.evaluate(() => window.__pedro.snapshot());
  await pp.goto(pathToFileURL(path.join(root, 'index.html')).href + '?debug&seed=3&week=2');     // no &start: it applies to every run
  await pp.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await pp.keyboard.press('Enter');
  await pp.waitForFunction(() => window.__pedro.snapshot().state === 'play');
  await pp.evaluate(() => window.__pedro.grant(2));
  const pauseNow = async () => { await pp.click('#pauseBtn'); await pp.waitForFunction(() => window.__pedro.snapshot().state === 'paused', null, { timeout: 5000 }).catch(() => {}); };
  await pauseNow();
  const btns = await pp.evaluate(() => [...document.querySelectorAll('#pauseScreen button')].map((b) => b.textContent.trim()));
  await pp.screenshot({ path: path.join(outDir, '6b-pause-menu.png') });
  // the week-start banner is still up: the menu must be on top of it (elementFromPoint at each button's center)
  const onTop = await pp.evaluate(() => [...document.querySelectorAll('#pauseScreen button')].every((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b; }));
  btns.join('|') === '▶ Resume|↻ Restart week|☰ Main menu' && onTop ? ok(`pause menu on top of everything: ${btns.join(' · ')}`) : fail('pause buttons: ' + JSON.stringify({ btns, onTop }));
  await pp.click('#pauseResume');
  let q = await sn();
  q.state === 'play' && q.week === 2 ? ok('Resume button continues the drive') : fail('resume button: ' + q.state);
  await pp.waitForFunction(() => window.__pedro.snapshot().miles > 0.06, null, { timeout: 30000 }).catch(() => {});
  await pauseNow();
  const milesBefore = (await sn()).miles;
  await pp.click('#pauseRestart');
  q = await sn();
  const pauseHidden = await pp.isHidden('#pauseScreen');
  q.state === 'play' && q.week === 2 && q.miles < 0.05 && q.miles < milesBefore && q.lives === 3 && pauseHidden
    ? ok(`Restart week: fresh Week 2 run from 0.00 mi (was ${milesBefore.toFixed(2)} mi), 3 links`) : fail('restart: ' + JSON.stringify({ s: q.state, w: q.week, mi: q.miles, lives: q.lives, pauseHidden }));
  await pauseNow();
  await pp.click('#pauseMenu');
  q = await sn();
  const titleShown = await pp.isVisible('#titleScreen'), hudHidden = await pp.isHidden('#hud');
  q.state === 'title' && titleShown && hudHidden && !q.music.paused ? ok('Main menu: back to the title screen, HUD gone') : fail('menu: ' + JSON.stringify({ s: q.state, titleShown, hudHidden }));
  // keyboard: R restarts, Q goes to the menu
  await pp.keyboard.press('Enter');
  await pp.waitForFunction(() => window.__pedro.snapshot().state === 'play');
  await sleep(400);
  await pp.keyboard.press('p'); await pp.keyboard.press('r');
  q = await sn();
  const r = q.state === 'play' && q.miles < 0.05;
  await pp.keyboard.press('p'); await pp.keyboard.press('q');
  q = await sn();
  r && q.state === 'title' ? ok('keys while paused: R restarts the week, Q goes to the main menu') : fail(`pause keys: restart ${r}, then ${q.state}`);
  if (errs.length) fail('pause page errors: ' + errs.join(' | '));
  await pp.close();
}

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
  let st, tw = null;
  while (Date.now() - t0 < seconds * 1000) {
    st = await p2.evaluate(() => window.__pedro.snapshot());
    if (st.state !== 'play') break;
    if (st.mirror) {
      if (!tw) { tw = { first: st.mirror, max: st.mirror, mismatches: 0, checks: 0 }; await p2.screenshot({ path: path.join(outDir, `5-tailgater-${label}.png`) }); }
      tw.checks++;
      if (st.mirror.dots !== st.mirror.truth || JSON.stringify(st.mirror.hot) !== JSON.stringify(st.mirror.truthLanes)) tw.mismatches++;
      if (st.mirror.truth > tw.max.truth) { tw.max = st.mirror; await p2.screenshot({ path: path.join(outDir, `5-tailgaters-${st.mirror.truth}-${label}.png`) }); }
    }
    await sleep(tw ? 500 : 150);
  }
  st.firstTailWarn = tw;
  await p2.screenshot({ path: path.join(outDir, `5-autopilot-${label}.png`) });
  const finished = st.state === 'finishing' || st.result === 'complete';
  st.state === 'play' || finished
    ? ok(`autopilot ${label}: ${finished ? 'made it to game night' : 'no crash'} over ${((Date.now() - t0) / 1000).toFixed(0)} s, ${st.miles.toFixed(2)} mi, ${st.mph.toFixed(0)} mph, ${st.nearMisses} close calls, ${st.powerups} power-ups`)
    : fail(`autopilot ${label}: crashed at ${st.miles.toFixed(2)} mi (seed ${st.seed})`);
  st.hits === 0 ? ok(`autopilot ${label}: zero hits, all 3 links intact`) : fail(`autopilot ${label}: took ${st.hits} hit(s) following the guaranteed lane`);
  if (expect) await expect(st, p2);
  if (errs.length) fail(`autopilot ${label} console errors: ` + errs.join(' | '));
  await p2.close();
  return st;
}
const QUICK = process.argv.includes('--quick');   // skip the long autopilot runs
if (!QUICK) await autopilot('finish', '?debug&seed=777&start=9.8', 25, async (st, p2) => {
  const done = await p2.waitForFunction(() => window.__pedro.snapshot().state === 'over', null, { timeout: 60000 }).then(() => true, () => false);
  const w = await p2.evaluate(() => window.__pedro.snapshot());
  const lines = await p2.evaluate(() => WEEK_COMPLETE_LINES.map((l) => l.replace(/\{week\}/g, 1)));
  await p2.screenshot({ path: path.join(outDir, '18-week-complete.png') });
  done && w.result === 'complete' && w.overTitle === 'Week 1 complete!' && w.weekMax === 2 && w.overCta === 'Tap / Space: Week 2 ▶'
    ? ok(`10 mi: "${w.overTitle}" — ${w.overSub}; Week 2 unlocked`) : fail('week complete: ' + JSON.stringify({ done, r: w.result, t: w.overTitle, max: w.weekMax, cta: w.overCta }));
  lines.includes(w.roast) ? ok(`Pedro's week-complete line: "${w.roast}"`) : fail('week-complete line: ' + w.roast);
  const bonus = await p2.textContent('#overBonus');
  /Game night bonus \+3,000 · Links left \+1,500/.test(bonus) ? ok(`bonus: "${bonus}"`) : fail('bonus line: ' + bonus);
  const coinLine = await p2.textContent('#overCoins');
  w.bonusCoins === 50 && /\+ 50 bonus · wallet [\d,]+/.test(coinLine) ? ok(`week 1 pays 50 bonus coins into the wallet: "${coinLine}"`) : fail('week coin bonus: ' + JSON.stringify({ b: w.bonusCoins, coinLine }));
  w.musicStyle === 'dubstep' ? ok('started inside the last 2 miles: dubstep from the start') : fail('music near the finish: ' + w.musicStyle);
  await sleep(700);
  await p2.keyboard.press(' ');
  await p2.waitForFunction(() => window.__pedro.snapshot().state === 'play', null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const n = await p2.evaluate(() => window.__pedro.snapshot());
  n.state === 'play' && n.week === 2 && n.weekMiles === 12 && n.hudLabel === 'WEEK 2 · TO GAME NIGHT' && n.lives === 3 && n.topMph === 168 && n.musicStyle === 'folk'
    ? ok(`Space starts Week 2: 12 mi, top speed ${n.topMph} mph, start difficulty ${n.difficulty.toFixed(2)}, HUD "${n.hudLabel}" ${n.hudMiles}, folk again`)
    : fail('week 2 start: ' + JSON.stringify({ s: n.state, w: n.week, mi: n.weekMiles, l: n.hudLabel, lives: n.lives, top: n.topMph, m: n.musicStyle }));
});
if (!QUICK) await autopilot('start', '?debug&seed=4242', 30, (st) => {
  st.nearMisses > 0 ? ok(`near-miss bonus awarded (${st.nearMisses})`) : fail('no near misses recorded');
});
if (!QUICK) await autopilot('brutal', '?debug&seed=4243&week=6&start=5&copAt=off', 40, (st) => {
  // baseMph: the road speed before power-ups (a Brake Check the bot drove through halves the displayed mph)
  st.week === 6 && st.difficulty >= 0.999 && st.baseMph > 175 ? ok(`week 6 at full difficulty: ${st.baseMph.toFixed(0)} mph, ${st.weather}, road work active`) : fail(`brutal run: week ${st.week}, difficulty ${st.difficulty}, ${st.baseMph} mph`);
  const tw = st.firstTailWarn;
  if (!tw) { fail('no tailgater mirror seen in 40 s at full difficulty'); return; }
  const m = tw.first;
  m.bottom < m.vh * 0.3 ? ok(`tailgater mirror stays in the top of the screen (bottom ${m.bottom.toFixed(0)}px of ${m.vh}px), off the road`) : fail('mirror too low: ' + JSON.stringify(m));
  /TAILGATERS/.test(m.label) ? ok(`general alert shown: "${m.label}"`) : fail('mirror label: ' + m.label);
  tw.mismatches === 0 ? ok(`mirror matched the real tailgaters (dots + lanes) on all ${tw.checks} checks; most at once: ${tw.max.truth} in lane(s) ${tw.max.truthLanes.join(',')}`)
    : fail(`mirror disagreed with the hazard list on ${tw.mismatches}/${tw.checks} checks`);
});

// Snow week with road work, plow trains and black ice: following the guaranteed lane must never take a hit or slide
if (!QUICK) await autopilot('snow', '?debug&seed=4244&week=4&start=7&copAt=off', 40, (st) => {
  st.weather === 'snow' && st.slides === 0 ? ok(`snow week 4: ${st.mph.toFixed(0)} mph, no black-ice slides on the guaranteed lane`) : fail(`snow run: ${st.weather}, slides ${st.slides}`);
});

// A cop chase starts right away: the guaranteed lane gets the bot through it without being pulled over
if (!QUICK) await autopilot('cop', '?debug&seed=4245&week=5&start=3&copAt=3.06', 40, (st) => {
  st.cop.chases >= 1 && st.hits === 0 ? ok(`cop chase on autopilot: ${st.cop.chases} chase(s), phase "${st.cop.phase}", never pulled over`) : fail('cop autopilot: ' + JSON.stringify(st.cop));
});

// --- Weeks: HUD, coins, music drop, finish, week picker, saved progress ---
{
  const pg = await context.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  const base = pathToFileURL(path.join(root, 'index.html')).href;
  const sn = () => pg.evaluate(() => window.__pedro.snapshot());
  const runAt = async (q) => {
    await pg.goto(base + q);
    await pg.waitForFunction(() => window.__pedro && window.__pedro.ready);
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => window.__pedro.snapshot().mph > 100, null, { timeout: 15000 });
    await pg.evaluate(() => window.__pedro.grant(2));     // invincible: we're testing weeks, not dodging
  };
  await runAt('?debug&seed=5&start=0.5');
  let g = await sn();
  g.week === 1 && g.hudLabel === 'WEEK 1 · TO GAME NIGHT' && /^9\.\d\d mi$/.test(g.hudMiles) && g.musicStyle === 'folk'
    ? ok(`week 1: HUD "${g.hudLabel}" ${g.hudMiles}, folk music`) : fail('week 1 HUD: ' + JSON.stringify({ w: g.week, l: g.hudLabel, m: g.hudMiles, s: g.musicStyle }));
  // Coins: a trail in Pedro's lane, all collected -> coin count, HUD counter, full-trail bonus
  await pg.evaluate(() => window.__pedro.spawnCoins(window.__pedro.snapshot().lane, 30, 4));
  await pg.waitForFunction(() => window.__pedro.snapshot().coins >= 4, null, { timeout: 30000 }).catch(() => {});
  g = await sn();
  const coinHud = await pg.textContent('#hudCoinsVal');
  g.coins === 4 && coinHud === '4' ? ok(`coins: collected a 4-coin trail, HUD shows 🪙 ${coinHud}`) : fail(`coins: ${g.coins}, HUD ${coinHud}`);
  await pg.screenshot({ path: path.join(outDir, '17-coins.png') });
  // Final 2 miles: the music builds and drops into dubstep
  await runAt('?debug&seed=5&start=7.97');
  await pg.waitForFunction(() => window.__pedro.snapshot().dropped, null, { timeout: 30000 }).catch(() => {});
  g = await sn();
  await pg.screenshot({ path: path.join(outDir, '19-final-stretch.png') });
  g.dropped && g.musicStyle === 'dubstep' && /FINAL STRETCH/i.test(g.banner)
    ? ok(`8 mi into week 1: "${g.banner}", music dropped into dubstep`) : fail('drop: ' + JSON.stringify({ d: g.dropped, s: g.musicStyle, b: g.banner }));
  // Finish -> week complete (no traffic in the final stretch)
  await runAt('?debug&seed=5&start=9.93');
  const clear = await pg.evaluate(() => {
    const c = window.__pedro.corridor();
    return c.rows.every((r) => r.B < 10 * 1609.344 - 120);
  });
  clear ? ok('no traffic rows in the last stretch before Carlson\'s') : fail('traffic spawned in the finish stretch');
  await pg.waitForFunction(() => window.__pedro.snapshot().state === 'finishing', null, { timeout: 120000, polling: 50 }).catch(() => {});
  g = await sn();
  g.state === 'finishing' && /MADE IT/i.test(g.banner) ? ok(`crossing 10 mi: "${g.banner}", Pedro: "${g.speech}"`) : fail('finish: ' + JSON.stringify({ s: g.state, b: g.banner }));
  await pg.waitForFunction(() => window.__pedro.snapshot().state === 'over', null, { timeout: 60000 }).catch(() => {});
  g = await sn();
  g.result === 'complete' && g.weekMax === 2 ? ok('week complete screen, week 2 unlocked') : fail('complete: ' + JSON.stringify({ r: g.result, max: g.weekMax }));
  const share = g.shareText;
  /made it to game night! Week 1 \(10 mi\)/.test(share) ? ok(`share text: "${share}"`) : fail('share text: ' + share);
  // "Weeks" -> title with Week 2 selected; ← / → pick, locked weeks can't be picked
  await pg.click('#overMenuBtn');
  g = await sn();
  let wk = await pg.evaluate(() => ({ name: document.getElementById('weekName').textContent, sub: document.getElementById('weekSub').textContent,
    prev: document.getElementById('weekPrev').disabled, next: document.getElementById('weekNext').disabled }));
  await pg.screenshot({ path: path.join(outDir, '20-title-week-picker.png') });
  g.state === 'title' && wk.name === 'WEEK 2' && /^12 mi · ☀️ Clear$/.test(wk.sub) && !wk.prev && wk.next
    ? ok(`Weeks button: title with "${wk.name}" (${wk.sub}) selected, Week 3 locked`) : fail('title picker: ' + JSON.stringify({ s: g.state, wk }));
  await pg.keyboard.press('ArrowLeft');
  wk = await pg.evaluate(() => document.getElementById('weekName').textContent);
  await pg.keyboard.press('ArrowLeft');
  const wk2 = await pg.evaluate(() => document.getElementById('weekName').textContent);
  await pg.click('#weekNext'); await pg.click('#weekNext', { force: true });   // second one is disabled (Week 3 locked)
  const wk3 = await pg.evaluate(() => document.getElementById('weekName').textContent);
  g = await sn();
  wk === 'WEEK 1' && wk2 === 'WEEK 1' && wk3 === 'WEEK 2' && g.state === 'title'
    ? ok('← / ▶ pick weeks on the title screen (clamped to 1…unlocked) without starting a drive') : fail(`picker: ${wk}, ${wk2}, ${wk3}, state ${g.state}`);
  // Saved progress survives a reload
  await pg.goto(base + '?debug&seed=5&keep');
  await pg.waitForFunction(() => window.__pedro && window.__pedro.ready);
  g = await sn();
  const name = await pg.textContent('#weekName');
  g.weekMax === 2 && name === 'WEEK 2' ? ok('progress saved: Week 2 still unlocked and selected after reload') : fail(`saved progress: max ${g.weekMax}, ${name}`);
  await pg.keyboard.press('Enter'); await sleep(300);
  g = await sn();
  g.state === 'play' && g.week === 2 ? ok('Enter on the title drives the selected week') : fail(`start selected: ${g.state} week ${g.week}`);
  // ?debug&week=N: later weeks are longer, faster, start harder, everything unlocked
  await runAt('?debug&seed=5&week=3');
  g = await sn();
  g.week === 3 && g.weekMiles === 14 && g.topMph === 171 && Math.abs(g.difficulty - 0.48) < 0.02
    ? ok(`week 3: ${g.weekMiles} mi, starts at difficulty ${g.difficulty.toFixed(2)}, tops out at ${g.topMph} mph`) : fail('week 3: ' + JSON.stringify({ w: g.week, mi: g.weekMiles, top: g.topMph, d: g.difficulty }));
  if (errs.length) fail('weeks page errors: ' + errs.join(' | ')); else ok('weeks page: no errors');
  await pg.close();
}

// --- Weather, road work, snowplows, black ice ---
{
  const pw = await context.newPage();
  const errs = [];
  pw.on('pageerror', (e) => errs.push(e.message));
  pw.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const base = pathToFileURL(path.join(root, 'index.html')).href;
  const sn = () => pw.evaluate(() => window.__pedro.snapshot());
  const drive = async (q, invincible = true) => {
    await pw.goto(base + q);
    await pw.waitForFunction(() => window.__pedro && window.__pedro.ready);
    await pw.keyboard.press('Enter');
    await pw.waitForFunction(() => window.__pedro.snapshot().state === 'play');
    if (invincible) await pw.evaluate(() => window.__pedro.grant(2));
  };
  // Weather per week (+ start banner)
  const wx = {};
  for (const w of [1, 2, 3, 4]) {
    await drive(`?debug&seed=8&week=${w}&start=1`, false);
    await sleep(600);
    wx[w] = await sn();
    await pw.screenshot({ path: path.join(outDir, `22-weather-week${w}.png`) });
  }
  const want = { 1: ['clear', 165, false, false], 2: ['clear', 165, false, false], 3: ['rain', 105, true, false], 4: ['snow', 135, false, true] };
  const wxOk = Object.entries(want).every(([w, [k, f, r, sw]]) => wx[w].weather === k && wx[w].fogFar === f && wx[w].rainOn === r && wx[w].snowOn === sw);
  wxOk ? ok('weather: weeks 1–2 clear (165 m visibility), week 3 rain (105 m, rain falling), week 4 snow (135 m, snow falling)')
    : fail('weather: ' + JSON.stringify(Object.fromEntries(Object.entries(wx).map(([w, x]) => [w, [x.weather, x.fogFar, x.rainOn, x.snowOn]]))));
  /WEEK 3 .*RAIN/.test(wx[3].banner) && /WEEK 4 .*SNOW .*black ice/i.test(wx[4].banner) ? ok(`week start banner: "${wx[4].banner}"`) : fail('start banners: ' + wx[3].banner + ' | ' + wx[4].banner);
  const rot = await pw.evaluate(() => [5, 6, 7, 8, 9, 10, 11, 12].map((w) => PedroCore.weatherOf(w)));
  rot.every((k) => k === 'rain' || k === 'snow') && rot.includes('rain') && rot.includes('snow')
    ? ok(`weeks 5–12 rotate rain/snow: ${rot.join(', ')}`) : fail('rotation: ' + rot.join(','));

  // Road closure ahead in Pedro's lane: a wall (costs a link, doesn't fly away), with cones, arrow board, and Pedro reacting
  await drive('?debug&seed=8&week=2&start=1', false);
  let g = await sn();
  const lane = g.lane;
  await pw.evaluate((l) => window.__pedro.spawnClosure(l, 70, 160), lane);
  await pw.waitForFunction(() => window.__pedro.snapshot().cones > 10 && window.__pedro.snapshot().speech, null, { timeout: 20000, polling: 50 }).catch(() => {});
  g = await sn();
  const roadLines = await pw.evaluate(() => ROADWORK_LINES);
  g.cones > 10 && roadLines.includes(g.speech) ? ok(`closure: ${g.cones} cones drawn, Pedro: "${g.speech}"`) : fail(`closure visuals: cones ${g.cones}, speech "${g.speech}"`);
  await pw.screenshot({ path: path.join(outDir, '23-road-closure.png') });
  await pw.waitForFunction(() => window.__pedro.snapshot().lives < 3, null, { timeout: 60000 }).catch(() => {});
  g = await sn();
  const still = await pw.evaluate(() => window.__pedro.hazards().filter((h) => h.type === 'closure').map((h) => h.ahead - h.hl));
  g.lives === 2 && still.length === 1 && still[0] < 3 ? ok(`driving into the closed lane costs a link (hit at the arrow board, ${still[0].toFixed(1)} m); the closure stays put`)
    : fail(`closure hit: lives ${g.lives}, closure near end ${JSON.stringify(still)}`);
  // Fresh Detail drives straight through cones
  await drive('?debug&seed=8&week=2&start=1');
  g = await sn();
  await pw.evaluate((l) => window.__pedro.spawnClosure(l, 40, 60), g.lane);
  await pw.waitForFunction(() => window.__pedro.hazards().every((h) => h.type !== 'closure' || h.ahead < -40), null, { timeout: 60000 }).catch(() => {});
  g = await sn();
  g.lives === 3 && g.hits === 0 ? ok('Fresh Detail plows through road work without losing a link') : fail(`detail through closure: lives ${g.lives}`);

  // Generated closures (late in week 2): the closed lane is never a row's guaranteed lane
  await drive('?debug&seed=3&week=2&start=8');     // seed 3: the spawner opens a closure in the first row
  const found = await pw.waitForFunction(() => window.__pedro.hazards().some((h) => h.type === 'closure'), null, { timeout: 90000, polling: 200 }).then(() => true, () => false);
  if (found) {
    await pw.waitForFunction(() => window.__pedro.snapshot().cones > 4, null, { timeout: 60000, polling: 100 }).catch(() => {});
    await pw.screenshot({ path: path.join(outDir, '24-generated-closure.png') });
    const chk = await pw.evaluate(() => {
      const cl = window.__pedro.hazards().find((h) => h.type === 'closure'), c = window.__pedro.corridor();
      const lo = cl.sigma - cl.hs, hi = cl.sigma + cl.hs;
      const over = c.rows.filter((r) => r.B > lo && r.A < hi);
      return { lane: cl.lane, len: 2 * cl.hl, rows: over.length, bad: over.filter((r) => r.g === cl.lane || !(r.mask & (1 << cl.lane))).length };
    });
    chk.bad === 0 && (chk.lane === 0 || chk.lane === 3) ? ok(`generated closure: edge lane ${chk.lane}, ${chk.len.toFixed(0)} m; closed lane blocked and never the guaranteed lane in ${chk.rows} overlapping rows`)
      : fail('generated closure: ' + JSON.stringify(chk));
  } else fail('no road closure generated in the second half of week 2');

  // Black ice: steering onto it slides one more lane; driving straight over it does nothing
  await drive('?debug&seed=8&week=4&start=0.3');
  g = await sn();
  await pw.evaluate((l) => window.__pedro.spawnIce(l + 1, 3, 45), g.lane);
  await sleep(100);
  await pw.keyboard.press('ArrowRight');
  await pw.waitForFunction(() => window.__pedro.snapshot().slides > 0 && !window.__pedro.snapshot().tweening, null, { timeout: 15000 }).catch(() => {});
  const g2 = await sn();
  await pw.screenshot({ path: path.join(outDir, '25-black-ice-slide.png') });
  const iceLines = await pw.evaluate(() => ICE_LINES);
  g2.lane === g.lane + 2 && g2.slides === 1 && iceLines.includes(g2.speech)
    ? ok(`black ice: steered right from lane ${g.lane} onto ice, slid on to lane ${g2.lane}; Pedro: "${g2.speech}"`) : fail(`ice slide: lane ${g.lane} → ${g2.lane}, slides ${g2.slides}, "${g2.speech}"`);
  await pw.evaluate((l) => window.__pedro.spawnIce(l, 5, 30), g2.lane);
  await pw.waitForFunction(() => window.__pedro.hazards().every((h) => h.type !== 'ice' || h.ahead < -25), null, { timeout: 60000 }).catch(() => {});
  const g3 = await sn();
  g3.lane === g2.lane && g3.slides === 1 ? ok('driving straight over black ice keeps the lane') : fail(`straight over ice: lane ${g2.lane} → ${g3.lane}, slides ${g3.slides}`);

  // Snowplow train: generated in snow weeks, solid (hitting one costs a link), Pedro reacts
  await drive('?debug&seed=27&week=4&start=2');     // seed 27: the spawner opens with a plow train
  const plows = await pw.waitForFunction(() => window.__pedro.hazards().some((h) => h.type === 'plow' && h.ahead < 120), null, { timeout: 90000, polling: 100 }).then(() => true, () => false);
  if (plows) {
    await pw.waitForFunction(() => PLOW_LINES.includes(window.__pedro.snapshot().speech), null, { timeout: 20000, polling: 50 }).catch(() => {});
    await pw.screenshot({ path: path.join(outDir, '26-snowplow-train.png') });
    const tr = await pw.evaluate(() => { const ps = window.__pedro.hazards().filter((h) => h.type === 'plow'); return { n: ps.length, lanes: [...new Set(ps.map((p) => p.lane))].sort() }; });
    g = await sn();
    const plowLines = await pw.evaluate(() => PLOW_LINES);
    tr.n >= 2 && plowLines.includes(g.speech) ? ok(`snowplow train generated: ${tr.n} plows in lanes ${tr.lanes.join(',')}; Pedro: "${g.speech}"`) : fail('plow train: ' + JSON.stringify({ tr, speech: g.speech }));
  } else fail('no snowplow train generated in week 4');
  await drive('?debug&seed=8&week=4&start=0.3', false);
  g = await sn();
  await pw.evaluate((l) => window.__pedro.spawnPlows(l, 1, 60), g.lane);
  await pw.waitForFunction(() => window.__pedro.snapshot().lives < 3, null, { timeout: 60000 }).catch(() => {});
  g = await sn();
  g.lives === 2 ? ok('hitting a plow costs a link') : fail('plow hit: lives ' + g.lives);
  // clear / rain weeks never get plows or ice (generation checked in fairness.mjs too)
  await drive('?debug&seed=12&week=3&start=2');
  await sleep(4000);
  const rainHaz = await pw.evaluate(() => window.__pedro.hazards().filter((h) => h.type === 'plow' || h.type === 'ice').length);
  rainHaz === 0 ? ok('rain week: no plows or black ice') : fail('rain week has ' + rainHaz + ' plows/ice');
  if (errs.length) fail('weather page errors: ' + errs.join(' | ')); else ok('weather page: no errors');
  await pw.close();
}

// --- Cop chases ---
{
  const pc = await context.newPage();
  const errs = [];
  pc.on('pageerror', (e) => errs.push(e.message));
  pc.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const base = pathToFileURL(path.join(root, 'index.html')).href;
  const sn = () => pc.evaluate(() => window.__pedro.snapshot());
  const drive = async (q) => {
    await pc.goto(base + q);
    await pc.waitForFunction(() => window.__pedro && window.__pedro.ready);
    await pc.keyboard.press('Enter');
    await pc.waitForFunction(() => window.__pedro.snapshot().state === 'play');
  };
  // How many chases each week gets, and where (seeded, inside the 20–80% window)
  const plans = {};
  for (const w of [1, 2, 3, 5, 7]) { await drive(`?debug&seed=21&week=${w}`); plans[w] = (await sn()).cop.plan; }
  const inWin = (w) => plans[w].every((m) => m >= 0.2 * (8 + 2 * w) && m <= 0.8 * (8 + 2 * w));
  plans[1].length === 0 && plans[2].length === 0 && plans[3].length === 1 && plans[5].length === 2 && plans[7].length === 3 && [3, 5, 7].every(inWin)
    ? ok(`cop chases per week: weeks 1–2 none, week 3 one (mile ${plans[3][0].toFixed(1)}), week 5 two, week 7 three, all inside the 20–80% window`)
    : fail('cop plans: ' + JSON.stringify(plans));
  // Warning → chase: siren, flashes, mirror, HUD timer, ×1.5 points, Pedro reacts
  await drive('?debug&seed=8&week=3&start=0.5&copAt=0.56');
  await pc.evaluate(() => window.__pedro.grant(2));       // no stray traffic hits while we watch
  await pc.waitForFunction(() => window.__pedro.snapshot().cop.phase === 'warn', null, { timeout: 60000, polling: 50 }).catch(() => {});
  let c = await sn();
  const startLines = await pc.evaluate(() => COP_START_LINES);
  c.cop.siren && c.cop.fx && c.cop.hud === 'COP INCOMING' && c.mirror && /POLICE/.test(c.mirror.label) && startLines.includes(c.speech) && /COP ON YOUR TAIL/.test(c.banner)
    ? ok(`cop warning: siren on, red/blue flashes, mirror "${c.mirror.label}", HUD "${c.cop.hud}", Pedro: "${c.speech}"`) : fail('cop warning: ' + JSON.stringify({ cop: c.cop, mirror: c.mirror, speech: c.speech, banner: c.banner }));
  await pc.waitForFunction(() => window.__pedro.snapshot().cop.phase === 'chase', null, { timeout: 30000, polling: 50 }).catch(() => {});
  c = await sn();
  await pc.screenshot({ path: path.join(outDir, '27-cop-chase.png') });
  c.cop.phase === 'chase' && c.cop.mult === 1.5 && /OUTRUN THE COP/.test(c.cop.hud) ? ok(`chase on: "${c.cop.hud}", points ×${c.cop.mult}`) : fail('chase: ' + JSON.stringify(c.cop));
  // Full Coverage doesn't save you: any hit during the chase = pulled over
  await pc.waitForFunction(() => window.__pedro.snapshot().effect < 0, null, { timeout: 30000, polling: 50 }).catch(() => {});
  await pc.evaluate(() => window.__pedro.grant(0));
  await pc.evaluate(() => window.__pedro.spawnPlows(window.__pedro.snapshot().lane, 1, 40));
  await pc.waitForFunction(() => window.__pedro.snapshot().state === 'pulled', null, { timeout: 60000, polling: 50 }).catch(() => {});
  c = await sn();
  const pullLines = await pc.evaluate(() => COP_PULL_LINES);
  c.state === 'pulled' && c.shield && pullLines.includes(c.speech) ? ok(`hit during the chase with Full Coverage on: pulled over anyway. Pedro: "${c.speech}"`) : fail('pull over: ' + JSON.stringify({ s: c.state, shield: c.shield, speech: c.speech }));
  await sleep(500);
  await pc.screenshot({ path: path.join(outDir, '28-pulled-over.png') });
  await pc.waitForFunction(() => window.__pedro.snapshot().state === 'over', null, { timeout: 30000 }).catch(() => {});
  c = await sn();
  const roasts = await pc.evaluate(() => COP_ROASTS);
  const roastOk = !c.roast.includes('{') && roasts.some((r) => r.split(/\{\w+\}/).every((piece) => c.roast.includes(piece)));
  c.result === 'pulled' && c.overTitle === 'Pulled over' && roastOk && !c.cop.siren && /got pulled over/.test(c.shareText) && c.overCta === 'Tap / Space to retry Week 3'
    ? ok(`pulled-over screen: "${c.overTitle}" — "${c.roast}"; siren off; retry Week 3`) : fail('pulled screen: ' + JSON.stringify({ r: c.result, t: c.overTitle, roast: c.roast, siren: c.cop.siren, share: c.shareText, cta: c.overCta }));
  // Fresh Detail still protects during a chase
  await drive('?debug&seed=8&week=3&start=0.5&copAt=0.56');
  await pc.evaluate(() => window.__pedro.grant(2));
  await pc.waitForFunction(() => window.__pedro.snapshot().cop.phase === 'chase', null, { timeout: 60000, polling: 50 }).catch(() => {});
  await pc.evaluate(() => window.__pedro.grant(2));       // fresh 5 s of invincibility for the chase
  await pc.evaluate(() => window.__pedro.spawnPlows(window.__pedro.snapshot().lane, 1, 30));
  await pc.waitForFunction(() => window.__pedro.snapshot().plowed > 0 || window.__pedro.snapshot().state !== 'play', null, { timeout: 60000, polling: 50 }).catch(() => {});
  c = await sn();
  c.state === 'play' && c.plowed > 0 && c.cop.phase === 'chase' ? ok('Fresh Detail during a chase: plowed through a plow, still driving') : fail('detail in chase: ' + JSON.stringify({ s: c.state, plowed: c.plowed, phase: c.cop.phase }));
  // Outlast the timer: "lost him" bonus, siren off
  await drive('?debug&seed=8&week=4&start=0.5&copAt=off');
  await pc.evaluate(() => window.__pedro.grant(2));
  const before = (await sn()).score;
  await pc.evaluate(() => window.__pedro.startChase(1.5));
  await pc.waitForFunction(() => window.__pedro.snapshot().cop.escapes > 0, null, { timeout: 60000, polling: 50 }).catch(() => {});
  c = await sn();
  const escLines = await pc.evaluate(() => COP_ESCAPE_LINES);
  c.cop.escapes === 1 && !c.cop.siren && !c.cop.fx && c.score - before >= 2000 && escLines.includes(c.speech) && c.bonusCoins === 25
    ? ok(`outlasted the chase: lost him (+${Math.round(c.score - before)} incl. the 2,000 bonus), siren off, Pedro: "${c.speech}"`) : fail('escape: ' + JSON.stringify({ cop: c.cop, gained: c.score - before, speech: c.speech }));
  if (errs.length) fail('cop page errors: ' + errs.join(' | ')); else ok('cop page: no errors');
  await pc.close();
}

// --- Garage: wallet, try-on, buy, equip, persistence ---
{
  const pg = await context.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const base = pathToFileURL(path.join(root, 'index.html')).href;
  const sn = () => pg.evaluate(() => window.__pedro.snapshot());
  await pg.goto(base + '?debug&seed=4&wallet=1000');
  await pg.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await pg.evaluate(() => { localStorage.removeItem('pedro.decals'); localStorage.removeItem('pedro.decal'); localStorage.removeItem('pedro.paint'); });
  await sleep(800);
  await pg.goto(base + '?debug&seed=4&wallet=1000');
  await pg.waitForFunction(() => window.__pedro && window.__pedro.ready);
  const label = await pg.textContent('#garageBtn');
  /Garage · 🪙 1,000/.test(label) ? ok(`title shows the wallet: "${label.trim()}"`) : fail('garage button: ' + label);
  await pg.click('#garageBtn');
  let g = await sn();
  const cards = await pg.evaluate(() => [...document.querySelectorAll('.gCard')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
  g.garage && cards.length === 8 && /No Decal.*EQUIPPED/.test(cards[0]) && /Cop Car.*5,000/.test(cards[7]) && /Racing Stripes.*150/.test(cards[1])
    ? ok(`garage: ${cards.length} items, stripes 150 … cop car 5,000; no decal equipped`) : fail('garage list: ' + JSON.stringify({ open: g.garage, cards }));
  // Free paint: presets and a custom color, under simple decals; full wraps cover it
  const swatches = await pg.evaluate(() => document.querySelectorAll('#garagePaint .psw').length);
  g.paint === 0xd4d8de && swatches === 12 ? ok('paint: silver by default, 11 free colors + a custom color picker') : fail(`paint row: paint ${g.paint}, ${swatches} swatches`);
  await pg.click('#garagePaint .psw[aria-label="Red paint"]');
  g = await sn();
  g.paint === 0xd62828 && g.bodyColor === 0xd62828 && g.wallet === 1000 ? ok('picked Red: the Jetta is red, free (wallet still 1,000)') : fail('red paint: ' + JSON.stringify({ p: g.paint, c: g.bodyColor, w: g.wallet }));
  await pg.evaluate(() => { const i = document.getElementById('paintCustom'); i.value = '#12a4b8'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
  g = await sn();
  const customSel = await pg.evaluate(() => document.querySelector('#garagePaint .psw.custom').classList.contains('sel'));
  g.paint === 0x12a4b8 && g.bodyColor === 0x12a4b8 && customSel ? ok('custom color picker: #12a4b8 applied and selected') : fail('custom paint: ' + JSON.stringify({ p: g.paint, c: g.bodyColor, customSel }));
  await pg.click('#garagePaint .psw[aria-label="Blue paint"]');
  await pg.click('.gCard[data-id="stripes"]');
  g = await sn();
  g.bodyColor === 0x1f5fd6 && g.stripe === 0xf4f4f4 ? ok('stripes go white on blue paint so they stay visible; paint shows under the decal') : fail('stripes on blue: ' + JSON.stringify({ c: g.bodyColor, s: g.stripe }));
  await pg.screenshot({ path: path.join(outDir, '31-garage-blue-stripes.png') });
  // try on something too expensive: it shows on the car, can't be bought, comes off on close
  await pg.click('.gCard[data-id="gold"]');
  g = await sn();
  let action = await pg.evaluate(() => ({ t: document.getElementById('garageAction').textContent, d: document.getElementById('garageAction').disabled }));
  await sleep(700);
  await pg.screenshot({ path: path.join(outDir, '29-garage-try-gold.png') });
  const note = await pg.textContent('#paintNote');
  g.decal === 'gold' && action.d && /Need 🪙 2,000 more/.test(action.t) && g.bodyColor === 0xd9b23c && /covered by the Gold Chrome/.test(note)
    ? ok(`try-on: gold chrome covers the paint ("${note}"); "${action.t}"`) : fail('try-on: ' + JSON.stringify({ decal: g.decal, action, c: g.bodyColor, note }));
  // taps / keys inside the garage never start a drive
  await pg.keyboard.press('Enter'); await pg.keyboard.press('ArrowLeft');
  g = await sn();
  g.state === 'title' && g.garage ? ok('keys inside the garage never start a drive') : fail(`garage input leak: ${g.state}`);
  // buy flames (600)
  await pg.click('.gCard[data-id="flames"]');
  action = await pg.evaluate(() => document.getElementById('garageAction').textContent);
  await pg.click('#garageAction');
  g = await sn();
  const msg = await pg.textContent('#garageMsg');
  /Buy · 🪙 600/.test(action) && g.wallet === 400 && g.owned.includes('flames') && g.equipped === 'flames' && g.decal === 'flames'
    ? ok(`bought Flames: wallet 1,000 → ${g.wallet}, equipped ("${msg}")`) : fail('buy: ' + JSON.stringify({ action, w: g.wallet, owned: g.owned, eq: g.equipped }));
  // switch to stock and back without paying again
  await pg.click('.gCard[data-id=""]'); await pg.click('#garageAction');
  await pg.click('.gCard[data-id="flames"]');
  action = await pg.evaluate(() => document.getElementById('garageAction').textContent);
  await pg.click('#garageAction');
  g = await sn();
  action === 'Equip' && g.wallet === 400 && g.equipped === 'flames' ? ok('owned decals re-equip for free') : fail('re-equip: ' + JSON.stringify({ action, w: g.wallet, eq: g.equipped }));
  await pg.keyboard.press('Escape');
  g = await sn();
  !g.garage && g.state === 'title' ? ok('Escape closes the garage back to the title') : fail('garage close: ' + JSON.stringify({ garage: g.garage, s: g.state }));
  // persists across reloads; coins grabbed in a drive land in the wallet
  await sleep(1000);
  await pg.goto(base + '?debug&seed=4&start=0.5');
  await pg.waitForFunction(() => window.__pedro && window.__pedro.ready);
  g = await sn();
  g.wallet === 400 && g.equipped === 'flames' && g.decal === 'flames' && g.paint === 0x1f5fd6 && g.bodyColor === 0x1f5fd6 ? ok('wallet, owned decals, the equipped decal and the paint survive a reload') : fail('garage persistence: ' + JSON.stringify({ w: g.wallet, eq: g.equipped, decal: g.decal }));
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => window.__pedro.snapshot().state === 'play');
  await pg.evaluate(() => window.__pedro.grant(2));
  await pg.evaluate(() => window.__pedro.spawnCoins(window.__pedro.snapshot().lane, 30, 4));
  await pg.waitForFunction(() => window.__pedro.snapshot().coins >= 4, null, { timeout: 30000 }).catch(() => {});
  g = await sn();
  g.wallet >= 404 && g.decal === 'flames' ? ok(`coins go straight into the wallet (${g.wallet}); the Jetta drives with its decal`) : fail('wallet during drive: ' + JSON.stringify({ w: g.wallet, decal: g.decal }));
  await pg.screenshot({ path: path.join(outDir, '30-driving-with-flames.png') });
  if (errs.length) fail('garage page errors: ' + errs.join(' | ')); else ok('garage page: no errors');
  await pg.close();
}

// --- How to play: first visit opens it, taps on it don't start a drive, it never reappears once closed ---
{
  const hp = await context.newPage();
  const errs = [];
  hp.on('pageerror', (e) => errs.push(e.message));
  await hp.goto(pathToFileURL(path.join(root, 'index.html')).href + '?freshHelp');
  await hp.waitForFunction(() => window.__pedro && window.__pedro.ready);
  let h = await hp.evaluate(() => window.__pedro.snapshot());
  const helpTxt = await hp.evaluate(() => document.querySelector('.help').innerText);
  await hp.screenshot({ path: path.join(outDir, '21-how-to-play.png') });
  h.help && /Full Coverage/.test(helpTxt) && /Donut/.test(helpTxt) && /3 chouriço links/.test(helpTxt) && /Week 1 is 10 miles/.test(helpTxt) && /black ice/.test(helpTxt) && /road work/i.test(helpTxt) && /pulled over/.test(helpTxt) && /Garage/.test(helpTxt)
    ? ok('first visit: How to Play opens with rules, lives, weeks, road work, weather and every power-up') : fail('help on first visit: ' + JSON.stringify({ open: h.help }));
  const hb = await hp.locator('.help h3').first().boundingBox();
  await hp.mouse.click(hb.x + 10, hb.y + 5);
  await hp.keyboard.press('ArrowLeft');
  h = await hp.evaluate(() => window.__pedro.snapshot());
  h.state === 'title' && h.help ? ok('taps and keys inside How to Play never start a drive') : fail(`help leaked input: ${h.state}, open ${h.help}`);
  await hp.click('#helpClose');
  h = await hp.evaluate(() => window.__pedro.snapshot());
  h.state === 'title' && !h.help ? ok('"Got it" closes it back to the title screen') : fail(`help close: ${h.state}, open ${h.help}`);
  await hp.reload();
  await hp.waitForFunction(() => window.__pedro && window.__pedro.ready);
  h = await hp.evaluate(() => window.__pedro.snapshot());
  !h.help ? ok('How to Play does not reopen on the next visit') : fail('help reopened');
  await hp.click('#helpBtn');
  h = await hp.evaluate(() => window.__pedro.snapshot());
  await hp.keyboard.press('Escape');
  const h2 = await hp.evaluate(() => window.__pedro.snapshot());
  h.help && !h2.help && h2.state === 'title' ? ok('❓ button reopens it; Escape closes it') : fail(`help button: ${h.help} → ${h2.help}, ${h2.state}`);
  if (errs.length) fail('help page errors: ' + errs.join(' | '));
  await hp.close();
}

// --- Power-ups ---
{
  const p3 = await context.newPage();
  const errs = [];
  p3.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p3.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p3.goto(pathToFileURL(path.join(root, 'index.html')).href + '?debug&seed=99&start=1');
  await p3.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await p3.keyboard.press('Enter');
  await sleep(300);
  const sn = () => p3.evaluate(() => window.__pedro.snapshot());
  const hud = () => p3.evaluate(() => window.__pedro.hudText());
  // Brake Check: world slows, timer counts down, HUD shows it
  await p3.waitForFunction(() => window.__pedro.snapshot().mph > 100, null, { timeout: 15000 });   // first frames ran
  let a = await sn();
  await p3.evaluate(() => window.__pedro.grant(1));
  await p3.waitForFunction(() => /BRAKE CHECK/.test(window.__pedro.hudText()), null, { timeout: 10000 }).catch(() => {});
  let b = await sn();
  b.effect === 1 && /BRAKE CHECK/.test(await hud()) ? ok('Brake Check active + HUD timer shown') : fail('brake check not active: ' + JSON.stringify(b));
  b.mph < a.mph * 0.6 ? ok(`Brake Check slows the world (${a.mph.toFixed(0)} -> ${b.mph.toFixed(0)} effective mph)`) : fail(`no slow-mo: ${a.mph} -> ${b.mph}`);
  // Only one timed effect: Donut replaces Brake Check
  await p3.evaluate(() => window.__pedro.grant(3));
  await p3.waitForFunction(() => /DONUT/.test(window.__pedro.hudText()), null, { timeout: 10000 }).catch(() => {});
  b = await sn();
  b.effect === 3 && /DONUT/.test(await hud()) && !/BRAKE/.test(await hud()) ? ok('Donut replaces Brake Check (one timed effect at a time)') : fail('effect replacement broken: ' + (await hud()));
  // Kamikaze pilot: steer INTO a blocked lane of the next row (real key events)
  await p3.evaluate(() => {
    const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    window.__kamikaze = true;
    (function tick() {
      if (!window.__kamikaze) return;
      requestAnimationFrame(tick);
      const c = window.__pedro.corridor();
      if (c.state !== 'play' || c.tweening) return;
      const row = c.rows.find((r) => r.mask && r.B > c.sigma);
      if (!row || (row.mask & (1 << c.lane))) return;
      let best = -1;
      for (let l = 0; l < 4; l++) if ((row.mask & (1 << l)) && (best < 0 || Math.abs(l - c.lane) < Math.abs(best - c.lane))) best = l;
      if (best >= 0) key(best > c.lane ? 'ArrowRight' : 'ArrowLeft');
    })();
  });
  // Fresh Detail: plow through traffic for its duration without crashing
  await p3.evaluate(() => window.__pedro.grant(2));
  let t0 = Date.now(), c;
  while (Date.now() - t0 < 40000) { c = await sn(); if (c.state !== 'play' || c.effect !== 2 || (c.plowed > 0 && c.effectT < 1.2)) break; await sleep(150); if (c.plowed > 0 && !globalThis.__shot) { globalThis.__shot = 1; await p3.screenshot({ path: path.join(outDir, '6-fresh-detail.png') }); } }
  c.state === 'play' && c.plowed > 0 ? ok(`Fresh Detail: plowed ${c.plowed} hazards aside while steering into traffic, no crash`) : fail(`Fresh Detail: state ${c.state}, plowed ${c.plowed}`);
  // Full Coverage: absorb exactly one crash
  const shieldNow = await p3.evaluate(() => { window.__pedro.grant(0); return window.__pedro.snapshot().shield; });
  const badge = await p3.waitForFunction(() => !window.__pedro.snapshot().shield || /FULL COVERAGE/.test(window.__pedro.hudText()), null, { timeout: 10000 }).then(() => true, () => false);
  shieldNow && badge ? ok('Full Coverage shield up + HUD badge') : fail(`no shield (granted ${shieldNow}, badge ${badge})`);
  await p3.screenshot({ path: path.join(outDir, '7-coverage.png') });
  t0 = Date.now();
  while (Date.now() - t0 < 60000) { c = await sn(); if (!c.shield || c.state !== 'play') break; await sleep(100); }
  !c.shield && c.state === 'play' ? ok('Full Coverage absorbed a crash, run continues') : fail('shield did not absorb: ' + JSON.stringify(c));
  c.lives === 3 ? ok('shield hit cost no chouriço link') : fail('shield hit cost a life: ' + c.lives);
  // Next hits cost links
  t0 = Date.now();
  while (Date.now() - t0 < 60000) { c = await sn(); if (c.lives < 3 || c.state !== 'play') break; await sleep(100); }
  c.lives === 2 && c.state === 'play' ? ok('next hit costs one link, run continues') : fail('after shield: ' + JSON.stringify({ l: c.lives, s: c.state }));
  // Rare chouriço restores a link and repairs a damage stage
  await p3.evaluate(() => { window.__kamikaze = false; });
  await sleep(2300);   // let the post-hit grace end
  c = await sn();
  const before = c.lives;
  await p3.evaluate(() => window.__pedro.grant(4));
  await sleep(250);
  c = await sn();
  const R = await p3.evaluate(() => REPAIR_LINES);
  c.lives === Math.min(3, before + 1) && c.damage === 3 - c.lives && R.includes(c.speech)
    ? ok(`chouriço: ${before} -> ${c.lives} links, damage stage ${c.damage}, Pedro: "${c.speech}"`) : fail('chouriço: ' + JSON.stringify({ before, l: c.lives, d: c.damage, sp: c.speech }));
  await p3.evaluate(() => window.__pedro.grant(4));
  await sleep(150);
  c = await sn();
  c.lives === 3 ? ok('chouriço at full links gives points instead (no 4th link)') : fail('lives exceeded max: ' + c.lives);
  // Donut: speed boost
  a = await sn();
  await p3.evaluate(() => window.__pedro.grant(3));
  await sleep(300);
  b = await sn();
  const ratio = b.mph / a.mph;
  b.effect === 3 && /DONUT RUSH/.test(await hud()) && ratio > 1.25 && ratio < 1.36
    ? ok(`donut boost: ${a.mph.toFixed(0)} -> ${b.mph.toFixed(0)} mph (x${ratio.toFixed(2)}), HUD shows DONUT RUSH`) : fail(`donut: effect ${b.effect}, ratio ${ratio}, hud ${await hud()}`);
  await p3.screenshot({ path: path.join(outDir, '7b-donut.png') });
  const info = (await sn()).music;
  info.on && info.notes > 0 ? ok(`background music playing (${info.notes} accordion notes scheduled)`) : fail('music not playing: ' + JSON.stringify(info));
  // Natural pickups happen in normal play (the autopilot drives the guaranteed lane where most spawn)
  if (errs.length) fail('power-up page console errors: ' + errs.join(' | ')); else ok('power-up page: no console errors');
  await p3.close();
}

// Steer into traffic with real key events (used to end runs quickly)
async function kamikaze(pg) {
  await pg.evaluate(() => {
    const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    (function tick() {
      requestAnimationFrame(tick);
      const c = window.__pedro.corridor();
      if (c.state !== 'play' || c.tweening) return;
      const row = c.rows.find((r) => r.mask && r.B > c.sigma);
      if (!row || (row.mask & (1 << c.lane))) return;
      let best = -1;
      for (let l = 0; l < 4; l++) if ((row.mask & (1 << l)) && (best < 0 || Math.abs(l - c.lane) < Math.abs(best - c.lane))) best = l;
      if (best >= 0) key(best > c.lane ? 'ArrowRight' : 'ArrowLeft');
    })();
  });
}

// --- Tailgater mirror: several at once, two stacked in one lane ---
{
  const pt = await context.newPage();
  await pt.goto(pathToFileURL(path.join(root, 'index.html')).href + '?debug&seed=21&start=2');
  await pt.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await pt.keyboard.press('Enter');
  await pt.waitForFunction(() => window.__pedro.snapshot().mph > 100, null, { timeout: 15000 });
  await pt.evaluate(() => window.__pedro.grant(2));   // invincible: this test is about the display
  const lane = (await pt.evaluate(() => window.__pedro.snapshot())).lane;
  const other = lane === 3 ? 0 : 3;
  await pt.evaluate(([a, b]) => window.__pedro.spawnTailgaters([[a, 40], [a, 68], [b, 55]]), [lane, other]);
  await pt.waitForFunction(() => { const m = window.__pedro.snapshot().mirror; return m && m.dots >= 3; }, null, { timeout: 15000 }).catch(() => {});
  const m = (await pt.evaluate(() => window.__pedro.snapshot())).mirror;
  await pt.screenshot({ path: path.join(outDir, '12-mirror-stacked.png') });
  m && m.dots === 3 && m.hot.includes(lane) && m.hot.includes(other) && m.danger && /×3/.test(m.label)
    ? ok(`mirror shows 3 tailgaters at once (2 stacked in Pedro's lane ${lane} + lane ${other}), "${m.label}", MOVE! flag on`)
    : fail('stacked mirror: ' + JSON.stringify(m));
  await pt.close();
}

// --- Audio, mute, share ---
{
  // Mobile: navigator.share is used (stubbed to capture the payload)
  const pm = await context.newPage();
  const errs = [];
  pm.on('pageerror', (e) => errs.push(e.message));
  pm.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pm.addInitScript(() => { navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; });
  await pm.goto(pathToFileURL(path.join(root, 'index.html')).href + '?seed=5');
  await pm.waitForFunction(() => window.__pedro && window.__pedro.ready);
  const cdp2 = await context.newCDPSession(pm);
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 110 }] });
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  let a = await pm.evaluate(() => window.__pedro.snapshot());
  a.audio === 'running' ? ok('WebAudio unlocked by first tap') : fail('audio state after tap: ' + a.audio);
  a.media.keepAlive ? ok(`media-playback session active after tap (audioSession: ${a.media.session}, silent <audio> keep-alive playing)`) : fail('media session not active: ' + JSON.stringify(a.media));
  await pm.keyboard.press('m');
  a = await pm.evaluate(() => window.__pedro.snapshot());
  a.muted ? ok('M toggles mute') : fail('mute did not toggle');
  await pm.reload();
  await pm.waitForFunction(() => window.__pedro && window.__pedro.ready);
  a = await pm.evaluate(() => window.__pedro.snapshot());
  const btnMuted = await pm.evaluate(() => document.getElementById('muteBtn').classList.contains('muted'));
  a.muted && btnMuted ? ok('mute persists in localStorage across reloads') : fail('mute not persisted');
  await pm.click('#muteBtn');
  a = await pm.evaluate(() => window.__pedro.snapshot());
  !a.muted && a.state === 'title' ? ok('mute button toggles without starting the run') : fail('mute button: ' + JSON.stringify({ m: a.muted, s: a.state }));
  // crash quickly, then share
  await pm.keyboard.press('Enter');
  await kamikaze(pm);
  let t0 = Date.now();
  while (Date.now() - t0 < 180000) { a = await pm.evaluate(() => window.__pedro.snapshot()); if (a.state === 'over') break; await sleep(200); }
  await sleep(300);
  await pm.tap('#shareBtn');
  await sleep(300);
  const shared = await pm.evaluate(() => window.__shared && window.__shared.text);
  const re = /^Pedro wrecked \d+\.\d\d miles into Week 1, \d+\.\d\d mi short of game night\. Score: [\d,]+\. Beat that: https:\/\/brendonegouveia-ops\.github\.io\/pedro-game\/$/;
  re.test(shared || '') ? ok(`navigator.share payload: "${shared}"`) : fail('share payload: ' + shared);
  a = await pm.evaluate(() => window.__pedro.snapshot());
  a.state === 'over' ? ok('tapping Share does not restart the run') : fail('share tap restarted the run');
  await pm.screenshot({ path: path.join(outDir, '8-gameover-share.png') });
  if (errs.length) fail('share page errors: ' + errs.join(' | '));
  await pm.close();

  // Desktop: clipboard fallback
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await dctx.addInitScript(TEST_INIT);
  await dctx.route(cdnUrl, (route) => route.fulfill({ status: 200, body: localThree, headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } }));
  const pd = await dctx.newPage();
  await pd.goto(pathToFileURL(path.join(root, 'index.html')).href + '?seed=5');
  await pd.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await pd.keyboard.press('Enter');
  await kamikaze(pd);
  t0 = Date.now();
  while (Date.now() - t0 < 180000) { a = await pd.evaluate(() => window.__pedro.snapshot()); if (a.state === 'over') break; await sleep(200); }
  await sleep(300);
  await pd.click('#shareBtn');
  await sleep(400);
  const clip = await pd.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message));
  re.test(clip) ? ok('desktop Share copies to clipboard') : fail('clipboard: ' + clip);
  const toastText = await pd.evaluate(() => document.getElementById('toast').textContent);
  /Copied/.test(toastText) ? ok('copy confirmation toast shown') : fail('toast: ' + toastText);
  await pd.screenshot({ path: path.join(outDir, '9-desktop-gameover.png') });
  await dctx.close();
}

// --- Leaderboard: local (no config) and shared (Supabase REST, mocked) ---
async function endRunQuickly(pg) {
  await pg.keyboard.press('Enter');
  await kamikaze(pg);
  await pg.waitForFunction(() => window.__pedro.snapshot().state === 'over', null, { timeout: 180000 });
  await sleep(800);
}
{
  // Local board
  const lctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await lctx.addInitScript(TEST_INIT);
  await lctx.route(cdnUrl, (route) => route.fulfill({ status: 200, body: localThree, headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } }));
  const pl = await lctx.newPage();
  const errs = [];
  pl.on('pageerror', (e) => errs.push(e.message));
  await pl.goto(pathToFileURL(path.join(root, 'index.html')).href + '?debug&lbLocal&seed=7');
  await pl.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await endRunQuickly(pl);
  const visible = await pl.isVisible('#lbName');
  visible ? ok('game over offers "Add to board" with a name field') : fail('no leaderboard form on game over');
  await pl.click('#lbName');
  await pl.keyboard.type('Ad M ');          // a/d/m/space must type, not steer / mute / restart
  let st = await pl.evaluate(() => window.__pedro.snapshot());
  const typed = await pl.inputValue('#lbName');
  st.state === 'over' && !st.muted && typed === 'Ad M ' ? ok('typing in the name field never restarts, steers or mutes') : fail(`typing leaked: state ${st.state}, muted ${st.muted}, value "${typed}"`);
  await pl.fill('#lbName', '  Pedro <b>G</b>  ');
  await pl.click('#lbSubmit');
  await pl.waitForSelector('#boardList li.me', { timeout: 10000 }).catch(() => {});
  const row = await pl.evaluate(() => { const r = document.querySelector('#boardList li.me'); return r ? r.innerText.replace(/\s+/g, ' ') : null; });
  const src = await pl.textContent('#boardSrc');
  row && row.includes('Pedro bG/b') && !row.includes('<') && /THIS DEVICE/.test(src)
    ? ok(`local board shows the new entry highlighted ("${row.trim()}", ${src.trim()}), name sanitized`) : fail(`local board row: ${row}, src ${src}`);
  await pl.screenshot({ path: path.join(outDir, '13-leaderboard-local.png') });
  await pl.keyboard.press('Escape');
  st = await pl.evaluate(() => window.__pedro.snapshot());
  const closed = await pl.isHidden('#boardScreen');
  closed && st.state === 'over' ? ok('Escape closes the board without restarting') : fail('board close: ' + JSON.stringify({ closed, s: st.state }));
  await sleep(1000);     // let localStorage flush before reloading
  await pl.reload();
  await pl.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await pl.click('#titleLbBtn');
  await pl.waitForFunction(() => document.querySelectorAll('#boardList li:not(.empty)').length > 0, null, { timeout: 5000 }).catch(() => {});
  const persisted = await pl.evaluate(() => document.getElementById('boardList').innerText);
  st = await pl.evaluate(() => window.__pedro.snapshot());
  /Pedro/.test(persisted) && st.state === 'title' ? ok('board persists across reloads and opens from the title screen without starting a run') : fail('persist: ' + persisted + ' / ' + st.state);
  await pl.click('#boardClose');
  await endRunQuickly(pl);
  const remembered = await pl.inputValue('#lbName');
  remembered === 'Pedro bGb' || remembered.startsWith('Pedro') ? ok(`name remembered for next time ("${remembered}")`) : fail('name not remembered: ' + remembered);
  if (errs.length) fail('leaderboard page errors: ' + errs.join(' | '));
  await lctx.close();
}
// Shared board: Supabase REST mocked in-memory; verifies the exact requests the game sends.
// legacy = the table has no `week` column yet (before the README's ALTER TABLE): the game must fall back.
async function sharedBoardTest(legacy) {
  const SB = 'https://test-project.supabase.co', KEY = 'sb_publishable_TESTKEY';
  const db = [{ name: 'Vovó', score: 99999, miles: 12.5, week: 3, created_at: '2026-01-01T00:00:00Z' }];
  if (legacy) delete db[0].week;
  const seen = { get: 0, post: 0, problems: [], weekErrors: 0, bodies: [] };
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await sctx.addInitScript(TEST_INIT);
  await sctx.route(cdnUrl, (route) => route.fulfill({ status: 200, body: localThree, headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } }));
  await sctx.route(SB + '/rest/v1/scores**', async (route) => {
    const req = route.request(), h = req.headers(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    const json = { ...cors, 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (h.apikey !== KEY) seen.problems.push('missing apikey');
    if (h.authorization) seen.problems.push('publishable key must not be sent as Bearer');
    if (req.method() === 'GET') {
      seen.get++;
      const u = new URL(req.url());
      if (u.searchParams.get('order') !== 'score.desc,created_at.asc' || u.searchParams.get('limit') !== '10') seen.problems.push('bad query ' + u.search);
      const cols = (u.searchParams.get('select') || '').split(',');
      if (legacy && cols.includes('week')) { seen.weekErrors++; return route.fulfill({ status: 400, headers: json, body: JSON.stringify({ code: '42703', message: 'column scores.week does not exist' }) }); }
      if (!legacy && !cols.includes('week')) seen.problems.push('GET without week column');
      const rows = [...db].sort((a, b) => b.score - a.score).slice(0, 10);
      return route.fulfill({ status: 200, headers: json, body: JSON.stringify(rows) });
    }
    if (req.method() === 'POST') {
      seen.post++;
      const body = JSON.parse(req.postData() || '{}');
      seen.bodies.push(body);
      if (h['content-type'] !== 'application/json' || h.prefer !== 'return=minimal') seen.problems.push('bad POST headers');
      if (legacy && 'week' in body) { seen.weekErrors++; return route.fulfill({ status: 400, headers: json, body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'week' column of 'scores' in the schema cache" }) }); }
      const want = legacy ? 'miles,name,score' : 'miles,name,score,week';
      if (Object.keys(body).sort().join() !== want || typeof body.score !== 'number' || (!legacy && body.week !== 1)) seen.problems.push('bad body ' + JSON.stringify(body));
      db.push({ ...body, created_at: new Date().toISOString() });
      return route.fulfill({ status: 201, headers: cors, body: '' });
    }
    route.fulfill({ status: 405, headers: cors });
  });
  const ps2 = await sctx.newPage();
  await ps2.goto(pathToFileURL(path.join(root, 'index.html')).href + `?debug&seed=7&lbUrl=${encodeURIComponent(SB)}&lbKey=${KEY}`);
  await ps2.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await endRunQuickly(ps2);
  await ps2.fill('#lbName', 'Pedro');
  await ps2.click('#lbSubmit');
  await ps2.waitForSelector('#boardList li.me', { timeout: 10000 }).catch(() => {});
  const txt = await ps2.evaluate(() => document.querySelector('.board').innerText.replace(/\s+/g, ' '));
  await ps2.screenshot({ path: path.join(outDir, legacy ? '14b-leaderboard-no-week-column.png' : '14-leaderboard-shared.png') });
  const stored = db.filter((r) => r.name === 'Pedro').length;
  if (!legacy) {
    seen.post === 1 && seen.get >= 1 && !seen.problems.length && /EVERYONE/.test(txt) && /Vovó/.test(txt) && /Week 3 · 12\.50 mi/.test(txt) && /Pedro/.test(txt) && /Week 1 ·/.test(txt)
      ? ok(`shared board: POST {name, score, miles, week} + GET with week; rows show their week ("${txt.slice(0, 90)}…")`)
      : fail('shared board: ' + JSON.stringify({ seen, txt }));
  } else {
    // a fresh page reading the board first (GET with week → 42703 → retry without)
    await ps2.reload();
    await ps2.waitForFunction(() => window.__pedro && window.__pedro.ready);
    await ps2.click('#titleLbBtn');
    await ps2.waitForFunction(() => /Pedro/.test(document.getElementById('boardList').innerText), null, { timeout: 8000 }).catch(() => {});
    const txt2 = await ps2.evaluate(() => document.getElementById('boardList').innerText.replace(/\s+/g, ' '));
    if (!/Vovó/.test(txt2) || !/Pedro/.test(txt2)) seen.problems.push('board after reload: ' + txt2);
    stored === 1 && seen.weekErrors >= 2 && !seen.problems.length && /Vovó/.test(txt) && /Pedro/.test(txt) && !/Week/.test(txt)
      ? ok(`no week column yet: insert and read fall back without it (${seen.weekErrors} rejected requests retried), board still works`)
      : fail('legacy board: ' + JSON.stringify({ stored, seen, txt }));
  }
  await sctx.close();
}
await sharedBoardTest(false);
await sharedBoardTest(true);
{
  // One-time upload of scores saved on this phone before the board went online
  const SB = 'https://test-project.supabase.co', KEY = 'sb_publishable_TESTKEY';
  const db = [{ name: 'Nick Super V6', score: 20414, miles: 7.02, created_at: '2026-01-01T00:00:00Z' }];   // already shared
  const posts = [];
  const mctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await mctx.addInitScript(TEST_INIT);
  await mctx.route(cdnUrl, (route) => route.fulfill({ status: 200, body: localThree, headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } }));
  await mctx.route(SB + '/rest/v1/scores**', async (route) => {
    const req = route.request(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    if (req.method() === 'GET') {
      let rows = [...db];
      const n = u.searchParams.get('name'), sc = u.searchParams.get('score');
      if (n) rows = rows.filter((r) => 'eq.' + r.name === n && 'eq.' + r.score === sc);
      rows.sort((a, b) => b.score - a.score);
      return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(rows.slice(0, 10)) });
    }
    const body = JSON.parse(req.postData() || '[]');
    posts.push(body);
    for (const r of [].concat(body)) db.push({ ...r, created_at: new Date().toISOString() });
    return route.fulfill({ status: 201, headers: cors, body: '' });
  });
  const pm2 = await mctx.newPage();
  // Seed the saved scores from inside the page, then reload. (Writing localStorage from an init script on file://
  // makes Chromium drop the page's own later writes on reload, e.g. the "already shared" flag this test checks.)
  const q = `?debug&seed=3&lbUrl=${encodeURIComponent(SB)}&lbKey=${KEY}`;
  await pm2.goto(pathToFileURL(path.join(root, 'index.html')).href + q);
  await pm2.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await pm2.evaluate(() => localStorage.setItem('pedro.board', JSON.stringify([
    { name: 'Nick Super V6', score: 27093, miles: 8.67 }, { name: 'Nick Super V6', score: 23378, miles: 7.58 },
    { name: 'Nick Super V6', score: 20414, miles: 7.02 }, { name: 'Nick Super V6', score: 20414, miles: 7.02 },
  ])));
  await sleep(1000);
  await pm2.reload();
  await pm2.waitForFunction(() => window.__pedro && window.__pedro.ready);
  const prompted = await pm2.waitForSelector('#lbMigrate:not(.hidden)', { timeout: 8000 }).then(() => true, () => false);
  const ptxt = prompted ? await pm2.textContent('#lbMigrateText') : '';
  prompted && /3 saved scores/.test(ptxt) ? ok(`one-time prompt on first open: "${ptxt}"`) : fail('no migration prompt: ' + ptxt);
  await pm2.screenshot({ path: path.join(outDir, '15-share-saved-scores.png') });
  await pm2.click('#lbMigrateYes');
  await pm2.waitForFunction(() => document.getElementById('lbMigrate').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  await pm2.waitForFunction(() => /27,093/.test(document.getElementById('boardList').innerText), null, { timeout: 8000 }).catch(() => {});
  const uploaded = posts.flat();
  const list = await pm2.evaluate(() => document.getElementById('boardList').innerText.replace(/\s+/g, ' '));
  posts.length === 1 && uploaded.length === 2 && uploaded.every((r) => r.name === 'Nick Super V6') && !uploaded.some((r) => r.score === 20414) && /27,093/.test(list) && /23,378/.test(list)
    ? ok(`uploaded 2 saved scores in one request, skipped the duplicate already on the board; board: "${list.slice(0, 90)}…"`)
    : fail('migration upload: ' + JSON.stringify({ posts, list }));
  await sleep(1500);     // let Chromium flush localStorage before reloading (a reload right after a write can lose it under load)
  await pm2.reload();
  await pm2.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await sleep(1500);
  const again = await pm2.isVisible('#boardScreen');
  !again ? ok('never asks again after sharing')
    : fail('migration prompt reappeared; storage: ' + await pm2.evaluate(() => JSON.stringify({ shared: localStorage.getItem('pedro.boardShared'), board: (localStorage.getItem('pedro.board') || '').length })));
  await mctx.close();
}

// --- Mile sign renders near a mile marker ---
{
  const ps = await context.newPage();
  await ps.goto(pathToFileURL(path.join(root, 'index.html')).href + '?seed=31&debug&start=1.87');
  await ps.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await ps.keyboard.press('Enter');
  await ps.evaluate(() => window.__pedro.grant(2));   // invincible so it survives to the sign
  const reached = await ps.waitForFunction(() => window.__pedro.snapshot().miles >= 1.97, null, { timeout: 120000 }).then(() => true, () => false);
  await ps.screenshot({ path: path.join(outDir, '10-mile-sign.png') });
  reached ? ok('mile-sign screenshot captured (tools/out/10-mile-sign.png)')
    : fail('mile sign: never reached mile 1.97: ' + JSON.stringify(await ps.evaluate(() => window.__pedro.snapshot())));
  await ps.close();
}

// --- Extra checks registered by later increments ---
const extra = await page.evaluate(() => (window.__pedro.selfTest ? window.__pedro.selfTest() : []));
for (const r of extra) (r.pass ? ok : fail)(r.name + (r.detail ? ' — ' + r.detail : ''));

await page.screenshot({ path: path.join(outDir, '2-play.png') });


if (consoleErrors.length) fail('console errors:\n    ' + consoleErrors.join('\n    '));
else ok('no console errors');

await browser.close();
console.log(failures.length ? `\nSMOKE FAILED (${failures.length})` : '\nSMOKE PASSED', '— screenshots in tools/out/');
process.exit(failures.length ? 1 : 0);
