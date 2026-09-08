const {chromium}=require('C:/Users/Yisa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:8765');
 await page.addStyleTag({content:'*,*:before,*:after{animation:none!important;transition:none!important}'});
 const checks=[];
 await page.locator('.job-card').first().click();
 checks.push({name:'click card opens centered detail',pass:await page.locator('.detail-dialog').isVisible()});
 for(const screen of ['detail','offer','archive']){
  await page.evaluate(s=>window.designPreview.show(s),screen);
  const box=await page.locator('.detail-dialog').boundingBox();
  checks.push({name:screen+' centered',pass:Math.abs(box.x+box.width/2-720)<1&&Math.abs(box.y+box.height/2-500)<1,box});
  const scroll=await page.locator('.detail-dialog .panel-body').evaluate(el=>{el.scrollTop=100;return {canScroll:el.scrollHeight>el.clientHeight,moved:el.scrollTop>0,backgroundLocked:getComputedStyle(document.body).overflow==='hidden'};});
  checks.push({name:screen+' internal scroll with background locked',pass:scroll.canScroll&&scroll.moved&&scroll.backgroundLocked});
 }
 await page.mouse.click(20,20);
 checks.push({name:'backdrop closes detail',pass:await page.locator('#detail-panel').isHidden()});
 await page.evaluate(()=>window.designPreview.show('detail'));
 await page.locator('.panel-header [data-action=edit]').click();
 await page.keyboard.press('Escape');
 checks.push({name:'Escape closes top form and preserves detail',pass:await page.locator('#modal-layer').isHidden()&&await page.locator('.detail-dialog').isVisible()});
 await page.keyboard.press('Escape');
 checks.push({name:'Escape closes detail',pass:await page.locator('#detail-panel').isHidden()});
 const report={checks,passed:checks.every(c=>c.pass)};
 fs.writeFileSync('design/exports/centered-detail-validation.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 await browser.close();
 if(!report.passed)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1)});
