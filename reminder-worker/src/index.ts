import { connect } from "cloudflare:sockets";
import { timingSafeEqual } from "node:crypto";
import { sendSmtp } from "./smtp.ts";
import {
  enqueueTest,
  InputError,
  retryTask,
  runScheduler,
  status,
  syncSnapshot,
} from "./scheduler.ts";
import { validEmail } from "../../shared/reminders.mjs";

async function authorized(request: Request, env: Env) {
  if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 32) return false;
  const encoder = new TextEncoder();
  const hash = (v: string) =>
    crypto.subtle.digest("SHA-256", encoder.encode(v));
  const [actual, expected] = await Promise.all([
    hash(request.headers.get("Authorization") || ""),
    hash(`Bearer ${env.SYNC_TOKEN}`),
  ]);
  return timingSafeEqual(new Uint8Array(actual), new Uint8Array(expected));
}
async function body(request: Request): Promise<unknown> {
  if (
    !request.headers.get("Content-Type")?.startsWith("application/json") ||
    !request.body
  )
    throw new InputError("请使用 JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new InputError("同步内容过长", 413);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InputError("JSON 无效");
  }
}
const json = (data: unknown, code = 200) =>
  Response.json(data, {
    status: code,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export default {
  async fetch(request, env) {
    if (!(await authorized(request, env)))
      return json({ error: "未授权" }, 401);
    try {
      const path = new URL(request.url).pathname,
        now = Date.now();
      if (path === "/status" && request.method === "GET")
        return json(await status(env.DB));
      if (request.method !== "POST") return json({ error: "未找到资源" }, 404);
      const data = await body(request);
      if (!validEmail(env.RECIPIENT_EMAIL))
        throw new InputError("请先配置云端收件邮箱", 503);
      if (path === "/sync")
        return json(await syncSnapshot(env.DB, data, env.RECIPIENT_EMAIL, now));
      if (path === "/test") {
        if (
          !data ||
          typeof data !== "object" ||
          !("recipient" in data) ||
          data.recipient !== env.RECIPIENT_EMAIL
        )
          throw new InputError("收件邮箱须与云端配置一致");
        return json(await enqueueTest(env.DB, env.RECIPIENT_EMAIL, now), 202);
      }
      if (path === "/retry") {
        if (
          !data ||
          typeof data !== "object" ||
          !("id" in data) ||
          typeof data.id !== "string" ||
          data.id.length > 200
        )
          throw new InputError("提醒标识无效");
        return json(await retryTask(env.DB, data.id, now));
      }
      return json({ error: "未找到资源" }, 404);
    } catch (error) {
      if (error instanceof InputError)
        return json({ error: error.message }, error.status);
      console.error(JSON.stringify({ event: "request_failed" }));
      return json({ error: "云端处理失败，请检查部署" }, 500);
    }
  },
  async scheduled(_event, env) {
    await runScheduler(
      env.DB,
      (mail) =>
        sendSmtp(
          { ...mail, user: env.SMTP_USER, code: env.SMTP_AUTH_CODE },
          () => {
            const socket = connect(
              { hostname: "smtp.163.com", port: 465 },
              { secureTransport: "on", allowHalfOpen: false },
            );
            // Observe connection errors as well as read/write errors; never log SMTP replies or credentials.
            void socket.opened.catch(() => {});
            void socket.closed.catch(() => {});
            return socket;
          },
        ),
      Date.now(),
    );
  },
} satisfies ExportedHandler<Env>;
