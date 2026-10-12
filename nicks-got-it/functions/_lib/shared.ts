// Shared helpers for the leaderboard Pages Functions.
export interface Env {
  DB: D1Database;
}

export const TOP_N = 20;
export const MAX_WEEK = 999;
export const MAX_MINUTES = 600; // a week ends at 5:00 PM (5:30 when Kayla runs late): 480-510
export const RUN_TTL_MS = 6 * 60 * 60 * 1000;
// The game clock runs 1.5 game minutes per real second (src/config.ts CLOCK).
// Allow 10% for clock skew and frame-time rounding.
export const MIN_REAL_MS_PER_MINUTE = (1000 / 1.5) * 0.9;

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
    .prepare('SELECT name, week, minutes FROM week_scores ORDER BY week DESC, minutes DESC, created_at ASC LIMIT ?')
    .bind(TOP_N)
    .all<{ name: string; week: number; minutes: number }>();
  return results ?? [];
}
