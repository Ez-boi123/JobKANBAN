import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const time = new Date("2026-09-23T12:00:00+08:00");
const app = createApp({
  dbPath: ":memory:",
  staticDir: resolve("dist"),
  clock: () => time,
  reminderOptions: { url: "", token: "" },
});
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.server.address().port}`;
let browser;
try {
  const jobs = [
    { company: "普通待投递示例", date: "", dateType: "none" },
    { company: "已投递示例", date: "", dateType: "none" },
    {
      company: "提前一天截止示例",
      date: "2026-09-24T12:00:00+08:00",
      dateType: "deadline",
    },
    {
      company: "临近截止示例",
      date: "2026-09-23T13:00:00+08:00",
      dateType: "deadline",
    },
    {
      company: "面试预约示例",
      date: "2026-09-23T12:10:00+08:00",
      dateType: "appointment",
    },
    { company: "日期待定时刻", date: "2026-09-24", dateType: "deadline" },
    { company: "逾期示例", date: "2026-09-22", dateType: "deadline" },
  ];
  for (const job of jobs) {
    const response = await fetch(base + "/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...job,
        role: "产品经理",
        action: "准备求职材料",
      }),
    });
    assert.equal(response.status, 201);
    if (job.company === "已投递示例") {
      const saved = await response.json();
      const progressed = await fetch(base + `/api/jobs/${saved.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: saved.version,
          type: "progress",
          stage: "application",
          status: "已投递",
        }),
      });
      assert.equal(progressed.status, 200);
    }
  }
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Shanghai",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time });
  await page.goto(base);
  await page
    .getByRole("button", { name: "临近截止示例 产品经理", exact: true })
    .waitFor();
  assert.equal(await page.locator(".urgency-pulse").count(), 2);
  const pendingApplication = page.getByRole("button", {
    name: "普通待投递示例 产品经理",
    exact: true,
  });
  assert.match(
    await pendingApplication.getAttribute("class"),
    /is-pending-application/,
  );
  assert.equal(
    await pendingApplication.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    ),
    "rgb(53, 147, 107)",
  );
  const submittedApplication = page.getByRole("button", {
    name: "已投递示例 产品经理",
    exact: true,
  });
  assert.doesNotMatch(
    await submittedApplication.getAttribute("class"),
    /is-pending-application/,
  );
  assert.notEqual(
    await submittedApplication.evaluate(
      (el) => getComputedStyle(el).borderTopColor,
    ),
    "rgb(53, 147, 107)",
  );
  const dayAhead = page.getByRole("button", {
    name: "提前一天截止示例 产品经理",
    exact: true,
  });
  assert.match(await dayAhead.getAttribute("class"), /urgency-urgent/);
  assert.doesNotMatch(await dayAhead.getAttribute("class"), /urgency-pulse/);
  assert.equal(
    await dayAhead.evaluate((el) => getComputedStyle(el).borderTopColor),
    "rgb(201, 84, 56)",
  );
  assert.equal(
    await dayAhead.evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await dayAhead.evaluate((el) => getComputedStyle(el).borderTopWidth),
    "2px",
  );
  assert.match(
    await dayAhead.evaluate((el) => getComputedStyle(el).boxShadow),
    /20px/,
  );
  assert.equal(await page.locator(".urgency-overdue").count(), 1);
  assert.match(await page.locator(".urgency-soon").innerText(), /明天截止/);
  assert.match(
    await page.locator(".urgency-urgent").first().innerText(),
    /开始/,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".urgency-pulse")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "提醒设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "提醒设置", exact: true });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /邮件未配置/);
  assert.equal(
    await dialog.getByRole("button", { name: "发送测试邮件" }).isDisabled(),
    true,
  );
  await dialog.getByLabel("特别紧急时显示呼吸光效").uncheck();
  await dialog.getByRole("button", { name: "保存设置" }).click();
  await dialog
    .getByText("设置已保存；邮件安排以同步状态为准。", { exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "关闭提醒设置" }).click();
  assert.equal(
    await page
      .locator(".urgency-pulse")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.reload();
  await page.locator('[data-reminder-motion="off"]').waitFor();
  await page
    .getByRole("button", { name: "临近截止示例 产品经理", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭此行动邮件" }).click();
  await page.getByRole("button", { name: "允许邮件提醒" }).waitFor();
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await mkdir("test-results", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/reminders-board.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "提醒设置", exact: true }).click();
  await page.screenshot({
    path: "test-results/reminders-settings.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await dialog.getByRole("button", { name: "保存设置" }).isVisible(),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS reminder thresholds, reduced motion, persisted settings, per-action mute, mobile dialog and no browser errors",
  );
} finally {
  await browser?.close();
  await app.close();
}
