import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "jobkanban-browser-"));
const staticDir = resolve(process.env.TEST_STATIC_DIR || "dist");
const resultsDir = resolve(process.env.TEST_RESULTS_DIR || "test-results");
let app = createApp({
  dbPath: join(dir, "test.sqlite"),
  staticDir,
  clock: () => new Date("2026-09-07T16:30:00Z"),
});
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
let base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Shanghai",
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.clock.install({ time: new Date("2026-09-08T10:00:00+08:00") });
  await page.goto(base);
  await page.getByRole("button", { name: "新建求职记录", exact: true }).click();
  await page.getByLabel("公司", { exact: true }).fill("持久化测试公司");
  await page.getByLabel("岗位", { exact: true }).fill("React 工程师");
  await page.getByRole("button", { name: "创建记录", exact: true }).click();
  await page
    .getByRole("button", { name: "持久化测试公司 React 工程师", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "持久化测试公司 React 工程师", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "持久化测试公司 React 工程师", exact: true })
      .count(),
    1,
  );
  console.log("PASS create and reload persistence");
  const assessmentColumn = page.locator(
    '.kanban-column[data-stage="assessment"]',
  );
  await assessmentColumn
    .getByRole("button", { name: "添加到测评", exact: true })
    .click();
  const assessmentCreate = page.getByRole("dialog", {
    name: "添加测评记录",
    exact: true,
  });
  await assessmentCreate
    .getByLabel("公司", { exact: true })
    .fill("栏位测试公司");
  await assessmentCreate.getByLabel("岗位", { exact: true }).fill("产品经理");
  await assessmentCreate
    .getByRole("button", { name: "创建记录", exact: true })
    .click();
  await assessmentColumn
    .getByRole("button", { name: "栏位测试公司 产品经理", exact: true })
    .waitFor();

  const resultColumn = page.locator('.kanban-column[data-stage="result"]');
  await resultColumn
    .getByRole("button", { name: "新建结果记录", exact: true })
    .click();
  const resultCreate = page.getByRole("dialog", {
    name: "添加结果记录",
    exact: true,
  });
  await resultCreate.getByLabel("公司", { exact: true }).fill("结果测试公司");
  await resultCreate.getByLabel("岗位", { exact: true }).fill("数据分析师");
  await resultCreate
    .getByRole("button", { name: "创建记录", exact: true })
    .click();
  assert.match(await resultCreate.innerText(), /请选择求职结果/);
  await resultCreate
    .getByLabel("求职结果", { exact: true })
    .selectOption("withdrawn");
  await resultCreate
    .getByRole("button", { name: "创建记录", exact: true })
    .click();
  await resultColumn
    .getByRole("button", { name: "结果测试公司 数据分析师", exact: true })
    .waitFor();
  console.log("PASS column add buttons create directly in their stages");
  const card = () =>
    page.getByRole("button", {
      name: "持久化测试公司 React 工程师",
      exact: true,
    });
  const detail = () =>
    page.getByRole("dialog", { name: "持久化测试公司岗位详情", exact: true });
  const form = () =>
    page.getByRole("dialog", { name: "更新求职进展", exact: true });
  await card().click();
  await detail().getByRole("button", { name: "更新进展", exact: true }).click();
  await form()
    .getByLabel("目标阶段", { exact: true })
    .selectOption("interview");
  await form().getByLabel("阶段状态", { exact: true }).selectOption("待完成");
  await form().getByLabel("轮次", { exact: true }).fill("第一轮");
  await form().getByLabel("行动内容", { exact: true }).fill("参加业务面试");
  await form()
    .getByLabel("时间类型", { exact: true })
    .selectOption("appointment");
  await form().getByLabel("行动日期", { exact: true }).fill("2026-09-07");
  await form().getByLabel("行动时间（选填）", { exact: true }).fill("15:30");
  await form().getByLabel("本轮备注", { exact: true }).fill("重点讨论用户研究");
  await form().getByRole("button", { name: "保存进展", exact: true }).click();
  await form().waitFor({ state: "hidden" });
  assert.match(await detail().innerText(), /待更新/);
  await detail()
    .getByRole("button", { name: "完成并待反馈", exact: true })
    .click();
  await detail().getByText("等待面试反馈", { exact: true }).waitFor();
  assert.match(
    await detail().innerText(),
    /等待反馈 0 天/,
    "Beijing midnight starts zero waiting days",
  );
  assert.match(await detail().innerText(), /参加业务面试/);
  assert.match(await detail().innerText(), /15:30/);
  assert.match(
    await detail().innerText(),
    /原行动信息：面试 · 第一轮 · 预约时间/,
  );
  console.log("PASS progress, date, completion and visible history");
  await detail().getByRole("button", { name: "更新进展", exact: true }).click();
  await form().getByLabel("轮次", { exact: true }).fill("第二轮");
  assert.equal(
    await form().getByLabel("本轮备注", { exact: true }).inputValue(),
    "",
    "new round must not inherit first-round notes",
  );
  await form().getByLabel("阶段状态", { exact: true }).selectOption("待完成");
  await form().getByLabel("行动内容", { exact: true }).fill("第二轮准备材料");
  await form().getByLabel("本轮备注", { exact: true }).fill("准备商业案例");
  await form().getByRole("button", { name: "保存进展", exact: true }).click();
  await form().waitFor({ state: "hidden" });
  assert.match(await detail().innerText(), /重点讨论用户研究/);
  assert.match(await detail().innerText(), /准备商业案例/);
  await detail().getByRole("button", { name: "取消行动", exact: true }).click();
  await detail().getByText("暂无下一步行动", { exact: true }).waitFor();
  assert.match(await detail().innerText(), /待完成/);
  assert.match(await detail().innerText(), /取消行动/);
  console.log("PASS separate rounds and independent cancellation");
  await detail().getByRole("button", { name: "更新进展", exact: true }).click();
  await form().getByLabel("目标阶段", { exact: true }).selectOption("result");
  await form().getByRole("button", { name: "保存进展", exact: true }).click();
  assert.match(await form().innerText(), /请选择求职结果/);
  await form().getByLabel("求职结果", { exact: true }).selectOption("offer");
  await form().getByRole("button", { name: "保存进展", exact: true }).click();
  await form().waitFor({ state: "hidden" });
  await detail()
    .getByRole("button", { name: "记录已接受", exact: true })
    .click();
  await detail()
    .getByText("已记录接受决定，祝下一段旅程顺利。", { exact: true })
    .waitFor();
  assert.ok(!(await detail().innerText()).includes("答复期限：未设置"));
  await detail().getByRole("button", { name: "归档记录", exact: true }).click();
  await detail().waitFor({ state: "hidden" });
  assert.equal(await card().count(), 0);
  await page.getByRole("link", { name: "已归档", exact: true }).click();
  await card().click();
  assert.match(await detail().innerText(), /已接受/);
  await detail()
    .getByRole("button", { name: "恢复到看板", exact: true })
    .click();
  await detail().waitFor({ state: "hidden" });
  await page.getByRole("link", { name: "求职看板", exact: true }).click();
  await card().waitFor();
  console.log("PASS result validation, Offer decision, archive and restore");
  await card().click();
  await detail()
    .getByRole("button", { name: "编辑", exact: true })
    .first()
    .click();
  const edit = () =>
    page.getByRole("dialog", { name: "编辑求职记录", exact: true });
  await edit().getByLabel("城市", { exact: true }).fill("成都");
  await page.route("**/api/jobs/*", (route) =>
    route.request().method() === "PATCH" ? route.abort() : route.continue(),
  );
  await edit().getByRole("button", { name: "保存修改", exact: true }).click();
  await edit().getByRole("alert").waitFor();
  assert.equal(
    await edit().getByLabel("城市", { exact: true }).inputValue(),
    "成都",
  );
  await page.unroute("**/api/jobs/*");
  await edit().getByRole("button", { name: "保存修改", exact: true }).click();
  await edit().waitFor({ state: "hidden" });
  await detail().getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.getByLabel("按城市筛选", { exact: true }).selectOption("成都");
  await card().waitFor();
  console.log("PASS failure retains input, retry saves, cities refresh");
  await page
    .getByRole("button", { name: "清除筛选", exact: true })
    .first()
    .click();
  const other = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await other.goto(base);
  await other
    .getByRole("button", { name: "持久化测试公司 React 工程师", exact: true })
    .click();
  await other
    .getByRole("dialog", { name: "持久化测试公司岗位详情", exact: true })
    .getByRole("button", { name: "编辑", exact: true })
    .first()
    .click();
  await other.getByLabel("城市", { exact: true }).fill("杭州");
  await card().click();
  await detail()
    .getByRole("button", { name: "编辑", exact: true })
    .first()
    .click();
  await edit().getByLabel("城市", { exact: true }).fill("北京");
  await edit().getByRole("button", { name: "保存修改", exact: true }).click();
  await edit().waitFor({ state: "hidden" });
  await other.getByRole("button", { name: "保存修改", exact: true }).click();
  await other.getByRole("alert").waitFor();
  assert.match(await other.getByRole("alert").innerText(), /已被更新/);
  await other
    .getByRole("button", { name: "重新读取最新记录", exact: true })
    .click();
  await other
    .getByRole("dialog", { name: "编辑求职记录", exact: true })
    .waitFor({ state: "hidden" });
  assert.match(
    await other
      .getByRole("dialog", { name: "持久化测试公司岗位详情", exact: true })
      .innerText(),
    /北京/,
  );
  await other.close();
  await detail().getByRole("button", { name: "关闭详情", exact: true }).click();
  await app.close();
  app = createApp({
    dbPath: join(dir, "test.sqlite"),
    staticDir,
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  await page.goto(base);
  await card().click();
  assert.match(await detail().innerText(), /北京/);
  assert.match(await detail().innerText(), /准备商业案例/);
  assert.match(await detail().innerText(), /已接受/);
  console.log("PASS conflict protection and server restart persistence");
  await mkdir(resultsDir, { recursive: true });
  await page.screenshot({
    animations: "disabled",
    path: join(resultsDir, "detail.png"),
  });
  await page.keyboard.press("Escape");
  await detail().waitFor({ state: "hidden" });
  await page.screenshot({
    animations: "disabled",
    path: join(resultsDir, "board.png"),
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "desktop fits 1200",
  );
  await page.screenshot({
    animations: "disabled",
    path: join(resultsDir, "board-1200.png"),
  });
  assert.deepEqual(pageErrors, []);
  console.log("PASS Escape, desktop layout and no browser errors");
} finally {
  await browser.close();
  await app.close();
}
