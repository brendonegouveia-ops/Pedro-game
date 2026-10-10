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
  await page.screenshot({ path: path.join(outDir, '4-gameover.png') });
  await sleep(700);
  await page.keyboard.press(' '); await sleep(250);
  s = await snap();
  s.state === 'play' && s.miles < 0.05 && s.seed !== 12345 ? ok(`Space restarts instantly; ?seed only replays the first run (new seed ${s.seed})`) : fail('restart failed: ' + JSON.stringify(s));
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
  st.state === 'play'
    ? ok(`autopilot ${label}: no crash over ${((Date.now() - t0) / 1000).toFixed(0)} s, ${st.miles.toFixed(2)} mi, ${st.mph.toFixed(0)} mph, ${st.nearMisses} close calls, ${st.powerups} power-ups`)
    : fail(`autopilot ${label}: crashed at ${st.miles.toFixed(2)} mi (seed ${st.seed})`);
  st.hits === 0 ? ok(`autopilot ${label}: zero hits, all 3 links intact`) : fail(`autopilot ${label}: took ${st.hits} hit(s) following the guaranteed lane`);
  if (expect) expect(st);
  if (errs.length) fail(`autopilot ${label} console errors: ` + errs.join(' | '));
  await p2.close();
  return st;
}
const QUICK = process.argv.includes('--quick');   // skip the long autopilot runs
if (!QUICK) await autopilot('milestone', '?debug&seed=777&start=9.8', 25, (st) => {
  st.goal >= 1 ? ok('passed 10 mi: "PEDRO MADE IT TO GAME NIGHT!" banner fired') : fail('milestone not reached');
  st.musicStyle === 'dubstep' ? ok("music switched to dubstep at Carlson's house") : fail('music style after game night: ' + st.musicStyle);
  st.hudLabel === 'DROP-OFF AT CVS' ? ok('HUD now counts down to the CVS drop-off') : fail('HUD label after game night: ' + st.hudLabel);
  st.nearMisses > 0 ? ok(`near-miss bonus awarded (${st.nearMisses})`) : fail('no near misses recorded');
});
if (!QUICK) await autopilot('start', '?debug&seed=4242', 30);
if (!QUICK) await autopilot('brutal', '?debug&seed=4243&start=12', 40, (st) => {
  const tw = st.firstTailWarn;
  if (!tw) { fail('no tailgater mirror seen in 40 s at full difficulty'); return; }
  const m = tw.first;
  m.bottom < m.vh * 0.3 ? ok(`tailgater mirror stays in the top of the screen (bottom ${m.bottom.toFixed(0)}px of ${m.vh}px), off the road`) : fail('mirror too low: ' + JSON.stringify(m));
  /TAILGATERS/.test(m.label) ? ok(`general alert shown: "${m.label}"`) : fail('mirror label: ' + m.label);
  tw.mismatches === 0 ? ok(`mirror matched the real tailgaters (dots + lanes) on all ${tw.checks} checks; most at once: ${tw.max.truth} in lane(s) ${tw.max.truthLanes.join(',')}`)
    : fail(`mirror disagreed with the hazard list on ${tw.mismatches}/${tw.checks} checks`);
});

// --- Goal chain + coins ---
{
  const pg = await context.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  const goalAt = async (start) => {
    await pg.goto(pathToFileURL(path.join(root, 'index.html')).href + `?debug&seed=5&start=${start}`);
    await pg.waitForFunction(() => window.__pedro && window.__pedro.ready);
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => window.__pedro.snapshot().mph > 100, null, { timeout: 15000 });
    await pg.evaluate(() => window.__pedro.grant(2));     // invincible: we're testing goals, not dodging
  };
  let g = await (async () => { await goalAt(0.5); return pg.evaluate(() => window.__pedro.snapshot()); })();
  g.hudLabel === 'TO GAME NIGHT' && g.musicStyle === 'folk' ? ok('start: HUD "TO GAME NIGHT", folk music') : fail('start: ' + g.hudLabel + ' / ' + g.musicStyle);
  // Coins: a trail in Pedro's lane, all collected -> coin count, HUD counter, full-trail bonus
  const before = g.score;
  await pg.evaluate(() => window.__pedro.spawnCoins(window.__pedro.snapshot().lane, 30, 4));
  await pg.waitForFunction(() => window.__pedro.snapshot().coins >= 4, null, { timeout: 30000 }).catch(() => {});
  g = await pg.evaluate(() => window.__pedro.snapshot());
  const coinHud = await pg.textContent('#hudCoinsVal');
  g.coins === 4 && coinHud === '4' ? ok(`coins: collected a 4-coin trail, HUD shows 🪙 ${coinHud}`) : fail(`coins: ${g.coins}, HUD ${coinHud}`);
  await pg.screenshot({ path: path.join(outDir, '17-coins.png') });
  // CVS at 15 mi
  await goalAt(14.96);
  await pg.waitForFunction(() => window.__pedro.snapshot().goal >= 2, null, { timeout: 30000 }).catch(() => {});
  g = await pg.evaluate(() => window.__pedro.snapshot());
  let banner = await pg.evaluate(() => document.getElementById('banner').innerText.replace(/\s+/g, ' '));
  await pg.screenshot({ path: path.join(outDir, '18-goal-cvs.png') });
  g.goal === 2 && /CVS/.test(banner) && g.hudLabel === 'TO FALL RIVER' && g.musicStyle === 'dubstep'
    ? ok(`15 mi: "${banner.slice(0, 70)}…", HUD now "TO FALL RIVER", still dubstep`) : fail(`CVS goal: ${JSON.stringify({ goal: g.goal, banner, label: g.hudLabel, style: g.musicStyle })}`);
  // Fall River at 20 mi
  await goalAt(19.96);
  await pg.waitForFunction(() => window.__pedro.snapshot().goal >= 3, null, { timeout: 30000 }).catch(() => {});
  g = await pg.evaluate(() => window.__pedro.snapshot());
  banner = await pg.evaluate(() => document.getElementById('banner').innerText.replace(/\s+/g, ' '));
  g.goal === 3 && /FALL RIVER/i.test(banner) && g.hudLabel === 'PAST FALL RIVER'
    ? ok(`20 mi: "${banner.slice(0, 60)}…", HUD now "PAST FALL RIVER"`) : fail(`Fall River goal: ${JSON.stringify({ goal: g.goal, banner, label: g.hudLabel })}`);
  if (errs.length) fail('goal page errors: ' + errs.join(' | ')); else ok('goal/coin page: no errors');
  await pg.close();
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
  const re = /^I got Pedro \d+\.\d\d miles toward game night\. Score: [\d,]+\. Beat that: https:\/\/brendonegouveia-ops\.github\.io\/pedro-game\/$/;
  re.test(shared || '') ? ok(`navigator.share payload: "${shared}"`) : fail('share payload: ' + shared);
  a = await pm.evaluate(() => window.__pedro.snapshot());
  a.state === 'over' ? ok('tapping Share does not restart the run') : fail('share tap restarted the run');
  await pm.screenshot({ path: path.join(outDir, '8-gameover-share.png') });
  if (errs.length) fail('share page errors: ' + errs.join(' | '));
  await pm.close();

  // Desktop: clipboard fallback
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
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
{
  // Shared board: Supabase REST mocked in-memory; verifies the exact requests the game sends
  const SB = 'https://test-project.supabase.co', KEY = 'sb_publishable_TESTKEY';
  const db = [{ name: 'Vovó', score: 99999, miles: 12.5, created_at: '2026-01-01T00:00:00Z' }];
  const seen = { get: 0, post: 0, problems: [] };
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await sctx.route(cdnUrl, (route) => route.fulfill({ status: 200, body: localThree, headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' } }));
  await sctx.route(SB + '/rest/v1/scores**', async (route) => {
    const req = route.request(), h = req.headers(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (h.apikey !== KEY) seen.problems.push('missing apikey');
    if (h.authorization) seen.problems.push('publishable key must not be sent as Bearer');
    if (req.method() === 'GET') {
      seen.get++;
      const u = new URL(req.url());
      if (u.searchParams.get('order') !== 'score.desc,created_at.asc' || u.searchParams.get('limit') !== '10') seen.problems.push('bad query ' + u.search);
      const rows = [...db].sort((a, b) => b.score - a.score).slice(0, 10);
      return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(rows) });
    }
    if (req.method() === 'POST') {
      seen.post++;
      const body = JSON.parse(req.postData() || '{}');
      if (h['content-type'] !== 'application/json' || h.prefer !== 'return=minimal') seen.problems.push('bad POST headers');
      if (Object.keys(body).sort().join() !== 'miles,name,score' || typeof body.score !== 'number') seen.problems.push('bad body ' + JSON.stringify(body));
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
  await ps2.screenshot({ path: path.join(outDir, '14-leaderboard-shared.png') });
  seen.post === 1 && seen.get >= 1 && !seen.problems.length && /EVERYONE/.test(txt) && /Vovó/.test(txt) && /Pedro/.test(txt)
    ? ok(`shared board: POST + GET to Supabase REST with correct headers/query/body; shows everyone's scores ("${txt.slice(0, 80)}…")`)
    : fail('shared board: ' + JSON.stringify({ seen, txt }));
  await sctx.close();
}
{
  // One-time upload of scores saved on this phone before the board went online
  const SB = 'https://test-project.supabase.co', KEY = 'sb_publishable_TESTKEY';
  const db = [{ name: 'Nick Super V6', score: 20414, miles: 7.02, created_at: '2026-01-01T00:00:00Z' }];   // already shared
  const posts = [];
  const mctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
  await pm2.addInitScript(() => {
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('seeded', '1');
      localStorage.setItem('pedro.board', JSON.stringify([
        { name: 'Nick Super V6', score: 27093, miles: 8.67 }, { name: 'Nick Super V6', score: 23378, miles: 7.58 },
        { name: 'Nick Super V6', score: 20414, miles: 7.02 }, { name: 'Nick Super V6', score: 20414, miles: 7.02 },
      ]));
    }
  });
  const q = `?debug&seed=3&lbUrl=${encodeURIComponent(SB)}&lbKey=${KEY}`;
  await pm2.goto(pathToFileURL(path.join(root, 'index.html')).href + q);
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
  await pm2.reload();
  await pm2.waitForFunction(() => window.__pedro && window.__pedro.ready);
  await sleep(1500);
  const again = await pm2.isVisible('#boardScreen');
  !again ? ok('never asks again after sharing') : fail('migration prompt reappeared');
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
