import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { Job, Stage, type ReminderSettings as ReminderState } from "./types";
import { Board } from "./Board";
import { Detail } from "./Detail";
import { RecordForm } from "./RecordForm";
import { Icon } from "./Icon";
import { ReminderSettings, reminderStatus } from "./ReminderSettings";
interface FormState {
  mode: "record" | "progress";
  job?: Job;
  target?: Stage;
}
export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState<FormState | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [now, setNow] = useState(new Date());
  const commandLock = useRef(false);
  const [reminders, setReminders] = useState<ReminderState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const refreshReminders = () =>
    api
      .reminders()
      .then(setReminders)
      .catch(() => {});
  const reload = async () => {
    setError("");
    try {
      setJobs(await api.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
      throw e;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload().catch(() => {});
    void refreshReminders();
    const refresh = () => {
      setNow(new Date());
      void refreshReminders();
    };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  const job = jobs.find((j) => j.id === selected);
  function saved(j: Job) {
    void refreshReminders();
    setJobs((rows) =>
      rows.some((row) => row.id === j.id)
        ? rows.map((row) => (row.id === j.id ? j : row))
        : [j, ...rows],
    );
    setError("");
    setToast("已保存到本机");
  }
  async function command(type: string, data: Record<string, unknown> = {}) {
    if (!job || commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    try {
      const next = await api.command(job, type, data);
      saved(next);
      if (type === "archive" || type === "restore") setSelected(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "记录已在另一页面更新，请重新读取后再操作。"
          : e instanceof Error
            ? e.message
            : "保存失败，请重试。",
      );
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  async function saveForm(data: Record<string, unknown>) {
    if (!form) return;
    const next =
      form.mode === "progress"
        ? await api.command(form.job!, "progress", data)
        : form.job
          ? await api.edit(form.job, data)
          : await api.create(data);
    saved(next);
    setForm(null);
  }
  const changeView = (value: boolean) => {
    setArchived(value);
    setSelected(null);
  };
  return (
    <>
      <aside className="sidebar" aria-label="主导航">
        <a className="brand" href="#board" onClick={() => changeView(false)}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-wordmark">
            <span>
              Job<span className="brand-light">KANBAN</span>
            </span>
            <small>下一站 · 新的可能</small>
          </span>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">我</span>
          <div>
            <strong>我的求职空间</strong>
            <span>本地个人版</span>
          </div>
        </div>
        <div className="nav-section-label">工作空间</div>
        <nav className="primary-nav">
          <button
            className="nav-item reminder-nav"
            onClick={() => {
              void api
                .reminders()
                .then((s) => {
                  setReminders(s);
                  setSettingsOpen(true);
                })
                .catch((e: Error) => setError(e.message));
            }}
          >
            <Icon name="clock" />
            <span>提醒设置</span>
          </button>
          <a
            href="#board"
            className={`nav-item ${!archived ? "is-active" : ""}`}
            onClick={() => changeView(false)}
          >
            <Icon name="board" />
            <span>求职看板</span>
            {!archived && <span className="nav-dot" />}
          </a>
          <a
            href="#archived"
            className={`nav-item ${archived ? "is-active" : ""}`}
            onClick={() => changeView(true)}
          >
            <Icon name="archive" />
            <span>已归档</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <div className="journey-pass">
            <span className="pass-notch pass-notch-left" />
            <span className="pass-notch pass-notch-right" />
            <span className="pass-eyebrow">写给下一站的你</span>
            <svg className="pass-route" viewBox="0 0 142 56" aria-hidden="true">
              <path
                d="M6 40H43C65 40 60 14 83 14H126"
                fill="none"
                stroke="#b1c3e2"
                strokeWidth="1.5"
                strokeDasharray="4 5"
              />
              <circle cx="6" cy="40" r="4" fill="#3468e8" />
              <circle cx="83" cy="14" r="4" fill="#8aa8e8" />
              <path d="m124 7 12 7-12 7 3-7Z" fill="#3468e8" />
            </svg>
            <strong>
              每一步，
              <br />
              都在靠近。
            </strong>
            <span className="pass-bottom">保持节奏，好机会在前方。</span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="user-avatar">我</span>
          <div>
            <strong>我的空间</strong>
            <span>个人求职看板</span>
          </div>
          <span className="online-indicator" />
        </div>
      </aside>
      <div className="app-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>我的空间</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{archived ? "已归档" : "求职看板"}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-mode">
              <span />
              本地个人版
            </span>
            <span className="topbar-divider" />
            <span className="today-label">
              {now.toLocaleDateString("zh-CN", {
                timeZone: "Asia/Shanghai",
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
          </div>
        </header>
        <main
          className="main-content"
          data-reminder-motion={reminders?.animation === false ? "off" : "on"}
        >
          {reminders && (reminders.pending || reminders.error) && (
            <button
              className="reminder-sync-banner"
              onClick={() => setSettingsOpen(true)}
            >
              {reminderStatus(reminders)} · 查看设置
            </button>
          )}
          {loading ? (
            <div className="loading-state" role="status">
              正在读取求职记录…
            </div>
          ) : (
            <Board
              jobs={jobs}
              archived={archived}
              now={now}
              onOpen={(j) => setSelected(j.id)}
              onNew={(target) => setForm({ mode: "record", target })}
              onArchiveView={changeView}
              onProgress={(j, stage) =>
                setForm({ mode: "progress", job: j, target: stage })
              }
            />
          )}
        </main>
      </div>
      {job && (
        <Detail
          job={job}
          now={now}
          busy={busy}
          onClose={() => setSelected(null)}
          onEdit={() => setForm({ mode: "record", job })}
          onProgress={() => setForm({ mode: "progress", job })}
          onCommand={(type, data) => void command(type, data)}
          reminderMuted={!!reminders?.muted[job.id]}
          onReminderToggle={
            reminders
              ? () => {
                  void api
                    .saveReminders({
                      revision: reminders.revision,
                      jobId: job.id,
                      muted: !reminders.muted[job.id],
                    })
                    .then(setReminders)
                    .catch((e: Error) => {
                      setError(e.message);
                      void refreshReminders();
                    });
                }
              : undefined
          }
        />
      )}
      {settingsOpen && reminders && (
        <ReminderSettings
          state={reminders}
          jobs={jobs}
          onChange={setReminders}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {form && (
        <RecordForm
          job={form.job}
          target={form.target}
          mode={form.mode}
          onClose={() => setForm(null)}
          onSave={saveForm}
          onReload={async () => {
            await reload();
            setForm(null);
          }}
        />
      )}
      {error && (
        <div className="connection-error" role="alert">
          <span>{error}</span>
          <button
            className="button secondary"
            onClick={() => void reload().catch(() => {})}
          >
            重新读取
          </button>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="关闭错误提示"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast show" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
