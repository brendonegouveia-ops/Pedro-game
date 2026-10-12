-- D1 schema for the global leaderboard. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,   -- ms epoch, server clock
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_started ON runs (started_at);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  minutes INTEGER NOT NULL,      -- game minutes survived since 9:00 AM (== real seconds)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (minutes DESC, created_at ASC);
