-- D1 schema for the global leaderboard. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,   -- ms epoch, server clock
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_started ON runs (started_at);

-- One row per run that ended: the week it was in and the clock time reached that week.
CREATE TABLE IF NOT EXISTS week_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  week INTEGER NOT NULL,
  minutes INTEGER NOT NULL,      -- game minutes since 9:00 AM reached in that week
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS week_scores_rank ON week_scores (week DESC, minutes DESC, created_at ASC);
