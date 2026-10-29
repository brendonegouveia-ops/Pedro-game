// The action pad: right half of the bottom deck. It shows the job Nick is standing next to and
// resolves it with a big gesture. Starting a gesture locks Nick in place (sim.engage).
// With nothing in reach it shows what's in his free hand and a hint.
import Phaser from 'phaser';
import { GESTURES, ITEM_NAMES } from '../config';
import { type Interaction, type Sim } from '../sim/sim';
import { drawIcon } from './art';
import { COLORS, PANEL } from './layout';

type Btn = { x: number; y: number; w: number; h: number; on: () => void };
type Txt = (x: number, y: number, s: string, size: number, color?: string, style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;

const HEADER_H = 40;
const R = 36; // big button radius
const L = PANEL.x;
const T = PANEL.y;
const CX = PANEL.x + PANEL.w / 2;
const CY = PANEL.y + HEADER_H + (PANEL.h - HEADER_H) / 2 - 8; // widget center

export class ActionPanel {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private fx: Phaser.GameObjects.Graphics;
  private flashText: Phaser.GameObjects.Text;
  private texts: Phaser.GameObjects.GameObject[] = [];
  private sig = '';
  private buttons: Btn[] = [];

  private progress = 0;
  private holding = false;
  private rubLastX = 0;
  private rubLastY = 0;
  private rubFollowX = CX;
  private swipeStart: { x: number; y: number } | null = null;
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
    private txt: Txt,
  ) {
    this.root = scene.add.container(0, 0).setDepth(50);
    this.bg = scene.add.graphics();
    this.fx = scene.add.graphics();
    this.flashText = txt(CX, T + HEADER_H + 4, '', 12, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5);
    this.root.add([this.bg, this.fx, this.flashText]);
  }

  get active(): Interaction | null {
    return this.sim().interaction;
  }

  contains(x: number, y: number) {
    return x >= PANEL.x - 4 && x < PANEL.x + PANEL.w + 6 && y >= PANEL.y - 2 && y < PANEL.y + PANEL.h + 2;
  }

  // ------------------------------------------------------------ input
  pointerDown(x: number, y: number) {
    const it = this.active;
    const b = this.hit(x, y);
    if (b && (!it || it.kind === 'choice' || it.kind === 'multi')) {
      b.on();
      return;
    }
    if (!it) return;
    switch (it.kind) {
      case 'tap':
        this.done();
        break;
      case 'hold':
        this.holding = true;
        this.sim().engage(true);
        break;
      case 'rub':
        this.holding = true;
        this.rubLastX = x;
        this.rubLastY = y;
        this.sim().engage(true);
        break;
      case 'swipe':
        this.swipeStart = { x, y };
        this.sim().engage(true);
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
      // The pad is narrower than a full-width panel, so each px of rubbing counts a bit more.
      this.progress = Math.min(1, this.progress + (d * 1.5) / (it.rubPx ?? GESTURES.bandaidRubPx));
      if (this.progress >= 1) this.done();
    }
    if (it.kind === 'swipe' && this.swipeStart) this.trySwipe(x, y, false);
  }

  pointerUp(x: number, y: number) {
    const it = this.active;
    this.holding = false;
    if (it?.kind === 'swipe' && this.swipeStart) this.trySwipe(x, y, true);
    this.swipeStart = null;
    if (it?.kind !== 'mash') this.sim().engage(false);
  }

  // Keyboard: Space/Enter = tap, hold, mash, next kid. Arrows = swipe / rub. Z/X = choices.
  keyDown(code: string, repeat: boolean) {
    const it = this.active;
    if (!it) return false;
    if (code === 'Space' || code === 'Enter') {
      if (it.kind === 'tap') this.done();
      else if (it.kind === 'hold') {
        this.holding = true;
        this.sim().engage(true);
      } else if (it.kind === 'mash' && !repeat) this.mash();
      else if (it.kind === 'multi') {
        const i = it.multi!.findIndex((m) => !m.done);
        if (i >= 0) this.sim().tapMulti(i);
      } else if (it.kind === 'choice') {
        const i = it.options!.findIndex((o) => o.enabled);
        if (i >= 0) this.sim().choose(i);
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
    return false;
  }

  keyUp(code: string) {
    if (code === 'Space' || code === 'Enter') {
      this.holding = false;
      if (this.active?.kind === 'hold') this.sim().engage(false);
    }
  }

  private hit(x: number, y: number): Btn | undefined {
    return this.buttons.find((b) => {
      const w = Math.max(44, b.w);
      const h = Math.max(44, b.h);
      return Math.abs(x - (b.x + b.w / 2)) <= w / 2 && Math.abs(y - (b.y + b.h / 2)) <= h / 2;
    });
  }

  private mash() {
    const it = this.active!;
    this.mashTaps.push(this.now);
    this.sim().engage(true);
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
    if (Math.hypot(dx, dy) < GESTURES.swipeMinPx * 0.8) {
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
      : `n|${sim.nick.hand}|${this.selectMode}|${sim.note}`;
    if (sig !== this.sig) {
      const fresh = it && !this.sig.startsWith(`i${it.id}|`);
      this.sig = sig;
      this.rebuild(!!fresh);
    }

    if (it?.kind === 'hold') {
      if (this.holding) this.progress += dt / (it.holdSec ?? 1);
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
      if (sim.engaged && !this.mashTaps.some((t) => this.now - t < 0.8)) sim.engage(false);
    }
    this.draw(it);
  }

  private clear() {
    for (const t of this.texts) t.destroy();
    this.texts = [];
    this.buttons = [];
  }

  private addText(t: Phaser.GameObjects.Text) {
    this.root.add(t);
    this.texts.push(t);
    return t;
  }

  private addIcon(key: string, x: number, y: number, size: number, name = '') {
    const g = this.scene.add.graphics({ x, y });
    drawIcon(g, key, size);
    g.setName(name);
    this.root.add(g);
    this.texts.push(g);
    return g;
  }

  private rebuild(slide: boolean) {
    this.clear();
    this.progress = 0;
    this.holding = false;
    this.mashTaps = [];
    this.swipeStart = null;
    this.rubFollowX = CX;
    const it = this.active;
    const g = this.bg;
    g.clear();
    if (!it) {
      this.root.y = 0;
      this.root.alpha = 1;
      return this.buildIdle();
    }
    g.fillStyle(0x000000, 0.25).fillRoundedRect(L, T + 3, PANEL.w, PANEL.h, 16);
    g.fillStyle(COLORS.panel, 1).fillRoundedRect(L, T, PANEL.w, PANEL.h, 16);
    g.lineStyle(3, COLORS.accent, 1).strokeRoundedRect(L, T, PANEL.w, PANEL.h, 16);
    this.addIcon(it.icon, L + 20, T + 20, 22);
    this.addText(this.txt(L + 36, T + 5, it.title, 13, '#22223b', { fontStyle: 'bold', wordWrap: { width: PANEL.w - 44 }, maxLines: 2 }));
    this.addText(this.txt(L + 36, T + 23, it.hint, 10, '#6c5f5b'));
    this.buildWidget(it);
    if (slide) {
      this.root.y = 30;
      this.root.alpha = 0.4;
      this.scene.tweens.add({ targets: this.root, y: 0, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    }
  }

  private buildWidget(it: Interaction) {
    const g = this.bg;
    const bw = PANEL.w - 16;
    const top = T + HEADER_H + 2;
    const bh = (PANEL.h - HEADER_H - 10) / 2 - 3;
    if (it.kind === 'choice' || it.kind === 'multi') {
      const rows =
        it.kind === 'choice'
          ? (it.options ?? []).map((o, i) => ({ label: o.label, sub: o.sub, icon: o.icon, ok: o.enabled, done: false, on: () => o.enabled && this.sim().choose(i) }))
          : (it.multi ?? []).map((m, i) => ({ label: m.label, sub: m.done ? '✓ Okay.' : 'Tap', icon: 'fight', ok: !m.done, done: m.done, on: () => !m.done && this.sim().tapMulti(i) }));
      rows.forEach((r, i) => {
        const x = L + 8;
        const y = top + i * (bh + 6);
        g.fillStyle(r.done ? 0xd8f3dc : r.ok ? 0xffffff : 0xece4d6, 1).fillRoundedRect(x, y, bw, bh, 12);
        g.lineStyle(2.5, r.done ? COLORS.good : r.ok ? COLORS.ink : 0xc9bda8, 1).strokeRoundedRect(x, y, bw, bh, 12);
        if (it.kind === 'choice') this.addIcon(r.icon, x + 22, y + bh / 2, 22).setAlpha(r.ok ? 1 : 0.35);
        const tx = it.kind === 'choice' ? x + 42 : x + 12;
        this.addText(this.txt(tx, y + 7, r.label, 14, r.ok || r.done ? '#22223b' : '#a39b8b', { fontStyle: 'bold' }));
        this.addText(this.txt(tx, y + bh - 18, r.sub, 10, r.ok ? '#6c5f5b' : r.done ? '#2a9d8f' : '#a39b8b'));
        this.buttons.push({ x, y, w: bw, h: bh, on: r.on });
      });
      return;
    }
    const label: Record<string, string> = {
      tap: 'TAP',
      hold: `HOLD ${it.holdSec}s`,
      swipe: `SWIPE ${it.dir?.toUpperCase()}`,
      rub: 'RUB ← →',
      mash: '',
    };
    if (label[it.kind]) this.addText(this.txt(CX, CY + R + 14, label[it.kind], 11, '#6c5f5b', { fontStyle: 'bold' }).setOrigin(0.5));
    this.addIcon(it.icon, CX, CY, 34, 'big');
  }

  private draw(it: Interaction | null) {
    const g = this.fx;
    g.clear();
    this.flashText.setVisible(this.flashT > 0).setText(this.flash);
    if (this.flashT > 0) g.fillStyle(COLORS.bad, Math.min(1, this.flashT * 2)).fillRoundedRect(CX - 60, T + HEADER_H - 7, 120, 22, 9);
    if (!it) return;
    const cx = CX + (this.shakeT > 0 ? Math.sin(this.now * 70) * 5 : 0);
    const big = this.texts.find((t) => t.name === 'big') as Phaser.GameObjects.Graphics | undefined;
    switch (it.kind) {
      case 'tap': {
        const p = 1 + Math.sin(this.now * 8) * 0.04;
        g.fillStyle(COLORS.accent, 0.25).fillCircle(cx, CY, (R + 6) * p);
        g.lineStyle(4, COLORS.accent, 1).strokeCircle(cx, CY, R * p);
        break;
      }
      case 'hold':
      case 'mash': {
        g.fillStyle(this.holding ? 0xffe0c2 : 0xffffff, 1).fillCircle(cx, CY, R);
        g.lineStyle(8, 0xe8d5b0, 1).strokeCircle(cx, CY, R);
        if (this.progress > 0) {
          g.lineStyle(8, it.kind === 'hold' ? COLORS.good : COLORS.accent, 1);
          g.beginPath();
          g.arc(cx, CY, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.progress), false);
          g.strokePath();
        }
        if (it.kind === 'mash') {
          const n = it.mashTaps ?? 7;
          for (let i = 0; i < n; i++) {
            g.fillStyle(i < this.mashTaps.length ? COLORS.accent : 0xd6c6a8, 1);
            g.fillCircle(cx + (i - (n - 1) / 2) * 16, CY + R + 14, 4.5);
          }
        }
        big?.setScale(this.holding || (it.kind === 'mash' && this.mashTaps.length) ? 0.92 : 1);
        break;
      }
      case 'rub': {
        g.fillStyle(0xf6d2b4, 1).fillRoundedRect(L + 10, CY - 30, PANEL.w - 20, 56, 24);
        g.fillStyle(0xe5484d, 0.6 * (1 - this.progress)).fillCircle(CX, CY - 2, 10);
        g.fillStyle(0xe8d5b0, 1).fillRoundedRect(L + 14, CY + 32, PANEL.w - 28, 7, 3);
        g.fillStyle(COLORS.good, 1).fillRoundedRect(L + 14, CY + 32, (PANEL.w - 28) * this.progress, 7, 3);
        if (big) {
          big.x = Phaser.Math.Clamp(this.rubFollowX, L + 30, L + PANEL.w - 30);
          big.setScale(0.8);
        }
        break;
      }
      case 'swipe': {
        const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[it.dir ?? 'down'];
        const t = (this.now * 1.6) % 1;
        g.fillStyle(0x3a86ff, 0.18).fillRoundedRect(L + 10, CY - 40, PANEL.w - 20, 80, 16);
        for (let i = 0; i < 3; i++) {
          const k = ((t + i / 3) % 1) - 0.5;
          arrow(g, cx + v[0] * k * 120, CY + v[1] * k * 50, v[0], v[1], 13, 0x3a86ff, 1 - Math.abs(k) * 1.6);
        }
        if (big) {
          big.x = cx - v[0] * 60;
          big.y = CY - v[1] * 18;
          big.setScale(0.6);
        }
        break;
      }
    }
  }

  private buildIdle() {
    const sim = this.sim();
    const g = this.bg;
    g.fillStyle(0x2b2d42, 0.95).fillRoundedRect(L, T, PANEL.w, PANEL.h, 16);
    if (this.selectMode) {
      g.lineStyle(3, 0xe76f51, 1).strokeRoundedRect(L, T, PANEL.w, PANEL.h, 16);
      this.addIcon('kayla', L + 24, T + 28, 28);
      this.addText(this.txt(L + 46, T + 14, 'Call Kayla', 16, '#ffffff', { fontStyle: 'bold' }));
      this.addText(this.txt(L + 12, T + 52, 'Tap the request she should handle.', 12, '#f2e9e4', { wordWrap: { width: PANEL.w - 24 } }));
      const b = { x: L + 12, y: T + PANEL.h - 54, w: PANEL.w - 24, h: 44, on: () => this.onCancelSelect() };
      g.fillStyle(0x4a4e69, 1).fillRoundedRect(b.x, b.y, b.w, b.h, 12);
      this.addText(this.txt(b.x + b.w / 2, b.y + b.h / 2, 'Never mind', 15, '#ffffff').setOrigin(0.5));
      this.buttons.push(b);
      return;
    }
    const h = sim.nick.hand;
    this.addText(this.txt(L + 12, T + 8, 'FREE HAND', 10, '#c9c9d6', { fontStyle: 'bold' }));
    g.fillStyle(0x3d405b, 1).fillRoundedRect(L + 8, T + 24, PANEL.w - 16, 40, 12);
    if (h) {
      this.addIcon(h === 'nora' ? 'nora' : h === 'phone' ? 'phone' : h, L + 30, T + 44, 22);
      const label = h === 'nora' ? 'Nora (on the hip)' : h === 'phone' ? 'Phone (mother-in-law)' : ITEM_NAMES[h];
      this.addText(this.txt(L + 48, T + 44, label, 13, '#ffffff').setOrigin(0, 0.5));
    } else {
      this.addText(this.txt(L + 18, T + 44, 'Empty. (Other: coffee.)', 12, '#8d8fa8').setOrigin(0, 0.5));
    }
    let y = T + 70;
    if (h && h !== 'nora' && h !== 'phone') {
      const b = { x: L + 8, y, w: PANEL.w - 16, h: 36, on: () => this.sim().dropHand() };
      g.fillStyle(0x4a4e69, 1).fillRoundedRect(b.x, b.y, b.w, b.h, 12);
      this.addText(this.txt(b.x + b.w / 2, b.y + b.h / 2, 'Put it down', 14, '#ffffff').setOrigin(0.5));
      this.buttons.push(b);
      y += 42;
    }
    const line = sim.note ?? 'Walk with the arrows. Stand next to a kid or a station to help.';
    this.addText(
      this.txt(CX, (y + T + PANEL.h) / 2, line, sim.note ? 13 : 11, sim.note ? '#ffd166' : '#a5a7c4', {
        align: 'center',
        wordWrap: { width: PANEL.w - 20 },
        fontStyle: sim.note ? 'bold' : 'normal',
      }).setOrigin(0.5),
    );
  }
}

function arrow(g: Phaser.GameObjects.Graphics, x: number, y: number, vx: number, vy: number, s: number, c: number, a: number) {
  if (a <= 0) return;
  const px = -vy;
  const py = vx;
  g.lineStyle(s * 0.55, c, a);
  g.lineBetween(x - vx * s * 1.4, y - vy * s * 1.4, x, y);
  g.fillStyle(c, a);
  g.fillTriangle(x + vx * s, y + vy * s, x + px * s * 0.9, y + py * s * 0.9, x - px * s * 0.9, y - py * s * 0.9);
}
