// Original procedural art: every character, icon and room is drawn with Graphics primitives.
import type Phaser from 'phaser';
import { ROOM_RECTS, WALLS, type Rect } from '../sim/house';

type G = Phaser.GameObjects.Graphics;

const SKIN = 0xf1c6a0;
const SKIN_DARK = 0xd9a77f;
const INK = 0x2b2033;

function shadow(g: G, w: number) {
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(0, 0, w, w * 0.22);
}

function face(g: G, x: number, y: number, r: number, mood: 'smile' | 'flat' = 'smile') {
  g.fillStyle(INK, 1);
  g.fillCircle(x - r * 0.38, y - r * 0.05, Math.max(1.3, r * 0.12));
  g.fillCircle(x + r * 0.38, y - r * 0.05, Math.max(1.3, r * 0.12));
  g.lineStyle(Math.max(1.2, r * 0.1), INK, 1);
  g.beginPath();
  if (mood === 'smile') g.arc(x, y + r * 0.22, r * 0.32, 0.25, Math.PI - 0.25, false);
  else {
    g.moveTo(x - r * 0.25, y + r * 0.42);
    g.lineTo(x + r * 0.25, y + r * 0.42);
  }
  g.strokePath();
  g.fillStyle(0xff9a9a, 0.45);
  g.fillCircle(x - r * 0.6, y + r * 0.25, r * 0.18);
  g.fillCircle(x + r * 0.6, y + r * 0.25, r * 0.18);
}

// Nick: polo, cargo shorts, socks with sandals, sunglasses parked on his head, coffee forever in his right hand.
export function drawNick(g: G) {
  shadow(g, 44);
  g.fillStyle(0x5b3a1e, 1);
  g.fillRoundedRect(-14, -4, 11, 4, 2);
  g.fillRoundedRect(3, -4, 11, 4, 2);
  g.fillStyle(0xffffff, 1);
  g.fillRect(-12, -15, 8, 12);
  g.fillRect(4, -15, 8, 12);
  g.fillStyle(SKIN, 1);
  g.fillRect(-12, -27, 8, 12);
  g.fillRect(4, -27, 8, 12);
  // cargo shorts
  g.fillStyle(0xb59a6a, 1);
  g.fillRoundedRect(-17, -46, 34, 21, 4);
  g.fillStyle(0x9a8056, 1);
  g.fillRoundedRect(-20, -39, 7, 10, 2);
  g.fillRoundedRect(13, -39, 7, 10, 2);
  g.fillRect(-1, -42, 2, 14);
  // polo + dad belly
  g.fillStyle(0x2a9d8f, 1);
  g.fillRoundedRect(-18, -72, 36, 30, 8);
  g.fillEllipse(0, -48, 36, 14);
  g.fillStyle(0x23867a, 1);
  g.fillTriangle(-7, -72, 0, -64, 0, -72);
  g.fillTriangle(7, -72, 0, -64, 0, -72);
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(0, -62, 1.4);
  g.fillCircle(0, -57, 1.4);
  // arms
  g.fillStyle(0x2a9d8f, 1);
  g.fillRoundedRect(-25, -71, 9, 11, 3);
  g.fillRoundedRect(16, -71, 9, 11, 3);
  g.fillStyle(SKIN, 1);
  g.fillRoundedRect(-24, -61, 7, 17, 3);
  g.fillRoundedRect(17, -61, 7, 9, 3);
  g.fillRoundedRect(19, -55, 11, 6, 3);
  // coffee mug
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(25, -66, 11, 13, 2);
  g.lineStyle(2, 0xffffff, 1);
  g.strokeCircle(37, -60, 3.5);
  g.fillStyle(0x6b3e1f, 1);
  g.fillRect(26, -65, 9, 3);
  g.fillStyle(0xe5484d, 1);
  g.fillRect(25, -60, 11, 2);
  // head
  g.fillStyle(SKIN, 1);
  g.fillRect(-4, -78, 8, 6);
  g.fillCircle(0, -86, 12);
  g.fillStyle(0x6b4423, 1);
  g.fillEllipse(0, -95, 25, 10);
  g.fillRect(-12, -96, 3, 8);
  g.fillRect(9, -96, 3, 8);
  // sunglasses on head
  g.fillStyle(INK, 1);
  g.fillRoundedRect(-11, -99, 9, 5, 2);
  g.fillRoundedRect(2, -99, 9, 5, 2);
  g.fillRect(-2, -98, 4, 2);
  // stubble
  g.fillStyle(0x8a6a50, 0.25);
  g.fillEllipse(0, -79, 18, 8);
  face(g, 0, -86, 12);
}

export function drawEvelyn(g: G) {
  shadow(g, 30);
  g.fillStyle(0xff6fa8, 1);
  g.fillRoundedRect(-9, -5, 7, 5, 2);
  g.fillRoundedRect(2, -5, 7, 5, 2);
  g.fillStyle(SKIN, 1);
  g.fillRect(-7, -14, 5, 10);
  g.fillRect(2, -14, 5, 10);
  // dress
  g.fillStyle(0x9b5de5, 1);
  g.fillTriangle(-15, -14, 15, -14, 0, -42);
  g.fillRoundedRect(-9, -40, 18, 18, 5);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(-5, -20, 1.6);
  g.fillCircle(4, -24, 1.6);
  g.fillCircle(-1, -30, 1.6);
  g.fillStyle(SKIN, 1);
  g.fillRoundedRect(-14, -38, 5, 14, 2);
  g.fillRoundedRect(9, -38, 5, 14, 2);
  g.fillCircle(0, -50, 10);
  // hair + pigtails
  g.fillStyle(0xc9a227, 1);
  g.fillEllipse(0, -57, 21, 9);
  g.fillCircle(-12, -52, 5);
  g.fillCircle(12, -52, 5);
  g.fillStyle(0xff6fa8, 1);
  g.fillCircle(-9, -55, 2);
  g.fillCircle(9, -55, 2);
  face(g, 0, -49, 9);
}

export function drawTyler(g: G) {
  shadow(g, 32);
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(-10, -5, 8, 5, 2);
  g.fillRoundedRect(2, -5, 8, 5, 2);
  g.fillStyle(SKIN_DARK, 1);
  g.fillRect(-8, -18, 6, 13);
  g.fillRect(2, -18, 6, 13);
  g.fillStyle(0x3d5a80, 1);
  g.fillRoundedRect(-10, -27, 20, 11, 3);
  // striped tee
  g.fillStyle(0xf4f1de, 1);
  g.fillRoundedRect(-11, -47, 22, 22, 5);
  g.fillStyle(0xe07a5f, 1);
  g.fillRect(-11, -43, 22, 3);
  g.fillRect(-11, -37, 22, 3);
  g.fillRect(-11, -31, 22, 3);
  g.fillStyle(SKIN_DARK, 1);
  g.fillRoundedRect(-16, -45, 5, 15, 2);
  g.fillRoundedRect(11, -45, 5, 15, 2);
  g.fillCircle(0, -57, 10);
  // cap, brim forward
  g.fillStyle(0xd62828, 1);
  g.fillEllipse(0, -64, 22, 10);
  g.fillRect(-11, -65, 22, 4);
  g.fillRoundedRect(4, -64, 13, 4, 2);
  face(g, 0, -56, 9);
}

export function drawNora(g: G) {
  shadow(g, 24);
  g.fillStyle(SKIN, 1);
  g.fillEllipse(-5, -5, 8, 9);
  g.fillEllipse(5, -5, 8, 9);
  // diaper
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(-10, -16, 20, 11, 5);
  g.fillStyle(0x8ecae6, 1);
  g.fillRect(-10, -15, 3, 4);
  g.fillRect(7, -15, 3, 4);
  // tee
  g.fillStyle(0xffd166, 1);
  g.fillRoundedRect(-10, -29, 20, 15, 6);
  g.fillStyle(SKIN, 1);
  g.fillCircle(-12, -24, 3.5);
  g.fillCircle(12, -24, 3.5);
  g.fillCircle(0, -38, 10);
  // the one hair sprout
  g.fillStyle(0x8b5a2b, 1);
  g.fillEllipse(0, -46, 14, 5);
  g.fillTriangle(-1, -47, 3, -47, 3, -54);
  face(g, 0, -37, 9);
}

// Eloise: medium, scruffy, gray-tan, permanently up to something.
export function drawEloise(g: G) {
  shadow(g, 46);
  g.fillStyle(0x9c8f7a, 1);
  g.fillRect(-15, -12, 5, 12);
  g.fillRect(-7, -12, 5, 12);
  g.fillRect(6, -12, 5, 12);
  g.fillRect(13, -12, 5, 12);
  g.fillEllipse(0, -18, 40, 18);
  // scruff
  g.fillStyle(0xb5a88f, 1);
  for (let i = -16; i <= 14; i += 6) g.fillTriangle(i, -26, i + 6, -26, i + 3, -31);
  g.fillTriangle(-18, -14, -14, -10, -22, -8);
  // tail
  g.fillStyle(0x9c8f7a, 1);
  g.fillTriangle(-19, -22, -26, -36, -22, -20);
  // head
  g.fillEllipse(19, -28, 18, 16);
  g.fillStyle(0xb5a88f, 1);
  g.fillTriangle(12, -36, 18, -36, 14, -41);
  g.fillTriangle(18, -37, 24, -36, 22, -42);
  g.fillEllipse(27, -24, 10, 8);
  g.fillStyle(0x6e6352, 1);
  g.fillEllipse(13, -26, 7, 13); // floppy ear
  g.fillStyle(INK, 1);
  g.fillCircle(31, -26, 2.2); // nose
  g.fillCircle(21, -31, 1.8);
  g.fillStyle(0xe5484d, 1);
  g.fillEllipse(28, -19, 4, 5); // tongue
}

export const CHAR_HEIGHT: Record<string, number> = { nick: 100, evelyn: 62, tyler: 70, nora: 52, eloise: 42 };

export function drawActor(g: G, id: string) {
  if (id === 'nick') drawNick(g);
  else if (id === 'evelyn') drawEvelyn(g);
  else if (id === 'tyler') drawTyler(g);
  else if (id === 'nora') drawNora(g);
  else drawEloise(g);
}

// Kayla's mom in the FaceTime window.
export function drawMomFace(g: G, r: number) {
  g.fillStyle(0x8fb8de, 1);
  g.fillRoundedRect(-r, -r * 1.3, r * 2, r * 2.6, 10);
  g.fillStyle(0xd9d9d9, 1);
  g.fillEllipse(0, -r * 0.28, r * 1.45, r * 1.25);
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -r * 0.05, r * 0.55);
  g.fillStyle(0xe76f51, 1);
  g.fillEllipse(0, r * 0.95, r * 1.5, r * 0.8);
  g.lineStyle(2, INK, 1);
  g.strokeCircle(-r * 0.22, -r * 0.1, r * 0.17);
  g.strokeCircle(r * 0.22, -r * 0.1, r * 0.17);
  g.fillStyle(INK, 1);
  g.fillEllipse(0, r * 0.22, r * 0.28, r * 0.16);
}

// ---------------------------------------------------------------- icons (centered, ~s px)
export function drawIcon(g: G, key: string, s = 28) {
  const k = s / 28;
  const R = (x: number) => x * k;
  switch (key) {
    case 'snack':
      g.fillStyle(0xf4a261, 1);
      for (const [x, y] of [[-6, -3], [0, -6], [6, -3], [-3, 1], [4, 1]]) g.fillCircle(R(x), R(y), R(4));
      g.fillStyle(0x4ea8de, 1);
      g.fillRoundedRect(R(-12), R(1), R(24), R(9), R(4));
      break;
    case 'juice_box':
      g.fillStyle(0x80ed99, 1);
      g.fillRoundedRect(R(-8), R(-8), R(16), R(20), R(2));
      g.fillStyle(0xff9f1c, 1);
      g.fillCircle(0, R(2), R(5));
      g.lineStyle(R(2.5), 0xffffff, 1);
      g.lineBetween(R(4), R(-8), R(8), R(-15));
      break;
    case 'sippy_cup':
      g.fillStyle(0xff8fab, 1);
      g.fillRoundedRect(R(-7), R(-4), R(14), R(16), R(4));
      g.fillStyle(0x9b5de5, 1);
      g.fillRoundedRect(R(-8), R(-8), R(16), R(5), R(2));
      g.fillTriangle(R(-3), R(-8), R(3), R(-8), 0, R(-14));
      g.lineStyle(R(2.5), 0x9b5de5, 1);
      g.strokeCircle(R(-10), R(3), R(3));
      g.strokeCircle(R(10), R(3), R(3));
      break;
    case 'bandaid':
    case 'booboo':
      g.fillStyle(0xe9c46a, 1);
      g.fillRoundedRect(R(-13), R(-5), R(26), R(10), R(5));
      g.fillStyle(0xd4a373, 1);
      g.fillRect(R(-5), R(-5), R(10), R(10));
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(R(-9), R(-1), R(0.9));
      g.fillCircle(R(9), R(1), R(0.9));
      break;
    case 'diaper':
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(R(-13), R(-7), R(13), R(-7), 0, R(10));
      g.fillRoundedRect(R(-13), R(-9), R(26), R(6), R(2));
      g.fillStyle(0x8ecae6, 1);
      g.fillRect(R(-13), R(-9), R(4), R(5));
      g.fillRect(R(9), R(-9), R(4), R(5));
      break;
    case 'nora':
    case 'uppy':
      g.fillStyle(SKIN, 1);
      g.fillCircle(0, R(1), R(7));
      g.lineStyle(R(3.5), SKIN, 1);
      g.lineBetween(R(-7), R(0), R(-12), R(-11));
      g.lineBetween(R(7), R(0), R(12), R(-11));
      g.fillStyle(0xffd166, 1);
      g.fillRoundedRect(R(-7), R(7), R(14), R(6), R(2));
      g.fillStyle(0x8b5a2b, 1);
      g.fillTriangle(R(-1), R(-6), R(2), R(-6), R(2), R(-10));
      break;
    case 'eyes':
    case 'watch_this':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(R(-6), 0, R(10), R(13));
      g.fillEllipse(R(6), 0, R(10), R(13));
      g.lineStyle(R(1.5), INK, 1);
      g.strokeEllipse(R(-6), 0, R(10), R(13));
      g.strokeEllipse(R(6), 0, R(10), R(13));
      g.fillStyle(INK, 1);
      g.fillCircle(R(-5), R(2), R(2.5));
      g.fillCircle(R(7), R(2), R(2.5));
      g.fillStyle(0xffd166, 1);
      star(g, R(11), R(-10), R(5));
      break;
    case 'shoe':
    case 'lost_shoe':
      g.fillStyle(0xe63946, 1);
      g.fillRoundedRect(R(-12), R(-6), R(14), R(12), R(4));
      g.fillRoundedRect(R(-12), R(0), R(24), R(7), R(3));
      g.fillStyle(0xffffff, 1);
      g.fillRect(R(-12), R(6), R(24), R(3));
      g.fillCircle(R(-6), R(-2), R(1));
      g.fillCircle(R(-2), R(-2), R(1));
      break;
    case 'tv':
    case 'screen_time':
      g.fillStyle(0x3d405b, 1);
      g.fillRoundedRect(R(-13), R(-9), R(26), R(18), R(3));
      g.fillStyle(0x8ecae6, 1);
      g.fillRect(R(-10), R(-6), R(20), R(12));
      g.fillStyle(0xffd166, 1);
      g.fillTriangle(R(-3), R(-3), R(-3), R(3), R(3), 0);
      g.lineStyle(R(1.8), 0x3d405b, 1);
      g.lineBetween(R(-4), R(-9), R(-8), R(-14));
      g.lineBetween(R(4), R(-9), R(8), R(-14));
      break;
    case 'fight':
      g.fillStyle(0xffd166, 1);
      star(g, 0, 0, R(14), 8, 0.5);
      g.fillStyle(0xe5484d, 1);
      star(g, 0, 0, R(8), 6, 0.5);
      break;
    case 'spill':
      g.fillStyle(0x4ea8de, 1);
      g.fillEllipse(0, R(5), R(26), R(10));
      g.fillCircle(R(-8), R(1), R(4));
      g.fillCircle(R(6), R(2), R(5));
      g.fillStyle(0x8b5a2b, 1);
      g.fillRoundedRect(R(-4), R(-14), R(8), R(10), R(2));
      break;
    case 'needs_out':
    case 'paw':
      g.fillStyle(0x6e6352, 1);
      g.fillEllipse(0, R(4), R(13), R(11));
      g.fillCircle(R(-8), R(-4), R(3.2));
      g.fillCircle(R(-3), R(-9), R(3.2));
      g.fillCircle(R(3), R(-9), R(3.2));
      g.fillCircle(R(8), R(-4), R(3.2));
      break;
    case 'burger':
    case 'flip':
      g.fillStyle(0xe9a23b, 1);
      g.fillEllipse(0, R(-5), R(24), R(11));
      g.fillStyle(0x6b3e1f, 1);
      g.fillRoundedRect(R(-12), R(-1), R(24), R(5), R(2));
      g.fillStyle(0x80b918, 1);
      g.fillRect(R(-12), R(-2), R(24), R(2));
      g.fillStyle(0xe9a23b, 1);
      g.fillRoundedRect(R(-11), R(4), R(22), R(5), R(2));
      g.lineStyle(R(2.5), 0x9aa0a6, 1);
      g.lineBetween(R(8), R(-12), R(14), R(-4));
      break;
    case 'thermostat':
      g.fillStyle(0xf8f9fa, 1);
      g.fillCircle(0, 0, R(12));
      g.lineStyle(R(2), 0x6c757d, 1);
      g.strokeCircle(0, 0, R(12));
      g.lineStyle(R(3), 0xe5484d, 1);
      g.lineBetween(0, 0, R(7), R(-6));
      g.fillStyle(0x6c757d, 1);
      g.fillCircle(0, 0, R(2.5));
      break;
    case 'coffee':
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(R(-8), R(-7), R(14), R(16), R(3));
      g.lineStyle(R(2.5), 0xffffff, 1);
      g.strokeCircle(R(8), R(1), R(4));
      g.fillStyle(0x6b3e1f, 1);
      g.fillRect(R(-7), R(-6), R(12), R(3));
      g.lineStyle(R(1.5), 0xcccccc, 1);
      g.lineBetween(R(-3), R(-10), R(-1), R(-15));
      g.lineBetween(R(2), R(-10), R(4), R(-15));
      break;
    case 'door':
      g.fillStyle(0x8d5a3b, 1);
      g.fillRoundedRect(R(-9), R(-13), R(18), R(26), R(2));
      g.fillStyle(0xffd166, 1);
      g.fillCircle(R(5), R(1), R(2));
      break;
    case 'dirt':
      g.fillStyle(0x7f5539, 1);
      g.fillEllipse(0, R(4), R(26), R(12));
      g.fillCircle(R(-4), R(-1), R(6));
      g.fillCircle(R(5), 0, R(5));
      break;
    case 'yes':
      g.lineStyle(R(4), 0x2a9d8f, 1);
      g.beginPath();
      g.moveTo(R(-10), 0);
      g.lineTo(R(-3), R(8));
      g.lineTo(R(11), R(-8));
      g.strokePath();
      break;
    case 'no':
      g.lineStyle(R(4), 0xe5484d, 1);
      g.lineBetween(R(-9), R(-9), R(9), R(9));
      g.lineBetween(R(9), R(-9), R(-9), R(9));
      break;
    case 'phone':
      g.fillStyle(0x22223b, 1);
      g.fillRoundedRect(R(-7), R(-12), R(14), R(24), R(3));
      g.fillStyle(0x8fb8de, 1);
      g.fillRect(R(-5), R(-9), R(10), R(17));
      break;
    case 'joke':
      g.fillStyle(0xffd166, 1);
      g.fillCircle(0, 0, R(12));
      g.fillStyle(INK, 1);
      g.fillCircle(R(-4), R(-3), R(1.8));
      g.fillCircle(R(4), R(-3), R(1.8));
      g.lineStyle(R(2), INK, 1);
      g.beginPath();
      g.arc(0, R(1), R(6), 0.2, Math.PI - 0.2, false);
      g.strokePath();
      break;
    case 'kayla':
      g.fillStyle(0xe76f51, 1);
      g.fillRoundedRect(R(-8), R(-12), R(16), R(24), R(4));
      g.fillStyle(0xffffff, 1);
      g.fillRect(R(-6), R(-9), R(12), R(16));
      g.fillStyle(0xe76f51, 1);
      heart(g, 0, R(-1), R(4));
      break;
    case 'bis':
      g.fillStyle(0x3d405b, 1);
      g.fillRoundedRect(R(-3), R(-13), R(6), R(16), R(3));
      g.fillCircle(0, R(9), R(3.5));
      break;
    default:
      g.fillStyle(0xcccccc, 1);
      g.fillCircle(0, 0, R(8));
  }
}

function star(g: G, x: number, y: number, r: number, n = 5, inner = 0.45) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillPoints(pts, true);
}

function heart(g: G, x: number, y: number, r: number) {
  g.fillCircle(x - r * 0.5, y - r * 0.2, r * 0.6);
  g.fillCircle(x + r * 0.5, y - r * 0.2, r * 0.6);
  g.fillTriangle(x - r * 1.05, y, x + r * 1.05, y, x, y + r * 1.1);
}

// ---------------------------------------------------------------- top-down floor plan
// Drawn in world coordinates offset by (ox, oy). Walls and doorways come from the sim's map.
export function drawWorld(g: G, ox: number, oy: number) {
  const X = (x: number) => x + ox;
  const Y = (y: number) => y + oy;
  const R = (r: Rect, color: number, alpha = 1) => g.fillStyle(color, alpha).fillRect(X(r.x), Y(r.y), r.w, r.h);
  const yard = ROOM_RECTS.backyard;
  const kit = ROOM_RECTS.kitchen;
  const liv = ROOM_RECTS.living;
  const gar = ROOM_RECTS.garage;

  // Backyard: mowed stripes, fence, patio, sandbox, tree, grill pad.
  R(yard, 0x7cc47f);
  for (let x = 0; x < yard.w; x += 52) g.fillStyle(0x72b975, 1).fillRect(X(x), Y(0), 26, yard.h);
  g.fillStyle(0xd9cbb3, 1).fillRect(X(16), Y(124), 358, 36);
  g.lineStyle(1, 0xc4b394, 1);
  for (let x = 16; x <= 374; x += 18) g.lineBetween(X(x), Y(124), X(x), Y(160));
  g.lineBetween(X(16), Y(142), X(374), Y(142));
  g.fillStyle(0xe9d8a6, 1).fillRect(X(0), Y(0), 390, 6).fillRect(X(0), Y(0), 6, 160).fillRect(X(384), Y(0), 6, 160);
  g.fillStyle(0xd4c08a, 1);
  for (let x = 0; x < 390; x += 14) g.fillRect(X(x), Y(0), 2, 6);
  // sandbox
  g.fillStyle(0xa47148, 1).fillRect(X(30), Y(30), 64, 50);
  g.fillStyle(0xf2dfa7, 1).fillRect(X(34), Y(34), 56, 42);
  g.fillStyle(0xe63946, 1).fillCircle(X(50), Y(50), 5);
  g.fillStyle(0x3a86ff, 1).fillRect(X(66), Y(56), 10, 8);
  // tree canopy (shade)
  g.fillStyle(0x000000, 0.12).fillCircle(X(196), Y(52), 40);
  g.fillStyle(0x4f9a52, 1).fillCircle(X(186), Y(44), 34);
  g.fillStyle(0x5aad5d, 1).fillCircle(X(176), Y(36), 18).fillCircle(X(198), Y(48), 16);
  // grill pad
  g.fillStyle(0xb5a48a, 1).fillRect(X(300), Y(32), 64, 62);

  // Kitchen: tiles, counter down the left wall, table, high chair.
  checker(g, X(kit.x), Y(kit.y), kit.w, kit.h, 0xf6f1e3, 0xdfe7ef, 16);
  g.fillStyle(0xa47148, 1).fillRect(X(0), Y(166), 36, 184);
  g.fillStyle(0xc08552, 1).fillRect(X(0), Y(166), 32, 184);
  g.fillStyle(0xe8d9c0, 1).fillRect(X(32), Y(166), 4, 184);
  g.fillStyle(0x000000, 0.1).fillCircle(X(112), Y(252), 28);
  g.fillStyle(0x8d5a3b, 1).fillCircle(X(110), Y(248), 26);
  g.fillStyle(0xa47148, 1).fillCircle(X(110), Y(248), 21);
  g.fillStyle(0xe76f51, 1);
  for (const [cx, cy] of [[110, 212], [110, 284], [74, 248], [146, 248]]) g.fillRoundedRect(X(cx - 9), Y(cy - 9), 18, 18, 4);
  g.fillStyle(0xf4a261, 1).fillRoundedRect(X(136), Y(306), 28, 24, 5);
  g.fillStyle(0xe76f51, 1).fillRoundedRect(X(138), Y(296), 24, 10, 3);

  // Living room: planks, rug, couch facing the TV, coffee table, playpen, window.
  planksH(g, X(liv.x), Y(liv.y), liv.w, liv.h);
  g.fillStyle(0xe9c46a, 0.9).fillEllipse(X(292), Y(418), 170, 120);
  g.lineStyle(3, 0xd4a373, 1).strokeEllipse(X(292), Y(418), 150, 104);
  g.fillStyle(0x000000, 0.12).fillRoundedRect(X(238), Y(372), 112, 40, 8);
  g.fillStyle(0x6d597a, 1).fillRoundedRect(X(236), Y(366), 112, 16, 6); // back
  g.fillStyle(0x83709a, 1).fillRoundedRect(X(244), Y(380), 96, 24, 5); // seat
  g.fillStyle(0x6d597a, 1).fillRoundedRect(X(232), Y(372), 14, 34, 5).fillRoundedRect(X(338), Y(372), 14, 34, 5);
  g.lineStyle(1, 0x6d597a, 1).lineBetween(X(276), Y(382), X(276), Y(402)).lineBetween(X(308), Y(382), X(308), Y(402));
  g.fillStyle(0x8d5a3b, 1).fillRoundedRect(X(268), Y(440), 48, 24, 4);
  g.fillStyle(0x22223b, 1).fillRect(X(244), Y(506), 96, 10);
  g.fillStyle(0x4a4e69, 1).fillRect(X(250), Y(504), 84, 4);
  g.lineStyle(2, 0x5fa8d3, 1).strokeRect(X(330), Y(200), 44, 44);
  for (let k = 0; k <= 44; k += 7) {
    g.lineBetween(X(330 + k), Y(200), X(330 + k), Y(203));
    g.lineBetween(X(330 + k), Y(241), X(330 + k), Y(244));
  }
  g.fillStyle(0xbde0fe, 1).fillRect(X(386), Y(250), 4, 90);
  g.fillStyle(0xffd166, 1).fillCircle(X(346), Y(214), 4);
  g.fillStyle(0xe63946, 1).fillRect(X(356), Y(228), 7, 7);

  // Garage: concrete, joints, oil stain, workbench, garage door segments.
  R(gar, 0xa3abb5);
  g.lineStyle(1, 0x8d96a1, 1).lineBetween(X(0), Y(438), X(188), Y(438)).lineBetween(X(94), Y(356), X(94), Y(520));
  g.fillStyle(0x6c757d, 0.3).fillEllipse(X(110), Y(452), 52, 22);
  g.fillStyle(0x8d6748, 1).fillRect(X(0), Y(356), 34, 100);
  g.fillStyle(0x6c584c, 1).fillRect(X(30), Y(356), 4, 100);
  g.fillStyle(0xdee2e6, 1);
  for (let x = 4; x < 186; x += 30) g.fillRect(X(x), Y(514), 26, 4);

  // Outer walls + interior walls with doorway leaves.
  g.fillStyle(0x3d2c2e, 1);
  g.fillRect(X(0), Y(160), 4, 360).fillRect(X(386), Y(160), 4, 360).fillRect(X(0), Y(516), 390, 4);
  for (const w of WALLS) g.fillRect(X(w.x), Y(w.y), w.w, w.h);
  g.lineStyle(2, 0x8d5a3b, 1);
  g.lineBetween(X(60), Y(166), X(60), Y(206)); // back door leaf, open into the kitchen
  g.lineStyle(1, 0x8d5a3b, 0.6);
  g.beginPath();
  g.arc(X(60), Y(166), 40, 0, Math.PI / 2 - 0.25, false);
  g.strokePath();
  g.lineStyle(3, 0xbde0fe, 1).lineBetween(X(300), Y(163), X(328), Y(163)); // slider glass
  g.lineStyle(2, 0x8d5a3b, 0.8).lineBetween(X(188), Y(228), X(168), Y(228));
  g.lineBetween(X(112), Y(356), X(112), Y(376));
  g.lineBetween(X(194), Y(440), X(214), Y(440));
}

export function drawSpot(g: G, s: string, x: number, y: number) {
  switch (s) {
    case 'spot_toolbox':
      g.fillStyle(0xd62828, 1).fillRoundedRect(x - 13, y - 8, 26, 16, 3);
      g.fillStyle(0x22223b, 1).fillRect(x - 13, y - 1, 26, 2).fillRect(x - 6, y - 11, 12, 3);
      break;
    case 'spot_bin':
      g.fillStyle(0x2667cc, 1).fillRoundedRect(x - 15, y - 11, 30, 22, 3);
      g.fillStyle(0x3a86ff, 1).fillRoundedRect(x - 12, y - 8, 24, 16, 2);
      g.fillStyle(0xffffff, 1).fillEllipse(x - 4, y, 9, 5).fillEllipse(x + 5, y + 2, 9, 5);
      break;
    case 'spot_cooler':
      g.fillStyle(0xffffff, 1).fillRoundedRect(x - 14, y - 10, 28, 20, 3);
      g.fillStyle(0x4ea8de, 1).fillRect(x - 14, y - 10, 28, 6);
      break;
    case 'spot_bike':
      g.lineStyle(3, 0x22223b, 1).strokeCircle(x - 9, y + 4, 7).strokeCircle(x + 11, y + 4, 7);
      g.lineBetween(x - 9, y + 4, x + 2, y - 5).lineBetween(x + 2, y - 5, x + 11, y + 4);
      g.fillStyle(0xc68b59, 1).fillRoundedRect(x - 18, y - 12, 14, 9, 2);
      break;
  }
}

// Kettle grill seen from above.
export function drawGrill(g: G, x: number, y: number) {
  g.fillStyle(0x000000, 0.2).fillCircle(x + 2, y + 3, 20);
  g.fillStyle(0x22223b, 1).fillCircle(x, y, 19);
  g.lineStyle(1.5, 0x6c757d, 1);
  for (let k = -12; k <= 12; k += 6) g.lineBetween(x + k, y - Math.sqrt(256 - k * k), x + k, y + Math.sqrt(256 - k * k));
  g.fillStyle(0x3d405b, 1).fillRoundedRect(x - 6, y + 17, 12, 6, 2);
}

function checker(g: G, x: number, y: number, w: number, h: number, a: number, b: number, s: number) {
  for (let i = 0; i * s < w; i++)
    for (let j = 0; j * s < h; j++) {
      g.fillStyle((i + j) % 2 ? a : b, 1);
      g.fillRect(x + i * s, y + j * s, Math.min(s, w - i * s), Math.min(s, h - j * s));
    }
}

function planksH(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle(0xc68b59, 1).fillRect(x, y, w, h);
  g.lineStyle(1, 0xa86f42, 1);
  for (let yy = y + 14; yy < y + h; yy += 14) g.lineBetween(x, yy, x + w, yy);
  for (let row = 0; row * 14 < h; row++)
    for (let xx = x + ((row * 41) % 70); xx < x + w; xx += 70) g.lineBetween(xx, y + row * 14, xx, Math.min(y + h, y + row * 14 + 14));
}
