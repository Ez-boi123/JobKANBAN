import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError } from './domain.mjs';

export function openStore(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rounds (job_id TEXT NOT NULL REFERENCES jobs(id), stage TEXT NOT NULL, round TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(job_id, stage, round));`);
  function list() { return db.prepare('SELECT data FROM jobs ORDER BY rowid DESC').all().map(row => JSON.parse(row.data)); }
  function save(job, id, version, transform) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (id) {
        if (!Number.isSafeInteger(version) || version < 1) throw new HttpError(400, '请提供记录版本');
        const row = db.prepare('SELECT version,data FROM jobs WHERE id=?').get(id);
        if (!row) throw new HttpError(404, '未找到求职记录');
        if (row.version !== version) throw new HttpError(409, '记录已被更新，请刷新后重试');
        job = transform(JSON.parse(row.data));
      }
      db.prepare('INSERT INTO jobs(id,version,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data').run(job.id, job.version, JSON.stringify(job));
      for (const event of job.history) db.prepare('INSERT OR IGNORE INTO history(id,job_id,data) VALUES(?,?,?)').run(event.id, job.id, JSON.stringify(event));
      for (const round of job.rounds) db.prepare('INSERT INTO rounds(job_id,stage,round,data) VALUES(?,?,?,?) ON CONFLICT(job_id,stage,round) DO UPDATE SET data=excluded.data').run(job.id, round.stage, round.round, JSON.stringify(round));
      db.exec('COMMIT');
      return job;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { list, save, mutate: (id, version, transform) => save(null, id, version, transform), close: () => db.close() };
}
