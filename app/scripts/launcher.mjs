import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

export function isSupportedNodeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return false;

  const [, major, minor] = match.map(Number);
  return major === 24 && minor >= 14;
}

export function needsDependencyInstall({ lockfilePath, nodeModulesPath }) {
  const installedLockPath = join(nodeModulesPath, ".jobkanban-lock-stamp");
  if (!existsSync(nodeModulesPath) || !existsSync(installedLockPath))
    return true;
  return statSync(lockfilePath).mtimeMs > statSync(installedLockPath).mtimeMs;
}

function latestMtime(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path).reduce(
    (latest, entry) => Math.max(latest, latestMtime(join(path, entry))),
    0,
  );
}

export function needsBuild({ distEntryPath, inputPaths }) {
  if (!existsSync(distEntryPath)) return true;
  const builtAt = statSync(distEntryPath).mtimeMs;
  return inputPaths.some((path) => latestMtime(path) > builtAt);
}

export async function inspectEndpoint(baseUrl) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(1_000),
    });
  } catch {
    return "available";
  }
  if (response.ok) {
    try {
      const body = await response.json();
      if (body?.name === "JobKANBAN" && body?.status === "ok") {
        return "jobkanban";
      }
    } catch {
      // Older versions do not expose JSON health information.
    }
  }

  try {
    const root = await fetch(`${baseUrl}/`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!root.ok || !root.headers.get("content-type")?.includes("text/html")) {
      return "occupied";
    }
    const html = await root.text();
    const hasTitle = /<title[^>]*>\s*JobKANBAN(?:\s|·|<\/title>)/i.test(html);
    const hasRoot = /<div[^>]+\bid=["']root["']/i.test(html);
    return hasTitle && hasRoot ? "jobkanban" : "occupied";
  } catch {
    return "occupied";
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForJobKanban(
  baseUrl,
  { attempts = 50, delayMs = 100 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await inspectEndpoint(baseUrl)) === "jobkanban") return true;
    if (attempt < attempts - 1) await delay(delayMs);
  }
  return false;
}

export async function waitForHttp(url, { attempts = 50, delayMs = 100 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return true;
    } catch {
      // The process may still be starting; retry until the deadline.
    }
    if (attempt < attempts - 1) await delay(delayMs);
  }
  return false;
}

export async function launch({
  baseUrl = "http://127.0.0.1:3000",
  nodeVersion = process.versions.node,
} = {}) {
  if (!isSupportedNodeVersion(nodeVersion)) {
    throw new Error("需要 Node.js 24.14 或更新的 24.x 版本。");
  }

  const endpoint = await inspectEndpoint(baseUrl);
  if (endpoint === "jobkanban") {
    return { status: "already-running", url: baseUrl };
  }
  if (endpoint === "occupied") {
    throw new Error("端口 3000 已被其他程序占用，请先关闭该程序后再启动。");
  }
  return { status: "start-needed", url: baseUrl };
}

function runChecked(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 执行失败。`);
  }
}

function runNpm(args, cwd) {
  if (process.platform === "win32") {
    runChecked(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "npm", ...args],
      cwd,
    );
    return;
  }
  runChecked("npm", args, cwd);
}

export async function prepareApp(appDir, { build = true } = {}) {
  const lockfilePath = join(appDir, "package-lock.json");
  const nodeModulesPath = join(appDir, "node_modules");
  const installed = needsDependencyInstall({ lockfilePath, nodeModulesPath });
  if (installed) {
    runNpm(["ci"], appDir);
    mkdirSync(nodeModulesPath, { recursive: true });
    writeFileSync(join(nodeModulesPath, ".jobkanban-lock-stamp"), "");
  }

  const distEntryPath = join(appDir, "dist", "index.html");
  const built =
    build &&
    needsBuild({
      distEntryPath,
      inputPaths: [
        join(appDir, "src"),
        join(appDir, "../shared"),
        join(appDir, "index.html"),
        join(appDir, "vite.config.ts"),
        join(appDir, "tsconfig.json"),
        join(appDir, "package.json"),
        lockfilePath,
      ],
    });
  if (built) runNpm(["run", "build"], appDir);

  return { installed, built };
}

function startNpm(args, cwd) {
  if (process.platform === "win32") {
    return spawn(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "npm", ...args],
      { cwd, stdio: "inherit" },
    );
  }
  return spawn("npm", args, { cwd, stdio: "inherit" });
}

function openUrl(url) {
  let child;
  if (process.platform === "win32") {
    child = spawn(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `start "" "${url}"`],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
  } else if (process.platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
  child.unref();
}

function waitForExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function waitUntilReady(child, readiness, failureMessage) {
  const result = await Promise.race([
    readiness.then((ready) => ({ kind: "ready", ready })),
    waitForExit(child).then(({ code }) => ({ kind: "exit", code })),
  ]);
  if (result.kind === "ready" && result.ready) return;
  if (child.exitCode === null) child.kill();
  throw new Error(
    result.kind === "exit" && result.code
      ? `${failureMessage}（退出码 ${result.code}）。`
      : `${failureMessage}。`,
  );
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = "http://127.0.0.1:3000";
const devUrl = "http://127.0.0.1:5173";

async function runProduction({ open }) {
  const decision = await launch({ baseUrl: appUrl });
  if (decision.status === "already-running") {
    console.log(`JobKANBAN 已在运行：${appUrl}`);
    if (open) openUrl(appUrl);
    return;
  }

  console.log("正在检查依赖和前端构建…");
  const prepared = await prepareApp(appDir);
  if (prepared.installed) console.log("依赖已同步。");
  if (prepared.built) console.log("前端已构建。");

  const server = startNpm(["start"], appDir);
  await waitUntilReady(
    server,
    waitForJobKanban(appUrl),
    "JobKANBAN 服务启动失败",
  );
  console.log(`JobKANBAN：${appUrl}`);
  if (open) openUrl(appUrl);

  const { code } = await waitForExit(server);
  if (code && code !== 0)
    throw new Error(`JobKANBAN 已停止（退出码 ${code}）。`);
}

async function runDevelopment({ open }) {
  const decision = await launch({ baseUrl: appUrl });
  const prepared = await prepareApp(appDir, { build: false });
  if (prepared.installed) console.log("依赖已同步。");

  let server;
  try {
    if (decision.status === "start-needed") {
      server = startNpm(["start"], appDir);
      await waitUntilReady(
        server,
        waitForJobKanban(appUrl),
        "后端服务启动失败",
      );
    }

    const vite = startNpm(
      ["run", "dev", "--", "--port", "5173", "--strictPort"],
      appDir,
    );
    await waitUntilReady(vite, waitForHttp(devUrl), "前端开发服务启动失败");
    console.log(`JobKANBAN 开发模式：${devUrl}`);
    if (open) openUrl(devUrl);

    const { code } = await waitForExit(vite);
    if (code && code !== 0)
      throw new Error(`开发服务已停止（退出码 ${code}）。`);
  } finally {
    if (server?.exitCode === null) server.kill();
  }
}

export async function main(args = process.argv.slice(2)) {
  const allowed = new Set(["--dev", "--no-open"]);
  const unknown = args.filter((argument) => !allowed.has(argument));
  if (unknown.length) throw new Error(`不支持的启动参数：${unknown.join(" ")}`);

  const options = { open: !args.includes("--no-open") };
  if (args.includes("--dev")) await runDevelopment(options);
  else await runProduction(options);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`启动失败：${error.message}`);
    process.exitCode = 1;
  });
}
