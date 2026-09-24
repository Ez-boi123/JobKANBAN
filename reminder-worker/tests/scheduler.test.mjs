import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  syncSnapshot,
  runScheduler,
  retryTask,
  enqueueTest,
} from "../src/scheduler.ts";
import { MailError, sendSmtp } from "../src/smtp.ts";
import { DAY } from "../../shared/reminders.mjs";
const now = Date.parse("2026-09-23T12:00:00+08:00");
const recipient = "test@163.com";
// SQLite adapter executes exactly the production SQL, including atomic batches.
function setup(t) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../migrations/0001_reminders.sql", import.meta.url),
      "utf8",
    ),
  );
  t.after(() => sql.close());
  function prepare(query) {
    let params = [];
    return {
      bind(...values) {
        params = values;
        return this;
      },
      async first() {
        return sql.prepare(query).get(...params) || null;
      },
      async all() {
        return { results: sql.prepare(query).all(...params), success: true };
      },
      async run() {
        return { meta: sql.prepare(query).run(...params), success: true };
      },
    };
  }
  const db = {
    prepare,
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.run());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, sql };
}
const snapshot = (revision = 1) => ({
  source: "local-one",
  revision,
  enabled: true,
  recipient,
  actions: [
    {
      id: "job-one",
      generation: "generation-one",
      company: "公司",
      role: "产品经理",
      action: "提交测评",
      date: "2026-09-24T12:00:00+08:00",
      dateType: "deadline",
      plans: [
        { slot: "0", at: now },
        { slot: "1", at: now + 22 * 3600000 },
      ],
    },
  ],
});
test("sync is idempotent, rejects stale/foreign sources and scheduler deduplicates", async (t) => {
  const { db, sql } = setup(t);
  await syncSnapshot(db, snapshot(), recipient, now);
  await syncSnapshot(db, snapshot(), recipient, now);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM tasks").get().n, 2);
  await assert.rejects(syncSnapshot(db, snapshot(0), recipient, now));
  await assert.rejects(
    syncSnapshot(db, { ...snapshot(2), source: "other" }, recipient, now),
  );
  const mails = [];
  await runScheduler(
    db,
    async (mail) => {
      mails.push(mail);
    },
    now,
  );
  await runScheduler(
    db,
    async (mail) => {
      mails.push(mail);
    },
    now + 60000,
  );
  assert.equal(mails.length, 1);
  assert.match(mails[0].text, /公司 · 产品经理/);
  assert.equal(
    sql.prepare("SELECT state FROM tasks WHERE id='generation-one:0'").get()
      .state,
    "accepted",
  );
});
test("new snapshot cancels previous schedules and total off cancels unknown tasks", async (t) => {
  const { db, sql } = setup(t);
  await syncSnapshot(db, snapshot(), recipient, now);
  await runScheduler(
    db,
    async () => {
      throw new MailError("unknown");
    },
    now,
  );
  await syncSnapshot(
    db,
    { ...snapshot(2), enabled: false, actions: [] },
    recipient,
    now,
  );
  assert.ok(
    sql
      .prepare("SELECT state FROM tasks")
      .all()
      .every((r) => r.state === "cancelled"),
  );
  await assert.rejects(retryTask(db, "generation-one:0", now));
  await runScheduler(
    db,
    async () => {
      assert.fail("cancelled tasks must not send");
    },
    now + 22 * 3600000,
  );
});
test("uncertain send is not automatically retried; explicit retry is possible", async (t) => {
  const { db, sql } = setup(t);
  await syncSnapshot(db, snapshot(), recipient, now);
  let calls = 0;
  await runScheduler(
    db,
    async () => {
      calls++;
      throw new MailError("unknown");
    },
    now,
  );
  await runScheduler(
    db,
    async () => {
      calls++;
    },
    now + 60000,
  );
  assert.equal(calls, 1);
  await retryTask(db, "generation-one:0", now + 60000);
  await runScheduler(
    db,
    async () => {
      calls++;
    },
    now + 60001,
  );
  assert.equal(calls, 2);
  assert.equal(
    sql.prepare("SELECT state FROM tasks WHERE id='generation-one:0'").get()
      .state,
    "accepted",
  );
});
test("retries are bounded; configuration rejection stops without retry", async (t) => {
  const { db, sql } = setup(t);
  await syncSnapshot(db, snapshot(), recipient, now);
  let calls = 0;
  for (let i = 0; i < 6; i++)
    await runScheduler(
      db,
      async () => {
        calls++;
        throw new MailError("retryable");
      },
      now + i * 300000,
    );
  assert.equal(calls, 4);
  assert.equal(
    sql.prepare("SELECT state FROM tasks WHERE id='generation-one:0'").get()
      .state,
    "failed",
  );
});
test("outage catch-up collapses reminders per action and respects 24 hour window", async (t) => {
  const { db, sql } = setup(t);
  await syncSnapshot(db, snapshot(), recipient, now);
  const mails = [];
  await runScheduler(db, async (mail) => mails.push(mail), now + 23 * 3600000);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].text.match(/公司 · 产品经理/g).length, 1);
  await syncSnapshot(
    db,
    {
      ...snapshot(2),
      actions: snapshot().actions.map((a) => ({
        ...a,
        generation: "new-generation",
      })),
    },
    recipient,
    now,
  );
  await runScheduler(
    db,
    async () => assert.fail("old reminders"),
    now + 3 * DAY,
  );
  assert.ok(
    sql
      .prepare("SELECT state FROM tasks WHERE generation='new-generation'")
      .all()
      .every((r) => r.state === "missed"),
  );
});
test("stuck sending becomes unknown, expired content is cleaned, test mail is throttled", async (t) => {
  const { db, sql } = setup(t);
  await syncSnapshot(db, snapshot(), recipient, now);
  sql.prepare("UPDATE tasks SET state='sending',updated=?").run(now - 180000);
  await runScheduler(
    db,
    async () => assert.fail("uncertain must not auto-send"),
    now,
  );
  assert.ok(
    sql
      .prepare("SELECT state FROM tasks")
      .all()
      .every((r) => r.state === "unknown"),
  );
  await enqueueTest(db, recipient, now);
  await assert.rejects(enqueueTest(db, recipient, now + 1000));
  await runScheduler(db, async () => {}, now + 1000);
  await runScheduler(db, async () => {}, now + 9 * DAY);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM actions").get().n, 0);
  await runScheduler(db, async () => {}, now + 40 * DAY);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM tasks").get().n, 0);
});
function fakeSocket(final = "250 queued\r\n", failAuth = false) {
  let ctl,
    writes = [],
    step = 0;
  const responses = [
    "250-smtp.example\r\n250 AUTH LOGIN\r\n",
    "334 username\r\n",
    "334 password\r\n",
    failAuth ? "535 denied\r\n" : "235 ok\r\n",
    "250 ok\r\n",
    "250 ok\r\n",
    "354 data\r\n",
    final,
  ];
  return {
    writes,
    readable: new ReadableStream({
      start(c) {
        ctl = c;
        c.enqueue(new TextEncoder().encode("220 hello\r\n"));
      },
    }),
    writable: new WritableStream({
      write(bytes) {
        writes.push(new TextDecoder().decode(bytes));
        const reply = responses[step++];
        if (reply === null) ctl.close();
        else ctl.enqueue(new TextEncoder().encode(reply));
      },
    }),
    async close() {},
  };
}
const mail = {
  user: "sender@163.com",
  code: "fake-auth",
  to: recipient,
  subject: "行动提醒",
  text: "公司\n行动",
  id: "test-message",
};
test("SMTP protocol success uses encoded text and requires post-DATA acceptance", async () => {
  const socket = fakeSocket();
  await sendSmtp(mail, () => socket);
  assert.match(socket.writes.at(-1), /Content-Transfer-Encoding: base64/);
  assert.doesNotMatch(socket.writes.at(-1), /fake-auth/);
  await assert.rejects(
    sendSmtp(mail, () => fakeSocket(null)),
    (e) => e.kind === "unknown",
  );
  await assert.rejects(
    sendSmtp(mail, () => fakeSocket("451 retry\r\n")),
    (e) => e.kind === "retryable",
  );
  await assert.rejects(
    sendSmtp(mail, () => fakeSocket(undefined, true)),
    (e) => e.kind === "failed",
  );
});
