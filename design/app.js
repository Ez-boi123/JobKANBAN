(() => {
  'use strict';
  const TODAY = '2026-09-08';
  const NOW = new Date('2026-09-08T10:00:00+08:00');
  const STAGES = [
    { id: 'application', name: '投递', tone: 'blue', hint: '从感兴趣，到迈出第一步' },
    { id: 'assessment', name: '测评', tone: 'amber', hint: '笔试、在线测评与作业' },
    { id: 'interview', name: '面试', tone: 'purple', hint: '每一轮，都离目标更近' },
    { id: 'result', name: '结果', tone: 'green', hint: '记录结果，作出下一步决定' }
  ];
  const INITIAL = structuredClone(window.JOB_DATA || []);
  let jobs = structuredClone(INITIAL);
  let archived = false, selectedId = null, forceEmpty = false, dragId = null;
  const $ = (s) => document.querySelector(s);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size = 16) => {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
      arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', check: '<path d="m5 12 4 4L19 6"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      edit: '<path d="m15 5 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15v5Z"/>',
      link: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
      archive: '<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
      alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.01"/>',
      board: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18"/>',
      restore: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>'
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.clock}</svg>`;
  };
  const day = (d) => d ? d.slice(0, 10) : '';
  const isPast = (j) => j.date && (j.date.length > 10 ? new Date(j.date) < NOW : day(j.date) < TODAY);
  const isOverdue = (j) => j.action && j.dateType === 'deadline' && isPast(j);
  const isStaleAppointment = (j) => j.action && j.dateType === 'appointment' && isPast(j);
  const active = () => jobs.filter(j => !j.archived);
  const labelStatus = (j) => j.resultType === 'offer' ? `Offer · ${({ pending: '待决定', accepted: '已接受', declined: '已婉拒' }[j.offerDecision] || '待决定')}` : j.status;
  const tone = (j) => j.stage === 'result' ? j.resultType === 'offer' ? 'green' : 'gray' : STAGES.find(s => s.id === j.stage).tone;
  const dateLabel = (j) => {
    if (!j.date) return j.action ? '未设置时间' : '';
    const d = day(j.date), prefix = d === TODAY ? '今天' : d === '2026-09-09' ? '明天' : `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`;
    const tm = j.date.length > 10 ? ` ${j.date.slice(11, 16)}` : '';
    if (isOverdue(j)) return `已逾期 · ${prefix}${tm}`;
    if (isStaleAppointment(j)) return `待更新 · ${prefix}${tm}`;
    return `${prefix}${tm}${j.dateType === 'deadline' ? ' 截止' : ' 预约'}`;
  };
  function button(text, action, kind = 'secondary', extra = '') { return `<button class="button ${kind}" type="button" data-action="${action}" ${extra}>${text}</button>`; }
  function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; t.classList.add('show'); clearTimeout(window._toastTimer); window._toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('show'); }, 2800); }
  function summary() {
    const data = forceEmpty ? [] : active(), counts = { today: data.filter(j => j.action && day(j.date) === TODAY).length, week: data.filter(j => j.action && day(j.date) >= '2026-09-07' && day(j.date) <= '2026-09-13').length, overdue: data.filter(isOverdue).length };
    document.querySelectorAll('[data-date-filter]').forEach(el => { const n = el.querySelector('[data-count], .summary-count, strong'); if (n) n.textContent = counts[el.dataset.dateFilter] || 0; });
    document.querySelectorAll('[data-total-count]').forEach(el => el.textContent = data.length);
    document.querySelectorAll('[data-archive-count]').forEach(el => el.textContent = jobs.filter(j => j.archived).length);
    const at = $('#archive-toggle'); if (at) { at.checked = archived; at.classList.toggle('is-active', archived); }
  }
  function filteredJobs() {
    if (forceEmpty) return [];
    const query = ($('#search-input')?.value || '').trim().toLowerCase();
    const city = $('#filter-city')?.value || '', status = $('#filter-status')?.value || '', date = $('#filter-date')?.value || '';
    return jobs.filter(j => j.archived === archived && (!query || `${j.company} ${j.role}`.toLowerCase().includes(query)) && (!city || city === 'all' || city === j.city) && (!status || status === 'all' || labelStatus(j).includes(status) || j.status === status) && (!date || date === 'all' || date === 'today' && day(j.date) === TODAY || date === 'week' && day(j.date) >= '2026-09-07' && day(j.date) <= '2026-09-13' || date === 'overdue' && isOverdue(j)));
  }
  function card(j) {
    const urgent = isOverdue(j), stale = isStaleAppointment(j), current = selectedId === j.id;
    const wait = !j.action && /已投递|待反馈/.test(j.status) ? `等待反馈 ${Math.max(0, Math.floor((NOW - new Date(j.statusSince || TODAY)) / 86400000))} 天` : '';
    return `<article class="job-card${current ? ' is-selected' : ''}${urgent ? ' has-overdue' : ''}" data-id="${esc(j.id)}" tabindex="0" role="button" aria-label="${esc(j.company + ' ' + j.role)}" draggable="true">
      <div class="company-row"><div class="company-avatar tone-${tone(j)}">${esc(j.initials || j.company.slice(0, 1))}</div><span class="company-name">${esc(j.company)}</span><button class="card-more icon-button" type="button" data-action="detail" data-id="${esc(j.id)}" aria-label="查看详情">${icon('more')}</button></div>
      <h3 class="job-title">${esc(j.role)}</h3><div class="card-meta">${icon('pin', 13)}<span>${esc(j.city || '城市待补充')}</span><span class="meta-divider">·</span><span>${esc(j.id)}</span></div>
      <div class="card-status-row"><span class="status-badge tone-${tone(j)}">${esc(labelStatus(j))}</span>${j.round ? `<span class="round-label">${esc(j.round)}</span>` : ''}</div>
      <div class="next-action${urgent ? ' is-overdue' : ''}${stale ? ' is-stale' : ''}"><span class="ticket-notch ticket-notch-left" aria-hidden="true"></span><span class="ticket-notch ticket-notch-right" aria-hidden="true"></span>${j.action ? `<div class="action-title">${icon(urgent ? 'alert' : 'arrow', 14)}<span>${esc(j.action)}</span></div><div class="action-time">${icon(j.dateType === 'appointment' ? 'calendar' : 'clock', 13)}${esc(dateLabel(j))}</div>` : `<div class="action-title is-muted">${icon('clock', 14)}<span>${esc(wait || (j.stage === 'result' ? '本次申请已记录结果' : '添加下一步行动'))}</span></div>`}</div>
    </article>`;
  }
  function render() {
    const rows = filteredJobs();
    rows.sort((a, b) => ($('#sort-order')?.value === 'updated' ? (b.updatedAt || '').localeCompare(a.updatedAt || '') : (a.date || '9999').localeCompare(b.date || '9999') || (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    const anyFilter = ['search-input', 'filter-city', 'filter-status', 'filter-date'].some(id => { const v = document.getElementById(id)?.value; return v && v !== 'all'; });
    const columns = $('#columns');
    columns.innerHTML = STAGES.map(s => {
      const subset = rows.filter(j => j.stage === s.id);
      return `<section class="kanban-column" data-stage="${s.id}" aria-label="${s.name}"><header class="column-header"><span class="station-number" aria-hidden="true">${String(STAGES.indexOf(s) + 1).padStart(2, '0')}</span><div class="column-title"><span class="stage-dot tone-${s.tone}"></span><h2>${s.name}</h2><span class="column-count">${subset.length}</span></div><button class="column-add icon-button" type="button" data-action="new" data-stage="${s.id}" aria-label="新建${s.name}记录">${icon('plus', 17)}</button></header><div class="column-cards">${subset.map(card).join('')}${!subset.length ? `<div class="column-empty">${archived ? '暂无归档记录' : '暂无记录'}</div>` : ''}<button class="column-add-row" type="button" data-action="new" data-stage="${s.id}">${icon('plus', 15)} 添加记录</button></div></section>`;
    }).join('');
    $('.board-empty-message')?.remove();
    if (!rows.length) {
      const box = document.createElement('div'); box.className = 'empty-state board-empty-message';
      box.innerHTML = `<div class="empty-icon">${icon(anyFilter ? 'search' : 'board', 32)}</div><h2>${anyFilter ? '没有找到匹配的岗位' : archived ? '还没有归档的记录' : '你的下一站，从这里开始'}</h2><p>${anyFilter ? '试试其他关键词，或清除筛选条件。' : archived ? '已结束的申请可以手动归档，之后随时找回。' : '添加第一个感兴趣的岗位，让每一步进展都有迹可循。'}</p>${button(anyFilter ? '清除筛选' : '添加第一条记录', anyFilter ? 'clear-filters' : 'new', 'primary')}`;
      columns.appendChild(box);
    }
    const label = $('#board-count') || $('#record-total'); if (label) label.textContent = `${rows.length} 条${archived ? '归档' : '求职'}记录`;
    const title = $('.heading-title-row h1'); if (title) title.textContent = archived ? '已归档记录' : '求职进度';
    const ab = $('#archived-banner'); if (ab) { ab.hidden = !archived; ab.innerHTML = icon('archive') + '已归档记录仍保留原有阶段、结果和历史。打开详情即可恢复。'; }
    const filters = $('#active-filters'); if (filters) { filters.hidden = !anyFilter; filters.innerHTML = `<span>当前筛选</span>${['search-input','filter-city','filter-status','filter-date'].map(id=>{const el=document.getElementById(id);const value=el?.value;return value && value!=='all' ? `<span class="filter-chip">${esc(el.tagName==='SELECT'?el.selectedOptions[0].textContent:value)}</span>`:'';}).join('')}${button('清除筛选','clear-filters','ghost')}`; }
    document.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('is-active', el.dataset.nav === (archived ? 'archive' : 'board')));
    summary();
  }
  function closePanel() { $('#detail-panel').hidden = true; $('#detail-panel').classList.remove('is-open'); selectedId = null; render(); }
  function showDetail(id) {
    const j = jobs.find(j => j.id === id); if (!j) return;
    selectedId = id; render();
    const panel = $('#detail-panel'); panel.hidden = false; panel.classList.add('is-open'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', `${j.company}岗位详情`);
    const offer = j.resultType === 'offer';
    const stage = STAGES.find(s => s.id === j.stage);
    const theme = j.stage === 'result' ? j.resultType || 'result' : j.stage;
    const stageIcon = ({ application: 'arrow', assessment: 'edit', interview: 'calendar', offer: 'check', rejected: 'close', withdrawn: 'restore' })[theme] || 'check';
    const focusTitle = !j.action && /已投递|待反馈/.test(j.status) ? '反馈跟进' : ({ application: '投递安排', assessment: '测评安排', interview: '面试安排', result: '后续行动' })[j.stage];
    const waiting = /已投递|待反馈/.test(j.status) ? `等待反馈 ${Math.max(0, Math.floor((NOW - new Date(j.statusSince || TODAY)) / 86400000))} 天` : '';
    panel.innerHTML = `<section class="detail-dialog" data-theme="${esc(theme)}" aria-label="岗位信息"><header class="panel-header"><div class="detail-stage-heading">${icon(stageIcon, 21)}<strong>${stage.name}阶段</strong><span class="detail-record-id">${esc(j.id)}</span></div><div class="panel-header-actions">${button(icon('edit') + ' 编辑', 'edit', 'ghost', `data-id="${esc(id)}"`)}<button class="icon-button" data-action="close-panel" aria-label="关闭详情">${icon('close', 20)}</button></div></header>
      <div class="panel-body">${j.archived ? `<div class="archived-banner">${icon('archive')} 这条记录已归档，可随时恢复。</div>` : ''}
      <div class="detail-hero">
      <div class="detail-company"><span class="company-avatar tone-${tone(j)}">${esc(j.initials)}</span><span>${esc(j.company)}</span></div><h1 class="detail-title">${esc(j.role)}</h1><div class="detail-subtitle">${icon('pin')} ${esc(j.city)} <span>·</span> ${esc(j.salary || '薪资待补充')}</div>
      <div class="detail-status">${STAGES.map(s => `<span class="stage-step${s.id === j.stage ? ' current tone-' + s.tone : ''}">${s.name}</span>`).join('<span class="step-arrow">›</span>')}</div>
      <div class="detail-status-row"><span class="status-badge">${icon(stageIcon, 15)}${esc(labelStatus(j))}</span>${j.round ? `<span class="round-label">${esc(j.round)}</span>` : ''}${waiting ? `<span class="detail-waiting">${icon('clock', 13)}${esc(waiting)}</span>` : ''}${button('更新进展 ' + icon('arrow'), 'progress', 'ghost', `data-id="${esc(id)}"`)}</div></div>
      ${offer ? `<section class="offer-highlight"><div class="section-heading"><h2>收到 Offer</h2><span class="status-badge tone-green">${esc(labelStatus(j).replace('Offer · ', ''))}</span></div><p>${j.offerDecision === 'pending' ? '给自己一点时间，认真选择下一站。' : j.offerDecision === 'accepted' ? '已记录接受决定，祝下一段旅程顺利。' : '已记录婉拒决定，继续寻找合适的机会。'}</p>${j.offerDecision === 'pending' ? `<div class="offer-deadline">${icon('clock')} 答复期限：${j.date ? esc(dateLabel(j)) : '未设置'}</div>` : ''}${j.offerDecision === 'pending' ? `<div class="offer-actions">${button('记录已接受', 'accept-offer', 'primary', `data-id="${esc(id)}"`)}${button('记录已婉拒', 'decline-offer', 'secondary', `data-id="${esc(id)}"`)}</div>` : ''}</section>` : ''}
      ${j.stage === 'result' && !offer ? `<section class="result-highlight"><span class="result-symbol">${icon(stageIcon, 23)}</span><div><h2>${esc(j.status)}</h2><p>${j.resultType === 'rejected' ? '本次申请未通过，复盘要点可记录在备注中。' : '已记录主动退出，申请历史保留。'}</p></div></section>` : ''}
      <section class="detail-section detail-focus"><div class="section-heading"><h2>${focusTitle}</h2>${button('编辑', 'progress', 'ghost', `data-id="${esc(id)}"`)}</div><div class="action-box${isOverdue(j) ? ' overdue' : ''}${isStaleAppointment(j) ? ' stale' : ''}${!j.action && !waiting ? ' no-action' : ''}"><div class="action-title">${icon(isOverdue(j) ? 'alert' : 'arrow')}<strong>${esc(j.action || (waiting ? j.stage === 'application' ? '等待招聘方回复' : `等待${stage.name}反馈` : j.stage === 'result' ? '暂无后续行动' : '暂无下一步行动'))}</strong></div><div class="action-time">${icon(j.dateType === 'appointment' ? 'calendar' : 'clock')}${esc(dateLabel(j) || (waiting ? '收到反馈后，可更新进展并保留记录' : '在需要时添加行动与时间'))}</div>${j.action ? `<div class="detail-action-buttons">${button(canAwaitFeedback(j) ? '完成并待反馈' : '完成行动', 'complete-action', 'secondary', `data-id="${esc(id)}"`)}${button('取消行动', 'cancel-action', 'ghost', `data-id="${esc(id)}"`)}</div>` : ''}</div></section>
      <section class="detail-section"><h2 class="section-heading">岗位信息</h2><dl class="detail-facts"><div><dt>投递日期</dt><dd>${esc(j.appliedAt || '尚未投递')}</dd></div><div><dt>招聘渠道</dt><dd>${esc(j.source || '待补充')}</dd></div><div><dt>岗位链接</dt><dd><a href="${esc(j.url || 'https://example.com')}" target="_blank" rel="noreferrer">查看岗位 ${icon('link', 13)}</a></dd></div></dl></section>
      <section class="detail-section"><div class="section-heading"><h2>进展时间线</h2><span class="detail-muted">保留每一步</span></div><div class="timeline">${(j.history?.length ? [...j.history].sort((a,b)=>(b.date||TODAY).localeCompare(a.date||TODAY)) : [{title:labelStatus(j),date:j.statusSince||TODAY,text:j.action||'等待下一步进展，阶段保持不变。'},{title:j.appliedAt?'已提交申请':'添加感兴趣的岗位',date:j.appliedAt||TODAY,text:j.source||'手动添加'}]).map((h,i)=>`<div class="timeline-item${i===0?' current':''}"><span class="timeline-dot"></span><div><strong>${esc(h.title)}</strong><time>${esc(day(h.date)||TODAY)}</time><p>${esc(h.text||'')}</p></div></div>`).join('')}</div></section>
      <section class="detail-section"><h2 class="section-heading">备注</h2><div class="note-box">${esc(j.notes || '暂无备注')}</div></section></div>
      <footer class="panel-footer">${button(icon(j.archived ? 'restore' : 'archive') + (j.archived ? ' 恢复到看板' : ' 归档记录'), j.archived ? 'restore' : 'archive', 'ghost', `data-id="${esc(id)}" ${!j.archived && j.stage !== 'result' ? 'disabled title="明确结果后可归档"' : ''}`)}${button('返回看板', 'close-panel', 'secondary')}</footer></section>`;
  }
  const field = (label, name, value = '', placeholder = '', required = false, type = 'text') => `<label class="field${name === 'notes' ? ' full-width' : ''}"><span class="field-label">${label}${required ? ' <span class="required">*</span>' : ''}</span>${name === 'notes' ? `<textarea class="form-control" name="${name}" placeholder="${placeholder}">${esc(value)}</textarea>` : `<input class="form-control" name="${name}" type="${type}" value="${esc(value)}" placeholder="${placeholder}" ${required ? 'aria-required="true"' : ''}>`}<span class="field-error" data-error="${name}"></span></label>`;
  const selectField = (label, name, choices, value = '') => `<label class="field"><span class="field-label">${label}</span><select class="form-control" name="${name}">${choices.map(([v, text]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${text}</option>`).join('')}</select><span class="field-error" data-error="${name}"></span></label>`;
  const actionDateField = (value = '') => `<div class="field"><span class="field-label">行动日期与时间 <span class="detail-muted">时间选填</span></span><div class="date-time-fields"><input class="form-control" name="date" aria-label="行动日期" type="date" value="${esc(day(value))}"><input class="form-control" name="actionTime" aria-label="行动时间（选填）" type="time" value="${esc(value.length>10?value.slice(11,16):'')}"></div><span class="field-error" data-error="date"></span></div>`;
  const savedDate = d => d.dateType === 'none' || !d.date ? '' : d.date + (d.actionTime ? `T${d.actionTime}:00+08:00` : '');
  function openModal(title, subtitle, content, formType, id = '') {
    const layer = $('#modal-layer'); layer.hidden = false;
    layer.innerHTML = `<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></header><form id="record-form" data-form-type="${formType}" data-id="${esc(id)}" novalidate><div class="modal-body">${content}</div><footer class="modal-footer"><span class="form-footnote">${formType === 'record' ? '* 为必填项' : '保存后更新进展，历史会被保留'}</span><div>${button('取消', 'close-modal', 'secondary')}<button class="button primary" type="submit">${formType === 'record' ? id ? '保存修改' : '创建记录' : '保存进展'}</button></div></footer></form></section></div>`;
  }

  const canAwaitFeedback = j => ['assessment', 'interview'].includes(j.stage) && j.status !== '待反馈';
  const entersFeedback = (j, stage, status) => ['assessment', 'interview'].includes(stage) && status === '待反馈' && (j.stage !== stage || j.status !== status);
  const actionSnapshot = j => ({ text: j.action, date: j.date || '', dateType: j.dateType || 'none', round: j.round || '' });
  const originalActionText = j => j.action + (j.date ? `；原${j.dateType === 'appointment' ? '预约' : '截止'}时间：${day(j.date)}${j.date.length > 10 ? ' ' + j.date.slice(11, 16) : ''}` : '');
  function finishAction(id, outcome = 'completed') {
    const j = jobs.find(j => j.id === id); if (!j?.action) return;
    const nextStatus = outcome === 'completed' && canAwaitFeedback(j) ? '待反馈' : j.status;
    j.history ||= [];
    j.history.unshift({ title: outcome === 'cancelled' ? '行动已取消' : nextStatus !== j.status ? '行动已完成 · 转为待反馈' : '行动已完成', text: originalActionText(j), date: NOW.toISOString(), stage: j.stage, previousStatus: j.status, status: nextStatus, outcome, action: actionSnapshot(j) });
    if (nextStatus !== j.status) j.statusSince = TODAY;
    Object.assign(j, { status: nextStatus, action: '', date: '', dateType: 'none', updatedAt: NOW.toISOString() });
    showDetail(j.id);
    toast(outcome === 'cancelled' ? `行动已取消，状态保持${labelStatus(j)}` : `行动已完成，当前状态：${labelStatus(j)}`);
  }
  function editRecord(id = '') {
    const j = jobs.find(j => j.id === id) || {};
    openModal(id ? '编辑求职记录' : '添加求职记录', id ? '补充信息，让下一次跟进更从容。' : '先记下公司和岗位，其他信息可以慢慢补充。', `<div class="form-intro"><span class="status-badge tone-${id ? tone(j) : 'blue'}">${id ? STAGES.find(s => s.id === j.stage)?.name : '投递'}</span><span>${id ? esc(j.status) : '待投递'}</span></div><div class="field-grid">${field('公司', 'company', j.company, '例如：云栈科技', true)}${field('岗位', 'role', j.role, '例如：产品经理实习生', true)}${field('城市', 'city', j.city, '例如：上海')}${field('薪资', 'salary', j.salary, '例如：200–250 元/天')}${field('招聘渠道', 'source', j.source, '例如：公司官网')}${field('投递日期', 'appliedAt', j.appliedAt, '', false, 'date')}${field('岗位链接', 'url', j.url, 'https://example.com/jobs/...')}${field('下一步行动', 'action', j.action, '例如：完善简历并提交')}${selectField('时间类型', 'dateType', [['none', '暂不设置'], ['deadline', '截止时间'], ['appointment', '预约时间']], j.dateType || 'none')}${actionDateField(j.date || '')}${field('备注', 'notes', j.notes, '记录岗位要求、准备事项或沟通要点')}</div>`, 'record', id);
  }
  function progress(id, targetStage, error = false) {
    const j = jobs.find(j => j.id === id); if (!j) return;
    const target = targetStage || j.stage;
    openModal('更新求职进展', `${j.company} · ${j.role}`, `<div class="progress-flow"><span>${STAGES.find(s => s.id === j.stage).name}</span>${icon('arrow')}<strong>${STAGES.find(s => s.id === target).name}</strong></div><div class="field-grid">${selectField('目标阶段', 'stage', STAGES.map(s => [s.id, s.name]), target)}<div id="progress-status"></div>${field('轮次', 'round', j.round || '', '例如：第二轮')}</div><div id="result-fields"></div><div id="feedback-completion-note" class="feedback-completion-note" hidden></div><section class="form-section" id="next-fields"><h3>下一步行动 <span class="detail-muted">选填</span></h3><div class="field-grid">${field('行动内容', 'action', j.action || '', '例如：准备第二轮业务面试')}${selectField('时间类型', 'dateType', [['none', '暂不设置'], ['appointment', '预约时间'], ['deadline', '截止时间']], j.dateType || 'none')}${actionDateField(j.date || '')}</div></section>`, 'progress', id);
    updateProgressFields(target, j, error);
  }
  function updateProgressFields(stage, j, error = false) {
    const choices = stage === 'application' ? [['待投递', '待投递'], ['已投递', '已投递']] : stage === 'result' ? [['', '请选择具体结果'], ['offer', '收到 Offer'], ['rejected', '未通过'], ['withdrawn', '主动退出']] : [['待安排', '待安排'], ['待完成', '待完成'], ['待反馈', '待反馈']];
    const current = stage === 'result' ? '' : stage === j.stage ? j.status : choices[0][0];
    $('#progress-status').innerHTML = selectField(stage === 'result' ? '求职结果 *' : '阶段状态', 'status', choices, current);
    $('#result-fields').innerHTML = stage === 'result' ? '<p class="field-hint">请明确结果。收到 Offer 后仍可保留答复期限。</p>' : '';
    $('.progress-flow>strong').textContent = STAGES.find(s => s.id === stage).name;
    if (error) { const el = $('[data-error="status"]'); el.textContent = '请选择求职结果'; el.closest('.field').classList.add('has-error'); }
    syncProgressAction();
  }
  function syncProgressAction() {
    const form = $('#record-form'); if (form?.dataset.formType !== 'progress') return;
    const j = jobs.find(j => j.id === form.dataset.id);
    const waiting = entersFeedback(j, form.elements.stage.value, form.elements.status.value);
    const fields = $('#next-fields'), note = $('#feedback-completion-note');
    fields.hidden = waiting;
    fields.querySelectorAll('input,select').forEach(el => el.disabled = waiting);
    note.hidden = !waiting;
    note.innerHTML = `${icon('check', 21)}<div><strong>${j.action ? '保存后，当前行动将完成并转入待反馈' : '保存后开始等待反馈'}</strong><p>${j.action ? esc(j.action) : '当前没有待完成的行动。'}${j.action ? '<br>原行动与时间将保留在进展时间线中。' : ''}</p></div>`;
    form.querySelector('button[type="submit"]').textContent = waiting && j.action ? '完成并保存为待反馈' : '保存进展';
  }
  function clearFilters() { ['search-input', 'filter-city', 'filter-status', 'filter-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); render(); }
  function saveForm(form) {
    const d = Object.fromEntries(new FormData(form));
    form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    form.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    let valid = true;
    const err = (name, text) => { const el = form.querySelector(`[data-error="${name}"]`); if (el) { el.textContent = text; el.closest('.field').classList.add('has-error'); } valid = false; };
    if (form.dataset.formType === 'record') {
      if (!d.company?.trim()) err('company', '请填写公司名称');
      if (!d.role?.trim()) err('role', '请填写岗位名称');
      if (!valid) return;
      let j = jobs.find(j => j.id === form.dataset.id);
      if (!j) { j = { id: `JK-${String(jobs.length + 1).padStart(3, '0')}`, stage: 'application', status: '待投递', archived: false, history: [] }; jobs.push(j); }
      Object.assign(j, d, { initials: d.company.slice(0, 1), date: savedDate(d), updatedAt: NOW.toISOString(), statusSince: j.statusSince || TODAY });
      $('#modal-layer').hidden = true; forceEmpty = false; render(); if (selectedId === j.id) showDetail(j.id); toast('记录已保存到本次预览');
    } else if (form.dataset.formType === 'progress') {
      const j = jobs.find(j => j.id === form.dataset.id); if (!j) return;
      if (d.stage === 'result' && !d.status) err('status', '请选择求职结果');
      if (!valid) return;
      const enteringFeedback = entersFeedback(j, d.stage, d.status);
      const completing = enteringFeedback && !!j.action;
      const nextAction = enteringFeedback ? '' : (d.action || '').trim();
      const nextDate = nextAction ? savedDate(d) : '';
      const nextDateType = nextAction ? d.dateType || 'none' : 'none';
      const changedAction = nextAction !== (j.action || '') || nextDate !== (j.date || '') || nextDateType !== (j.dateType || 'none');
      const nextStatus = d.stage === 'result' ? ({ offer: '收到 Offer', rejected: '未通过', withdrawn: '主动退出' }[d.status]) : d.status;
      const previousStage = j.stage, previousStatus = j.status;
      j.history ||= [];
      j.history.unshift({ title: `进展更新：${STAGES.find(s => s.id === j.stage).name} · ${labelStatus(j)} → ${STAGES.find(s => s.id === d.stage).name} · ${nextStatus}`, text: completing ? `行动已完成：${originalActionText(j)}` : changedAction && j.action ? `${nextAction ? '原行动已更新' : '原行动已取消'}：${originalActionText(j)}` : j.action ? `保留当前行动：${j.action}` : '本次更新未完成任何行动。', date: NOW.toISOString(), previousStage, stage: d.stage, previousStatus, status: nextStatus, outcome: completing ? 'completed' : changedAction && j.action ? nextAction ? 'updated' : 'cancelled' : 'status-updated', ...(j.action ? { action: actionSnapshot(j) } : {}) });
      if (j.stage !== d.stage || j.status !== nextStatus) j.statusSince = TODAY;
      if (d.stage === 'result') { const preserveDecision = j.resultType === 'offer' && d.status === 'offer'; j.resultType = d.status; j.offerDecision = d.status === 'offer' ? preserveDecision ? j.offerDecision : 'pending' : ''; }
      else { j.resultType = ''; j.offerDecision = ''; }
      Object.assign(j, { stage: d.stage, status: nextStatus, updatedAt: NOW.toISOString(), action: nextAction, date: nextDate, dateType: nextDateType, round: d.round || '' });
      $('#modal-layer').hidden = true; render(); if (selectedId === j.id) showDetail(j.id);
      toast(completing ? '当前行动已完成，状态已更新为待反馈' : '进展已更新，历史已保留');
    }
  }

  function preview(screen) {
    jobs = structuredClone(INITIAL); archived = false; forceEmpty = false; selectedId = null;
    $('#detail-panel').hidden = true; $('#modal-layer').hidden = true; clearFilters();
    document.querySelectorAll('[data-preview]').forEach(el => el.classList.toggle('is-active', el.dataset.preview === screen));
    const interview = jobs.find(j => j.stage === 'interview' && /二|2/.test(j.round || '')) || jobs.find(j => j.stage === 'interview');
    const offer = jobs.find(j => j.resultType === 'offer' && j.offerDecision === 'pending');
    if (screen === 'detail') showDetail(interview.id);
    if (screen === 'complete-action' || screen === 'feedback-progress') {
      showDetail(interview.id); progress(interview.id);
      $('#record-form [name="status"]').value = '待反馈'; syncProgressAction();
    }
    if (screen === 'action-completed') { showDetail(interview.id); finishAction(interview.id); $('#toast').hidden = true; }
    if (screen === 'new' || screen === 'error') { editRecord(); if (screen === 'error') { $('#record-form [name="city"]').value = '上海'; saveForm($('#record-form')); } }
    if (screen === 'edit') editRecord(interview.id);
    if (screen === 'progress' || screen === 'result-error') { progress(jobs.find(j => j.stage === 'assessment').id, screen === 'result-error' ? 'result' : 'interview', screen === 'result-error'); }
    if (screen === 'offer') showDetail(offer.id);
    if (screen === 'archive') { archived = true; render(); showDetail(jobs.find(j => j.archived).id); }
    if (screen === 'empty') { forceEmpty = true; render(); }
    if (screen === 'no-results') { $('#search-input').value = '交互设计总监'; render(); }
    window.PREVIEW_SCREEN = screen;
  }
  document.addEventListener('click', e => {
    if (e.target.id === 'detail-panel') { closePanel(); return; }
    const previewButton = e.target.closest('[data-preview]'); if (previewButton) { preview(previewButton.dataset.preview); return; }
    const nav = e.target.closest('[data-nav]'); if (nav) { archived = nav.dataset.nav === 'archive'; closePanel(); render(); return; }
    const dateFilter = e.target.closest('[data-date-filter]'); if (dateFilter) { $('#filter-date').value = dateFilter.dataset.dateFilter; render(); return; }
    const target = e.target.closest('[data-action]');
    if (target) {
      const action = target.dataset.action, id = target.dataset.id || selectedId, j = jobs.find(j => j.id === id);
      if (action === 'new') editRecord();
      else if (action === 'detail') showDetail(id);
      else if (action === 'edit') editRecord(id);
      else if (action === 'progress') progress(id);
      else if (action === 'close-panel') closePanel();
      else if (action === 'close-modal') $('#modal-layer').hidden = true;
      else if (action === 'clear-filters') clearFilters();
      else if (action === 'archive' || action === 'restore') { if (!j) return; j.archived = action === 'archive'; closePanel(); render(); toast(action === 'archive' ? '已归档，可在已归档中找回' : '已恢复到求职看板'); }
      else if (action === 'accept-offer' || action === 'decline-offer') { j.offerDecision = action === 'accept-offer' ? 'accepted' : 'declined'; j.history ||= []; j.history.unshift({ title: action === 'accept-offer' ? '记录已接受 Offer' : '记录已婉拒 Offer', text: '这是个人记录，不会向招聘方发送消息。' }); j.action = ''; j.date = ''; showDetail(id); toast('已记录你的决定'); }
      else if (action === 'complete-action') finishAction(id);
      else if (action === 'cancel-action') finishAction(id, 'cancelled');
      return;
    }
    const c = e.target.closest('.job-card'); if (c) showDetail(c.dataset.id);
  });
  document.addEventListener('submit', e => { if (e.target.id === 'record-form') { e.preventDefault(); saveForm(e.target); } });
  document.addEventListener('change', e => {
    if (['filter-city', 'filter-status', 'filter-date', 'sort-order'].includes(e.target.id)) render();
    if (e.target.name === 'stage') updateProgressFields(e.target.value, jobs.find(j => j.id === $('#record-form').dataset.id));
    if (e.target.name === 'status') syncProgressAction();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal-layer').hidden) $('#modal-layer').hidden = true; else closePanel(); } if (e.key === 'Enter' && e.target.matches('.job-card')) showDetail(e.target.dataset.id); });
  document.addEventListener('dragstart', e => { const c = e.target.closest('.job-card'); if (c) { dragId = c.dataset.id; e.dataTransfer.setData('text/plain', dragId); c.classList.add('is-dragging'); } });
  document.addEventListener('dragover', e => { const col = e.target.closest('.kanban-column'); if (col) { e.preventDefault(); document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target')); col.classList.add('drop-target'); } });
  document.addEventListener('dragend', () => document.querySelectorAll('.drop-target,.is-dragging').forEach(el => el.classList.remove('drop-target', 'is-dragging')));
  document.addEventListener('drop', e => { const col = e.target.closest('.kanban-column'); if (!col) return; e.preventDefault(); document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target')); const j = jobs.find(j => j.id === dragId); if (j && col.dataset.stage !== j.stage) progress(j.id, col.dataset.stage); });
  $('#search-input')?.addEventListener('input', render);
  $('#new-record')?.addEventListener('click', () => editRecord());
  $('#archive-toggle')?.addEventListener('click', () => { archived = !archived; closePanel(); render(); });
  const cities = [...new Set(jobs.map(j => j.city))].sort();
  if ($('#filter-city')) $('#filter-city').innerHTML = '<option value="">全部城市</option>' + cities.map(c => `<option>${esc(c)}</option>`).join('');
  if ($('#filter-status')) $('#filter-status').innerHTML = '<option value="">全部状态</option>' + ['待投递', '已投递', '待安排', '待完成', '待反馈', '待决定', '已接受', '已婉拒', '未通过', '主动退出'].map(c => `<option>${c}</option>`).join('');
  if ($('#filter-date')) $('#filter-date').innerHTML = '<option value="">全部日期</option><option value="today">今天</option><option value="week">本周</option><option value="overdue">逾期</option>';
  if ($('#sort-order')) $('#sort-order').innerHTML = '<option value="date">下次行动时间</option><option value="updated">最近更新</option>';
  window.designPreview = { show: preview, render, getJobs: () => structuredClone(jobs), today: TODAY };
  preview(new URLSearchParams(location.search).get('screen') || 'board');
})();
