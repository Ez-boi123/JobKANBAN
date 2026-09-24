import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { createApp } from "../server/index.mjs";

async function setup(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "jobkanban-api-"));
  const dbPath = join(dir, "jobs.sqlite");
  const staticDir = join(dir, "dist");
  await mkdir(staticDir);
  await writeFile(
    join(staticDir, "index.html"),
    "<!doctype html><title>JobKANBAN</title>",
  );
  await writeFile(join(staticDir, "app.js"), 'document.title = "JobKANBAN";');
  let app;
  let base;
  const start = async () => {
    app = createApp({
      dbPath,
      staticDir,
      clock: () => new Date("2026-09-08T08:00:00Z"),
      ...options,
    });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
  };
  await start();
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    get base() {
      return base;
    },
    async request(path = "/api/jobs", method = "GET", body, headers = {}) {
      const response = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    async restart() {
      await app.close();
      await start();
    },
  };
}

test("health endpoint identifies a running JobKANBAN instance", async (t) => {
  const api = await setup(t);

  const result = await api.request("/api/health");

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { name: "JobKANBAN", status: "ok" });
});

test("created record can be retrieved over HTTP with safe defaults", async (t) => {
  const api = await setup(t);
  assert.deepEqual((await api.request()).body, []);
  const result = await api.request("/api/jobs", "POST", {
    company: "星汀科技",
    role: "前端实习生",
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.stage, "application");
  assert.equal(result.body.status, "待投递");
  assert.equal(result.body.version, 1);
  assert.equal(result.body.dateType, "none");
  assert.deepEqual((await api.request()).body, [result.body]);
});

test("new records can be created directly in a selected board stage", async (t) => {
  const api = await setup(t);
  const assessment = await api.request("/api/jobs", "POST", {
    company: "海棠科技",
    role: "产品经理",
    stage: "assessment",
    status: "待安排",
    resultType: "",
  });
  assert.equal(assessment.status, 201);
  assert.equal(assessment.body.stage, "assessment");
  assert.equal(assessment.body.status, "待安排");
  assert.match(assessment.body.history[0].text, /测评阶段/);

  const resultWithoutOutcome = await api.request("/api/jobs", "POST", {
    company: "海棠科技",
    role: "数据分析师",
    stage: "result",
    status: "",
    resultType: "",
  });
  assert.equal(resultWithoutOutcome.status, 400);

  const offer = await api.request("/api/jobs", "POST", {
    company: "海棠科技",
    role: "管培生",
    stage: "result",
    status: "offer",
    resultType: "offer",
  });
  assert.equal(offer.status, 201);
  assert.equal(offer.body.stage, "result");
  assert.equal(offer.body.status, "收到 Offer");
  assert.equal(offer.body.resultType, "offer");
  assert.equal(offer.body.offerDecision, "pending");
});

test("successful edits survive reopen and stale versions cannot overwrite history", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", {
      company: "甲",
      role: "工程师",
      action: "交简历",
      date: "2026-09-10",
      dateType: "deadline",
    })
  ).body;
  const original = job;
  const edited = await api.request(`/api/jobs/${job.id}`, "PATCH", {
    version: 1,
    company: "乙",
    action: "交作品集",
    date: "2026-09-11",
    dateType: "deadline",
  });
  assert.equal(edited.status, 200);
  job = edited.body;
  assert.equal(job.version, 2);
  assert.equal(job.company, "乙");
  assert.equal(job.history[0].action.text, "交简历");
  assert.equal(job.history[0].action.date, "2026-09-10");
  assert.equal(
    (
      await api.request(`/api/jobs/${job.id}`, "PATCH", {
        version: original.version,
        company: "错误",
      })
    ).status,
    409,
  );
  await api.restart();
  assert.deepEqual((await api.request()).body, [job]);
});

test("invalid create and edit payloads never write records", async (t) => {
  const api = await setup(t);
  for (const payload of [
    null,
    [],
    {},
    { company: " ", role: "工程师" },
    { company: "甲", role: "乙", url: "javascript:alert(1)" },
    { company: "甲", role: "乙", stage: "result" },
    {
      company: "甲",
      role: "乙",
      date: "2026-02-30",
      dateType: "deadline",
      action: "准备",
    },
    { company: "甲", role: "乙", date: "2026-09-10", dateType: "deadline" },
    { company: "甲", role: "乙", notes: "a".repeat(20001) },
  ]) {
    assert.equal(
      (await api.request("/api/jobs", "POST", payload)).status,
      400,
      JSON.stringify(payload).slice(0, 100),
    );
  }
  assert.deepEqual((await api.request()).body, []);
  const job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  for (const payload of [
    { company: "丙" },
    { version: 1, history: [] },
    { version: 1, status: "待反馈" },
    { version: 1, date: "bad" },
    { version: 1, action: 42 },
  ]) {
    assert.equal(
      (await api.request(`/api/jobs/${job.id}`, "PATCH", payload)).status,
      400,
    );
  }
  assert.deepEqual((await api.request()).body, [job]);
});

test("rounds and completed action snapshots persist while completion and cancellation differ", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  const command = async (body) => {
    const response = await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: job.version,
      ...body,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    job = response.body;
  };
  await command({
    type: "progress",
    stage: "interview",
    status: "待完成",
    round: "第一轮",
    roundNotes: "技术交流",
    roundResult: "待反馈",
    action: "参加面试",
    date: "2026-09-09T10:00:00+08:00",
    dateType: "appointment",
  });
  await command({ type: "complete-action" });
  assert.equal(job.status, "待反馈");
  assert.equal(job.action, "");
  assert.equal(job.history[0].action.text, "参加面试");
  assert.equal(job.history[0].action.round, "第一轮");
  assert.equal(job.history[0].action.date, "2026-09-09T10:00:00+08:00");
  await command({
    type: "progress",
    stage: "interview",
    status: "待完成",
    round: "第二轮",
    roundNotes: "业务交流",
    roundResult: "",
    action: "二面",
    date: "2026-09-12",
    dateType: "appointment",
  });
  await command({ type: "cancel-action" });
  assert.equal(job.status, "待完成");
  assert.equal(job.rounds.length, 2);
  assert.deepEqual(job.rounds[0], {
    stage: "interview",
    round: "第一轮",
    date: "2026-09-09T10:00:00+08:00",
    notes: "技术交流",
    result: "待反馈",
  });
  assert.equal(job.history[0].outcome, "cancelled");
  await api.restart();
  assert.deepEqual((await api.request()).body, [job]);
});

test("Offer decisions clear pending action and archive/restore preserve result", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  const command = async (body, expected = 200) => {
    const response = await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: job.version,
      ...body,
    });
    assert.equal(response.status, expected, JSON.stringify(response.body));
    if (expected === 200) job = response.body;
  };
  await command({ type: "archive" }, 400);
  await command({ type: "offer", decision: "accepted" }, 400);
  await command({
    type: "progress",
    stage: "result",
    status: "offer",
    action: "答复 Offer",
    date: "2026-09-15",
    dateType: "deadline",
  });
  assert.equal(job.offerDecision, "pending");
  assert.equal(job.status, "收到 Offer");
  await command({ type: "offer", decision: "accepted" });
  assert.equal(job.offerDecision, "accepted");
  assert.equal(job.date, "");
  assert.equal(job.history[0].action.date, "2026-09-15");
  await command({ type: "archive" });
  assert.equal(job.archived, true);
  await command({ type: "restore" });
  assert.equal(job.archived, false);
  assert.equal(job.offerDecision, "accepted");
  assert.equal(job.resultType, "offer");
});

test("invalid progress commands do not change records or append history", async (t) => {
  const api = await setup(t);
  const job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  for (const body of [
    { type: "progress", stage: "interview", status: "已投递" },
    { type: "progress", stage: "unknown", status: "待完成" },
    { type: "progress", stage: "result", status: "accepted" },
    { type: "progress", stage: "assessment", status: "待完成", roundNotes: 4 },
    { type: "complete-action" },
    { type: "cancel-action" },
    { type: "destroy" },
    { type: "offer", decision: "maybe" },
  ]) {
    assert.equal(
      (
        await api.request(`/api/jobs/${job.id}/commands`, "POST", {
          version: 1,
          ...body,
        })
      ).status,
      400,
    );
  }
  assert.deepEqual((await api.request()).body, [job]);
});

test("local API blocks hostile origin and host, malformed JSON and oversized requests", async (t) => {
  const api = await setup(t);
  assert.equal(
    (
      await api.request("/api/jobs", "GET", undefined, {
        Origin: "https://evil.example",
      })
    ).status,
    400,
  );
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(
      api.base + "/api/jobs",
      { headers: { Host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostileHostStatus, 400);
  assert.equal(
    (await api.request("/api/jobs", "GET", undefined, { Origin: api.base }))
      .status,
    200,
  );
  assert.equal(
    (
      await api.request("/api/jobs", "GET", undefined, {
        Origin: api.base.replace("127.0.0.1", "localhost"),
      })
    ).status,
    200,
  );
  for (const body of ["{", "x".repeat(70000)]) {
    const response = await fetch(api.base + "/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.deepEqual((await api.request()).body, []);
});

test("only safe static resources are served, never the database or traversal paths", async (t) => {
  const api = await setup(t);
  const index = await fetch(api.base + "/");
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /text\/html/);
  assert.match(await index.text(), /JobKANBAN/);
  const script = await fetch(api.base + "/app.js");
  assert.match(script.headers.get("content-type"), /javascript/);
  for (const path of [
    "/jobs.sqlite",
    "/data/jobkanban.sqlite",
    "/%2e%2e%2fjobs.sqlite",
    "/.git/config",
    "/app.js/..%5c..%5cjobs.sqlite",
  ]) {
    const response = await fetch(api.base + path);
    assert.ok([400, 404].includes(response.status), path);
    assert.doesNotMatch(await response.text(), /SQLite format/);
  }
});

test("feedback updates record completion and history retains prior per-round details", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", {
      company: "甲",
      role: "乙",
      action: "交简历",
    })
  ).body;
  const command = async (payload) => {
    const response = await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: job.version,
      ...payload,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    job = response.body;
  };
  await command({ type: "complete-action" });
  assert.equal(job.stage, "application");
  assert.equal(job.status, "待投递");
  await command({
    type: "progress",
    stage: "assessment",
    status: "待完成",
    round: "第一轮",
    roundNotes: "算法题",
    action: "完成测评",
    date: "2026-09-10",
    dateType: "deadline",
  });
  await command({
    type: "progress",
    stage: "assessment",
    status: "待反馈",
    round: "第一轮",
    roundNotes: "已交卷",
    roundResult: "等待反馈",
  });
  assert.equal(job.action, "");
  assert.equal(job.dateType, "none");
  assert.equal(job.history[0].outcome, "completed");
  assert.equal(job.history[0].previousRoundRecord.notes, "算法题");
  assert.equal(job.history[0].roundRecord.result, "等待反馈");
  assert.equal(job.rounds[0].date, "2026-09-10");
});

test("simultaneous clients cannot overwrite each other and missing IDs return 404", async (t) => {
  const api = await setup(t);
  const job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  const responses = await Promise.all(
    ["北京", "上海"].map((city) =>
      api.request(`/api/jobs/${job.id}`, "PATCH", { version: 1, city }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const saved = (await api.request()).body[0];
  assert.equal(saved.history.length, 2);
  assert.equal(
    (
      await api.request("/api/jobs/missing", "PATCH", {
        version: 1,
        city: "北京",
      })
    ).status,
    404,
  );
});

test("rescheduling retains the old appointment and rejects invalid clock times", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 1,
      type: "progress",
      stage: "interview",
      status: "待完成",
      round: "一面",
      action: "参加面试",
      date: "2026-09-09T10:00:00+08:00",
      dateType: "appointment",
    })
  ).body;
  const invalid = await api.request(`/api/jobs/${job.id}`, "PATCH", {
    version: 2,
    date: "2026-09-10T24:00:00+08:00",
  });
  assert.equal(invalid.status, 400);
  job = (
    await api.request(`/api/jobs/${job.id}`, "PATCH", {
      version: 2,
      date: "2026-09-10T11:00:00+08:00",
    })
  ).body;
  assert.equal(job.rounds[0].date, "2026-09-10T11:00:00+08:00");
  assert.equal(
    job.history[0].previousRoundRecord.date,
    "2026-09-09T10:00:00+08:00",
  );
});

test("cross-stage entry into feedback completes the old action without inferring a passed round", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 1,
      type: "progress",
      stage: "assessment",
      status: "待完成",
      round: "测评一轮",
      roundResult: "未记录",
      action: "提交测评",
      date: "2026-09-09",
      dateType: "deadline",
    })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 2,
      type: "progress",
      stage: "interview",
      status: "待反馈",
      round: "面试一轮",
    })
  ).body;
  assert.equal(job.action, "");
  assert.equal(job.date, "");
  assert.equal(job.dateType, "none");
  assert.equal(job.history[0].outcome, "completed");
  assert.equal(job.history[0].previousStage, "assessment");
  assert.equal(job.history[0].action.round, "测评一轮");
  assert.equal(job.history[0].action.date, "2026-09-09");
  assert.equal(job.rounds[0].result, "未记录");
});

test("clearing an action through record edit records cancellation with its old date and round", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 1,
      type: "progress",
      stage: "interview",
      status: "待完成",
      round: "一面",
      action: "面试准备",
      date: "2026-09-09",
      dateType: "deadline",
    })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}`, "PATCH", {
      version: 2,
      action: "",
      date: "",
      dateType: "none",
    })
  ).body;
  assert.equal(job.history[0].outcome, "cancelled");
  assert.deepEqual(job.history[0].action, {
    text: "面试准备",
    date: "2026-09-09",
    dateType: "deadline",
    round: "一面",
  });
  assert.equal(job.status, "待完成");
});

test("follow-up action dates during feedback do not replace the actual round date", async (t) => {
  const api = await setup(t);
  let job = (
    await api.request("/api/jobs", "POST", { company: "甲", role: "乙" })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 1,
      type: "progress",
      stage: "interview",
      status: "待完成",
      round: "一面",
      action: "参加面试",
      date: "2026-09-08",
      dateType: "appointment",
    })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 2,
      type: "complete-action",
    })
  ).body;
  job = (
    await api.request(`/api/jobs/${job.id}`, "PATCH", {
      version: 3,
      action: "跟进反馈",
      date: "2026-09-10",
      dateType: "deadline",
    })
  ).body;
  assert.equal(job.rounds[0].date, "2026-09-08");
  assert.equal(job.date, "2026-09-10");
  job = (
    await api.request(`/api/jobs/${job.id}/commands`, "POST", {
      version: 4,
      type: "progress",
      stage: "interview",
      status: "待反馈",
      round: "一面",
      action: "再次跟进",
      date: "2026-09-12",
      dateType: "appointment",
    })
  ).body;
  assert.equal(job.rounds[0].date, "2026-09-08");
  assert.equal(job.date, "2026-09-12");
});
