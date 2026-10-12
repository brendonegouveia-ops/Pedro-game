// Top-down floor plan: room interiors, walls, doorways, stations, and the movement helpers
// (circle-vs-wall collision, line of sight, door-to-door routing). World units are design px.
import type { Rng } from './rng';

export const WORLD = { w: 390, h: 520 };

export type RoomId = 'backyard' | 'kitchen' | 'living' | 'garage';
export const ROOM_IDS: RoomId[] = ['backyard', 'kitchen', 'living', 'garage'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ROOM_NAMES: Record<RoomId, string> = {
  backyard: 'Backyard',
  kitchen: 'Kitchen',
  living: 'Living Room',
  garage: 'Garage',
};

// Interiors (walkable, excluding walls).
export const ROOM_RECTS: Record<RoomId, Rect> = {
  backyard: { x: 0, y: 0, w: 390, h: 160 },
  kitchen: { x: 0, y: 166, w: 188, h: 184 },
  living: { x: 194, y: 166, w: 196, h: 354 },
  garage: { x: 0, y: 356, w: 188, h: 164 },
};

export const WALL_T = 6;

// Solid walls. Gaps between them are the doorways listed in DOORS.
export const WALLS: Rect[] = [
  // Back fence strip: keeps everyone's sprite clear of the HUD above the yard.
  { x: 0, y: 0, w: 390, h: 40 },
  // House back wall (backyard side): back door at x 48-120, slider at x 290-366.
  { x: 0, y: 160, w: 48, h: WALL_T },
  { x: 120, y: 160, w: 170, h: WALL_T },
  { x: 366, y: 160, w: 24, h: WALL_T },
  // Kitchen | Living is open plan (opening y 196-336); Garage | Living door at y 430-494.
  { x: 188, y: 166, w: WALL_T, h: 30 },
  { x: 188, y: 336, w: WALL_T, h: 94 },
  { x: 188, y: 494, w: WALL_T, h: 26 },
  // Kitchen | Garage (door x 100-172).
  { x: 0, y: 350, w: 100, h: WALL_T },
  { x: 172, y: 350, w: 16, h: WALL_T },
];

export interface Door {
  a: RoomId;
  b: RoomId;
  x: number;
  y: number;
  axis: 'h' | 'v'; // h: wall runs horizontally (pass through in y)
  span: number; // opening width
}

export const DOORS: Door[] = [
  { a: 'backyard', b: 'kitchen', x: 84, y: 163, axis: 'h', span: 72 },
  { a: 'backyard', b: 'living', x: 328, y: 163, axis: 'h', span: 76 },
  { a: 'kitchen', b: 'living', x: 191, y: 266, axis: 'v', span: 140 },
  { a: 'kitchen', b: 'garage', x: 136, y: 353, axis: 'h', span: 72 },
  { a: 'garage', b: 'living', x: 191, y: 462, axis: 'v', span: 64 },
];

export type StationId =
  | 'coffee'
  | 'snacks'
  | 'juice'
  | 'sippy'
  | 'highchair'
  | 'thermostat'
  | 'playpen'
  | 'bandaids'
  | 'spot_toolbox'
  | 'spot_bin'
  | 'spot_cooler'
  | 'spot_bike'
  | 'door'
  | 'grill';

export interface StationDef {
  room: RoomId;
  label: string;
  x: number;
  y: number;
}

export const STATIONS: Record<StationId, StationDef> = {
  // Kitchen counter runs down the left wall.
  coffee: { room: 'kitchen', label: 'Coffee', x: 18, y: 192 },
  snacks: { room: 'kitchen', label: 'Snacks', x: 18, y: 238 },
  juice: { room: 'kitchen', label: 'Juice', x: 18, y: 284 },
  sippy: { room: 'kitchen', label: 'Sippy', x: 18, y: 330 },
  highchair: { room: 'kitchen', label: 'High chair', x: 150, y: 318 },
  thermostat: { room: 'living', label: 'Thermostat', x: 238, y: 180 },
  playpen: { room: 'living', label: 'Playpen', x: 352, y: 222 },
  bandaids: { room: 'garage', label: 'Band-aids', x: 30, y: 374 },
  spot_toolbox: { room: 'garage', label: 'Toolbox', x: 18, y: 432 },
  spot_bike: { room: 'garage', label: 'Bike basket', x: 22, y: 496 },
  spot_bin: { room: 'garage', label: 'Shoe bin', x: 96, y: 502 },
  spot_cooler: { room: 'garage', label: 'Cooler', x: 166, y: 506 },
  door: { room: 'kitchen', label: 'Back door', x: 84, y: 180 },
  grill: { room: 'backyard', label: 'Grill', x: 332, y: 62 },
};
export const STATION_IDS = Object.keys(STATIONS) as StationId[];
export const SHOE_SPOTS: StationId[] = ['spot_toolbox', 'spot_bin', 'spot_cooler', 'spot_bike'];

export const COUCH_POS = { room: 'living' as RoomId, x: 292, y: 392 };
export const DOOR_WAIT_POS = { x: 112, y: 192 };
export const NICK_START = { x: 300, y: 300 };

// ------------------------------------------------------------ geometry
export function roomAt(x: number, y: number): RoomId {
  let best: RoomId = 'living';
  let bd = Infinity;
  for (const r of ROOM_IDS) {
    const R = ROOM_RECTS[r];
    const dx = Math.max(R.x - x, 0, x - (R.x + R.w));
    const dy = Math.max(R.y - y, 0, y - (R.y + R.h));
    const d = dx * dx + dy * dy;
    if (d === 0) return r;
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

const ADJ: Record<RoomId, RoomId[]> = { backyard: [], kitchen: [], living: [], garage: [] };
for (const d of DOORS) {
  ADJ[d.a].push(d.b);
  ADJ[d.b].push(d.a);
}

export function neighbors(r: RoomId): RoomId[] {
  return ADJ[r];
}

// Room path a -> b (excluding a), by BFS over doorways.
export function roomPath(a: RoomId, b: RoomId): RoomId[] {
  if (a === b) return [];
  const prev = new Map<RoomId, RoomId>();
  const q: RoomId[] = [a];
  const seen = new Set<RoomId>([a]);
  while (q.length) {
    const cur = q.shift()!;
    for (const n of ADJ[cur]) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === b) {
        const out: RoomId[] = [b];
        let c = b;
        while (prev.get(c) !== a) {
          c = prev.get(c)!;
          out.unshift(c);
        }
        return out;
      }
      q.push(n);
    }
  }
  return [];
}

export function hops(a: RoomId, b: RoomId): number {
  return roomPath(a, b).length;
}

export function doorBetween(a: RoomId, b: RoomId): Door | undefined {
  return DOORS.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));
}

// A point just inside `room` on the far side of a doorway.
export function doorSide(d: Door, room: RoomId, depth = 16): { x: number; y: number } {
  const c = ROOM_RECTS[room];
  if (d.axis === 'h') return { x: d.x, y: c.y + c.h / 2 < d.y ? d.y - depth : d.y + depth };
  return { x: c.x + c.w / 2 < d.x ? d.x - depth : d.x + depth, y: d.y };
}

function circleHitsRect(x: number, y: number, r: number, R: Rect): boolean {
  const cx = Math.max(R.x, Math.min(x, R.x + R.w));
  const cy = Math.max(R.y, Math.min(y, R.y + R.h));
  return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
}

export function blocked(x: number, y: number, r: number): boolean {
  if (x < r || y < r || x > WORLD.w - r || y > WORLD.h - r) return true;
  return WALLS.some((w) => circleHitsRect(x, y, r, w));
}

// Move a circle by (dx, dy), sliding along walls (axis-separated, sub-stepped).
export function moveCircle(x: number, y: number, dx: number, dy: number, r: number): { x: number; y: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!blocked(x + sx, y, r)) x += sx;
    if (!blocked(x, y + sy, r)) y += sy;
  }
  return { x, y };
}

export function lineClear(x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / 4));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (WALLS.some((w) => circleHitsRect(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, w))) return false;
  }
  return true;
}

// ------------------------------------------------------------ pathfinding
// A* over an 8 px grid with per-radius clearance, then string-pulled: the walker heads for the
// furthest path point it can see. Works for any target, including points on or inside walls.
const CELL = 8;
const COLS = Math.ceil(WORLD.w / CELL);
const ROWS = Math.ceil(WORLD.h / CELL);
const freeCache = new Map<number, Uint8Array>();
// Paths keep this much extra distance from walls, so rounding never pins a walker on a doorframe.
const MARGIN = 2;

function freeGrid(r: number): Uint8Array {
  let g = freeCache.get(r);
  if (g) return g;
  g = new Uint8Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) g[j * COLS + i] = blocked(i * CELL + CELL / 2, j * CELL + CELL / 2, r + MARGIN) ? 0 : 1;
  freeCache.set(r, g);
  return g;
}

const cellOf = (x: number, y: number) => {
  const i = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
  const j = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)));
  return j * COLS + i;
};
const cx = (c: number) => (c % COLS) * CELL + CELL / 2;
const cy = (c: number) => Math.floor(c / COLS) * CELL + CELL / 2;

// Nearest free cell to a cell (BFS outward).
function nearestFree(c: number, free: Uint8Array): number {
  if (free[c]) return c;
  const seen = new Uint8Array(COLS * ROWS);
  const q = [c];
  seen[c] = 1;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    if (free[cur]) return cur;
    const i = cur % COLS;
    const j = Math.floor(cur / COLS);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const n = nj * COLS + ni;
      if (!seen[n]) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return c;
}

// The free point closest to (x, y) for a walker of radius r.
export function snapFree(x: number, y: number, r: number): { x: number; y: number } {
  if (!blocked(x, y, r)) return { x, y };
  const c = nearestFree(cellOf(x, y), freeGrid(r));
  return { x: cx(c), y: cy(c) };
}

export function findPath(x: number, y: number, tx: number, ty: number, r: number): { x: number; y: number }[] {
  const free = freeGrid(r);
  const start = nearestFree(cellOf(x, y), free);
  const goal = nearestFree(cellOf(tx, ty), free);
  if (start === goal) return [];
  const N = COLS * ROWS;
  const gs = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const gx = cx(goal);
  const gy = cy(goal);
  const heap: [number, number][] = []; // [f, cell]
  const push = (f: number, c: number) => {
    heap.push([f, c]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        const b = a + 1;
        let m = k;
        if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
        if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  gs[start] = 0;
  push(0, start);
  while (heap.length) {
    const [, c] = pop();
    if (closed[c]) continue;
    if (c === goal) break;
    closed[c] = 1;
    const i = c % COLS;
    const j = Math.floor(c / COLS);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
        const n = nj * COLS + ni;
        if (!free[n] || closed[n]) continue;
        if (di && dj && (!free[j * COLS + ni] || !free[nj * COLS + i])) continue; // no corner cutting
        const g = gs[c] + (di && dj ? 1.4142 : 1);
        if (g < gs[n]) {
          gs[n] = g;
          came[n] = c;
          push(g + Math.hypot(cx(n) - gx, cy(n) - gy) / CELL, n);
        }
      }
  }
  if (came[goal] === -1) return [];
  const out: { x: number; y: number }[] = [];
  for (let c = goal; c !== start && c !== -1; c = came[c]) out.push({ x: cx(c), y: cy(c) });
  return out.reverse();
}

// Where to head next to reach (tx, ty) from (x, y): straight if nothing is in the way,
// otherwise the furthest visible point on the grid path.
const pathCache = new Map<number, { x: number; y: number }[]>();

export function steer(x: number, y: number, tx: number, ty: number, r: number): { x: number; y: number } {
  const t = snapFree(tx, ty, r);
  if (lineClear(x, y, t.x, t.y, r)) return t;
  // Paths depend only on (start cell, goal cell, radius): cache them; walkers stay in a cell for several frames.
  const key = cellOf(x, y) * 65536 + cellOf(t.x, t.y) * 16 + r;
  let path = pathCache.get(key);
  if (!path) {
    if (pathCache.size > 4000) pathCache.clear();
    path = findPath(x, y, t.x, t.y, r);
    pathCache.set(key, path);
  }
  if (!path.length) return t;
  for (let k = path.length - 1; k >= 0; k--) if (lineClear(x, y, path[k].x, path[k].y, r + MARGIN / 2)) return path[k];
  return path[0];
}

// A random open floor point in a room (keeps clear of walls and the counter).
export function floorPoint(rng: Rng, room: RoomId, r = 12): { x: number; y: number } {
  const R = ROOM_RECTS[room];
  for (let i = 0; i < 20; i++) {
    const x = rng.range(R.x + 44, R.x + R.w - 24);
    const y = rng.range(R.y + 36, R.y + R.h - 24);
    if (!blocked(x, y, r)) return { x, y };
  }
  return { x: R.x + R.w / 2, y: R.y + R.h / 2 };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
