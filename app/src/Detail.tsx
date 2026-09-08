import {
  Job,
  stageName,
  stages,
  jobTone,
  statusLabel,
  decisions,
} from "./types";
import { dateLabel, overdue, stale, waitLabel } from "./time";
import { Icon } from "./Icon";
import { Dialog } from "./Dialog";
interface Props {
  job: Job;
  now: Date;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onProgress: () => void;
  onCommand: (type: string, data?: Record<string, unknown>) => void;
}
export function Detail({
  job: j,
  now,
  busy,
  onClose,
  onEdit,
  onProgress,
  onCommand,
}: Props) {
  const theme = j.stage === "result" ? j.resultType : j.stage,
    offer = j.resultType === "offer",
    waiting = waitLabel(j, now);
  const canFeedback =
    ["assessment", "interview"].includes(j.stage) && j.status !== "待反馈";
  const stageIcon =
    (
      {
        application: "arrow",
        assessment: "edit",
        interview: "calendar",
        offer: "check",
        rejected: "close",
        withdrawn: "arrow",
      } as Record<string, string>
    )[theme] || "check";
  return (
    <Dialog
      label={`${j.company}岗位详情`}
      className="detail-panel is-open"
      onClose={() => !busy && onClose()}
    >
      <section
        className="detail-dialog"
        data-theme={theme}
        aria-label="岗位信息"
      >
        <header className="panel-header">
          <div className="detail-stage-heading">
            <Icon name={stageIcon} size={21} />
            <strong>{stageName(j.stage)}阶段</strong>
            <span className="detail-record-id">{j.id.slice(0, 8)}</span>
          </div>
          <div className="panel-header-actions">
            <button className="button ghost" onClick={onEdit} disabled={busy}>
              <Icon name="edit" />
              编辑
            </button>
            <button
              className="icon-button"
              aria-label="关闭详情"
              onClick={onClose}
              disabled={busy}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </header>
        <div className="panel-body">
          {j.archived && (
            <div className="archived-banner">
              <Icon name="archive" />
              这条记录已归档，可随时恢复。
            </div>
          )}
          <div className="detail-hero">
            <div className="detail-company">
              <span className={`company-avatar tone-${jobTone(j)}`}>
                {j.company.slice(0, 1)}
              </span>
              <span>{j.company}</span>
            </div>
            <h1 className="detail-title">{j.role}</h1>
            <div className="detail-subtitle">
              <Icon name="pin" />
              {j.city || "城市待补充"}
              <span>·</span>
              {j.salary || "薪资待补充"}
            </div>
            <div className="detail-status">
              {stages.map((s) => (
                <span
                  key={s.id}
                  className={`stage-step ${s.id === j.stage ? `current tone-${s.tone}` : ""}`}
                >
                  {s.name}
                </span>
              ))}
            </div>
            <div className="detail-status-row">
              <span className="status-badge">
                <Icon name={stageIcon} size={15} />
                {statusLabel(j)}
              </span>
              {j.round && <span className="round-label">{j.round}</span>}
              {waiting && (
                <span className="detail-waiting">
                  <Icon name="clock" size={13} />
                  {waiting}
                </span>
              )}
              <button
                className="button ghost"
                onClick={onProgress}
                disabled={busy}
              >
                更新进展 <Icon name="arrow" />
              </button>
            </div>
          </div>
          {offer && (
            <section className="offer-highlight">
              <div className="section-heading">
                <h2>收到 Offer</h2>
                <span className="status-badge tone-green">
                  {decisions[j.offerDecision] || "待决定"}
                </span>
              </div>
              <p>
                {j.offerDecision === "accepted"
                  ? "已记录接受决定，祝下一段旅程顺利。"
                  : j.offerDecision === "declined"
                    ? "已记录婉拒决定，继续寻找合适的机会。"
                    : "给自己一点时间，认真选择下一站。"}
              </p>
              {j.offerDecision === "pending" && (
                <>
                  <div className="offer-deadline">
                    <Icon name="clock" />
                    答复期限：{j.date ? dateLabel(j, now) : "未设置"}
                  </div>
                  <div className="offer-actions">
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        onCommand("offer", { decision: "accepted" })
                      }
                    >
                      记录已接受
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        onCommand("offer", { decision: "declined" })
                      }
                    >
                      记录已婉拒
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {j.stage === "result" && !offer && (
            <section className="result-highlight">
              <span className="result-symbol">
                <Icon name={stageIcon} size={23} />
              </span>
              <div>
                <h2>{j.status}</h2>
                <p>
                  {j.resultType === "rejected"
                    ? "本次申请未通过，复盘要点可记录在备注中。"
                    : "已记录主动退出，申请历史保留。"}
                </p>
              </div>
            </section>
          )}
          <section className="detail-section detail-focus">
            <div className="section-heading">
              <h2>
                {!j.action && waiting
                  ? "反馈跟进"
                  : {
                      application: "投递安排",
                      assessment: "测评安排",
                      interview: "面试安排",
                      result: "后续行动",
                    }[j.stage]}
              </h2>
              <button
                className="button ghost"
                onClick={onProgress}
                disabled={busy}
              >
                编辑
              </button>
            </div>
            <div
              className={`action-box ${overdue(j, now) ? "overdue" : stale(j, now) ? "stale" : !j.action && !waiting ? "no-action" : ""}`}
            >
              <div className="action-title">
                <Icon name={overdue(j, now) ? "alert" : "arrow"} />
                <strong>
                  {j.action ||
                    (waiting
                      ? `等待${j.stage === "application" ? "招聘方回复" : stageName(j.stage) + "反馈"}`
                      : "暂无下一步行动")}
                </strong>
              </div>
              <div className="action-time">
                <Icon
                  name={j.dateType === "appointment" ? "calendar" : "clock"}
                />
                {dateLabel(j, now) ||
                  (waiting
                    ? "收到反馈后，可更新进展并保留记录"
                    : "在需要时添加行动与时间")}
              </div>
              {j.action && (
                <div className="detail-action-buttons">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => onCommand("complete-action")}
                  >
                    {canFeedback ? "完成并待反馈" : "完成行动"}
                  </button>
                  <button
                    className="button ghost"
                    disabled={busy}
                    onClick={() => onCommand("cancel-action")}
                  >
                    取消行动
                  </button>
                </div>
              )}
            </div>
          </section>
          <section className="detail-section">
            <h2 className="section-heading">岗位信息</h2>
            <dl className="detail-facts">
              <div>
                <dt>投递日期</dt>
                <dd>{j.appliedAt || "尚未投递"}</dd>
              </div>
              <div>
                <dt>招聘渠道</dt>
                <dd>{j.source || "待补充"}</dd>
              </div>
              <div>
                <dt>岗位链接</dt>
                <dd>
                  {/^https?:\/\//i.test(j.url) ? (
                    <a href={j.url} target="_blank" rel="noreferrer">
                      查看岗位 <Icon name="link" size={13} />
                    </a>
                  ) : (
                    "待补充"
                  )}
                </dd>
              </div>
            </dl>
          </section>
          <section className="detail-section">
            <div className="section-heading">
              <h2>进展时间线</h2>
              <span className="detail-muted">保留每一步</span>
            </div>
            <div className="timeline">
              {j.history.map((h, i) => (
                <div
                  className={`timeline-item ${i === 0 ? "current" : ""}`}
                  key={h.id || `${h.date}-${i}`}
                >
                  <span className="timeline-dot" />
                  <div>
                    <strong>{h.title}</strong>
                    <time>
                      {new Date(h.date).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })}
                    </time>
                    <p>{h.text}</p>
                    {h.action?.text && (
                      <p className="history-context">
                        原行动信息：
                        {h.previousStage ? stageName(h.previousStage) : ""}
                        {h.action.round ? ` · ${h.action.round}` : ""}
                        {h.action.date
                          ? ` · ${h.action.dateType === "appointment" ? "预约时间" : "截止时间"}：${h.action.date.slice(0, 10)} ${h.action.date.length > 10 ? h.action.date.slice(11, 16) : ""}`
                          : ""}
                      </p>
                    )}
                    {h.previousRoundRecord &&
                      (h.previousRoundRecord.notes ||
                        h.previousRoundRecord.result) && (
                        <details className="history-round">
                          <summary>查看当时的轮次记录</summary>
                          <p>
                            {stageName(h.previousRoundRecord.stage)} ·{" "}
                            {h.previousRoundRecord.round}
                          </p>
                          <p>{h.previousRoundRecord.result}</p>
                          <p>{h.previousRoundRecord.notes}</p>
                        </details>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          {j.rounds.length > 0 && (
            <section className="detail-section">
              <h2 className="section-heading">轮次记录</h2>
              {j.rounds.map((r, i) => (
                <div
                  className="round-history"
                  key={`${r.stage}-${r.round}-${i}`}
                >
                  <strong>
                    {stageName(r.stage)} · {r.round}
                  </strong>
                  <p>
                    {r.date
                      ? `${r.date.slice(0, 10)} ${r.date.length > 10 ? r.date.slice(11, 16) : ""}`
                      : "时间未设置"}
                    {r.result ? ` · ${r.result}` : ""}
                  </p>
                  <p>{r.notes || "暂无轮次备注"}</p>
                </div>
              ))}
            </section>
          )}
          <section className="detail-section">
            <h2 className="section-heading">备注</h2>
            <div className="note-box">{j.notes || "暂无备注"}</div>
          </section>
        </div>
        <footer className="panel-footer">
          <button
            className="button ghost"
            disabled={busy || (!j.archived && j.stage !== "result")}
            title={
              !j.archived && j.stage !== "result"
                ? "明确结果后可归档"
                : undefined
            }
            onClick={() => onCommand(j.archived ? "restore" : "archive")}
          >
            <Icon name="archive" />
            {j.archived ? "恢复到看板" : "归档记录"}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            返回看板
          </button>
        </footer>
      </section>
    </Dialog>
  );
}
