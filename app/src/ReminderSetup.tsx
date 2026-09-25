import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ReminderSetupState, ReminderSettings } from "./types";

export function ReminderSetup({
  onComplete,
  onBusy,
  editing = false,
}: {
  onComplete: (state: ReminderSettings) => void;
  onBusy: (busy: boolean) => void;
  editing?: boolean;
}) {
  const [state, setState] = useState<ReminderSetupState | null>(null);
  const [form, setForm] = useState({
    accountId: "",
    sender: "",
    recipient: "",
    authCode: "",
  });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const busy = useRef(onBusy);
  busy.current = onBusy;
  const completed = useRef(false);
  const submitted = useRef(false);
  const hydrated = useRef(false);
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.reminderSetup();
        if (stopped.current) return;
        setState(next);
        busy.current(next.busy);
        if (editing && next.current && !hydrated.current) {
          hydrated.current = true;
          setForm((current) => ({
            ...current,
            accountId: next.current!.accountId,
            sender: next.current!.sender,
            recipient: next.current!.recipient,
          }));
        }
        setForm((current) => ({
          ...current,
          accountId:
            current.accountId ||
            (next.accounts.length === 1 ? next.accounts[0].id : ""),
        }));
        if (
          next.configured &&
          !next.busy &&
          !completed.current &&
          (!editing ||
            (submitted.current &&
              next.phase === "complete" &&
              next.mode === "edit"))
        ) {
          const settings = await api.reminders();
          if (stopped.current) return;
          completed.current = true;
          complete.current(settings);
        }
      } catch (e) {
        if (!stopped.current)
          setError(e instanceof Error ? e.message : "读取配置进度失败");
      }
      if (!stopped.current) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [editing]);
  const locked = sending || !!state?.busy;
  async function connect(reauthorize: boolean) {
    setSending(true);
    setError("");
    try {
      const next = await api.connectReminderCloud(reauthorize, editing);
      setState(next);
      onBusy(next.busy);
      if (!editing) setForm((current) => ({ ...current, accountId: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="reminder-setup" aria-label="邮件提醒配置向导">
      <h3>{editing ? "修改邮件配置" : "配置邮件提醒"}</h3>
      <p className="reminder-help">
        {editing
          ? "更新现有服务，不创建新 Worker、不更换同步密钥。保存时先暂停邮件并撤销待发安排；成功后请测试并重新开启提醒。已进入发送流程的邮件无法保证撤回。"
          : "连接自己的 Cloudflare 账户，自动部署独立提醒服务。无需域名，首次使用会下载部署工具。"}
      </p>
      {editing && state?.current && (
        <p className="reminder-help">
          当前服务：{state.current.name}
          <br />
          所属账户：{state.current.accountId}
          <br />
          {state.current.url}
        </p>
      )}
      {editing && state?.editError && (
        <p role="alert" className="form-error-banner">
          {state.editError}
        </p>
      )}
      {editing && state?.updatePending && (
        <p role="alert" className="form-error-banner">
          上次修改尚未完成，邮件保持暂停。请重新填写并提交，完成后才能开启提醒。
        </p>
      )}
      <div className="setup-step">
        <h4>
          <span>1</span>连接 Cloudflare
        </h4>
        <p className="reminder-help">
          授权时请使用这台电脑的浏览器。授权完成后回到这里选择账户。
        </p>
        <div className="reminder-buttons">
          <button
            type="button"
            className="button secondary"
            disabled={
              !state || locked || (editing ? !state.current : state.configured)
            }
            onClick={() => void connect(false)}
          >
            连接 Cloudflare
          </button>
          {!!state?.accounts.length && (
            <button
              type="button"
              className="button ghost"
              disabled={locked || (!editing && state.configured)}
              onClick={() => void connect(true)}
            >
              {editing ? "重新授权原账户" : "重新授权 / 换账号"}
            </button>
          )}
          {state?.authUrl && (
            <a
              className="button primary"
              href={state.authUrl}
              target="_blank"
              rel="noreferrer"
            >
              打开 Cloudflare 授权页
            </a>
          )}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (locked) return;
          setSending(true);
          setError("");
          const payload = { ...form };
          submitted.current = true;
          setForm((current) => ({ ...current, authCode: "" }));
          void (
            editing
              ? api.editReminderCloud(payload)
              : api.deployReminderCloud(payload)
          )
            .then((next) => {
              setState(next);
              onBusy(next.busy);
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => {
              payload.authCode = "";
              setSending(false);
            });
        }}
      >
        <fieldset
          className="form-fieldset setup-step reminder-fields"
          disabled={
            !state?.accounts.length ||
            locked ||
            (!editing && state?.configured) ||
            (editing &&
              (state?.mode !== "edit" ||
                !state?.accounts.some(
                  (a) => a.id === state.current?.accountId,
                )))
          }
        >
          <h4>
            <span>2</span>
            {editing ? "修改邮箱并保存" : "填写邮箱并部署"}
          </h4>
          <label>
            Cloudflare 账户
            <select
              aria-label="Cloudflare 账户"
              className="form-control"
              required
              disabled={editing}
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            >
              <option value="">请选择部署账户</option>
              {state?.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.id.slice(-6)}
                </option>
              ))}
            </select>
          </label>
          <label>
            163 发信邮箱
            <input
              className="form-control"
              type="email"
              required={!editing}
              autoComplete="off"
              maxLength={254}
              placeholder={
                editing ? "留空保留现有发信邮箱" : "your-name@163.com"
              }
              value={form.sender}
              onChange={(e) => setForm({ ...form, sender: e.target.value })}
            />
          </label>
          <label>
            邮箱客户端授权码
            <input
              className="form-control"
              type="password"
              required={!editing}
              autoComplete="new-password"
              minLength={6}
              maxLength={256}
              placeholder={
                editing ? "留空保留原授权码；更换发信邮箱时必填" : ""
              }
              value={form.authCode}
              onChange={(e) => setForm({ ...form, authCode: e.target.value })}
            />
          </label>
          <p className="reminder-help">
            在{" "}
            <a href="https://mail.163.com/" target="_blank" rel="noreferrer">
              163 网页邮箱
            </a>
            的“设置 → POP/SMTP/IMAP”开启 SMTP
            并获取授权码。它不是登录密码。授权码只用于上传到你的云端密钥存储，提交后输入框会清空。
          </p>
          <label>
            提醒收件邮箱
            <input
              className="form-control"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              placeholder="可与发信邮箱相同"
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
            />
          </label>
          <p className="reminder-help">
            {editing
              ? "仅更换收件邮箱时，可保留发信邮箱和授权码。原授权码不会回显。此入口不迁移 Cloudflare 账户或服务地址。"
              : "点击后会在所选账户创建 Worker、数据库和每分钟定时任务，费用按你的 Cloudflare 套餐计算。不会自动开启岗位邮件提醒。"}
          </p>
          <button type="submit" className="button primary">
            {state?.phase === "error"
              ? "重试配置"
              : editing
                ? "保存邮件配置"
                : "部署并保存配置"}
          </button>
        </fieldset>
      </form>
      {state?.step && (
        <p className="setup-progress" role="status" aria-live="polite">
          {locked && <span className="setup-spinner" aria-hidden="true" />}
          {state.step}
        </p>
      )}
      {(error || state?.error) && (
        <p className="form-error-banner" role="alert">
          {error || state?.error}
        </p>
      )}
      <p className="reminder-help">
        {editing
          ? "修改过程中请保持本地服务运行。失败后可继续在此处重试，不会新建服务。"
          : "配置过程中请保持本地服务运行。若部署失败，重新输入授权码后可重试；会复用此次配置已创建的资源。"}
      </p>
    </section>
  );
}
