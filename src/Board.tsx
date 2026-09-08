import { useMemo, useState } from "react";
import { Job, Stage, stages, statusLabel, jobTone } from "./types";
import {
  chinaDay,
  day,
  dateLabel,
  overdue,
  waitLabel,
  weekBounds,
  stale,
} from "./time";
import { Icon } from "./Icon";
interface Props {
  jobs: Job[];
  archived: boolean;
  now: Date;
  onOpen: (j: Job) => void;
  onNew: () => void;
  onArchiveView: (v: boolean) => void;
  onProgress: (j: Job, stage: Stage) => void;
}
export function Board({
  jobs,
  archived,
  now,
  onOpen,
  onNew,
  onArchiveView,
  onProgress,
}: Props) {
  const [query, setQuery] = useState(""),
    [city, setCity] = useState(""),
    [status, setStatus] = useState(""),
    [date, setDate] = useState(""),
    [sort, setSort] = useState("date");
  const [start, end] = weekBounds(now),
    today = chinaDay(now);
  const dateMatch = (j: Job, value: string) =>
    !value ||
    (!!j.action &&
      (value === "today"
        ? day(j.date) === today
        : value === "week"
          ? day(j.date) >= start && day(j.date) <= end
          : value === "overdue"
            ? overdue(j, now)
            : !j.date));
  const active = jobs.filter((j) => !j.archived);
  const cities = useMemo(
    () => [...new Set(jobs.map((j) => j.city).filter(Boolean))].sort(),
    [jobs],
  );
  const rows = jobs
    .filter(
      (j) =>
        j.archived === archived &&
        (!query ||
          `${j.company} ${j.role}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())) &&
        (!city || j.city === city) &&
        (!status || statusLabel(j).includes(status)) &&
        dateMatch(j, date),
    )
    .sort((a, b) =>
      sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : (a.date || "9999").localeCompare(b.date || "9999") ||
          b.updatedAt.localeCompare(a.updatedAt),
    );
  const clear = () => {
    setQuery("");
    setCity("");
    setStatus("");
    setDate("");
  };
  const hasFilter = !!(query || city || status || date);
  return (
    <>
      <section className="page-heading">
        <div className="heading-copy">
          <span className="theme-eyebrow">
            <span />
            NEXT STOP · 下一站
          </span>
          <div className="heading-title-row">
            <h1>{archived ? "已归档记录" : "求职进度"}</h1>
            <span className="board-label">我的看板</span>
          </div>
          <p>让每一个机会，都有清晰的下一步。</p>
        </div>
        <div className="theme-route-art" aria-hidden="true">
          <svg viewBox="0 0 290 104">
            <path
              d="M15 74H78C110 74 102 30 137 30H262"
              fill="none"
              stroke="#b8c1d0"
              strokeWidth="1.5"
              strokeDasharray="3 5"
            />
            <path
              d="M15 74H78C94 74 98 62 102 50"
              fill="none"
              stroke="#3468e8"
              strokeWidth="3"
            />
            <circle cx="15" cy="74" r="5" fill="#3468e8" />
            <circle
              cx="105"
              cy="45"
              r="8"
              fill="#f8f9fc"
              stroke="#dca653"
              strokeWidth="3"
            />
            <circle cx="164" cy="30" r="5" fill="#9270c5" />
            <circle cx="237" cy="30" r="5" fill="#418a6d" />
            <path d="m260 22 15 8-15 8 4-8Z" fill="#243752" />
            <text x="4" y="98" fill="#7c889b" fontSize="10">
              START
            </text>
            <text x="207" y="62" fill="#63708a" fontSize="10">
              NEXT STOP
            </text>
          </svg>
        </div>
        <button className="button primary" onClick={onNew}>
          <Icon name="plus" />
          新建求职记录
        </button>
      </section>
      <section className="date-summary" aria-label="行动提醒">
        <div className="summary-intro">
          <Icon name="calendar" />
          <strong>行程概览</strong>
        </div>
        {[
          ["today", "今天"],
          ["week", "本周"],
          ["overdue", "逾期"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`summary-item ${key === "overdue" ? "overdue-summary" : ""}`}
            onClick={() => {
              onArchiveView(false);
              setDate(key);
            }}
          >
            <span className="summary-label">{label}</span>
            <strong>{active.filter((j) => dateMatch(j, key)).length}</strong>
            <span className="summary-unit">
              {key === "overdue" ? "项截止事项" : "项行动"}
            </span>
            <Icon name="arrow" />
          </button>
        ))}
        <span className="summary-hint">一步一步，走向下一站</span>
      </section>
      <section className="board-toolbar" aria-label="看板工具">
        <div className="view-tabs">
          <button
            className="view-tab active"
            onClick={() => onArchiveView(false)}
          >
            <Icon name="board" />
            看板视图
          </button>
          <span className="record-total">
            {rows.length} 条{archived ? "归档" : "求职"}记录
          </span>
        </div>
        <div className="filter-row">
          <label className="search-control">
            <Icon name="search" />
            <input
              type="search"
              aria-label="搜索公司或岗位"
              placeholder="搜索公司或岗位"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="select-control">
            <select
              aria-label="按城市筛选"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">全部城市</option>
              {city && !cities.includes(city) && <option>{city}</option>}
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="select-control">
            <select
              aria-label="按状态筛选"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">全部状态</option>
              {[
                "待投递",
                "已投递",
                "待安排",
                "待完成",
                "待反馈",
                "待决定",
                "已接受",
                "已婉拒",
                "未通过",
                "主动退出",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="select-control">
            <select
              aria-label="按行动日期筛选"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            >
              <option value="">全部日期</option>
              <option value="today">今天</option>
              <option value="week">本周</option>
              <option value="overdue">逾期</option>
              <option value="undated">无日期行动</option>
            </select>
          </label>
          <div className="toolbar-spacer" />
          <label className="archive-toggle">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => onArchiveView(e.target.checked)}
            />
            <span className="toggle-track" />
            <span>已归档</span>
          </label>
          <label className="select-control sort-control">
            <select
              aria-label="列内排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="date">下次行动时间</option>
              <option value="updated">最近更新</option>
            </select>
          </label>
        </div>
        {hasFilter && (
          <div className="active-filters">
            <span>当前筛选</span>
            {[
              query,
              city,
              status,
              date &&
                {
                  today: "今天",
                  week: "本周",
                  overdue: "逾期",
                  undated: "无日期行动",
                }[date],
            ]
              .filter(Boolean)
              .map((s, i) => (
                <span className="filter-chip" key={i}>
                  {s}
                </span>
              ))}
            <button className="button ghost" onClick={clear}>
              清除筛选
            </button>
          </div>
        )}
      </section>
      {archived && (
        <div className="archived-banner">
          已归档记录仍保留原有结果和历史，打开详情即可恢复。
        </div>
      )}
      <section className="columns" aria-label="求职阶段看板">
        {stages.map((stage, index) => (
          <section
            key={stage.id}
            className="kanban-column"
            data-stage={stage.id}
            aria-label={stage.name}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const job = jobs.find(
                (j) => j.id === e.dataTransfer.getData("text/plain"),
              );
              if (job && job.stage !== stage.id) onProgress(job, stage.id);
            }}
          >
            <header className="column-header">
              <span className="station-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="column-title">
                <span className={`stage-dot tone-${stage.tone}`} />
                <h2>{stage.name}</h2>
                <span className="column-count">
                  {rows.filter((j) => j.stage === stage.id).length}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label={`新建${stage.name}记录`}
                onClick={onNew}
              >
                <Icon name="plus" />
              </button>
            </header>
            <div className="column-cards">
              {rows
                .filter((j) => j.stage === stage.id)
                .map((j) => (
                  <article
                    key={j.id}
                    className={`job-card ${overdue(j, now) ? "has-overdue" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${j.company} ${j.role}`}
                    onClick={() => onOpen(j)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpen(j);
                      }
                    }}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", j.id)
                    }
                  >
                    <div className="company-row">
                      <div className={`company-avatar tone-${jobTone(j)}`}>
                        {j.company.slice(0, 1)}
                      </div>
                      <span className="company-name">{j.company}</span>
                      <span className="card-more">···</span>
                    </div>
                    <h3 className="job-title">{j.role}</h3>
                    <div className="card-meta">
                      <Icon name="pin" size={13} />
                      <span>{j.city || "城市待补充"}</span>
                      <span>·</span>
                      <span>{j.id.slice(0, 8)}</span>
                    </div>
                    <div className="card-status-row">
                      <span className={`status-badge tone-${jobTone(j)}`}>
                        {statusLabel(j)}
                      </span>
                      {j.round && (
                        <span className="round-label">{j.round}</span>
                      )}
                    </div>
                    <div
                      className={`next-action ${overdue(j, now) ? "is-overdue" : stale(j, now) ? "is-stale" : ""}`}
                    >
                      <span className="ticket-notch ticket-notch-left" />
                      <span className="ticket-notch ticket-notch-right" />
                      <div
                        className={`action-title ${!j.action ? "is-muted" : ""}`}
                      >
                        <Icon name={j.action ? "arrow" : "clock"} size={14} />
                        <span>
                          {j.action ||
                            waitLabel(j, now) ||
                            (j.stage === "result"
                              ? "本次申请已记录结果"
                              : "添加下一步行动")}
                        </span>
                      </div>
                      {j.action && (
                        <div className="action-time">
                          <Icon
                            name={
                              j.dateType === "appointment"
                                ? "calendar"
                                : "clock"
                            }
                            size={13}
                          />
                          {dateLabel(j, now)}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              {!rows.some((j) => j.stage === stage.id) && (
                <div className="column-empty">暂无记录</div>
              )}
              <button className="column-add-row" onClick={onNew}>
                <Icon name="plus" />
                添加记录
              </button>
            </div>
          </section>
        ))}
        {!rows.length && (
          <div className="empty-state board-empty-message">
            <div className="empty-icon">
              <Icon name={hasFilter ? "search" : "board"} size={32} />
            </div>
            <h2>
              {hasFilter
                ? "没有找到匹配的岗位"
                : archived
                  ? "还没有归档的记录"
                  : "你的下一站，从这里开始"}
            </h2>
            <p>
              {hasFilter
                ? "试试其他关键词，或清除筛选条件。"
                : "添加第一个感兴趣的岗位，让每一步进展都有迹可循。"}
            </p>
            <button
              className="button primary"
              onClick={hasFilter ? clear : onNew}
            >
              {hasFilter ? "清除筛选" : "添加第一条记录"}
            </button>
          </div>
        )}
      </section>
      <footer className="board-footer">
        <span>拖动卡片切换阶段，确认后更新进展</span>
        <span>本地个人版 · 数据保存在本机</span>
      </footer>
    </>
  );
}
