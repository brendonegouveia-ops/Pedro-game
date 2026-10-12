// localStorage wrapper. Every access is guarded (private mode, blocked storage, etc.).
const KEY = 'nicks-got-it:v1';

export interface Saved {
  sound: boolean;
  haptics: boolean;
  name: string;
  best: number; // game minutes survived
  seenHelp: boolean;
}

const DEFAULTS: Saved = { sound: false, haptics: true, name: '', best: 0, seenHelp: false };

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
