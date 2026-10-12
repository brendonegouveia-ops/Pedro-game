import Phaser from 'phaser';
import { ABILITIES, COFFEE, KAYLA_OUT_OF_CHARGES } from '../config';
import { COUCH_POS, ROOM_NAMES, STATIONS, STATION_IDS, type RoomId, type StationId } from '../sim/house';
import { REQUEST_LABEL, Sim, type ActorId, type Request, type SimEvent } from '../sim/sim';
import { CHAR_HEIGHT, drawActor, drawGrill, drawIcon, drawMomFace, drawSpot, drawWorld } from './art';
import { ACTOR_SCALE, BAR, COLORS, FONT, H, HUD, PANEL, W, WORLD, inWorld, toScreen, toWorld } from './layout';
import { ActionPanel } from './panel';

export interface SceneHooks {
  sfx: (name: string) => void;
  haptic: (p: number | number[]) => void;
  gameOver: (sim: Sim) => void;
  pause: () => void;
}

type Pt = { x: number; y: number };

interface ActorView {
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Graphics;
  fx: Phaser.GameObjects.Graphics;
  speech: Phaser.GameObjects.Text;
}

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
  private actors = new Map<ActorId | 'nick', ActorView>();
  private nickHand!: Phaser.GameObjects.Graphics;
  private nickHandKey = '';
  private bubbles = new Map<number, BubbleView>();
  private spotTexts = new Map<StationId, Phaser.GameObjects.Text>();
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
  private handIcon!: Phaser.GameObjects.Graphics;
  private handLabel!: Phaser.GameObjects.Text;
  private handKey = '';
  private now = 0;
  private lastNow = 0;
  private steerPointer = false;
  private finger: Pt | null = null; // world point being held
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
    cam.setBackgroundColor(COLORS.bg);

    // Static floor plan + station art, baked once at device resolution.
    const map = this.add.graphics();
    drawWorld(map, WORLD.x, WORLD.y);
    this.drawStations(map);
    this.bake(map, 0);
    this.labelRooms();

    this.dyn = this.add.graphics().setDepth(8);
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise', 'nick'] as const) this.makeActor(id);
    this.nickHand = this.add.graphics();
    this.actors.get('nick')!.c.add(this.nickHand);

    this.shhText = this.txt(0, 0, 'Shhh', 10, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(31).setVisible(false);
    this.zzz = this.txt(0, 0, 'z Z z', 12, '#3d405b', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(31).setVisible(false);

    this.top = this.add.graphics().setDepth(60);
    this.buildHud();
    this.buildBar();
    this.panel = new ActionPanel(this, () => this.sim, this.txt);
    this.panel.onCancelSelect = () => (this.panel.selectMode = false);
    this.events.on('panel-sfx', (n: string) => this.hooks?.sfx(n));

    this.fxTop = this.add.graphics().setDepth(65);
    this.buildOverlays();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      this.onDown(w.x, w.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const w = cam.getWorldPoint(p.x, p.y);
      if (this.steerPointer) this.steerTo(w.x, w.y);
      else this.panel.pointerMove(w.x, w.y);
    });
    const up = (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      this.onUp(w.x, w.y);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('gameout', () => this.onUp(-1, -1));

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e, true));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.onKey(e, false));

    this.sim = new Sim(1);
    this.game.events.emit('scene-ready');
  }

  private bake(g: Phaser.GameObjects.Graphics, depth: number) {
    const rt = this.add.renderTexture(0, 0, W * this.R, H * this.R).setOrigin(0, 0).setScale(1 / this.R).setDepth(depth);
    g.setScale(this.R);
    rt.draw(g, 0, 0);
    g.destroy();
    return rt;
  }

  // ------------------------------------------------------------ run control
  startRun(seed: number) {
    this.sim = new Sim(seed);
    this.running = true;
    this.panel.selectMode = false;
    this.steerPointer = false;
    this.finger = null;
    this.keysDown.clear();
    this.textQueue = [];
    this.textT = 0;
    this.toastT = 0;
    this.alarmT = 0;
    this.textBanner.setVisible(false);
    this.toastText.setVisible(false);
    this.jokeCard.setVisible(false);
    for (const b of this.bubbles.values()) b.c.destroy();
    this.bubbles.clear();
  }

  // Called when the game pauses: let go of everything held.
  releaseInput() {
    this.steerPointer = false;
    this.finger = null;
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
    this.render(dt);
    this.panel.update(this.running ? sdt : 0);
  }

  // ------------------------------------------------------------ input
  private onDown(x: number, y: number) {
    if (!this.running) return;
    const sim = this.sim;
    if (y >= BAR.y) return this.onBar(x);
    if (sim.facetime.prompt && Math.abs(x - this.uhHuh.x) <= 110 && Math.abs(y - this.uhHuh.y) <= 32) {
      sim.answerUhHuh();
      return;
    }
    if (this.panel.contains(x, y)) return this.panel.pointerDown(x, y);
    if (!inWorld(x, y)) return;
    if (this.panel.selectMode) {
      const b = this.nearestBubble(x, y, 32);
      if (b != null) {
        sim.callKayla(b);
        this.panel.selectMode = false;
      }
      return;
    }
    // Anywhere on the house: hold to walk toward your finger.
    this.steerPointer = true;
    this.steerTo(x, y);
  }

  private steerTo(x: number, y: number) {
    this.finger = toWorld(x, y);
    this.sim.setMoveTarget(this.finger);
  }

  private onUp(x: number, y: number) {
    if (this.steerPointer) {
      this.steerPointer = false;
      this.finger = null;
      this.sim.setMoveTarget(null);
      return;
    }
    this.panel.pointerUp(x, y);
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
      let dx = 0;
      let dy = 0;
      for (const k of this.keysDown) {
        dx += MOVE_KEYS[k][0];
        dy += MOVE_KEYS[k][1];
      }
      this.sim.setMoveDir(dx || dy ? { x: dx, y: dy } : null);
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
  private drawStations(g: Phaser.GameObjects.Graphics) {
    for (const s of STATION_IDS) {
      const p = toScreen(STATIONS[s].x, STATIONS[s].y);
      const icon = PLATE_ICON[s];
      if (icon) {
        g.fillStyle(0xffffff, 0.92).fillRoundedRect(p.x - 13, p.y - 13, 26, 26, 6);
        g.lineStyle(1.5, 0x000000, 0.18).strokeRoundedRect(p.x - 13, p.y - 13, 26, 26, 6);
        g.save();
        g.translateCanvas(p.x, p.y);
        drawIcon(g, icon, 19);
        g.restore();
      } else if (s.startsWith('spot_')) drawSpot(g, s, p.x, p.y);
      else if (s === 'grill') drawGrill(g, p.x, p.y);
    }
    for (const s of ['spot_toolbox', 'spot_bin', 'spot_cooler', 'spot_bike'] as StationId[]) {
      const p = toScreen(STATIONS[s].x, STATIONS[s].y);
      this.spotTexts.set(s, this.txt(p.x, p.y, '?', 16, '#22223b', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(9).setVisible(false));
    }
  }

  private labelRooms() {
    const spots: Record<RoomId, Pt> = { backyard: { x: 104, y: 10 }, kitchen: { x: 184, y: 172 }, living: { x: 382, y: 484 }, garage: { x: 184, y: 362 } };
    for (const r of Object.keys(spots) as RoomId[]) {
      const p = toScreen(spots[r].x, spots[r].y);
      this.txt(p.x, p.y, ROOM_NAMES[r].toUpperCase(), 9, '#ffffff', {
        fontStyle: 'bold',
        backgroundColor: '#00000055',
        padding: { x: 4, y: 2 },
      })
        .setOrigin(r === 'backyard' ? 0 : 1, 0)
        .setDepth(1);
    }
    for (const s of ['highchair', 'playpen', 'door'] as StationId[]) {
      const p = toScreen(STATIONS[s].x, STATIONS[s].y);
      const off = s === 'door' ? -42 : s === 'highchair' ? -40 : 20;
      this.txt(p.x, p.y + off, STATIONS[s].label, 8, '#22223b', { backgroundColor: '#ffffffaa', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 0)
        .setDepth(2);
    }
  }

  private makeActor(id: ActorId | 'nick') {
    const body = this.add.graphics();
    drawActor(body, id);
    body.setScale(ACTOR_SCALE[id]);
    const fx = this.add.graphics();
    const c = this.add.container(0, 0, [body, fx]).setDepth(10);
    const speech = this.txt(0, 0, '', 11, '#22223b', { backgroundColor: '#ffffff', padding: { x: 5, y: 2 }, fontStyle: 'bold' })
      .setOrigin(0.5, 1)
      .setDepth(36)
      .setVisible(false);
    this.actors.set(id, { c, body, fx, speech });
  }

  private buildHud() {
    this.clockText = this.txt(12, 6, '9:00 AM', 28, '#ffffff', { fontStyle: 'bold' }).setDepth(61);
    this.txt(14, 42, 'SATURDAY', 9, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
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
  // Where a request's bubble floats (screen space).
  private bubblePoint(r: Request): Pt {
    if (r.kind === 'flip' || r.kind === 'thermostat' || r.kind === 'needs_out') {
      const st = STATIONS[r.kind === 'flip' ? 'grill' : r.kind === 'thermostat' ? 'thermostat' : 'door'];
      const p = toScreen(st.x, st.y);
      if (r.kind === 'thermostat') return { x: p.x + 30, y: p.y + 6 };
      if (r.kind === 'needs_out') {
        const d = this.sim.actors.eloise;
        const dp = toScreen(d.x, d.y);
        return { x: dp.x + 8, y: dp.y - 48 };
      }
      return { x: p.x - 34, y: p.y - 4 };
    }
    if (r.kind === 'spill') {
      const p = toScreen(r.x ?? 0, r.y ?? 0);
      return { x: p.x, y: p.y - 30 };
    }
    const kids = (r.kids ?? [r.owner]) as ActorId[];
    const ps = kids.map((k) => toScreen(this.sim.actors[k].x, this.sim.actors[k].y));
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const h = Math.max(...kids.map((k) => CHAR_HEIGHT[k] * ACTOR_SCALE[k]));
    const y = Math.min(...ps.map((p) => p.y)) - h - 22;
    return { x: Phaser.Math.Clamp(x, 24, W - 24), y: Math.max(WORLD.y + 22, y) };
  }

  // ------------------------------------------------------------ render
  private render(dt: number) {
    const sim = this.sim;
    const g = this.dyn;
    g.clear();

    // Finger marker: where Nick is headed while you hold.
    if (this.finger && this.running) {
      const f = toScreen(this.finger.x, this.finger.y);
      const n = toScreen(sim.nick.x, sim.nick.y);
      g.fillStyle(0xffffff, 0.25).fillCircle(f.x, f.y, 16);
      g.lineStyle(2, 0xffffff, 0.8).strokeCircle(f.x, f.y, 16);
      g.fillStyle(0xffffff, 0.6);
      const len = Math.hypot(f.x - n.x, f.y - n.y);
      for (let d = 18; d < len - 16; d += 10) g.fillCircle(n.x + ((f.x - n.x) * d) / len, n.y + ((f.y - n.y) * d) / len, 1.6);
    }

    this.renderHighlights(g);

    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as ActorId[]) {
      const a = sim.actors[id];
      const v = this.actors.get(id)!;
      v.c.setVisible(a.present);
      v.speech.setVisible(false);
      if (!a.present) continue;
      let p = toScreen(a.x, a.y);
      if (a.state === 'carried') {
        const n = toScreen(sim.nick.x, sim.nick.y);
        p = { x: n.x - 13 * sim.nick.facing, y: n.y - 14 };
      }
      const asleep = a.state === 'asleep';
      v.c.setPosition(p.x + (asleep ? -4 : 0), p.y + (asleep ? -8 : 0));
      v.c.setDepth(10 + p.y / 1000 + (a.state === 'carried' ? 0.001 : 0));
      v.c.setAngle(asleep ? -84 : 0);
      const walking = !!a.dest && a.state !== 'carried';
      v.body.y = a.state === 'crying' ? Math.sin(this.now * 18) * 1.2 : walking ? -Math.abs(Math.sin(this.now * 12)) * 2 : 0;
      if (id === 'eloise' && a.dest) v.body.scaleX = (a.dest.x < a.x ? -1 : 1) * ACTOR_SCALE.eloise;
      this.drawActorFx(v, id);
      const text = a.state === 'crying' ? (id === 'nora' ? 'WAAAH' : 'WAAAAH!') : a.speech;
      if (text && !asleep) {
        v.speech.setText(text).setVisible(true);
        v.speech.setPosition(p.x, p.y - CHAR_HEIGHT[id] * ACTOR_SCALE[id] - (a.req != null ? 46 : 4));
      }
    }

    const nv = this.actors.get('nick')!;
    const n = toScreen(sim.nick.x, sim.nick.y);
    nv.c.setPosition(n.x, n.y + (sim.nick.moving ? -Math.abs(Math.sin(this.now * 14)) * 2.5 : 0));
    nv.c.setDepth(10 + n.y / 1000 + 0.0005);
    nv.body.scaleX = sim.nick.facing * ACTOR_SCALE.nick;
    const handKey = `${sim.nick.hand}|${sim.nick.facing}`;
    if (handKey !== this.nickHandKey) {
      this.nickHandKey = handKey;
      this.nickHand.clear();
      const h = sim.nick.hand;
      if (h && h !== 'nora') {
        this.nickHand.setPosition(-15 * sim.nick.facing, h === 'phone' ? -44 : -24);
        drawIcon(this.nickHand, h === 'phone' ? 'phone' : h, 12);
      }
    }
    if (sim.engaged) g.lineStyle(3, COLORS.accent, 0.9).strokeEllipse(n.x, n.y, 34 + Math.sin(this.now * 10) * 3, 10);

    this.renderBubbles(g, dt);
    this.renderNap();
    this.renderHud();
    this.renderOverlays(dt);
  }

  private drawActorFx(v: ActorView, id: ActorId) {
    const a = this.sim.actors[id];
    const fx = v.fx;
    fx.clear();
    if (a.state === 'crying') {
      const h = CHAR_HEIGHT[id] * ACTOR_SCALE[id];
      const t = (this.now * 2) % 1;
      fx.fillStyle(0x4ea8de, 1 - t);
      fx.fillCircle(-4, -h + 16 + t * 9, 1.8);
      fx.fillCircle(4, -h + 16 + ((t + 0.5) % 1) * 9, 1.8);
    }
  }

  private renderHighlights(g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    const pulse = 0.5 + Math.sin(this.now * 6) * 0.5;
    const ring = (s: StationId, color: number, alpha = 0.9) => {
      const p = toScreen(STATIONS[s].x, STATIONS[s].y);
      g.lineStyle(2.5, color, alpha).strokeCircle(p.x, p.y, 17 + pulse * 2);
    };
    if (sim.nick.coffee < COFFEE.slowBelow) ring('coffee', COLORS.bad);
    if (sim.nick.hand === 'nora') {
      ring('highchair', 0xffd166);
      ring('playpen', 0xffd166);
    }
    // Where to get what someone is asking for (gold), unless Nick already has it.
    const need = new Set(sim.requests.map((r) => r.kind));
    const NEED = 0xffd166;
    if (need.has('snack') && sim.nick.hand !== 'snack') ring('snacks', NEED);
    if (need.has('juice_box') && sim.nick.hand !== 'juice_box') ring('juice', NEED);
    if (need.has('sippy_cup') && sim.nick.hand !== 'sippy_cup') ring('sippy', NEED);
    if (need.has('booboo') && sim.nick.hand !== 'bandaid') ring('bandaids', NEED);
    // Who Nick is bringing his item to.
    const promised = sim.req(sim.promisedId);
    if (promised) {
      const a = sim.anchorOf(promised);
      const p = toScreen(a.x, a.y);
      g.lineStyle(3, 0x4ea8de, 1).strokeEllipse(p.x, p.y + 2, 36 + pulse * 6, 14 + pulse * 2);
    }
    // Crying kids will take whatever Nick is holding.
    const h = sim.nick.hand;
    if (h && h !== 'nora' && h !== 'phone') {
      for (const k of ['evelyn', 'nora', 'tyler'] as const) {
        const a = sim.actors[k];
        if (!a.present || a.state !== 'crying') continue;
        const p = toScreen(a.x, a.y);
        g.lineStyle(2, 0x4ea8de, 0.7).strokeEllipse(p.x, p.y + 2, 30 + pulse * 4, 12);
      }
    }
    if (need.has('thermostat')) ring('thermostat', COLORS.bad);
    if (need.has('needs_out')) ring('door', 0xffd166);

    for (const t of this.spotTexts.values()) t.setVisible(false);
    for (const r of sim.requests) {
      if (r.kind !== 'lost_shoe') continue;
      for (const s of r.spots ?? []) {
        const checked = r.checked?.includes(s);
        const p = toScreen(STATIONS[s].x, STATIONS[s].y);
        g.fillStyle(checked ? 0x2a9d8f : 0xffd166, 0.3).fillCircle(p.x, p.y, 17);
        g.lineStyle(2.5, checked ? 0x2a9d8f : 0xffd166, 1).strokeCircle(p.x, p.y, 18 + (checked ? 0 : pulse * 2));
        this.spotTexts.get(s)!.setText(checked ? '✓' : '?').setVisible(true);
      }
    }

    if (sim.grill.on) {
      const p = toScreen(STATIONS.grill.x, STATIONS.grill.y);
      const flip = sim.requests.find((r) => r.kind === 'flip');
      const burn = flip ? 1 - flip.left / flip.patience : 0;
      g.fillStyle(Phaser.Display.Color.GetColor(150 - burn * 110, 80 - burn * 60, 35), 1);
      g.fillCircle(p.x - 7, p.y - 4, 6).fillCircle(p.x + 7, p.y + 4, 6);
      const puff = (this.now * 0.8) % 1;
      g.fillStyle(flip ? 0x555555 : 0xdddddd, (1 - puff) * (0.35 + burn * 0.5));
      g.fillCircle(p.x + puff * 8, p.y - 14 - puff * 26, 4 + puff * 8);
    }
    for (const r of sim.requests) {
      if (r.kind !== 'spill') continue;
      const p = toScreen(r.x ?? 0, r.y ?? 0);
      g.fillStyle(0x4ea8de, 0.75).fillEllipse(p.x, p.y, 34, 14).fillCircle(p.x - 12, p.y - 3, 5).fillCircle(p.x + 10, p.y + 3, 4);
    }

    // The job Nick is next to: a ring under it so you know what the panel is about.
    const it = sim.interaction;
    if (it) {
      let p: Pt | null = null;
      if (it.target.t === 'station') p = toScreen(STATIONS[it.target.station].x, STATIONS[it.target.station].y);
      else if (it.target.t === 'kid') p = toScreen(sim.actors[it.target.kid].x, sim.actors[it.target.kid].y);
      else {
        const r = sim.req(it.target.req);
        if (r) {
          const a = sim.anchorOf(r);
          p = toScreen(a.x, a.y);
        }
      }
      if (p) g.lineStyle(3, COLORS.accent, 1).strokeEllipse(p.x, p.y + 2, 40 + pulse * 4, 16 + pulse * 2);
    }
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
      b.pos = approach(b.pos, target, 500, dt);
      b.c.setPosition(b.pos.x, b.pos.y);
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
    const c = toScreen(COUCH_POS.x, COUCH_POS.y);
    const g = this.dyn;
    const x = c.x - 40;
    const y = c.y - 50;
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

