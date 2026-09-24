import { randomUUID } from "node:crypto";
import { HttpError, validateBody } from "./domain.mjs";
import {
  actionEnd,
  validEmail,
  planReminders,
  DAY,
} from "../../shared/reminders.mjs";

export function initialReminders() {
  return {
    source: randomUUID(),
    revision: 0,
    syncedRevision: 0,
    enabled: false,
    recipient: "",
    animation: true,
    muted: {},
    actions: {},
    lastSync: null,
    error: "",
    cloud: null,
  };
}
// Called inside the same SQLite transaction as the job/settings write.
export function projectReminders(state, jobs, now) {
  state.revision++;
  const next = {};
  for (const job of jobs) {
    // A mute belongs to the pending action, not to every future action on this job.
    if (!job.action) delete state.muted[job.id];
    if (
      !state.enabled ||
      state.muted[job.id] ||
      job.archived ||
      !job.action ||
      !job.date
    )
      continue;
    if (actionEnd(job.date) < now - 7 * DAY) continue;
    // Text/company edits update future messages without rearming already sent triggers.
    const identity = JSON.stringify([
      job.date,
      job.dateType,
      job.stage,
      job.round,
    ]);
    const previous = state.actions[job.id];
    if (
      (!previous || previous.identity !== identity) &&
      actionEnd(job.date) < now
    )
      continue;
    const schedule =
      previous?.identity === identity
        ? previous
        : {
            identity,
            generation: randomUUID(),
            plans: planReminders(job.date, job.dateType, now),
          };
    next[job.id] = {
      ...schedule,
      id: job.id,
      company: job.company,
      role: job.role,
      action: job.action,
      date: job.date,
      dateType: job.dateType,
    };
  }
  state.actions = next;
  return state;
}
export function updateReminderSettings(state, body, jobs) {
  validateBody(body, [
    "revision",
    "enabled",
    "recipient",
    "animation",
    "jobId",
    "muted",
  ]);
  if (body.revision !== state.revision)
    throw new HttpError(409, "提醒设置已更新，请重新打开设置后重试");
  for (const key of ["enabled", "animation", "muted"])
    if (key in body && typeof body[key] !== "boolean")
      throw new HttpError(400, "开关值无效");
  if ("recipient" in body) {
    if (
      typeof body.recipient !== "string" ||
      (body.recipient && !validEmail(body.recipient))
    )
      throw new HttpError(400, "请输入有效邮箱");
    state.recipient = body.recipient;
  }
  if ("enabled" in body) state.enabled = body.enabled;
  if (state.enabled && !validEmail(state.recipient))
    throw new HttpError(400, "开启邮件前请填写收件邮箱");
  if ("animation" in body) state.animation = body.animation;
  if ("jobId" in body || "muted" in body) {
    if (
      typeof body.jobId !== "string" ||
      !jobs.some((j) => j.id === body.jobId) ||
      typeof body.muted !== "boolean"
    )
      throw new HttpError(400, "请选择有效行动");
    if (body.muted) state.muted[body.jobId] = true;
    else delete state.muted[body.jobId];
  }
  return state;
}
export function cloudPayload(state) {
  return {
    source: state.source,
    revision: state.revision,
    enabled: state.enabled,
    recipient: state.recipient,
    actions: Object.values(state.actions).map(({ identity, ...data }) => data),
  };
}
export function publicReminders(state, configured) {
  const { source, actions, ...publicState } = state;
  return {
    ...publicState,
    configured,
    pending:
      state.revision > state.syncedRevision &&
      (state.enabled || state.syncedRevision > 0),
  };
}
export function createReminderSync(
  store,
  {
    url = process.env.REMINDER_CLOUD_URL,
    token = process.env.REMINDER_SYNC_TOKEN,
    fetcher = fetch,
    clock = () => new Date(),
  } = {},
) {
  let endpoint = null;
  if (url && token && token.length >= 32) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new Error("提醒服务仅支持不含凭证的 HTTPS 地址");
    endpoint = parsed.origin;
  }
  let running = null;
  async function remote(path, body) {
    if (!endpoint)
      throw new HttpError(400, "请先按部署教程配置云端地址和同步密钥");
    const response = await fetcher(endpoint + path, {
      method: body === undefined ? "GET" : "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new HttpError(
        502,
        response.status === 409
          ? "云端版本冲突，请按部署教程检查是否连接了其他本地数据库"
          : "云端请求失败，请检查部署与同步密钥",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("云端响应为空");
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 65536) {
        await reader.cancel();
        throw new Error("云端响应过长");
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async function perform() {
    const state = store.reminders();
    if (!endpoint) return;
    if (
      state.revision > state.syncedRevision &&
      (state.enabled || state.syncedRevision > 0)
    ) {
      const result = await remote("/sync", cloudPayload(state));
      if (result.revision !== state.revision)
        throw new HttpError(502, "云端版本不一致，未确认同步");
      store.reminderSyncResult({
        syncedRevision: state.revision,
        lastSync: clock().toISOString(),
        error: "",
      });
    }
    const cloud = await remote("/status");
    if (
      !cloud ||
      !Array.isArray(cloud.issues) ||
      !Array.isArray(cloud.counts) ||
      cloud.issues.length > 30 ||
      cloud.issues.some(
        (i) =>
          !i ||
          typeof i.id !== "string" ||
          typeof i.job_id !== "string" ||
          typeof i.state !== "string" ||
          typeof i.error !== "string",
      ) ||
      cloud.counts.some(
        (c) =>
          !c || typeof c.state !== "string" || !Number.isSafeInteger(c.count),
      )
    )
      throw new Error("云端状态格式无效");
    store.reminderSyncResult({ cloud, error: "" });
  }
  function sync() {
    if (running) return running;
    running = perform()
      .catch(() =>
        store.reminderSyncResult({
          error: "提醒尚未同步或云端状态不可用，请检查网络与部署配置",
        }),
      )
      .finally(() => {
        running = null;
      });
    return running;
  }
  return {
    configured: !!endpoint,
    sync,
    remote,
    idle: () => running || Promise.resolve(),
  };
}
