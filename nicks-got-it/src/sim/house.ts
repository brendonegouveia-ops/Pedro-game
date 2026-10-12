import { ROOMS } from '../config';

export type RoomId = keyof typeof ROOMS;
export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];

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
  // Position inside the room, normalized 0..1 (x across, y down).
  x: number;
  y: number;
}

export const STATIONS: Record<StationId, StationDef> = {
  coffee: { room: 'kitchen', label: 'Coffee', x: 0.15, y: 0.3 },
  snacks: { room: 'kitchen', label: 'Snacks', x: 0.39, y: 0.3 },
  juice: { room: 'kitchen', label: 'Juice', x: 0.63, y: 0.3 },
  sippy: { room: 'kitchen', label: 'Sippy', x: 0.86, y: 0.3 },
  highchair: { room: 'kitchen', label: 'High chair', x: 0.15, y: 0.7 },
  thermostat: { room: 'living', label: 'Thermostat', x: 0.13, y: 0.3 },
  playpen: { room: 'living', label: 'Playpen', x: 0.84, y: 0.72 },
  bandaids: { room: 'garage', label: 'Band-aids', x: 0.15, y: 0.3 },
  spot_toolbox: { room: 'garage', label: 'Toolbox', x: 0.4, y: 0.3 },
  spot_bin: { room: 'garage', label: 'Shoe bin', x: 0.65, y: 0.3 },
  spot_cooler: { room: 'garage', label: 'Cooler', x: 0.86, y: 0.3 },
  spot_bike: { room: 'garage', label: 'Bike basket', x: 0.15, y: 0.72 },
  door: { room: 'backyard', label: 'Back door', x: 0.13, y: 0.42 },
  grill: { room: 'backyard', label: 'Grill', x: 0.72, y: 0.36 },
};
export const STATION_IDS = Object.keys(STATIONS) as StationId[];
export const SHOE_SPOTS: StationId[] = ['spot_toolbox', 'spot_bin', 'spot_cooler', 'spot_bike'];

// Fixed spots for things the sim places on purpose.
export const COUCH_POS = { room: 'living' as RoomId, x: 0.48, y: 0.66 };
export const DOOR_WAIT_POS = { x: 0.3, y: 0.62 };

export function hops(a: RoomId, b: RoomId): number {
  return Math.abs(ROOMS[a].col - ROOMS[b].col) + Math.abs(ROOMS[a].row - ROOMS[b].row);
}

function roomAt(col: number, row: number): RoomId {
  return ROOM_IDS.find((r) => ROOMS[r].col === col && ROOMS[r].row === row)!;
}

// Next room on the way from a to b. Diagonals go across first, then up/down.
export function nextHop(a: RoomId, b: RoomId): RoomId {
  const A = ROOMS[a];
  const B = ROOMS[b];
  if (A.col !== B.col) return roomAt(B.col, A.row);
  if (A.row !== B.row) return roomAt(A.col, B.row);
  return a;
}

// Rooms visited after leaving a, ending in b.
export function route(a: RoomId, b: RoomId): RoomId[] {
  const out: RoomId[] = [];
  let cur = a;
  while (cur !== b) {
    cur = nextHop(cur, b);
    out.push(cur);
  }
  return out;
}

export function neighbors(a: RoomId): RoomId[] {
  return ROOM_IDS.filter((r) => hops(a, r) === 1);
}
