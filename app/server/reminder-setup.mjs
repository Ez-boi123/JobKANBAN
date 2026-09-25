import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { HttpError, validateBody } from "./domain.mjs";
import { validEmail } from "../../shared/reminders.mjs";

// Never include child output in an HTTP error: it may contain OAuth URLs or secrets.
export function runSetupCommand(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let combinedOutput = "";
    const stop = () => child.kill();
    const timer = setTimeout(stop, options.timeout || 180000);
    const abort = () => stop();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) stop();
    const finish = (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(new Error("部署工具执行失败或超时"));
      else resolvePromise(stripVTControlCharacters(output));
    };
    child.on("error", () => finish(true));
    child.on("close", (code) => finish(code !== 0 || options.signal?.aborted));
    const receive = (chunk, stdout) => {
      if (stdout) output += chunk.toString();
      combinedOutput += chunk.toString();
      if (combinedOutput.length > 2 * 1024 * 1024) return stop();
      options.onOutput?.(stripVTControlCharacters(combinedOutput));
    };
    child.stdout.on("data", (chunk) => receive(chunk, true));
    child.stderr.on("data", (chunk) => receive(chunk, false));
    child.stdin.on("error", () => {});
    child.stdin.end(options.input || "");
  });
}

function parseJson(output) {
  // --json commands disable their banner. Reject unexpected output instead of
  // treating a partial response as authority to deploy to another account.
  return JSON.parse(output.trim());
}

function readJsonConfig(path) {
  // Preserve quoted strings while removing JSONC comments and trailing commas.
  const text = readFileSync(path, "utf8")
    .replace(
      /("(?:\\.|[^"\\])*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
      (all, string) => string || "",
    )
    .replace(
      /("(?:\\.|[^"\\])*")|,(?=\s*[}\]])/g,
      (all, string) => string || "",
    );
  return JSON.parse(text);
}

export async function writePrivateJson(file, value) {
  const temporary = file + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  await rename(temporary, file);
}

export function createReminderSetup({
  root,
  dataDir,
  store,
  configured,
  activate,
  connection = () => null,
  pauseForUpdate = async () => {
    throw new Error("未提供安全停用操作");
  },
  legacyConfigPath = resolve(root, "../reminder-worker/wrangler.local.jsonc"),
  runner = runSetupCommand,
  fetcher = fetch,
}) {
  const workerDir = resolve(root, "../reminder-worker");
  const setupDir = join(dataDir, "reminder-setup");
  const configPath = join(setupDir, "wrangler.json");
  const planPath = join(setupDir, "deployment.json");
  const pendingPath = join(setupDir, "mail-update.pending.json");
  const mailPath = join(setupDir, "mail-config.json");
  const editConfigPath = join(setupDir, "mail-update.wrangler.json");
  const cli = join(workerDir, "node_modules/wrangler/bin/wrangler.js");
  let operation = null;
  let controller;
  let state = {
    phase: "idle",
    step: "",
    error: "",
    authUrl: "",
    accounts: [],
    url: "",
    mode: "create",
  };
  let plan;
  if (existsSync(planPath)) {
    try {
      plan = JSON.parse(readFileSync(planPath, "utf8"));
    } catch {
      state.error =
        "本机部署记录无法读取，请检查 data/reminder-setup 中的备份。";
    }
  }
  function editTarget() {
    const current = connection();
    if (!configured() || !current?.url || !current?.token)
      throw new HttpError(409, "尚未连接邮件服务");
    let target;
    if (plan) {
      if (
        plan.token !== current.token ||
        plan.source !== store.reminders().source
      )
        throw new HttpError(409, "部署记录与当前连接不一致，请核对原服务配置");
      target = { accountId: plan.accountId, name: plan.name };
    } else if (existsSync(legacyConfigPath)) {
      const config = readJsonConfig(legacyConfigPath);
      target = { accountId: config.account_id, name: config.name };
    }
    if (
      !target ||
      !/^[a-f0-9]{32}$/.test(target.accountId) ||
      !/^[a-z0-9][a-z0-9-]{0,62}$/.test(target.name)
    )
      throw new HttpError(
        409,
        "缺少原服务的账户或名称，请按文档补齐 wrangler.local.jsonc，不能创建新服务替代",
      );
    const url = new URL(current.url);
    if (
      url.protocol !== "https:" ||
      url.hostname.split(".").length !== 4 ||
      !url.hostname.endsWith(".workers.dev") ||
      !url.hostname.startsWith(target.name + ".")
    )
      throw new HttpError(
        409,
        "原服务名称与连接地址不一致，暂不支持在窗口修改自定义域名服务",
      );
    let sender = "";
    if (existsSync(mailPath)) {
      const mail = JSON.parse(readFileSync(mailPath, "utf8"));
      if (mail.url === url.origin) sender = mail.sender || "";
    }
    return {
      ...target,
      url: url.origin,
      sender,
      recipient: store.reminders().recipient,
    };
  }
  const snapshot = () => {
    let current = null,
      editError = "";
    if (configured()) {
      try {
        current = editTarget();
      } catch (e) {
        editError = e.status
          ? e.message
          : "原服务配置无法读取，请检查本机部署配置";
      }
    }
    return {
      ...state,
      busy: !!operation,
      configured: configured(),
      current,
      editError,
      updatePending: existsSync(pendingPath),
    };
  };
  const update = (phase, step) => {
    state = { ...state, phase, step, error: "" };
  };
  const ensureAvailable = () => {
    if (operation) throw new HttpError(409, "已有配置任务正在进行，请等待完成");
    if (configured())
      throw new HttpError(
        409,
        "当前已经连接邮件服务，无需再次部署；更换服务请先按迁移指南停用旧队列",
      );
    if (store.reminders().enabled || store.reminders().syncedRevision > 0)
      throw new HttpError(
        409,
        "此看板已有云端同步历史，请先按迁移指南核对旧服务，避免重复提醒",
      );
  };
  function start(task) {
    controller = new AbortController();
    operation = Promise.resolve()
      .then(task)
      .catch(() => {
        state = {
          ...state,
          phase: "error",
          authUrl: "",
          error: `${state.step || "配置"}未完成。请检查网络、Cloudflare 授权和账户权限后重试；${state.mode === "edit" ? "仍使用原服务，邮件可能已暂停，重新提交可继续修改。" : "已创建的资源会保留并在重试时复用。"}`,
        };
      })
      .finally(() => {
        operation = null;
      });
    return snapshot();
  }
  async function command(args, extras = {}) {
    const target = state.mode === "edit" ? editTarget() : null;
    return runner(
      process.execPath,
      [cli, ...args, "--config", target ? editConfigPath : configPath],
      {
        cwd: workerDir,
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: target?.accountId || plan?.accountId || "",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_LOG: "log",
          WRANGLER_LOG_SANITIZE: "true",
          WRANGLER_LOG_PATH: join(setupDir, "logs"),
          CI: "true",
          NO_COLOR: "1",
        },
        signal: controller.signal,
        ...extras,
      },
    );
  }
  async function writeConfig() {
    await mkdir(setupDir, { recursive: true, mode: 0o700 });
    await writePrivateJson(configPath, {
      name: plan?.name || "jobkanban-reminders",
      ...(plan?.accountId ? { account_id: plan.accountId } : {}),
      main: join(workerDir, "src/index.ts"),
      compatibility_date: "2026-09-23",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: true,
      triggers: { crons: ["* * * * *"] },
      ...(plan?.databaseId
        ? {
            d1_databases: [
              {
                binding: "DB",
                database_name: plan.name,
                database_id: plan.databaseId,
                migrations_dir: join(workerDir, "migrations"),
              },
            ],
          }
        : {}),
      observability: { enabled: true, logs: { invocation_logs: false } },
    });
  }
  async function prepare() {
    if (existsSync(planPath) && !plan) throw new Error("部署记录损坏");
    if (state.mode === "edit") {
      const target = editTarget();
      await mkdir(setupDir, { recursive: true, mode: 0o700 });
      await writePrivateJson(editConfigPath, {
        name: target.name,
        account_id: target.accountId,
        compatibility_date: "2026-09-23",
      });
    } else await writeConfig();
    if (!existsSync(cli)) {
      update("preparing", "安装 Cloudflare 部署工具（首次使用可能需要数分钟）");
      const windows = process.platform === "win32";
      await runner(
        windows ? process.env.ComSpec || "cmd.exe" : "npm",
        windows
          ? [
              "/d",
              "/s",
              "/c",
              "npm ci --include=dev --ignore-scripts --no-audit --no-fund",
            ]
          : [
              "ci",
              "--include=dev",
              "--ignore-scripts",
              "--no-audit",
              "--no-fund",
            ],
        {
          cwd: workerDir,
          env: process.env,
          signal: controller.signal,
          timeout: 300000,
        },
      );
    }
  }
  async function accounts() {
    const info = parseJson(await command(["whoami", "--json"]));
    if (!info.loggedIn || !Array.isArray(info.accounts))
      throw new Error("未登录");
    const result = info.accounts
      .filter((a) => /^[a-f0-9]{32}$/.test(a.id) && typeof a.name === "string")
      .map(({ id, name }) => ({ id, name }));
    if (!result.length) throw new Error("没有可用账户");
    state.accounts = result;
    return result;
  }
  function connect(body) {
    validateBody(body, ["reauthorize", "edit"]);
    if (body.edit !== undefined && typeof body.edit !== "boolean")
      throw new HttpError(400, "配置模式无效");
    if (body.reauthorize !== undefined && typeof body.reauthorize !== "boolean")
      throw new HttpError(400, "授权选项无效");
    if (body.edit) {
      if (operation)
        throw new HttpError(409, "已有配置任务正在进行，请等待完成");
      editTarget();
    } else ensureAvailable();
    state.mode = body.edit ? "edit" : "create";
    update("preparing", "检查 Cloudflare 登录状态");
    state.authUrl = "";
    state.accounts = [];
    return start(async () => {
      await prepare();
      let loggedIn = false;
      if (!body.reauthorize) {
        try {
          await accounts();
          loggedIn = true;
        } catch {}
      }
      if (!loggedIn) {
        update("authorizing", "等待你在浏览器中登录并允许授权");
        await command(["login", "--browser=false"], {
          timeout: 300000,
          onOutput: (output) => {
            const match = output.match(
              /https:\/\/dash\.cloudflare\.com\/oauth2\/auth\?[^\s\u001b]+/,
            );
            if (match) state.authUrl = match[0];
          },
        });
        state.authUrl = "";
        await accounts();
      }
      update(
        "ready",
        body.edit
          ? "Cloudflare 已连接，请确认原服务账户并修改邮箱"
          : "Cloudflare 已连接，请选择账户并填写邮箱",
      );
    });
  }
  function deploy(body) {
    validateBody(body, ["accountId", "sender", "authCode", "recipient"]);
    ensureAvailable();
    state.mode = "create";
    if (!state.accounts.some((a) => a.id === body.accountId))
      throw new HttpError(400, "请先连接 Cloudflare 并选择已授权账户");
    if (
      !validEmail(body.sender) ||
      !body.sender.toLowerCase().endsWith("@163.com")
    )
      throw new HttpError(400, "当前仅支持 163 发信邮箱");
    if (!validEmail(body.recipient))
      throw new HttpError(400, "请填写有效收件邮箱");
    if (
      typeof body.authCode !== "string" ||
      !/^[\x21-\x7e]{6,256}$/.test(body.authCode)
    )
      throw new HttpError(400, "请填写有效的邮箱客户端授权码（不是登录密码）");
    if (
      plan &&
      (plan.accountId !== body.accountId ||
        plan.source !== store.reminders().source)
    )
      throw new HttpError(
        409,
        "已有部署进度属于另一账户或看板，请恢复原账户后继续",
      );
    const credentials = {
      sender: body.sender,
      code: body.authCode,
      recipient: body.recipient,
    };
    update("deploying", "检查账户与部署记录");
    return start(async () => {
      try {
        await prepare();
        const authorized = await accounts();
        if (!authorized.some((a) => a.id === body.accountId))
          throw new Error("账户授权发生变化");
        if (!plan) {
          plan = {
            accountId: body.accountId,
            name: `jobkanban-reminders-${randomBytes(6).toString("hex")}`,
            source: store.reminders().source,
            token: randomBytes(32).toString("hex"),
          };
          await writePrivateJson(planPath, plan);
        }
        await writeConfig();
        update("deploying", "创建或恢复提醒数据库");
        if (!plan.databaseId) {
          const databases = parseJson(await command(["d1", "list", "--json"]));
          if (!Array.isArray(databases)) throw new Error("数据库列表无效");
          let database = databases.find((d) => d.name === plan.name);
          if (!database) {
            await command(["d1", "create", plan.name, "--update-config=false"]);
            const next = parseJson(await command(["d1", "list", "--json"]));
            database = next.find((d) => d.name === plan.name);
          }
          if (!database || !/^[a-f0-9-]{36}$/.test(database.uuid))
            throw new Error("数据库创建未确认");
          plan.databaseId = database.uuid;
          await writePrivateJson(planPath, plan);
          await writeConfig();
        }
        update("deploying", "初始化数据库");
        await command(["d1", "migrations", "apply", plan.name, "--remote"]);
        update("deploying", "部署云端提醒服务与定时任务");
        const output = await command(["deploy"]);
        const candidates =
          output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/g) || [];
        const url = candidates.find((candidate) =>
          new URL(candidate).hostname.startsWith(plan.name + "."),
        );
        if (!url)
          throw new Error(
            "未获得服务地址，请在 Cloudflare 开通 workers.dev 子域",
          );
        update("deploying", "安全上传邮箱配置");
        await command(["secret", "bulk"], {
          input: JSON.stringify({
            SYNC_TOKEN: plan.token,
            SMTP_USER: credentials.sender,
            SMTP_AUTH_CODE: credentials.code,
            RECIPIENT_EMAIL: credentials.recipient,
          }),
        });
        credentials.code = "";
        update("deploying", "检查云端连接并保存本机配置");
        const response = await fetcher(url + "/status", {
          headers: { Authorization: `Bearer ${plan.token}` },
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("云端尚未就绪");
        const status = await response.json();
        if (!Array.isArray(status.counts) || !Array.isArray(status.issues))
          throw new Error("云端响应无效");
        await activate({
          url,
          token: plan.token,
          recipient: credentials.recipient,
        });
        await writePrivateJson(mailPath, { url, sender: credentials.sender });
        state.url = url;
        update("complete", "配置已保存。请发送测试邮件，实际收到后再开启提醒");
      } finally {
        credentials.code = "";
        body.authCode = "";
      }
    });
  }
  function edit(body) {
    validateBody(body, ["accountId", "sender", "authCode", "recipient"]);
    if (operation) throw new HttpError(409, "已有配置任务正在进行，请等待完成");
    const target = editTarget();
    if (
      state.mode !== "edit" ||
      body.accountId !== target.accountId ||
      !state.accounts.some((a) => a.id === target.accountId)
    )
      throw new HttpError(400, "请先连接原服务所属的 Cloudflare 账户");
    if (!validEmail(body.recipient))
      throw new HttpError(400, "请填写有效收件邮箱");
    if (
      body.sender &&
      (!validEmail(body.sender) ||
        !body.sender.toLowerCase().endsWith("@163.com"))
    )
      throw new HttpError(400, "当前仅支持 163 发信邮箱");
    if (
      typeof body.authCode !== "string" ||
      (body.authCode && !/^[\x21-\x7e]{6,256}$/.test(body.authCode))
    )
      throw new HttpError(400, "请填写有效的邮箱客户端授权码");
    if (body.sender && body.sender !== target.sender && !body.authCode)
      throw new HttpError(400, "更换发信邮箱时必须填写对应授权码");
    if (body.authCode && !body.sender)
      throw new HttpError(400, "填写授权码时请同时确认发信邮箱");
    if (
      existsSync(pendingPath) &&
      JSON.parse(readFileSync(pendingPath, "utf8")).credentialsChanged &&
      !body.authCode
    )
      throw new HttpError(
        400,
        "上次修改涉及发信凭证，请重新填写发信邮箱与授权码后重试",
      );
    update("deploying", "检查原服务账户");
    return start(async () => {
      try {
        await prepare();
        const authorized = await accounts();
        if (!authorized.some((a) => a.id === target.accountId))
          throw new Error("原账户未授权");
        // A read-only lookup ensures this worker already exists; never create a draft.
        const keys = parseJson(await command(["secret", "list"]));
        if (!Array.isArray(keys) || !keys.some((k) => k.name === "SYNC_TOKEN"))
          throw new Error("原服务不存在");
        update("deploying", "暂停邮件并确认旧队列已停止");
        await pauseForUpdate();
        await writePrivateJson(pendingPath, {
          url: target.url,
          credentialsChanged: !!body.authCode,
        });
        const secrets = { RECIPIENT_EMAIL: body.recipient };
        if (body.sender) secrets.SMTP_USER = body.sender;
        if (body.authCode) secrets.SMTP_AUTH_CODE = body.authCode;
        update("deploying", "更新原服务邮箱配置");
        await command(["secret", "bulk"], { input: JSON.stringify(secrets) });
        body.authCode = "";
        const current = connection();
        const response = await fetcher(target.url + "/status", {
          headers: { Authorization: `Bearer ${current.token}` },
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error("云端连接校验失败");
        const status = await response.json();
        if (!Array.isArray(status.counts) || !Array.isArray(status.issues))
          throw new Error("云端响应无效");
        await activate({
          url: target.url,
          token: current.token,
          recipient: body.recipient,
        });
        await writePrivateJson(mailPath, {
          url: target.url,
          sender: body.sender || target.sender,
        });
        await unlink(pendingPath);
        update("complete", "邮箱配置已更新，邮件保持关闭。请先发送测试邮件");
      } finally {
        body.authCode = "";
      }
    });
  }
  return {
    snapshot,
    connect,
    deploy,
    edit,
    updatePending: () => existsSync(pendingPath),
    idle: () => operation || Promise.resolve(),
    close: async () => {
      controller?.abort();
      await operation;
    },
  };
}
