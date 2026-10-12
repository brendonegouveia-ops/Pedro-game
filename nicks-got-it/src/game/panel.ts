// The Action Panel: bottom-of-screen thumb zone where every gesture is resolved at a large size.
// When Nick has no gesture to do, it shows the to-do queue and what's in his free hand.
import Phaser from 'phaser';
import { GESTURES, ITEM_NAMES } from '../config';
import { STATIONS } from '../sim/house';
import { REQUEST_LABEL, type Interaction, type Sim, type Target } from '../sim/sim';
import { drawIcon } from './art';
import { COLORS, PANEL } from './layout';

type Btn = { x: number; y: number; w: number; h: number; on: () => void };

const HEADER_H = 50;

export class ActionPanel {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics; // per-frame widget drawing
  private texts: Phaser.GameObjects.GameObject[] = [];
  private sig = '';
  private buttons: Btn[] = [];

  // Gesture state
  private progress = 0;
  private holding = false;
  private rubLastX = 0;
  private rubLastY = 0;
  private rubFollowX = 0;
  private swipeStart: { x: number; y: number; t: number } | null = null;
  private mashTaps: number[] = [];
  private shakeT = 0;
  private now = 0;
  private flash = '';
  private flashT = 0;

  selectMode = false; // Call Kayla is waiting for a request to be picked
  onCancelSelect: () => void = () => {};

  constructor(
    private scene: Phaser.Scene,
    private sim: () => Sim,
    private txt: (x: number, y: number, s: string, size: number, color?: string, style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text,
  ) {
    this.root = scene.add.container(0, 0).setDepth(50);
    this.bg = scene.add.graphics();
    this.fx = scene.add.graphics();
    this.flashText = txt(PANEL.w / 2, PANEL.y + HEADER_H + 11, '', 13, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5).setDepth(51);
    this.root.add([this.bg, this.fx, this.flashText]);
  }
  private flashText: Phaser.GameObjects.Text;

  get active(): Interaction | null {
    return this.sim().interaction;
  }

  // ------------------------------------------------------------ input
  contains(_x: number, y: number) {
    return y >= PANEL.y && y < PANEL.y + PANEL.h;
  }

  pointerDown(x: number, y: number) {
    const it = this.active;
    // Buttons first (Not now, choices, chips, drop).
    const b = this.hit(x, y);
    if (b && (!it || it.kind === 'choice' || it.kind === 'multi' || y < PANEL.y + HEADER_H)) {
      b.on();
      return;
    }
    if (!it) return;
    const inWidget = y >= PANEL.y + HEADER_H - 6;
    if (!inWidget) return;
    switch (it.kind) {
      case 'tap':
        this.done();
        break;
      case 'hold':
        this.holding = true;
        break;
      case 'rub':
        this.holding = true;
        this.rubLastX = x;
        this.rubLastY = y;
        break;
      case 'swipe':
        this.swipeStart = { x, y, t: this.now };
        break;
      case 'mash':
        this.mash();
        break;
    }
  }

  pointerMove(x: number, y: number) {
    const it = this.active;
    if (!it) return;
    if (it.kind === 'rub' && this.holding) {
      const d = Math.min(80, Math.hypot(x - this.rubLastX, y - this.rubLastY));
      this.rubLastX = x;
      this.rubLastY = y;
      this.rubFollowX = x;
      this.progress = Math.min(1, this.progress + d / (it.rubPx ?? GESTURES.bandaidRubPx));
      if (this.progress >= 1) this.done();
    }
    if (it.kind === 'swipe' && this.swipeStart) this.trySwipe(x, y, false);
  }

  pointerUp(x: number, y: number) {
    const it = this.active;
    this.holding = false;
    if (it?.kind === 'swipe' && this.swipeStart) this.trySwipe(x, y, true);
    this.swipeStart = null;
  }

  // Keyboard: Space/Enter = tap, hold, mash, next kid. Arrows = swipe / rub. Z/X = choices.
  keyDown(code: string, repeat: boolean) {
    const it = this.active;
    if (!it) return false;
    if (code === 'Space' || code === 'Enter') {
      if (it.kind === 'tap') this.done();
      else if (it.kind === 'hold') this.holding = true;
      else if (it.kind === 'mash' && !repeat) this.mash();
      else if (it.kind === 'multi') {
        const i = it.multi!.findIndex((m) => !m.done);
        if (i >= 0) this.sim().tapMulti(i);
      } else return false;
      return true;
    }
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[code];
    if (dir && it.kind === 'swipe') {
      if (dir === it.dir) this.done();
      else this.wrong('Other way!');
      return true;
    }
    if (dir && it.kind === 'rub' && !repeat) {
      this.progress = Math.min(1, this.progress + 0.12);
      if (this.progress >= 1) this.done();
      return true;
    }
    if (it.kind === 'choice' && (code === 'KeyZ' || code === 'KeyX')) {
      this.sim().choose(code === 'KeyZ' ? 0 : 1);
      return true;
    }
    if (code === 'Backspace' || code === 'KeyN') {
      this.sim().skipInteraction();
      return true;
    }
    return false;
  }

  keyUp(code: string) {
    if (code === 'Space' || code === 'Enter') this.holding = false;
  }

  private hit(x: number, y: number): Btn | undefined {
    // Generous: grow every button to at least 44 x 44 around its center.
    return this.buttons.find((b) => {
      const w = Math.max(44, b.w);
      const h = Math.max(44, b.h);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
    });
  }

  private mash() {
    const it = this.active!;
    this.mashTaps.push(this.now);
    this.scene.events.emit('panel-sfx', 'tap');
    const win = it.mashWindow ?? GESTURES.flipMashWindowSec;
    this.mashTaps = this.mashTaps.filter((t) => this.now - t <= win);
    if (this.mashTaps.length >= (it.mashTaps ?? GESTURES.flipMashTaps)) this.done();
  }

  private trySwipe(x: number, y: number, final: boolean) {
    const it = this.active!;
    const s = this.swipeStart!;
    const dx = x - s.x;
    const dy = y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist < GESTURES.swipeMinPx) {
      if (final) this.swipeStart = null;
      return;
    }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    this.swipeStart = null;
    if (dir === it.dir) this.done();
    else this.wrong('Other way!');
  }

  private wrong(msg: string) {
    this.shakeT = 0.3;
    this.flash = msg;
    this.flashT = 0.9;
    this.scene.events.emit('panel-sfx', 'bad');
  }

  private done() {
    this.holding = false;
    this.progress = 0;
    this.mashTaps = [];
    this.sim().completeGesture();
  }

  // ------------------------------------------------------------ frame
  update(dt: number) {
    this.now += dt;
    const sim = this.sim();
    const it = sim.interaction;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flashT = Math.max(0, this.flashT - dt);

    const sig = it
      ? `i${it.id}|${it.kind}|${it.multi?.map((m) => +m.done).join('')}|${it.options?.map((o) => +o.enabled).join('')}`
      : `q${sim.queue.map((q) => q.id).join(',')}|${sim.nick.hand}|${this.selectMode}`;
    if (sig !== this.sig) {
      const newInteraction = it && !this.sig.startsWith(`i${it.id}|`);
      this.sig = sig;
      this.rebuild(newInteraction ? 'slide' : 'none');
    }

    if (it?.kind === 'hold') {
      const holdSec = it.holdSec ?? 1;
      if (this.holding) this.progress += dt / holdSec;
      else this.progress = Math.max(0, this.progress - GESTURES.holdDecayPerSec * dt);
      if (this.progress >= 1) {
        this.done();
        return;
      }
    }
    if (it?.kind === 'mash') {
      const win = it.mashWindow ?? GESTURES.flipMashWindowSec;
      this.mashTaps = this.mashTaps.filter((t) => this.now - t <= win);
      this.progress = this.mashTaps.length / (it.mashTaps ?? GESTURES.flipMashTaps);
    }
    this.drawWidget(it);
  }

  private clearTexts() {
    for (const t of this.texts) t.destroy();
    this.texts = [];
    this.buttons = [];
  }

  private addText(t: Phaser.GameObjects.Text) {
    this.root.add(t);
    this.texts.push(t);
    return t;
  }

  private addIcon(key: string, x: number, y: number, size: number) {
    const g = this.scene.add.graphics({ x, y });
    drawIcon(g, key, size);
    this.root.add(g);
    this.texts.push(g);
    return g;
  }

  private rebuild(anim: 'slide' | 'none') {
    this.clearTexts();
    this.progress = 0;
    this.holding = false;
    this.mashTaps = [];
    this.swipeStart = null;
    this.rubFollowX = PANEL.w / 2;
    const it = this.active;
    const g = this.bg;
    g.clear();
    const top = PANEL.y;
    if (it) {
      g.fillStyle(0x000000, 0.25).fillRoundedRect(6, top + 4, PANEL.w - 12, PANEL.h - 4, 18);
      g.fillStyle(COLORS.panel, 1).fillRoundedRect(6, top, PANEL.w - 12, PANEL.h - 6, 18);
      g.lineStyle(3, COLORS.accent, 1).strokeRoundedRect(6, top, PANEL.w - 12, PANEL.h - 6, 18);
      this.addIcon(it.icon, 34, top + 26, 30);
      this.addText(this.txt(58, top + 10, it.title, 19, '#22223b', { fontStyle: 'bold' }));
      this.addText(this.txt(58, top + 32, it.hint, 13, '#6c5f5b'));
      // "Not now" escape hatch: drop this job and move on.
      const nb = { x: PANEL.w - 84, y: top + 6, w: 72, h: 40, on: () => this.sim().skipInteraction() };
      this.buttons.push(nb);
      g.fillStyle(0xe8d5b0, 1).fillRoundedRect(nb.x, nb.y, nb.w, nb.h, 12);
      this.addText(this.txt(nb.x + nb.w / 2, nb.y + nb.h / 2, 'Not now', 13, '#3d405b').setOrigin(0.5));
      this.buildWidget(it);
      if (anim === 'slide') {
        this.root.y = 60;
        this.root.alpha = 0.4;
        this.scene.tweens.add({ targets: this.root, y: 0, alpha: 1, duration: 140, ease: 'Cubic.easeOut' });
      }
      return;
    }
    this.root.y = 0;
    this.root.alpha = 1;
    this.buildIdle();
  }

  private buildWidget(it: Interaction) {
    const cx = PANEL.w / 2;
    const cy = PANEL.y + HEADER_H + (PANEL.h - HEADER_H) / 2 - 4;
    const g = this.bg;
    switch (it.kind) {
      case 'choice': {
        const opts = it.options ?? [];
        const bw = 172;
        const bh = 128;
        opts.forEach((o, i) => {
          const x = cx - bw - 6 + i * (bw + 12);
          const y = cy - bh / 2;
          g.fillStyle(o.enabled ? 0xffffff : 0xece4d6, 1).fillRoundedRect(x, y, bw, bh, 16);
          g.lineStyle(3, o.enabled ? COLORS.ink : 0xc9bda8, 1).strokeRoundedRect(x, y, bw, bh, 16);
          const ic = this.addIcon(o.icon, x + bw / 2, y + 34, 38);
          ic.alpha = o.enabled ? 1 : 0.35;
          this.addText(
            this.txt(x + bw / 2, y + 70, o.label, 17, o.enabled ? '#22223b' : '#a39b8b', {
              fontStyle: 'bold',
              align: 'center',
              wordWrap: { width: bw - 16 },
            }).setOrigin(0.5, 0),
          );
          this.addText(
            this.txt(x + bw / 2, y + bh - 22, o.sub, 12, o.enabled ? '#6c5f5b' : '#a39b8b', { align: 'center' }).setOrigin(0.5, 0),
          );
          this.buttons.push({ x, y, w: bw, h: bh, on: () => o.enabled && this.sim().choose(i) });
        });
        break;
      }
      case 'multi': {
        const m = it.multi ?? [];
        const bw = Math.min(172, (PANEL.w - 40) / m.length - 8);
        const bh = 128;
        m.forEach((k, i) => {
          const x = cx - (m.length * (bw + 12) - 12) / 2 + i * (bw + 12);
          const y = cy - bh / 2;
          g.fillStyle(k.done ? 0xd8f3dc : 0xffffff, 1).fillRoundedRect(x, y, bw, bh, 16);
          g.lineStyle(3, k.done ? COLORS.good : COLORS.ink, 1).strokeRoundedRect(x, y, bw, bh, 16);
          this.addText(this.txt(x + bw / 2, y + bh / 2 - 12, k.label, 22, '#22223b', { fontStyle: 'bold' }).setOrigin(0.5));
          this.addText(this.txt(x + bw / 2, y + bh / 2 + 18, k.done ? '✓ Okay.' : 'TAP', 15, k.done ? '#2a9d8f' : '#6c5f5b').setOrigin(0.5));
          this.buttons.push({ x, y, w: bw, h: bh, on: () => !k.done && this.sim().tapMulti(i) });
        });
        break;
      }
      case 'swipe':
        this.addText(this.txt(cx, cy + 62, `SWIPE ${it.dir?.toUpperCase()}`, 15, '#6c5f5b', { fontStyle: 'bold' }).setOrigin(0.5));
        break;
      case 'tap':
        this.addText(this.txt(cx, cy + 66, 'TAP', 15, '#6c5f5b', { fontStyle: 'bold' }).setOrigin(0.5));
        break;
      case 'hold':
        this.addText(this.txt(cx, cy + 66, `HOLD ${it.holdSec}s`, 15, '#6c5f5b', { fontStyle: 'bold' }).setOrigin(0.5));
        break;
      case 'mash':
        this.addText(this.txt(cx - 120, cy - 6, 'TAP\nTAP\nTAP', 14, '#6c5f5b', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5));
        this.addText(this.txt(cx + 120, cy - 6, `×${it.mashTaps}\nfast`, 14, '#6c5f5b', { fontStyle: 'bold', align: 'center' }).setOrigin(0.5));
        break;
      case 'rub':
        this.addText(this.txt(cx, cy + 66, 'RUB ← →', 15, '#6c5f5b', { fontStyle: 'bold' }).setOrigin(0.5));
        break;
    }
    if (it.kind !== 'choice' && it.kind !== 'multi') {
      const ic = this.addIcon(it.icon, cx, cy - 6, 52);
      ic.setName('bigIcon');
    }
  }

  private drawWidget(it: Interaction | null) {
    const g = this.fx;
    g.clear();
    const cx = PANEL.w / 2 + (this.shakeT > 0 ? Math.sin(this.now * 70) * 6 : 0);
    const cy = PANEL.y + HEADER_H + (PANEL.h - HEADER_H) / 2 - 4;
    this.flashText.setVisible(this.flashT > 0).setText(this.flash);
    if (this.flashT > 0) {
      g.fillStyle(COLORS.bad, Math.min(1, this.flashT * 2)).fillRoundedRect(PANEL.w / 2 - 70, PANEL.y + HEADER_H - 2, 140, 26, 10);
    }
    if (!it) return;
    const big = this.texts.find((t) => t.name === 'bigIcon') as Phaser.GameObjects.Graphics | undefined;
    switch (it.kind) {
      case 'tap': {
        const pulse = 1 + Math.sin(this.now * 8) * 0.04;
        g.fillStyle(COLORS.accent, 0.25).fillCircle(cx, cy - 6, 56 * pulse);
        g.lineStyle(4, COLORS.accent, 1).strokeCircle(cx, cy - 6, 50 * pulse);
        if (big) big.x = cx;
        break;
      }
      case 'hold':
      case 'mash': {
        const r = 52;
        g.fillStyle(this.holding ? 0xffe0c2 : 0xffffff, 1).fillCircle(cx, cy - 6, r);
        g.lineStyle(10, 0xe8d5b0, 1).strokeCircle(cx, cy - 6, r);
        if (this.progress > 0) {
          g.lineStyle(10, it.kind === 'hold' ? COLORS.good : COLORS.accent, 1);
          g.beginPath();
          g.arc(cx, cy - 6, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.progress), false);
          g.strokePath();
        }
        if (it.kind === 'mash') {
          const n = it.mashTaps ?? 7;
          for (let i = 0; i < n; i++) {
            g.fillStyle(i < this.mashTaps.length ? COLORS.accent : 0xd6c6a8, 1);
            g.fillCircle(cx + (i - (n - 1) / 2) * 20, cy + 66, 6);
          }
        }
        if (big) {
          big.x = cx;
          big.setScale(this.holding || (it.kind === 'mash' && this.mashTaps.length) ? 0.92 : 1);
        }
        break;
      }
      case 'rub': {
        g.fillStyle(SKIN_PAD, 1).fillRoundedRect(30, cy - 44, PANEL.w - 60, 80, 30);
        g.fillStyle(0xe5484d, 0.6 * (1 - this.progress)).fillCircle(PANEL.w / 2, cy - 4, 14);
        g.fillStyle(0xe8d5b0, 1).fillRoundedRect(40, cy + 46, PANEL.w - 80, 10, 5);
        g.fillStyle(COLORS.good, 1).fillRoundedRect(40, cy + 46, (PANEL.w - 80) * this.progress, 10, 5);
        if (big) {
          big.x = Phaser.Math.Clamp(this.rubFollowX || PANEL.w / 2, 60, PANEL.w - 60);
          big.y = cy - 4;
        }
        break;
      }
      case 'swipe': {
        const d = it.dir ?? 'down';
        const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d];
        const t = (this.now * 1.6) % 1;
        g.fillStyle(0x3a86ff, 0.18).fillRoundedRect(cx - 110, cy - 58, 220, 104, 20);
        for (let i = 0; i < 3; i++) {
          const k = ((t + i / 3) % 1) - 0.5;
          const ax = cx + v[0] * k * 120;
          const ay = cy - 6 + v[1] * k * 70;
          arrow(g, ax, ay, v[0], v[1], 16, 0x3a86ff, 1 - Math.abs(k) * 1.6);
        }
        if (big) {
          big.x = cx - v[0] * 70;
          big.y = cy - 6 - v[1] * 24;
          big.setScale(0.7);
        }
        break;
      }
    }
  }

  private buildIdle() {
    const sim = this.sim();
    const g = this.bg;
    const top = PANEL.y;
    g.fillStyle(0x2b2d42, 0.92).fillRoundedRect(6, top, PANEL.w - 12, PANEL.h - 6, 18);
    if (this.selectMode) {
      g.lineStyle(3, 0xe76f51, 1).strokeRoundedRect(6, top, PANEL.w - 12, PANEL.h - 6, 18);
      this.addIcon('kayla', 40, top + 60, 40);
      this.addText(this.txt(70, top + 34, 'Call Kayla', 20, '#ffffff', { fontStyle: 'bold' }));
      this.addText(this.txt(70, top + 62, 'Tap the request she should handle.', 14, '#f2e9e4', { wordWrap: { width: 290 } }));
      const b = { x: 120, y: top + 130, w: 150, h: 52, on: () => this.onCancelSelect() };
      g.fillStyle(0x4a4e69, 1).fillRoundedRect(b.x, b.y, b.w, b.h, 14);
      this.addText(this.txt(b.x + b.w / 2, b.y + b.h / 2, 'Never mind', 16, '#ffffff').setOrigin(0.5));
      this.buttons.push(b);
      return;
    }
    this.addText(this.txt(20, top + 12, 'TO-DO', 12, '#c9c9d6', { fontStyle: 'bold' }));
    this.addText(this.txt(PANEL.w - 20, top + 12, 'tap a chip to cancel', 11, '#8d8fa8').setOrigin(1, 0));
    const cw = 84;
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * (cw + 8);
      const y = top + 32;
      const q = sim.queue[i];
      if (!q) {
        g.lineStyle(2, 0x4a4e69, 1).strokeRoundedRect(x, y, cw, 72, 12);
        this.addText(this.txt(x + cw / 2, y + 36, `${i + 1}`, 18, '#4a4e69', { fontStyle: 'bold' }).setOrigin(0.5));
        continue;
      }
      g.fillStyle(0xfff4e0, 1).fillRoundedRect(x, y, cw, 72, 12);
      g.fillStyle(COLORS.marker, 1).fillCircle(x + 14, y + 14, 11);
      this.addText(this.txt(x + 14, y + 14, `${i + 1}`, 13, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
      const { icon, label } = describeTarget(sim, q.target);
      this.addIcon(icon, x + cw / 2, y + 30, 24);
      this.addText(this.txt(x + cw / 2, y + 56, label, 11, '#22223b', { align: 'center', fixedWidth: cw - 6 }).setOrigin(0.5));
      this.addText(this.txt(x + cw - 12, y + 12, '✕', 13, '#9a8c98').setOrigin(0.5));
      this.buttons.push({ x, y, w: cw, h: 72, on: () => this.sim().cancelQueue(q.id) });
    }
    // Free hand
    const hy = top + 118;
    const h = sim.nick.hand;
    this.addText(this.txt(20, hy + 4, 'FREE HAND', 12, '#c9c9d6', { fontStyle: 'bold' }));
    g.fillStyle(0x3d405b, 1).fillRoundedRect(16, hy + 22, 210, 56, 14);
    if (h) {
      this.addIcon(h === 'nora' ? 'nora' : h === 'phone' ? 'phone' : h, 46, hy + 50, 30);
      const label = h === 'nora' ? 'Nora (on the hip)' : h === 'phone' ? 'Phone (your mother-in-law)' : ITEM_NAMES[h];
      this.addText(this.txt(70, hy + 50, label, 14, '#ffffff', { wordWrap: { width: 150 } }).setOrigin(0, 0.5));
    } else {
      this.addText(this.txt(30, hy + 50, 'Empty. (Other hand: coffee.)', 13, '#8d8fa8').setOrigin(0, 0.5));
    }
    if (h && h !== 'nora' && h !== 'phone') {
      const b = { x: 236, y: hy + 22, w: 138, h: 56, on: () => this.sim().dropHand() };
      g.fillStyle(0x4a4e69, 1).fillRoundedRect(b.x, b.y, b.w, b.h, 14);
      this.addText(this.txt(b.x + b.w / 2, b.y + b.h / 2, 'Put it down', 15, '#ffffff').setOrigin(0.5));
      this.buttons.push(b);
    } else {
      this.addText(
        this.txt(300, hy + 50, sim.queue.length ? 'On it.' : 'Tap a bubble,\na station or a room.', 12, '#8d8fa8', { align: 'center' }).setOrigin(0.5),
      );
    }
  }
}

const SKIN_PAD = 0xf6d2b4;

function arrow(g: Phaser.GameObjects.Graphics, x: number, y: number, vx: number, vy: number, s: number, c: number, a: number) {
  if (a <= 0) return;
  const px = -vy;
  const py = vx;
  g.lineStyle(s * 0.55, c, a);
  g.lineBetween(x - vx * s * 1.4, y - vy * s * 1.4, x, y);
  g.fillStyle(c, a);
  g.fillTriangle(x + vx * s, y + vy * s, x + px * s * 0.9, y + py * s * 0.9, x - px * s * 0.9, y - py * s * 0.9);
}

export function describeTarget(sim: Sim, t: Target): { icon: string; label: string } {
  if (t.t === 'room') return { icon: 'door', label: { kitchen: 'Kitchen', living: 'Living rm', garage: 'Garage', backyard: 'Backyard' }[t.room] };
  if (t.t === 'station') {
    const s = t.station;
    const icon =
      { coffee: 'coffee', snacks: 'snack', juice: 'juice_box', sippy: 'sippy_cup', bandaids: 'bandaid', thermostat: 'thermostat', grill: 'burger', door: 'door', highchair: 'nora', playpen: 'nora' }[
        s as string
      ] ?? 'shoe';
    return { icon, label: STATIONS[s].label };
  }
  const r = sim.req(t.req);
  if (!r) return { icon: 'no', label: 'Gone' };
  return { icon: r.kind, label: REQUEST_LABEL[r.kind] };
}
