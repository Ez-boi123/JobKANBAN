import { useState, useRef } from "react";
import { Job, Stage, stages, stageName } from "./types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { ApiError } from "./api";
import { FormSelect } from "./FormSelect";
import { DateTimeInput } from "./DateTimeInput";
interface Props {
  job?: Job;
  target?: Stage;
  mode: "record" | "progress";
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
}
export function RecordForm({
  job,
  mode,
  target,
  onClose,
  onSave,
  onReload,
}: Props) {
  const initialStage = target || job?.stage || "application";
  const createTitle = target ? `添加${stageName(target)}记录` : "添加求职记录";
  const creating = mode === "record" && !job;
  const stageIcon = {
    application: "arrow",
    assessment: "edit",
    interview: "calendar",
    result: "check",
  }[initialStage];
  const actionHeading = {
    application: "投递安排",
    assessment: "测评安排",
    interview: "面试安排",
    result: "后续行动",
  }[initialStage];
  const [data, setData] = useState<Record<string, string>>(() => ({
    company: job?.company || "",
    role: job?.role || "",
    city: job?.city || "",
    salary: job?.salary || "",
    source: job?.source || "",
    url: job?.url || "",
    appliedAt: job?.appliedAt || "",
    notes: job?.notes || "",
    action: job?.action || "",
    date: job?.date.slice(0, 10) || "",
    actionTime: job && job.date.length > 10 ? job.date.slice(11, 16) : "",
    dateType: job?.dateType || "none",
    stage: initialStage,
    status:
      initialStage === "result"
        ? job?.stage === "result"
          ? job.resultType
          : ""
        : job?.stage === initialStage
          ? job.status
          : initialStage === "application"
            ? "待投递"
            : "待安排",
    round: job?.round || "",
    roundNotes:
      job?.rounds.find((r) => r.stage === initialStage && r.round === job.round)
        ?.notes || "",
    roundResult:
      job?.rounds.find((r) => r.stage === initialStage && r.round === job.round)
        ?.result || "",
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const update = (name: string, value: string) =>
    setData((d) => {
      if (name === "round") {
        const saved = job?.rounds.find(
          (r) => r.stage === d.stage && r.round === value,
        );
        return {
          ...d,
          round: value,
          roundNotes: saved?.notes || "",
          roundResult: saved?.result || "",
        };
      }
      return { ...d, [name]: value };
    });
  const waiting =
    mode === "progress" &&
    ["assessment", "interview"].includes(data.stage) &&
    data.status === "待反馈" &&
    (job?.stage !== data.stage || job?.status !== data.status);
  const field = (
    label: string,
    name: string,
    required = false,
    type = "text",
  ) => (
    <label
      className={`field ${name === "notes" || name === "roundNotes" ? "full-width" : ""} ${errors[name] ? "has-error" : ""}`}
    >
      <span className="field-label">
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </span>
      {name === "notes" || name === "roundNotes" ? (
        <textarea
          className="form-control"
          aria-label={label}
          name={name}
          value={data[name]}
          onChange={(e) => update(name, e.target.value)}
          maxLength={10000}
        />
      ) : type === "date" || type === "time" ? (
        <DateTimeInput
          type={type}
          aria-label={label}
          aria-required={required}
          name={name}
          value={data[name]}
          onValueChange={(value) => update(name, value)}
        />
      ) : (
        <input
          className="form-control"
          aria-label={label}
          aria-required={required}
          name={name}
          type={type}
          value={data[name]}
          onChange={(e) => update(name, e.target.value)}
          maxLength={name === "url" ? 2000 : 500}
        />
      )}
      <span className="field-error">{errors[name]}</span>
    </label>
  );
  const actionFields = (
    <section className="form-section" hidden={waiting}>
      <h3>
        {creating ? actionHeading : "下一步行动"}{" "}
        <span className="detail-muted">选填</span>
      </h3>
      <div className="field-grid">
        {field("行动内容", "action")}
        <label className="field">
          <span className="field-label">时间类型</span>
          <FormSelect
            className="form-control"
            aria-label="时间类型"
            hint={
              data.dateType === "deadline"
                ? "最迟完成时间，例如测评提交或 Offer 答复期限。"
                : data.dateType === "appointment"
                  ? "约定参加的时间，例如面试；时间已过会提示待更新。"
                  : "先记下行动，日期和具体时间可以稍后补充。"
            }
            value={data.dateType}
            onChange={(e) => {
              update("dateType", e.target.value);
              if (e.target.value === "none") {
                update("date", "");
                update("actionTime", "");
              }
            }}
          >
            <option value="none">暂不设置</option>
            <option value="deadline">截止时间</option>
            <option value="appointment">预约时间</option>
          </FormSelect>
        </label>
        {data.dateType !== "none" && (
          <>
            {field("行动日期", "date", false, "date")}
            {field("行动时间（选填）", "actionTime", false, "time")}
          </>
        )}
      </div>
    </section>
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const nextErrors: Record<string, string> = {};
    if (mode === "record") {
      if (!data.company.trim()) nextErrors.company = "请填写公司名称";
      if (!data.role.trim()) nextErrors.role = "请填写岗位名称";
      if (!job && data.stage === "result" && !data.status)
        nextErrors.status = "请选择求职结果";
    }
    if (mode === "progress" && data.stage === "result" && !data.status)
      nextErrors.status = "请选择求职结果";
    if (
      !waiting &&
      data.action.trim() &&
      data.dateType !== "none" &&
      !data.date
    )
      nextErrors.date = "请选择行动日期";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    const action = waiting ? "" : data.action.trim(),
      date =
        !waiting && action && data.dateType !== "none" && data.date
          ? data.date + (data.actionTime ? `T${data.actionTime}:00+08:00` : "")
          : "";
    const payload =
      mode === "record"
        ? {
            ...Object.fromEntries(
              [
                "company",
                "role",
                "city",
                "salary",
                "source",
                "url",
                "appliedAt",
                "notes",
              ].map((key) => [key, data[key].trim()]),
            ),
            ...(!job
              ? {
                  stage: data.stage,
                  status: data.status,
                  resultType: data.stage === "result" ? data.status : "",
                }
              : {}),
          }
        : {
            stage: data.stage,
            status: data.status,
            resultType: data.stage === "result" ? data.status : "",
            round: data.round.trim(),
            roundNotes: data.roundNotes,
            roundResult: data.roundResult,
          };
    try {
      await onSave({
        ...payload,
        action,
        date,
        dateType: date ? data.dateType : "none",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
      setConflict(e instanceof ApiError && e.status === 409);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      label={
        mode === "progress"
          ? "更新求职进展"
          : job
            ? "编辑求职记录"
            : createTitle
      }
      className="modal-layer react-form-layer"
      onClose={() => !busy && onClose()}
    >
      <section
        className={`modal ${creating ? "detail-dialog record-create" : ""}`}
        data-theme={creating ? initialStage : undefined}
      >
        <header className={creating ? "panel-header" : "modal-header"}>
          {creating ? (
            <div className="detail-stage-heading">
              <Icon name={stageIcon} size={21} />
              <strong>{stageName(initialStage)}阶段</strong>
              <span className="detail-record-id">新记录</span>
            </div>
          ) : (
            <div>
              <h2>
                {mode === "progress"
                  ? "更新求职进展"
                  : job
                    ? "编辑求职记录"
                    : createTitle}
              </h2>
              <p>
                {mode === "progress"
                  ? `${job?.company} · ${job?.role}`
                  : "先记下公司和岗位，其他信息可以慢慢补充。"}
              </p>
            </div>
          )}
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭表单"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <form noValidate onSubmit={submit}>
          <fieldset disabled={busy} className="form-fieldset">
            <div className={creating ? "record-create-layout" : undefined}>
              <div className="modal-body">
                {creating && (
                  <div className="detail-hero record-create-hero">
                    <h2 className="detail-title">{createTitle}</h2>
                    <p className="detail-subtitle">
                      {initialStage === "application"
                        ? "记下感兴趣的机会，安排投递的下一步。"
                        : initialStage === "assessment"
                          ? "记下笔试、测评或作业，安排好完成时间。"
                          : initialStage === "interview"
                            ? "记下这次面试机会，为下一次交流做好准备。"
                            : "记录明确的求职结果，安排接下来的行动。"}
                    </p>
                    <div className="detail-status" aria-label="当前求职阶段">
                      {stages.map((stage) => (
                        <span
                          key={stage.id}
                          className={`stage-step ${stage.id === initialStage ? "current" : ""}`}
                          aria-current={
                            stage.id === initialStage ? "step" : undefined
                          }
                        >
                          {stage.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {error && (
                  <div className="form-error-banner" role="alert">
                    {error}
                    {conflict && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void onReload()}
                      >
                        重新读取最新记录
                      </button>
                    )}
                  </div>
                )}
                {mode === "record" ? (
                  <>
                    <div className="form-intro" hidden={creating}>
                      <span
                        className={`status-badge tone-${
                          stages.find((stage) => stage.id === data.stage)
                            ?.tone || "blue"
                        }`}
                      >
                        {job
                          ? stageName(job.stage)
                          : stageName(data.stage as Stage)}
                      </span>
                      <span>
                        {job?.status ||
                          (data.stage === "result"
                            ? "请选择结果"
                            : data.status)}
                      </span>
                    </div>
                    {creating && (
                      <h3 className="record-create-section-title">岗位信息</h3>
                    )}
                    {!job && data.stage === "result" && (
                      <label
                        className={`field ${errors.status ? "has-error" : ""}`}
                      >
                        <span className="field-label">
                          求职结果 <span className="required"> *</span>
                        </span>
                        <FormSelect
                          className="form-control"
                          aria-label="求职结果"
                          hint="请选择明确结果；未收到回复不等于未通过。"
                          value={data.status}
                          onChange={(e) => update("status", e.target.value)}
                        >
                          <option value="">请选择具体结果</option>
                          <option value="offer">收到 Offer</option>
                          <option value="rejected">未通过</option>
                          <option value="withdrawn">主动退出</option>
                        </FormSelect>
                        <span className="field-error">{errors.status}</span>
                      </label>
                    )}
                    <div className="field-grid">
                      {field("公司", "company", true)}
                      {field("岗位", "role", true)}
                      {field("城市", "city")}
                      {field("薪资", "salary")}
                      {field("招聘渠道", "source")}
                      {field("投递日期", "appliedAt", false, "date")}
                      {field("岗位链接", "url", false, "url")}
                      {field("备注", "notes")}
                    </div>
                    {creating ? (
                      <div className="record-create-action">{actionFields}</div>
                    ) : (
                      actionFields
                    )}
                  </>
                ) : (
                  <>
                    <div className="progress-flow">
                      <span>{job && stageName(job.stage)}</span>
                      <Icon name="arrow" />
                      <strong>{stageName(data.stage as Stage)}</strong>
                    </div>
                    <div className="field-grid">
                      <label className="field">
                        <span className="field-label">目标阶段</span>
                        <FormSelect
                          className="form-control"
                          aria-label="目标阶段"
                          hint={
                            stages.find((s) => s.id === data.stage)?.hint ||
                            "选择这次申请当前所处的环节。"
                          }
                          value={data.stage}
                          onChange={(e) => {
                            const stage = e.target.value as Stage;
                            setData((d) => ({
                              ...d,
                              stage,
                              status:
                                stage === job?.stage
                                  ? stage === "result"
                                    ? job.resultType
                                    : job.status
                                  : stage === "application"
                                    ? "待投递"
                                    : stage === "result"
                                      ? ""
                                      : "待安排",
                              roundNotes:
                                job?.rounds.find(
                                  (r) =>
                                    r.stage === stage && r.round === d.round,
                                )?.notes || "",
                              roundResult:
                                job?.rounds.find(
                                  (r) =>
                                    r.stage === stage && r.round === d.round,
                                )?.result || "",
                            }));
                          }}
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </FormSelect>
                      </label>
                      <label
                        className={`field ${errors.status ? "has-error" : ""}`}
                      >
                        <span className="field-label">
                          {data.stage === "result" ? "求职结果" : "阶段状态"}
                        </span>
                        <FormSelect
                          className="form-control"
                          aria-label={
                            data.stage === "result" ? "求职结果" : "阶段状态"
                          }
                          hint={
                            data.stage === "result"
                              ? {
                                  offer: "收到录用通知，之后可记录接受或婉拒。",
                                  rejected: "招聘方已明确告知未通过。",
                                  withdrawn: "由你主动结束本次申请。",
                                }[data.status] ||
                                "请选择明确结果；未收到回复不等于未通过。"
                              : {
                                  待投递: "已记录意向岗位，还没有提交申请。",
                                  已投递: "申请已提交，等待招聘方回复。",
                                  待安排: "还没有确定本轮的具体安排。",
                                  待完成: "本轮仍有需要参加或提交的事项。",
                                  待反馈:
                                    waiting && job?.action
                                      ? "保存时会一并完成当前行动，并开始等待反馈。"
                                      : "本轮已处理，正在等待招聘方反馈。",
                                }[data.status] || "选择当前环节的进展状态。"
                          }
                          value={data.status}
                          onChange={(e) => update("status", e.target.value)}
                        >
                          {(data.stage === "result"
                            ? [
                                ["", "请选择具体结果"],
                                ["offer", "收到 Offer"],
                                ["rejected", "未通过"],
                                ["withdrawn", "主动退出"],
                              ]
                            : data.stage === "application"
                              ? [
                                  ["待投递", "待投递"],
                                  ["已投递", "已投递"],
                                ]
                              : [
                                  ["待安排", "待安排"],
                                  ["待完成", "待完成"],
                                  ["待反馈", "待反馈"],
                                ]
                          ).map(([v, t]) => (
                            <option value={v} key={v}>
                              {t}
                            </option>
                          ))}
                        </FormSelect>
                        <span className="field-error">{errors.status}</span>
                      </label>
                      {field("轮次", "round")}
                    </div>
                    {waiting && (
                      <div className="feedback-completion-note">
                        <Icon name="check" size={21} />
                        <div>
                          <strong>
                            {job?.action
                              ? "保存后，当前行动将完成并转入待反馈"
                              : "保存后开始等待反馈"}
                          </strong>
                          <p>
                            {job?.action || "当前没有待完成的行动。"}
                            {job?.action && (
                              <>
                                <br />
                                原行动与时间将保留在进展时间线中。
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {actionFields}
                    {["assessment", "interview"].includes(data.stage) && (
                      <section className="form-section">
                        <h3>本轮记录</h3>
                        <div className="field-grid">
                          {field("本轮结果", "roundResult")}
                          {field("本轮备注", "roundNotes")}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
              <footer className="modal-footer">
                <span className="form-footnote">
                  {mode === "record" ? "* 为必填项" : "历史会被保留"}
                </span>
                <div>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={onClose}
                  >
                    取消
                  </button>
                  <button className="button primary" type="submit">
                    {busy
                      ? "正在保存…"
                      : mode === "record"
                        ? job
                          ? "保存修改"
                          : "创建记录"
                        : waiting && job?.action
                          ? "完成并保存为待反馈"
                          : "保存进展"}
                  </button>
                </div>
              </footer>
            </div>
          </fieldset>
        </form>
      </section>
    </Dialog>
  );
}
