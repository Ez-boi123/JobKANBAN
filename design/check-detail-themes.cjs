const {chromium}=require('./playwright.cjs');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:8765/?v=themes');
 await page.addStyleTag({content:'*,*:before,*:after{animation:none!important;transition:none!important}.preview-tools{display:none!important}'});
 const jobs=await page.evaluate(()=>window.designPreview.getJobs());
 const samples=['application','assessment','interview','offer','rejected','withdrawn'].map(theme=>({theme,job:jobs.find(j=>!j.archived&&(j.stage===theme||j.resultType===theme))}));
 const checks=[],colors=[];
 fs.mkdirSync('design/theme-review',{recursive:true});
 for(const {theme,job} of samples){
  await page.locator(`.job-card[data-id="${job.id}"]`).click();
  const dialog=page.locator('.detail-dialog');
  const color=await dialog.locator('.panel-header').evaluate(el=>getComputedStyle(el).backgroundColor);
  colors.push(color);
  const overflow=await dialog.locator('.detail-stage-heading,.detail-status-row,.action-title,.action-time').evaluateAll(els=>els.filter(el=>el.scrollWidth>el.clientWidth+1).length);
  checks.push({name:theme+' theme and key text fit',pass:await dialog.getAttribute('data-theme')===theme&&overflow===0,color});
  await dialog.screenshot({path:`design/theme-review/${theme}.png`});
  await page.keyboard.press('Escape');
 }
 checks.push({name:'six distinct theme header colors',pass:new Set(colors).size===6});
 for(const stage of ['application','assessment','interview']){
  const job=jobs.find(j=>j.stage===stage&&!j.action&&/已投递|待反馈/.test(j.status));
  if(!job)continue;
  await page.locator(`.job-card[data-id="${job.id}"]`).click();
  checks.push({name:stage+' waiting feedback remains visible',pass:(await page.locator('.detail-focus').innerText()).includes('等待')});
  await page.keyboard.press('Escape');
 }
 const overdue=jobs.find(j=>j.id==='JOB-011');
 await page.locator(`.job-card[data-id="${overdue.id}"]`).click();
 checks.push({name:'overdue warning remains separate from assessment theme',pass:await page.locator('.detail-dialog').getAttribute('data-theme')==='assessment'&&(await page.locator('.action-box.overdue .action-time').innerText()).includes('已逾期')});
 await page.evaluate(()=>window.designPreview.show('archive'));
 checks.push({name:'archived Offer retains outcome theme without pending deadline',pass:await page.locator('.detail-dialog').getAttribute('data-theme')==='offer'&&await page.locator('.detail-dialog .archived-banner').isVisible()&&await page.locator('.offer-deadline').count()===0});
 const report={checks,passed:checks.every(c=>c.pass)};
 fs.writeFileSync('design/exports/detail-themes-validation.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 await browser.close();
 if(!report.passed)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
