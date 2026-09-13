const {chromium}=require('./playwright.cjs');
const fs=require('fs');
const crypto=require('crypto');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/');
 await page.addStyleTag({content:'*,*:before,*:after{animation:none!important;transition:none!important}.preview-tools{display:none!important}'});
 const neutral=await page.addStyleTag({content:'.sidebar,.app-shell{visibility:hidden!important}'});
 const snapshots=[];
 for(const screen of ['detail','offer','archive','edit','new','feedback-progress']){
  await page.evaluate(s=>window.designPreview.show(s),screen);
  const selector=['detail','offer','archive'].includes(screen)?'.detail-dialog':'.modal';
  const node=page.locator(selector);
  const styles=await node.evaluate(el=>[el,...el.querySelectorAll('*')].map(n=>{const s=getComputedStyle(n);return {tag:n.tagName,class:n.className.baseVal??n.className,text:n.childElementCount?'':n.textContent,css:s.cssText,values:['fontFamily','fontSize','fontWeight','color','backgroundColor','padding','margin','border','borderRadius','display','width','height','gap','boxShadow'].map(k=>s[k])};}));
  const pixels=await node.screenshot();
  snapshots.push({screen,styles,hash:crypto.createHash('sha256').update(pixels).digest('hex')});
 }
 const baseline='design/shell-theme-baseline.json';
 await neutral.evaluate(el=>el.remove());
 if(process.argv.includes('--baseline')){fs.writeFileSync(baseline,JSON.stringify(snapshots));console.log('Captured 6 protected detail/form baselines.');}
 else {
  const before=JSON.parse(fs.readFileSync(baseline));
  const checks=snapshots.map((s,i)=>({name:s.screen+' unchanged',pass:s.hash===before[i].hash&&JSON.stringify(s.styles)===JSON.stringify(before[i].styles),pixelsIdentical:s.hash===before[i].hash}));
  for(const width of [1440,1200]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.designPreview.show('board'));
   const overflow=await page.evaluate(()=>[...document.querySelectorAll('.sidebar .brand,.main-content .job-title,.main-content .company-name,.main-content .action-title,.filter-row,.heading-title-row')].filter(n=>n.clientWidth>0&&n.scrollWidth>n.clientWidth+2).map(n=>n.className));
   checks.push({name:width+' board fits',pass:overflow.length===0,overflow});
  }
  const report={checks,errors,passed:!errors.length&&checks.every(c=>c.pass)};
  fs.writeFileSync('design/exports/shell-theme-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
