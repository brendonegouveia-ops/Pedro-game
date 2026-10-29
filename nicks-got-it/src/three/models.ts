// Low-poly 3D models for the cast, built from primitives (original art, no assets).
// Units are the sim's design px (about 40 per meter); models face +z and stand on y = 0.
import * as THREE from 'three';

export interface Rig {
  root: THREE.Group; // positioned/rotated in the world
  body: THREE.Group; // bobs and shakes
  legs: THREE.Object3D[]; // swing pivots (at the hip)
  arms: THREE.Object3D[];
  hand?: THREE.Group; // where Nick's free-hand item goes
  height: number;
  heading: number;
  phase: number;
  lastX: number;
  lastZ: number;
}

const mats = new Map<number, THREE.MeshLambertMaterial>();
export function mat(color: number): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, color: number | THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function cyl(rt: number, rb: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function ball(r: number, color: number, x = 0, y = 0, z = 0, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const SKIN = 0xf1c6a0;
const SKIN_DARK = 0xd9a77f;
const INK = 0x2b2033;

function limb(len: number, r: number, color: number, x: number, y: number, tip?: THREE.Mesh) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(cyl(r, r * 0.9, len, color, 0, -len / 2, 0, 8));
  if (tip) {
    tip.position.y -= len;
    pivot.add(tip);
  }
  return pivot;
}

function eyes(head: THREE.Object3D, r: number, y: number) {
  head.add(ball(r * 0.13, INK, -r * 0.36, y, r * 0.88, 6));
  head.add(ball(r * 0.13, INK, r * 0.36, y, r * 0.88, 6));
}

function rig(root: THREE.Group, body: THREE.Group, legs: THREE.Object3D[], arms: THREE.Object3D[], height: number, hand?: THREE.Group): Rig {
  root.add(body);
  // Contact shadow so feet read on any floor.
  const s = new THREE.Mesh(new THREE.CircleGeometry(height * 0.22, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.6;
  root.add(s);
  return { root, body, legs, arms, hand, height, heading: 0, phase: 0, lastX: NaN, lastZ: NaN };
}

// Nick: teal polo, cargo shorts, white socks with sandals, sunglasses parked on his head, coffee in his right hand.
export function makeNick(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs = [-5, 5].map((x) => {
    const sandal = box(7, 2, 12, 0x5b3a1e, 0, -1, 2);
    const leg = limb(24, 3.2, SKIN, x, 25, sandal);
    leg.add(cyl(3.6, 3.6, 7, 0xffffff, 0, -20, 0, 8)); // socks
    return leg;
  });
  body.add(...legs);
  body.add(box(24, 13, 15, 0xb59a6a, 0, 30));
  body.add(box(4, 7, 8, 0x9a8056, -13, 29), box(4, 7, 8, 0x9a8056, 13, 29));
  body.add(box(25, 22, 16, 0x2a9d8f, 0, 46));
  body.add(ball(10, 0x2a9d8f, 0, 40, 4)); // dad belly
  body.add(box(10, 3, 1, 0x23867a, 0, 56, 8));
  const hand = new THREE.Group();
  const armL = limb(19, 3, SKIN, -15, 55);
  armL.add(cyl(3.6, 3.4, 6, 0x2a9d8f, 0, -2, 0, 8));
  hand.position.set(0, -20, 4);
  armL.add(hand);
  const armR = limb(19, 3, SKIN, 15, 55);
  armR.add(cyl(3.6, 3.4, 6, 0x2a9d8f, 0, -2, 0, 8));
  const mug = new THREE.Group();
  mug.add(cyl(3.4, 3.2, 7, 0xffffff, 0, 0, 0, 10));
  mug.add(cyl(3.0, 3.0, 0.6, 0x6b3e1f, 0, 3.4, 0, 10));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.7, 6, 10), mat(0xffffff));
  handle.position.set(3.6, 0, 0);
  mug.add(handle);
  mug.position.set(0, -21, 4);
  armR.add(mug);
  armR.rotation.x = -0.5; // holding it up a bit
  body.add(armL, armR);
  const head = new THREE.Group();
  head.position.set(0, 66, 0);
  head.add(ball(9, SKIN));
  const hair = ball(9.4, 0x6b4423);
  hair.scale.set(1, 0.55, 1);
  hair.position.y = 3.5;
  head.add(hair);
  head.add(box(14, 2.6, 4, INK, 0, 7.5, 4)); // sunglasses on his head
  head.add(box(9, 2, 1, 0x8a6a50, 0, -5, 8.2)); // stubble
  eyes(head, 9, 0.5);
  body.add(head);
  return rig(root, body, legs, [armL, armR], 76, hand);
}

export function makeEvelyn(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs = [-3, 3].map((x) => limb(11, 2, SKIN, x, 12, box(4.5, 2.4, 6, 0xff6fa8, 0, -1, 1)));
  body.add(...legs);
  body.add(cyl(4, 10, 18, 0x9b5de5, 0, 19, 0, 14)); // dress
  body.add(box(11, 9, 8, 0x9b5de5, 0, 30));
  const arms = [-7.5, 7.5].map((x) => limb(11, 1.8, SKIN, x, 33));
  body.add(...arms);
  const head = new THREE.Group();
  head.position.set(0, 41, 0);
  head.add(ball(7.5, SKIN));
  const hair = ball(7.9, 0xc9a227);
  hair.scale.set(1, 0.6, 1);
  hair.position.y = 2.5;
  head.add(hair);
  head.add(ball(3.2, 0xc9a227, -8, 1, -1), ball(3.2, 0xc9a227, 8, 1, -1)); // pigtails
  head.add(ball(1.4, 0xff6fa8, -6.5, 3, 0), ball(1.4, 0xff6fa8, 6.5, 3, 0));
  eyes(head, 7.5, 0);
  body.add(head);
  return rig(root, body, legs, arms, 49);
}

let stripes: THREE.CanvasTexture | null = null;
function stripeTexture() {
  if (stripes) return stripes;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = '#f4f1de';
    g.fillRect(0, i * 8, 8, 4);
    g.fillStyle = '#e07a5f';
    g.fillRect(0, i * 8 + 4, 8, 4);
  }
  stripes = new THREE.CanvasTexture(c);
  stripes.colorSpace = THREE.SRGBColorSpace;
  return stripes;
}

export function makeTyler(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs = [-3.2, 3.2].map((x) => {
    const leg = limb(13, 2.2, SKIN_DARK, x, 14, box(5, 2.6, 7, 0xffffff, 0, -1, 1));
    return leg;
  });
  body.add(...legs);
  body.add(box(13, 7, 9, 0x3d5a80, 0, 15));
  body.add(box(14, 14, 9, new THREE.MeshLambertMaterial({ map: stripeTexture() }), 0, 25));
  const arms = [-8.5, 8.5].map((x) => limb(12, 2, SKIN_DARK, x, 31));
  body.add(...arms);
  const head = new THREE.Group();
  head.position.set(0, 40, 0);
  head.add(ball(7.5, SKIN_DARK));
  head.add(cyl(7.8, 7.8, 4, 0xd62828, 0, 4.5, 0, 14)); // cap
  head.add(box(9, 1.2, 7, 0xd62828, 0, 3, 8)); // brim, forward
  eyes(head, 7.5, 0);
  body.add(head);
  return rig(root, body, legs, arms, 50);
}

export function makeNora(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const legs = [-3, 3].map((x) => limb(6, 2.6, SKIN, x, 7, ball(2.8, SKIN, 0, 0, 0.8, 8)));
  body.add(...legs);
  body.add(box(14, 7, 10, 0xffffff, 0, 9)); // diaper
  body.add(box(14, 10, 10, 0xffd166, 0, 17));
  const arms = [-8.5, 8.5].map((x) => limb(8, 2.2, SKIN, x, 21));
  body.add(...arms);
  const head = new THREE.Group();
  head.position.set(0, 29, 0);
  head.add(ball(7.5, SKIN));
  head.add(new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 6), mat(0x8b5a2b)).translateY(8.5)); // the one hair sprout
  eyes(head, 7.5, 0);
  body.add(head);
  return rig(root, body, legs, arms, 37);
}

// Eloise: medium, scruffy, gray-tan, permanently up to something.
export function makeEloise(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const fur = 0x9c8f7a;
  const legs = [
    [-4, 9],
    [4, 9],
    [-4, -9],
    [4, -9],
  ].map(([x, z]) => {
    const l = limb(10, 2, fur, x, 11);
    l.position.z = z;
    return l;
  });
  body.add(...legs);
  body.add(box(12, 11, 28, fur, 0, 15));
  for (let z = -10; z <= 10; z += 5) body.add(new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 5), mat(0xb5a88f)).translateX(((z * 7) % 3) - 1).translateY(22).translateZ(z));
  const tail = cyl(1.2, 2, 11, fur, 0, 22, -16, 6);
  tail.rotation.x = -0.7;
  body.add(tail);
  const head = new THREE.Group();
  head.position.set(0, 23, 16);
  head.add(box(10, 10, 10, fur));
  head.add(box(7, 6, 6, 0xb5a88f, 0, -2, 6)); // snout
  head.add(ball(1.4, INK, 0, -0.5, 9.2, 6)); // nose
  head.add(box(2.6, 8, 4, 0x6e6352, -6, -1, 0), box(2.6, 8, 4, 0x6e6352, 6, -1, 0)); // floppy ears
  head.add(ball(1, INK, -2.6, 2, 5.2, 6), ball(1, INK, 2.6, 2, 5.2, 6));
  head.add(box(2.4, 0.6, 3, 0xe5484d, 0, -5, 7)); // tongue
  body.add(head);
  return rig(root, body, legs, [], 32);
}

// Something small to hold: the free-hand item.
export function makeItem(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'snack':
      g.add(cyl(4, 3, 3, 0x4ea8de, 0, 0, 0, 10));
      for (const [x, z] of [[-1.5, 0], [1.5, 0.5], [0, -1.5]]) g.add(ball(1.6, 0xf4a261, x, 2, z, 6));
      break;
    case 'juice_box':
      g.add(box(4, 6, 3, 0x80ed99));
      g.add(cyl(0.4, 0.4, 4, 0xffffff, 1, 4.5, 0, 4));
      break;
    case 'sippy_cup':
      g.add(cyl(2.6, 2.4, 6, 0xff8fab, 0, 0, 0, 10));
      g.add(cyl(2.8, 2.8, 1.6, 0x9b5de5, 0, 3.6, 0, 10));
      break;
    case 'bandaid':
      g.add(box(7, 0.8, 3, 0xe9c46a));
      break;
    case 'phone':
      g.add(box(4, 7, 0.8, 0x22223b));
      break;
  }
  return g;
}
