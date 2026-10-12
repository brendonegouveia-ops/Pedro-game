// Client for the Pages Functions leaderboard (functions/api/*). Everything fails soft:
// with no backend (local vite dev, offline) the game still plays and shows "offline".
export interface ScoreRow {
  name: string;
  minutes: number;
}

const TIMEOUT_MS = 6000;

async function req<T>(path: string, init?: RequestInit): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ac.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function beginRun(): Promise<string | null> {
  const r = await req<{ runId: string }>('/api/run', { method: 'POST', body: '{}' });
  return r?.runId ?? null;
}

export async function topScores(): Promise<ScoreRow[] | null> {
  const r = await req<{ scores: ScoreRow[] }>('/api/scores');
  return r?.scores ?? null;
}

export async function submitScore(
  runId: string,
  name: string,
  minutes: number,
): Promise<{ rank: number; scores: ScoreRow[] } | { error: string } | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, name, minutes }),
    });
    const body = (await res.json().catch(() => null)) as { rank: number; scores: ScoreRow[]; error?: string } | null;
    if (!res.ok) return { error: body?.error ?? `HTTP ${res.status}` };
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
