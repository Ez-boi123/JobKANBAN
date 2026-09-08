import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const basics = ['company', 'role', 'city', 'salary', 'source', 'url', 'notes', 'appliedAt', 'action', 'date', 'dateType'];
const fail = message => { throw new HttpError(400, message); };
export function validateBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请提交有效的记录对象');
  for (const key of Object.keys(body)) if (!allowed.includes(key)) fail(`不支持的字段：${key}`);
}
function readString(value, name, max = 300) {
  if (typeof value !== 'string' || value.length > max) fail(`${name}必须为不超过 ${max} 字的文字`);
  return value.trim();
}
function validDate(value, dateOnly = false) {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) && (dateOnly || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value))) fail('日期格式无效');
  if (value.length > 10 && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || (value[16] === ':' && Number(value.slice(17, 19)) > 59))) fail('时间无效');
  const day = value.slice(0, 10);
  const parsed = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(value))) fail('日期无效');
}
function applyBasics(job, body) {
  for (const field of basics) if (field in body) job[field] = readString(body[field], field, field === 'notes' ? 20000 : field === 'url' ? 2048 : 300);
  if (!job.company || !job.role) fail('公司和岗位不能为空');
  if (job.url) {
    let url; try { url = new URL(job.url); } catch { fail('岗位链接必须是有效网址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('岗位链接仅支持 http 或 https');
  }
  validDate(job.appliedAt, true);
  validateAction(job);
  job.initials = [...job.company].slice(0, 2).join('');
}
function validateAction(job) {
  if (!['none', 'deadline', 'appointment'].includes(job.dateType)) fail('时间类型无效');
  validDate(job.date);
  if (!job.action && job.date) fail('请先填写行动内容再设置时间');
  if ((job.dateType === 'none') !== !job.date) fail('时间与时间类型不一致');
}
function snapshot(job) {
  return { text: job.action, date: job.date, dateType: job.dateType, round: job.round };
}
function event(job, old, now, title, text, outcome) {
  const previousRoundRecord = old.rounds.find(r => r.stage === old.stage && r.round === old.round);
  const roundRecord = job.rounds.find(r => r.stage === job.stage && r.round === job.round);
  job.history.unshift({ id: randomUUID(), title, text, date: now, previousStage: old.stage, previousStatus: old.status, previousRound: old.round, stage: job.stage, status: job.status, round: job.round, action: snapshot(old), outcome, ...(previousRoundRecord ? { previousRoundRecord: structuredClone(previousRoundRecord) } : {}), ...(roundRecord ? { roundRecord: structuredClone(roundRecord) } : {}) });
}
export function editJob(old, body, now) {
  validateBody(body, ['version', ...basics]);
  const job = structuredClone(old);
  applyBasics(job, body);
  saveRound(job, {});
  const cancelled = !!old.action && !job.action;
  event(job, old, now, '编辑求职记录', old.action ? `${cancelled ? '原行动已取消' : '原行动'}：${old.action}${old.date ? `；原时间：${old.date}` : ''}` : '已更新基础资料。', cancelled ? 'cancelled' : 'updated');
  job.updatedAt = now;
  job.version++;
  return job;
}

const stages = { application: ['待投递', '已投递'], assessment: ['待安排', '待完成', '待反馈'], interview: ['待安排', '待完成', '待反馈'] };
const results = { offer: '收到 Offer', rejected: '未通过', withdrawn: '主动退出' };
const stageNames = { application: '投递', assessment: '测评', interview: '面试', result: '结果' };
function clearAction(job) { job.action = ''; job.date = ''; job.dateType = 'none'; }
function saveRound(job, body) {
  if (!['assessment', 'interview'].includes(job.stage) || !job.round) return;
  let round = job.rounds.find(r => r.stage === job.stage && r.round === job.round);
  if (!round) { round = { stage: job.stage, round: job.round, date: '', notes: '', result: '' }; job.rounds.push(round); }
  if (job.date) round.date = job.date;
  if ('roundNotes' in body) round.notes = readString(body.roundNotes, '轮次备注', 20000);
  if ('roundResult' in body) round.result = readString(body.roundResult, '轮次结果', 2000);
}
export function commandJob(old, body, now) {
  const fields = { progress: ['stage', 'status', 'resultType', 'round', 'roundNotes', 'roundResult', 'action', 'date', 'dateType'], offer: ['decision'], 'complete-action': [], 'cancel-action': [], archive: [], restore: [] };
  if (!body || !Object.hasOwn(fields, body.type)) fail('未知进展操作');
  validateBody(body, ['version', 'type', ...fields[body.type]]);
  const job = structuredClone(old);
  let title, text, outcome;
  if (job.archived && body.type !== 'restore') fail('请先恢复归档记录');
  if (body.type === 'progress') {
    if (body.stage !== 'result' && !Object.hasOwn(stages, body.stage)) fail('求职阶段无效');
    job.stage = body.stage;
    if (job.stage === 'result') {
      const result = body.resultType || body.status;
      if (!Object.hasOwn(results, result)) fail('请选择有效求职结果');
      if (body.status && ![result, results[result]].includes(body.status)) fail('求职结果与状态不一致');
      job.resultType = result; job.status = results[result];
      job.offerDecision = result === 'offer' ? old.resultType === 'offer' ? old.offerDecision : 'pending' : '';
    } else {
      if (!stages[job.stage].includes(body.status)) fail('阶段与状态不匹配');
      if (body.resultType) fail('仅结果阶段可以设置求职结果');
      job.status = body.status; job.resultType = ''; job.offerDecision = '';
    }
    job.round = 'round' in body ? readString(body.round, '轮次') : job.stage === old.stage ? old.round : '';
    for (const field of ['roundNotes', 'roundResult']) if (field in body) readString(body[field], field, field === 'roundNotes' ? 20000 : 2000);
    if ((body.roundNotes || body.roundResult) && (!job.round || !['assessment', 'interview'].includes(job.stage))) fail('请为测评或面试轮次填写轮次名称');
    for (const field of ['action', 'date', 'dateType']) if (field in body) job[field] = readString(body[field], field);
    const completing = ['assessment', 'interview'].includes(job.stage) && job.status === '待反馈' && (job.stage !== old.stage || old.status !== '待反馈');
    if (completing) clearAction(job);
    validateAction(job);
    saveRound(job, body);
    title = `进展更新：${stageNames[old.stage]} · ${old.status} → ${stageNames[job.stage]} · ${job.status}`;
    outcome = completing && old.action ? 'completed' : old.action !== job.action || old.date !== job.date || old.dateType !== job.dateType ? job.action ? 'updated' : 'cancelled' : 'status-updated';
    text = old.action ? `${outcome === 'completed' ? '行动已完成' : '原行动'}：${old.action}${old.date ? `；原时间：${old.date}` : ''}` : '已记录阶段和轮次进展。';
  } else if (body.type === 'complete-action' || body.type === 'cancel-action') {
    if (!job.action) fail('当前没有待处理行动');
    const complete = body.type === 'complete-action';
    if (complete && ['assessment', 'interview'].includes(job.stage) && job.status !== '待反馈') job.status = '待反馈';
    clearAction(job);
    title = complete ? '完成行动' : '取消行动';
    text = `${title}：${old.action}${old.date ? `；原时间：${old.date}` : ''}`;
    outcome = complete ? 'completed' : 'cancelled';
  } else if (body.type === 'offer') {
    if (job.stage !== 'result' || job.resultType !== 'offer' || job.offerDecision !== 'pending') fail('当前没有待决定的 Offer');
    if (!['accepted', 'declined'].includes(body.decision)) fail('Offer 决定无效');
    job.offerDecision = body.decision;
    clearAction(job);
    title = body.decision === 'accepted' ? '记录已接受 Offer' : '记录已婉拒 Offer';
    text = old.action ? `原行动：${old.action}${old.date ? `；原时间：${old.date}` : ''}` : '已保存个人决定。';
    outcome = 'offer-decided';
  } else {
    if (body.type === 'archive' && (job.stage !== 'result' || job.archived)) fail('仅未归档的结果记录可以归档');
    if (body.type === 'restore' && !job.archived) fail('记录尚未归档');
    job.archived = body.type === 'archive';
    title = job.archived ? '归档求职记录' : '恢复求职记录'; text = '保留原有阶段、结果及行动。'; outcome = body.type;
  }
  if (job.stage !== old.stage || job.status !== old.status) job.statusSince = now;
  if (!job.appliedAt && job.stage === 'application' && job.status === '已投递') job.appliedAt = new Date(Date.parse(now) + 8 * 3600000).toISOString().slice(0, 10);
  event(job, old, now, title, text, outcome);
  job.updatedAt = now; job.version++;
  return job;
}

export function createJob(body, now) {
  validateBody(body, basics);
  const job = {
    id: randomUUID(), company: '', role: '', initials: '',
    city: '', salary: '', source: '', url: '', notes: '', appliedAt: '',
    stage: 'application', status: '待投递', round: '', action: '', date: '', dateType: 'none',
    resultType: '', offerDecision: '', archived: false,
    version: 1, createdAt: now, updatedAt: now, statusSince: now,
    history: [{ id: randomUUID(), title: '创建求职记录', text: '开始记录求职进展。', date: now }], rounds: [],
  };
  applyBasics(job, body);
  return job;
}
