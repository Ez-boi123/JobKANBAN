import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createReminderSetup,
  runSetupCommand,
} from "../server/reminder-setup.mjs";
import { createApp } from "../server/index.mjs";

const accountId = "a".repeat(32);
const databaseId = "11111111-1111-1111-1111-111111111111";
const authCode = "test-authorization-only-1234";
test("deployment command separates JSON stdout and hides failing child output", async () => {
  const output = await runSetupCommand(process.execPath, [
    "-e",
    'process.stderr.write("warning"); process.stdout.write("{\\"ok\\":true}")',
  ]);
  assert.deepEqual(JSON.parse(output), { ok: true });
  await assert.rejects(
    runSetupCommand(process.execPath, [
      "-e",
      'process.stderr.write("private-diagnostic"); process.exit(1)',
    ]),
    (error) =>
      !error.message.includes("private-diagnostic") &&
      /执行失败/.test(error.message),
  );
});
function fakeCloud({ failSecretsOnce = false, loggedIn = true } = {}) {
  const calls = [];
  let db;
  let secretAttempts = 0;
  return {
    calls,
    runner: async (_command, args, options) => {
      const command = args.slice(1, args.indexOf("--config"));
      const config = JSON.parse(await readFile(args.at(-1), "utf8"));
      calls.push({ command, config, input: options.input });
      if (command[0] === "whoami") {
        if (!loggedIn) throw new Error("not authenticated");
        return JSON.stringify({
          loggedIn: true,
          accounts: [{ id: accountId, name: "Test account" }],
        });
      }
      if (command[0] === "login") {
        options.onOutput(
          "Open https://dash.cloudflare.com/oauth2/auth?state=test-state&code_challenge=test-challenge",
        );
        loggedIn = true;
        return "Successfully logged in";
      }
      if (command[0] === "d1" && command[1] === "list")
        return JSON.stringify(db ? [db] : []);
      if (command[0] === "d1" && command[1] === "create") {
        db = { name: command[2], uuid: databaseId };
        return "created";
      }
      if (command[0] === "deploy")
        return `https://${config.name}.test-account.workers.dev`;
      if (command[0] === "secret" && failSecretsOnce && secretAttempts++ === 0)
        throw new Error(`never reveal ${authCode}`);
      return "done";
    },
  };
}
async function fixture(t, cloudOptions) {
  const dir = await mkdtemp(join(tmpdir(), "jobkanban-setup-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cloud = fakeCloud(cloudOptions);
  let saved;
  const storeState = {
    source: "local-source",
    revision: 0,
    syncedRevision: 0,
    enabled: false,
  };
  const make = () =>
    createReminderSetup({
      root: resolve("."),
      dataDir: dir,
      store: { reminders: () => storeState },
      configured: () => !!saved,
      activate: async (value) => {
        saved = value;
      },
      runner: cloud.runner,
      fetcher: async () => Response.json({ counts: [], issues: [] }),
    });
  const body = () => ({
    accountId,
    sender: "example@163.com",
    recipient: "recipient@example.com",
    authCode,
  });
  return {
    dir,
    cloud,
    make,
    body,
    storeState,
    get saved() {
      return saved;
    },
  };
}

test("wizard authorizes, deploys into selected account and activates without exposing mail secrets", async (t) => {
  const f = await fixture(t, { loggedIn: false });
  const setup = f.make();
  assert.equal(setup.connect({}).busy, true);
  assert.throws(() => setup.connect({}), /正在进行/);
  await setup.idle();
  assert.equal(setup.snapshot().phase, "ready");
  assert.equal(setup.snapshot().authUrl, "");
  assert.ok(f.cloud.calls.some((c) => c.command[0] === "login"));
  setup.deploy(f.body());
  await setup.idle();
  assert.equal(setup.snapshot().phase, "complete");
  assert.equal(f.saved.recipient, "recipient@example.com");
  assert.equal(f.saved.token.length, 64);
  assert.equal(
    JSON.parse(f.cloud.calls.find((c) => c.command[0] === "secret").input)
      .SMTP_AUTH_CODE,
    authCode,
  );
  const plan = JSON.parse(
    await readFile(join(f.dir, "reminder-setup/deployment.json"), "utf8"),
  );
  assert.equal(plan.databaseId, databaseId);
  assert.equal(plan.accountId, accountId);
  assert.ok(f.saved.url.includes(plan.name));
  assert.doesNotMatch(
    JSON.stringify(setup.snapshot()),
    new RegExp(authCode + "|" + f.saved.token),
  );
  for (const file of await readdir(join(f.dir, "reminder-setup"))) {
    assert.ok(
      !(await readFile(join(f.dir, "reminder-setup", file), "utf8")).includes(
        authCode,
      ),
    );
  }
  assert.throws(() => setup.deploy(f.body()), /已经连接/);
});

test("failed deployment resumes the same resources and token after local server restart", async (t) => {
  const f = await fixture(t, { failSecretsOnce: true });
  let setup = f.make();
  setup.connect({});
  await setup.idle();
  setup.deploy(f.body());
  await setup.idle();
  assert.equal(setup.snapshot().phase, "error");
  assert.ok(!setup.snapshot().error.includes(authCode));
  const before = JSON.parse(
    await readFile(join(f.dir, "reminder-setup/deployment.json"), "utf8"),
  );
  setup = f.make();
  setup.connect({});
  await setup.idle();
  setup.deploy(f.body());
  await setup.idle();
  assert.equal(setup.snapshot().phase, "complete");
  assert.equal(f.saved.token, before.token);
  assert.equal(
    f.cloud.calls.filter(
      (c) => c.command[0] === "d1" && c.command[1] === "create",
    ).length,
    1,
  );
});

test("wizard rejects invalid input, unselected accounts and existing cloud histories", async (t) => {
  const f = await fixture(t);
  const setup = f.make();
  assert.throws(() => setup.deploy(f.body()), /先连接/);
  setup.connect({});
  await setup.idle();
  assert.throws(
    () => setup.deploy({ ...f.body(), accountId: "b".repeat(32) }),
    /先连接/,
  );
  assert.throws(
    () => setup.deploy({ ...f.body(), sender: "test@gmail.com" }),
    /163/,
  );
  assert.throws(
    () => setup.deploy({ ...f.body(), authCode: "\ninvalid" }),
    /授权码/,
  );
  assert.throws(
    () => setup.deploy({ ...f.body(), command: "arbitrary-command" }),
    /不支持/,
  );
  f.storeState.syncedRevision = 1;
  assert.throws(() => setup.deploy(f.body()), /同步历史/);
});

test("HTTP wizard uses same-origin checks, saves private connection and works after restart", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "jobkanban-setup-api-"));
  const cloud = fakeCloud();
  let app;
  const start = async () => {
    app = createApp({
      dbPath: join(dir, "jobs.sqlite"),
      reminderOptions: {
        url: undefined,
        token: undefined,
        fetcher: async () => Response.json({ counts: [], issues: [] }),
      },
      setupOptions: {
        runner: cloud.runner,
        fetcher: async () => Response.json({ counts: [], issues: [] }),
      },
    });
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  };
  await start();
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const request = (path, body, origin) =>
    fetch(`http://127.0.0.1:${app.server.address().port}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal(
    (await request("/api/reminders/setup/connect", {}, "https://example.com"))
      .status,
    400,
  );
  await request("/api/reminders/setup/connect", {});
  async function untilFinished() {
    for (let i = 0; i < 100; i++) {
      const s = await (await request("/api/reminders/setup")).json();
      if (!s.busy) return s;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("setup did not finish");
  }
  await untilFinished();
  await request("/api/reminders/setup/deploy", {
    accountId,
    sender: "test@163.com",
    recipient: "test@163.com",
    authCode,
  });
  assert.equal((await untilFinished()).phase, "complete");
  const settings = await (await request("/api/reminders")).json();
  assert.equal(settings.configured, true);
  assert.equal(settings.enabled, false);
  assert.equal(settings.recipient, "test@163.com");
  const privateConfig = JSON.parse(
    await readFile(join(dir, "reminders.connection.json"), "utf8"),
  );
  assert.equal(privateConfig.token.length, 64);
  assert.ok(!JSON.stringify(settings).includes(privateConfig.token));
  assert.equal((await request("/data/reminders.connection.json")).status, 404);
  await app.close();
  app = createApp({
    dbPath: join(dir, "jobs.sqlite"),
    reminderOptions: {
      fetcher: async () => Response.json({ counts: [], issues: [] }),
    },
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  assert.equal(
    (await (await request("/api/reminders")).json()).configured,
    true,
  );
});
