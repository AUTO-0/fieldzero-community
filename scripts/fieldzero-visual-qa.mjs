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
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';window.scrollTo(0,0);});
  await page.waitForTimeout(300);
  await page.screenshot({path:'visual-qa-artifacts/'+target.name+'-top.png',animations:'disabled'});
  await page.locator('#home').screenshot({path:'visual-qa-artifacts/'+target.name+'-hero.png',animations:'disabled'});
  const firstVisitUnblocked=await page.locator('#announcementPopup').evaluate(el=>el.hidden);
  let packageTest='not-run',optionalFieldsTest='not-run',specialTimeTest='not-run';
  try{
    const beforeCount=await page.locator('#packages .package-card:visible').count();
    await page.locator('#packages .fz26-more-packages').click({timeout:5000});
    const afterCount=await page.locator('#packages .package-card:visible').count();
    packageTest=beforeCount===3&&afterCount>=5?'pass':'fail '+beforeCount+'->'+afterCount;
    await page.locator('#packages .fz26-more-packages').click({timeout:5000});
  }catch(e){packageTest='fail: '+String(e.message).slice(0,150);}
  try{
    const extra=page.locator('#calendar .fz26-booking-extras');
    await extra.locator('summary').click({timeout:5000});
    optionalFieldsTest=(await extra.getAttribute('open'))!==null&&(await extra.locator('input[name="referralCode"]').count())===1?'pass':'fail';
  }catch(e){optionalFieldsTest='fail: '+String(e.message).slice(0,150);}
  try{
    await page.locator('#specialRequest').selectOption('true');
    const visible=await page.locator('input[name="specialTime"]').isVisible();
    await page.locator('#specialRequest').selectOption('false');
    const hidden=!(await page.locator('input[name="specialTime"]').isVisible());
    specialTimeTest=visible&&hidden?'pass':'fail';
  }catch(e){specialTimeTest='fail: '+String(e.message).slice(0,150);}
  let timePeriodTest='not-run';
  try{
    await page.locator('#arenaDate').evaluate(input=>{
      const date=new Date();
      date.setUTCDate(date.getUTCDate()+7);
      input.value=date.toISOString().slice(0,10);
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForTimeout(800);
    const periods=page.locator('#fzTimePeriods [data-fz-slot-period]');
    await page.locator('[data-fz-slot-period="evening"]').click({timeout:8000});
    await page.waitForTimeout(800);
    const count=await page.locator('#arenaSlots .arena-slot').count();
    const pressed=await page.locator('[data-fz-slot-period="evening"]').getAttribute('aria-pressed');
    timePeriodTest=(await periods.count())===3&&pressed==='true'&&count>=1&&count<=10?'pass':'fail (slots='+count+', pressed='+pressed+')';
  }catch(e){timePeriodTest='fail: '+String(e.message).slice(0,180);}
  let communityEntryTest='not-run',deepLinkTest='not-run',mobileEntryTest='not-applicable',firstTimerTest='not-run';
  try{
    const hub=page.locator('#fzCommunityGateway');
    await hub.evaluate(el=>el.open=false);
    await page.locator('#discoverCommunity .fz26-discover-primary').click({timeout:6000});
    communityEntryTest=await hub.getAttribute('open')!==null?'pass':'fail';
    await hub.evaluate(el=>el.open=false);
    await page.locator('#discoverCommunity .fz26-discover-shortcuts a[href="#roster"]').click({timeout:6000});
    await page.waitForTimeout(150);
    deepLinkTest=(await hub.getAttribute('open'))!==null&&(await page.locator('#roster').isVisible())?'pass':'fail';
  }catch(e){communityEntryTest='fail: '+String(e.message).slice(0,160);}
  if(target.width<=700){
    try{
      const sticky=page.locator('.fz26-mobile-community');
      const hub=page.locator('#fzCommunityGateway');
      await hub.evaluate(el=>el.open=false);
      await sticky.click({timeout:6000});
      mobileEntryTest=await hub.getAttribute('open')!==null?'pass':'fail';
    }catch(e){mobileEntryTest='fail: '+String(e.message).slice(0,160);}
  }
  try{
    await page.locator('[data-fz26-experience="Quick Skirmish"]').click({timeout:6000});
    firstTimerTest=await page.locator('#arenaDuration').inputValue()==='1'?'pass':'fail';
  }catch(e){firstTimerTest='fail: '+String(e.message).slice(0,160);}
  let routeTest='not-run',menuTest='not-applicable',hubTest='not-run';
  try{
    await page.locator('[data-fz26-experience="Solo Target Practice"]').click({timeout:5000});
    routeTest=await page.locator('#bookingExperience').inputValue()==='Solo Target Practice'&&await page.locator('#arenaDuration').inputValue()==='0.5'?'pass':'fail';
  }catch(e){routeTest='fail: '+String(e.message).slice(0,120);}
  try{
    await page.locator('#fzCommunityGateway').evaluate(el=>{el.open=false;});
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
  try{await page.locator('#calendar').screenshot({path:'visual-qa-artifacts/'+target.name+'-booking.png',timeout:20000,animations:'disabled'});}catch(e){errors.push('booking screenshot: '+String(e.message).slice(0,140));}
  const result={...target,...metrics,horizontalOverflow:metrics.contentWidth>metrics.viewportWidth+2,firstVisitUnblocked,packageTest,optionalFieldsTest,specialTimeTest,timePeriodTest,communityEntryTest,deepLinkTest,mobileEntryTest,firstTimerTest,routeTest,hubTest,menuTest,errors};
  results.push(result);
  console.log('VISUAL_QA '+JSON.stringify(result));
  await page.close();
}
await browser.close();
await fs.writeFile('visual-qa-artifacts/report.json',JSON.stringify(results,null,2));
const failure=results.some(r=>r.horizontalOverflow||r.timePeriodTest!=='pass'||r.communityEntryTest!=='pass'||r.deepLinkTest!=='pass'||r.mobileEntryTest==='fail'||r.firstTimerTest!=='pass'||!r.firstVisitUnblocked||r.packageTest!=='pass'||r.optionalFieldsTest!=='pass'||r.specialTimeTest!=='pass'||!r.cssLoaded||!r.hero||!r.selector||r.quickStartCount!==3||r.communityCount<5||r.routeTest!=='pass'||r.hubTest!=='pass'||r.menuTest==='fail'||r.errors.length);
if(failure){console.error('FIELDZERO visual QA detected layout or browser issues.');process.exit(1);}
console.log('FIELDZERO visual QA passed for desktop, mobile, tablet and narrow mobile.');