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
  await page.evaluate(() => {
    window.pickerCalls = [];
    const native = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () {
      window.pickerCalls.push(this.getAttribute("aria-label"));
      return native.call(this);
    };
  });
  for (const name of ["投递日期", "行动日期", "行动时间（选填）"]) {
    if (name === "行动日期")
      await page
        .getByLabel("时间类型", { exact: true })
        .selectOption("appointment");
    const control = page.getByLabel(name, { exact: true });
    const spacing = await control.evaluate((input) => {
      const icon = input.parentElement.querySelector('.date-time-icon svg').getBoundingClientRect();
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) - icon.right;
    });
    assert.ok(spacing >= 6, `${name}: date/time text must clear the leading icon, actual gap ${spacing}px`);
    await control.click({ position: { x: 8, y: 20 } });
    assert.ok(
      await page.evaluate((label) => window.pickerCalls.includes(label), name),
      `${name}: left side opens picker`,
    );
    await page.keyboard.press("Escape");
  }
  console.log("PASS board dropdown menus and whole-field date/time pickers");
} finally {
  await browser.close();
  await app.close();
}
