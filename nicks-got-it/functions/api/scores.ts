// GET  /api/scores -> { scores: [{ name, week, minutes }] }   (top 20: furthest week, then latest time)
// POST /api/scores { runId, name, week, minutes } -> { rank, scores }
import { cleanName, json, MAX_MINUTES, MAX_WEEK, MIN_REAL_MS_PER_MINUTE, RUN_TTL_MS, top, type Env } from '../_lib/shared';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json({ scores: await top(env.DB) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { runId?: unknown; name?: unknown; week?: unknown; minutes?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const name = cleanName(body.name);
  if (!name) return json({ error: 'bad name' }, 400);
  const minutes = body.minutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    return json({ error: 'bad score' }, 400);
  }
  const week = body.week;
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > MAX_WEEK) return json({ error: 'bad week' }, 400);
  if (typeof body.runId !== 'string' || body.runId.length > 64) return json({ error: 'bad run' }, 400);

  const now = Date.now();
  // Claim the run atomically: only an unused, unexpired run that has lasted long enough.
  const claim = await env.DB.prepare(
    'UPDATE runs SET used = 1 WHERE id = ? AND used = 0 AND started_at > ? AND started_at <= ?',
  )
    .bind(body.runId, now - RUN_TTL_MS, now - minutes * MIN_REAL_MS_PER_MINUTE)
    .run();
  if (!claim.meta.changes) return json({ error: 'run not valid for that score' }, 409);

  await env.DB.prepare('INSERT INTO week_scores (name, week, minutes, created_at) VALUES (?, ?, ?, ?)')
    .bind(name, week, minutes, now)
    .run();
  const better = await env.DB.prepare('SELECT COUNT(*) AS n FROM week_scores WHERE week > ? OR (week = ? AND minutes > ?)')
    .bind(week, week, minutes)
    .first<{ n: number }>();
  return json({ rank: (better?.n ?? 0) + 1, scores: await top(env.DB) });
};
