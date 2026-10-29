import { describe, expect, it } from 'vitest';
import { Sim, clockString } from '../src/sim/sim';
import { runBot, type BotOpts } from './bot';

const SEEDS = 12;
function report(label: string, f: (seed: number) => Sim) {
  const runs = Array.from({ length: SEEDS }, (_, i) => f(1000 + i * 7919));
  const wins = runs.filter((s) => s.won).length;
  const ends = runs.map((s) => s.gm).sort((a, b) => a - b);
  console.log(`${label.padEnd(26)} wins ${String(wins).padStart(2)}/${SEEDS}  median end ${clockString(ends[SEEDS >> 1])}  worst ${clockString(ends[0])}`);
  return { wins, med: ends[SEEDS >> 1] };
}
const bot = (week: number, o: BotOpts) => (seed: number) => runBot(seed, o, 900, week);

describe('balance', () => {
  it('idle player loses in the morning', () => {
    const r = report('idle', (seed) => {
      const sim = new Sim(seed);
      while (!sim.over) sim.update(1 / 30);
      return sim;
    });
    expect(r.wins).toBe(0);
    expect(r.med).toBeLessThan(180);
  });

  for (const week of [1, 2, 4]) {
    it(`week ${week}`, () => {
      const slow = report(`week ${week} slow bot`, bot(week, { skill: 0.3, abilities: true }));
      report(`week ${week} sharp bot`, bot(week, { skill: 0.7, abilities: true }));
      report(`week ${week} perfect bot`, bot(week, { skill: 1, abilities: true }));
      if (week === 1) expect(slow.wins).toBeGreaterThan(0);
    }, 180_000);
  }
});
