import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const appDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = path.dirname(appDirectory);
const designDirectory = path.join(repositoryRoot, "design");
const designScripts = [
  "check-action-completion.cjs",
  "check-centered-detail.cjs",
  "check-detail-themes.cjs",
  "check-shell-theme.cjs",
  "export-preview.cjs",
];

test("design scripts load Playwright from the project instead of a machine-specific path", () => {
  const playwright = require("../../design/playwright.cjs");

  assert.equal(typeof playwright.chromium.launch, "function");

  for (const scriptName of designScripts) {
    const source = fs.readFileSync(
      path.join(designDirectory, scriptName),
      "utf8",
    );
    assert.match(source, /require\(['"]\.\/playwright\.cjs['"]\)/);
    assert.doesNotMatch(source, /(?:['"`][A-Za-z]:[\\/]|\/Users\/|\/home\/)/);
  }
});
