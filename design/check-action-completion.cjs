const { chromium } = require('C:/Users/Yisa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Exercise disposable preview data through the UI; write the validation report without screenshots.
const TODAY = '2026-09-08';
const FORM = '#record-form[data-form-type="progress"]';
const report = { checkedAt: new Date().toISOString(), url: 'http://127.0.0.1:8765', viewport: { width: 1440, height: 1000 }, checks: [], pageErrors: [], passed: false };

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1, timezoneId: 'Asia/Shanghai' });
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  const jobs = () => page.evaluate(() => window.designPreview.getJobs());
  const job = async id => (await jobs()).find(row => row.id === id);
  const reset = () => page.evaluate(() => window.designPreview.show('board'));
  const control = name => page.locator(`${FORM} [name="${name}"]`);
  const submit = () => page.locator(`${FORM} button[type="submit"]`).click();
  const terminals = record => (record.history || []).filter(h => ['completed', 'cancelled'].includes(h.outcome));
  const detail = async id => { await page.locator(`.job-card[data-id="${id}"]`).click(); await page.locator('.detail-dialog').waitFor({ state: 'visible' }); };
  const progress = async id => { await detail(id); await page.locator('.detail-dialog [data-action="progress"]').first().click(); await page.locator(FORM).waitFor({ state: 'visible' }); };

  async function check(name, run) {
    await reset();
    try { const detail = await run(); report.checks.push({ name, passed: true, ...(detail ? { detail } : {}) }); }
    catch (error) { report.checks.push({ name, passed: false, error: error.message }); }
  }
  function preserved(before, after, fields) { for (const field of fields) assert.deepEqual(after[field], before[field], `${field} must be preserved`); }
  function cleared(after) { assert.equal(after.action, ''); assert.equal(after.date, ''); assert.equal(after.dateType, 'none'); }
  function noOutcome(before, after) { assert.deepEqual(terminals(after), terminals(before), 'This update must not invent action completion or cancellation'); }
  function history(before, after, outcome, status) {
    const added = terminals(after)[0];
    assert.equal(terminals(after).length, terminals(before).length + 1, 'Exactly one action outcome must be added');
    assert.equal(added.outcome, outcome);
    assert.match(added.title, outcome === 'completed' ? /完成/ : /取消/);
    assert.deepEqual(added.action, { text: before.action, date: before.date, dateType: before.dateType, round: before.round }, 'Preserve the old action, date, time meaning, and round');
    assert.equal(added.previousStatus, before.status);
    assert.equal(added.status, status);
    assert.equal(added.date, after.updatedAt);
    assert.equal(new Date(added.date).toISOString().slice(0, 10), TODAY);
    if (before.history?.length) assert.deepEqual(after.history.slice(-before.history.length), before.history);
  }
  async function prefilled(before) {
    assert.equal(await page.locator(`${FORM} [name="oldAction"]`).count(), 0);
    assert.ok(!(await page.locator(FORM).innerText()).includes('处理当前行动'));
    for (const [name, expected] of Object.entries({ action: before.action, dateType: before.dateType, date: before.date.slice(0, 10), actionTime: before.date.length > 10 ? before.date.slice(11, 16) : '', round: before.round })) {
      assert.equal(await control(name).inputValue(), expected, `${name} must be prefilled`);
    }
  }
  async function feedbackUI() {
    assert.equal(await page.locator('#feedback-completion-note').isVisible(), true);
    assert.match(await page.locator('#feedback-completion-note').innerText(), /完成/);
    assert.equal(await page.locator('#next-fields').isVisible(), false);
    for (const name of ['action', 'dateType', 'date', 'actionTime']) assert.equal(await control(name).isDisabled(), true, `${name} must be disabled`);
    assert.equal(await control('round').isVisible(), true, 'Round stays independently visible');
    assert.equal(await control('round').isEnabled(), true, 'Round stays independently editable');
  }
  async function editAction(id, action, dateType = 'none', date = '', actionTime = '') {
    await detail(id);
    await page.locator('.detail-dialog [data-action="edit"]').click();
    const form = '#record-form[data-form-type="record"]';
    await page.locator(`${form} [name="action"]`).fill(action);
    await page.locator(`${form} [name="dateType"]`).selectOption(dateType);
    await page.locator(`${form} [name="date"]`).fill(date);
    await page.locator(`${form} [name="actionTime"]`).fill(actionTime);
    await page.locator(`${form} button[type="submit"]`).click();
    await page.locator('.detail-dialog [data-action="close-panel"]').first().click();
  }
  async function complete(id, feedback) {
    const before = await job(id);
    await detail(id);
    const button = page.locator('.detail-dialog [data-action="complete-action"]');
    assert.equal((await button.innerText()).trim(), feedback ? '完成并待反馈' : '完成行动');
    await button.click();
    assert.equal(await page.locator('#record-form[data-form-type="completion"]').count(), 0, 'Completion is direct; the former completion dialog must not exist');
    const after = await job(id), status = feedback ? '待反馈' : before.status;
    cleared(after);
    assert.equal(after.status, status);
    assert.equal(after.statusSince, feedback ? TODAY : before.statusSince);
    preserved(before, after, ['stage', 'round', 'resultType', 'offerDecision', 'archived']);
    history(before, after, 'completed', status);
    assert.equal(await page.locator('.detail-dialog [data-action="complete-action"]').count(), 0);
    assert.ok(!(await page.locator('.detail-dialog .detail-focus').innerText()).includes(before.action));
    const card = page.locator(`.job-card[data-id="${id}"]`);
    assert.ok(!(await card.innerText()).includes(before.action));
    if (feedback) assert.match(await card.innerText(), /待反馈/);
    return { before, after };
  }

  try {
    await page.goto(report.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.designPreview);
    await reset();
    await detail('JOB-018');
    assert.equal((await page.locator('.detail-dialog [data-action="complete-action"]').innerText()).trim(), '完成并待反馈');
    assert.equal(await page.locator('.detail-dialog [data-action="cancel-action"]').count(), 1);

    for (const [id, stage] of [['JOB-018', 'interview'], ['JOB-011', 'assessment']]) {
      await check(`${id}: direct ${stage} completion starts awaiting feedback`, async () => {
        const { after } = await complete(id, true);
        assert.equal(after.stage, stage);
        return { status: after.status, round: after.round, history: terminals(after)[0] };
      });
    }
    for (const id of ['JOB-018', 'JOB-026']) {
      await check(`${id}: independent cancellation preserves all progress and result fields`, async () => {
        const before = await job(id);
        await detail(id);
        await page.locator('.detail-dialog [data-action="cancel-action"]').click();
        const after = await job(id);
        cleared(after);
        preserved(before, after, ['stage', 'status', 'round', 'statusSince', 'resultType', 'offerDecision', 'archived']);
        history(before, after, 'cancelled', before.status);
        assert.equal(await page.locator('.detail-dialog [data-action="cancel-action"]').count(), 0);
      });
    }
    await check('Progress preloads the action, time, and round without the old treatment radios', async () => {
      const before = await job('JOB-018'), allBefore = await jobs();
      await progress(before.id);
      await prefilled(before);
      assert.equal(await page.locator('#next-fields').isVisible(), true);
      assert.equal(await control('round').isEnabled(), true);
      assert.deepEqual(await jobs(), allBefore);
    });
    for (const method of ['cancel', 'Escape']) {
      await check(`Progress feedback selection previews completion; ${method} preserves data`, async () => {
        const before = await jobs();
        await progress('JOB-018');
        await control('status').selectOption('待反馈');
        await feedbackUI();
        assert.deepEqual(await jobs(), before);
        if (method === 'cancel') await page.locator(`${FORM} [data-action="close-modal"]`).click();
        else await page.keyboard.press('Escape');
        assert.equal(await page.locator(FORM).isVisible(), false);
        assert.deepEqual(await jobs(), before);
      });
    }
    for (const crossStage of [false, true]) {
      await check(`${crossStage ? 'Cross-stage' : 'Same-stage'} feedback save completes the action with its original details`, async () => {
        const before = await job(crossStage ? 'JOB-011' : 'JOB-018');
        await progress(before.id);
        if (crossStage) await control('stage').selectOption('interview');
        await control('status').selectOption('待反馈');
        await feedbackUI();
        assert.equal((await job(before.id)).stage, before.stage);
        await submit();
        const after = await job(before.id);
        cleared(after);
        assert.equal(after.status, '待反馈');
        assert.equal(after.stage, 'interview');
        assert.equal(after.statusSince, TODAY);
        if (!crossStage) preserved(before, after, ['round', 'resultType', 'offerDecision']);
        history(before, after, 'completed', '待反馈');
      });
    }
    await check('Ordinary same-status progress preserves the action, appointment, round, and status clock', async () => {
      const before = await job('JOB-018');
      await progress(before.id);
      await prefilled(before);
      await submit();
      const after = await job(before.id);
      preserved(before, after, ['stage', 'status', 'action', 'date', 'dateType', 'round', 'statusSince', 'resultType', 'offerDecision']);
      noOutcome(before, after);
    });
    await check('Switching back from feedback restores editable original action controls', async () => {
      const before = await job('JOB-018');
      await progress(before.id);
      await control('status').selectOption('待反馈');
      await feedbackUI();
      await control('status').selectOption(before.status);
      assert.equal(await page.locator('#feedback-completion-note').isVisible(), false);
      assert.equal(await page.locator('#next-fields').isVisible(), true);
      for (const name of ['action', 'dateType', 'date', 'actionTime']) assert.equal(await control(name).isEnabled(), true);
      await prefilled(before);
      await submit();
      const after = await job(before.id);
      preserved(before, after, ['action', 'date', 'dateType', 'round', 'status', 'statusSince']);
      noOutcome(before, after);
    });
    await check('An existing feedback follow-up survives save without restarting the waiting clock', async () => {
      await editAction('JOB-013', '整理测评复盘笔记', 'deadline', '2026-09-11', '18:00');
      const before = await job('JOB-013');
      await progress(before.id);
      await prefilled(before);
      assert.equal(await page.locator('#feedback-completion-note').isVisible(), false);
      assert.equal(await page.locator('#next-fields').isVisible(), true);
      await submit();
      const after = await job(before.id);
      preserved(before, after, ['action', 'date', 'dateType', 'status', 'stage', 'round', 'statusSince']);
      assert.equal(after.status, '待反馈');
      noOutcome(before, after);
    });
    await check('Completing an existing feedback follow-up preserves its waiting origin', async () => {
      await editAction('JOB-013', '整理测评复盘笔记');
      await complete('JOB-013', false);
    });
    await check('Completing an application action does not submit the application', async () => {
      const { after } = await complete('JOB-001', false);
      assert.equal(after.stage, 'application');
      assert.equal(after.status, '待投递');
    });
    await check('Completing an Offer action does not accept or decline the Offer', async () => {
      const { after } = await complete('JOB-026', false);
      assert.equal(after.resultType, 'offer');
      assert.equal(after.offerDecision, 'pending');
      assert.equal(await page.locator('.detail-dialog [data-action="accept-offer"]').isVisible(), true);
      assert.equal(await page.locator('.detail-dialog [data-action="decline-offer"]').isVisible(), true);
    });
    await check('First transition to feedback with no action does not invent completion', async () => {
      await editAction('JOB-025', '');
      const before = await job('JOB-025');
      assert.equal(before.status, '待安排');
      assert.equal(before.action, '');
      await progress(before.id);
      await control('status').selectOption('待反馈');
      await submit();
      const after = await job(before.id);
      assert.equal(after.status, '待反馈');
      assert.equal(after.statusSince, TODAY);
      cleared(after);
      noOutcome(before, after);
    });
  } catch (error) {
    report.checks.push({ name: 'Simplified action UI contract is available', passed: false, error: error.message });
  } finally {
    report.passed = report.checks.length > 0 && report.checks.every(check => check.passed) && report.pageErrors.length === 0;
    fs.writeFileSync(path.join(__dirname, 'exports', 'action-completion-validation.json'), JSON.stringify(report, null, 2));
    await browser.close();
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
