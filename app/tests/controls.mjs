import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";

const app = createApp({ dbPath: ":memory:" });
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(`http://127.0.0.1:${app.server.address().port}`);
  for (const name of [
    "按城市筛选",
    "按状态筛选",
    "按行动日期筛选",
    "列内排序",
  ]) {
    const control = page.getByLabel(name, { exact: true });
    await control.waitFor();
    if (await page.evaluate(() => CSS.supports("appearance", "base-select")))
      assert.equal(
        await control.evaluate((el) => getComputedStyle(el).appearance),
        "base-select",
        name,
      );
  }
  await page.getByLabel("按状态筛选", { exact: true }).click();
  await page.getByRole("option", { name: "待反馈", exact: true }).click();
  assert.equal(
    await page.getByLabel("按状态筛选", { exact: true }).inputValue(),
    "待反馈",
  );
  await page.getByRole("button", { name: "新建求职记录", exact: true }).click();
  for (const name of ["投递日期", "行动日期", "行动时间（选填）"]) {
    if (name === "行动日期")
      await page
        .getByLabel("时间类型", { exact: true })
        .selectOption("appointment");
    const control = page.getByLabel(name, { exact: true });
    const spacing = await control.evaluate((input) => {
      const icon = input.parentElement
        .querySelector(".date-time-icon svg")
        .getBoundingClientRect();
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return (
        rect.left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft) -
        icon.right
      );
    });
    assert.ok(
      spacing >= 6,
      `${name}: date/time text must clear the leading icon, actual gap ${spacing}px`,
    );
    await control.click({ position: { x: 8, y: 20 } });
    await page
      .getByRole("dialog", { name: `选择${name}`, exact: true })
      .waitFor();
    const centered = await control.evaluate((input) => {
      const a = input.getBoundingClientRect(),
        b = input.parentElement
          .querySelector(".date-time-icon svg")
          .getBoundingClientRect();
      return Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
    });
    assert.ok(centered <= 1, `${name}: icon is vertically centered`);
    await page.keyboard.press("Escape");
  }
  const date = page.getByLabel("投递日期", { exact: true });
  const calendar = page.getByRole("dialog", {
    name: "选择投递日期",
    exact: true,
  });
  await date.click();
  await calendar.getByLabel("年份", { exact: true }).selectOption("2028");
  await calendar.getByLabel("月份", { exact: true }).selectOption("1");
  await calendar
    .getByRole("button", { name: "2028-02-29", exact: true })
    .click();
  assert.equal(await date.inputValue(), "2028-02-29");
  assert.equal(await calendar.isVisible(), false);
  await date.click();
  await calendar.getByRole("button", { name: "下个月", exact: true }).click();
  assert.equal(
    await calendar.getByLabel("月份", { exact: true }).inputValue(),
    "2",
  );
  await calendar.getByRole("button", { name: "清除", exact: true }).click();
  assert.equal(await date.inputValue(), "");
  await date.click();
  const today = await calendar
    .locator('[aria-current="date"]')
    .getAttribute("aria-label");
  await calendar.getByRole("button", { name: "今天", exact: true }).click();
  assert.equal(await date.inputValue(), today);
  const time = page.getByLabel("行动时间（选填）", { exact: true });
  await time.click();
  const clock = page.getByRole("dialog", {
    name: "选择行动时间（选填）",
    exact: true,
  });
  await clock.getByLabel("小时", { exact: true }).selectOption("14");
  await clock.getByLabel("分钟", { exact: true }).selectOption("35");
  await clock.getByRole("button", { name: "确定时间", exact: true }).click();
  assert.equal(await time.inputValue(), "14:35");
  assert.equal(await clock.isVisible(), false);
  await time.click();
  await clock.getByRole("button", { name: "清除", exact: true }).click();
  assert.equal(await time.inputValue(), "");
  for (const width of [1440, 1200]) {
    await page.setViewportSize({ width, height: 800 });
    await date.click();
    const rect = await calendar.boundingBox();
    assert.ok(
      rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= width &&
        rect.y + rect.height <= 800,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await date.isVisible(),
      true,
      "Escape closes calendar without closing record form",
    );
  }
  console.log(
    "PASS board dropdowns, centered icons, calendar selection, time selection and popup placement",
  );
} finally {
  await browser.close();
  await app.close();
}
