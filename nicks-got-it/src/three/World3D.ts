// The 3D house and the third-person follow camera. The sim's floor plan (x, y) becomes the
// ground plane (x, z); 1 unit = 1 design px (~40 per meter). The 2D layer (HUD, bubbles,
// controls) is drawn by Phaser on top and uses project() to place things over the 3D view.
import * as THREE from 'three';
import { COFFEE } from '../config';
import { COUCH_POS, DOORS, FURNITURE, ROOM_RECTS, STATIONS, WALLS, WORLD as W_SIM, type StationId } from '../sim/house';
import { KID_IDS, type ActorId, type Sim } from '../sim/sim';
import { WORLD } from '../game/layout';
import { ball, box, cyl, makeEloise, makeEvelyn, makeItem, makeNick, makeNora, makeTyler, mat, type Rig } from './models';

// Cutaway walls (about chest height), so rooms read from the follow camera.
const WALL_H = 56;
// Camera: behind (south of) and above Nick, fixed heading, so D-pad up = away from the camera.
const CAM_OFFSET = new THREE.Vector3(0, 250, 215);
const LOOK_OFFSET = new THREE.Vector3(0, 18, -40);

type RingSpec = { x: number; z: number; r: number; color: number; alpha?: number; width?: number };

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, WORLD.w / WORLD.h, 4, 4000);
  private walls: THREE.Mesh[] = [];
  private wallMats = new Map<THREE.Mesh, THREE.MeshLambertMaterial>();
  private rigs = new Map<ActorId | 'nick', Rig>();
  private rings: THREE.Mesh[] = [];
  private ringsUsed = 0;
  private spills: THREE.Mesh[] = [];
  private patties: THREE.Mesh[] = [];
  private handKey = '';
  private camTarget = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private cssW = 390;
  private cssH = 844;
  private s = 1; // CSS px per design px
  private ready = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setScissorTest(true);
    this.scene.background = new THREE.Color(0x5f8f64);
    this.build();
  }

  // Match the Phaser canvas (CSS px); the 3D view fills its world rectangle.
  resize(cssW: number, cssH: number) {
    if (cssW === this.cssW && cssH === this.cssH && this.ready) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.s = cssW / 390;
    this.renderer.setSize(cssW, cssH, false);
    this.camera.aspect = WORLD.w / WORLD.h;
    this.camera.updateProjectionMatrix();
    this.ready = true;
  }

  // Design-space screen point for a world point (sim x, height h, sim y).
  project(x: number, y: number, h: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return {
      x: WORLD.x + ((v.x + 1) / 2) * WORLD.w,
      y: WORLD.y + ((1 - v.y) / 2) * WORLD.h,
      behind: v.z > 1,
    };
  }

  heightOf(id: ActorId | 'nick'): number {
    return this.rigs.get(id)?.height ?? 40;
  }

  // ------------------------------------------------------------ build
  private build() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.05));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
    sun.position.set(W_SIM.w / 2 - 160, 420, W_SIM.h / 2 + 140);
    sun.target.position.set(W_SIM.w / 2, 0, W_SIM.h / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sh = sun.shadow.camera;
    sh.left = -330;
    sh.right = 330;
    sh.top = 360;
    sh.bottom = -360;
    sh.near = 50;
    sh.far = 1200;
    sun.shadow.bias = -0.0015;
    sc.add(sun, sun.target);

    // Lawn all around, so the camera never shows the void past the property.
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat(0x5f8f64));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(W_SIM.w / 2, -1, W_SIM.h / 2);
    lawn.receiveShadow = true;
    sc.add(lawn);
    // Under-floor for door gaps and wall bands.
    this.floor(0, 158, W_SIM.w, W_SIM.h - 158, 0x6c584c, null, -0.2);

    const yard = ROOM_RECTS.backyard;
    this.floor(yard.x, yard.y, yard.w, yard.h, 0xffffff, stripes('#7cc47f', '#72b975', 26), 0, 52);
    this.floor(16, 124, 358, 36, 0xd9cbb3, null, 0.3); // patio
    const k = ROOM_RECTS.kitchen;
    this.floor(k.x, k.y, k.w + 6, k.h, 0xffffff, checker('#f6f1e3', '#dfe7ef'), 0, 32);
    const l = ROOM_RECTS.living;
    this.floor(l.x, l.y, l.w, l.h, 0xffffff, planks(), 0, 70);
    const g = ROOM_RECTS.garage;
    this.floor(g.x, g.y, g.w, g.h, 0xa3abb5, null, 0);
    for (const d of DOORS) {
      if (d.span > 100) continue;
      if (d.axis === 'h') this.floor(d.x - d.span / 2, d.y - 6, d.span, 12, 0xf3e3c3, null, 0.4);
      else this.floor(d.x - 6, d.y - d.span / 2, 12, d.span, 0xf3e3c3, null, 0.4);
    }

    // Walls: interior + outer shell. Each gets its own material so it can fade when it blocks Nick.
    for (const w of WALLS) if (w.y > 0) this.wall(w.x, w.y, w.w, w.h);
    this.wall(0, 160, 4, 360);
    this.wall(386, 160, 4, 360);
    this.wall(0, 516, 390, 4);
    // Door frames.
    for (const d of DOORS) {
      if (d.span > 100) continue;
      const a = d.span / 2;
      const post = (x: number, z: number) => sc.add(box(6, WALL_H - 10, 8, 0x8d5a3b, x, (WALL_H - 10) / 2, z));
      if (d.axis === 'h') {
        post(d.x - a, d.y);
        post(d.x + a, d.y);
      } else {
        post(d.x, d.y - a);
        post(d.x, d.y + a);
      }
    }

    this.furniture();
    this.backyard();

    // Cast.
    const add = (id: ActorId | 'nick', r: Rig) => {
      this.rigs.set(id, r);
      sc.add(r.root);
    };
    add('nick', makeNick());
    add('evelyn', makeEvelyn());
    add('nora', makeNora());
    add('tyler', makeTyler());
    add('eloise', makeEloise());

    // Pools: highlight rings, spills, burgers.
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.82, 1, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 2;
      m.visible = false;
      sc.add(m);
      this.rings.push(m);
    }
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshLambertMaterial({ color: 0x4ea8de, transparent: true, opacity: 0.8 }));
      sp.rotation.x = -Math.PI / 2;
      sp.scale.set(20, 11, 1);
      sp.visible = false;
      sc.add(sp);
      this.spills.push(sp);
    }
    for (const dx of [-6, 6]) {
      const p = cyl(5, 5, 2, 0x8b4a2b, STATIONS.grill.x + dx, 37, STATIONS.grill.y, 10);
      p.material = new THREE.MeshLambertMaterial({ color: 0x8b4a2b });
      p.visible = false;
      sc.add(p);
      this.patties.push(p);
    }
  }

  private floor(x: number, y: number, w: number, h: number, color: number, tex: THREE.Texture | null, lift = 0, tile = 0) {
    const m = new THREE.MeshLambertMaterial({ color });
    if (tex) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(w / (tile || 32), h / (tile || 32));
      m.map = t;
    }
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x + w / 2, lift, y + h / 2);
    p.receiveShadow = true;
    this.scene.add(p);
  }

  private wall(x: number, y: number, w: number, d: number) {
    const m = new THREE.MeshLambertMaterial({ color: 0xe9e2d6, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w + 2, WALL_H, d + 2), m);
    mesh.position.set(x + w / 2, WALL_H / 2, y + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // A darker cap reads as the cut edge of the wall from above.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 2.2, 2, d + 2.2), new THREE.MeshLambertMaterial({ color: 0x5c4447, transparent: true }));
    cap.position.y = WALL_H / 2;
    mesh.add(cap);
    this.scene.add(mesh);
    this.walls.push(mesh);
    this.wallMats.set(mesh, m);
  }

  private furniture() {
    const sc = this.scene;
    const F = (i: number) => FURNITURE[i];
    // Kitchen counter + what's on it.
    const c = F(0);
    sc.add(box(c.w, 34, c.h, 0xa47148, c.x + c.w / 2, 17, c.y + c.h / 2));
    sc.add(box(c.w + 2, 3, c.h, 0xe8d9c0, c.x + c.w / 2, 35.5, c.y + c.h / 2));
    const top = 37;
    const st = (s: StationId) => STATIONS[s];
    const cm = st('coffee');
    sc.add(box(12, 18, 12, 0x2b2d42, cm.x - 8, top + 9, cm.y), cyl(4, 4, 8, 0x9bd1e5, cm.x - 1, top + 4, cm.y, 10));
    const sn = st('snacks');
    sc.add(cyl(7, 5, 5, 0x4ea8de, sn.x - 8, top + 2.5, sn.y, 14));
    for (const [dx, dz] of [[-2, 0], [2, 2], [0, -3], [-10, 1], [-6, -2]]) sc.add(ball(2.2, 0xf4a261, sn.x - 8 + dx * 0.6 + 2, top + 5, sn.y + dz, 6));
    const ju = st('juice');
    for (const dz of [-5, 0, 5]) sc.add(box(5, 8, 4, 0x80ed99, ju.x - 8, top + 4, ju.y + dz));
    const sp = st('sippy');
    sc.add(cyl(3.2, 3, 8, 0xff8fab, sp.x - 8, top + 4, sp.y, 10), cyl(3.4, 3.4, 2, 0x9b5de5, sp.x - 8, top + 9, sp.y, 10));
    // Fridge in the counter's corner.
    sc.add(box(30, 60, 26, 0xdee2e6, 16, 30, 180));
    // Kitchen table + chairs.
    const t = F(1);
    const tx = t.x + t.w / 2;
    const tz = t.y + t.h / 2;
    sc.add(cyl(24, 24, 3, 0x8d5a3b, tx, 27, tz, 24), cyl(3, 4, 26, 0x6b4423, tx, 13, tz, 8));
    for (const [dx, dz] of [[0, -32], [0, 32], [-32, 0], [32, 0]]) sc.add(box(14, 16, 14, 0xe76f51, tx + dx, 8, tz + dz));
    // High chair.
    const hc = st('highchair');
    sc.add(box(16, 4, 14, 0xe76f51, hc.x, 30, hc.y), box(14, 12, 3, 0xf4a261, hc.x, 38, hc.y - 7));
    for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) sc.add(cyl(1, 1.4, 30, 0xe76f51, hc.x + dx, 15, hc.y + dz, 6));
    // Back door: slab swung open into the kitchen.
    const door = new THREE.Group();
    door.add(box(36, 52, 3, 0x8d5a3b, 18, 26, 0));
    door.add(ball(2, 0xffd166, 32, 26, 2.5, 8));
    door.position.set(48, 0, 168);
    door.rotation.y = -1.25;
    sc.add(door);
    // Thermostat on the wall.
    const th = st('thermostat');
    sc.add(box(10, 12, 3, 0xf8f9fa, th.x, 52, 167.5), ball(2.4, 0xe5484d, th.x, 52, 169, 8));
    // Living room: rug, couch facing the TV, coffee table, TV, playpen, window light.
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 36), mat(0xe9c46a));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(85, 60, 1);
    rug.position.set(292, 0.5, 418);
    rug.receiveShadow = true;
    sc.add(rug);
    const cou = F(2);
    const cx = cou.x + cou.w / 2;
    const cz = cou.y + cou.h / 2;
    sc.add(box(cou.w - 20, 14, cou.h - 8, 0x83709a, cx, 9, cz + 3)); // seat
    sc.add(box(cou.w, 30, 12, 0x6d597a, cx, 15, cou.y + 6)); // back (north side; faces south to the TV)
    sc.add(box(12, 22, cou.h, 0x6d597a, cou.x + 6, 11, cz), box(12, 22, cou.h, 0x6d597a, cou.x + cou.w - 6, 11, cz));
    const ct = F(3);
    sc.add(box(ct.w, 14, ct.h, 0x8d5a3b, ct.x + ct.w / 2, 7, ct.y + ct.h / 2));
    const tv = F(4);
    sc.add(box(tv.w, 16, tv.h, 0x22223b, tv.x + tv.w / 2, 8, tv.y + tv.h / 2));
    sc.add(box(tv.w - 10, 40, 3, 0x111122, tv.x + tv.w / 2, 38, tv.y + 6));
    sc.add(box(tv.w - 16, 34, 0.5, 0x4a6fa5, tv.x + tv.w / 2, 38, tv.y + 4.2));
    const pp = F(5);
    for (let i = 0; i <= 4; i++)
      for (const [x, z] of [
        [pp.x + (pp.w * i) / 4, pp.y],
        [pp.x + (pp.w * i) / 4, pp.y + pp.h],
        [pp.x, pp.y + (pp.h * i) / 4],
        [pp.x + pp.w, pp.y + (pp.h * i) / 4],
      ])
        sc.add(cyl(0.9, 0.9, 22, 0x5fa8d3, x, 11, z, 5));
    sc.add(box(pp.w, 2, pp.h, 0xbde0fe, pp.x + pp.w / 2, 1, pp.y + pp.h / 2));
    sc.add(ball(3, 0xffd166, pp.x + 10, 4, pp.y + 10, 8), box(5, 5, 5, 0xe63946, pp.x + 22, 3, pp.y + 22));
    // Garage: workbench, band-aid box, toolbox, bike, shoe bin, cooler, garage door.
    const wb = F(6);
    sc.add(box(wb.w, 30, wb.h, 0x8d6748, wb.x + wb.w / 2, 15, wb.y + wb.h / 2));
    const ba = st('bandaids');
    sc.add(box(12, 8, 10, 0xffffff, ba.x - 6, 34, ba.y), box(6, 1, 2, 0xe5484d, ba.x - 6, 38.5, ba.y), box(2, 1, 6, 0xe5484d, ba.x - 6, 38.6, ba.y));
    const tb = st('spot_toolbox');
    sc.add(box(14, 9, 18, 0xd62828, tb.x, 34.5, tb.y), box(3, 3, 8, 0x22223b, tb.x, 40, tb.y));
    const bk = st('spot_bike');
    for (const dz of [-9, 9]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(7, 1, 6, 16), mat(0x22223b));
      wheel.position.set(bk.x + 2, 8, bk.y + dz);
      wheel.rotation.y = Math.PI / 2;
      sc.add(wheel);
    }
    sc.add(box(2, 2, 18, 0x3a86ff, bk.x + 2, 12, bk.y), box(9, 6, 8, 0xc68b59, bk.x + 2, 17, bk.y - 10));
    const bn = st('spot_bin');
    sc.add(box(26, 16, 18, 0x2667cc, bn.x, 8, bn.y + 2), box(22, 1, 14, 0x3a86ff, bn.x, 16.2, bn.y + 2));
    const co = st('spot_cooler');
    sc.add(box(22, 14, 14, 0xffffff, co.x, 7, co.y + 2), box(22, 4, 14, 0x4ea8de, co.x, 15, co.y + 2));
    sc.add(box(160, 3, 2, 0xc8ced6, 94, 30, 517));
  }

  private backyard() {
    const sc = this.scene;
    // Hedge + fence along the back.
    sc.add(box(390, 40, 4, 0xe9d8a6, 195, 20, 2));
    for (let x = 12; x < 390; x += 20) sc.add(ball(14, 0x4f9a52, x, 18, 22 + ((x * 7) % 5), 8));
    // Tree.
    sc.add(cyl(5, 7, 60, 0x7f5539, 186, 30, 46, 8));
    sc.add(ball(30, 0x4f9a52, 186, 76, 46, 10), ball(20, 0x5aad5d, 170, 92, 38, 10), ball(18, 0x5aad5d, 202, 88, 56, 10));
    // Sandbox.
    const sb = FURNITURE[8];
    sc.add(box(sb.w, 8, sb.h, 0xa47148, sb.x + sb.w / 2, 4, sb.y + sb.h / 2));
    sc.add(box(sb.w - 8, 1, sb.h - 8, 0xf2dfa7, sb.x + sb.w / 2, 8.2, sb.y + sb.h / 2));
    sc.add(ball(4, 0xe63946, sb.x + 18, 11, sb.y + 18, 8), box(7, 5, 7, 0x3a86ff, sb.x + 40, 11, sb.y + 30));
    // Grill: kettle on three legs.
    const gr = STATIONS.grill;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(16, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x22223b));
    bowl.position.set(gr.x, 36, gr.y);
    bowl.castShadow = true;
    sc.add(bowl);
    sc.add(cyl(16, 16, 1, 0x6c757d, gr.x, 36, gr.y, 18));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(1.2, 1.2, 28, 0x22223b, gr.x + Math.cos(a) * 9, 13, gr.y + Math.sin(a) * 9, 6);
      sc.add(leg);
    }
    const lid = new THREE.Mesh(new THREE.SphereGeometry(16, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x22223b));
    lid.position.set(gr.x + 14, 44, gr.y - 12);
    lid.rotation.z = 1.2;
    sc.add(lid);
  }

  // ------------------------------------------------------------ per frame
  // dt: sim time (animations freeze while paused); realDt: wall clock (the camera always catches up).
  sync(sim: Sim, dt: number, now: number, realDt = dt) {
    if (!this.ready) return;
    // Cast positions + animation.
    const n = sim.nick;
    this.pose('nick', n.x, n.y, dt, now, n.moving, false);
    const nick = this.rigs.get('nick')!;
    for (const id of [...KID_IDS, 'eloise'] as ActorId[]) {
      const a = sim.actors[id];
      const r = this.rigs.get(id)!;
      r.root.visible = a.present;
      if (!a.present) continue;
      if (a.state === 'carried') {
        // On Nick's hip, on his free-hand side.
        const side = new THREE.Vector3(-14, 22, 6).applyAxisAngle(new THREE.Vector3(0, 1, 0), nick.heading);
        r.root.position.set(nick.root.position.x + side.x, side.y, nick.root.position.z + side.z);
        r.root.rotation.set(0, nick.heading, 0);
        r.lastX = NaN;
        continue;
      }
      if (a.state === 'asleep') {
        r.root.position.set(COUCH_POS.x - 14, 22, COUCH_POS.y + 6);
        r.root.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        r.body.position.set(0, 0, 0);
        r.lastX = NaN;
        continue;
      }
      r.root.rotation.x = 0;
      r.root.rotation.z = 0;
      const moving = !!a.dest || (a.state === 'outside' && !!a.dest);
      this.pose(id, a.x, a.y, dt, now, moving, a.state === 'crying');
    }
    // Free-hand item.
    const h = n.hand;
    const key = h && h !== 'nora' ? h : '';
    if (key !== this.handKey && nick.hand) {
      this.handKey = key;
      nick.hand.clear();
      if (key) nick.hand.add(makeItem(key));
    }

    // Highlights.
    this.ringsUsed = 0;
    const pulse = 0.5 + Math.sin(now * 6) * 0.5;
    const stRing = (s: StationId, color: number, r = 22) => this.ring({ x: STATIONS[s].x, z: STATIONS[s].y, r: r + pulse * 3, color });
    if (n.coffee < COFFEE.slowBelow) stRing('coffee', 0xe5484d);
    if (n.hand === 'nora') {
      stRing('highchair', 0xffd166);
      stRing('playpen', 0xffd166, 28);
    }
    const need = new Set(sim.requests.map((r) => r.kind));
    if (need.has('snack') && n.hand !== 'snack') stRing('snacks', 0xffd166);
    if (need.has('juice_box') && n.hand !== 'juice_box') stRing('juice', 0xffd166);
    if (need.has('sippy_cup') && n.hand !== 'sippy_cup') stRing('sippy', 0xffd166);
    if (need.has('booboo') && n.hand !== 'bandaid') stRing('bandaids', 0xffd166);
    if (need.has('thermostat')) stRing('thermostat', 0xe5484d);
    if (need.has('needs_out')) stRing('door', 0xffd166);
    for (const r of sim.requests)
      if (r.kind === 'lost_shoe')
        for (const s of r.spots ?? []) {
          const done = r.checked?.includes(s);
          this.ring({ x: STATIONS[s].x, z: STATIONS[s].y, r: 20 + (done ? 0 : pulse * 3), color: done ? 0x2a9d8f : 0xffd166 });
        }
    const promised = sim.req(sim.promisedId);
    if (promised) {
      const a = sim.anchorOf(promised);
      this.ring({ x: a.x, z: a.y, r: 22 + pulse * 3, color: 0x4ea8de });
    }
    if (h && h !== 'nora' && h !== 'phone')
      for (const k of KID_IDS) {
        const a = sim.actors[k];
        if (a.present && a.state === 'crying') this.ring({ x: a.x, z: a.y, r: 18 + pulse * 2, color: 0x4ea8de, alpha: 0.7 });
      }
    const it = sim.interaction;
    if (it) {
      let p: { x: number; y: number } | null = null;
      if (it.target.t === 'station') p = STATIONS[it.target.station];
      else if (it.target.t === 'kid') p = sim.actors[it.target.kid];
      else {
        const r = sim.req(it.target.req);
        if (r) p = sim.anchorOf(r);
      }
      if (p) this.ring({ x: p.x, z: p.y, r: 26 + pulse * 4, color: 0xff7a59, width: 0.24 });
    }
    if (sim.engaged) this.ring({ x: n.x, z: n.y, r: 16 + Math.sin(now * 10) * 2, color: 0xff7a59 });
    for (let i = this.ringsUsed; i < this.rings.length; i++) this.rings[i].visible = false;

    // Spills.
    const spills = sim.requests.filter((r) => r.kind === 'spill');
    this.spills.forEach((m, i) => {
      const r = spills[i];
      m.visible = !!r;
      if (r) m.position.set(r.x ?? 0, 0.8, r.y ?? 0);
    });
    // Burgers.
    const flip = sim.requests.find((r) => r.kind === 'flip');
    const burn = flip ? 1 - flip.left / flip.patience : 0;
    for (const p of this.patties) {
      p.visible = sim.grill.on;
      (p.material as THREE.MeshLambertMaterial).color.setRGB((140 - burn * 100) / 255, (70 - burn * 50) / 255, 30 / 255);
    }

    // Camera follows Nick.
    const target = new THREE.Vector3(nick.root.position.x, 0, nick.root.position.z);
    const k = 1 - Math.exp(-realDt * 5);
    if (!this.camTarget.lengthSq()) this.camTarget.copy(target);
    else this.camTarget.lerp(target, k);
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET);
    this.camera.lookAt(this.camTarget.clone().add(LOOK_OFFSET));
    this.camera.updateMatrixWorld();

    // Fade any wall between the camera and Nick (or a kid he's next to).
    const head = new THREE.Vector3(nick.root.position.x, 50, nick.root.position.z);
    const dir = head.clone().sub(this.camera.position);
    const len = dir.length();
    this.ray.set(this.camera.position, dir.normalize());
    this.ray.far = len;
    const hits = new Set(this.ray.intersectObjects(this.walls, false).map((h) => h.object as THREE.Mesh));
    for (const w of this.walls) {
      const m = this.wallMats.get(w)!;
      const goal = hits.has(w) ? 0.16 : 1;
      m.opacity += (goal - m.opacity) * Math.min(1, realDt * 10);
      m.depthWrite = m.opacity > 0.9;
      const cap = w.children[0] as THREE.Mesh;
      (cap.material as THREE.MeshLambertMaterial).opacity = m.opacity;
    }
  }

  private pose(id: ActorId | 'nick', x: number, z: number, dt: number, now: number, moving: boolean, crying: boolean) {
    const r = this.rigs.get(id)!;
    const dx = isNaN(r.lastX) ? 0 : x - r.lastX;
    const dz = isNaN(r.lastZ) ? 0 : z - r.lastZ;
    r.lastX = x;
    r.lastZ = z;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    const walking = moving && speed > 4;
    if (Math.hypot(dx, dz) > 0.05) {
      const goal = Math.atan2(dx, dz);
      let d = goal - r.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      r.heading += d * Math.min(1, dt * 12);
    }
    r.root.position.set(x, 0, z);
    r.root.rotation.y = r.heading;
    if (walking) r.phase += dt * (id === 'eloise' ? 16 : 11);
    const swing = walking ? Math.sin(r.phase) * 0.7 : 0;
    r.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? -swing : swing) * (id === 'eloise' && i > 1 ? -1 : 1)));
    r.arms.forEach((a, i) => {
      if (id === 'nick' && i === 1) return; // the coffee arm stays steady
      a.rotation.x = i % 2 ? swing * 0.8 : -swing * 0.8;
    });
    r.body.position.y = walking ? Math.abs(Math.sin(r.phase)) * 1.6 : 0;
    r.body.rotation.z = crying ? Math.sin(now * 22) * 0.08 : 0;
  }

  private ring(o: RingSpec) {
    const m = this.rings[this.ringsUsed++];
    if (!m) return;
    m.visible = true;
    m.position.set(o.x, 1 + this.ringsUsed * 0.05, o.z);
    m.scale.set(o.r, o.r, 1);
    const mm = m.material as THREE.MeshBasicMaterial;
    mm.color.setHex(o.color);
    mm.opacity = o.alpha ?? 0.95;
    void o.width;
  }

  render() {
    if (!this.ready) return;
    const s = this.s;
    const x = WORLD.x * s;
    const y = this.cssH - (WORLD.y + WORLD.h) * s; // GL viewports count from the bottom
    this.renderer.setViewport(x, y, WORLD.w * s, WORLD.h * s);
    this.renderer.setScissor(x, y, WORLD.w * s, WORLD.h * s);
    this.renderer.render(this.scene, this.camera);
  }
}

// ------------------------------------------------------------ textures
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
function checker(a: string, b: string) {
  return canvasTex(2, 2, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 2, 2);
    g.fillStyle = b;
    g.fillRect(0, 0, 1, 1);
    g.fillRect(1, 1, 1, 1);
  });
}
function stripes(a: string, b: string, _w: number) {
  return canvasTex(2, 1, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 1, 1);
    g.fillStyle = b;
    g.fillRect(1, 0, 1, 1);
  });
}
function planks() {
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = '#c68b59';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#a86f42';
    g.lineWidth = 2;
    for (let y = 0; y <= 64; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(64, y);
      g.stroke();
      const off = (y * 3) % 40;
      g.beginPath();
      g.moveTo(off + 8, y);
      g.lineTo(off + 8, y + 16);
      g.stroke();
    }
  });
  t.magFilter = THREE.LinearFilter;
  return t;
}
