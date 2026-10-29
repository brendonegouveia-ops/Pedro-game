import Phaser from 'phaser';
import { ABILITIES, COFFEE, KAYLA_OUT_OF_CHARGES } from '../config';
import { COUCH_POS, DOORS, ROOM_RECTS, STATIONS, STATION_IDS, WORLD as W_SIM, type RoomId, type StationId } from '../sim/house';
import { REQUEST_LABEL, Sim, clockString, type ActorId, type Request, type SimEvent } from '../sim/sim';
import type { World3D } from '../three/World3D';
import { drawIcon, drawMomFace } from './art';
import { BAR, COLORS, DPAD, FONT, H, HUD, PANEL, W, WORLD, inWorld } from './layout';
import { ActionPanel } from './panel';

export interface SceneHooks {
  sfx: (name: string) => void;
  haptic: (p: number | number[]) => void;
  gameOver: (sim: Sim) => void;
  won: (sim: Sim) => void;
  pause: () => void;
}

type Pt = { x: number; y: number };


interface BubbleView {
  c: Phaser.GameObjects.Container;
  pos: Pt; // screen
}

const PLATE_ICON: Partial<Record<StationId, string>> = {
  coffee: 'coffee',
  snacks: 'snack',
  juice: 'juice_box',
  sippy: 'sippy_cup',
  bandaids: 'bandaid',
  thermostat: 'thermostat',
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  KeyA: [-1, 0],
  KeyS: [0, 1],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
};

export class GameScene extends Phaser.Scene {
  sim!: Sim;
  hooks!: SceneHooks;
  readonly R: number;
  running = false;
  timeScale = 1; // tests only

  private dyn!: Phaser.GameObjects.Graphics; // highlights, rings, finger marker
  private top!: Phaser.GameObjects.Graphics; // HUD + bar
  private fxTop!: Phaser.GameObjects.Graphics; // freeze tint, alarm flash
  world?: World3D; // the 3D house + camera (set by main.ts)
  private speech = new Map<ActorId, Phaser.GameObjects.Text>();
  private chips = new Map<StationId, Phaser.GameObjects.Container>();
  private bubbles = new Map<number, BubbleView>();
  private panel!: ActionPanel;
  private clockText!: Phaser.GameObjects.Text;
  private chaosText!: Phaser.GameObjects.Text;
  private barTexts: Phaser.GameObjects.Text[] = [];
  private barSub: Phaser.GameObjects.Text[] = [];
  private toastText!: Phaser.GameObjects.Text;
  private toastT = 0;
  private textBanner!: Phaser.GameObjects.Container;
  private textFrom!: Phaser.GameObjects.Text;
  private textBody!: Phaser.GameObjects.Text;
  private textQueue: { from: string; body: string }[] = [];
  private textT = 0;
  private jokeCard!: Phaser.GameObjects.Container;
  private jokeText!: Phaser.GameObjects.Text;
  private momWin!: Phaser.GameObjects.Container;
  private momTime!: Phaser.GameObjects.Text;
  private uhHuh!: Phaser.GameObjects.Container;
  private shhText!: Phaser.GameObjects.Text;
  private zzz!: Phaser.GameObjects.Text;
  private selectBanner!: Phaser.GameObjects.Text;
  private alarmT = 0;
  private alarmText!: Phaser.GameObjects.Text;
  private weekText!: Phaser.GameObjects.Text;
  private handIcon!: Phaser.GameObjects.Graphics;
  private handLabel!: Phaser.GameObjects.Text;
  private handKey = '';
  private now = 0;
  private lastNow = 0;
  private roles = new Map<number, 'dpad' | 'panel'>();
  private dpadDir: Pt | null = null;
  private dpadG!: Phaser.GameObjects.Graphics;
  private keysDown = new Set<string>();

  constructor() {
    super('game');
    this.R = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  }

  txt = (
    x: number,
    y: number,
    s: string,
    size: number,
    color = '#22223b',
    style: Phaser.Types.GameObjects.Text.TextStyle = {},
  ): Phaser.GameObjects.Text =>
    this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, resolution: this.R, ...style });

  create() {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(this.R);
    // Transparent: the 3D view (a canvas underneath) shows through the world rectangle.

    this.dyn = this.add.graphics().setDepth(28);
    this.buildChips();
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as const)
      this.speech.set(
        id,
        this.txt(0, 0, '', 11, '#22223b', { backgroundColor: '#ffffff', padding: { x: 5, y: 2 }, fontStyle: 'bold' })
          .setOrigin(0.5, 1)
          .setDepth(36)
          .setVisible(false),
      );

    this.shhText = this.txt(0, 0, 'Shhh', 10, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(31).setVisible(false);
    this.zzz = this.txt(0, 0, 'z Z z', 12, '#3d405b', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(31).setVisible(false);

    this.top = this.add.graphics().setDepth(60);
    this.buildHud();
    this.buildBar();
    this.panel = new ActionPanel(this, () => this.sim, this.txt);
    this.panel.onCancelSelect = () => (this.panel.selectMode = false);
    this.events.on('panel-sfx', (n: string) => this.hooks?.sfx(n));

    this.fxTop = this.add.graphics().setDepth(65);
    this.dpadG = this.add.graphics().setDepth(55);
    this.buildOverlays();

    // Two thumbs: one on the D-pad, one on the action pad. Each pointer keeps the role it started with.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      this.onDown(p.id, w.x, w.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const w = cam.getWorldPoint(p.x, p.y);
      const role = this.roles.get(p.id);
      if (role === 'dpad') this.dpadTo(w.x, w.y);
      else if (role === 'panel') this.panel.pointerMove(w.x, w.y);
    });
    const up = (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      this.onUp(p.id, w.x, w.y);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('gameout', () => this.releaseInput());

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e, true));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.onKey(e, false));

    this.sim = new Sim(1);
    this.game.events.emit('scene-ready');
  }

  // ------------------------------------------------------------ run control
  startRun(seed: number, week = 1) {
    this.sim = new Sim(seed, week);
    this.running = true;
    this.panel.selectMode = false;
    this.roles.clear();
    this.dpadDir = null;
    this.keysDown.clear();
    this.weekText.setText(`WEEK ${week} · GAME NIGHT 5:00`);
    this.textQueue = [];
    this.textT = 0;
    this.toastT = 0;
    this.alarmT = 0;
    this.textBanner.setVisible(false);
    this.toastText.setVisible(false);
    this.jokeCard.setVisible(false);
    for (const b of this.bubbles.values()) b.c.destroy();
    this.bubbles.clear();
    this.world?.sync(this.sim, 0, 0);
  }

  // Called when the game pauses: let go of everything held.
  releaseInput() {
    this.roles.clear();
    this.dpadDir = null;
    this.keysDown.clear();
    this.sim?.setMoveTarget(null);
    this.sim?.setMoveDir(null);
    this.panel?.pointerUp(-1, -1);
  }

  update(_t: number, _deltaMs: number) {
    if (!this.sim) return;
    // Wall-clock dt: 1 real second must be 1 game minute even when frames are slow
    // (Phaser's own delta is smoothed and clamped). Long gaps are capped; the game pauses on hide.
    const nowMs = performance.now();
    const dt = this.lastNow ? Math.min((nowMs - this.lastNow) / 1000, 0.25) : 0;
    this.lastNow = nowMs;
    const sdt = dt * this.timeScale;
    this.now += dt;
    if (this.running) {
      this.sim.update(sdt);
      this.handleEvents(this.sim.drainEvents());
    }
    if (this.world) {
      this.world.sync(this.sim, this.running ? sdt : 0, this.now, dt);
      this.world.render();
    }
    this.render(dt);
    this.panel.update(this.running ? sdt : 0);
  }

  // ------------------------------------------------------------ input
  private onDown(id: number, x: number, y: number) {
    if (!this.running) return;
    const sim = this.sim;
    if (y >= BAR.y) return this.onBar(x);
    if (sim.facetime.prompt && Math.abs(x - this.uhHuh.x) <= 110 && Math.abs(y - this.uhHuh.y) <= 32) {
      sim.answerUhHuh();
      return;
    }
    if (Math.hypot(x - DPAD.cx, y - DPAD.cy) <= DPAD.r + 10) {
      this.roles.set(id, 'dpad');
      this.dpadTo(x, y);
      return;
    }
    if (this.panel.contains(x, y)) {
      this.roles.set(id, 'panel');
      return this.panel.pointerDown(x, y);
    }
    if (inWorld(x, y) && this.panel.selectMode) {
      const b = this.nearestBubble(x, y, 32);
      if (b != null) {
        sim.callKayla(b);
        this.panel.selectMode = false;
      }
    }
  }

  // D-pad: 4 arrows; a thumb between two arrows walks diagonally. Small dead zone in the middle.
  private dpadTo(x: number, y: number) {
    const dx = x - DPAD.cx;
    const dy = y - DPAD.cy;
    let dir: Pt | null = null;
    if (Math.hypot(dx, dy) >= 10) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax > ay * 2.2) dir = { x: Math.sign(dx), y: 0 };
      else if (ay > ax * 2.2) dir = { x: 0, y: Math.sign(dy) };
      else dir = { x: Math.sign(dx), y: Math.sign(dy) };
    }
    const changed = (dir?.x ?? 0) !== (this.dpadDir?.x ?? 0) || (dir?.y ?? 0) !== (this.dpadDir?.y ?? 0);
    this.dpadDir = dir;
    if (changed) {
      this.applyMove();
      if (dir) this.hooks?.haptic(6);
    }
  }

  private applyMove() {
    if (this.dpadDir) return this.sim.setMoveDir(this.dpadDir);
    let dx = 0;
    let dy = 0;
    for (const k of this.keysDown) {
      dx += MOVE_KEYS[k][0];
      dy += MOVE_KEYS[k][1];
    }
    this.sim.setMoveDir(dx || dy ? { x: dx, y: dy } : null);
  }

  private onUp(id: number, x: number, y: number) {
    const role = this.roles.get(id);
    this.roles.delete(id);
    if (role === 'dpad') {
      this.dpadDir = null;
      this.applyMove();
    } else if (role === 'panel') this.panel.pointerUp(x, y);
  }

  private onBar(x: number) {
    const i = this.barIndex(x);
    if (i === 3) return this.hooks.pause();
    this.useAbility(i);
  }

  useAbility(i: number) {
    const sim = this.sim;
    if (!this.running) return;
    if (i === 0) sim.dadJoke();
    else if (i === 1) {
      if (sim.kaylaCharges <= 0) return this.toast(KAYLA_OUT_OF_CHARGES);
      if (!sim.requests.length) return this.toast('Nothing to hand off. Yet.');
      this.panel.selectMode = !this.panel.selectMode;
      this.hooks.sfx('tap');
    } else if (i === 2) sim.becauseISaidSo();
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (!this.running) return;
    const it = this.sim.interaction;
    // Arrows belong to the panel while a swipe or rub is up; WASD always walks.
    const panelArrows = !!it && (it.kind === 'swipe' || it.kind === 'rub') && e.code.startsWith('Arrow');
    if (MOVE_KEYS[e.code] && !panelArrows) {
      if (down) this.keysDown.add(e.code);
      else this.keysDown.delete(e.code);
      this.applyMove();
      e.preventDefault();
      return;
    }
    if (!down) return this.panel.keyUp(e.code);
    if (e.code === 'Digit1' || e.code === 'Numpad1') return this.useAbility(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') return this.useAbility(1);
    if (e.code === 'Digit3' || e.code === 'Numpad3') return this.useAbility(2);
    if (e.code === 'KeyU' && this.sim.answerUhHuh()) return;
    if (this.panel.keyDown(e.code, e.repeat)) e.preventDefault();
  }

  private nearestBubble(x: number, y: number, r: number): number | null {
    let best: number | null = null;
    let bd = r;
    for (const [id, b] of this.bubbles) {
      const d = Math.hypot(b.pos.x - x, b.pos.y - y);
      if (d <= bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ events
  private handleEvents(evs: SimEvent[]) {
    for (const e of evs) {
      switch (e.type) {
        case 'toast':
          this.toast(e.text);
          break;
        case 'text':
          this.textQueue.push({ from: e.from, body: e.body });
          break;
        case 'sfx':
          this.hooks.sfx(e.name);
          break;
        case 'haptic':
          this.hooks.haptic(e.pattern);
          break;
        case 'shake':
          // Phaser scales shake by camera zoom; divide it back out.
          this.cameras.main.shake(450, (e.strength * 0.6) / this.R);
          if (e.strength > 0.008) this.alarmT = 2.2;
          break;
        case 'joke':
          this.jokeText.setText(e.text);
          this.jokeCard.setVisible(true).setAlpha(0).setScale(0.9);
          this.tweens.add({ targets: this.jokeCard, alpha: 1, scale: 1, duration: 160, ease: 'Back.easeOut' });
          break;
        case 'expired':
          this.popBubble(e.req.id, false);
          break;
        case 'resolved':
          this.popBubble(e.req.id, true);
          break;
        case 'won':
          this.running = false;
          this.releaseInput();
          this.panel.selectMode = false;
          window.setTimeout(() => this.hooks.won(this.sim), 700);
          break;
        case 'gameover':
          this.running = false;
          this.releaseInput();
          this.panel.selectMode = false;
          // Real-time delay (the scene clock crawls if frames are slow).
          window.setTimeout(() => this.hooks.gameOver(this.sim), 900);
          break;
      }
    }
  }

  toast(text: string) {
    this.toastText.setText(text).setVisible(true).setAlpha(1);
    this.toastT = 2.4;
  }

  private popBubble(id: number, good: boolean) {
    const b = this.bubbles.get(id);
    if (!b) return;
    this.bubbles.delete(id);
    this.tweens.add({
      targets: b.c,
      scale: good ? 1.4 : 0.6,
      alpha: 0,
      y: b.c.y - (good ? 14 : -6),
      duration: 260,
      onComplete: () => b.c.destroy(),
    });
  }

  // ------------------------------------------------------------ build
  // Floating icon chips over stations, room name tags, and "?" marks for shoe spots,
  // all placed each frame by projecting from the 3D camera.
  private buildChips() {
    for (const s of STATION_IDS) {
      const icon = PLATE_ICON[s] ?? (s === 'grill' ? 'burger' : s === 'door' ? 'paw' : s.startsWith('spot_') ? 'shoe' : s === 'highchair' || s === 'playpen' ? 'nora' : '');
      if (!icon) continue;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.18).fillCircle(1, 2, 12);
      g.fillStyle(0xffffff, 0.95).fillCircle(0, 0, 12);
      const ic = this.add.graphics();
      drawIcon(ic, icon, 15);
      const q = this.txt(0, -1, '?', 13, '#22223b', { fontStyle: 'bold' }).setOrigin(0.5).setVisible(false).setName('q');
      this.chips.set(s, this.add.container(0, 0, [g, ic, q]).setDepth(20));
    }
  }

  private buildHud() {
    this.clockText = this.txt(12, 6, '9:00 AM', 28, '#ffffff', { fontStyle: 'bold' }).setDepth(61);
    this.weekText = this.txt(14, 42, 'WEEK 1 · GAME NIGHT 5:00', 9, '#ffd166', { fontStyle: 'bold' }).setDepth(61);
    this.txt(176, 4, 'CHAOS', 9, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
    this.chaosText = this.txt(378, 4, '0', 9, '#ffffff', { fontStyle: 'bold' }).setOrigin(1, 0).setDepth(61);
    this.txt(176, 38, 'COFFEE', 9, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
    this.handIcon = this.add.graphics().setDepth(61).setPosition(318, 56);
    this.handLabel = this.txt(332, 56, '', 10, '#ffffff').setOrigin(0, 0.5).setDepth(61);
  }

  private buildBar() {
    const labels = ['Dad Joke', 'Call Kayla', 'Because I\nSaid So', ''];
    for (let i = 0; i < 4; i++) {
      const r = this.barRect(i);
      this.barTexts.push(
        this.txt(r.x + r.w / 2, r.y + r.h / 2 - 6, labels[i], 13, '#ffffff', { fontStyle: 'bold', align: 'center' })
          .setOrigin(0.5)
          .setDepth(62),
      );
      if (i < 3) this.barSub.push(this.txt(r.x + r.w / 2, r.y + r.h - 12, '', 10, '#c9c9d6').setOrigin(0.5).setDepth(62));
    }
  }

  private barRect(i: number) {
    const ws = [100, 100, 100, 50];
    let x = 8;
    for (let k = 0; k < i; k++) x += ws[k] + 8;
    return { x, y: BAR.y + 6, w: ws[i], h: 60 };
  }

  private barIndex(x: number) {
    for (let i = 3; i >= 0; i--) if (x >= this.barRect(i).x - 4) return i;
    return 0;
  }

  private buildOverlays() {
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(10, 4, W - 20, 54, 14);
    bg.fillStyle(0xf8f9fa, 0.97).fillRoundedRect(10, 0, W - 20, 54, 14);
    const ic = this.add.graphics({ x: 34, y: 27 });
    ic.fillStyle(0x34c759, 1).fillRoundedRect(-14, -14, 28, 28, 7);
    ic.fillStyle(0xffffff, 1).fillEllipse(0, -1, 18, 13).fillTriangle(-6, 3, -9, 9, -1, 4);
    this.textFrom = this.txt(56, 7, '', 12, '#6c757d', { fontStyle: 'bold' });
    this.textBody = this.txt(56, 24, '', 14, '#22223b', { wordWrap: { width: W - 90 } });
    this.textBanner = this.add.container(0, WORLD.y + 6, [bg, ic, this.textFrom, this.textBody]).setDepth(70).setVisible(false);

    this.toastText = this.txt(W / 2, PANEL.y - 12, '', 14, '#ffffff', {
      backgroundColor: '#22223bee',
      padding: { x: 12, y: 7 },
      align: 'center',
      wordWrap: { width: W - 60 },
    })
      .setOrigin(0.5, 1)
      .setDepth(72)
      .setVisible(false);

    const jb = this.add.graphics();
    jb.fillStyle(0x000000, 0.3).fillRoundedRect(-162, -78, 324, 160, 18);
    jb.fillStyle(0xfffaf0, 1).fillRoundedRect(-165, -82, 330, 160, 18);
    jb.lineStyle(3, 0xffd166, 1).strokeRoundedRect(-165, -82, 330, 160, 18);
    const ji = this.add.graphics({ x: -138, y: -56 });
    drawIcon(ji, 'joke', 32);
    const jt = this.txt(-116, -70, 'DAD JOKE', 12, '#e76f51', { fontStyle: 'bold' });
    this.jokeText = this.txt(0, 2, '', 17, '#22223b', { align: 'center', wordWrap: { width: 296 } }).setOrigin(0.5);
    const groan = this.txt(0, 60, '*group groan*  ·  timers frozen', 11, '#8d8fa8').setOrigin(0.5);
    this.jokeCard = this.add.container(W / 2, WORLD.y + 250, [jb, ji, jt, this.jokeText, groan]).setDepth(71).setVisible(false);

    // FaceTime: a compact strip just above the panel, so it never covers the house's bubbles.
    const mg = this.add.graphics();
    mg.fillStyle(0x000000, 0.3).fillRoundedRect(-30, -24, 64, 56, 14);
    mg.fillStyle(0x22223b, 1).fillRoundedRect(-32, -28, 64, 56, 14);
    const face = this.add.graphics({ x: 0, y: -2 });
    drawMomFace(face, 17);
    const ml = this.txt(0, 19, 'MIL', 9, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.momTime = this.txt(0, -19, '', 9, '#34c759', { fontStyle: 'bold' }).setOrigin(0.5);
    this.momWin = this.add.container(44, PANEL.y - 36, [mg, face, ml, this.momTime]).setDepth(69).setVisible(false);

    const ub = this.add.graphics();
    ub.fillStyle(0x000000, 0.3).fillRoundedRect(-104, -24, 208, 56, 28);
    ub.fillStyle(0x34c759, 1).fillRoundedRect(-106, -28, 212, 56, 28);
    const ut = this.txt(0, 0, '“uh-huh”', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.uhHuh = this.add.container(W / 2 + 34, PANEL.y - 36, [ub, ut]).setDepth(75).setVisible(false);

    this.selectBanner = this.txt(W / 2, WORLD.y + 8, 'Kayla’s on it: tap a request', 14, '#ffffff', {
      backgroundColor: '#e76f51',
      padding: { x: 12, y: 6 },
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0)
      .setDepth(74)
      .setVisible(false);

    this.alarmText = this.txt(W / 2, WORLD.y + WORLD.h / 2, 'BEEP! BEEP! BEEP!', 30, '#ffffff', {
      fontStyle: 'bold',
      stroke: '#e5484d',
      strokeThickness: 6,
    })
      .setOrigin(0.5)
      .setDepth(73)
      .setVisible(false);
  }

  // ------------------------------------------------------------ positions
  // Screen point (design px) over a world point at height h.
  private proj(x: number, y: number, h: number): Pt & { behind?: boolean } {
    if (this.world) return this.world.project(x, y, h);
    return { x: WORLD.x + x, y: WORLD.y + y - h * 0.5 };
  }

  private headOf(id: ActorId): Pt {
    const a = this.sim.actors[id];
    const h = this.world?.heightOf(id) ?? 40;
    if (a.state === 'carried') return this.proj(this.sim.nick.x, this.sim.nick.y, 80);
    if (a.state === 'asleep') return this.proj(COUCH_POS.x, COUCH_POS.y, 36);
    return this.proj(a.x, a.y, h);
  }

  // Where a request's bubble floats (screen space, may be off the 3D view).
  private bubblePoint(r: Request): Pt {
    if (r.kind === 'flip') return this.proj(STATIONS.grill.x, STATIONS.grill.y, 78);
    if (r.kind === 'thermostat') return this.proj(STATIONS.thermostat.x, STATIONS.thermostat.y, 92);
    if (r.kind === 'needs_out') {
      const p = this.headOf('eloise');
      return { x: p.x, y: p.y - 26 };
    }
    if (r.kind === 'spill') return this.proj(r.x ?? 0, r.y ?? 0, 34);
    const kids = (r.kids ?? [r.owner]) as ActorId[];
    const ps = kids.map((k) => this.headOf(k));
    return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: Math.min(...ps.map((p) => p.y)) - 26 };
  }

  // ------------------------------------------------------------ render
  private render(dt: number) {
    const sim = this.sim;
    const g = this.dyn;
    g.clear();
    // The canvas is transparent; paint the non-3D bands (the deck between the house and the bar).
    g.fillStyle(COLORS.bg, 1).fillRect(0, WORLD.y + WORLD.h, W, BAR.y - WORLD.y - WORLD.h);
    g.fillRect(0, HUD.h, W, WORLD.y - HUD.h);

    this.renderDpad();
    if (sim.goalMin !== 480) this.weekText.setText(`WEEK ${sim.week} · GAME NIGHT ${clockString(sim.goalMin).replace(' PM', '')}`);

    this.renderChips(g);
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as ActorId[]) {
      const a = sim.actors[id];
      const t = this.speech.get(id)!;
      t.setVisible(false);
      if (!a.present || a.state === 'asleep') continue;
      const text = a.state === 'crying' ? (id === 'nora' ? 'WAAAH' : 'WAAAAH!') : a.speech;
      if (!text) continue;
      const p = this.headOf(id);
      if (!this.onView(p)) continue;
      t.setText(text).setVisible(true).setPosition(p.x, p.y - (a.req != null ? 52 : 6));
    }

    this.renderBubbles(g, dt);
    this.renderMinimap(g);
    this.renderNap();
    this.renderHud();
    this.renderOverlays(dt);
  }

  private renderDpad() {
    const g = this.dpadG;
    g.clear();
    const { cx, cy, r } = DPAD;
    g.fillStyle(0x2b2d42, 0.95).fillCircle(cx, cy, r);
    g.lineStyle(2, 0x4a4e69, 1).strokeCircle(cx, cy, r);
    const d = this.dpadDir;
    const arms: [number, number][] = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    for (const [ax, ay] of arms) {
      const on = !!d && (d.x === ax && ax !== 0 ? true : d.y === ay && ay !== 0);
      const bx = cx + ax * 44;
      const by = cy + ay * 44;
      g.fillStyle(on ? COLORS.accent : 0x4a4e69, 1).fillRoundedRect(bx - 23, by - 23, 46, 46, 12);
      g.fillStyle(0xffffff, on ? 1 : 0.85);
      const s = 11;
      const px = -ay;
      const py = ax;
      g.fillTriangle(bx + ax * s, by + ay * s, bx - ax * s * 0.6 + px * s, by - ay * s * 0.6 + py * s, bx - ax * s * 0.6 - px * s, by - ay * s * 0.6 - py * s);
    }
    g.fillStyle(0x3d405b, 1).fillCircle(cx, cy, 14);
  }

  private onView(p: Pt & { behind?: boolean }, pad = 0) {
    return !p.behind && p.x >= WORLD.x + pad && p.x <= WORLD.x + WORLD.w - pad && p.y >= WORLD.y + pad && p.y <= WORLD.y + WORLD.h - pad;
  }

  private renderChips(g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    const shoe = new Map<StationId, boolean>();
    for (const r of sim.requests) if (r.kind === 'lost_shoe') for (const s of r.spots ?? []) shoe.set(s, !!r.checked?.includes(s));
    for (const [s, c] of this.chips) {
      const st = STATIONS[s];
      const h = s === 'grill' ? 58 : s === 'thermostat' ? 70 : s === 'door' ? 90 : s.startsWith('spot_') ? 34 : 58;
      const p = this.proj(st.x, st.y, h);
      const spot = s.startsWith('spot_');
      // Shoe spots only show while a lost shoe sends you there.
      const show = this.onView(p, 6) && (!spot || shoe.has(s));
      c.setVisible(show).setPosition(p.x, p.y);
      const q = c.getByName('q') as Phaser.GameObjects.Text;
      if (spot && show) {
        q.setText(shoe.get(s) ? '✓' : '?').setVisible(true);
        (c.list[1] as Phaser.GameObjects.Graphics).setVisible(false);
      }
    }
    // Grill smoke.
    if (sim.grill.on) {
      const p = this.proj(STATIONS.grill.x, STATIONS.grill.y, 46);
      const flip = sim.requests.find((r) => r.kind === 'flip');
      const burn = flip ? 1 - flip.left / flip.patience : 0;
      const puff = (this.now * 0.8) % 1;
      if (this.onView(p)) {
        g.fillStyle(flip ? 0x555555 : 0xdddddd, (1 - puff) * (0.35 + burn * 0.5));
        g.fillCircle(p.x + puff * 8, p.y - puff * 30, 4 + puff * 9);
      }
    }
  }

  // A small floor plan in the corner: rooms, Nick, the kids, and where requests are.
  private renderMinimap(g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    const sc = 0.2;
    const ox = WORLD.x + WORLD.w - W_SIM.w * sc - 8;
    const oy = WORLD.y + 8;
    const M = (x: number, y: number) => ({ x: ox + x * sc, y: oy + y * sc });
    g.fillStyle(0x1d1f2b, 0.75).fillRoundedRect(ox - 3, oy - 3, W_SIM.w * sc + 6, W_SIM.h * sc + 6, 6);
    const col: Record<RoomId, number> = { backyard: 0x76bd79, kitchen: 0xe8e6dc, living: 0xc68b59, garage: 0xa3abb5 };
    for (const r of Object.keys(ROOM_RECTS) as RoomId[]) {
      const R = ROOM_RECTS[r];
      const a = M(R.x, R.y);
      g.fillStyle(col[r], 0.95).fillRect(a.x, a.y, R.w * sc, R.h * sc);
    }
    g.fillStyle(0xf3e3c3, 1);
    for (const d of DOORS) {
      const a = M(d.x, d.y);
      if (d.axis === 'h') g.fillRect(a.x - (d.span * sc) / 2, a.y - 1.5, d.span * sc, 3);
      else g.fillRect(a.x - 1.5, a.y - (d.span * sc) / 2, 3, d.span * sc);
    }
    const pulse = Math.sin(this.now * 10) > 0;
    for (const r of sim.requests) {
      const a = sim.anchorOf(r);
      const p = M(a.x, a.y);
      const frac = isFinite(r.left) ? r.left / r.patience : 0;
      const c = frac > 0.5 ? COLORS.chaosLo : frac > 0.25 ? COLORS.chaosMid : COLORS.chaosHi;
      if (frac > 0.25 || pulse) g.fillStyle(c, 1).fillCircle(p.x, p.y, 3.5);
    }
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as ActorId[]) {
      const a = sim.actors[id];
      if (!a.present || a.state === 'carried') continue;
      const p = M(a.x, a.y);
      g.fillStyle(id === 'eloise' ? 0x9c8f7a : 0xffffff, 1).fillCircle(p.x, p.y, 1.8);
    }
    const n = M(sim.nick.x, sim.nick.y);
    g.fillStyle(COLORS.accent, 1).fillCircle(n.x, n.y, 3);
    g.lineStyle(1, 0xffffff, 1).strokeCircle(n.x, n.y, 3);
  }

  private renderBubbles(g: Phaser.GameObjects.Graphics, dt: number) {
    const sim = this.sim;
    const live = new Set<number>();
    for (const r of sim.requests) {
      live.add(r.id);
      let b = this.bubbles.get(r.id);
      const target = this.bubblePoint(r);
      if (!b) {
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.2).fillCircle(1, 2, 17);
        bg.fillStyle(0xffffff, 1).fillCircle(0, 0, 17);
        bg.fillTriangle(-5, 13, 5, 13, 0, 21);
        const ic = this.add.graphics();
        drawIcon(ic, r.kind, 20);
        const label = this.txt(0, 27, REQUEST_LABEL[r.kind].toUpperCase(), 8, '#ffffff', {
          fontStyle: 'bold',
          backgroundColor: '#22223bdd',
          padding: { x: 3, y: 1 },
        }).setOrigin(0.5, 0);
        b = { c: this.add.container(target.x, target.y, [bg, ic, label]).setDepth(30), pos: { ...target } };
        b.c.setScale(0.3);
        this.tweens.add({ targets: b.c, scale: 1, duration: 220, ease: 'Back.easeOut' });
        this.bubbles.set(r.id, b);
      }
      // Off the 3D view: pin to the edge, with an arrow toward it.
      const pad = 24;
      const off = !this.onView(target as Pt & { behind?: boolean }, pad);
      const edge = {
        x: Phaser.Math.Clamp(target.x, WORLD.x + pad, WORLD.x + WORLD.w - pad),
        y: Phaser.Math.Clamp(target.y, WORLD.y + pad, WORLD.y + WORLD.h - pad - 22), // room for the label above the deck
      };
      b.pos = approach(b.pos, edge, 900, dt);
      b.c.setPosition(b.pos.x, b.pos.y);
      if (off) {
        const ang = Math.atan2(target.y - edge.y, target.x - edge.x);
        const ax = b.pos.x + Math.cos(ang) * 27;
        const ay = b.pos.y + Math.sin(ang) * 27;
        g.fillStyle(0xffffff, 1).fillTriangle(
          ax + Math.cos(ang) * 7,
          ay + Math.sin(ang) * 7,
          ax + Math.cos(ang + 2.3) * 7,
          ay + Math.sin(ang + 2.3) * 7,
          ax + Math.cos(ang - 2.3) * 7,
          ay + Math.sin(ang - 2.3) * 7,
        );
      }
      const frac = isFinite(r.left) ? Math.max(0, r.left / r.patience) : 1;
      const color = !isFinite(r.left) ? COLORS.bad : sim.frozen ? 0x8ecae6 : r.id === sim.promisedId ? 0x4ea8de : frac > 0.5 ? COLORS.chaosLo : frac > 0.25 ? COLORS.chaosMid : COLORS.chaosHi;
      g.lineStyle(5, 0x22223b, 0.55).strokeCircle(b.pos.x, b.pos.y, 20);
      g.lineStyle(4, color, 1);
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.strokePath();
      if (!this.tweens.isTweening(b.c)) b.c.setScale(!isFinite(r.left) || frac < 0.3 ? 1 + Math.sin(this.now * 14) * 0.06 : 1);
      if (this.panel.selectMode) g.lineStyle(3, 0xe76f51, 0.6 + 0.4 * Math.sin(this.now * 8)).strokeCircle(b.pos.x, b.pos.y, 26);
    }
    for (const [id, b] of this.bubbles) if (!live.has(id) && !this.tweens.isTweening(b.c)) this.popBubble(id, true);
  }

  private renderNap() {
    const sim = this.sim;
    const asleep = sim.nap.state === 'asleep';
    this.shhText.setVisible(asleep);
    this.zzz.setVisible(asleep);
    if (!asleep) return;
    const c = this.proj(COUCH_POS.x, COUCH_POS.y, 46);
    const g = this.dyn;
    const x = c.x - 40;
    const y = c.y - 34;
    const n = sim.nap.noise / 100;
    g.fillStyle(0x22223b, 0.85).fillRoundedRect(x, y, 80, 16, 8);
    g.fillStyle(n > 0.66 ? COLORS.chaosHi : n > 0.33 ? COLORS.chaosMid : COLORS.chaosLo, 1).fillRoundedRect(x + 2, y + 2, Math.max(4, 76 * n), 12, 6);
    this.shhText.setPosition(c.x, y + 8);
    this.zzz.setPosition(c.x + 26 + Math.sin(this.now * 2) * 3, c.y - 26 - ((this.now * 8) % 10));
  }

  private renderHud() {
    const sim = this.sim;
    const g = this.top;
    g.clear();
    g.fillStyle(COLORS.hud, 1).fillRect(0, HUD.y, W, HUD.h);
    this.clockText.setText(sim.clock);
    const cx = 176;
    const cw = 202;
    const ch = sim.chaos / 100;
    g.fillStyle(0x1d1f2b, 1).fillRoundedRect(cx, 16, cw, 18, 9);
    const col = ch < 0.5 ? COLORS.chaosLo : ch < 0.8 ? COLORS.chaosMid : COLORS.chaosHi;
    g.fillStyle(col, 1).fillRoundedRect(cx + 2, 18, Math.max(8, (cw - 4) * ch), 14, 7);
    if (ch >= 0.8) g.lineStyle(2, COLORS.chaosHi, 0.5 + 0.5 * Math.sin(this.now * 10)).strokeRoundedRect(cx, 16, cw, 18, 9);
    this.chaosText.setText(`${Math.floor(sim.chaos)}`);
    const cf = sim.nick.coffee;
    const fw = 124;
    g.fillStyle(0x1d1f2b, 1).fillRoundedRect(cx, 50, fw, 12, 6);
    g.fillStyle(cf < COFFEE.slowBelow ? COLORS.bad : COLORS.coffee, 1).fillRoundedRect(cx + 2, 52, Math.max(6, (fw - 4) * cf), 8, 4);
    g.lineStyle(1, 0xffffff, 0.3).lineBetween(cx + fw * COFFEE.slowBelow, 50, cx + fw * COFFEE.slowBelow, 62);
    g.fillStyle(0x3d405b, 1).fillRoundedRect(306, 44, 74, 24, 8);
    const h = sim.nick.hand;
    if (this.handKey !== `${h}`) {
      this.handKey = `${h}`;
      this.handIcon.clear();
      if (h) drawIcon(this.handIcon, h === 'nora' ? 'nora' : h === 'phone' ? 'phone' : h, 15);
      this.handLabel.setText(h ? (h === 'nora' ? 'Nora' : h === 'phone' ? 'Phone' : h === 'juice_box' ? 'Juice' : h === 'sippy_cup' ? 'Sippy' : h === 'bandaid' ? 'Band-aid' : 'Snack') : 'Empty');
    }

    g.fillStyle(COLORS.hud, 1).fillRect(0, BAR.y, W, H - BAR.y);
    const cds = [sim.jokeCd / ABILITIES.dadJoke.cooldownSec, sim.kaylaCharges > 0 ? 0 : 1, sim.bissCd / ABILITIES.becauseISaidSo.cooldownSec, 0];
    for (let i = 0; i < 4; i++) {
      const r = this.barRect(i);
      const lit = i === 1 && this.panel.selectMode;
      g.fillStyle(lit ? 0xe76f51 : COLORS.ability, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
      if (cds[i] > 0) g.fillStyle(0x000000, 0.45).fillRoundedRect(r.x, r.y, r.w * cds[i], r.h, 14);
      this.barTexts[i].setAlpha(cds[i] > 0 ? 0.5 : 1);
    }
    const pr = this.barRect(3);
    g.fillStyle(0xffffff, 1).fillRoundedRect(pr.x + pr.w / 2 - 9, pr.y + 20, 6, 20, 2).fillRoundedRect(pr.x + pr.w / 2 + 3, pr.y + 20, 6, 20, 2);
    this.barSub[0].setText(sim.jokeCd > 0 ? `${Math.ceil(sim.jokeCd)}s` : 'key 1');
    this.barSub[1].setText(`${'●'.repeat(sim.kaylaCharges)}${'○'.repeat(ABILITIES.callKayla.charges - sim.kaylaCharges)}  key 2`);
    this.barSub[2].setText(sim.bissCd > 0 ? `${Math.ceil(sim.bissCd)}s` : 'key 3');
  }

  private renderOverlays(dt: number) {
    const sim = this.sim;
    const g = this.fxTop;
    g.clear();
    if (sim.frozen) g.fillStyle(0x8ecae6, 0.16).fillRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h);
    else if (this.jokeCard.visible && this.jokeCard.alpha === 1 && !this.tweens.isTweening(this.jokeCard)) {
      this.tweens.add({ targets: this.jokeCard, alpha: 0, duration: 200, onComplete: () => this.jokeCard.setVisible(false) });
    }
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      const on = Math.floor(this.alarmT * 6) % 2 === 0;
      g.fillStyle(0xe5484d, on ? 0.22 : 0.06).fillRect(WORLD.x, WORLD.y, WORLD.w, WORLD.h);
      this.alarmText.setVisible(on);
    } else this.alarmText.setVisible(false);

    if (this.toastT > 0) {
      this.toastT -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastT * 3));
      this.toastText.setY(sim.facetime.state === 'active' ? PANEL.y - 70 : PANEL.y - 12);
      if (this.toastT <= 0) this.toastText.setVisible(false);
    }
    if (this.textT > 0) {
      this.textT -= dt;
      if (this.textT <= 0) this.textBanner.setVisible(false);
    } else if (this.textQueue.length) {
      const m = this.textQueue.shift()!;
      this.textFrom.setText(m.from.toUpperCase() + '  ·  now');
      this.textBody.setText(m.body);
      this.textBanner.setVisible(true).setY(WORLD.y - 40).setAlpha(0);
      this.tweens.add({ targets: this.textBanner, y: WORLD.y + 6, alpha: 1, duration: 220, ease: 'Cubic.easeOut' });
      this.textT = 3;
    }
    const ft = sim.facetime.state === 'active';
    this.momWin.setVisible(ft);
    if (ft) this.momTime.setText(`0:${String(Math.max(0, Math.ceil(sim.facetime.left))).padStart(2, '0')}`);
    const pr = sim.facetime.prompt;
    this.uhHuh.setVisible(!!pr && this.running);
    if (pr) {
      this.uhHuh.setScale(1 + Math.sin(this.now * 12) * 0.03);
      g.fillStyle(0xffffff, 0.9).fillRoundedRect(this.uhHuh.x - 80, this.uhHuh.y + 20, 160 * Math.max(0, pr.left / 2.6), 5, 2);
    }
    this.selectBanner.setVisible(this.panel.selectMode && this.running);
  }
}

function approach(p: Pt, goal: Pt, speed: number, dt: number): Pt {
  const dx = goal.x - p.x;
  const dy = goal.y - p.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d <= step || d < 0.5) return { ...goal };
  return { x: p.x + (dx / d) * step, y: p.y + (dy / d) * step };
}

