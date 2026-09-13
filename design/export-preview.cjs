const { chromium } = require('./playwright.cjs');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function exportSvg(page, title) {
  return page.evaluate(({ title }) => {
    const W = innerWidth, H = innerHeight;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    let n = 0, defs = [];
    const round = v => Math.round(v * 100) / 100;
    const transparent = c => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
    const rect = r => `x="${round(r.x)}" y="${round(r.y)}" width="${round(r.width)}" height="${round(r.height)}"`;
    function textSvg(value, s, box, y) {
      const size = parseFloat(s.fontSize) || 14;
      return `<text x="${round(box.x)}" y="${round(y)}" fill="${esc(s.color)}" font-family="${esc(s.fontFamily)}" font-size="${size}" font-weight="${s.fontWeight}" letter-spacing="${s.letterSpacing === 'normal' ? 0 : s.letterSpacing}" xml:space="preserve">${esc(value)}</text>`;
    }
    function walk(el) {
      if (!(el instanceof Element)) return '';
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || el.closest('[data-export-ignore]') || ['SCRIPT','STYLE','SYMBOL','DEFS'].includes(el.tagName)) return '';
      if ((r.width === 0 || r.height === 0) && !el.children.length) return '';
      let pieces = [], clip = '';
      if (el.tagName.toLowerCase() === 'svg') {
        if (r.right < 0 || r.bottom < 0 || r.x > W || r.y > H) return '';
        const copy = el.cloneNode(true);
        copy.querySelectorAll('use').forEach(u => {
          const source = document.querySelector(u.getAttribute('href') || u.getAttribute('xlink:href'));
          if (source) { if(!copy.hasAttribute('viewBox')) copy.setAttribute('viewBox',source.getAttribute('viewBox')||'0 0 24 24'); const g = document.createElementNS('http://www.w3.org/2000/svg','g'); g.innerHTML = source.innerHTML; u.replaceWith(g); }
        });
        copy.setAttribute('x', round(r.x)); copy.setAttribute('y', round(r.y)); copy.setAttribute('width', round(r.width)); copy.setAttribute('height', round(r.height)); copy.setAttribute('color', s.color);
        copy.setAttribute('fill',s.fill);copy.setAttribute('stroke',s.stroke);copy.setAttribute('stroke-width',s.strokeWidth);copy.setAttribute('stroke-linecap',s.strokeLinecap);copy.setAttribute('stroke-linejoin',s.strokeLinejoin);
        copy.removeAttribute('class'); copy.removeAttribute('id');
        return copy.outerHTML.replace(/currentColor/g, s.color);
      }
      if (!transparent(s.backgroundColor) && r.width && r.height) pieces.push(`<rect ${rect(r)} rx="${parseFloat(s.borderTopLeftRadius)||0}" fill="${esc(s.backgroundColor)}"/>`);
      const widths = ['Top','Right','Bottom','Left'].map(k=>parseFloat(s['border'+k+'Width'])||0);
      if (widths.every(w=>w === widths[0]) && widths[0] && !transparent(s.borderTopColor)) pieces.push(`<rect x="${round(r.x+widths[0]/2)}" y="${round(r.y+widths[0]/2)}" width="${round(Math.max(0,r.width-widths[0]))}" height="${round(Math.max(0,r.height-widths[0]))}" rx="${Math.max(0,(parseFloat(s.borderTopLeftRadius)||0)-widths[0]/2)}" fill="none" stroke="${esc(s.borderTopColor)}" stroke-width="${widths[0]}"/>`);
      else ['Top','Right','Bottom','Left'].forEach((k,i)=>{if(!widths[i])return;const c=s['border'+k+'Color'];if(transparent(c))return;const p=[ [r.x,r.y,r.right,r.y], [r.right,r.y,r.right,r.bottom], [r.x,r.bottom,r.right,r.bottom], [r.x,r.y,r.x,r.bottom] ][i];pieces.push(`<path d="M${p[0]} ${p[1]}L${p[2]} ${p[3]}" stroke="${esc(c)}" stroke-width="${widths[i]}"/>`);});
      if (['hidden','auto','scroll','clip'].includes(s.overflowY) || ['hidden','auto','scroll','clip'].includes(s.overflowX)) {
        clip = `clip${++n}`; defs.push(`<clipPath id="${clip}"><rect ${rect(r)} rx="${parseFloat(s.borderTopLeftRadius)||0}"/></clipPath>`);
      }
      if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
        if (el.type === 'radio' || el.type === 'checkbox') {
          pieces.push(`<circle cx="${r.x+r.width/2}" cy="${r.y+r.height/2}" r="6" stroke="#B7C0CF" fill="white"/>`);
          if(el.checked) pieces.push(`<circle cx="${r.x+r.width/2}" cy="${r.y+r.height/2}" r="3.5" fill="#3268D9"/>`);
        } else {
          const value = el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent : el.value || el.placeholder || (el.type === 'date' ? 'yyyy/mm/dd' : '');
          const xx = r.x+(parseFloat(s.paddingLeft)||10), yy = r.y+(el.tagName === 'TEXTAREA' ? (parseFloat(s.paddingTop)||10)+parseFloat(s.fontSize)*.88 : r.height/2+parseFloat(s.fontSize)*.35);
          pieces.push(textSvg(value || '', s, {x:xx}, yy));
          if(el.tagName === 'SELECT' && s.appearance!=='none') pieces.push(`<path d="m${r.right-19} ${r.y+r.height/2-2} 4 4 4-4" fill="none" stroke="${s.color}" stroke-width="1.4"/>`);
        }
      } else {
        for(const node of el.childNodes) {
          if(node.nodeType === 1) pieces.push(walk(node));
          else if(node.nodeType === 3 && node.textContent.trim()) {
            const value=node.textContent, range=document.createRange(); let lines=[];
            for(let i=0;i<value.length;i++) {
              range.setStart(node,i);range.setEnd(node,i+1);const cr=range.getBoundingClientRect();
              if(!cr.width || !cr.height) continue;
              let line=lines.find(l=>Math.abs(l.y-cr.y)<1);
              if(!line) {line={x:cr.x,y:cr.y,height:cr.height,value:''};lines.push(line);} line.value+=value[i];
            }
            for(const line of lines) {
              ctx.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
              const metrics=ctx.measureText(line.value), asc=metrics.fontBoundingBoxAscent || parseFloat(s.fontSize)*.88, des=metrics.fontBoundingBoxDescent || parseFloat(s.fontSize)*.25;
              const yy=line.y+(line.height-asc-des)/2+asc;
              pieces.push(textSvg(line.value,s,line,yy));
            }
          }
        }
      }
      if(el.classList.contains('toggle-track')) { const checked=el.parentElement.querySelector('input')?.checked;pieces.push(`<circle cx="${r.x+(checked?r.width-7:7)}" cy="${r.y+r.height/2}" r="4.5" fill="white"/>`); }
      return `<g${clip?` clip-path="url(#${clip})"`:''}${Number(s.opacity)<1?` opacity="${s.opacity}"`:''}>${pieces.join('')}</g>`;
    }
    const content=walk(document.body);
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>${esc(title)}</title><desc>JobKANBAN editable vector design preview. All recruiting examples are fictional. Native Figma components and auto layout are not included.</desc><defs><clipPath id="viewport"><rect width="${W}" height="${H}"/></clipPath>${defs.join('')}</defs><rect width="${W}" height="${H}" fill="white"/><g clip-path="url(#viewport)">${content}</g></svg>`;
  }, { title });
}

(async()=>{
  const out=path.join(__dirname,'exports');fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,timezoneId:'Asia/Shanghai'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await page.waitForFunction(()=>window.designPreview);
  await page.addStyleTag({content:'.preview-tools,.preview-toolbar,.preview-dock,.preview-switcher{display:none!important}*,*:before,*:after{animation:none!important;transition:none!important}'});
  const views=[['board','01-board'],['detail','02-detail'],['new','03-new'],['edit','04-edit'],['progress','05-progress'],['offer','06-offer'],['archive','07-archive'],['empty','08-empty'],['no-results','09-no-results'],['error','10-form-error'],['result-error','11-result-error'],['feedback-progress','12-feedback-progress'],['action-completed','13-action-completed']];
  const frames=[];
  for(const [screen,name] of views){
    await page.evaluate(s=>window.designPreview.show(s),screen);
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(out,name+'.png')});
    fs.writeFileSync(path.join(out,name+'.svg'),await exportSvg(page,name),'utf8');
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.job-title,.company-name,.field-label,.detail-title,.action-title')].filter(el=>{const s=getComputedStyle(el);return s.display!=='none'&&el.offsetWidth>0&&el.scrollWidth>el.clientWidth+2;}).map(el=>({class:el.className,text:el.textContent})));
    frames.push({screen,name,overflow});
  }
  if(process.argv.includes('--export-only')) {
    const reportPath=path.join(out,'validation.json');
    const prior=JSON.parse(fs.readFileSync(reportPath,'utf8'));
    prior.frames=frames;prior.errors=errors;
    fs.writeFileSync(reportPath,JSON.stringify(prior,null,2));
    console.log(JSON.stringify({exported:frames.length,errors,overflow:frames.flatMap(f=>f.overflow)}));
    await browser.close();return;
  }
  const checks=[];
  await page.evaluate(()=>window.designPreview.show('board'));
  checks.push({name:'four-stage counts',actual:await page.locator('.column-count').allTextContents(),expected:['10','7','8','5']});
  await page.fill('#search-input','星汀');checks.push({name:'search',actual:await page.locator('.job-card').count(),expected:1});
  await page.evaluate(()=>window.designPreview.show('new'));
  await page.locator('#record-form button[type=submit]').click();checks.push({name:'required fields',actual:await page.locator('.has-error').count(),expected:2});
  await page.fill('[name=company]','示例新公司');await page.fill('[name=role]','测试岗位');await page.locator('#record-form button[type=submit]').click();
  checks.push({name:'create record',actual:await page.locator('.job-card').count(),expected:31});
  await page.evaluate(()=>window.designPreview.show('edit'));await page.locator('#record-form button[type=submit]').click();
  checks.push({name:'preserve appointment time',actual:await page.evaluate(()=>window.designPreview.getJobs().find(j=>j.id==='JOB-018').date),expected:'2026-09-07T15:00:00+08:00'});
  await page.evaluate(()=>window.designPreview.show('result-error'));
  await page.locator('#record-form button[type=submit]').click();checks.push({name:'result required',actual:await page.locator('[data-error=status]').textContent(),expected:'请选择求职结果'});
  await page.selectOption('[name=status]','offer');await page.locator('#record-form button[type=submit]').click();
  checks.push({name:'result saved',actual:await page.evaluate(()=>window.designPreview.getJobs().find(j=>j.id==='JOB-011').resultType),expected:'offer'});
  await page.evaluate(()=>window.designPreview.show('offer'));await page.locator('[data-action=accept-offer]').click();
  checks.push({name:'offer decision',actual:await page.locator('.offer-highlight .status-badge').textContent(),expected:'已接受'});
  await page.evaluate(()=>window.designPreview.show('archive'));await page.locator('[data-action=restore]').click();
  checks.push({name:'restore archive',actual:await page.evaluate(()=>window.designPreview.getJobs().filter(j=>j.archived).length),expected:2});
  const report={errors,frames,checks,passed:!errors.length&&checks.every(c=>JSON.stringify(c.actual)===JSON.stringify(c.expected))};
  fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
