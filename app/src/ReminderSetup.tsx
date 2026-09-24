import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ReminderSetupState, ReminderSettings } from "./types";

export function ReminderSetup({
  onComplete,
  onBusy,
}: {
  onComplete: (state: ReminderSettings) => void;
  onBusy: (busy: boolean) => void;
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
        setForm((current) => ({
          ...current,
          accountId:
            current.accountId ||
            (next.accounts.length === 1 ? next.accounts[0].id : ""),
        }));
        if (next.configured && !next.busy && !completed.current) {
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
  }, []);
  const locked = sending || !!state?.busy;
  async function connect(reauthorize: boolean) {
    setSending(true);
    setError("");
    try {
      const next = await api.connectReminderCloud(reauthorize);
      setState(next);
      onBusy(next.busy);
      setForm((current) => ({ ...current, accountId: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="reminder-setup" aria-label="邮件提醒配置向导">
      <h3>配置邮件提醒</h3>
      <p className="reminder-help">
        连接自己的 Cloudflare
        账户，自动部署独立提醒服务。无需域名，首次使用会下载部署工具。
      </p>
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
            disabled={!state || locked || state.configured}
            onClick={() => void connect(false)}
          >
            连接 Cloudflare
          </button>
          {!!state?.accounts.length && (
            <button
              type="button"
              className="button ghost"
              disabled={locked || state.configured}
              onClick={() => void connect(true)}
            >
              重新授权 / 换账号
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
          setForm((current) => ({ ...current, authCode: "" }));
          void api
            .deployReminderCloud(payload)
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
          disabled={!state?.accounts.length || locked || state?.configured}
        >
          <h4>
            <span>2</span>填写邮箱并部署
          </h4>
          <label>
            Cloudflare 账户
            <select
              aria-label="Cloudflare 账户"
              className="form-control"
              required
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
              required
              autoComplete="off"
              maxLength={254}
              placeholder="your-name@163.com"
              value={form.sender}
              onChange={(e) => setForm({ ...form, sender: e.target.value })}
            />
          </label>
          <label>
            邮箱客户端授权码
            <input
              className="form-control"
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              maxLength={256}
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
            点击后会在所选账户创建 Worker、数据库和每分钟定时任务，费用按你的
            Cloudflare 套餐计算。不会自动开启岗位邮件提醒。
          </p>
          <button type="submit" className="button primary">
            {state?.phase === "error" ? "重试配置" : "部署并保存配置"}
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
        配置过程中请保持本地服务运行。若部署失败，重新输入授权码后可重试；会复用此次配置已创建的资源。
      </p>
    </section>
  );
}
