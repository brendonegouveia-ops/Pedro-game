// Original procedural art: every character, icon and room is drawn with Graphics primitives.
import type Phaser from 'phaser';
import { ROOMS } from '../config';
import { COUCH_POS, type RoomId } from '../sim/house';
import { roomPoint, roomRect, ROOM_H, ROOM_W } from './layout';

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

// ---------------------------------------------------------------- rooms
export function drawRooms(g: G) {
  const kit = roomRect('kitchen');
  const liv = roomRect('living');
  const gar = roomRect('garage');
  const yard = roomRect('backyard');
  const floorY = 0.58;

  // Kitchen: butter-yellow wall, checkered floor, counter + fridge.
  g.fillStyle(0xfbe7a1, 1).fillRect(kit.x, kit.y, kit.w, kit.h);
  g.fillStyle(0xffffff, 0.35).fillRect(kit.x, kit.y + 8, kit.w, 3);
  checker(g, kit.x, kit.y + kit.h * floorY, kit.w, kit.h * (1 - floorY), 0xf8f9fa, 0xd8dee9, 14);
  g.fillStyle(0xc08552, 1).fillRect(kit.x + 4, kit.y + kit.h * 0.38, kit.w * 0.78, 10);
  g.fillStyle(0xa47148, 1).fillRect(kit.x + 4, kit.y + kit.h * 0.38 + 10, kit.w * 0.78, kit.h * 0.2 - 10);
  g.fillStyle(0xdee2e6, 1).fillRoundedRect(kit.x + kit.w * 0.74, kit.y + kit.h * 0.12, kit.w * 0.24, kit.h * 0.48, 4);
  g.lineStyle(2, 0xadb5bd, 1).lineBetween(kit.x + kit.w * 0.74, kit.y + kit.h * 0.3, kit.x + kit.w * 0.98, kit.y + kit.h * 0.3);
  // high chair
  const hc = roomPoint('kitchen', 0.15, 0.7);
  g.fillStyle(0xe76f51, 1).fillRoundedRect(hc.x - 12, hc.y - 18, 24, 6, 2);
  g.lineStyle(3, 0xe76f51, 1);
  g.lineBetween(hc.x - 10, hc.y - 12, hc.x - 14, hc.y + 16);
  g.lineBetween(hc.x + 10, hc.y - 12, hc.x + 14, hc.y + 16);
  g.fillStyle(0xf4a261, 1).fillRoundedRect(hc.x - 9, hc.y - 34, 18, 16, 4);

  // Living room: slate wall, wood floor, couch, TV, window.
  g.fillStyle(0xa8c5da, 1).fillRect(liv.x, liv.y, liv.w, liv.h);
  planks(g, liv.x, liv.y + liv.h * floorY, liv.w, liv.h * (1 - floorY));
  g.fillStyle(0xdff3ff, 1).fillRoundedRect(liv.x + liv.w * 0.62, liv.y + 16, liv.w * 0.3, liv.h * 0.26, 3);
  g.lineStyle(3, 0xffffff, 1).strokeRoundedRect(liv.x + liv.w * 0.62, liv.y + 16, liv.w * 0.3, liv.h * 0.26, 3);
  g.lineBetween(liv.x + liv.w * 0.77, liv.y + 16, liv.x + liv.w * 0.77, liv.y + 16 + liv.h * 0.26);
  g.fillStyle(0x22223b, 1).fillRoundedRect(liv.x + liv.w * 0.3, liv.y + 22, liv.w * 0.28, liv.h * 0.2, 3);
  g.fillStyle(0x4a4e69, 1).fillRect(liv.x + liv.w * 0.32, liv.y + 25, liv.w * 0.24, liv.h * 0.2 - 6);
  const couch = roomPoint(COUCH_POS.room, COUCH_POS.x, COUCH_POS.y);
  g.fillStyle(0x6d597a, 1).fillRoundedRect(couch.x - 46, couch.y - 30, 92, 26, 8);
  g.fillStyle(0x83709a, 1).fillRoundedRect(couch.x - 50, couch.y - 10, 100, 18, 6);
  g.fillStyle(0x6d597a, 1).fillRoundedRect(couch.x - 56, couch.y - 22, 12, 30, 5);
  g.fillRoundedRect(couch.x + 44, couch.y - 22, 12, 30, 5);
  // playpen
  const pp = roomPoint('living', 0.84, 0.72);
  g.lineStyle(2, 0x5fa8d3, 1).strokeRoundedRect(pp.x - 20, pp.y - 22, 40, 34, 4);
  for (let i = -14; i <= 14; i += 7) g.lineBetween(pp.x + i, pp.y - 22, pp.x + i, pp.y + 12);

  // Garage: concrete, pegboard, shelf.
  g.fillStyle(0xb0b6bd, 1).fillRect(gar.x, gar.y, gar.w, gar.h);
  g.fillStyle(0xd2b48c, 1).fillRect(gar.x + 6, gar.y + 10, gar.w - 12, gar.h * 0.3);
  g.fillStyle(0xbf9b6f, 1);
  for (let x = gar.x + 14; x < gar.x + gar.w - 8; x += 12)
    for (let y = gar.y + 16; y < gar.y + gar.h * 0.3 + 6; y += 12) g.fillCircle(x, y, 1.2);
  g.fillStyle(0x8d99ae, 1).fillRect(gar.x, gar.y + gar.h * floorY, gar.w, gar.h * (1 - floorY));
  g.fillStyle(0x6c757d, 0.35).fillEllipse(gar.x + gar.w * 0.6, gar.y + gar.h * 0.86, 60, 12);
  g.fillStyle(0x6c584c, 1).fillRect(gar.x + 4, gar.y + gar.h * 0.42, gar.w - 8, 6);

  // Backyard: sky, fence, grass, house siding by the back door.
  g.fillStyle(0x9bd4f5, 1).fillRect(yard.x, yard.y, yard.w, yard.h * 0.5);
  g.fillStyle(0xffd166, 1).fillCircle(yard.x + yard.w - 26, yard.y + 24, 13);
  g.fillStyle(0xe9d8a6, 1);
  for (let x = yard.x + 30; x < yard.x + yard.w; x += 13) g.fillRoundedRect(x, yard.y + yard.h * 0.32, 10, yard.h * 0.22, 3);
  g.fillStyle(0x76c893, 1).fillRect(yard.x, yard.y + yard.h * 0.5, yard.w, yard.h * 0.5);
  g.fillStyle(0x52b69a, 1);
  for (let i = 0; i < 26; i++) {
    const gx = yard.x + 30 + ((i * 37) % (yard.w - 40));
    const gy = yard.y + yard.h * 0.56 + ((i * 53) % (yard.h * 0.4));
    g.fillTriangle(gx, gy, gx + 3, gy, gx + 1.5, gy - 5);
  }
  g.fillStyle(0xd8c3a5, 1).fillRect(yard.x, yard.y, 24, yard.h);
  g.lineStyle(1, 0xbfa888, 1);
  for (let y = yard.y + 8; y < yard.y + yard.h; y += 8) g.lineBetween(yard.x, y, yard.x + 24, y);
  const door = roomPoint('backyard', 0.13, 0.42);
  g.fillStyle(0x8d5a3b, 1).fillRoundedRect(door.x - 15, door.y - 34, 30, 64, 3);
  g.fillStyle(0xbde0fe, 1).fillRect(door.x - 9, door.y - 26, 18, 16);
  g.fillStyle(0xffd166, 1).fillCircle(door.x + 9, door.y + 2, 2.5);

  // Walls between rooms + outer frame.
  g.lineStyle(4, 0x3d2c2e, 1);
  g.strokeRect(kit.x + 2, kit.y, kit.w * 2 - 4, kit.h * 2);
  g.lineBetween(liv.x, liv.y, liv.x, liv.y + ROOM_H * 2);
  g.lineBetween(kit.x, gar.y, kit.x + ROOM_W * 2, gar.y);
  // doorways
  g.fillStyle(0x3d2c2e, 1);
}

// Label chips are drawn separately so they stay crisp text.
export const ROOM_LABELS = (Object.keys(ROOMS) as RoomId[]).map((r) => ({ room: r, name: ROOMS[r].name }));

function checker(g: G, x: number, y: number, w: number, h: number, a: number, b: number, s: number) {
  for (let i = 0; i * s < w; i++)
    for (let j = 0; j * s < h; j++) {
      g.fillStyle((i + j) % 2 ? a : b, 1);
      g.fillRect(x + i * s, y + j * s, Math.min(s, w - i * s), Math.min(s, h - j * s));
    }
}

function planks(g: G, x: number, y: number, w: number, h: number) {
  g.fillStyle(0xc68b59, 1).fillRect(x, y, w, h);
  g.lineStyle(1, 0xa86f42, 1);
  for (let yy = y + 12; yy < y + h; yy += 12) g.lineBetween(x, yy, x + w, yy);
  for (let row = 0; row * 12 < h; row++)
    for (let xx = x + ((row * 37) % 60); xx < x + w; xx += 60) g.lineBetween(xx, y + row * 12, xx, y + row * 12 + 12);
}
