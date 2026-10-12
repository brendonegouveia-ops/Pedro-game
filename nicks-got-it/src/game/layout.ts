// Design-space geometry (390 x 844 portrait). Everything the scene draws or hit-tests comes from here.
import { ROOMS } from '../config';
import { STATIONS, type RoomId, type StationId } from '../sim/house';

export const W = 390;
export const H = 844;

export const HUD = { y: 0, h: 88 };
export const HOUSE = { x: 0, y: 90, w: 390, h: 456 };
export const ROOM_W = HOUSE.w / 2;
export const ROOM_H = HOUSE.h / 2;
// Bottom 35% of the screen (y >= 548.6) is the thumb zone: Action Panel + ability bar.
export const PANEL = { x: 0, y: 552, w: 390, h: 214 };
export const BAR = { x: 0, y: 770, w: 390, h: 74 };

export const MIN_HIT = 44;

export function roomRect(r: RoomId) {
  const c = ROOMS[r];
  return { x: HOUSE.x + c.col * ROOM_W, y: HOUSE.y + c.row * ROOM_H, w: ROOM_W, h: ROOM_H };
}

export function roomPoint(r: RoomId, nx: number, ny: number) {
  const rr = roomRect(r);
  return { x: rr.x + nx * rr.w, y: rr.y + ny * rr.h };
}

export function stationPoint(s: StationId) {
  const d = STATIONS[s];
  return roomPoint(d.room, d.x, d.y);
}

export function roomAtPoint(x: number, y: number): RoomId | null {
  if (x < HOUSE.x || x >= HOUSE.x + HOUSE.w || y < HOUSE.y || y >= HOUSE.y + HOUSE.h) return null;
  const col = Math.floor((x - HOUSE.x) / ROOM_W);
  const row = Math.floor((y - HOUSE.y) / ROOM_H);
  return (Object.keys(ROOMS) as RoomId[]).find((k) => ROOMS[k].col === col && ROOMS[k].row === row) ?? null;
}

// Where Nick stands in a room when he isn't heading for anything in particular.
export const NICK_IDLE = { x: 0.5, y: 0.8 };

export const COLORS = {
  bg: 0x1d1f2b,
  ink: 0x22223b,
  paper: 0xfffaf0,
  hud: 0x2b2d42,
  chaosLo: 0x5fbf6a,
  chaosMid: 0xf2b134,
  chaosHi: 0xe5484d,
  coffee: 0x8b5a2b,
  accent: 0xff7a59,
  route: 0xffffff,
  marker: 0x3a86ff,
  panel: 0xfff4e0,
  panelEdge: 0xe8d5b0,
  ability: 0x3d405b,
  abilityLit: 0x5a5f8a,
  good: 0x2a9d8f,
  bad: 0xe5484d,
};

export const FONT = '"Trebuchet MS", ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
