// Headless smoke test: builds nothing, expects `vite preview` (or any server) at BASE.
// Usage: node tools/smoke.mjs [baseUrl] [outDir]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? 'test-results';
fs.mkdirSync(OUT, { recursive: true });

const fail = (m) => {
  console.error('FAIL', m);
  process.exitCode = 1;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// /api/* 404s are expected under `vite preview` (no Pages Functions there).
page.on('console', (m) => m.type() === 'error' && !/\/api\//.test(m.location()?.url ?? '') && errors.push(m.text()));

await page.goto(BASE);
await page.waitForFunction(() => window.__nick?.scene?.sim);
await page.screenshot({ path: `${OUT}/01-title.png` });

await page.tap('#startBtn');
await page.waitForSelector('#help[data-open]');
await page.screenshot({ path: `${OUT}/02-help.png` });
await page.tap('#help .close');
await page.waitForFunction(() => window.__nick.scene.running);
// Headless software GL renders slowly; run game time at 1/4 so timing windows stay testable.
await page.evaluate(() => (window.__nick.scene.timeScale = 0.25));

// Map design coords -> page coords via the canvas rect.
const toPage = async (x, y) =>
  page.evaluate(([x, y]) => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    return { x: c.left + (x / 390) * c.width, y: c.top + (y / 844) * c.height };
  }, [x, y]);
const tapDesign = async (x, y) => {
  const p = await toPage(x, y);
  await page.touchscreen.tap(p.x, p.y);
};

// Speed through the morning deterministically from inside the page.
const sim = (fn, arg) => page.evaluate(fn, arg);
await page.waitForFunction(() => window.__nick.scene.sim.requests.length > 0, null, { timeout: 40000 });
await page.screenshot({ path: `${OUT}/03-first-request.png` });

// Tap the first request bubble through the real input path.
const bubble = await sim(() => {
  const s = window.__nick.scene;
  const [id, b] = [...s.bubbles.entries()][0];
  return { id, x: b.pos.x, y: b.pos.y };
});
await tapDesign(bubble.x, bubble.y);
const queued = await sim(() => window.__nick.scene.sim.queue.length);
if (queued < 1) fail('tapping a bubble did not queue anything');
await page.waitForFunction(() => window.__nick.scene.sim.interaction, null, { timeout: 20000 });

// Resolve the first panel through real touch, whatever it is.
const cdp = await ctx.newCDPSession(page);
const touch = async (type, x, y) => {
  const p = await toPage(x, y);
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y }] });
};
const tapPanel = async (x = 195, y = 683) => {
  await touch('touchStart', x, y);
  await touch('touchEnd', x, y);
};
await page.waitForTimeout(300);
await sim(() => window.__nick.scene.sim.skipInteraction());

// Every gesture, end to end: inject a request, queue it, perform the gesture with touch events.
await sim(() => {
  const s = window.__nick.scene.sim;
  for (const a of Object.values(s.actors)) a.nextReq = 1e9;
  s.dog.nextAction = 1e9;
  s.thermostatAt = Infinity;
  s.queue.length = 0;
  s.requests.length = 0;
  for (const a of Object.values(s.actors)) a.req = null;
  s.interaction = null;
  s.nick.hop = null;
  s.nick.room = 'living';
  s.nick.coffee = 1;
  for (const id of ['evelyn', 'tyler']) Object.assign(s.actors[id], { present: true, room: 'living', state: 'idle' });
});
const inject = (spec) =>
  sim((spec) => {
    const s = window.__nick.scene.sim;
    const r = { id: 5000 + Math.floor(Math.random() * 1e6), patience: 999, left: 999, ...spec };
    s.requests.push(r);
    for (const k of r.kids ?? [r.owner]) if (s.actors[k] && k !== 'eloise') s.actors[k].req = r.id;
    if (r.hand) s.nick.hand = r.hand;
    s.tapRequest(r.id);
    return r.id;
  }, spec);
const waitPanel = (kind) =>
  page.waitForFunction((k) => window.__nick.scene.sim.interaction?.kind === k, kind, { timeout: 20000 });
const gone = (id) => sim((id) => !window.__nick.scene.sim.requests.some((r) => r.id === id), id);
const check = async (label, id) => {
  await page.waitForTimeout(200);
  if (!(await gone(id))) fail(`${label}: request still open`);
  else console.log('ok', label);
};

{ // TAP: hand over a snack
  const id = await inject({ kind: 'snack', owner: 'evelyn', room: 'living', hand: 'snack' });
  await waitPanel('tap');
  await tapPanel();
  await check('tap', id);
}
{ // HOLD
  const id = await inject({ kind: 'watch_this', owner: 'evelyn', room: 'living' });
  await waitPanel('hold');
  await page.screenshot({ path: `${OUT}/04-action-panel.png` });
  await touch('touchStart', 195, 683);
  await page.waitForFunction((id) => !window.__nick.scene.sim.requests.some((r) => r.id === id), id, { timeout: 30000 }).catch(() => {});
  await touch('touchEnd', 195, 683);
  await check('hold', id);
}
{ // CHOICE -> RUB (band-aid)
  const id = await inject({ kind: 'booboo', owner: 'tyler', room: 'living', hand: 'bandaid' });
  await waitPanel('choice');
  await page.screenshot({ path: `${OUT}/04b-choice.png` });
  await tapPanel(105, 683);
  await waitPanel('rub');
  await touch('touchStart', 80, 683);
  for (let i = 0; i < 12 && !(await gone(id)); i++) {
    for (let x = 80; x <= 310; x += 46) await touch('touchMove', x, 683 + (i % 2) * 4);
    for (let x = 310; x >= 80; x -= 46) await touch('touchMove', x, 683);
  }
  await touch('touchEnd', 80, 683);
  await check('choice+rub', id);
}
{ // SWIPE (spill)
  const id = await inject({ kind: 'spill', owner: 'eloise', room: 'living', x: 0.6, y: 0.8, dir: 'left' });
  await waitPanel('swipe');
  await page.screenshot({ path: `${OUT}/04c-swipe.png` });
  await touch('touchStart', 280, 683);
  for (let x = 260; x >= 120; x -= 35) await touch('touchMove', x, 685);
  await touch('touchEnd', 120, 685);
  await check('swipe', id);
}
{ // CHOICE (screen time: No)
  const id = await inject({ kind: 'screen_time', owner: 'evelyn', room: 'living' });
  await waitPanel('choice');
  await tapPanel(285, 683);
  await check('choice', id);
}
{ // MULTI (fight: tap each kid)
  const id = await inject({ kind: 'fight', owner: 'evelyn', kids: ['evelyn', 'tyler'], room: 'living' });
  await waitPanel('multi');
  await page.screenshot({ path: `${OUT}/04d-fight.png` });
  await tapPanel(105, 683);
  await tapPanel(285, 683);
  await check('multi', id);
}
{ // MASH (grill flip) - Nick walks to the backyard first
  const id = await sim(() => {
    const s = window.__nick.scene.sim;
    const r = { id: 7777, kind: 'flip', owner: 'grill', room: 'backyard', patience: 999, left: 999 };
    s.requests.push(r);
    s.tapRequest(r.id);
    return r.id;
  });
  await waitPanel('mash');
  await page.screenshot({ path: `${OUT}/04e-mash.png` });
  await sim(() => (window.__nick.scene.timeScale = 0.05)); // CDP taps are ~1 s apart under software GL
  for (let i = 0; i < 9; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await toPage(195, 683)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await check('mash', id);
  await sim(() => (window.__nick.scene.timeScale = 0.25));
}

// Jump to the nap with Nora, Tyler and Eloise in play.
await sim(() => {
  const s = window.__nick.scene.sim;
  while (s.t < 245 && !s.over) {
    s.update(0.1);
    s.chaos = Math.min(s.chaos, 40);
    window.__nick.scene.handleEvents?.(s.drainEvents());
  }
  s.drainEvents();
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-nap.png` });

// Dad joke via the ability bar.
await sim(() => { const s = window.__nick.scene; s.textQueue.length = 0; });
await tapDesign(58, 806);
await page.waitForFunction(() => window.__nick.scene.jokeCard.visible && window.__nick.scene.jokeCard.alpha > 0.9);
await page.screenshot({ path: `${OUT}/06-dad-joke.png` });
if (!(await sim(() => window.__nick.scene.sim.frozen))) fail('dad joke did not freeze');

// FaceTime.
await sim(() => {
  const s = window.__nick.scene.sim;
  while (s.t < 361.5 && !s.over) {
    s.update(0.1);
    s.chaos = Math.min(s.chaos, 40);
  }
  s.drainEvents();
});
await page.waitForFunction(() => window.__nick.scene.sim.facetime.prompt, null, { timeout: 20000 });
await page.screenshot({ path: `${OUT}/07-facetime.png` });
const missedBefore = await sim(() => window.__nick.scene.sim.facetime.missed);
const promptId = await sim(() => window.__nick.scene.sim.facetime.prompt.id);
const uh = await toPage(229, 552 - 40);
await page.touchscreen.tap(uh.x, uh.y);
const after = await sim(() => ({ p: window.__nick.scene.sim.facetime.prompt?.id ?? null, m: window.__nick.scene.sim.facetime.missed }));
if (after.p === promptId || after.m !== missedBefore) fail('uh-huh tap missed ' + JSON.stringify(after));

// Pause on blur / visibility.
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.waitForSelector('#pause[data-open]');
await page.screenshot({ path: `${OUT}/08-pause.png` });
await page.tap('#resumeBtn');

// Game over -> end card.
await sim(() => window.__nick.scene.sim.addChaos(200, 'smoke'));
await page.waitForSelector('#end[data-open]', { timeout: 5000 });
await page.screenshot({ path: `${OUT}/09-end.png` });

// Leaderboard (only when Pages Functions are being served).
const hasApi = await page.evaluate(async () => (await fetch('/api/scores')).ok);
if (hasApi) {
  // The fast-forwarded run claims ~6 game hours in well under 6 real minutes: must be refused.
  await page.fill('#nameInput', 'Smoke Test');
  await page.tap('#submitBtn');
  await page.waitForFunction(() => /Couldn|offline/.test(document.getElementById('submitMsg').textContent));
  console.log('cheat rejected:', await page.textContent('#submitMsg'));
  // An honest short run: ~12 real seconds, then post.
  await page.tap('#againBtn');
  await page.evaluate(() => (window.__nick.scene.timeScale = 1));
  await page.waitForFunction(() => window.__nick.scene.sim.t >= 12, null, { timeout: 60000 });
  await sim(() => window.__nick.scene.sim.addChaos(200, 'cry'));
  await page.waitForSelector('#end[data-open]', { timeout: 10000 });
  await page.tap('#submitBtn');
  await page.waitForFunction(() => /#\d+/.test(document.getElementById('submitMsg').textContent), null, { timeout: 10000 });
  console.log('posted:', await page.textContent('#submitMsg'));
  if (!(await page.$('#endBoard li.me'))) fail('own score not highlighted');
  await page.screenshot({ path: `${OUT}/09b-leaderboard.png` });
} else console.log('no /api: leaderboard checks skipped');

// Landscape phone -> rotate overlay.
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(300);
const rot = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
if (rot !== 'flex') fail('rotate overlay not shown in landscape');
await page.screenshot({ path: `${OUT}/10-rotate.png` });

if (errors.length) fail('page errors:\n' + errors.join('\n'));
await browser.close();
console.log(process.exitCode ? 'smoke FAILED' : 'smoke OK');
