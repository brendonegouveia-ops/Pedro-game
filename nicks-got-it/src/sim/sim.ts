// Pure game simulation: no Phaser, no DOM. The scene renders it and forwards input;
// tests drive it headlessly. All times are seconds (1 s == 1 game minute).
import {
  ABILITIES,
  CHAOS,
  COFFEE,
  CRY,
  DAD_JOKES,
  DOG,
  FACETIME,
  FIGHT,
  FIRST_REQUEST_SEC,
  GAME,
  GESTURES,
  GRILL,
  GROANS,
  ITEM_NAMES,
  KAYLA_CALL_REPLIES,
  MELTDOWN_DELAY_SEC,
  MOVE,
  NAP,
  NICK_LINES,
  PATIENCE,
  RATE_AFTER_3PM_PER_HOUR,
  REQUEST_GAP,
  REQUEST_WEIGHTS,
  TEXTS,
  THERMOSTAT,
  TIMELINE,
  UPPY,
  WANDER,
  CAST,
} from '../config';
import {
  COUCH_POS,
  DOOR_WAIT_POS,
  NICK_START,
  SHOE_SPOTS,
  STATIONS,
  STATION_IDS,
  dist,
  floorPoint,
  hops,
  moveCircle,
  neighbors,
  roomAt,
  steer,
  type RoomId,
  type StationId,
} from './house';
import { Rng } from './rng';

export type KidId = 'evelyn' | 'nora' | 'tyler';
export type ActorId = KidId | 'eloise';
export const KID_IDS: KidId[] = ['evelyn', 'nora', 'tyler'];

export type ItemId = 'snack' | 'juice_box' | 'sippy_cup' | 'bandaid';
export type Hand = ItemId | 'nora' | 'phone' | null;

export type RequestKind =
  | 'diaper'
  | 'sippy_cup'
  | 'uppy'
  | 'snack'
  | 'juice_box'
  | 'watch_this'
  | 'booboo'
  | 'lost_shoe'
  | 'screen_time'
  | 'fight'
  | 'spill'
  | 'needs_out'
  | 'flip'
  | 'thermostat';

export type Dir = 'left' | 'right' | 'up' | 'down';

export interface Request {
  id: number;
  kind: RequestKind;
  owner: ActorId | 'grill' | 'house';
  room: RoomId;
  patience: number;
  left: number; // Infinity = never expires (thermostat)
  kids?: KidId[]; // fight participants
  spots?: StationId[]; // lost_shoe
  checked?: StationId[];
  culprit?: ActorId; // thermostat
  x?: number; // spill position (world)
  y?: number;
  dir?: Dir; // spill swipe direction
}

export type Target = { t: 'station'; station: StationId } | { t: 'request'; req: number } | { t: 'kid'; kid: KidId };

export type GestureKind = 'tap' | 'hold' | 'rub' | 'swipe' | 'mash' | 'choice' | 'multi';

export interface ChoiceOption {
  label: string;
  sub: string;
  enabled: boolean;
  icon: string;
}

export interface Interaction {
  id: number;
  key: string; // identifies target + context; same key = same job, keep its state
  target: Target;
  req?: number;
  kind: GestureKind;
  title: string;
  hint: string;
  icon: string;
  holdSec?: number;
  rubPx?: number;
  dir?: Dir;
  mashTaps?: number;
  mashWindow?: number;
  options?: ChoiceOption[];
  multi?: { label: string; actor: ActorId; done: boolean }[];
}

export interface Actor {
  id: ActorId;
  present: boolean;
  room: RoomId;
  x: number;
  y: number;
  state: 'idle' | 'crying' | 'asleep' | 'carried' | 'outside';
  cryLeft: number;
  req: number | null;
  nextReq: number;
  nextWander: number;
  meltdownAt: number | null;
  dest: { x: number; y: number } | null; // walking toward
  speech: string | null;
  speechLeft: number;
}

export type SfxName =
  | 'groan'
  | 'alarm'
  | 'cry'
  | 'sizzle'
  | 'bark'
  | 'tap'
  | 'good'
  | 'bad'
  | 'ding'
  | 'ring'
  | 'whoosh'
  | 'pop';

export type SimEvent =
  | { type: 'toast'; text: string }
  | { type: 'text'; from: string; body: string }
  | { type: 'sfx'; name: SfxName }
  | { type: 'shake'; strength: number }
  | { type: 'haptic'; pattern: number | number[] }
  | { type: 'joke'; text: string }
  | { type: 'resolved'; req: Request }
  | { type: 'expired'; req: Request }
  | { type: 'nora_woke' }
  | { type: 'gameover' };

export type ChaosCause = 'cry' | 'smoke' | 'thermostat' | 'facetime' | 'nap' | 'default';

export interface Stats {
  handled: number;
  expired: number;
  cries: number;
  smokeAlarms: number;
  jokes: number;
  kaylaCalls: number;
  dirt: number;
  screenYes: number;
  coffeeRefills: number;
}

const FETCH_ITEM: Partial<Record<RequestKind, ItemId>> = {
  snack: 'snack',
  juice_box: 'juice_box',
  sippy_cup: 'sippy_cup',
};
const STATION_ITEM: Partial<Record<StationId, ItemId>> = {
  snacks: 'snack',
  juice: 'juice_box',
  sippy: 'sippy_cup',
  bandaids: 'bandaid',
};

export const REQUEST_LABEL: Record<RequestKind, string> = {
  diaper: 'Diaper',
  sippy_cup: 'Sippy cup',
  uppy: 'Uppy!',
  snack: 'Snack',
  juice_box: 'Juice box',
  watch_this: 'Watch this!',
  booboo: 'Boo-boo',
  lost_shoe: 'Lost shoe',
  screen_time: 'Screen time?',
  fight: 'Fight!',
  spill: 'Spill',
  needs_out: 'Needs out',
  flip: 'Flip!',
  thermostat: 'Thermostat',
};

type Built = Omit<Interaction, 'id' | 'key'>;

export function clockString(t: number): string {
  const total = GAME.startHour * 60 + Math.floor(t);
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export class Sim {
  readonly rng: Rng;
  t = 0;
  chaos = 0;
  over = false;
  chaosBy: Record<ChaosCause, number> = { cry: 0, smoke: 0, thermostat: 0, facetime: 0, nap: 0, default: 0 };
  stats: Stats = {
    handled: 0,
    expired: 0,
    cries: 0,
    smokeAlarms: 0,
    jokes: 0,
    kaylaCalls: 0,
    dirt: 0,
    screenYes: 0,
    coffeeRefills: 0,
  };

  nick = {
    x: NICK_START.x,
    y: NICK_START.y,
    room: 'living' as RoomId,
    moving: false,
    facing: 1,
    hand: null as Hand,
    pocket: null as ItemId | null,
    carryLeft: 0,
    coffee: 1,
  };

  actors: Record<ActorId, Actor>;
  requests: Request[] = [];
  // The job Nick is standing next to (shown in the Action Panel). Only offered while he isn't walking.
  interaction: Interaction | null = null;
  // Nothing doable in reach, but something worth saying ("Need a snack first.").
  note: string | null = null;
  // Movement input: walk toward a world point (touch / mouse held) or along a direction (keys).
  moveTo: { x: number; y: number } | null = null;
  moveDir: { x: number; y: number } | null = null;
  // True while the player's thumb is mid-gesture in the panel: Nick is locked in place.
  engaged = false;

  freezeLeft = 0;
  jokeCd = 0;
  bissCd = 0;
  kaylaCharges: number = ABILITIES.callKayla.charges;

  nap = { state: 'pending' as 'pending' | 'asleep' | 'done' | 'woken', noise: 0 };
  noraCrankyUntil = 0;

  facetime = {
    state: 'pending' as 'pending' | 'active' | 'done',
    left: 0,
    nextPrompt: 0,
    prompt: null as null | { id: number; left: number },
    missed: 0,
  };

  grill = { on: false, cook: 0 };
  thermostatAt: number;
  dog = { nextAction: 0, needsOutCd: 0, outsideLeft: 0 };
  nextAmbient: number;

  events: SimEvent[] = [];
  private nextId = 1;
  private fired = new Set<string>();
  private jokeBag: number[] = [];

  constructor(seed = Date.now()) {
    this.rng = new Rng(seed);
    const mk = (id: ActorId, room: RoomId, present: boolean): Actor => {
      const p = floorPoint(this.rng, room);
      return {
        id,
        present,
        room,
        x: p.x,
        y: p.y,
        state: 'idle',
        cryLeft: 0,
        req: null,
        nextReq: FIRST_REQUEST_SEC,
        nextWander: this.rng.range(...WANDER.gapSec),
        meltdownAt: null,
        dest: null,
        speech: null,
        speechLeft: 0,
      };
    };
    this.actors = {
      evelyn: mk('evelyn', 'living', true),
      nora: mk('nora', 'living', false),
      tyler: mk('tyler', 'backyard', false),
      eloise: mk('eloise', 'garage', false),
    };
    this.thermostatAt = this.rng.range(...THERMOSTAT.firstT);
    this.nextAmbient = this.rng.range(40, 70);
  }

  // ------------------------------------------------------------ derived
  get clock(): string {
    return clockString(this.t);
  }
  get frozen(): boolean {
    return this.freezeLeft > 0;
  }
  hoursIn(): number {
    return this.t / 60;
  }
  rateMult(): number {
    return 1 + RATE_AFTER_3PM_PER_HOUR * Math.max(0, (this.t - TIMELINE.rampStart) / 60);
  }
  patienceFactor(): number {
    return Math.max(PATIENCE.minFactor, 1 - PATIENCE.shrinkPerHour * this.hoursIn());
  }
  walkSpeed(): number {
    return this.nick.coffee < COFFEE.slowBelow ? MOVE.lowCoffeeSpeed : 1;
  }
  cryingKids(): KidId[] {
    return KID_IDS.filter((k) => this.actors[k].present && this.actors[k].state === 'crying');
  }
  req(id: number | undefined | null): Request | undefined {
    return id == null ? undefined : this.requests.find((r) => r.id === id);
  }
  get steering(): boolean {
    return !!(this.moveTo || this.moveDir);
  }

  // The point a request is "at": the kid, the spill, or its station.
  anchorOf(r: Request): { x: number; y: number } {
    switch (r.kind) {
      case 'flip':
        return STATIONS.grill;
      case 'thermostat':
        return STATIONS.thermostat;
      case 'needs_out':
        return STATIONS.door;
      case 'spill':
        return { x: r.x ?? 0, y: r.y ?? 0 };
    }
    const kids = (r.kids ?? [r.owner]) as ActorId[];
    const ps = kids.map((k) => this.actors[k]);
    return { x: ps.reduce((s, a) => s + a.x, 0) / ps.length, y: ps.reduce((s, a) => s + a.y, 0) / ps.length };
  }

  // ------------------------------------------------------------ events
  private emit(e: SimEvent) {
    this.events.push(e);
  }
  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
  private toast(text: string) {
    this.emit({ type: 'toast', text });
  }
  private say(id: ActorId, text: string, sec = 2.2) {
    const a = this.actors[id];
    a.speech = text;
    a.speechLeft = sec;
  }
  addChaos(n: number, cause: ChaosCause) {
    if (this.over || n <= 0) return;
    this.chaos = Math.min(CHAOS.max, this.chaos + n);
    this.chaosBy[cause] += n;
    if (this.chaos >= CHAOS.max) this.gameOver();
  }
  private gameOver() {
    if (this.over) return;
    this.over = true;
    this.interaction = null;
    this.emit({ type: 'gameover' });
    this.emit({ type: 'haptic', pattern: [80, 60, 200] });
  }
  topCause(): ChaosCause {
    let best: ChaosCause = 'default';
    let v = -1;
    for (const [k, n] of Object.entries(this.chaosBy) as [ChaosCause, number][]) {
      if (n > v) {
        v = n;
        best = k;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ main step
  update(dt: number) {
    if (this.over) return;
    dt = Math.min(dt, 0.25);
    this.t += dt;
    const frozen = this.freezeLeft > 0;
    this.freezeLeft = Math.max(0, this.freezeLeft - dt);
    const tdt = frozen ? 0 : dt;

    this.timeline();
    this.nick.coffee = Math.max(0, this.nick.coffee - tdt / COFFEE.drainSec);
    this.jokeCd = Math.max(0, this.jokeCd - dt);
    this.bissCd = Math.max(0, this.bissCd - dt);

    this.updateNick(dt, tdt);
    this.updateFacetime(tdt);
    this.updateKids(tdt, dt);
    this.updateDog(tdt, dt);
    this.updateGrill(tdt);
    this.updateThermostat(tdt);
    this.updateRequests(tdt);
    this.updateFights(tdt);
    this.updateNap(tdt);

    // Chaos drift.
    const thermo = this.requests.some((r) => r.kind === 'thermostat');
    if (thermo) this.addChaos(CHAOS.thermostatPerSec * tdt, 'thermostat');
    const crying = this.cryingKids().length;
    if (crying > 0) this.addChaos(CHAOS.cryPerSec * crying * tdt, 'cry');
    else if (!thermo) this.chaos = Math.max(0, this.chaos - CHAOS.decayPerSec * dt);
  }

  // ------------------------------------------------------------ timeline
  private once(key: string, at: number, fn: () => void) {
    if (this.t >= at && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }
  private text(m: { from: string; body: string }) {
    this.emit({ type: 'text', from: m.from, body: m.body });
    this.emit({ type: 'sfx', name: 'ding' });
  }

  private timeline() {
    this.once('start', 0, () => this.text(TEXTS.start));
    this.once('nora', TIMELINE.noraJoins, () => {
      const n = this.actors.nora;
      n.present = true;
      Object.assign(n, floorPoint(this.rng, 'living'));
      n.room = 'living';
      n.nextReq = 5;
      this.text(TEXTS.noraJoins);
    });
    this.once('dog', TIMELINE.dogJoins, () => {
      const d = this.actors.eloise;
      d.present = true;
      Object.assign(d, floorPoint(this.rng, 'garage'));
      d.room = 'garage';
      this.dog.nextAction = 6;
      this.text(TEXTS.dogJoins);
      this.say('eloise', 'Woof!');
      this.emit({ type: 'sfx', name: 'bark' });
    });
    this.once('lunch', TIMELINE.lunchRush, () => this.text(TEXTS.lunchRush));
    this.once('nap', TIMELINE.nap, () => this.startNap());
    this.once('tyler', TIMELINE.tylerJoins, () => {
      const ty = this.actors.tyler;
      ty.present = true;
      Object.assign(ty, { x: 200, y: 24 });
      ty.dest = floorPoint(this.rng, 'backyard');
      ty.room = 'backyard';
      ty.nextReq = 8;
      this.text(TEXTS.tyler);
      this.say('tyler', 'Hi Mr. Nick!');
    });
    this.once('napEnd', TIMELINE.noraWakes, () => {
      if (this.nap.state === 'asleep') {
        this.nap.state = 'done';
        const n = this.actors.nora;
        n.state = 'idle';
        n.nextReq = 4;
        this.say('nora', 'Hi Dada.');
        this.text(TEXTS.noraWakes);
      }
    });
    this.once('facetime', TIMELINE.faceTime, () => this.startFacetime());
    this.once('late', TIMELINE.runningLate, () => this.text(TEXTS.runningLate));

    if (this.t >= this.nextAmbient) {
      this.nextAmbient = this.t + this.rng.range(80, 140);
      if (this.t > 20) this.text({ from: 'Kayla', body: this.rng.pick(TEXTS.ambient) });
    }
  }

  // ------------------------------------------------------------ Nick
  setMoveTarget(p: { x: number; y: number } | null) {
    this.moveTo = p;
    if (p) this.moveDir = null;
  }

  setMoveDir(d: { x: number; y: number } | null) {
    this.moveDir = d && (d.x || d.y) ? d : null;
    if (this.moveDir) this.moveTo = null;
  }

  // Panel: the thumb went down on (or left) a gesture. Engaged = locked in place.
  engage(on: boolean) {
    this.engaged = on && !!this.interaction;
  }

  private updateNick(dt: number, tdt: number) {
    const n = this.nick;
    if (n.hand === 'nora') {
      n.carryLeft -= tdt;
      if (n.carryLeft <= 0) this.setDownNora(false);
    }

    n.moving = false;
    if (!this.engaged && this.steering) {
      let dx = 0;
      let dy = 0;
      let maxStep = Infinity;
      if (this.moveDir) {
        dx = this.moveDir.x;
        dy = this.moveDir.y;
      } else if (this.moveTo) {
        const t = this.moveTo;
        if (dist(n.x, n.y, t.x, t.y) > 4) {
          const w = steer(n.x, n.y, t.x, t.y, MOVE.radius);
          dx = w.x - n.x;
          dy = w.y - n.y;
          maxStep = Math.hypot(dx, dy);
        }
      }
      const len = Math.hypot(dx, dy);
      if (len > 0.001) {
        const step = Math.min(MOVE.speed * this.walkSpeed() * dt, maxStep);
        const p = moveCircle(n.x, n.y, (dx / len) * step, (dy / len) * step, MOVE.radius);
        n.moving = Math.hypot(p.x - n.x, p.y - n.y) > 0.01;
        if (Math.abs(p.x - n.x) > 0.05) n.facing = p.x < n.x ? -1 : 1;
        n.x = p.x;
        n.y = p.y;
      }
    }
    n.room = roomAt(n.x, n.y);
    if (n.hand === 'nora') {
      const no = this.actors.nora;
      no.x = n.x;
      no.y = n.y;
      no.room = n.room;
    }
    if (!this.engaged) this.updateFocus();
  }

  // Pick the job Nick is standing next to. Requests win ties against stations.
  private updateFocus() {
    if (this.over) return;
    if (this.steering) {
      this.interaction = null;
      this.note = null;
      return;
    }
    const n = this.nick;
    let best: { score: number; target: Target; built: Built } | null = null;
    let note: { score: number; text: string } | null = null;
    const consider = (target: Target, d: number, bonus: number, reach = MOVE.reach) => {
      if (d > reach) return;
      const built = this.build(target);
      const score = d - bonus;
      if (typeof built === 'string') {
        if (!note || score < note.score) note = { score, text: built };
      } else if (!best || score < best.score) best = { score, target, built };
    };
    for (const s of STATION_IDS)
      consider({ t: 'station', station: s }, dist(n.x, n.y, STATIONS[s].x, STATIONS[s].y), 0, MOVE.stationReach);
    for (const r of this.requests) {
      if (r.kind === 'flip' || r.kind === 'thermostat' || r.kind === 'needs_out' || r.kind === 'lost_shoe') continue;
      let d: number;
      if (r.kind === 'spill') d = dist(n.x, n.y, r.x ?? 0, r.y ?? 0);
      else {
        const kids = (r.kids ?? [r.owner]) as ActorId[];
        d = Math.min(...kids.map((k) => dist(n.x, n.y, this.actors[k].x, this.actors[k].y - 6)));
        // "Watch this!" only needs Nick in the same room.
        if (r.kind === 'watch_this' && this.actors[r.owner as ActorId].room === n.room) d = Math.min(d, MOVE.reach);
      }
      consider({ t: 'request', req: r.id }, d, 14);
    }
    // A crying kid takes whatever snack, drink or band-aid Nick is holding.
    for (const k of KID_IDS) {
      const a = this.actors[k];
      if (a.present && a.state === 'crying') consider({ t: 'kid', kid: k }, dist(n.x, n.y, a.x, a.y - 6), 10);
    }
    const pick = best as { score: number; target: Target; built: Built } | null;
    this.note = pick ? null : (note as { score: number; text: string } | null)?.text ?? null;
    if (!pick) {
      this.interaction = null;
      return;
    }
    const key = `${targetKey(pick.target)}|${n.hand}`;
    if (this.interaction?.key === key) return; // same job: keep its progress (fight taps, band-aid rub)
    this.interaction = { ...pick.built, id: this.nextId++, key };
    this.emit({ type: 'sfx', name: 'pop' });
  }

  dropHand(): boolean {
    const h = this.nick.hand;
    if (h == null || h === 'nora' || h === 'phone') return false;
    this.nick.hand = null;
    this.toast(`Put the ${ITEM_NAMES[h]} down.`);
    return true;
  }

  // ------------------------------------------------------------ interactions
  // What Nick can do at a target right now, or why not (a string).
  build(t: Target): Built | string {
    const n = this.nick;
    const base = { target: t };
    if (t.t === 'station') {
      const s = t.station;
      const item = STATION_ITEM[s];
      if (item) {
        if (n.hand === 'nora') return NICK_LINES.handsBusy;
        if (n.hand === 'phone') return NICK_LINES.handsFullPhone;
        if (n.hand === item) return 'Already got one.';
        return { ...base, kind: 'tap', title: `Grab ${ITEM_NAMES[item]}`, hint: 'Tap', icon: item };
      }
      switch (s) {
        case 'coffee':
          if (n.coffee > 0.9) return 'Still got coffee.';
          return { ...base, kind: 'hold', title: 'Refill coffee', hint: 'Hold', icon: 'coffee', holdSec: GESTURES.coffeeHoldSec };
        case 'highchair':
        case 'playpen':
          if (n.hand !== 'nora') return '';
          return { ...base, kind: 'tap', title: `Nora → ${STATIONS[s].label.toLowerCase()}`, hint: 'Tap', icon: 'nora' };
        case 'thermostat': {
          const r = this.requests.find((x) => x.kind === 'thermostat');
          if (!r) return NICK_LINES.thermostatOk;
          return { ...base, req: r.id, kind: 'swipe', title: 'Reset thermostat', hint: 'Swipe down', icon: 'thermostat', dir: 'down' };
        }
        case 'grill': {
          const r = this.requests.find((x) => x.kind === 'flip');
          if (!r) return this.grill.on ? NICK_LINES.grillWait : NICK_LINES.grillIdle;
          return {
            ...base,
            req: r.id,
            kind: 'mash',
            title: 'Flip!',
            hint: `Tap ${GESTURES.flipMashTaps}× fast`,
            icon: 'burger',
            mashTaps: GESTURES.flipMashTaps,
            mashWindow: GESTURES.flipMashWindowSec,
          };
        }
        case 'door': {
          const r = this.requests.find((x) => x.kind === 'needs_out');
          if (!r) return '';
          return { ...base, req: r.id, kind: 'hold', title: 'Let Eloise out', hint: 'Hold the door', icon: 'door', holdSec: GESTURES.doorHoldSec };
        }
        default: {
          const r = this.requests.find(
            (x) => x.kind === 'lost_shoe' && x.spots?.includes(s) && !x.checked?.includes(s),
          );
          if (!r) return '';
          return { ...base, req: r.id, kind: 'tap', title: `Check ${STATIONS[s].label.toLowerCase()}`, hint: 'Tap', icon: 'shoe' };
        }
      }
    }
    if (t.t === 'kid') {
      const h = n.hand;
      if (!h || h === 'nora' || h === 'phone') return `${CAST[t.kid].name} is crying. Bring a snack, a drink or a band-aid.`;
      return { ...base, kind: 'tap', title: `Give ${CAST[t.kid].name} the ${ITEM_NAMES[h]}`, hint: 'Tap. Stops the crying.', icon: h };
    }
    const r = this.req(t.req);
    if (!r) return '';
    const who = r.owner in CAST ? CAST[r.owner as keyof typeof CAST].name : '';
    const rb = { ...base, req: r.id };
    switch (r.kind) {
      case 'snack':
      case 'juice_box':
      case 'sippy_cup': {
        const item = FETCH_ITEM[r.kind]!;
        if (n.hand !== item) return `${who} wants a ${ITEM_NAMES[item]}. Kitchen.`;
        return { ...rb, kind: 'tap', title: `${ITEM_NAMES[item]} → ${who}`, hint: 'Tap', icon: item };
      }
      case 'diaper':
        return { ...rb, kind: 'hold', title: 'Change diaper', hint: 'Hold', icon: 'diaper', holdSec: GESTURES.diaperHoldSec };
      case 'uppy':
        if (n.hand === 'phone') return NICK_LINES.handsFullPhone;
        return { ...rb, kind: 'tap', title: 'Pick up Nora', hint: 'Tap', icon: 'nora' };
      case 'watch_this':
        return { ...rb, kind: 'hold', title: `Watch ${who}`, hint: 'Hold. Really watch.', icon: 'eyes', holdSec: GESTURES.watchThisHoldSec };
      case 'booboo':
        return {
          ...rb,
          kind: 'choice',
          title: `${who}’s boo-boo`,
          hint: 'Pick one',
          icon: 'bandaid',
          options: [
            {
              label: 'Band-aid',
              sub: n.hand === 'bandaid' ? 'Rub it on' : 'Need one (Garage)',
              enabled: n.hand === 'bandaid',
              icon: 'bandaid',
            },
            { label: 'Rub some dirt on it', sub: `+${CHAOS.dirt} chaos`, enabled: true, icon: 'dirt' },
          ],
        };
      case 'screen_time':
        return {
          ...rb,
          kind: 'choice',
          title: `${who}: “Can I watch something?”`,
          hint: 'Pick one',
          icon: 'tv',
          options: [
            { label: 'Yes', sub: 'Calm now. Meltdown in 60 min.', enabled: true, icon: 'yes' },
            { label: 'No', sub: `+${CHAOS.screenTimeNo} chaos`, enabled: true, icon: 'no' },
          ],
        };
      case 'fight':
        return {
          ...rb,
          kind: 'multi',
          title: 'Break it up',
          hint: 'Tap each kid',
          icon: 'fight',
          multi: (r.kids ?? []).map((k) => ({ label: CAST[k].name, actor: k, done: false })),
        };
      case 'spill':
        return { ...rb, kind: 'swipe', title: 'Clean it up', hint: `Swipe ${r.dir}`, icon: 'spill', dir: r.dir };
      default:
        return '';
    }
  }

  // Panel input: the current gesture finished (tap, hold filled, rub done, swipe, mash).
  completeGesture() {
    const it = this.interaction;
    if (!it || this.over) return;
    if (it.kind === 'choice' || it.kind === 'multi') return;
    const target = it.target;
    const r = this.req(it.req);
    this.emit({ type: 'haptic', pattern: 20 });

    const h = this.nick.hand;
    const busy = h === 'nora' || h === 'phone';
    if (target.t === 'kid') {
      const a = this.actors[target.kid];
      if (a.state === 'crying' && h && !busy) {
        a.state = 'idle';
        a.cryLeft = 0;
        a.nextReq = this.kidGap(target.kid);
        this.nick.hand = null;
        this.chaos = Math.max(0, this.chaos - CHAOS.comfortRefund);
        this.stats.handled++;
        this.say(target.kid, target.kid === 'nora' ? '*sniff* Tank you.' : '*sniff* …thanks.', 1.6);
        this.emit({ type: 'sfx', name: 'good' });
      }
    } else if (target?.t === 'station') {
      const s = target.station;
      const item = STATION_ITEM[s];
      if (item) {
        if (busy) this.toast(h === 'phone' ? NICK_LINES.handsFullPhone : NICK_LINES.handsBusy);
        else {
          this.nick.hand = item;
          const p = this.req(this.promisedId);
          if (p) {
            p.left = Math.max(p.left, p.patience * PATIENCE.promisedTopUp);
            const who = p.owner as KidId;
            this.say(who, 'Yay! Dad’s coming!', 1.6);
          }
        }
        this.emit({ type: 'sfx', name: 'pop' });
      } else if (s === 'coffee') {
        this.nick.coffee = 1;
        this.stats.coffeeRefills++;
        this.emit({ type: 'sfx', name: 'good' });
      } else if (s === 'highchair' || s === 'playpen') {
        this.setDownNora(true, s);
      } else if (s === 'thermostat' && r) {
        this.resolve(r);
        this.thermostatAt = this.t + this.rng.range(...THERMOSTAT.gapSec);
      } else if (s === 'grill' && r) {
        this.resolve(r);
        this.grill.cook = GRILL.flipEverySec;
        this.emit({ type: 'sfx', name: 'sizzle' });
      } else if (s === 'door' && r) {
        this.resolve(r);
        const d = this.actors.eloise;
        d.state = 'outside';
        d.dest = floorPoint(this.rng, 'backyard');
        this.dog.outsideLeft = DOG.outsideSec;
      } else if (r?.kind === 'lost_shoe') {
        r.checked = [...(r.checked ?? []), s];
        if ((r.spots ?? []).every((x) => r.checked!.includes(x))) {
          this.toast(NICK_LINES.foundShoe);
          this.resolve(r);
        } else {
          this.toast(NICK_LINES.emptySpot);
        }
      }
    } else if (r) {
      switch (r.kind) {
        case 'snack':
        case 'juice_box':
        case 'sippy_cup':
          if (h !== FETCH_ITEM[r.kind]) {
            this.toast(NICK_LINES.needItem(ITEM_NAMES[FETCH_ITEM[r.kind]!]));
            break;
          }
          this.nick.hand = null;
          this.resolve(r);
          break;
        case 'uppy': {
          if (busy) {
            this.toast(h === 'phone' ? NICK_LINES.handsFullPhone : NICK_LINES.handsBusy);
            break;
          }
          if (h) this.toast(`Put the ${ITEM_NAMES[h]} down.`);
          this.resolve(r);
          this.nick.hand = 'nora';
          this.nick.carryLeft = UPPY.carrySec;
          const no = this.actors.nora;
          no.state = 'carried';
          no.room = this.nick.room;
          break;
        }
        case 'booboo':
          // Reached only through the band-aid rub.
          if (h === 'bandaid') this.nick.hand = null;
          this.resolve(r);
          break;
        default:
          this.resolve(r);
      }
    }
    this.finishInteraction();
  }

  choose(i: number) {
    const it = this.interaction;
    if (!it || it.kind !== 'choice' || this.over) return;
    const opt = it.options?.[i];
    const r = this.req(it.req);
    if (!opt || !opt.enabled || !r) return;
    if (r.kind === 'booboo') {
      if (i === 0) {
        this.interaction = {
          ...it,
          id: this.nextId++,
          kind: 'rub',
          title: 'Band-aid',
          hint: 'Rub back and forth',
          icon: 'bandaid',
          rubPx: GESTURES.bandaidRubPx,
          options: undefined,
        };
        return;
      }
      this.addChaos(CHAOS.dirt, 'default');
      this.stats.dirt++;
      this.toast(NICK_LINES.dirt);
      this.resolve(r);
    } else if (r.kind === 'screen_time') {
      const kid = this.actors[r.owner as KidId];
      if (i === 0) {
        kid.meltdownAt = this.t + MELTDOWN_DELAY_SEC;
        this.stats.screenYes++;
        this.say(kid.id, 'YAAAY!');
      } else {
        this.addChaos(CHAOS.screenTimeNo, 'default');
        this.say(kid.id, 'Not FAIR.');
      }
      this.resolve(r);
    }
    this.emit({ type: 'haptic', pattern: 20 });
    this.finishInteraction();
  }

  tapMulti(i: number) {
    const it = this.interaction;
    if (!it || it.kind !== 'multi' || !it.multi?.[i] || this.over) return;
    it.multi[i].done = true;
    this.emit({ type: 'sfx', name: 'tap' });
    this.emit({ type: 'haptic', pattern: 12 });
    if (it.multi.every((m) => m.done)) {
      const r = this.req(it.req);
      if (r) this.resolve(r);
      this.finishInteraction();
    }
  }

  private finishInteraction() {
    this.interaction = null;
    this.engaged = false;
  }

  // ------------------------------------------------------------ requests
  private makeRequest(kind: RequestKind, owner: Request['owner'], room: RoomId, extra: Partial<Request> = {}): Request {
    let patience: number;
    if (kind === 'flip') patience = GRILL.flipPatienceSec;
    else if (kind === 'thermostat') patience = Infinity;
    else {
      patience = PATIENCE.baseSec * (PATIENCE.kind as Record<string, number>)[kind] * this.patienceFactor();
      const cranky = owner === 'nora' || extra.kids?.includes('nora');
      if (cranky && this.t < this.noraCrankyUntil) patience *= NAP.crankyPatience;
    }
    const r: Request = { id: this.nextId++, kind, owner, room, patience, left: patience, ...extra };
    this.requests.push(r);
    if (owner === 'evelyn' || owner === 'nora' || owner === 'tyler') this.actors[owner].req = r.id;
    for (const k of extra.kids ?? []) this.actors[k].req = r.id;
    this.emit({ type: 'sfx', name: kind === 'flip' ? 'sizzle' : 'pop' });
    return r;
  }

  private removeRequest(r: Request) {
    this.requests = this.requests.filter((x) => x !== r);
    for (const a of Object.values(this.actors)) {
      if (a.req === r.id) {
        a.req = null;
        if (a.id !== 'eloise') a.nextReq = this.kidGap(a.id as KidId);
      }
    }
    if (this.interaction?.req === r.id) this.finishInteraction();
  }

  private resolve(r: Request) {
    if (!this.requests.includes(r)) return;
    this.removeRequest(r);
    this.stats.handled++;
    this.emit({ type: 'resolved', req: r });
    this.emit({ type: 'sfx', name: 'good' });
    const owner = r.owner;
    if (owner === 'evelyn' || owner === 'tyler') {
      this.say(owner, this.rng.pick(['Thanks Dad!', 'Yay!', 'Okay.', 'Cool.']), 1.4);
    } else if (owner === 'nora') {
      this.say('nora', this.rng.pick(['Tank you!', 'Yay!', 'Mmm.']), 1.4);
    }
  }

  // The request Nick is visibly bringing something for: he holds the item it wants
  // (most urgent one if several). Its timer runs slow ("On my way!").
  get promisedId(): number | null {
    const h = this.nick.hand;
    if (!h || h === 'nora' || h === 'phone') return null;
    let best: Request | null = null;
    for (const r of this.requests) {
      const wants = r.kind === 'booboo' ? 'bandaid' : FETCH_ITEM[r.kind];
      if (wants === h && (!best || r.left < best.left)) best = r;
    }
    return best?.id ?? null;
  }

  private updateRequests(tdt: number) {
    if (tdt <= 0) return;
    const crying = this.cryingKids();
    const promised = this.promisedId;
    for (const r of [...this.requests]) {
      if (!isFinite(r.left)) continue;
      let rate = r.id === promised ? PATIENCE.promisedRate : 1;
      const kids = r.kids ?? (KID_IDS.includes(r.owner as KidId) ? [r.owner as KidId] : []);
      if (kids.length) {
        const others = crying.filter((k) => !kids.includes(k)).length;
        rate *= 1 + PATIENCE.crySpeedupPerKid * others;
      }
      r.left -= tdt * rate;
      if (r.left <= 0) this.expire(r);
    }
  }

  private expire(r: Request) {
    this.removeRequest(r);
    this.stats.expired++;
    this.emit({ type: 'expired', req: r });
    switch (r.kind) {
      case 'flip':
        this.toast('Burger’s toast.');
        this.smokeAlarm();
        this.grill.cook = GRILL.flipEverySec;
        return;
      case 'spill':
        this.addChaos(CHAOS.expireDog, 'default');
        this.toast('Somebody stepped in it.');
        this.emit({ type: 'sfx', name: 'bad' });
        return;
      case 'needs_out': {
        this.addChaos(CHAOS.expireDog, 'default');
        const d = this.actors.eloise;
        this.toast('Eloise had an accident.');
        this.makeRequest('spill', 'eloise', d.room, { x: d.x, y: d.y, dir: this.rng.pick(['left', 'right', 'up', 'down'] as Dir[]) });
        return;
      }
      default: {
        this.addChaos(CHAOS.expireKid, 'cry');
        const kids = r.kids ?? (KID_IDS.includes(r.owner as KidId) ? [r.owner as KidId] : []);
        for (const k of kids) this.startCry(k, 1);
      }
    }
  }

  private startCry(k: KidId, severity: number) {
    const a = this.actors[k];
    if (!a.present || a.state === 'asleep') return;
    if (a.req != null) {
      const r = this.req(a.req);
      if (r) this.removeRequest(r);
    }
    if (a.state === 'carried') this.setDownNora(false);
    a.state = 'crying';
    a.cryLeft = (k === 'nora' ? CRY.noraSec : CRY.sec) * severity;
    a.speech = null;
    this.stats.cries++;
    this.emit({ type: 'sfx', name: 'cry' });
    this.emit({ type: 'haptic', pattern: [40, 40, 40] });
  }

  // ------------------------------------------------------------ kids
  private kidGap(k: KidId): number {
    return this.rng.range(...REQUEST_GAP[k]) / this.rateMult();
  }

  private updateKids(tdt: number, dt: number) {
    for (const k of KID_IDS) {
      const a = this.actors[k];
      if (a.speechLeft > 0) {
        a.speechLeft -= dt;
        if (a.speechLeft <= 0) a.speech = null;
      }
      if (!a.present) continue;

      if (a.meltdownAt != null && this.t >= a.meltdownAt && a.state !== 'asleep') {
        a.meltdownAt = null;
        this.toast(`${CAST[k].name}: screen-time withdrawal.`);
        this.addChaos(CHAOS.expireKid * CHAOS.meltdownMult, 'cry');
        this.startCry(k, CHAOS.meltdownMult);
      }

      if (a.state === 'crying') {
        a.cryLeft -= tdt;
        if (a.cryLeft <= 0) {
          a.state = 'idle';
          a.nextReq = this.kidGap(k) * 0.6;
        }
        continue;
      }
      if (a.state !== 'idle') continue;

      if (a.req == null) {
        a.nextWander -= tdt;
        if (a.nextWander <= 0) {
          a.nextWander = this.rng.range(...(k === 'nora' ? WANDER.noraGapSec : WANDER.gapSec));
          const room = this.rng.chance(WANDER.moveChance) ? this.rng.pick(neighbors(a.room)) : a.room;
          a.dest = floorPoint(this.rng, room);
        }
        this.walk(a, MOVE.kidSpeed * (k === 'nora' ? 0.75 : 1), tdt);
        a.nextReq -= tdt;
        if (a.nextReq <= 0) {
          a.dest = null; // kids stand still while they want something
          this.spawnKidRequest(k);
        }
      }
    }
  }

  // Walk an actor toward its destination through doorways.
  private walk(a: Actor, speed: number, dt: number) {
    if (!a.dest || dt <= 0) return;
    const d = a.dest;
    if (dist(a.x, a.y, d.x, d.y) < 3) {
      a.dest = null;
      return;
    }
    const w = steer(a.x, a.y, d.x, d.y, 8);
    const dx = w.x - a.x;
    const dy = w.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const step = Math.min(speed * dt, len);
    const p = moveCircle(a.x, a.y, (dx / len) * step, (dy / len) * step, 8);
    if (Math.hypot(p.x - a.x, p.y - a.y) < 0.001) a.dest = null; // stuck: pick another spot later
    a.x = p.x;
    a.y = p.y;
    a.room = roomAt(a.x, a.y);
  }

  private spawnKidRequest(k: KidId) {
    const a = this.actors[k];
    const kind = this.rng.weighted(REQUEST_WEIGHTS[k] as Record<string, number>) as RequestKind;
    const extra: Partial<Request> = {};
    if (kind === 'lost_shoe') {
      extra.spots = this.rng.shuffle([...SHOE_SPOTS]).slice(0, 3);
      extra.checked = [];
    }
    this.makeRequest(kind, k, a.room, extra);
  }

  private updateFights(tdt: number) {
    if (tdt <= 0) return;
    const p = 1 - Math.pow(1 - FIGHT.chancePerSec, tdt);
    const rooms = new Map<RoomId, KidId[]>();
    for (const k of KID_IDS) {
      const a = this.actors[k];
      if (!a.present || a.state !== 'idle' || a.req != null) continue;
      rooms.set(a.room, [...(rooms.get(a.room) ?? []), k]);
    }
    for (const [room, kids] of rooms) {
      if (kids.length < 2 || !this.rng.chance(p)) continue;
      const pair = this.rng.shuffle([...kids]).slice(0, 2);
      this.makeRequest('fight', pair[0], room, { kids: pair });
      this.say(pair[0], 'MINE!');
      this.say(pair[1], 'NO, MINE!');
    }
  }

  setDownNora(early: boolean, station?: StationId) {
    if (this.nick.hand !== 'nora') return;
    this.nick.hand = null;
    this.nick.carryLeft = 0;
    const n = this.actors.nora;
    n.state = 'idle';
    n.dest = null;
    if (station) Object.assign(n, { x: STATIONS[station].x, y: STATIONS[station].y + 4 });
    else Object.assign(n, { x: this.nick.x + 14 * this.nick.facing, y: this.nick.y + 4 });
    n.room = roomAt(n.x, n.y);
    n.nextReq = this.kidGap('nora');
    n.nextWander = this.rng.range(...WANDER.noraGapSec);
    if (early) {
      if (this.rng.chance(UPPY.earlyDropCryChance)) {
        this.addChaos(CHAOS.earlyDropCry, 'cry');
        this.startCry('nora', 1);
      } else {
        this.toast(NICK_LINES.setDown);
      }
    }
  }

  // ------------------------------------------------------------ nap
  private startNap() {
    const n = this.actors.nora;
    if (n.state === 'carried') this.setDownNora(false);
    if (n.req != null) {
      const r = this.req(n.req);
      if (r) this.removeRequest(r);
    }
    n.state = 'asleep';
    n.cryLeft = 0;
    n.meltdownAt = null;
    n.room = COUCH_POS.room;
    n.x = COUCH_POS.x;
    n.y = COUCH_POS.y;
    n.dest = null;
    n.speech = null;
    this.nap.state = 'asleep';
    this.nap.noise = 0;
    this.text(TEXTS.nap);
  }

  private noise(n: number) {
    if (this.nap.state !== 'asleep') return;
    this.nap.noise = Math.min(100, this.nap.noise + n);
    if (this.nap.noise >= 100) this.wakeNora();
  }

  private wakeNora() {
    if (this.nap.state !== 'asleep') return;
    this.nap.state = 'woken';
    this.nap.noise = 0;
    this.noraCrankyUntil = NAP.crankyUntilT;
    const n = this.actors.nora;
    n.state = 'idle';
    n.nextReq = 3;
    this.addChaos(CHAOS.napWake, 'nap');
    this.toast('NORA’S UP.');
    this.emit({ type: 'nora_woke' });
    this.emit({ type: 'sfx', name: 'cry' });
  }

  private updateNap(tdt: number) {
    if (this.nap.state !== 'asleep') return;
    const fight = this.requests.some((r) => r.kind === 'fight' && (r.room === 'living' || r.room === 'kitchen'));
    if (fight) this.noise(NAP.noise.fightPerSec * tdt);
    this.nap.noise = Math.max(0, this.nap.noise - NAP.noise.decayPerSec * tdt);
  }

  private smokeAlarm() {
    this.stats.smokeAlarms++;
    this.addChaos(CHAOS.smokeAlarm, 'smoke');
    this.emit({ type: 'sfx', name: 'alarm' });
    this.emit({ type: 'shake', strength: 0.012 });
    this.emit({ type: 'haptic', pattern: [120, 60, 120, 60, 120] });
    this.noise(100);
  }

  // ------------------------------------------------------------ dog
  private updateDog(tdt: number, dt: number) {
    const d = this.actors.eloise;
    if (d.speechLeft > 0) {
      d.speechLeft -= dt;
      if (d.speechLeft <= 0) d.speech = null;
    }
    if (!d.present) return;
    this.dog.needsOutCd = Math.max(0, this.dog.needsOutCd - tdt);
    if (d.state === 'outside') {
      this.walk(d, MOVE.dogSpeed * 1.4, tdt);
      this.dog.outsideLeft -= tdt;
      if (this.dog.outsideLeft <= 0) {
        d.state = 'idle';
        this.dog.nextAction = this.rng.range(...DOG.actionGapSec);
      }
      return;
    }
    const waitingOut = this.requests.some((r) => r.kind === 'needs_out');
    if (!waitingOut) {
      d.nextWander -= tdt;
      if (d.nextWander <= 0) {
        d.nextWander = this.rng.range(3, 7);
        const room = this.rng.chance(0.6) ? this.rng.pick(neighbors(d.room)) : d.room;
        d.dest = floorPoint(this.rng, room);
      }
    }
    this.walk(d, MOVE.dogSpeed, tdt);
    this.dog.nextAction -= tdt;
    if (this.dog.nextAction > 0) return;
    this.dog.nextAction = this.rng.range(...DOG.actionGapSec) / this.rateMult();

    let act = this.rng.weighted(DOG.weights);
    if (act === 'needs_out' && (waitingOut || this.dog.needsOutCd > 0)) act = 'bark';
    if (act === 'spill' && this.requests.filter((r) => r.kind === 'spill').length >= DOG.maxSpills) act = 'bark';
    if (act === 'steals_shoe') {
      const victims = (['evelyn', 'tyler'] as KidId[]).filter((k) => {
        const a = this.actors[k];
        return a.present && a.state === 'idle' && a.req == null;
      });
      if (!victims.length) act = 'bark';
      else {
        const k = this.rng.pick(victims);
        this.makeRequest('lost_shoe', k, this.actors[k].room, {
          spots: this.rng.shuffle([...SHOE_SPOTS]).slice(0, 3),
          checked: [],
        });
        this.toast(`Eloise ran off with ${CAST[k].name}’s shoe.`);
        this.say(k, 'ELOISE!!');
        return;
      }
    }
    if (act === 'spill') {
      this.makeRequest('spill', 'eloise', d.room, {
        x: d.x + 10,
        y: d.y + 6,
        dir: this.rng.pick(['left', 'right', 'up', 'down'] as Dir[]),
      });
      this.say('eloise', '*crash*', 1.5);
      return;
    }
    if (act === 'needs_out') {
      this.dog.needsOutCd = DOG.needsOutCooldownSec;
      d.dest = { ...DOOR_WAIT_POS };
      this.makeRequest('needs_out', 'eloise', STATIONS.door.room);
      this.say('eloise', '*whine*', 2);
      return;
    }
    this.bark();
  }

  bark() {
    const d = this.actors.eloise;
    this.say('eloise', 'WOOF!', 1.2);
    this.emit({ type: 'sfx', name: 'bark' });
    const h = hops(d.room, COUCH_POS.room);
    this.noise(NAP.noise.barkByHops[Math.min(h, 2)]);
  }

  // ------------------------------------------------------------ grill / thermostat
  private updateGrill(tdt: number) {
    const on = GRILL.windows.some(([a, b]) => this.t >= a && this.t < b);
    if (on && !this.grill.on) {
      this.grill.on = true;
      this.grill.cook = GRILL.flipEverySec;
      this.toast(this.t < 300 ? 'LUNCH RUSH. Burgers on.' : 'Dinner. Burgers on.');
      this.emit({ type: 'sfx', name: 'sizzle' });
    } else if (!on && this.grill.on) {
      this.grill.on = false;
      const r = this.requests.find((x) => x.kind === 'flip');
      if (r) this.removeRequest(r);
      this.toast('Lunch is served. Grill off.');
    }
    if (!this.grill.on || this.requests.some((r) => r.kind === 'flip')) return;
    this.grill.cook -= tdt;
    if (this.grill.cook <= 0) this.makeRequest('flip', 'grill', 'backyard');
  }

  private updateThermostat(_tdt: number) {
    if (this.t < this.thermostatAt || this.requests.some((r) => r.kind === 'thermostat')) return;
    if (this.frozen) return;
    const suspects = (Object.values(this.actors) as Actor[]).filter((a) => a.present);
    const culprit = this.rng.pick(suspects).id;
    this.makeRequest('thermostat', 'house', 'living', { culprit });
    this.toast('Who touched the thermostat?');
    this.emit({ type: 'sfx', name: 'bad' });
    this.thermostatAt = Infinity; // re-armed when Nick fixes it
  }

  // ------------------------------------------------------------ FaceTime
  private startFacetime() {
    const n = this.nick;
    if (n.hand === 'nora') this.setDownNora(false);
    if (n.hand && n.hand !== 'phone') n.pocket = n.hand as ItemId;
    n.hand = 'phone';
    this.facetime.state = 'active';
    this.facetime.left = FACETIME.durationSec;
    this.facetime.nextPrompt = FACETIME.firstPromptSec;
    this.text(TEXTS.faceTime);
    this.emit({ type: 'sfx', name: 'ring' });
    this.emit({ type: 'haptic', pattern: [200, 100, 200] });
  }

  private updateFacetime(tdt: number) {
    const f = this.facetime;
    if (f.state !== 'active') return;
    f.left -= tdt;
    if (f.prompt) {
      f.prompt.left -= tdt;
      if (f.prompt.left <= 0) {
        f.prompt = null;
        f.missed++;
        this.addChaos(CHAOS.missedUhHuh, 'facetime');
        this.toast('“…Nick? Are you there?”');
        this.emit({ type: 'sfx', name: 'bad' });
      }
    }
    f.nextPrompt -= tdt;
    if (f.nextPrompt <= 0 && f.left > 0) {
      f.nextPrompt += FACETIME.promptEverySec;
      if (!f.prompt) {
        f.prompt = { id: this.nextId++, left: FACETIME.promptWindowSec };
        this.emit({ type: 'sfx', name: 'ring' });
        this.emit({ type: 'haptic', pattern: 30 });
      }
    }
    if (f.left <= 0 && !f.prompt) {
      f.state = 'done';
      this.nick.hand = this.nick.pocket;
      this.nick.pocket = null;
      this.toast('“Okay, love you, bye. Bye. Okay bye.”');
    }
  }

  answerUhHuh(): boolean {
    const f = this.facetime;
    if (!f.prompt || this.over) return false;
    f.prompt = null;
    this.emit({ type: 'sfx', name: 'tap' });
    this.emit({ type: 'haptic', pattern: 15 });
    return true;
  }

  // ------------------------------------------------------------ abilities
  dadJoke(): string | null {
    if (this.jokeCd > 0 || this.over) return null;
    if (!this.jokeBag.length) this.jokeBag = this.rng.shuffle(DAD_JOKES.map((_, i) => i));
    const joke = DAD_JOKES[this.jokeBag.pop()!];
    this.jokeCd = ABILITIES.dadJoke.cooldownSec;
    this.freezeLeft = ABILITIES.dadJoke.freezeSec;
    this.stats.jokes++;
    for (const k of KID_IDS) {
      const a = this.actors[k];
      if (a.present && a.state !== 'asleep') this.say(k, k === 'nora' ? 'Bah!' : this.rng.pick(GROANS), 3);
    }
    if (this.actors.eloise.present) this.say('eloise', 'Hrrmf.', 3);
    this.emit({ type: 'joke', text: joke });
    this.emit({ type: 'sfx', name: 'groan' });
    return joke;
  }

  callKayla(reqId: number): string | null {
    const r = this.req(reqId);
    if (!r || this.kaylaCharges <= 0 || this.over) return null;
    const reply = KAYLA_CALL_REPLIES[ABILITIES.callKayla.charges - this.kaylaCharges] ?? 'k';
    this.kaylaCharges--;
    this.stats.kaylaCalls++;
    if (r.kind === 'thermostat') this.thermostatAt = this.t + this.rng.range(...THERMOSTAT.gapSec);
    if (r.kind === 'flip') this.grill.cook = GRILL.flipEverySec;
    this.resolve(r);
    this.emit({ type: 'text', from: 'Kayla', body: reply });
    this.emit({ type: 'sfx', name: 'ding' });
    return reply;
  }

  becauseISaidSo(): number {
    if (this.bissCd > 0 || this.over) return 0;
    const open = this.requests.filter((r) => r.kind === 'screen_time');
    if (!open.length) {
      this.toast(NICK_LINES.bisNone);
      return 0;
    }
    for (const r of open) {
      this.resolve(r);
      this.say(r.owner as KidId, 'Fiiine.', 1.6);
    }
    this.bissCd = ABILITIES.becauseISaidSo.cooldownSec;
    this.emit({ type: 'shake', strength: 0.004 });
    this.emit({ type: 'sfx', name: 'whoosh' });
    return open.length;
  }
}

export function targetKey(t: Target): string {
  return t.t === 'station' ? `s:${t.station}` : t.t === 'request' ? `r:${t.req}` : `k:${t.kid}`;
}
