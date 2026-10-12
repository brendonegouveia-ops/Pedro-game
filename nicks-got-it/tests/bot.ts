// Scripted players for balance checks. "skill" scales reaction delays and accuracy.
import { Sim, type Request } from '../src/sim/sim';

export interface BotOpts {
  skill: number; // 0..1
  abilities: boolean;
}

export function runBot(seed: number, opts: BotOpts, maxT = 900): Sim {
  const sim = new Sim(seed);
  const dt = 1 / 30;
  let wait = 0;
  let lastInteraction = -1;
  let uhWait = -1;
  let think = 0;
  const react = 0.25 + (1 - opts.skill) * 0.6;
  while (!sim.over && sim.t < maxT) {
    sim.update(dt);
    sim.drainEvents();
    // FaceTime prompts.
    if (sim.facetime.prompt) {
      if (uhWait < 0) uhWait = react + 0.3;
      uhWait -= dt;
      if (uhWait <= 0) {
        if (Math.random() < 0.6 + 0.4 * opts.skill) sim.answerUhHuh();
        uhWait = 99;
      }
    } else uhWait = -1;

    const it = sim.interaction;
    if (it) {
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
        } else if (it.kind === 'multi') {
          it.multi!.forEach((_, i) => sim.tapMulti(i));
        } else sim.completeGesture();
      }
      continue;
    }
    if (opts.abilities) {
      const urgent = sim.requests.filter((r) => isFinite(r.left) && r.left / r.patience < 0.35);
      if (urgent.length >= 2 && sim.jokeCd <= 0) sim.dadJoke();
      if (sim.requests.some((r) => r.kind === 'screen_time') && sim.bissCd <= 0) sim.becauseISaidSo();
      const dire = sim.requests.find((r) => isFinite(r.left) && r.left < 1.2 && r.kind !== 'flip');
      if (dire && sim.chaos > 60 && sim.kaylaCharges > 0) sim.callKayla(dire.id);
    }
    if (sim.queue.length === 0) {
      think -= dt;
      if (think > 0) continue;
      think = react + 0.2;
      if (sim.nick.coffee < 0.3) {
        sim.tapStation('coffee');
        continue;
      }
      const open = sim.requests
        .filter((r) => r.kind !== 'screen_time' || !opts.abilities || sim.bissCd > 0)
        .sort((a, b) => urgency(a) - urgency(b));
      const r = open[0];
      if (r) sim.tapRequest(r.id);
    }
  }
  return sim;
}

function urgency(r: Request): number {
  if (r.kind === 'thermostat') return 4;
  return r.left;
}
