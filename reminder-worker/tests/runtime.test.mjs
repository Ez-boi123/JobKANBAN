import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";

test("bundled Worker authenticates and syncs through real local D1 binding", async (t) => {
  const token = "local-test-token-not-a-real-secret-123456";
  const mf = new Miniflare({
    telemetry: { enabled: false },
    workers: [
      {
        config: {
          name: "jobkanban-test",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents: readFileSync(
                  new URL("../.wrangler/build/index.js", import.meta.url),
                  "utf8",
                ),
              },
            },
          },
          compatibilityDate: "2026-09-23",
          compatibilityFlags: ["nodejs_compat"],
          env: {
            DB: { type: "d1", id: "test-db" },
            ...Object.fromEntries(
              Object.entries({
                SYNC_TOKEN: token,
                RECIPIENT_EMAIL: "test@163.com",
                SMTP_USER: "test@163.com",
                SMTP_AUTH_CODE: "unused-no-mails-sent",
              }).map(([key, value]) => [key, { type: "text", value }]),
            ),
          },
        },
      },
    ],
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const migration = readFileSync(
    new URL("../migrations/0001_reminders.sql", import.meta.url),
    "utf8",
  );
  for (const sql of migration.split(";").filter((s) => s.trim()))
    await db.prepare(sql).run();
  assert.equal((await mf.dispatchFetch("http://local/status")).status, 401);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const now = Date.now();
  const payload = {
    source: "runtime-test",
    revision: 1,
    enabled: true,
    recipient: "test@163.com",
    actions: [
      {
        id: "job-one",
        generation: "gen-one",
        company: "测试",
        role: "岗位",
        action: "测试行动",
        date: new Date(now + 3600000).toISOString(),
        dateType: "deadline",
        plans: [{ slot: "catchup", at: now }],
      },
    ],
  };
  const response = await mf.dispatchFetch("http://local/sync", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { revision: 1 });
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM tasks").first()).n,
    1,
  );
  const retry = await mf.dispatchFetch("http://local/sync", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(retry.status, 200);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS n FROM tasks").first()).n,
    1,
  );
  assert.equal(
    (await mf.dispatchFetch("http://local/status", { headers })).status,
    200,
  );
  const oversized = await mf.dispatchFetch("http://local/sync", {
    method: "POST",
    headers,
    body: "x".repeat(1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);
});
