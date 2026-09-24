import { actionEnd, DAY, validEmail } from "../../shared/reminders.mjs";
import { MailError } from "./smtp.ts";

export interface CloudAction {
  id: string;
  generation: string;
  company: string;
  role: string;
  action: string;
  date: string;
  dateType: string;
  plans: { slot: string; at: number }[];
}
interface Snapshot {
  source: string;
  revision: number;
  enabled: boolean;
  recipient: string;
  actions: CloudAction[];
}
interface Config {
  source: string;
  revision: number;
  enabled: number;
  recipient: string;
}
interface Task {
  id: string;
  job_id: string;
  generation: string;
  due: number;
  attempts: number;
  test_recipient: string | null;
}
export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function short(value: unknown, max = 300): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function identifier(value: unknown): value is string {
  return short(value, 80) && /^[a-zA-Z0-9-]+$/.test(value);
}
export function validateSnapshot(
  value: unknown,
  recipient: string,
): asserts value is Snapshot {
  if (
    !object(value) ||
    !identifier(value.source) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    typeof value.enabled !== "boolean" ||
    typeof value.recipient !== "string" ||
    !Array.isArray(value.actions) ||
    value.actions.length > 1000
  )
    throw new InputError("同步格式无效");
  if (
    (value.enabled && value.recipient !== recipient) ||
    (value.recipient && !validEmail(value.recipient)) ||
    (!value.enabled && value.actions.length)
  )
    throw new InputError("收件邮箱须与云端配置一致");
  const ids = new Set();
  for (const a of value.actions) {
    if (
      !object(a) ||
      !identifier(a.id) ||
      !identifier(a.generation) ||
      !short(a.company) ||
      !short(a.role) ||
      !short(a.action) ||
      !short(a.date, 40) ||
      !["deadline", "appointment"].includes(String(a.dateType)) ||
      !Number.isFinite(actionEnd(a.date)) ||
      !Array.isArray(a.plans) ||
      a.plans.length > 2 ||
      ids.has(a.id)
    )
      throw new InputError("行动数据无效");
    ids.add(a.id);
    const slots = new Set();
    for (const p of a.plans) {
      if (
        !object(p) ||
        !["0", "1", "catchup"].includes(String(p.slot)) ||
        !Number.isSafeInteger(p.at) ||
        Number(p.at) > actionEnd(a.date) ||
        slots.has(p.slot)
      )
        throw new InputError("提醒时间无效");
      slots.add(p.slot);
    }
  }
}
export async function syncSnapshot(
  db: D1Database,
  payload: unknown,
  recipient: string,
  now: number,
) {
  validateSnapshot(payload, recipient);
  const state = await db
    .prepare("SELECT * FROM config WHERE id=1")
    .first<Config>();
  if (
    !state ||
    (state.source && state.source !== payload.source) ||
    state.revision > payload.revision
  )
    throw new InputError("云端已绑定其他数据源或存在更新版本", 409);
  if (state.revision === payload.revision)
    return { revision: payload.revision };
  // One atomic batch. Each write is guarded against a racing newer snapshot.
  const gate =
    "EXISTS(SELECT 1 FROM config WHERE id=1 AND (source='' OR source=?) AND revision<?)";
  const g = [payload.source, payload.revision];
  const actions = JSON.stringify(
    payload.actions.map((a) => ({
      id: a.id,
      generation: a.generation,
      company: a.company,
      role: a.role,
      action: a.action,
      date: a.date,
      dateType: a.dateType,
      plans: a.plans,
      ends: actionEnd(a.date),
    })),
  );
  await db.batch([
    db
      .prepare(
        `UPDATE tasks SET state='cancelled',updated=? WHERE test_recipient IS NULL AND state IN ('pending','sending','unknown','failed') AND ${gate} AND NOT EXISTS(SELECT 1 FROM json_each(?) a WHERE json_extract(a.value,'$.id')=tasks.job_id AND json_extract(a.value,'$.generation')=tasks.generation)`,
      )
      .bind(now, ...g, actions),
    db.prepare(`DELETE FROM actions WHERE ${gate}`).bind(...g),
    db
      .prepare(
        `INSERT INTO actions(id,generation,payload,ends) SELECT json_extract(value,'$.id'),json_extract(value,'$.generation'),value,json_extract(value,'$.ends') FROM json_each(?) WHERE ${gate} AND json_extract(value,'$.ends')>=?`,
      )
      .bind(actions, ...g, now - 7 * DAY),
    db
      .prepare(
        `INSERT OR IGNORE INTO tasks(id,job_id,generation,due,next_try,updated)
      SELECT json_extract(a.value,'$.generation')||':'||json_extract(p.value,'$.slot'),json_extract(a.value,'$.id'),json_extract(a.value,'$.generation'),json_extract(p.value,'$.at'),json_extract(p.value,'$.at'),?
      FROM json_each(?) a,json_each(json_extract(a.value,'$.plans')) p WHERE ${gate} AND json_extract(p.value,'$.at')>=?`,
      )
      .bind(now, actions, ...g, now - DAY),
    db
      .prepare(
        `UPDATE config SET source=?,revision=?,enabled=?,recipient=? WHERE id=1 AND ${gate}`,
      )
      .bind(
        payload.source,
        payload.revision,
        Number(payload.enabled),
        payload.recipient,
        ...g,
      ),
  ]);
  const result = await db
    .prepare("SELECT source,revision FROM config WHERE id=1")
    .first<Config>();
  if (result?.source !== payload.source || result.revision !== payload.revision)
    throw new InputError("同步版本冲突", 409);
  return { revision: result.revision };
}
export async function status(db: D1Database) {
  const rows = await db
    .prepare(
      "SELECT id,job_id,state,updated,error FROM tasks WHERE state IN ('unknown','failed') ORDER BY updated DESC LIMIT 30",
    )
    .all();
  const counts = await db
    .prepare("SELECT state,COUNT(*) AS count FROM tasks GROUP BY state")
    .all();
  return { issues: rows.results, counts: counts.results };
}
export async function enqueueTest(db: D1Database, to: string, now: number) {
  const id = `test-${crypto.randomUUID()}`;
  const result = await db.batch([
    db
      .prepare(
        "INSERT INTO tasks(id,job_id,generation,due,next_try,updated,test_recipient) SELECT ?,'test',?,?,?, ?,? FROM config WHERE id=1 AND test_after<=?",
      )
      .bind(id, id, now, now, now, to, now),
    db
      .prepare("UPDATE config SET test_after=? WHERE id=1 AND test_after<=?")
      .bind(now + 60000, now),
  ]);
  if (!result[0].meta.changes)
    throw new InputError("请等待一分钟再发送测试邮件", 429);
  return { id, message: "测试邮件已排队，请稍后查看邮箱与发送状态" };
}
export async function retryTask(db: D1Database, id: string, now: number) {
  const result = await db
    .prepare(
      `UPDATE tasks SET state='pending',next_try=?,attempts=0,error='',updated=? WHERE id=? AND state IN ('unknown','failed') AND due>=? AND (test_recipient IS NOT NULL OR EXISTS(SELECT 1 FROM actions WHERE actions.id=tasks.job_id AND actions.generation=tasks.generation))`,
    )
    .bind(now, now, id, now - DAY)
    .run();
  if (!result.meta.changes) throw new InputError("此提醒已失效或无需重试");
  return { message: "已重新排队；若此前已送达，可能收到重复邮件" };
}
type Sender = (mail: {
  to: string;
  subject: string;
  text: string;
  id: string;
}) => Promise<void>;
export async function runScheduler(db: D1Database, send: Sender, now: number) {
  // One scheduler at a time. Lease expiry never automatically resends an uncertain send.
  const lease = await db
    .prepare("UPDATE config SET lock_until=? WHERE id=1 AND lock_until<?")
    .bind(now + 120000, now)
    .run();
  if (!lease.meta.changes) return;
  try {
    await db.batch([
      db
        .prepare(
          "UPDATE tasks SET state='unknown',error='发送中断，结果不确定',updated=? WHERE state='sending' AND updated<?",
        )
        .bind(now, now - 120000),
      db
        .prepare(
          "UPDATE tasks SET state='missed',updated=? WHERE state='pending' AND due<?",
        )
        .bind(now, now - DAY),
      db.prepare("DELETE FROM actions WHERE ends<?").bind(now - 7 * DAY),
      db
        .prepare(
          "UPDATE tasks SET test_recipient=NULL WHERE state NOT IN ('pending','sending') AND updated<?",
        )
        .bind(now - 7 * DAY),
      db
        .prepare(
          "DELETE FROM tasks WHERE state NOT IN ('pending','sending') AND updated<?",
        )
        .bind(now - 30 * DAY),
    ]);
    const batch = crypto.randomUUID();
    await db
      .prepare(
        `UPDATE tasks SET state='sending',batch_id=?,updated=? WHERE state='pending' AND next_try<=? AND generation IN (
      SELECT generation FROM tasks WHERE state='pending' AND next_try<=? AND (test_recipient IS NOT NULL OR EXISTS(SELECT 1 FROM config WHERE id=1 AND enabled=1)) GROUP BY generation ORDER BY MIN(due) LIMIT 5)`,
      )
      .bind(batch, now, now, now)
      .run();
    const { results } = await db
      .prepare("SELECT * FROM tasks WHERE batch_id=? AND state='sending'")
      .bind(batch)
      .all<Task>();
    if (!results.length) return;
    const config = await db
      .prepare("SELECT * FROM config WHERE id=1")
      .first<Config>();
    const groups = new Map<string, Task[]>();
    for (const task of results) {
      const to = task.test_recipient || config?.recipient || "";
      groups.set(to, [...(groups.get(to) || []), task]);
    }
    for (const [to, tasks] of groups) {
      const lines: string[] = [],
        included: Task[] = [],
        seen = new Set<string>();
      for (const task of tasks) {
        const still = await db
          .prepare("SELECT state FROM tasks WHERE id=?")
          .bind(task.id)
          .first<{ state: string }>();
        if (still?.state !== "sending") continue;
        if (task.test_recipient) {
          lines.push(
            "这是一封 JobKANBAN 测试邮件。实际收件说明本次云端发信链路可用。",
          );
          included.push(task);
          continue;
        }
        const row = await db
          .prepare("SELECT payload FROM actions WHERE id=? AND generation=?")
          .bind(task.job_id, task.generation)
          .first<{ payload: string }>();
        if (!row) {
          await db
            .prepare("UPDATE tasks SET state='cancelled',updated=? WHERE id=?")
            .bind(now, task.id)
            .run();
          continue;
        }
        const a: CloudAction = JSON.parse(row.payload);
        included.push(task);
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        const date =
          a.date.length === 10
            ? `${a.date}（具体时间未设置）`
            : new Date(a.date).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                hour12: false,
              });
        const past = actionEnd(a.date) < now;
        lines.push(
          `${a.company} · ${a.role}\n${a.action}\n${past ? (a.dateType === "deadline" ? "已逾期，原截止时间" : "预约已过，待更新，原预约时间") : a.dateType === "deadline" ? "截止时间" : "预约时间"}：${date}（北京时间）`,
        );
      }
      if (!included.length) continue;
      let outcome = "accepted",
        error = "";
      try {
        await send({
          to,
          subject: "JobKANBAN · 行动提醒",
          text:
            lines.join("\n\n") +
            "\n\n请回到本机看板更新进度。打开邮件不代表已完成行动。此邮件仅依据最后同步的安排。",
          id: batch,
        });
      } catch (e) {
        outcome = e instanceof MailError ? e.kind : "unknown";
        error =
          outcome === "unknown"
            ? "结果不确定，请确认邮箱后手动重试"
            : "发送失败，请检查授权码、收件地址与服务连接";
      }
      await db.batch(
        included.map((task) => {
          const retry = outcome === "retryable" && task.attempts < 3;
          const state = retry
            ? "pending"
            : outcome === "retryable"
              ? "failed"
              : outcome;
          return db
            .prepare(
              "UPDATE tasks SET state=?,attempts=attempts+1,next_try=?,updated=?,error=? WHERE id=? AND state='sending' AND batch_id=?",
            )
            .bind(
              state,
              now + (task.attempts + 1) * 60000,
              now,
              error,
              task.id,
              batch,
            );
        }),
      );
    }
  } finally {
    await db
      .prepare("UPDATE config SET lock_until=0 WHERE id=1 AND lock_until=?")
      .bind(now + 120000)
      .run();
  }
}
