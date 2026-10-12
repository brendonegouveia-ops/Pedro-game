import { describe, expect, it } from 'vitest';
import { CHAOS, FACETIME, KAYLA_CALL_REPLIES, MOVE, QUEUE_MAX, UPPY } from '../src/config';
import { hops, route } from '../src/sim/house';
import { Sim, clockString, type Request } from '../src/sim/sim';

const step = (sim: Sim, sec: number, dt = 1 / 60) => {
  for (let t = 0; t < sec; t += dt) sim.update(dt);
};

// A sim with nobody making requests, so a test can set up exactly what it needs.
function quiet(seed = 1): Sim {
  const sim = new Sim(seed);
  for (const a of Object.values(sim.actors)) a.nextReq = 1e9;
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
  it('diagonals are two hops through a neighbor', () => {
    expect(hops('kitchen', 'backyard')).toBe(2);
    expect(hops('garage', 'living')).toBe(2);
    expect(route('kitchen', 'backyard')).toEqual(['living', 'backyard']);
    expect(hops('kitchen', 'living')).toBe(1);
  });

  it('walking a diagonal takes 2 x 0.5 s, and 40% slower on low coffee', () => {
    const sim = quiet();
    sim.nick.room = 'kitchen';
    sim.tapRoom('backyard');
    step(sim, 2 * MOVE.hopSec - 0.05);
    expect(sim.nick.room).not.toBe('backyard');
    step(sim, 0.1);
    expect(sim.nick.room).toBe('backyard');

    const slow = quiet();
    slow.nick.room = 'kitchen';
    slow.nick.coffee = 0.2;
    slow.tapRoom('living');
    step(slow, MOVE.hopSec + 0.05);
    expect(slow.nick.room).toBe('kitchen');
    step(slow, MOVE.hopSec / MOVE.lowCoffeeSpeed - MOVE.hopSec);
    expect(slow.nick.room).toBe('living');
  });
});

describe('queue', () => {
  it('caps at 4 and a second tap cancels', () => {
    const sim = quiet();
    expect(sim.tapStation('coffee')).toBe(true);
    sim.tapStation('snacks');
    sim.tapStation('grill');
    sim.tapRoom('garage');
    expect(sim.queue.length).toBe(QUEUE_MAX);
    expect(sim.tapStation('door')).toBe(false);
    sim.tapStation('snacks');
    expect(sim.queue.length).toBe(3);
  });

  it('a fetch request queues the kitchen first, then the delivery', () => {
    const sim = quiet();
    const r = inject(sim, { kind: 'snack', owner: 'evelyn', room: 'living' });
    sim.tapRequest(r.id);
    expect(sim.queue.map((q) => q.target)).toEqual([
      { t: 'station', station: 'snacks' },
      { t: 'request', req: r.id },
    ]);
    step(sim, 0.6);
    expect(sim.interaction?.title).toMatch(/Grab snack/);
    sim.completeGesture();
    expect(sim.nick.hand).toBe('snack');
    step(sim, 0.6);
    expect(sim.interaction?.req).toBe(r.id);
    sim.completeGesture();
    expect(sim.requests).not.toContain(r);
    expect(sim.nick.hand).toBe(null);
  });

  it('other timers keep running during a gesture', () => {
    const sim = quiet();
    const a = inject(sim, { kind: 'diaper', owner: 'nora', room: 'living' });
    const b = inject(sim, { kind: 'watch_this', owner: 'evelyn', room: 'living' });
    sim.tapRequest(a.id);
    step(sim, 0.1);
    expect(sim.interaction?.kind).toBe('hold');
    step(sim, 2);
    expect(b.left).toBeLessThan(6.2);
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
    const r = inject(sim, { kind: 'screen_time', owner: 'evelyn', room: 'living' });
    sim.tapRequest(r.id);
    step(sim, 0.05);
    sim.choose(0);
    expect(sim.chaos).toBe(0);
    step(sim, 59);
    expect(sim.actors.evelyn.state).toBe('idle');
    step(sim, 1.2);
    expect(sim.actors.evelyn.state).toBe('crying');
    expect(sim.chaos).toBeGreaterThanOrEqual(CHAOS.expireKid * 2);
  });

  it('booboo: dirt is instant +3, band-aid needs one in hand then RUB', () => {
    const sim = quiet();
    const r = inject(sim, { kind: 'booboo', owner: 'evelyn', room: 'living' });
    sim.tapRequest(r.id);
    step(sim, 0.05);
    expect(sim.interaction?.options?.[0].enabled).toBe(false);
    sim.choose(1);
    expect(sim.chaos).toBe(CHAOS.dirt);
    expect(sim.requests).not.toContain(r);

    const s2 = quiet();
    s2.nick.hand = 'bandaid';
    const r2 = inject(s2, { kind: 'booboo', owner: 'evelyn', room: 'living' });
    s2.tapRequest(r2.id);
    step(s2, 0.05);
    s2.choose(0);
    expect(s2.interaction?.kind).toBe('rub');
    s2.completeGesture();
    expect(s2.requests).not.toContain(r2);
    expect(s2.nick.hand).toBe(null);
  });

  it('lost shoe queues its 3 garage spots and resolves on the third', () => {
    const sim = quiet();
    const r = inject(sim, { kind: 'lost_shoe', owner: 'evelyn', room: 'living', spots: ['spot_bin', 'spot_cooler', 'spot_bike'], checked: [], left: 50, patience: 50 });
    sim.tapRequest(r.id);
    expect(sim.queue.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      step(sim, 1.1);
      expect(sim.interaction?.kind).toBe('tap');
      sim.completeGesture();
    }
    expect(sim.requests).not.toContain(r);
  });

  it('uppy holds the free hand; early set-down can cry', () => {
    let cried = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sim = quiet(seed);
      sim.actors.nora.present = true;
      const r = inject(sim, { kind: 'uppy', owner: 'nora', room: 'living' });
      sim.tapRequest(r.id);
      step(sim, 0.05);
      sim.completeGesture();
      expect(sim.nick.hand).toBe('nora');
      sim.tapStation('snacks');
      step(sim, 0.6);
      expect(sim.interaction).toBe(null); // can't grab with Nora on the hip
      sim.tapStation('highchair');
      step(sim, 0.1);
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
    sim.tapStation('thermostat');
    step(sim, 0.05);
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
