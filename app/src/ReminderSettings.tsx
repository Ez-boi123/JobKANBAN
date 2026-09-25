import { useState } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { api } from "./api";
import type { ReminderSettings as Settings, Job } from "./types";
import { ReminderSetup } from "./ReminderSetup";

export function reminderStatus(s: Settings) {
  if (s.pending)
    return s.enabled ? "提醒尚未同步" : "关闭提醒待同步 · 云端可能仍会发信";
  if (s.error) return "云端状态暂不可用";
  if (!s.configured) return "邮件未配置 · 卡片提示可用";
  return s.enabled ? "提醒安排已同步" : "邮件提醒已关闭";
}
export function ReminderSettings({
  state,
  jobs,
  onChange,
  onClose,
}: {
  state: Settings;
  jobs: Job[];
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    enabled: state.enabled,
    recipient: state.recipient,
    animation: state.animation,
    revision: state.revision,
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(!state.configured);
  const [editing, setEditing] = useState(false);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const dirty =
    draft.recipient !== state.recipient ||
    draft.enabled !== state.enabled ||
    draft.animation !== state.animation;
  const labels: Record<string, string> = {
    pending: "待发送",
    accepted: "发信服务已接受",
    unknown: "结果不确定",
    failed: "失败",
    missed: "已错过",
    sending: "发送中",
    cancelled: "已取消",
  };
  return (
    <Dialog
      label="提醒设置"
      className="detail-panel is-open"
      onClose={() => !busy && !setupBusy && onClose()}
    >
      <section className="detail-dialog reminder-dialog">
        <header className="panel-header">
          <strong>提醒设置</strong>
          <button
            className="icon-button"
            aria-label="关闭提醒设置"
            disabled={busy || setupBusy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="panel-body">
          <p className="reminder-state" role="status">
            {reminderStatus(state)}
          </p>
          {state.configurationPending && !showSetup && (
            <p role="alert" className="form-error-banner">
              邮件配置修改尚未完成，请点击“修改邮件配置”继续处理；完成前不能开启或测试邮件。
            </p>
          )}
          {state.configured && !showSetup && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                setShowSetup(true);
                setMessage("");
              }}
            >
              修改邮件配置
            </button>
          )}
          {showSetup && (
            <ReminderSetup
              editing={editing}
              onBusy={setSetupBusy}
              onComplete={(next) => {
                onChange(next);
                setShowSetup(false);
                setSetupBusy(false);
                setDraft({
                  enabled: next.enabled,
                  recipient: next.recipient,
                  animation: next.animation,
                  revision: next.revision,
                });
                setMessage(
                  "配置已保存。请先发送测试邮件，实际收到后再开启邮件提醒。",
                );
              }}
            />
          )}
          {showSetup && editing && (
            <button
              className="button ghost"
              disabled={busy || setupBusy}
              onClick={() =>
                void run(async () => {
                  const next = await api.reminders();
                  onChange(next);
                  setDraft({
                    enabled: next.enabled,
                    recipient: next.recipient,
                    animation: next.animation,
                    revision: next.revision,
                  });
                  setShowSetup(false);
                })
              }
            >
              返回提醒设置
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const next = await api.saveReminders(draft);
                onChange(next);
                setDraft({ ...draft, revision: next.revision });
                setMessage("设置已保存；邮件安排以同步状态为准。");
              });
            }}
          >
            <fieldset
              disabled={busy || setupBusy || (editing && showSetup)}
              className="form-fieldset reminder-fields"
            >
              <label className="reminder-check">
                <input
                  type="checkbox"
                  disabled={!state.configured || state.configurationPending}
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                开启邮件提醒
              </label>
              <label>
                接收邮箱
                <input
                  type="email"
                  readOnly={state.configured}
                  autoComplete="email"
                  maxLength={254}
                  required={draft.enabled}
                  value={draft.recipient}
                  placeholder="你的邮箱@163.com"
                  onChange={(e) =>
                    setDraft({ ...draft, recipient: e.target.value })
                  }
                />
              </label>
              <p className="reminder-help">
                更换收件邮箱请使用“修改邮件配置”，会同时更新云端与本机地址。启用会同步公司、岗位、行动名称和时间，不同步备注、岗位链接或测评通行证。请勿将敏感信息写入行动名称。
              </p>
              <label className="reminder-check">
                <input
                  type="checkbox"
                  checked={draft.animation}
                  onChange={(e) =>
                    setDraft({ ...draft, animation: e.target.checked })
                  }
                />
                特别紧急时显示呼吸光效
              </label>
              <p className="reminder-help">
                关闭邮件不影响卡片提示；系统设置“减少动态效果”时不会播放动画。
              </p>
              <button className="button primary" type="submit">
                保存设置
              </button>
            </fieldset>
          </form>
          <section className="reminder-rules">
            <h3>何时提醒？</h3>
            <ul>
              <li>截止：提前 24 小时、2 小时。</li>
              <li>预约：提前 1 小时、15 分钟。</li>
              <li>
                只有日期：前一天 18:00、当天
                09:00（北京时间），卡片不显示精确倒计时。
              </li>
            </ul>
          </section>
          <div className="reminder-buttons">
            <button
              className="button secondary"
              disabled={
                busy ||
                setupBusy ||
                showSetup ||
                state.configurationPending ||
                !state.configured ||
                dirty ||
                !state.recipient
              }
              onClick={() =>
                void run(async () =>
                  setMessage((await api.testReminder()).message),
                )
              }
            >
              发送测试邮件
            </button>
            <button
              className="button secondary"
              disabled={
                busy || setupBusy || (editing && showSetup) || !state.configured
              }
              onClick={() =>
                void run(async () => {
                  const next = await api.syncReminders();
                  onChange(next);
                  setMessage(reminderStatus(next));
                })
              }
            >
              立即同步
            </button>
          </div>
          {state.lastSync && (
            <p className="reminder-help">
              上次同步：
              {new Date(state.lastSync).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
              （北京时间）
            </p>
          )}
          <p className="reminder-help">
            电脑关机前请确认同步成功。离线完成、取消或改期尚未同步时，云端仍可能按旧安排发信。邮件已被服务接受不代表手机已收到或已读。
          </p>
          {state.cloud && (
            <section className="reminder-rules">
              <h3>最近 30 天的发送状态</h3>
              <p>
                {state.cloud.counts
                  .map((c) => `${labels[c.state] || c.state} ${c.count}`)
                  .join(" · ") || "暂无发送记录"}
              </p>
              {state.cloud.issues.map((issue) => (
                <div className="reminder-issue" key={issue.id}>
                  <span>
                    {issue.job_id === "test"
                      ? "测试邮件"
                      : jobs.find((job) => job.id === issue.job_id)?.company ||
                        "历史行动"}{" "}
                    · {labels[issue.state]} · {issue.error}
                  </span>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "请先检查邮箱。若此前已经送达，手动重试可能收到重复邮件。仍要重试吗？",
                        )
                      )
                        void run(async () => {
                          setMessage(
                            (await api.retryReminder(issue.id)).message,
                          );
                          onChange(await api.syncReminders());
                        });
                    }}
                  >
                    手动重试
                  </button>
                </div>
              ))}
            </section>
          )}
          {message && <p role="status">{message}</p>}
          {error && (
            <p className="form-error-banner" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </Dialog>
  );
}
