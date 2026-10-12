// Screen geometry (390 x 844 portrait design space). The world (src/sim/house.ts) is drawn at WORLD.y.
import { WORLD as W_SIM } from '../sim/house';

export const W = 390;
export const H = 844;

export const HUD = { y: 0, h: 72 };
// The whole floor plan is always on screen: every request timer stays visible.
export const WORLD = { x: 0, y: 74, w: W_SIM.w, h: W_SIM.h };
// Thumb zone: Action Panel + ability bar (bottom ~29% of the screen).
export const PANEL = { x: 0, y: 598, w: 390, h: 168 };
export const BAR = { x: 0, y: 770, w: 390, h: 74 };

export const toScreen = (x: number, y: number) => ({ x: x + WORLD.x, y: y + WORLD.y });
export const toWorld = (x: number, y: number) => ({
  x: Math.max(0, Math.min(WORLD.w, x - WORLD.x)),
  y: Math.max(0, Math.min(WORLD.h, y - WORLD.y)),
});
export const inWorld = (x: number, y: number) => y >= WORLD.y && y < WORLD.y + WORLD.h;

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

// Characters are drawn front-facing (3/4 view) on the top-down plan, at these scales.
export const ACTOR_SCALE: Record<string, number> = { nick: 0.55, evelyn: 0.62, tyler: 0.6, nora: 0.62, eloise: 0.62 };
