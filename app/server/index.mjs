import { createServer } from "node:http";
import { resolve, dirname, extname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, realpath } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createJob, editJob, commandJob, HttpError } from "./domain.mjs";
import { openStore } from "./store.mjs";
import {
  createReminderSync,
  publicReminders,
  cloudPayload,
} from "./reminders.mjs";
import { createReminderSetup, writePrivateJson } from "./reminder-setup.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
function validateLocal(req, server) {
  const port = server.address().port;
  const hosts = [
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    ...(port === 80 ? ["localhost", "127.0.0.1"] : []),
  ];
  if (!hosts.includes(req.headers.host?.toLowerCase()))
    throw new HttpError(400, "仅支持本机访问");
  if (
    req.headers.origin &&
    !hosts
      .map((host) => `http://${host}`)
      .includes(req.headers.origin.toLowerCase())
  )
    throw new HttpError(400, "不允许此来源访问");
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new HttpError(400, "不允许跨站访问");
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    throw new HttpError(400, "请使用 JSON 提交");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 65536) throw new HttpError(400, "提交内容过长");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON 格式无效");
  }
}
async function serveStatic(path, req, res, staticDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new HttpError(400, "资源路径无效");
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.split("/").some((part) => part.startsWith(".")) ||
    decoded.includes(":")
  )
    throw new HttpError(404, "未找到资源");
  const filePath = resolve(
    staticDir,
    "." + (decoded === "/" ? "/index.html" : decoded),
  );
  if (!mime[extname(filePath)]) throw new HttpError(404, "未找到资源");
  let actual, actualRoot;
  try {
    [actual, actualRoot] = await Promise.all([
      realpath(filePath),
      realpath(staticDir),
    ]);
  } catch {
    throw new HttpError(404, "未找到资源");
  }
  const within = relative(actualRoot, actual);
  if (within.startsWith("..") || isAbsolute(within))
    throw new HttpError(404, "未找到资源");
  let content;
  try {
    content = await readFile(actual);
  } catch {
    throw new HttpError(404, "未找到资源");
  }
  res.writeHead(200, {
    "Content-Type": mime[extname(filePath)],
    "Content-Length": content.length,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  res.end(req.method === "HEAD" ? undefined : content);
}
export function createApp({
  dbPath = resolve(root, "../data/jobkanban.sqlite"),
  staticDir = resolve(root, "dist"),
  clock = () => new Date(),
  reminderOptions = {},
  setupOptions = {},
} = {}) {
  const store = openStore(dbPath, clock);
  const dataDir = dirname(dbPath);
  const connectionPath = resolve(dataDir, "reminders.connection.json");
  const connection = existsSync(connectionPath)
    ? JSON.parse(readFileSync(connectionPath, "utf8"))
    : {};
  let activeConnection = {
    url: process.env.REMINDER_CLOUD_URL || connection.url,
    token: process.env.REMINDER_SYNC_TOKEN || connection.token,
    ...reminderOptions,
  };
  let reminders = createReminderSync(store, { clock, ...activeConnection });
  let activating = false;
  const setup = createReminderSetup({
    root,
    dataDir,
    store,
    configured: () => reminders.configured,
    connection: () => activeConnection,
    pauseForUpdate: async () => {
      await reminders.idle();
      store.reminderSettings({
        revision: store.reminders().revision,
        enabled: false,
      });
      // Confirm a disabled snapshot even when mail has never been enabled.
      const paused = store.reminders();
      const acknowledgement = await reminders.remote(
        "/sync",
        cloudPayload(paused),
      );
      if (acknowledgement.revision !== paused.revision)
        throw new Error("停用版本未确认");
      store.reminderSyncResult({
        syncedRevision: paused.revision,
        lastSync: clock().toISOString(),
        error: "",
      });
      await reminders.sync();
      const state = store.reminders();
      if (state.error || state.revision !== state.syncedRevision)
        throw new Error("旧队列停用尚未确认");
      if (
        state.cloud?.counts.some(
          (c) => ["pending", "sending"].includes(c.state) && c.count > 0,
        )
      )
        throw new Error("仍有测试邮件或在途邮件，请稍后重试");
    },
    activate: async ({ url, token, recipient }) => {
      activating = true;
      try {
        await reminders.idle();
        await writePrivateJson(connectionPath, { url, token });
        store.reminderSettings({
          revision: store.reminders().revision,
          recipient,
          enabled: false,
        });
        reminders = createReminderSync(store, {
          clock,
          ...reminderOptions,
          url,
          token,
        });
        activeConnection = { ...activeConnection, url, token };
      } finally {
        activating = false;
      }
    },
    ...setupOptions,
  });
  const reminderState = () => ({
    ...publicReminders(store.reminders(), reminders.configured),
    configurationPending: setup.updatePending(),
  });
  const timer = setInterval(() => {
    if (!activating) void reminders.sync();
  }, 30000);
  timer.unref();
  void reminders.sync();
  const server = createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    try {
      validateLocal(req, server);
      const path = req.url.split("?")[0];
      if (path === "/api/health" && req.method === "GET")
        return send(200, { name: "JobKANBAN", status: "ok" });
      if (path === "/api/jobs" && req.method === "GET")
        return send(200, store.list());
      if (path === "/api/reminders" && req.method === "GET")
        return send(200, reminderState());
      if (path === "/api/reminders/setup" && req.method === "GET")
        return send(200, setup.snapshot());
      if (path === "/api/reminders/setup/connect" && req.method === "POST")
        return send(202, setup.connect(await readBody(req)));
      if (path === "/api/reminders/setup/deploy" && req.method === "POST")
        return send(202, setup.deploy(await readBody(req)));
      if (path === "/api/reminders/setup/edit" && req.method === "POST")
        return send(202, setup.edit(await readBody(req)));
      if (path === "/api/reminders" && req.method === "PATCH") {
        if (setup.snapshot().busy)
          throw new HttpError(409, "配置向导正在运行，请完成后再保存提醒设置");
        const body = await readBody(req);
        if (body?.enabled && setup.updatePending())
          throw new HttpError(
            409,
            "邮箱修改尚未完成，请在修改邮件配置中重试后再开启提醒",
          );
        store.reminderSettings(body);
        void reminders.sync();
        return send(200, reminderState());
      }
      if (path === "/api/reminders/sync" && req.method === "POST") {
        await readBody(req);
        await reminders.sync();
        return send(200, reminderState());
      }
      if (path === "/api/reminders/test" && req.method === "POST") {
        if (setup.snapshot().busy || setup.updatePending())
          throw new HttpError(409, "请先完成邮件配置修改");
        await readBody(req);
        const state = store.reminders();
        return send(
          202,
          await reminders.remote("/test", { recipient: state.recipient }),
        );
      }
      if (path === "/api/reminders/retry" && req.method === "POST") {
        if (setup.snapshot().busy || setup.updatePending())
          throw new HttpError(409, "请先完成邮件配置修改");
        const body = await readBody(req);
        if (typeof body?.id !== "string" || body.id.length > 200)
          throw new HttpError(400, "提醒标识无效");
        return send(200, await reminders.remote("/retry", { id: body.id }));
      }
      if (path === "/api/jobs" && req.method === "POST") {
        const job = store.save(
          createJob(await readBody(req), clock().toISOString()),
        );
        void reminders.sync();
        return send(201, job);
      }
      const match = path.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)(\/commands)?$/);
      if (
        match &&
        ((req.method === "PATCH" && !match[2]) ||
          (req.method === "POST" && match[2]))
      ) {
        const body = await readBody(req);
        const job = store.mutate(match[1], body?.version, (old) =>
          (match[2] ? commandJob : editJob)(old, body, clock().toISOString()),
        );
        void reminders.sync();
        return send(200, job);
      }
      if (!path.startsWith("/api/") && ["GET", "HEAD"].includes(req.method))
        return await serveStatic(path, req, res, staticDir);
      send(404, { error: "未找到资源" });
    } catch (error) {
      send(error.status || 500, {
        error: error.status ? error.message : "保存或读取失败，请稍后重试",
      });
    }
  });
  return {
    server,
    close: async () => {
      clearInterval(timer);
      await setup.close();
      await new Promise((resolve, reject) =>
        server.close((error) =>
          error && error.code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolve(),
        ),
      );
      await reminders.idle();
      store.close();
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const reminderEnv = resolve(root, "../data/reminders.env");
  if (existsSync(reminderEnv)) process.loadEnvFile(reminderEnv);
  const app = createApp();
  app.server.listen(3000, "127.0.0.1", () =>
    console.log("JobKANBAN: http://127.0.0.1:3000"),
  );
}
