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
//   node fairness.mjs [rowsPerSeed=1000] [seeds=10]
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');
let coreSrc = html.match(/<script id="pedro-core">([\s\S]*?)<\/script>/)[1];
// --mutate: sabotage the spawner's reachability rule to prove this checker catches violations.
const MUTATE = process.argv.includes('--mutate');
if (MUTATE) {
  const before = coreSrc;
  coreSrc = coreSrc.replace('Math.abs(l - gPrev) <= budget) openLanes', 'true) openLanes');
  if (coreSrc === before) throw new Error('mutation target not found');
}
const ctx = vm.createContext({ Math, Infinity, Float64Array, Int8Array, Uint8Array });
const { CONFIG, Core } = vm.runInContext(coreSrc + '\n;({ CONFIG, Core: PedroCore })', ctx);

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ROWS = parseInt(args[0] || '1000', 10);
const SEEDS = parseInt(args[1] || '10', 10);
const MPM = 1609.344, MPH = 0.44704;

// ---- Independent re-derivations from CONFIG (not calling the spawner's helpers) ----
const NAMES = ['sedan', 'truck', 'debris', 'changer', 'tailgater', 'powerup'];
function kOf(type) { return NAMES[type] === 'debris' ? 0 : NAMES[type] === 'tailgater' ? CONFIG.tailgaterSpeedFrac : CONFIG.trafficSpeedFrac; }
function lenOf(type) { return NAMES[type] === 'powerup' ? 1.6 : CONFIG.hazardSize[NAMES[type]][1]; }
function hsOf(type) { return ((CONFIG.playerSize[1] + lenOf(type)) * CONFIG.hitboxScale / 2) / Math.abs(1 - kOf(type)); }
function diffOf(miles) {
  const p = CONFIG.difficultyCurve;
  if (miles <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (miles <= p[i][0]) return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * (miles - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
  return p[p.length - 1][1];
}
function vOf(sigma) { const d = diffOf(sigma / MPM); return (CONFIG.startSpeedMph + (CONFIG.maxSpeedMph - CONFIG.startSpeedMph) * d) * MPH; }
// Rows are validated as if Pedro is boosted by a donut (fastest he can go), so check at that speed.
const LC = (CONFIG.laneChangeMs / 1000 + CONFIG.reactionSec) * CONFIG.donutSpeedMult;
const EPS = 1e-6;

function runSeed(seed) {
  const sp = Core.createSpawner(seed, CONFIG.startLane);
  const H = [];   // {type, mask, lo, hi, row}
  const R = [];   // {A, B, g, gPrev, fallback}
  for (let r = 0; r < ROWS; r++) {
    const row = sp.generateRow();
    R.push({ A: row.A, B: row.B, g: row.g, gPrev: row.gPrev, fallback: row.fallback, count: row.count });
    for (const h of sp.hazards) {
      if (!h.active) continue;
      if (h.type === 5) { h.active = false; continue; } // power-ups never block
      const hs = hsOf(h.type);
      H.push({ type: h.type, mask: (1 << h.lane) | (1 << h.lane2), lo: h.sigma - hs, hi: h.sigma + hs, row: h.row });
      h.active = false; // simulate despawn so the pool recycles
    }
  }
  const violations = [];

  // ---- A. per-row corridor ----
  let prevB = CONFIG.startClearMeters, prevG = CONFIG.startLane;
  H.sort((a, b) => a.lo - b.lo);
  let j0 = 0;
  for (let r = 0; r < R.length; r++) {
    const row = R[r];
    if (row.gPrev !== prevG) violations.push(`row ${r}: chain broken (gPrev ${row.gPrev} != ${prevG})`);
    const gap = row.A - prevB;
    if (gap < -EPS) violations.push(`row ${r}: overlaps previous row by ${(-gap).toFixed(2)} m`);
    const need = Math.abs(row.g - prevG) * vOf(row.A) * LC;
    if (need > gap + EPS) violations.push(`row ${r}: open lane ${row.g} unreachable from ${prevG} (needs ${need.toFixed(1)} m, gap ${gap.toFixed(1)} m)`);
    while (j0 < H.length && H[j0].hi < prevB - 200) j0++;
    for (let j = j0; j < H.length && H[j].lo <= row.B; j++) {
      const h = H[j];
      if (h.hi < row.A - EPS || h.lo > row.B + EPS) continue;
      if (h.mask & (1 << row.g)) violations.push(`row ${r}: guaranteed lane ${row.g} blocked by ${NAMES[h.type]} (row ${h.row})`);
    }
    prevB = row.B; prevG = row.g;
  }
  for (const h of H) {
    const row = R[h.row];
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
  return { seed, rows: R.length, hazards: H.length, fallbacks: sp.fallbacks, retries: sp.retries, miles, violations, survivable };
}

// ---- Difficulty curve timing (sanity) ----
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

let total = 0, bad = 0, fallbacks = 0, retries = 0;
const t0 = Date.now();
for (let i = 0; i < SEEDS; i++) {
  const seed = (0x9E3779B1 * (i + 1)) >>> 0;
  const r = runSeed(seed);
  total += r.rows; fallbacks += r.fallbacks; retries += r.retries;
  bad += r.violations.length;
  console.log(`seed ${String(seed).padStart(10)}: ${r.rows} rows, ${r.hazards} hazards, ${r.miles.toFixed(1)} mi, ` +
    `retries ${r.retries}, fallbacks ${r.fallbacks}, global path ${r.survivable ? 'OK' : 'NONE'}, violations ${r.violations.length}`);
  for (const v of r.violations.slice(0, 10)) console.log('    ' + v);
}
console.log(`\n${total} rows checked in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${bad} violations, ${retries} regenerated rows, ${fallbacks} empty-row fallbacks`);
if (MUTATE) {
  console.log(bad ? 'MUTATION DETECTED (checker works)' : 'MUTATION NOT DETECTED — checker is too weak');
  process.exit(bad ? 0 : 1);
}
console.log(bad ? 'FAIRNESS FAILED' : 'FAIRNESS PASSED');
process.exit(bad ? 1 : 0);
