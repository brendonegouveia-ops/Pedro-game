import Phaser from 'phaser';
import { ABILITIES, CAST, COFFEE, KAYLA_OUT_OF_CHARGES, ROOMS } from '../config';
import { COUCH_POS, STATIONS, STATION_IDS, route, type RoomId, type StationId } from '../sim/house';
import { KID_IDS, Sim, type ActorId, type Request, type SimEvent, type Target } from '../sim/sim';
import { CHAR_HEIGHT, drawActor, drawIcon, drawMomFace, drawRooms } from './art';
import {
  BAR,
  COLORS,
  FONT,
  H,
  HOUSE,
  HUD,
  NICK_IDLE,
  PANEL,
  W,
  roomAtPoint,
  roomPoint,
  roomRect,
  stationPoint,
} from './layout';
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
  pos: Pt;
}

interface BubbleView {
  c: Phaser.GameObjects.Container;
  pos: Pt;
  born: number;
}

const PLATE_ICON: Partial<Record<StationId, string>> = {
  coffee: 'coffee',
  snacks: 'snack',
  juice: 'juice_box',
  sippy: 'sippy_cup',
  bandaids: 'bandaid',
  thermostat: 'thermostat',
};

export class GameScene extends Phaser.Scene {
  sim!: Sim;
  hooks!: SceneHooks;
  readonly R: number;
  running = false;

  private dyn!: Phaser.GameObjects.Graphics; // route, rings, highlights
  private top!: Phaser.GameObjects.Graphics; // HUD + bar drawing
  private fxTop!: Phaser.GameObjects.Graphics; // overlays (freeze tint, alarm flash)
  private actors = new Map<ActorId | 'nick', ActorView>();
  private nickHand!: Phaser.GameObjects.Graphics;
  private nickHandKey = '';
  private bubbles = new Map<number, BubbleView>();
  private markerTexts: Phaser.GameObjects.Text[] = [];
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
  private uhHuhText!: Phaser.GameObjects.Text;
  private shhText!: Phaser.GameObjects.Text;
  private zzz!: Phaser.GameObjects.Text;
  private selectBanner!: Phaser.GameObjects.Text;
  private alarmT = 0;
  private alarmText!: Phaser.GameObjects.Text;
  private now = 0;
  private keyHeld = new Set<string>();

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
    this.add.text(x, y, s, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      resolution: this.R,
      ...style,
    });

  create() {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(this.R);
    cam.setBackgroundColor(COLORS.bg);

    // Static house, baked once into a texture at device resolution.
    const rooms = this.add.graphics();
    drawRooms(rooms);
    this.bake(rooms, 0);
    for (const r of Object.keys(ROOMS) as RoomId[]) {
      const rr = roomRect(r);
      this.txt(rr.x + 8, rr.y + rr.h - 20, ROOMS[r].name.toUpperCase(), 10, '#ffffff', {
        fontStyle: 'bold',
        backgroundColor: '#00000055',
        padding: { x: 4, y: 2 },
      }).setDepth(1);
    }
    this.drawStations();

    this.dyn = this.add.graphics().setDepth(8);

    for (const id of ['evelyn', 'nora', 'tyler', 'eloise', 'nick'] as const) this.makeActor(id);
    this.nickHand = this.add.graphics();
    this.actors.get('nick')!.c.add(this.nickHand);

    for (let i = 0; i < 4; i++)
      this.markerTexts.push(this.txt(0, 0, `${i + 1}`, 13, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(33).setVisible(false));

    this.shhText = this.txt(0, 0, 'Shhh', 11, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(31).setVisible(false);
    this.zzz = this.txt(0, 0, 'z Z z', 14, '#3d405b', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(31).setVisible(false);

    this.top = this.add.graphics().setDepth(60);
    this.buildHud();
    this.buildBar();
    this.panel = new ActionPanel(this, () => this.sim, this.txt);
    this.panel.onCancelSelect = () => (this.panel.selectMode = false);
    this.events.on('panel-sfx', (n: string) => this.hooks?.sfx(n));

    this.fxTop = this.add.graphics().setDepth(65);
    this.buildOverlays();

    // Input: hit-test manually so every target gets a generous, predictable area.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      this.onDown(w.x, w.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const w = cam.getWorldPoint(p.x, p.y);
      this.panel.pointerMove(w.x, w.y);
    });
    const up = (p: Phaser.Input.Pointer) => {
      const w = cam.getWorldPoint(p.x, p.y);
      this.panel.pointerUp(w.x, w.y);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('gameout', () => this.panel.pointerUp(-1, -1));

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e, true));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.onKey(e, false));

    this.sim = new Sim(1);
    this.game.events.emit('scene-ready');
  }

  // ------------------------------------------------------------ run control
  startRun(seed: number) {
    this.sim = new Sim(seed);
    this.running = true;
    this.panel.selectMode = false;
    this.textQueue = [];
    this.textT = 0;
    this.toastT = 0;
    this.alarmT = 0;
    this.textBanner.setVisible(false);
    this.toastText.setVisible(false);
    this.jokeCard.setVisible(false);
    for (const b of this.bubbles.values()) b.c.destroy();
    this.bubbles.clear();
    const nick = this.actors.get('nick')!;
    nick.pos = roomPoint('living', NICK_IDLE.x, NICK_IDLE.y);
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as ActorId[]) {
      const a = this.sim.actors[id];
      this.actors.get(id)!.pos = roomPoint(a.room, a.x, a.y);
    }
  }

  // Bake static Graphics into a RenderTexture so they aren't re-tessellated every frame.
  private bake(g: Phaser.GameObjects.Graphics, depth: number) {
    const rt = this.add.renderTexture(0, 0, W * this.R, H * this.R).setOrigin(0, 0).setScale(1 / this.R).setDepth(depth);
    g.setScale(this.R);
    rt.draw(g, 0, 0);
    g.destroy();
    return rt;
  }

  private lastNow = 0;
  timeScale = 1; // tests only

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
    // FaceTime "uh-huh" sits just above the panel and wins over the house.
    if (sim.facetime.prompt && Math.abs(x - this.uhHuh.x) <= 110 && Math.abs(y - this.uhHuh.y) <= 32) {
      sim.answerUhHuh();
      return;
    }
    if (this.panel.contains(x, y)) return this.panel.pointerDown(x, y);
    if (y < HOUSE.y || y >= HOUSE.y + HOUSE.h) return;

    if (this.panel.selectMode) {
      const b = this.nearestBubble(x, y, 34);
      if (b != null) {
        sim.callKayla(b);
        this.panel.selectMode = false;
      }
      return;
    }

    // 1) queue markers cancel
    for (const [i, q] of sim.queue.entries()) {
      const m = this.markerPos(q.target, i);
      if (m && Math.hypot(m.x - x, m.y - y) <= 24) {
        sim.cancelQueue(q.id);
        return;
      }
    }
    // 2) bubbles
    const b = this.nearestBubble(x, y, 30);
    if (b != null) {
      sim.tapRequest(b);
      return;
    }
    // 3) actors (hit box extends well past the sprite)
    let best: { id: ActorId; d: number } | null = null;
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as ActorId[]) {
      const a = sim.actors[id];
      if (!a.present || a.state === 'carried') continue;
      const v = this.actors.get(id)!;
      const h = Math.max(70, CHAR_HEIGHT[id] + 14);
      const cx = v.pos.x;
      const cy = v.pos.y - h / 2 + 6;
      if (Math.abs(x - cx) <= 32 && Math.abs(y - cy) <= h / 2 + 4) {
        const d = Math.hypot(x - cx, y - cy);
        if (!best || d < best.d) best = { id, d };
      }
    }
    if (best) {
      sim.tapActor(best.id);
      return;
    }
    // 4) stations
    let bs: { s: StationId; d: number } | null = null;
    for (const s of STATION_IDS) {
      const p = stationPoint(s);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= 28 && (!bs || d < bs.d)) bs = { s, d };
    }
    if (bs) {
      sim.tapStation(bs.s);
      return;
    }
    // 5) rooms
    const room = roomAtPoint(x, y);
    if (room) sim.tapRoom(room);
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
    if (!down) {
      this.keyHeld.delete(e.code);
      this.panel.keyUp(e.code);
      return;
    }
    const repeat = this.keyHeld.has(e.code);
    this.keyHeld.add(e.code);
    if (e.code === 'Digit1' || e.code === 'Numpad1') return this.useAbility(0);
    if (e.code === 'Digit2' || e.code === 'Numpad2') return this.useAbility(1);
    if (e.code === 'Digit3' || e.code === 'Numpad3') return this.useAbility(2);
    if (e.code === 'KeyU' && this.sim.answerUhHuh()) return;
    if (this.panel.keyDown(e.code, repeat)) e.preventDefault();
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
      y: b.c.y - (good ? 16 : -6),
      duration: 260,
      onComplete: () => b.c.destroy(),
    });
  }

  // ------------------------------------------------------------ build
  private drawStations() {
    const g = this.add.graphics();
    const icons = this.add.graphics();
    for (const s of STATION_IDS) {
      const p = stationPoint(s);
      const icon = PLATE_ICON[s];
      if (icon) {
        g.fillStyle(0xffffff, 0.85).fillRoundedRect(p.x - 19, p.y - 19, 38, 38, 9);
        g.lineStyle(2, 0x00000, 0.15).strokeRoundedRect(p.x - 19, p.y - 19, 38, 38, 9);
        icons.save();
        icons.translateCanvas(p.x, p.y);
        drawIcon(icons, icon, 26);
        icons.restore();
      } else if (s.startsWith('spot_')) {
        drawSpot(g, s, p.x, p.y);
      } else if (s === 'grill') {
        g.fillStyle(0x22223b, 1).fillEllipse(p.x, p.y, 54, 30);
        g.fillStyle(0x3d405b, 1).fillRect(p.x - 27, p.y - 4, 54, 6);
        g.lineStyle(3, 0x22223b, 1);
        g.lineBetween(p.x - 16, p.y + 10, p.x - 22, p.y + 40);
        g.lineBetween(p.x + 16, p.y + 10, p.x + 22, p.y + 40);
        g.lineBetween(p.x, p.y + 12, p.x, p.y + 40);
      }
      if (s !== 'door' && s !== 'grill' && s !== 'highchair' && s !== 'playpen') continue;
      const lp = { x: p.x, y: p.y + (s === 'door' ? 34 : 28) };
      if (s === 'grill') lp.y = p.y + 46;
      this.txt(lp.x, lp.y, STATIONS[s].label, 9, '#22223b', { backgroundColor: '#ffffffaa', padding: { x: 3, y: 1 } })
        .setOrigin(0.5, 0)
        .setDepth(6);
    }
    this.bake(g, 5);
    this.bake(icons, 6);
    for (const s of ['spot_toolbox', 'spot_bin', 'spot_cooler', 'spot_bike'] as StationId[]) {
      const p = stationPoint(s);
      this.spotTexts.set(s, this.txt(p.x, p.y - 2, '?', 18, '#22223b', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(9).setVisible(false));
    }
  }

  private makeActor(id: ActorId | 'nick') {
    const body = this.add.graphics();
    drawActor(body, id);
    const fx = this.add.graphics();
    const c = this.add.container(0, 0, [body, fx]).setDepth(10);
    const speech = this.txt(0, 0, '', 12, '#22223b', {
      backgroundColor: '#ffffff',
      padding: { x: 6, y: 3 },
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 1)
      .setDepth(36)
      .setVisible(false);
    const pos = id === 'nick' ? roomPoint('living', NICK_IDLE.x, NICK_IDLE.y) : roomPoint('living', 0.6, 0.8);
    this.actors.set(id, { c, body, fx, speech, pos });
  }

  private buildHud() {
    this.clockText = this.txt(14, 8, '9:00 AM', 30, '#ffffff', { fontStyle: 'bold' }).setDepth(61);
    this.txt(16, 44, 'SATURDAY', 10, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
    this.txt(176, 6, 'CHAOS', 10, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
    this.chaosText = this.txt(376, 6, '0', 10, '#ffffff', { fontStyle: 'bold' }).setOrigin(1, 0).setDepth(61);
    this.txt(176, 50, 'COFFEE', 10, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
    this.txt(16, 64, 'HAND', 10, '#9a9cc0', { fontStyle: 'bold' }).setDepth(61);
  }

  private buildBar() {
    const labels = ['Dad Joke', 'Call Kayla', 'Because I\nSaid So', ''];
    for (let i = 0; i < 4; i++) {
      const r = this.barRect(i);
      this.barTexts.push(
        this.txt(r.x + r.w / 2, r.y + r.h / 2 - (i < 3 ? 6 : 0), labels[i], i < 3 ? 13 : 20, '#ffffff', {
          fontStyle: 'bold',
          align: 'center',
        })
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
    // Kayla's texts: phone-notification banner along the top of the house.
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(10, 4, W - 20, 54, 14);
    bg.fillStyle(0xf8f9fa, 0.97).fillRoundedRect(10, 0, W - 20, 54, 14);
    const ic = this.add.graphics({ x: 34, y: 27 });
    ic.fillStyle(0x34c759, 1).fillRoundedRect(-14, -14, 28, 28, 7);
    ic.fillStyle(0xffffff, 1).fillEllipse(0, -1, 18, 13).fillTriangle(-6, 3, -9, 9, -1, 4);
    this.textFrom = this.txt(56, 7, '', 12, '#6c757d', { fontStyle: 'bold' });
    this.textBody = this.txt(56, 24, '', 14, '#22223b', { wordWrap: { width: W - 90 } });
    this.textBanner = this.add.container(0, HOUSE.y + 6, [bg, ic, this.textFrom, this.textBody]).setDepth(70).setVisible(false);

    this.toastText = this.txt(W / 2, PANEL.y - 22, '', 14, '#ffffff', {
      backgroundColor: '#22223bee',
      padding: { x: 12, y: 7 },
      align: 'center',
      wordWrap: { width: W - 60 },
    })
      .setOrigin(0.5, 1)
      .setDepth(72)
      .setVisible(false);

    // Dad joke card.
    const jb = this.add.graphics();
    jb.fillStyle(0x000000, 0.3).fillRoundedRect(-162, -78, 324, 160, 18);
    jb.fillStyle(0xfffaf0, 1).fillRoundedRect(-165, -82, 330, 160, 18);
    jb.lineStyle(3, 0xffd166, 1).strokeRoundedRect(-165, -82, 330, 160, 18);
    const ji = this.add.graphics({ x: -138, y: -56 });
    drawIcon(ji, 'joke', 32);
    const jt = this.txt(-116, -70, 'DAD JOKE', 12, '#e76f51', { fontStyle: 'bold' });
    this.jokeText = this.txt(0, 2, '', 17, '#22223b', { align: 'center', wordWrap: { width: 296 } }).setOrigin(0.5);
    const groan = this.txt(0, 60, '*group groan*  ·  timers frozen', 11, '#8d8fa8').setOrigin(0.5);
    this.jokeCard = this.add.container(W / 2, HOUSE.y + 170, [jb, ji, jt, this.jokeText, groan]).setDepth(71).setVisible(false);

    // FaceTime window.
    // FaceTime: a compact strip just above the panel, so it never covers the house's bubbles.
    const mg = this.add.graphics();
    mg.fillStyle(0x000000, 0.3).fillRoundedRect(-30, -24, 64, 56, 14);
    mg.fillStyle(0x22223b, 1).fillRoundedRect(-32, -28, 64, 56, 14);
    const face = this.add.graphics({ x: 0, y: -2 });
    drawMomFace(face, 17);
    const ml = this.txt(0, 19, 'MIL', 9, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.momTime = this.txt(0, -19, '', 9, '#34c759', { fontStyle: 'bold' }).setOrigin(0.5);
    this.momWin = this.add.container(44, PANEL.y - 40, [mg, face, ml, this.momTime]).setDepth(69).setVisible(false);

    const ub = this.add.graphics();
    ub.fillStyle(0x000000, 0.3).fillRoundedRect(-104, -24, 208, 56, 28);
    ub.fillStyle(0x34c759, 1).fillRoundedRect(-106, -28, 212, 56, 28);
    this.uhHuhText = this.txt(0, 0, '“uh-huh”', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.uhHuh = this.add.container(W / 2 + 34, PANEL.y - 40, [ub, this.uhHuhText]).setDepth(75).setVisible(false);

    this.selectBanner = this.txt(W / 2, HOUSE.y + 8, 'Kayla’s on it: tap a request', 14, '#ffffff', {
      backgroundColor: '#e76f51',
      padding: { x: 12, y: 6 },
      fontStyle: 'bold',
    })
      .setOrigin(0.5, 0)
      .setDepth(74)
      .setVisible(false);

    this.alarmText = this.txt(W / 2, HOUSE.y + HOUSE.h / 2, 'BEEP! BEEP! BEEP!', 30, '#ffffff', {
      fontStyle: 'bold',
      stroke: '#e5484d',
      strokeThickness: 6,
    })
      .setOrigin(0.5)
      .setDepth(73)
      .setVisible(false);
  }

  // ------------------------------------------------------------ positions
  private actorAnchor(id: ActorId): Pt {
    const a = this.sim.actors[id];
    if (id === 'nora' && a.state === 'carried') {
      const n = this.actors.get('nick')!.pos;
      return { x: n.x - 20, y: n.y - 26 };
    }
    return roomPoint(a.room, a.x, a.y);
  }

  private targetPoint(t: Target): Pt | null {
    if (t.t === 'room') return roomPoint(t.room, 0.5, 0.55);
    if (t.t === 'station') return stationPoint(t.station);
    const r = this.sim.req(t.req);
    if (!r) return null;
    return this.bubbles.get(r.id)?.pos ?? this.requestPoint(r);
  }

  private markerPos(t: Target, i: number): Pt | null {
    const p = this.targetPoint(t);
    if (!p) return null;
    return { x: p.x + 20, y: p.y - 22 + (t.t === 'room' ? i * 0 : 0) };
  }

  private nickGoal(): Pt {
    const n = this.sim.nick;
    if (n.hop) {
      const a = roomPoint(n.hop.from, NICK_IDLE.x, NICK_IDLE.y);
      const b = roomPoint(n.hop.to, NICK_IDLE.x, NICK_IDLE.y);
      const p = Phaser.Math.Easing.Sine.InOut(Math.min(1, n.hop.p));
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }
    const q = this.sim.queue[0];
    if (q && this.sim.targetRoom(q.target) === n.room) {
      if (q.target.t === 'station') {
        const s = STATIONS[q.target.station];
        return roomPoint(s.room, Phaser.Math.Clamp(s.x + (s.x < 0.5 ? 0.12 : -0.12), 0.12, 0.88), Math.max(0.78, s.y + 0.1));
      }
      if (q.target.t === 'request') {
        const r = this.sim.req(q.target.req);
        if (r) {
          const p = this.requestFloor(r);
          const rr = roomRect(r.room);
          const left = p.x - rr.x > rr.w * 0.4;
          return { x: Phaser.Math.Clamp(p.x + (left ? -34 : 34), rr.x + 20, rr.x + rr.w - 20), y: Math.max(p.y, rr.y + rr.h * 0.78) };
        }
      }
    }
    return roomPoint(n.room, NICK_IDLE.x, NICK_IDLE.y);
  }

  // Floor point a request is "about".
  private requestFloor(r: Request): Pt {
    if (r.kind === 'flip') return stationPoint('grill');
    if (r.kind === 'thermostat') return stationPoint('thermostat');
    if (r.kind === 'needs_out') return this.actors.get('eloise')!.pos;
    if (r.kind === 'spill') return roomPoint(r.room, r.x ?? 0.5, r.y ?? 0.8);
    const kids = r.kids ?? [r.owner as ActorId];
    const ps = kids.map((k) => this.actors.get(k)!.pos);
    return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: Math.max(...ps.map((p) => p.y)) };
  }

  // Where a request's bubble floats.
  private requestPoint(r: Request): Pt {
    if (r.kind === 'flip') {
      const p = stationPoint('grill');
      return { x: p.x, y: p.y - 40 };
    }
    if (r.kind === 'thermostat') {
      const p = stationPoint('thermostat');
      return { x: p.x + 44, y: p.y + 4 };
    }
    if (r.kind === 'spill') {
      const p = roomPoint(r.room, r.x ?? 0.5, r.y ?? 0.8);
      return { x: p.x, y: p.y - 36 };
    }
    if (r.kind === 'needs_out') {
      const p = this.actors.get('eloise')!.pos;
      return { x: p.x + 12, y: p.y - 68 };
    }
    const kids = r.kids ?? [r.owner as ActorId];
    const ps = kids.map((k) => this.actors.get(k)!.pos);
    const x = ps.reduce((s, p) => s + p.x, 0) / ps.length;
    const h = Math.max(...kids.map((k) => CHAR_HEIGHT[k]));
    const y = Math.min(...ps.map((p) => p.y)) - h - 24;
    const rr = roomRect(r.room);
    return { x: Phaser.Math.Clamp(x, rr.x + 28, rr.x + rr.w - 28), y: Math.max(rr.y + 28, y) };
  }

  // ------------------------------------------------------------ render
  private render(dt: number) {
    const sim = this.sim;
    const g = this.dyn;
    g.clear();

    // Actors
    for (const id of ['evelyn', 'nora', 'tyler', 'eloise'] as ActorId[]) {
      const a = sim.actors[id];
      const v = this.actors.get(id)!;
      v.c.setVisible(a.present);
      v.speech.setVisible(false);
      if (!a.present) continue;
      const goal = this.actorAnchor(id);
      v.pos = approach(v.pos, goal, a.state === 'carried' ? 2000 : 150, dt);
      v.c.setPosition(v.pos.x, v.pos.y);
      v.c.setDepth(10 + v.pos.y / 1000);
      const asleep = a.state === 'asleep';
      v.c.setAngle(asleep ? -84 : 0);
      if (asleep) v.c.setPosition(v.pos.x - 6, v.pos.y - 18);
      const bob = a.state === 'crying' ? Math.sin(this.now * 18) * 1.5 : 0;
      v.body.y = bob;
      v.c.setScale(id === 'eloise' && v.pos.x > goal.x + 1 ? -1 : 1, 1);
      this.drawActorFx(v, id);
      const text = a.state === 'crying' ? (id === 'nora' ? 'WAAAH' : 'WAAAAH!') : a.speech;
      if (text && !asleep) {
        v.speech.setText(text).setVisible(true);
        v.speech.setPosition(v.pos.x, v.pos.y - CHAR_HEIGHT[id] - (a.req != null ? 52 : 6));
      }
    }

    // Nick
    const nv = this.actors.get('nick')!;
    const goal = this.nickGoal();
    const prev = nv.pos.x;
    nv.pos = approach(nv.pos, goal, sim.nick.hop ? 2000 : 420, dt);
    nv.c.setPosition(nv.pos.x, nv.pos.y + (sim.nick.hop ? Math.abs(Math.sin(this.now * 16)) * -3 : 0));
    nv.c.setDepth(10 + nv.pos.y / 1000 + 0.0005);
    if (Math.abs(nv.pos.x - prev) > 0.3) nv.body.scaleX = nv.pos.x < prev ? -1 : 1;
    const handKey = `${sim.nick.hand}|${nv.body.scaleX}`;
    if (handKey !== this.nickHandKey) {
      this.nickHandKey = handKey;
      this.nickHand.clear();
      const h = sim.nick.hand;
      if (h && h !== 'nora') {
        this.nickHand.setPosition(-27 * nv.body.scaleX, h === 'phone' ? -78 : -44);
        drawIcon(this.nickHand, h === 'phone' ? 'phone' : h, 18);
      }
    }
    if (sim.interaction) {
      // Locked in place: little "busy" ring at his feet.
      g.lineStyle(3, COLORS.accent, 0.9).strokeEllipse(nv.pos.x, nv.pos.y, 54 + Math.sin(this.now * 10) * 4, 14);
    }

    this.renderHighlights(g);
    this.renderBubbles(g, dt);
    this.renderRoute(g);
    this.renderNap();
    this.renderHud();
    this.renderOverlays(dt);
  }

  private drawActorFx(v: ActorView, id: ActorId) {
    const a = this.sim.actors[id];
    const fx = v.fx;
    fx.clear();
    if (a.state === 'crying') {
      const h = CHAR_HEIGHT[id];
      const t = (this.now * 2) % 1;
      fx.fillStyle(0x4ea8de, 1 - t);
      fx.fillCircle(-6, -h + 26 + t * 14, 2.5);
      fx.fillCircle(6, -h + 26 + ((t + 0.5) % 1) * 14, 2.5);
    }
    if (a.state === 'outside') {
      fx.fillStyle(0xffd166, 0.8).fillCircle(0, -48, 3);
    }
  }

  private renderHighlights(g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    const pulse = 0.5 + Math.sin(this.now * 6) * 0.5;
    const ring = (s: StationId, color: number, alpha = 0.9) => {
      const p = stationPoint(s);
      g.lineStyle(3, color, alpha).strokeCircle(p.x, p.y, 25 + pulse * 3);
    };
    if (sim.nick.coffee < COFFEE.slowBelow) ring('coffee', COLORS.bad);
    if (sim.nick.hand === 'nora') {
      ring('highchair', 0xffd166);
      ring('playpen', 0xffd166);
    }
    const need = new Set(sim.requests.map((r) => r.kind));
    if (need.has('snack') && sim.nick.hand !== 'snack') ring('snacks', 0xffffff, 0.5);
    if (need.has('juice_box') && sim.nick.hand !== 'juice_box') ring('juice', 0xffffff, 0.5);
    if (need.has('sippy_cup') && sim.nick.hand !== 'sippy_cup') ring('sippy', 0xffffff, 0.5);
    if (need.has('booboo') && sim.nick.hand !== 'bandaid') ring('bandaids', 0xffffff, 0.5);
    if (need.has('thermostat')) ring('thermostat', COLORS.bad);
    if (need.has('needs_out')) ring('door', 0xffd166);

    for (const t of this.spotTexts.values()) t.setVisible(false);
    for (const r of sim.requests) {
      if (r.kind !== 'lost_shoe') continue;
      for (const s of r.spots ?? []) {
        const checked = r.checked?.includes(s);
        const p = stationPoint(s);
        g.fillStyle(checked ? 0x2a9d8f : 0xffd166, 0.35).fillCircle(p.x, p.y, 22);
        g.lineStyle(3, checked ? 0x2a9d8f : 0xffd166, 1).strokeCircle(p.x, p.y, 23 + (checked ? 0 : pulse * 3));
        this.spotTexts.get(s)!.setText(checked ? '✓' : '?').setVisible(true);
      }
    }

    // Grill: burgers + smoke while lit.
    if (sim.grill.on) {
      const p = stationPoint('grill');
      const flip = sim.requests.find((r) => r.kind === 'flip');
      const burn = flip ? 1 - flip.left / flip.patience : 0;
      g.fillStyle(Phaser.Display.Color.GetColor(140 - burn * 100, 70 - burn * 50, 30), 1);
      g.fillEllipse(p.x - 10, p.y - 3, 16, 7).fillEllipse(p.x + 10, p.y - 3, 16, 7);
      const puff = (this.now * 0.8) % 1;
      g.fillStyle(flip ? 0x555555 : 0xdddddd, (1 - puff) * (0.35 + burn * 0.5));
      g.fillCircle(p.x - 6 + puff * 6, p.y - 16 - puff * 30, 5 + puff * 8);
    }
    // Spills on the floor.
    for (const r of sim.requests) {
      if (r.kind !== 'spill') continue;
      const p = roomPoint(r.room, r.x ?? 0.5, r.y ?? 0.8);
      g.fillStyle(0x4ea8de, 0.75).fillEllipse(p.x, p.y, 40, 13).fillCircle(p.x - 13, p.y - 2, 6).fillCircle(p.x + 11, p.y + 2, 5);
    }
  }

  private renderBubbles(g: Phaser.GameObjects.Graphics, dt: number) {
    const sim = this.sim;
    const live = new Set<number>();
    for (const r of sim.requests) {
      live.add(r.id);
      let b = this.bubbles.get(r.id);
      const target = this.requestPoint(r);
      if (!b) {
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.2).fillCircle(1, 3, 22);
        bg.fillStyle(0xffffff, 1).fillCircle(0, 0, 22);
        bg.fillTriangle(-6, 18, 6, 18, 0, 28);
        const ic = this.add.graphics();
        drawIcon(ic, r.kind, 26);
        b = { c: this.add.container(target.x, target.y, [bg, ic]).setDepth(30), pos: { ...target }, born: this.now };
        b.c.setScale(0.3);
        this.tweens.add({ targets: b.c, scale: 1, duration: 220, ease: 'Back.easeOut' });
        this.bubbles.set(r.id, b);
      }
      b.pos = approach(b.pos, target, 400, dt);
      b.c.setPosition(b.pos.x, b.pos.y);
      // Countdown ring.
      const frac = isFinite(r.left) ? Math.max(0, r.left / r.patience) : 1;
      const color = !isFinite(r.left) ? COLORS.bad : sim.frozen ? 0x8ecae6 : frac > 0.5 ? COLORS.chaosLo : frac > 0.25 ? COLORS.chaosMid : COLORS.chaosHi;
      g.lineStyle(6, 0x22223b, 0.55).strokeCircle(b.pos.x, b.pos.y, 26);
      g.lineStyle(5, color, 1);
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.strokePath();
      if (!this.tweens.isTweening(b.c)) b.c.setScale(!isFinite(r.left) || frac < 0.3 ? 1 + Math.sin(this.now * 14) * 0.06 : 1);
      if (this.panel.selectMode) g.lineStyle(3, 0xe76f51, 0.6 + 0.4 * Math.sin(this.now * 8)).strokeCircle(b.pos.x, b.pos.y, 32);
    }
    for (const [id, b] of this.bubbles) if (!live.has(id) && b.c.alpha === 1 && !this.tweens.isTweening(b.c)) this.popBubble(id, true);
  }

  private renderRoute(g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    for (const t of this.markerTexts) t.setVisible(false);
    let cur: Pt = this.actors.get('nick')!.pos;
    let room = sim.nick.hop ? sim.nick.hop.to : sim.nick.room;
    const pts: Pt[] = [{ x: cur.x, y: cur.y - 30 }];
    sim.queue.forEach((q, i) => {
      const tr = sim.targetRoom(q.target);
      const tp = this.targetPoint(q.target);
      if (!tr || !tp) return;
      for (const r of route(room, tr)) pts.push(roomPoint(r, 0.5, 0.62));
      pts.push(tp);
      room = tr;
      const m = this.markerPos(q.target, i)!;
      const active = i === 0 && sim.interaction;
      g.fillStyle(active ? COLORS.accent : COLORS.marker, 1).fillCircle(m.x, m.y, 12);
      g.lineStyle(2, 0xffffff, 1).strokeCircle(m.x, m.y, 12);
      this.markerTexts[i].setPosition(m.x, m.y).setVisible(true);
      cur = tp;
    });
    // Dotted line
    if (pts.length < 2) return;
    g.fillStyle(COLORS.route, 0.9);
    const off = (this.now * 30) % 10;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = i === 0 ? off : 0; d < len; d += 10) {
        const k = d / len;
        g.fillCircle(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 2);
      }
    }
  }

  private renderNap() {
    const sim = this.sim;
    const asleep = sim.nap.state === 'asleep';
    this.shhText.setVisible(asleep);
    this.zzz.setVisible(asleep);
    if (!asleep) return;
    const c = roomPoint(COUCH_POS.room, COUCH_POS.x, COUCH_POS.y);
    const g = this.dyn;
    const x = c.x - 44;
    const y = c.y - 58;
    const n = sim.nap.noise / 100;
    g.fillStyle(0x22223b, 0.85).fillRoundedRect(x, y, 88, 18, 9);
    g.fillStyle(n > 0.66 ? COLORS.chaosHi : n > 0.33 ? COLORS.chaosMid : COLORS.chaosLo, 1).fillRoundedRect(x + 2, y + 2, Math.max(4, 84 * n), 14, 7);
    this.shhText.setPosition(c.x, y + 9);
    this.zzz.setPosition(c.x + 30 + Math.sin(this.now * 2) * 3, c.y - 30 - ((this.now * 8) % 10));
  }

  private renderHud() {
    const sim = this.sim;
    const g = this.top;
    g.clear();
    g.fillStyle(COLORS.hud, 1).fillRect(0, HUD.y, W, HUD.h);
    this.clockText.setText(sim.clock);
    // Chaos meter
    const cx = 176;
    const cw = 200;
    const ch = sim.chaos / 100;
    g.fillStyle(0x1d1f2b, 1).fillRoundedRect(cx, 20, cw, 22, 11);
    const col = ch < 0.5 ? COLORS.chaosLo : ch < 0.8 ? COLORS.chaosMid : COLORS.chaosHi;
    g.fillStyle(col, 1).fillRoundedRect(cx + 2, 22, Math.max(8, (cw - 4) * ch), 18, 9);
    if (ch >= 0.8) g.lineStyle(2, COLORS.chaosHi, 0.5 + 0.5 * Math.sin(this.now * 10)).strokeRoundedRect(cx, 20, cw, 22, 11);
    this.chaosText.setText(`${Math.floor(sim.chaos)}`);
    // Coffee meter
    const cf = sim.nick.coffee;
    g.fillStyle(0x1d1f2b, 1).fillRoundedRect(cx, 64, cw, 14, 7);
    g.fillStyle(cf < COFFEE.slowBelow ? COLORS.bad : COLORS.coffee, 1).fillRoundedRect(cx + 2, 66, Math.max(6, (cw - 4) * cf), 10, 5);
    g.lineStyle(1, 0xffffff, 0.3).lineBetween(cx + cw * COFFEE.slowBelow, 64, cx + cw * COFFEE.slowBelow, 78);
    // Hand slot (read-only)
    g.fillStyle(0x3d405b, 1).fillRoundedRect(50, 58, 110, 26, 8);
    if (!this.handIcon) {
      this.handIcon = this.add.graphics().setDepth(61);
      this.handLabel = this.txt(84, 71, '', 11, '#ffffff').setOrigin(0, 0.5).setDepth(61);
    }
    const h = sim.nick.hand;
    if (this.handKey !== `${h}`) {
      this.handKey = `${h}`;
      this.handIcon.clear();
      this.handIcon.setPosition(66, 71);
      if (h) drawIcon(this.handIcon, h === 'nora' ? 'nora' : h === 'phone' ? 'phone' : h, 18);
      this.handLabel.setText(h ? (h === 'nora' ? 'Nora' : h === 'phone' ? 'Phone' : h.replace('_', ' ')) : '—');
    }

    // Ability bar
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
  private handIcon?: Phaser.GameObjects.Graphics;
  private handLabel!: Phaser.GameObjects.Text;
  private handKey = '';

  private renderOverlays(dt: number) {
    const sim = this.sim;
    const g = this.fxTop;
    g.clear();
    // Dad-joke freeze tint.
    if (sim.frozen) g.fillStyle(0x8ecae6, 0.16).fillRect(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h);
    else if (this.jokeCard.visible && this.jokeCard.alpha === 1 && !this.tweens.isTweening(this.jokeCard)) {
      this.tweens.add({ targets: this.jokeCard, alpha: 0, duration: 200, onComplete: () => this.jokeCard.setVisible(false) });
    }
    // Smoke alarm flash.
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      const on = Math.floor(this.alarmT * 6) % 2 === 0;
      g.fillStyle(0xe5484d, on ? 0.22 : 0.06).fillRect(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h);
      this.alarmText.setVisible(on);
    } else this.alarmText.setVisible(false);

    // Toast
    if (this.toastT > 0) {
      this.toastT -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastT * 3));
      this.toastText.setY(sim.facetime.state === 'active' ? PANEL.y - 74 : PANEL.y - 14);
      if (this.toastT <= 0) this.toastText.setVisible(false);
    }
    // Texts
    if (this.textT > 0) {
      this.textT -= dt;
      if (this.textT <= 0) this.textBanner.setVisible(false);
    } else if (this.textQueue.length) {
      const m = this.textQueue.shift()!;
      this.textFrom.setText(m.from.toUpperCase() + '  ·  now');
      this.textBody.setText(m.body);
      this.textBanner.setVisible(true).setY(HOUSE.y - 40).setAlpha(0);
      this.tweens.add({ targets: this.textBanner, y: HOUSE.y + 6, alpha: 1, duration: 220, ease: 'Cubic.easeOut' });
      this.textT = 3;
    }
    // FaceTime
    const ft = sim.facetime.state === 'active';
    this.momWin.setVisible(ft);
    if (ft) this.momTime.setText(`0:${String(Math.max(0, Math.ceil(sim.facetime.left))).padStart(2, '0')}`);
    const pr = sim.facetime.prompt;
    this.uhHuh.setVisible(!!pr && this.running);
    if (pr) {
      const s = 1 + Math.sin(this.now * 12) * 0.03;
      this.uhHuh.setScale(s);
      const f = pr.left / 2.6;
      g.fillStyle(0xffffff, 0.9).fillRoundedRect(this.uhHuh.x - 80, this.uhHuh.y + 20, 160 * Math.max(0, f), 5, 2);
    }
    this.selectBanner.setVisible(this.panel.selectMode && this.running);
  }

  get summaryNames() {
    return KID_IDS.map((k) => CAST[k].name);
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

function drawSpot(g: Phaser.GameObjects.Graphics, s: StationId, x: number, y: number) {
  switch (s) {
    case 'spot_toolbox':
      g.fillStyle(0xd62828, 1).fillRoundedRect(x - 17, y - 8, 34, 20, 3);
      g.lineStyle(3, 0x22223b, 1).strokeRoundedRect(x - 8, y - 15, 16, 9, 3);
      g.fillStyle(0x22223b, 1).fillRect(x - 17, y - 1, 34, 2);
      break;
    case 'spot_bin':
      g.fillStyle(0x3a86ff, 1).fillRoundedRect(x - 18, y - 12, 36, 26, 4);
      g.fillStyle(0x2667cc, 1).fillRect(x - 20, y - 14, 40, 5);
      break;
    case 'spot_cooler':
      g.fillStyle(0xffffff, 1).fillRoundedRect(x - 18, y - 10, 36, 24, 4);
      g.fillStyle(0x4ea8de, 1).fillRoundedRect(x - 18, y - 14, 36, 8, 3);
      break;
    case 'spot_bike':
      g.lineStyle(3, 0x22223b, 1).strokeCircle(x - 12, y + 12, 10).strokeCircle(x + 14, y + 12, 10);
      g.lineBetween(x - 12, y + 12, x + 2, y - 2).lineBetween(x + 2, y - 2, x + 14, y + 12);
      g.fillStyle(0xc68b59, 1).fillRoundedRect(x - 22, y - 12, 18, 12, 3);
      break;
  }
}
