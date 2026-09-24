CREATE TABLE config (
  id INTEGER PRIMARY KEY CHECK(id = 1), source TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT -1, enabled INTEGER NOT NULL DEFAULT 0,
  recipient TEXT NOT NULL DEFAULT '', lock_until INTEGER NOT NULL DEFAULT 0,
  test_after INTEGER NOT NULL DEFAULT 0
);
INSERT INTO config(id) VALUES(1);
CREATE TABLE actions (
  id TEXT PRIMARY KEY, generation TEXT NOT NULL, payload TEXT NOT NULL, ends INTEGER NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, generation TEXT NOT NULL,
  due INTEGER NOT NULL, next_try INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, batch_id TEXT,
  error TEXT NOT NULL DEFAULT '', test_recipient TEXT
);
CREATE INDEX tasks_due ON tasks(state, next_try);
CREATE INDEX tasks_job ON tasks(job_id, generation);
