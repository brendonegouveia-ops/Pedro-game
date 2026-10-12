// POST /api/run -> { runId }. Records a server-side start time so a submitted score
// can't claim more game minutes than real seconds have passed since the run began.
import { json, RUN_TTL_MS, type Env } from '../_lib/shared';

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM runs WHERE started_at < ?').bind(now - RUN_TTL_MS),
    env.DB.prepare('INSERT INTO runs (id, started_at) VALUES (?, ?)').bind(id, now),
  ]);
  return json({ runId: id });
};
