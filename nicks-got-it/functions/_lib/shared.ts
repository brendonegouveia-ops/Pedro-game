// Shared helpers for the leaderboard Pages Functions.
export interface Env {
  DB: D1Database;
}

export const TOP_N = 20;
export const MAX_MINUTES = 24 * 60; // 9:00 AM to 9:00 AM next day
export const RUN_TTL_MS = 6 * 60 * 60 * 1000;
// 1 game minute = 1 real second. Allow 10% for clock skew and frame-time rounding.
export const MIN_REAL_MS_PER_MINUTE = 900;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Letters, digits, spaces and a little punctuation; 1-14 chars after trimming.
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} .'_-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
  return s.length ? s : null;
}

export async function top(db: D1Database) {
  const { results } = await db
    .prepare('SELECT name, minutes FROM scores ORDER BY minutes DESC, created_at ASC LIMIT ?')
    .bind(TOP_N)
    .all<{ name: string; minutes: number }>();
  return results ?? [];
}
