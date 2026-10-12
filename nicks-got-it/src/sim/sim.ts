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
  QUEUE_MAX,
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
  SHOE_SPOTS,
  STATIONS,
  hops,
  neighbors,
  nextHop,
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
  x?: number; // spill position inside its room
  y?: number;
  dir?: Dir; // spill swipe direction
}

export type Target =
  | { t: 'room'; room: RoomId }
  | { t: 'station'; station: StationId; req?: number }
  | { t: 'request'; req: number };

export interface QueueItem {
  id: number;
  target: Target;
}

export type GestureKind = 'tap' | 'hold' | 'rub' | 'swipe' | 'mash' | 'choice' | 'multi';

export interface ChoiceOption {
  label: string;
  sub: string;
  enabled: boolean;
  icon: string;
}

export interface Interaction {
  id: number;
  qid: number;
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
const ITEM_STATION: Record<ItemId, StationId> = {
  snack: 'snacks',
  juice_box: 'juice',
  sippy_cup: 'sippy',
  bandaid: 'bandaids',
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

function floorPos(rng: Rng): { x: number; y: number } {
  return { x: rng.range(0.36, 0.9), y: rng.range(0.66, 0.86) };
}

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
    room: 'living' as RoomId,
    hop: null as { from: RoomId; to: RoomId; p: number; dur: number } | null,
    hand: null as Hand,
    pocket: null as ItemId | null,
    carryLeft: 0,
    coffee: 1,
  };

  actors: Record<ActorId, Actor>;
  requests: Request[] = [];
  queue: QueueItem[] = [];
  interaction: Interaction | null = null;

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
      const p = floorPos(this.rng);
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
  // Room Nick has to stand in for a target (null = target is gone).
  targetRoom(t: Target): RoomId | null {
    if (t.t === 'room') return t.room;
    if (t.t === 'station') return STATIONS[t.station].room;
    const r = this.req(t.req);
    return r ? r.room : null;
  }
  isQueued(t: Target): QueueItem | undefined {
    return this.queue.find((q) => sameTarget(q.target, t));
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
      n.room = 'living';
      Object.assign(n, floorPos(this.rng));
      n.nextReq = 5;
      this.text(TEXTS.noraJoins);
    });
    this.once('dog', TIMELINE.dogJoins, () => {
      const d = this.actors.eloise;
      d.present = true;
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
      ty.room = 'backyard';
      Object.assign(ty, floorPos(this.rng));
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

  // ------------------------------------------------------------ Nick + queue
  private updateNick(dt: number, tdt: number) {
    const n = this.nick;
    if (n.hand === 'nora') {
      n.carryLeft -= tdt;
      if (n.carryLeft <= 0) this.setDownNora(n.room, false);
    }

    if (n.hop) {
      n.hop.p += dt / n.hop.dur;
      if (n.hop.p >= 1) {
        n.room = n.hop.to;
        n.hop = null;
        if (this.nick.hand === 'nora') this.actors.nora.room = n.room;
      } else return;
    }
    if (this.interaction) return;

    while (this.queue.length && !this.interaction && !n.hop) {
      const q = this.queue[0];
      const room = this.targetRoom(q.target);
      if (room == null) {
        this.queue.shift();
        continue;
      }
      if (room !== n.room) {
        n.hop = { from: n.room, to: nextHop(n.room, room), p: 0, dur: MOVE.hopSec / this.walkSpeed() };
        return;
      }
      if (q.target.t === 'room') {
        this.queue.shift();
        continue;
      }
      const built = this.buildInteraction(q);
      if (typeof built === 'string') {
        this.queue.shift();
        this.toast(built);
        continue;
      }
      this.interaction = built;
      this.emit({ type: 'sfx', name: 'pop' });
    }
  }

  // Input: tap a request bubble (or the kid / dog wearing it).
  tapRequest(id: number): boolean {
    const r = this.req(id);
    if (!r || this.over) return false;
    // Requests that are resolved at a station queue that station instead.
    if (r.kind === 'lost_shoe') {
      const spots = (r.spots ?? []).filter((s) => !r.checked?.includes(s));
      const queued = spots.filter((s) => this.isQueued({ t: 'station', station: s }));
      if (queued.length === spots.length && spots.length) {
        for (const s of spots) this.cancelTarget({ t: 'station', station: s });
        return true;
      }
      let added = false;
      for (const s of spots) {
        if (this.isQueued({ t: 'station', station: s })) continue;
        if (!this.enqueue({ t: 'station', station: s, req: r.id })) break;
        added = true;
      }
      return added;
    }
    if (r.kind === 'needs_out') return this.toggle({ t: 'station', station: 'door', req: r.id });
    if (r.kind === 'flip') return this.toggle({ t: 'station', station: 'grill', req: r.id });
    if (r.kind === 'thermostat') return this.toggle({ t: 'station', station: 'thermostat', req: r.id });

    const target: Target = { t: 'request', req: id };
    if (this.isQueued(target)) {
      this.cancelTarget(target);
      return true;
    }
    const item = FETCH_ITEM[r.kind];
    if (item && this.nick.hand !== item) {
      const st: Target = { t: 'station', station: ITEM_STATION[item] };
      if (!this.isQueued(st)) {
        if (this.queue.length + 2 > QUEUE_MAX) {
          this.toast(NICK_LINES.queueFull);
          return false;
        }
        this.enqueue(st);
      }
    }
    return this.enqueue(target);
  }

  tapStation(s: StationId): boolean {
    return this.toggle({ t: 'station', station: s });
  }

  tapRoom(room: RoomId): boolean {
    return this.toggle({ t: 'room', room });
  }

  tapActor(id: ActorId): boolean {
    const a = this.actors[id];
    if (!a.present) return false;
    if (a.req != null) return this.tapRequest(a.req);
    if (id === 'eloise') {
      const r = this.requests.find((q) => q.kind === 'needs_out');
      if (r) return this.tapRequest(r.id);
    }
    if (a.state === 'carried') return false;
    return this.tapRoom(a.room);
  }

  private toggle(t: Target): boolean {
    if (this.over) return false;
    if (this.isQueued(t)) {
      this.cancelTarget(t);
      return true;
    }
    return this.enqueue(t);
  }

  private enqueue(t: Target): boolean {
    if (this.queue.length >= QUEUE_MAX) {
      this.toast(NICK_LINES.queueFull);
      this.emit({ type: 'sfx', name: 'bad' });
      return false;
    }
    this.queue.push({ id: this.nextId++, target: t });
    this.emit({ type: 'sfx', name: 'tap' });
    this.emit({ type: 'haptic', pattern: 8 });
    return true;
  }

  cancelTarget(t: Target) {
    const q = this.isQueued(t);
    if (q) this.cancelQueue(q.id);
  }

  cancelQueue(qid: number) {
    const i = this.queue.findIndex((q) => q.id === qid);
    if (i < 0) return;
    this.queue.splice(i, 1);
    if (this.interaction?.qid === qid) this.interaction = null;
    this.emit({ type: 'sfx', name: 'tap' });
  }

  dropHand(): boolean {
    const h = this.nick.hand;
    if (h == null || h === 'nora' || h === 'phone') return false;
    this.nick.hand = null;
    this.toast(`Put the ${ITEM_NAMES[h]} down.`);
    return true;
  }

  // ------------------------------------------------------------ interactions
  private buildInteraction(q: QueueItem): Interaction | string {
    const base = { id: this.nextId++, qid: q.id };
    const n = this.nick;
    const t = q.target;
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
          return { ...base, kind: 'hold', title: 'Refill coffee', hint: 'Hold', icon: 'coffee', holdSec: GESTURES.coffeeHoldSec };
        case 'highchair':
        case 'playpen':
          if (n.hand !== 'nora') return 'Nobody to put in it.';
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
          if (!r) return NICK_LINES.doorIdle;
          return { ...base, req: r.id, kind: 'hold', title: 'Let Eloise out', hint: 'Hold', icon: 'door', holdSec: GESTURES.doorHoldSec };
        }
        default: {
          const r = this.requests.find(
            (x) => x.kind === 'lost_shoe' && x.spots?.includes(s) && !x.checked?.includes(s),
          );
          if (!r) return NICK_LINES.emptySpot;
          return { ...base, req: r.id, kind: 'tap', title: `Check ${STATIONS[s].label.toLowerCase()}`, hint: 'Tap', icon: 'shoe' };
        }
      }
    }
    if (t.t !== 'request') return NICK_LINES.nothingHere;
    const r = this.req(t.req);
    if (!r) return NICK_LINES.nothingHere;
    const who = r.owner in CAST ? CAST[r.owner as keyof typeof CAST].name : '';
    const rb = { ...base, req: r.id };
    switch (r.kind) {
      case 'snack':
      case 'juice_box':
      case 'sippy_cup': {
        const item = FETCH_ITEM[r.kind]!;
        if (n.hand !== item) return NICK_LINES.needItem(ITEM_NAMES[item]);
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
        return NICK_LINES.nothingHere;
    }
  }

  // Panel input: the current gesture finished (tap, hold filled, rub done, swipe, mash).
  completeGesture() {
    const it = this.interaction;
    if (!it || this.over) return;
    if (it.kind === 'choice' || it.kind === 'multi') return;
    const q = this.queue.find((x) => x.id === it.qid);
    const target = q?.target;
    const r = this.req(it.req);
    this.emit({ type: 'haptic', pattern: 20 });

    const h = this.nick.hand;
    const busy = h === 'nora' || h === 'phone';
    if (target?.t === 'station') {
      const s = target.station;
      const item = STATION_ITEM[s];
      if (item) {
        if (busy) this.toast(h === 'phone' ? NICK_LINES.handsFullPhone : NICK_LINES.handsBusy);
        else this.nick.hand = item;
        this.emit({ type: 'sfx', name: 'pop' });
      } else if (s === 'coffee') {
        this.nick.coffee = 1;
        this.stats.coffeeRefills++;
        this.emit({ type: 'sfx', name: 'good' });
      } else if (s === 'highchair' || s === 'playpen') {
        this.setDownNora(STATIONS[s].room, true, s);
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
        d.room = 'backyard';
        Object.assign(d, { x: 0.55, y: 0.8 });
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

  // "Not now": abandon the current panel and move on.
  skipInteraction() {
    if (!this.interaction) return;
    this.cancelQueue(this.interaction.qid);
  }

  private finishInteraction() {
    const it = this.interaction;
    if (!it) return;
    this.interaction = null;
    const i = this.queue.findIndex((q) => q.id === it.qid);
    if (i >= 0) this.queue.splice(i, 1);
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
    // Drop queued work aimed at it (including lost-shoe spots tagged with it).
    const dead = this.queue.filter(
      (q) => (q.target.t === 'request' && q.target.req === r.id) || (q.target.t === 'station' && q.target.req === r.id),
    );
    for (const q of dead) {
      const i = this.queue.indexOf(q);
      this.queue.splice(i, 1);
      if (this.interaction?.qid === q.id) this.interaction = null;
    }
    if (this.interaction?.req === r.id) {
      const qid = this.interaction.qid;
      this.interaction = null;
      this.queue = this.queue.filter((q) => q.id !== qid);
    }
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

  private updateRequests(tdt: number) {
    if (tdt <= 0) return;
    const crying = this.cryingKids();
    for (const r of [...this.requests]) {
      if (!isFinite(r.left)) continue;
      let rate = 1;
      const kids = r.kids ?? (KID_IDS.includes(r.owner as KidId) ? [r.owner as KidId] : []);
      if (kids.length) {
        const others = crying.filter((k) => !kids.includes(k)).length;
        rate = 1 + PATIENCE.crySpeedupPerKid * others;
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
    if (a.state === 'carried') this.setDownNora(this.nick.room, false);
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
          if (this.rng.chance(WANDER.moveChance)) a.room = this.rng.pick(neighbors(a.room));
          Object.assign(a, floorPos(this.rng));
        }
        a.nextReq -= tdt;
        if (a.nextReq <= 0) this.spawnKidRequest(k);
      }
    }
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

  setDownNora(room: RoomId, early: boolean, station?: StationId) {
    if (this.nick.hand !== 'nora') return;
    this.nick.hand = null;
    this.nick.carryLeft = 0;
    const n = this.actors.nora;
    n.state = 'idle';
    n.room = room;
    if (station) Object.assign(n, { x: STATIONS[station].x, y: Math.min(0.86, STATIONS[station].y + 0.08) });
    else Object.assign(n, floorPos(this.rng));
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
    if (n.state === 'carried') this.setDownNora(this.nick.room, false);
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
        if (this.rng.chance(0.6)) d.room = this.rng.pick(neighbors(d.room));
        Object.assign(d, floorPos(this.rng));
      }
    }
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
        x: Math.min(0.85, d.x + 0.05),
        y: Math.min(0.88, d.y + 0.04),
        dir: this.rng.pick(['left', 'right', 'up', 'down'] as Dir[]),
      });
      this.say('eloise', '*crash*', 1.5);
      return;
    }
    if (act === 'needs_out') {
      this.dog.needsOutCd = DOG.needsOutCooldownSec;
      d.room = 'backyard';
      Object.assign(d, DOOR_WAIT_POS);
      this.makeRequest('needs_out', 'eloise', 'backyard');
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
    if (n.hand === 'nora') this.setDownNora(n.room, false);
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

export function sameTarget(a: Target, b: Target): boolean {
  if (a.t !== b.t) return false;
  if (a.t === 'room' && b.t === 'room') return a.room === b.room;
  if (a.t === 'station' && b.t === 'station') return a.station === b.station;
  if (a.t === 'request' && b.t === 'request') return a.req === b.req;
  return false;
}
