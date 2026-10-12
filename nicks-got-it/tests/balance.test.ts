import { describe, expect, it } from 'vitest';
import { Sim, clockString } from '../src/sim/sim';
import { runBot } from './bot';

function survive(n: number, f: (seed: number) => Sim) {
  const ts: number[] = [];
  for (let i = 0; i < n; i++) ts.push(f(1000 + i * 7919).t);
  ts.sort((a, b) => a - b);
  return { min: ts[0], med: ts[Math.floor(n / 2)], max: ts[n - 1] };
}

describe('balance', () => {
  it('idle player loses in the morning', () => {
    const s = survive(10, (seed) => {
      const sim = new Sim(seed);
      while (!sim.over && sim.t < 900) sim.update(1 / 30);
      return sim;
    });
    console.log('idle', clockString(s.min), clockString(s.med), clockString(s.max));
    expect(s.max).toBeLessThan(180);
  });

  for (const skill of [0.3, 0.7, 1]) {
    it(`bot skill ${skill}`, () => {
      const s = survive(12, (seed) => runBot(seed, { skill, abilities: true }));
      const n = survive(12, (seed) => runBot(seed, { skill, abilities: false }));
      console.log(`skill ${skill} abilities`, clockString(s.min), clockString(s.med), clockString(s.max));
      console.log(`skill ${skill} none     `, clockString(n.min), clockString(n.med), clockString(n.max));
      expect(s.med).toBeGreaterThan(60);
    }, 120_000);
  }
});
