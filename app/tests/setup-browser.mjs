import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/index.mjs";

const dir = await mkdtemp(join(tmpdir(), "jobkanban-wizard-browser-"));
const accountId = "a".repeat(32);
let database;
let firstUpload = true;
let submittedCode;
let requestedTest = false;
let failEdit = false;
let deployCount = 0;
const app = createApp({
  dbPath: join(dir, "jobs.sqlite"),
  reminderOptions: {
    url: undefined,
    token: undefined,
    fetcher: async (url, options) => {
      if (url.endsWith("/sync"))
        return Response.json({ revision: JSON.parse(options.body).revision });
      if (url.endsWith("/test")) {
        requestedTest = true;
        return Response.json({ message: "测试邮件已排队" });
      }
      return Response.json({ counts: [], issues: [] });
    },
  },
  setupOptions: {
    fetcher: async () => Response.json({ counts: [], issues: [] }),
    runner: async (_command, args, options) => {
      const command = args.slice(1, args.indexOf("--config"));
      const config = JSON.parse(await readFile(args.at(-1), "utf8"));
      if (command[0] === "whoami")
        return JSON.stringify({
          loggedIn: true,
          accounts: [{ id: accountId, name: "我的 Cloudflare 账户（演示）" }],
        });
      if (command[0] === "d1" && command[1] === "list")
        return JSON.stringify(database ? [database] : []);
      if (command[0] === "d1" && command[1] === "create") {
        database = {
          name: command[2],
          uuid: "11111111-1111-1111-1111-111111111111",
        };
        return "created";
      }
      if (command[0] === "deploy") {
        deployCount++;
        return `https://${config.name}.example.workers.dev`;
      }
      if (command[0] === "secret" && command[1] === "list")
        return JSON.stringify([{ name: "SYNC_TOKEN" }]);
      if (command[0] === "secret") {
        submittedCode = JSON.parse(options.input).SMTP_AUTH_CODE;
        if (failEdit) {
          failEdit = false;
          throw new Error("private edit failure");
        }
        if (firstUpload) {
          firstUpload = false;
          throw new Error("private upstream diagnostic");
        }
      }
      return "done";
    },
  },
});
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  await page.getByRole("button", { name: "提醒设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "提醒设置", exact: true });
  await dialog
    .getByRole("button", { name: "连接 Cloudflare", exact: true })
    .click();
  await dialog
    .getByRole("status")
    .filter({ hasText: "Cloudflare 已连接" })
    .waitFor();
  assert.equal(
    await dialog.getByLabel("Cloudflare 账户", { exact: true }).inputValue(),
    accountId,
  );
  await dialog.getByLabel("163 发信邮箱", { exact: true }).fill("demo@163.com");
  await dialog.getByLabel("提醒收件邮箱", { exact: true }).fill("demo@163.com");
  assert.equal(
    await dialog
      .getByLabel("邮箱客户端授权码", { exact: true })
      .getAttribute("type"),
    "password",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/reminder-setup.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog
    .getByRole("button", { name: "部署并保存配置", exact: true })
    .scrollIntoViewIfNeeded();
  assert.equal(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await dialog
    .getByLabel("邮箱客户端授权码", { exact: true })
    .fill("fixture-only-code");
  await dialog
    .getByRole("button", { name: "部署并保存配置", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "安全上传邮箱配置未完成" })
    .waitFor();
  assert.equal(
    await dialog.getByLabel("邮箱客户端授权码", { exact: true }).inputValue(),
    "",
  );
  assert.ok(
    !(await dialog.innerText()).includes("private upstream diagnostic"),
  );
  await dialog
    .getByLabel("邮箱客户端授权码", { exact: true })
    .fill("retry-fixture-code");
  await dialog.getByRole("button", { name: "重试配置", exact: true }).click();
  await dialog
    .getByText("配置已保存。请先发送测试邮件，实际收到后再开启邮件提醒。", {
      exact: true,
    })
    .waitFor();
  assert.equal(submittedCode, "retry-fixture-code");
  assert.equal(
    await dialog.getByLabel("接收邮箱", { exact: true }).inputValue(),
    "demo@163.com",
  );
  assert.equal(
    await dialog.getByLabel("开启邮件提醒", { exact: true }).isChecked(),
    false,
  );
  await dialog
    .getByRole("button", { name: "发送测试邮件", exact: true })
    .click();
  await dialog.getByText("测试邮件已排队", { exact: true }).waitFor();
  assert.equal(requestedTest, true);
  await dialog
    .getByRole("button", { name: "修改邮件配置", exact: true })
    .click();
  await dialog
    .getByRole("heading", { name: "修改邮件配置", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('input[placeholder="留空保留现有发信邮箱"]')
        ?.value === "demo@163.com",
  );
  assert.equal(
    await dialog.getByLabel("邮箱客户端授权码", { exact: true }).inputValue(),
    "",
  );
  await dialog
    .getByRole("button", { name: "连接 Cloudflare", exact: true })
    .click();
  await dialog
    .getByRole("status")
    .filter({ hasText: "Cloudflare 已连接" })
    .waitFor();
  await dialog
    .getByLabel("提醒收件邮箱", { exact: true })
    .fill("changed@example.com");
  await page.screenshot({
    path: "test-results/reminder-edit.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  failEdit = true;
  await dialog
    .getByRole("button", { name: "保存邮件配置", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "更新原服务邮箱配置未完成" })
    .waitFor();
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const paused = await (await fetch(base + "/api/reminders")).json();
  assert.equal(paused.enabled, false);
  const blocked = await fetch(base + "/api/reminders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true, revision: paused.revision }),
  });
  assert.equal(blocked.status, 409);
  assert.equal(
    (
      await fetch(base + "/api/reminders/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    409,
  );
  await dialog.getByRole("button", { name: "重试配置", exact: true }).click();
  await dialog
    .getByText("配置已保存。请先发送测试邮件，实际收到后再开启邮件提醒。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await dialog.getByLabel("接收邮箱", { exact: true }).inputValue(),
    "changed@example.com",
  );
  assert.equal(
    await dialog.getByLabel("开启邮件提醒", { exact: true }).isChecked(),
    false,
  );
  assert.equal(deployCount, 2); // Initial deployment plus its retry only; editing never deploys.
  assert.equal(submittedCode, undefined); // Blank authorization code keeps the cloud secret.
  await dialog
    .getByRole("button", { name: "修改邮件配置", exact: true })
    .click();
  await dialog
    .getByRole("heading", { name: "修改邮件配置", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "返回提醒设置", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "修改邮件配置", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS in-app setup, safe failure, retry, credential clearing and test-mail handoff (all cloud operations mocked)",
  );
} finally {
  await browser.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
