import test from "node:test";
import assert from "node:assert/strict";
import {
  actionEnd,
  chinaDate,
  planReminders,
  reminderTimes,
  urgency,
  DAY,
  HOUR,
} from "../../shared/reminders.mjs";
import { openStore } from "../server/store.mjs";
import { createJob, editJob, commandJob } from "../server/domain.mjs";
import {
  cloudPayload,
  createReminderSync,
  publicReminders,
} from "../server/reminders.mjs";
import { createApp } from "../server/index.mjs";
const now = Date.parse("2026-09-23T12:00:00+08:00");
const job = {
  company: "测试公司",
  role: "产品经理",
  action: "提交测评",
  date: "2026-09-24T12:00:00+08:00",
  dateType: "deadline",
};
test("exact thresholds, appointments and past semantics", () => {
  assert.equal(urgency(job, now - 1).level, "none");
  assert.equal(urgency(job, now).level, "urgent");
  assert.equal(urgency(job, now).pulse, false);
  assert.equal(urgency(job, now + 22 * HOUR - 1).level, "urgent");
  assert.equal(urgency(job, now + 22 * HOUR - 1).pulse, false);
  assert.equal(urgency(job, now + 22 * HOUR).pulse, true);
  assert.equal(urgency(job, now + DAY).label, "现在截止");
  assert.equal(urgency(job, now + DAY + 1).level, "overdue");
  const appointment = { ...job, dateType: "appointment" };
  assert.equal(urgency(appointment, now + 23 * HOUR - 1).level, "none");
  assert.equal(urgency(appointment, now + 23 * HOUR).level, "soon");
  assert.equal(urgency(appointment, now + 23 * HOUR).pulse, false);
  assert.equal(urgency(appointment, now + DAY - 15 * 60000).pulse, true);
  assert.equal(urgency(appointment, now + DAY + 1).level, "stale");
  assert.equal(urgency({ ...job, archived: true }, now).level, "none");
  assert.equal(urgency({ ...job, action: "" }, now).level, "none");
});
test("date-only rules remain Beijing calendar days with no breathing", () => {
  const j = { ...job, date: "2026-09-24" };
  assert.equal(urgency(j, now).label, "明天截止");
  assert.equal(urgency(j, now).pulse, false);
  assert.equal(chinaDate(Date.parse("2026-09-23T16:00:00Z")), "2026-09-24");
  assert.equal(urgency(j, actionEnd(j.date)).level, "soon");
  assert.equal(urgency(j, actionEnd(j.date) + 1).level, "overdue");
  assert.deepEqual(
    reminderTimes(j.date, "deadline").map((t) => new Date(t).toISOString()),
    ["2026-09-23T10:00:00.000Z", "2026-09-24T01:00:00.000Z"],
  );
  assert.match(
    urgency({ ...j, dateType: "appointment" }, now).label,
    /具体时间待确认/,
  );
});
test("catch-up collapses crossed triggers and skips expired actions", () => {
  assert.equal(planReminders(job.date, job.dateType, now - 1).length, 2);
  assert.deepEqual(planReminders(job.date, job.dateType, now + 23 * HOUR), [
    { slot: "catchup", at: now + 23 * HOUR },
  ]);
  assert.deepEqual(planReminders(job.date, job.dateType, now + DAY + 1), []);
});
function setup(t) {
  const store = openStore(":memory:", () => new Date(now));
  t.after(() => store.close());
  const j = store.save(
    createJob(
      { ...job, notes: "PRIVATE PASSPORT", url: "https://private.example" },
      new Date(now).toISOString(),
    ),
  );
  const settings = (body) =>
    store.reminderSettings({ revision: store.reminders().revision, ...body });
  return { store, j, settings };
}
test("local outbox is opt-in, minimal and stable across unrelated edits", (t) => {
  const { store, j, settings } = setup(t);
  assert.deepEqual(cloudPayload(store.reminders()).actions, []);
  settings({ enabled: true, recipient: "test@163.com" });
  const first = cloudPayload(store.reminders());
  assert.equal(first.actions.length, 1);
  assert.doesNotMatch(
    JSON.stringify(first),
    /PRIVATE|private.example|history|rounds|notes|identity/,
  );
  store.mutate(j.id, j.version, (old) =>
    editJob(
      old,
      { version: old.version, company: "新名称", notes: "PRIVATE" },
      new Date(now).toISOString(),
    ),
  );
  const next = cloudPayload(store.reminders());
  assert.equal(next.actions[0].generation, first.actions[0].generation);
  assert.deepEqual(next.actions[0].plans, first.actions[0].plans);
  assert.equal(next.actions[0].company, "新名称");
  assert.equal(publicReminders(store.reminders(), false).pending, true);
  assert.throws(() => settings({ recipient: "x\r\nBcc:evil@163.com" }));
});
test("mute, disable, reschedule, completion cancel old generations atomically", (t) => {
  const { store, j, settings } = setup(t);
  settings({ enabled: true, recipient: "test@163.com" });
  const original = cloudPayload(store.reminders()).actions[0].generation;
  settings({ jobId: j.id, muted: true });
  assert.deepEqual(cloudPayload(store.reminders()).actions, []);
  settings({ jobId: j.id, muted: false });
  assert.notEqual(
    cloudPayload(store.reminders()).actions[0].generation,
    original,
  );
  settings({ enabled: false });
  assert.deepEqual(cloudPayload(store.reminders()).actions, []);
  settings({ enabled: true });
  const before = store.reminders();
  assert.throws(() => store.mutate(j.id, 999, (old) => old));
  assert.deepEqual(store.reminders(), before);
  const changed = store.mutate(j.id, j.version, (old) =>
    editJob(
      old,
      { version: old.version, date: "2026-09-25" },
      new Date(now).toISOString(),
    ),
  );
  assert.notEqual(
    store.reminders().actions[j.id].generation,
    before.actions[j.id].generation,
  );
  store.mutate(j.id, changed.version, (old) =>
    commandJob(
      old,
      { version: old.version, type: "complete-action" },
      new Date(now).toISOString(),
    ),
  );
  assert.deepEqual(cloudPayload(store.reminders()).actions, []);
});
test("offline sync never rolls back saves; in-flight acknowledgement cannot swallow newer changes", async (t) => {
  const { store, settings } = setup(t);
  settings({ enabled: true, recipient: "test@163.com" });
  let release;
  const sync = createReminderSync(store, {
    url: "https://reminder.example",
    token: "x".repeat(32),
    fetcher: async (url, request) => {
      if (url.endsWith("/status"))
        return Response.json({ issues: [], counts: [] });
      const payload = JSON.parse(request.body);
      await new Promise((resolve) => {
        release = resolve;
      });
      return Response.json({ revision: payload.revision });
    },
  });
  const pending = sync.sync();
  settings({ enabled: false });
  release();
  await pending;
  assert.equal(publicReminders(store.reminders(), true).pending, true);
  assert.equal(store.reminders().enabled, false);
  const failed = createReminderSync(store, {
    url: "https://reminder.example",
    token: "x".repeat(32),
    fetcher: async () => {
      throw new Error("offline");
    },
  });
  await failed.sync();
  assert.match(store.reminders().error, /尚未同步/);
});
test("reminder API validates settings, blocks cross-origin and exposes no credentials", async (t) => {
  const app = createApp({
    dbPath: ":memory:",
    reminderOptions: { url: "", token: "" },
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const state = await (await fetch(base + "/api/reminders")).json();
  assert.equal(state.enabled, false);
  assert.equal(state.configured, false);
  assert.doesNotMatch(JSON.stringify(state), /SMTP|token|source|actions/);
  const response = await fetch(base + "/api/reminders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: state.revision, animation: false }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).animation, false);
  assert.equal(
    (
      await fetch(base + "/api/reminders", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    400,
  );
});

test("test delivery status can be read before opting in to real action sync", async (t) => {
  const { store } = setup(t);
  const requests = [];
  const sync = createReminderSync(store, {
    url: "https://reminder.example",
    token: "x".repeat(32),
    fetcher: async (url) => {
      requests.push(url);
      return Response.json({
        issues: [],
        counts: [{ state: "accepted", count: 1 }],
      });
    },
  });
  await sync.sync();
  assert.deepEqual(requests, ["https://reminder.example/status"]);
  assert.equal(store.reminders().cloud.counts[0].count, 1);
  assert.equal(store.reminders().syncedRevision, 0);
});

test("completing a muted action does not mute the next action", (t) => {
  const { store, j, settings } = setup(t);
  settings({ jobId: j.id, muted: true });
  const next = store.mutate(j.id, 1, (old) =>
    commandJob(
      old,
      { type: "complete-action", version: 1 },
      new Date(now).toISOString(),
    ),
  );
  assert.equal(store.reminders().muted[j.id], undefined);
  store.mutate(j.id, next.version, (old) =>
    editJob(
      old,
      {
        version: next.version,
        action: "新行动",
        date: job.date,
        dateType: job.dateType,
      },
      new Date(now).toISOString(),
    ),
  );
  settings({ enabled: true, recipient: "test@163.com" });
  assert.equal(store.reminders().actions[j.id].action, "新行动");
});
