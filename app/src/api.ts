import type { Job, ReminderSettings, ReminderSetupState } from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("无法连接本地服务，请确认服务已启动后重试。", 0);
  }
  const data = await response
    .json()
    .catch(() => ({ error: "服务响应异常，请重试。" }));
  if (!response.ok)
    throw new ApiError(data.error || "保存失败，请重试。", response.status);
  return data;
}
export const api = {
  reminderSetup: () => request<ReminderSetupState>("/api/reminders/setup"),
  connectReminderCloud: (reauthorize = false, edit = false) =>
    request<ReminderSetupState>("/api/reminders/setup/connect", "POST", {
      reauthorize,
      edit,
    }),
  deployReminderCloud: (data: {
    accountId: string;
    sender: string;
    recipient: string;
    authCode: string;
  }) =>
    request<ReminderSetupState>("/api/reminders/setup/deploy", "POST", data),
  editReminderCloud: (data: {
    accountId: string;
    sender: string;
    recipient: string;
    authCode: string;
  }) => request<ReminderSetupState>("/api/reminders/setup/edit", "POST", data),
  reminders: () => request<ReminderSettings>("/api/reminders"),
  saveReminders: (data: Record<string, unknown>) =>
    request<ReminderSettings>("/api/reminders", "PATCH", data),
  syncReminders: () =>
    request<ReminderSettings>("/api/reminders/sync", "POST", {}),
  testReminder: () =>
    request<{ message: string }>("/api/reminders/test", "POST", {}),
  retryReminder: (id: string) =>
    request<{ message: string }>("/api/reminders/retry", "POST", { id }),
  list: () => request<Job[]>("/api/jobs"),
  create: (data: unknown) => request<Job>("/api/jobs", "POST", data),
  edit: (job: Job, data: Record<string, unknown>) =>
    request<Job>(`/api/jobs/${job.id}`, "PATCH", {
      ...data,
      version: job.version,
    }),
  command: (job: Job, type: string, data: Record<string, unknown> = {}) =>
    request<Job>(`/api/jobs/${job.id}/commands`, "POST", {
      ...data,
      type,
      version: job.version,
    }),
};
