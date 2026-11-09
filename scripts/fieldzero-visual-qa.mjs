import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const targets=[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'tablet',width:768,height:1024},{name:'small-mobile',width:320,height:720}];
const results=[];
await fs.mkdir('visual-qa-artifacts',{recursive:true});
for (const target of targets) {
  const page=await browser.newPage({viewport:{width:target.width,height:target.height},deviceScaleFactor:1,isMobile:target.name.includes('mobile'),hasTouch:target.name.includes('mobile')});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(3200);
  const metrics=await page.evaluate(()=>{
    const box=(s)=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}:null;};
    const root=document.documentElement,body=document.body;
    return {viewportWidth:innerWidth,contentWidth:Math.max(root.scrollWidth,body.scrollWidth),hero:box('#home'),heroTitle:box('#fz26HeroTitle'),selector:box('.fz26-route-panel'),book:box('#calendar'),quickStartCount:document.querySelectorAll('[data-fz26-experience]').length,cssLoaded:[...document.styleSheets].some(s=>s.href?.includes('experience-2026.css')),sections:['packages','calendar','how-it-works','gallery','fzCommunityGateway'].map(id=>({id,found:!!document.getElementById(id)})),communityCount:document.querySelectorAll('#fzCommunityContent>section').length};
  });
  let routeTest='not-run',menuTest='not-applicable',hubTest='not-run';
  try{
    await page.locator('[data-fz26-experience="Solo Target Practice"]').click({timeout:5000});
    routeTest=await page.locator('#bookingExperience').inputValue()==='Solo Target Practice'&&await page.locator('#arenaDuration').inputValue()==='0.5'?'pass':'fail';
  }catch(e){routeTest='fail: '+String(e.message).slice(0,120);}
  try{
    await page.locator('#fzCommunityGateway>summary').click({timeout:5000});
    hubTest=await page.locator('#fzCommunityGateway').getAttribute('open')!==null?'pass':'fail';
  }catch(e){hubTest='fail: '+String(e.message).slice(0,120);}
  if(target.width<=970) {
    try{
      await page.locator('#menuToggle').click({timeout:5000});
      menuTest=await page.locator('#menuToggle').getAttribute('aria-expanded')==='true'?'pass':'fail';
      await page.locator('#menuToggle').click();
    }catch(e){menuTest='fail: '+String(e.message).slice(0,120);}
  }
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(220);
  await page.screenshot({path:'visual-qa-artifacts/'+target.name+'-top.png',animations:'disabled'});
  try{await page.locator('#calendar').screenshot({path:'visual-qa-artifacts/'+target.name+'-booking.png',timeout:20000,animations:'disabled'});}catch(e){errors.push('booking screenshot: '+String(e.message).slice(0,140));}
  const result={...target,...metrics,horizontalOverflow:metrics.contentWidth>metrics.viewportWidth+2,routeTest,hubTest,menuTest,errors};
  results.push(result);
  console.log('VISUAL_QA '+JSON.stringify(result));
  await page.close();
}
await browser.close();
await fs.writeFile('visual-qa-artifacts/report.json',JSON.stringify(results,null,2));
const failure=results.some(r=>r.horizontalOverflow||!r.cssLoaded||!r.hero||!r.selector||r.quickStartCount!==3||r.communityCount<5||r.routeTest!=='pass'||r.hubTest!=='pass'||r.menuTest==='fail'||r.errors.length);
if(failure){console.error('FIELDZERO visual QA detected layout or browser issues.');process.exit(1);}
console.log('FIELDZERO visual QA passed for desktop, mobile, tablet and narrow mobile.');