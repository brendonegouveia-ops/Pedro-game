// Scripted players for balance checks. They walk the real floor plan (same steering as a held
// finger), stop on top of their target, and do the gesture after a human-ish delay.
import { MOVE } from '../src/config';
import { STATIONS, dist, type StationId } from '../src/sim/house';
import { Sim, type Request } from '../src/sim/sim';

export interface BotOpts {
  skill: number; // 0..1
  abilities: boolean;
}

const ITEM_STATION: Record<string, StationId> = { snack: 'snacks', juice_box: 'juice', sippy_cup: 'sippy' };

function goalFor(sim: Sim, r: Request): { x: number; y: number } {
  const st = ITEM_STATION[r.kind];
  if (st && sim.nick.hand !== st.replace('snacks', 'snack').replace('juice', 'juice_box').replace('sippy', 'sippy_cup')) {
    return STATIONS[st];
  }
  if (r.kind === 'booboo' && sim.nick.hand !== 'bandaid' && sim.nick.room === 'garage') return STATIONS.bandaids;
  if (r.kind === 'lost_shoe') {
    const left = (r.spots ?? []).filter((s) => !r.checked?.includes(s));
    left.sort((a, b) => dist(sim.nick.x, sim.nick.y, STATIONS[a].x, STATIONS[a].y) - dist(sim.nick.x, sim.nick.y, STATIONS[b].x, STATIONS[b].y));
    return STATIONS[left[0]];
  }
  const a = sim.anchorOf(r);
  return { x: a.x, y: a.y - 6 };
}

export function runBot(seed: number, opts: BotOpts, maxT = 900): Sim {
  const sim = new Sim(seed);
  const dt = 1 / 30;
  const react = 0.25 + (1 - opts.skill) * 0.6;
  let wait = 0;
  let lastInteraction = -1;
  let uhWait = -1;
  let think = 0;
  let stuck = 0;
  let goal: { x: number; y: number } | null = null;
  while (!sim.over && sim.t < maxT) {
    sim.update(dt);
    sim.drainEvents();
    if (sim.facetime.prompt) {
      if (uhWait < 0) uhWait = react + 0.3;
      uhWait -= dt;
      if (uhWait <= 0) {
        if (Math.random() < 0.6 + 0.4 * opts.skill) sim.answerUhHuh();
        uhWait = 99;
      }
    } else uhWait = -1;

    if (opts.abilities) {
      const urgent = sim.requests.filter((r) => isFinite(r.left) && r.left / r.patience < 0.35);
      if (urgent.length >= 2 && sim.jokeCd <= 0) sim.dadJoke();
      if (sim.requests.some((r) => r.kind === 'screen_time') && sim.bissCd <= 0) sim.becauseISaidSo();
      const dire = sim.requests.find((r) => isFinite(r.left) && r.left < 1.2 && r.kind !== 'flip');
      if (dire && sim.chaos > 60 && sim.kaylaCharges > 0) sim.callKayla(dire.id);
    }

    const it = sim.interaction;
    if (it && !sim.steering) {
      if (it.id !== lastInteraction) {
        lastInteraction = it.id;
        const g = it.kind;
        wait =
          react +
          (g === 'hold' ? it.holdSec! + 0.1 : g === 'rub' ? 1.3 + (1 - opts.skill) : g === 'mash' ? 1.3 + (1 - opts.skill) * 0.8 : g === 'multi' ? 0.5 : g === 'choice' ? 0.4 : 0.15);
      }
      wait -= dt;
      if (wait <= 0) {
        if (it.kind === 'choice') {
          const r = sim.req(it.req);
          if (r?.kind === 'screen_time') sim.choose(1);
          else sim.choose(it.options![0].enabled ? 0 : 1);
        } else if (it.kind === 'multi') it.multi!.forEach((_, i) => sim.tapMulti(i));
        else sim.completeGesture();
        goal = null;
      }
      continue;
    }

    // Walk to the goal; stop when close or when Nick can't get any closer (goal by a wall).
    if (goal && dist(sim.nick.x, sim.nick.y, goal.x, goal.y) > 12) {
      const wasSteering = sim.steering;
      sim.setMoveTarget(goal);
      if (!wasSteering || sim.nick.moving) stuck = 0;
      else if ((stuck += dt) < 0.2) continue;
      else goal = null;
      if (goal) continue;
    }
    sim.setMoveTarget(null);
    think -= dt;
    if (think > 0) continue;
    think = react + 0.2;
    if (sim.nick.coffee < 0.3) {
      goal = STATIONS.coffee;
      continue;
    }
    const open = sim.requests
      .filter((r) => r.kind !== 'screen_time' || !opts.abilities || sim.bissCd > 0)
      .sort((a, b) => (a.kind === 'thermostat' ? 4 : a.left) - (b.kind === 'thermostat' ? 4 : b.left));
    goal = open[0] ? goalFor(sim, open[0]) : null;
    void MOVE;
  }
  return sim;
}
