import { describe, expect, it } from 'vitest';
import { CHAOS, FACETIME, KAYLA_CALL_REPLIES, MOVE, PATIENCE, UPPY } from '../src/config';
import { ROOM_IDS, ROOM_RECTS, STATIONS, STATION_IDS, WALLS, blocked, dist, hops, roomPath, type StationId } from '../src/sim/house';
import { Sim, clockString, type Request } from '../src/sim/sim';

const step = (sim: Sim, sec: number, dt = 1 / 60) => {
  for (let t = 0; t < sec; t += dt) sim.update(dt);
};

// Hold a finger on (x, y) until Nick arrives, then let go (one frame to settle).
function walkTo(sim: Sim, x: number, y: number, max = 10) {
  sim.setMoveTarget({ x, y });
  let t = 0;
  while (t < max && dist(sim.nick.x, sim.nick.y, x, y) > 6) {
    sim.update(1 / 60);
    t += 1 / 60;
  }
  sim.setMoveTarget(null);
  sim.update(1 / 60);
  return t;
}
const walkToStation = (sim: Sim, s: StationId) => walkTo(sim, STATIONS[s].x, STATIONS[s].y);

// A sim with nobody making requests, so a test can set up exactly what it needs.
function quiet(seed = 1): Sim {
  const sim = new Sim(seed);
  for (const a of Object.values(sim.actors)) {
    a.nextReq = 1e9;
    a.nextWander = 1e9;
    a.dest = null;
  }
  sim.thermostatAt = Infinity;
  sim.nextAmbient = Infinity;
  sim.dog.nextAction = 1e9;
  return sim;
}

function inject(sim: Sim, r: Partial<Request> & Pick<Request, 'kind' | 'owner' | 'room'>): Request {
  const req: Request = { id: 9000 + sim.requests.length, patience: 8, left: 8, ...r };
  sim.requests.push(req);
  if (r.owner === 'evelyn' || r.owner === 'nora' || r.owner === 'tyler') sim.actors[r.owner].req = req.id;
  return req;
}

// Put a kid somewhere in the living room and stand Nick next to them.
function kidHere(sim: Sim, id: 'evelyn' | 'nora' | 'tyler', x = 300, y = 300) {
  Object.assign(sim.actors[id], { present: true, x, y, room: 'living', state: 'idle', dest: null });
  sim.nick.x = x + 20;
  sim.nick.y = y;
}

describe('clock', () => {
  it('formats game minutes', () => {
    expect(clockString(0)).toBe('9:00 AM');
    expect(clockString(167)).toBe('11:47 AM');
    expect(clockString(287)).toBe('1:47 PM');
    expect(clockString(540)).toBe('6:00 PM');
    expect(clockString(900)).toBe('12:00 AM');
  });
});

describe('house', () => {
  it('rooms connect through doorways; garage to backyard is two hops', () => {
    expect(hops('garage', 'backyard')).toBe(2);
    expect(hops('kitchen', 'living')).toBe(1);
    expect(roomPath('garage', 'backyard').length).toBe(2);
  });

  it('walls block', () => {
    for (const w of WALLS) expect(blocked(w.x + w.w / 2, w.y + w.h / 2, MOVE.radius)).toBe(true);
  });

  it('Nick can walk from every room to every station', () => {
    for (const r of ROOM_IDS)
      for (const s of STATION_IDS) {
        const sim = quiet();
        const R = ROOM_RECTS[r];
        sim.nick.x = R.x + R.w / 2;
        sim.nick.y = R.y + R.h / 2;
        const t = walkToStation(sim, s);
        expect(t, `${r} -> ${s}`).toBeLessThan(6);
      }
  });

  it('walking from one doorway to another never pins Nick on a doorframe', () => {
    const doors = [
      [84, 163],
      [328, 163],
      [136, 353],
      [191, 462],
    ];
    for (const [ax, ay] of doors)
      for (const [bx, by] of doors) {
        if (ax === bx && ay === by) continue;
        const sim = quiet();
        sim.nick.x = ax;
        sim.nick.y = ay;
        sim.setMoveTarget({ x: bx, y: by });
        let t = 0;
        while (t < 6 && dist(sim.nick.x, sim.nick.y, bx, by) > 12) {
          sim.update(1 / 60);
          t += 1 / 60;
        }
        expect(t, `door (${ax},${ay}) -> (${bx},${by})`).toBeLessThan(6);
      }
  });

  it('low coffee makes Nick 40% slower', () => {
    const a = quiet();
    const b = quiet();
    b.nick.coffee = 0.2;
    const ta = walkTo(a, 300, 480);
    const tb = walkTo(b, 300, 480);
    expect(tb / ta).toBeCloseTo(1 / MOVE.lowCoffeeSpeed, 1);
  });
});

describe('jobs', () => {
  it('stopping next to a station offers its job; walking hides it', () => {
    const sim = quiet();
    walkToStation(sim, 'snacks');
    expect(sim.interaction?.title).toMatch(/Grab snack/);
    sim.setMoveTarget({ x: 300, y: 300 });
    sim.update(1 / 60);
    expect(sim.interaction).toBe(null);
  });

  it('fetch: grab at the counter, deliver at the kid', () => {
    const sim = quiet();
    kidHere(sim, 'evelyn', 300, 300);
    const r = inject(sim, { kind: 'snack', owner: 'evelyn', room: 'living' });
    sim.update(1 / 60);
    expect(sim.interaction).toBe(null);
    expect(sim.note).toMatch(/snack/);
    walkToStation(sim, 'snacks');
    sim.completeGesture();
    expect(sim.nick.hand).toBe('snack');
    walkTo(sim, 320, 300);
    expect(sim.interaction?.req).toBe(r.id);
    sim.completeGesture();
    expect(sim.requests).not.toContain(r);
    expect(sim.nick.hand).toBe(null);
  });

  it('on my way: grabbing what a kid wants tops up and slows their timer', () => {
    const sim = quiet();
    kidHere(sim, 'evelyn', 300, 300);
    const r = inject(sim, { kind: 'juice_box', owner: 'evelyn', room: 'living', patience: 10, left: 2 });
    walkToStation(sim, 'juice');
    sim.completeGesture();
    expect(sim.promisedId).toBe(r.id);
    expect(r.left).toBeGreaterThanOrEqual(10 * PATIENCE.promisedTopUp - 2);
    const before = r.left;
    step(sim, 1);
    expect(before - r.left).toBeCloseTo(PATIENCE.promisedRate, 1);
  });

  it('a crying kid takes the item Nick is holding and stops crying', () => {
    const sim = quiet();
    kidHere(sim, 'tyler', 300, 300);
    Object.assign(sim.actors.tyler, { state: 'crying', cryLeft: 10 });
    sim.nick.hand = 'snack';
    sim.chaos = 20;
    sim.update(1 / 60);
    expect(sim.interaction?.target).toEqual({ t: 'kid', kid: 'tyler' });
    sim.completeGesture();
    expect(sim.actors.tyler.state).toBe('idle');
    expect(sim.nick.hand).toBe(null);
    expect(sim.chaos).toBeLessThan(20);
  });

  it('engaged in a gesture: Nick cannot move, other timers keep running', () => {
    const sim = quiet();
    kidHere(sim, 'nora', 300, 300);
    inject(sim, { kind: 'diaper', owner: 'nora', room: 'living' });
    const b = inject(sim, { kind: 'snack', owner: 'evelyn', room: 'kitchen', left: 8 });
    sim.update(1 / 60);
    expect(sim.interaction?.kind).toBe('hold');
    sim.engage(true);
    const x = sim.nick.x;
    sim.setMoveTarget({ x: 20, y: 20 });
    step(sim, 1);
    expect(sim.nick.x).toBe(x);
    expect(b.left).toBeLessThan(7.1);
  });

  it('watch_this works from anywhere in the same room', () => {
    const sim = quiet();
    kidHere(sim, 'evelyn', 230, 480);
    sim.nick.x = 360;
    sim.nick.y = 200;
    inject(sim, { kind: 'watch_this', owner: 'evelyn', room: 'living' });
    sim.update(1 / 60);
    expect(sim.interaction?.kind).toBe('hold');
  });
});

describe('requests', () => {
  it('expired kid request: cry, chaos, and other kids speed up 20%', () => {
    const sim = quiet();
    sim.actors.nora.present = true;
    const a = inject(sim, { kind: 'diaper', owner: 'nora', room: 'living', left: 0.01 });
    const b = inject(sim, { kind: 'snack', owner: 'evelyn', room: 'living', left: 8 });
    step(sim, 0.05, 0.05);
    expect(sim.requests).not.toContain(a);
    expect(sim.actors.nora.state).toBe('crying');
    expect(sim.chaos).toBeGreaterThanOrEqual(CHAOS.expireKid);
    const before = b.left;
    step(sim, 1, 0.05);
    expect(before - b.left).toBeCloseTo(1.2, 1);
  });

  it('screen time: Yes melts down 60 s later at 2x', () => {
    const sim = quiet();
    kidHere(sim, 'evelyn');
    inject(sim, { kind: 'screen_time', owner: 'evelyn', room: 'living' });
    sim.update(1 / 60);
    sim.choose(0);
    expect(sim.chaos).toBe(0);
    sim.actors.evelyn.nextReq = 1e9; // resolving re-arms her next request; keep her quiet
    step(sim, 59);
    expect(sim.actors.evelyn.state).toBe('idle');
    step(sim, 1.2);
    expect(sim.actors.evelyn.state).toBe('crying');
    expect(sim.chaos).toBeGreaterThanOrEqual(CHAOS.expireKid * 2);
  });

  it('booboo: dirt is instant +3, band-aid needs one in hand then RUB', () => {
    const sim = quiet();
    kidHere(sim, 'evelyn');
    const r = inject(sim, { kind: 'booboo', owner: 'evelyn', room: 'living' });
    sim.update(1 / 60);
    expect(sim.interaction?.options?.[0].enabled).toBe(false);
    sim.choose(1);
    expect(sim.chaos).toBe(CHAOS.dirt);
    expect(sim.requests).not.toContain(r);

    const s2 = quiet();
    s2.nick.hand = 'bandaid';
    kidHere(s2, 'evelyn');
    const r2 = inject(s2, { kind: 'booboo', owner: 'evelyn', room: 'living' });
    s2.update(1 / 60);
    s2.choose(0);
    s2.update(1 / 60); // focus keeps the rub (same job) instead of rebuilding the choice
    expect(s2.interaction?.kind).toBe('rub');
    s2.completeGesture();
    expect(s2.requests).not.toContain(r2);
    expect(s2.nick.hand).toBe(null);
  });

  it('lost shoe: check its 3 garage spots; the third has it', () => {
    const sim = quiet();
    const r = inject(sim, { kind: 'lost_shoe', owner: 'evelyn', room: 'living', spots: ['spot_bin', 'spot_cooler', 'spot_bike'], checked: [], left: 50, patience: 50 });
    walkToStation(sim, 'spot_toolbox');
    expect(sim.interaction).toBe(null); // not one of this shoe's spots
    for (const s of ['spot_bin', 'spot_cooler', 'spot_bike'] as const) {
      walkToStation(sim, s);
      expect(sim.interaction?.kind).toBe('tap');
      sim.completeGesture();
    }
    expect(sim.requests).not.toContain(r);
  });

  it('uppy holds the free hand; early set-down can cry', () => {
    let cried = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sim = quiet(seed);
      kidHere(sim, 'nora');
      inject(sim, { kind: 'uppy', owner: 'nora', room: 'living' });
      sim.update(1 / 60);
      sim.completeGesture();
      expect(sim.nick.hand).toBe('nora');
      walkToStation(sim, 'snacks');
      expect(sim.interaction).toBe(null); // can't grab with Nora on the hip
      walkToStation(sim, 'highchair');
      sim.completeGesture();
      expect(sim.nick.hand).toBe(null);
      if (sim.actors.nora.state === 'crying') cried++;
    }
    expect(cried / 200).toBeGreaterThan(UPPY.earlyDropCryChance - 0.1);
    expect(cried / 200).toBeLessThan(UPPY.earlyDropCryChance + 0.1);
  });
});

describe('systems', () => {
  it('burnt burger: smoke alarm +15 and wakes a napping Nora (+10)', () => {
    const sim = quiet();
    sim.t = 239;
    sim.actors.nora.present = true;
    step(sim, 2);
    expect(sim.nap.state).toBe('asleep');
    sim.chaos = 0;
    const flip = inject(sim, { kind: 'flip', owner: 'grill', room: 'backyard', left: 0.01 });
    step(sim, 0.05, 0.05);
    expect(sim.requests).not.toContain(flip);
    expect(sim.nap.state).toBe('woken');
    expect(sim.chaos).toBeGreaterThanOrEqual(CHAOS.smokeAlarm + CHAOS.napWake - 0.1);
  });

  it('FaceTime: phone in hand for 20 s, each missed uh-huh is +5', () => {
    const sim = quiet();
    sim.t = 359.9;
    sim.nick.hand = 'snack';
    step(sim, 0.2);
    expect(sim.nick.hand).toBe('phone');
    step(sim, FACETIME.durationSec + 1);
    expect(sim.facetime.missed).toBe(5);
    expect(sim.chaosBy.facetime).toBe(5 * CHAOS.missedUhHuh);
    expect(sim.nick.hand).toBe('snack');
  });

  it('dad joke freezes request timers for 3 s', () => {
    const sim = quiet();
    const r = inject(sim, { kind: 'watch_this', owner: 'evelyn', room: 'living' });
    expect(sim.dadJoke()).toBeTruthy();
    step(sim, 2.9);
    expect(r.left).toBe(8);
    expect(sim.dadJoke()).toBe(null);
    step(sim, 1);
    expect(r.left).toBeLessThan(8);
  });

  it('Call Kayla: 2 charges, replies get shorter', () => {
    const sim = quiet();
    const a = inject(sim, { kind: 'diaper', owner: 'nora', room: 'living' });
    const b = inject(sim, { kind: 'snack', owner: 'evelyn', room: 'living' });
    const c = inject(sim, { kind: 'snack', owner: 'tyler', room: 'living' });
    expect(sim.callKayla(a.id)).toBe(KAYLA_CALL_REPLIES[0]);
    expect(sim.callKayla(b.id)).toBe(KAYLA_CALL_REPLIES[1]);
    expect(sim.callKayla(c.id)).toBe(null);
    expect(KAYLA_CALL_REPLIES[1].length).toBeLessThan(KAYLA_CALL_REPLIES[0].length);
  });

  it('Because I Said So clears every screen_time at once', () => {
    const sim = quiet();
    inject(sim, { kind: 'screen_time', owner: 'evelyn', room: 'living' });
    inject(sim, { kind: 'screen_time', owner: 'tyler', room: 'kitchen' });
    inject(sim, { kind: 'snack', owner: 'nora', room: 'kitchen' });
    expect(sim.becauseISaidSo()).toBe(2);
    expect(sim.requests.map((r) => r.kind)).toEqual(['snack']);
    expect(sim.becauseISaidSo()).toBe(0);
  });

  it('thermostat adds 0.5 chaos/s until swiped', () => {
    const sim = quiet();
    sim.thermostatAt = 0;
    step(sim, 0.05);
    expect(sim.requests.some((r) => r.kind === 'thermostat')).toBe(true);
    sim.chaos = 50;
    step(sim, 4);
    expect(sim.chaos).toBeCloseTo(52, 0);
    walkToStation(sim, 'thermostat');
    expect(sim.interaction?.kind).toBe('swipe');
    sim.completeGesture();
    expect(sim.requests.some((r) => r.kind === 'thermostat')).toBe(false);
  });

  it('the run ends at 100 chaos and the timeline fires on schedule', () => {
    const sim = new Sim(5);
    step(sim, 61, 0.05);
    expect(sim.actors.nora.present).toBe(true);
    sim.addChaos(200, 'default');
    expect(sim.over).toBe(true);
    expect(sim.chaos).toBe(100);
  });
});
