// Headless fairness check: loads the core script out of index.html (no browser), generates
// spawn rows from several seeds, and verifies the FAIRNESS INVARIANT with code that does
// NOT reuse the spawner's own validation:
//
//   A. Per-row corridor: the row's guaranteed-open lane g_k is free of every hazard (any row)
//      whose hitbox interval touches the row span, and |g_k - g_{k-1}| lane changes fit in
//      the clear gap before the row at the speed Pedro will be doing.
//   B. Global brute force: a dynamic program over the whole run (0.25 m grid, all hazards,
//      lane changes occupy both lanes for laneChange+reaction time) must find a survivable
//      path from the start lane to the end of the last row.
//
// Every week (level) is checked separately: later weeks start further up the difficulty curve and top out
// faster. The week scaling is re-derived here from CONFIG too, not taken from the core.
//
// Road closures, snowplows and black ice are checked too: a closure blocks its lane for its whole stretch
// (gaps included), and the guaranteed lane must never run through black ice.
//
//   node fairness.mjs [rowsPerSeed=1000] [seeds=10] [--weeks=1,2,3,4,...]
//   --mutate[=reach|closure|ice]   sabotage one spawner rule; the checker must catch it
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
let coreSrc = html.match(/<script id="pedro-core">([\s\S]*?)<\/script>/)[1];
// --mutate: sabotage the spawner's reachability rule to prove this checker catches violations.
const mutArg = process.argv.find((a) => a.startsWith('--mutate'));
const MUTATE = mutArg ? (mutArg.split('=')[1] || 'reach') : null;
if (MUTATE) {
  const targets = {
    reach: ['Math.abs(l - gPrev) <= budget) openLanes', 'true) openLanes'],
    closure: ['count = 0; mask = closedMask;', 'count = 0; mask = 0;'],
    ice: ['            mask |= 1 << lane;\n            count++;\n          }\n        }\n        // Row span', '            count++;\n          }\n        }\n        // Row span'],
  };
  const [from, to] = targets[MUTATE];
  const before = coreSrc;
  coreSrc = coreSrc.replace(from, to);
  if (coreSrc === before) throw new Error('mutation target not found: ' + MUTATE);
}
const ctx = vm.createContext({ Math, Infinity, Float64Array, Int8Array, Uint8Array });
const { CONFIG, Core } = vm.runInContext(coreSrc + '\n;({ CONFIG, Core: PedroCore })', ctx);

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ROWS = parseInt(args[0] || '1000', 10);
const SEEDS = parseInt(args[1] || '10', 10);
const MPM = 1609.344, MPH = 0.44704;

// ---- Independent re-derivations from CONFIG (not calling the spawner's helpers) ----
const NAMES = ['sedan', 'truck', 'debris', 'changer', 'tailgater', 'powerup', 'coin', 'closure', 'plow', 'ice'];
const PHL = CONFIG.playerSize[1] * CONFIG.hitboxScale / 2;
function kOf(type) {
  const n = NAMES[type];
  if (n === 'debris' || n === 'closure' || n === 'ice') return 0;
  if (n === 'tailgater') return CONFIG.tailgaterSpeedFrac;
  if (n === 'plow') return CONFIG.plowSpeedFrac;
  return CONFIG.trafficSpeedFrac;
}
function lenOf(type) { return NAMES[type] === 'powerup' ? 1.6 : CONFIG.hazardSize[NAMES[type]][1]; }
// Blocking half-span in sigma. Closures have a per-hazard length (reported by the spawner; checked for
// consistency with the collision length); ice uses the full patch length (it's avoided, not collided with).
function hsOf(h, problems) {
  const n = NAMES[h.type];
  if (n === 'closure') {
    if (Math.abs(h.hs - (PHL + h.hl)) > 1e-6) problems.push(`closure (row ${h.row}): span ${h.hs} != hitbox ${PHL + h.hl}`);
    return h.hs;
  }
  if (n === 'ice') {
    if (h.l < CONFIG.iceMeters[0] - 1e-9 || h.l > CONFIG.iceMeters[1] + 1e-9) problems.push(`ice (row ${h.row}): length ${h.l} outside iceMeters`);
    return PHL + h.l / 2;
  }
  return ((CONFIG.playerSize[1] + lenOf(h.type)) * CONFIG.hitboxScale / 2) / Math.abs(1 - kOf(h.type));
}
// ---- Week scaling, re-derived ----
let OFFSET = 0, TOP = CONFIG.maxSpeedMph;
function setWeekLocal(w) {
  const p = CONFIG.difficultyCurve, d0 = p[0][1];
  const target = Math.min(d0 + CONFIG.weekDifficultyStep * (w - 1), Math.max(d0, CONFIG.weekDifficultyCap));
  // invert the piecewise-linear curve by bisection (independent of the core's closed form)
  let lo = 0, hi = p[p.length - 1][0];
  if (target <= d0) hi = 0;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (curve(m) < target) lo = m; else hi = m; }
  OFFSET = hi;
  TOP = Math.max(CONFIG.maxSpeedMph, Math.min(CONFIG.maxSpeedMph + CONFIG.weekTopSpeedStepMph * (w - 1), CONFIG.weekTopSpeedCapMph));
}
function diffOf(miles) { return curve(miles + OFFSET); }
function curve(miles) {
  const p = CONFIG.difficultyCurve;
  if (miles <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (miles <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (miles - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
  return p[p.length - 1][1];
}
function vOf(sigma) { const d = diffOf(sigma / MPM); return (CONFIG.startSpeedMph + (TOP - CONFIG.startSpeedMph) * d) * MPH; }
// Rows are validated as if Pedro is boosted by a donut (fastest he can go), so check at that speed.
const LC = (CONFIG.laneChangeMs / 1000 + CONFIG.reactionSec) * CONFIG.donutSpeedMult;
const EPS = 1e-6;

function runSeed(seed) {
  const sp = Core.createSpawner(seed, CONFIG.startLane);
  const H = [];   // {type, mask, lo, hi, row}
  const R = [];   // {A, B, g, gPrev, fallback}
  const violations = [], counts = {};
  const openClosures = new Set();
  const collect = (h) => {
    const hs = hsOf(h, violations);
    H.push({ type: h.type, mask: (1 << h.lane) | (1 << h.lane2), lo: h.sigma - hs, hi: h.sigma + hs, row: h.row });
    counts[NAMES[h.type]] = (counts[NAMES[h.type]] || 0) + 1;
    h.active = false;   // simulate despawn so the pool recycles
  };
  for (let r = 0; r < ROWS; r++) {
    const row = sp.generateRow();
    R.push({ A: row.A, B: row.B, g: row.g, gPrev: row.gPrev, fallback: row.fallback, count: row.count });
    for (const h of sp.hazards) {
      if (!h.active) continue;
      if (h.type === 5 || h.type === 6) { h.active = false; continue; } // power-ups and coins never block
      if (NAMES[h.type] === 'closure') { openClosures.add(h); continue; } // still growing; collected once it ends
      collect(h);
    }
    for (const h of openClosures) if (sp.cl.h !== h) { collect(h); openClosures.delete(h); }
  }
  for (const h of openClosures) collect(h);

  // ---- A. per-row corridor ----
  let prevB = CONFIG.startClearMeters, prevG = CONFIG.startLane;
  H.sort((a, b) => a.lo - b.lo);
  const longOnes = H.filter((h) => NAMES[h.type] === 'closure');
  let j0 = 0;
  for (let r = 0; r < R.length; r++) {
    const row = R[r];
    if (row.gPrev !== prevG) violations.push(`row ${r}: chain broken (gPrev ${row.gPrev} != ${prevG})`);
    const gap = row.A - prevB;
    if (gap < -EPS) violations.push(`row ${r}: overlaps previous row by ${(-gap).toFixed(2)} m`);
    const need = Math.abs(row.g - prevG) * vOf(row.A) * LC;
    if (need > gap + EPS) violations.push(`row ${r}: open lane ${row.g} unreachable from ${prevG} (needs ${need.toFixed(1)} m, gap ${gap.toFixed(1)} m)`);
    while (j0 < H.length && H[j0].hi < prevB - 200 && NAMES[H[j0].type] !== 'closure') j0++;
    for (let j = j0; j < H.length && H[j].lo <= row.B; j++) {
      const h = H[j];
      if (h.hi < row.A - EPS || h.lo > row.B + EPS) continue;
      if (h.mask & (1 << row.g)) violations.push(`row ${r}: guaranteed lane ${row.g} blocked by ${NAMES[h.type]} (row ${h.row})`);
    }
    // Moving from prevG to g during the gap: no long blocker (closure) may cover any lane crossed on the way.
    const lanesCrossed = (((1 << (Math.max(prevG, row.g) + 1)) - 1) >> Math.min(prevG, row.g)) << Math.min(prevG, row.g);
    for (const h of longOnes) {
      if (h.hi <= prevB + EPS || h.lo >= row.A - EPS) continue;
      if (h.mask & lanesCrossed) violations.push(`row ${r}: gap move ${prevG}→${row.g} crosses a closure in lane ${Math.log2(h.mask & -h.mask)} (row ${h.row})`);
    }
    prevB = row.B; prevG = row.g;
  }
  for (const h of H) {
    const row = R[h.row];
    if (NAMES[h.type] === 'closure') {      // starts exactly at its first row, ends exactly at the end of a row
      if (Math.abs(h.lo - row.A) > 1e-6) violations.push(`row ${h.row}: closure starts at ${h.lo.toFixed(1)}, not at the row start ${row.A.toFixed(1)}`);
      if (!R.some((x) => Math.abs(x.B - h.hi) < 1e-6) && Math.abs(h.hi - (row.A + 2 * PHL + 6)) > 1e-6) violations.push(`row ${h.row}: closure ends mid-gap`);
      continue;
    }
    if (h.lo < row.A - EPS || h.hi > row.B + EPS) violations.push(`row ${h.row}: ${NAMES[h.type]} interval outside row span`);
  }

  // ---- B. global brute-force DP ----
  const step = 0.25;
  const end = R[R.length - 1].B + 5;
  const N = Math.ceil(end / step) + 2;
  const lanes = CONFIG.lanes;
  const pref = [];  // prefix sums of blocked cells per lane
  for (let l = 0; l < lanes; l++) {
    const b = new Uint8Array(N);
    for (const h of H) if (h.mask & (1 << l)) {
      const a = Math.max(0, Math.floor(h.lo / step)), z = Math.min(N - 1, Math.ceil(h.hi / step));
      for (let i = a; i <= z; i++) b[i] = 1;
    }
    const p = new Int32Array(N + 1);
    for (let i = 0; i < N; i++) p[i + 1] = p[i] + b[i];
    pref.push(p);
  }
  const free = (l, a, z) => pref[l][Math.min(N, z + 1)] - pref[l][a] === 0; // cells a..z free
  const reach = [];
  for (let l = 0; l < lanes; l++) reach.push(new Uint8Array(N));
  reach[CONFIG.startLane][0] = 1;
  let lastReach = 0;
  for (let i = 0; i < N - 1; i++) {
    let any = false;
    for (let l = 0; l < lanes; l++) {
      if (!reach[l][i]) continue;
      any = true;
      if (free(l, i + 1, i + 1)) reach[l][i + 1] = 1;
      const n = Math.ceil((vOf(i * step) * LC) / step);
      for (const l2 of [l - 1, l + 1]) {
        if (l2 < 0 || l2 >= lanes || i + n >= N) continue;
        if (free(l, i, i + n) && free(l2, i, i + n)) reach[l2][i + n] = 1;
      }
    }
    if (any) lastReach = i;
  }
  const survivable = reach.some((r) => r[N - 1]);
  if (!survivable) violations.push(`global DP: no survivable path past sigma=${(lastReach * step).toFixed(1)} m`);

  const miles = R[R.length - 1].B / MPM;
  return { seed, rows: R.length, hazards: H.length, fallbacks: sp.fallbacks, retries: sp.retries, miles, violations, survivable, counts };
}

// ---- Difficulty curve timing (sanity, week 1) ----
setWeekLocal(1); Core.setWeek(1);
{
  let s = 0, t = 0;
  const marks = [30, 60, 120, 180, 240];
  const out = [];
  for (let mi = 0; mi < marks.length; t += 0.01) {
    s += vOf(s) * 0.01;
    if (t >= marks[mi]) { out.push(`${marks[mi]}s: ${(s / MPM).toFixed(2)} mi, difficulty ${diffOf(s / MPM).toFixed(2)}, ${(vOf(s) / MPH).toFixed(0)} mph`); mi++; }
  }
  console.log('Difficulty timeline (uninterrupted run):\n  ' + out.join('\n  '));
}

const weeksArg = process.argv.find((a) => a.startsWith('--weeks='));
// default: every fixed week, the first rotating rain and snow weeks, and a late week
const WEEKS = weeksArg ? weeksArg.slice(8).split(',').map(Number) : (() => {
  const w = [1, 2, 3, 4];
  for (const kind of ['rain', 'snow']) { let x = 5; while (Core.weatherOf(x) !== kind) x++; w.push(x); }
  if (!w.includes(11)) w.push(11);
  return w.sort((a, b) => a - b);
})();
let total = 0, bad = 0, fallbacks = 0, retries = 0;
const t0 = Date.now();
for (const wk of WEEKS) {
  setWeekLocal(wk); Core.setWeek(wk);
  const coreOff = Core.weekOffset(), coreTop = Core.topSpeedMph();
  const wx = Core.weatherOf(wk);
  console.log(`\nWeek ${wk} (${wx}): ${Core.weekMiles(wk)} mi, starts at difficulty ${diffOf(0).toFixed(2)} (curve mile ${OFFSET.toFixed(2)}), ` +
    `${(vOf(0) / MPH).toFixed(0)} → ${TOP} mph`);
  const wkCounts = {};
  if (Math.abs(coreOff - OFFSET) > 1e-6 || coreTop !== TOP) {
    bad++; console.log(`    core week scaling disagrees: offset ${coreOff} vs ${OFFSET}, top ${coreTop} vs ${TOP}`);
  }
  for (let i = 0; i < SEEDS; i++) {
    const seed = (0x9E3779B1 * (i + 1) + wk * 7919) >>> 0;
    const r = runSeed(seed);
    total += r.rows; fallbacks += r.fallbacks; retries += r.retries;
    bad += r.violations.length;
    console.log(`seed ${String(seed).padStart(10)}: ${r.rows} rows, ${r.hazards} hazards, ${r.miles.toFixed(1)} mi, ` +
      `retries ${r.retries}, fallbacks ${r.fallbacks}, global path ${r.survivable ? 'OK' : 'NONE'}, violations ${r.violations.length}`);
    for (const v of r.violations.slice(0, 10)) console.log('    ' + v);
    for (const [k, v] of Object.entries(r.counts)) wkCounts[k] = (wkCounts[k] || 0) + v;
  }
  console.log(`  week ${wk} totals: ${['closure', 'plow', 'ice'].map((k) => `${wkCounts[k] || 0} ${k}${k === 'ice' ? '' : 's'}`).join(', ')}`);
  // Each feature must show up exactly where it belongs
  const expect = { closure: wk >= CONFIG.closureMinWeek, plow: wx === 'snow', ice: wx === 'snow' };
  if (!MUTATE) for (const [k, want] of Object.entries(expect)) {
    if (want !== (wkCounts[k] > 0)) { bad++; console.log(`    week ${wk}: expected ${want ? 'some' : 'no'} ${k}, got ${wkCounts[k] || 0}`); }
  }
}
console.log(`\n${total} rows checked in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${bad} violations, ${retries} regenerated rows, ${fallbacks} empty-row fallbacks`);
if (MUTATE) {
  console.log(bad ? 'MUTATION DETECTED (checker works)' : 'MUTATION NOT DETECTED — checker is too weak');
  process.exit(bad ? 0 : 1);
}
console.log(bad ? 'FAIRNESS FAILED' : 'FAIRNESS PASSED');
process.exit(bad ? 1 : 0);
