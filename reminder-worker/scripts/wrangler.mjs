import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
// Preserve an existing manual deployment without publishing its account IDs.
const localConfig = resolve(root, "wrangler.local.jsonc");
if (
  args[0] === "deploy" &&
  !args.includes("--dry-run") &&
  !args.includes("--config") &&
  existsSync(localConfig)
) {
  args.push("--config", localConfig);
}
const result = spawnSync(
  process.execPath,
  [resolve(root, "node_modules/wrangler/bin/wrangler.js"), ...args],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: resolve(root, ".wrangler/logs"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
