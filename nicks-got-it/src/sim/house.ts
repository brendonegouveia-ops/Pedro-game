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
  // House back wall (backyard side): back door at x 60-108, slider at x 300-356.
  { x: 0, y: 160, w: 60, h: WALL_T },
  { x: 108, y: 160, w: 192, h: WALL_T },
  { x: 356, y: 160, w: 34, h: WALL_T },
  // Kitchen | Living (door y 228-280), then Garage | Living (door y 440-488).
  { x: 188, y: 166, w: WALL_T, h: 62 },
  { x: 188, y: 280, w: WALL_T, h: 160 },
  { x: 188, y: 488, w: WALL_T, h: 32 },
  // Kitchen | Garage (door x 112-160).
  { x: 0, y: 350, w: 112, h: WALL_T },
  { x: 160, y: 350, w: 28, h: WALL_T },
];

export interface Door {
  a: RoomId;
  b: RoomId;
  x: number;
  y: number;
  axis: 'h' | 'v'; // h: wall runs horizontally (pass through in y)
}

export const DOORS: Door[] = [
  { a: 'backyard', b: 'kitchen', x: 84, y: 163, axis: 'h' },
  { a: 'backyard', b: 'living', x: 328, y: 163, axis: 'h' },
  { a: 'kitchen', b: 'living', x: 191, y: 254, axis: 'v' },
  { a: 'kitchen', b: 'garage', x: 136, y: 353, axis: 'h' },
  { a: 'garage', b: 'living', x: 191, y: 464, axis: 'v' },
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
  thermostat: { room: 'living', label: 'Thermostat', x: 206, y: 198 },
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

// Where to head next to reach (tx, ty) from (x, y): straight if nothing is in the way,
// otherwise through the next doorway on the room path.
export function steer(x: number, y: number, tx: number, ty: number, r: number): { x: number; y: number } {
  if (lineClear(x, y, tx, ty, r)) return { x: tx, y: ty };
  const from = roomAt(x, y);
  const to = roomAt(tx, ty);
  const path = roomPath(from, to);
  if (!path.length) return { x: tx, y: ty };
  const d = doorBetween(from, path[0])!;
  const beyond = doorSide(d, path[0], 18);
  if (lineClear(x, y, beyond.x, beyond.y, r)) return beyond;
  return doorSide(d, from, 18);
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
