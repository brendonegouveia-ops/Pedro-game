// localStorage wrapper. Every access is guarded (private mode, blocked storage, etc.).
const KEY = 'nicks-got-it:v1';

export interface Saved {
  sound: boolean;
  haptics: boolean;
  name: string;
  best: number; // legacy (pre-weeks) best, unused
  bestWeek: number; // best run: furthest week, then latest clock time in it
  bestMin: number;
  unlocked: number; // highest week the player may start
  week: number; // week selected on the title screen
  seenHelp: boolean;
}

const DEFAULTS: Saved = { sound: false, haptics: true, name: '', best: 0, bestWeek: 0, bestMin: 0, unlocked: 1, week: 1, seenHelp: false };

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
