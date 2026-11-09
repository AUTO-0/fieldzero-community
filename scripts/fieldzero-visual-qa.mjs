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
  await page.waitForTimeout(3500);
  const openingModal=page.locator('#fzOpeningCountdown');
  const openingPopupVisible=await openingModal.isVisible();
  const countdownDays=Number(await page.locator('#fzCountdownDays').textContent());
  if(openingPopupVisible){
    await openingModal.screenshot({path:'visual-qa-artifacts/'+target.name+'-opening-popup.png',animations:'disabled'});
    await page.locator('#fzCountdownClose').click();
  }
  const countdownOkay=openingPopupVisible&&Number.isInteger(countdownDays)&&countdownDays>0&&!(await openingModal.isVisible());
  const metrics=await page.evaluate(()=>{
    const box=(s)=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}:null;};
    const root=document.documentElement,body=document.body;
    return {viewportWidth:innerWidth,contentWidth:Math.max(root.scrollWidth,body.scrollWidth),hero:box('#home'),heroTitle:box('#fz26HeroTitle'),selector:box('.fz26-route-panel'),book:box('#calendar'),quickStartCount:document.querySelectorAll('[data-fz26-experience]').length,cssLoaded:[...document.styleSheets].some(s=>s.href?.includes('experience-2026.css')),sections:['packages','calendar','how-it-works','gallery','fzCommunityGateway'].map(id=>({id,found:!!document.getElementById(id)})),communityCount:document.querySelectorAll('#fzCommunityContent>section').length};
  });
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';window.scrollTo(0,0);});
  await page.waitForTimeout(300);
  await page.screenshot({path:'visual-qa-artifacts/'+target.name+'-top.png',animations:'disabled'});
  await page.locator('#home').screenshot({path:'visual-qa-artifacts/'+target.name+'-hero.png',animations:'disabled'});
  await page.locator('#discoverCommunity').screenshot({path:'visual-qa-artifacts/'+target.name+'-community-entry.png',animations:'disabled'});
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
  const discoveryLayout=await page.locator('#discoverCommunity').evaluate(section=>{
    const entry=section.querySelector('.fz26-discover-primary');
    const r=section.getBoundingClientRect(), b=entry?.getBoundingClientRect();
    return !!b&&b.width>=180&&b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1;
  });
  const publicLaunchDate=await page.locator('#arenaDate').getAttribute('min');
  const launchNoticeReady=await page.locator('#fzPrelaunchInfo [data-fz-launch-date]').count()===1;
  const launchDateValid=Boolean(publicLaunchDate&&publicLaunchDate>='2026-12-10');
  let timePeriodTest='not-run';
  try{
    await page.locator('#bookingExperience').selectOption('Quick Skirmish');
    await page.locator('#arenaDate').evaluate(input=>{
      const date=new Date((input.min||'2026-12-10')+'T12:00:00Z');
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
  await page.locator('#fzCommunityGateway>summary').screenshot({path:'visual-qa-artifacts/'+target.name+'-community-hub.png',animations:'disabled'});
  if(target.width<=970) {
    try{
      await page.locator('#menuToggle').click({timeout:5000});
      menuTest=await page.locator('#menuToggle').getAttribute('aria-expanded')==='true'?'pass':'fail';
      await page.locator('#menuToggle').click();
    }catch(e){menuTest='fail: '+String(e.message).slice(0,120);}
  }
  try{await page.locator('#calendar').screenshot({path:'visual-qa-artifacts/'+target.name+'-booking.png',timeout:20000,animations:'disabled'});}catch(e){errors.push('booking screenshot: '+String(e.message).slice(0,140));}
  const result={...target,...metrics,horizontalOverflow:metrics.contentWidth>metrics.viewportWidth+2,countdownOkay,openingPopupVisible,countdownDays,discoveryLayout,launchDateValid,launchNoticeReady,publicLaunchDate,firstVisitUnblocked,packageTest,optionalFieldsTest,specialTimeTest,timePeriodTest,communityEntryTest,deepLinkTest,mobileEntryTest,firstTimerTest,routeTest,hubTest,menuTest,errors};
  results.push(result);
  console.log('VISUAL_QA '+JSON.stringify(result));
  await page.close();
  // Visual-only administrator layout audit: no credentials or database writes.
  // Unhide the protected dashboard locally in the test browser only to inspect the form geometry.
  const adminPage=await browser.newPage({viewport:{width:target.width,height:target.height},deviceScaleFactor:1,isMobile:target.name.includes('mobile'),hasTouch:target.name.includes('mobile')});
  // Visual snapshot only. Suppress background auth callbacks which re-hide the dashboard while photographing it.
  await adminPage.route('**/*admin.js*',route=>route.abort());
  await adminPage.goto('http://127.0.0.1:8765/admin.html',{waitUntil:'domcontentloaded',timeout:30000});
  await adminPage.waitForTimeout(500);
  await adminPage.evaluate(()=>{
    const login=document.querySelector('#loginPanel'),dash=document.querySelector('#dashboard');
    if(login){login.hidden=true;login.style.display='none';}
    if(dash){dash.hidden=false;dash.removeAttribute('hidden');dash.style.setProperty('display','block','important');dash.style.setProperty('visibility','visible','important');}
    const form=document.querySelector('#fzMainFieldForm');
    if(form){
      form.elements.namedItem('name').value='Imbulgoda Field';
      form.elements.namedItem('address').value='Imbulgoda, Gampaha, Sri Lanka';
      form.elements.namedItem('google_maps_url').value='https://www.google.com/maps/search/?api=1&query=Imbulgoda';
    }
  });
  const adminMetrics=await adminPage.locator('#fzMainFieldControl').evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {visible:r.width>0&&r.height>0,width:r.width,withinViewport:r.left>=-1&&r.right<=innerWidth+1,hasLocationInput:!!el.querySelector('[name="google_maps_url"]'),hasLaunchInput:!!el.querySelector('#fzLaunchQuickForm [name="launch_date"]')};
  });
  const adminView=await adminPage.evaluate(()=>{
    const p=document.querySelector('#fzMainFieldControl'),d=document.querySelector('#dashboard');
    const ancestors=[];for(let n=p;n&&ancestors.length<8;n=n.parentElement){let r=n.getBoundingClientRect();ancestors.push({tag:n.tagName,id:n.id,cl:n.className,hidden:n.hidden,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,width:r.width,height:r.height});}
    return {panelDisplay:p?getComputedStyle(p).display:'missing',dashboardDisplay:d?getComputedStyle(d).display:'missing',dashboardHidden:d?.hidden,panelRect:p?.getBoundingClientRect().toJSON(),ancestors};
  });
  console.log('ADMIN_VISUAL_DIAGNOSTIC '+JSON.stringify({name:target.name,...adminView}));
  if(adminMetrics.visible){
    await adminPage.locator('#fzMainFieldControl').screenshot({path:'visual-qa-artifacts/'+target.name+'-admin-field-control.png',animations:'disabled',timeout:12000});
  }
  const modesLayout=await adminPage.locator('#fzGameModeManager').evaluate(el=>{
    const box=el.getBoundingClientRect();
    return box.width>0&&box.height>0&&box.left>=-1&&box.right<=innerWidth+1;
  });
  if(modesLayout) await adminPage.locator('#fzGameModeManager').screenshot({path:'visual-qa-artifacts/'+target.name+'-admin-game-modes.png',animations:'disabled',timeout:12000});
  if(!modesLayout||!adminMetrics.visible||!adminMetrics.withinViewport||!adminMetrics.hasLocationInput||!adminMetrics.hasLaunchInput){
    console.error('ADMIN_UI_FAILURE '+JSON.stringify({target:target.name,...adminMetrics}));
    process.exitCode=1;
  }
  console.log('ADMIN_VISUAL_QA '+JSON.stringify({name:target.name,...adminMetrics}));
  await adminPage.close();
}
await browser.close();
await fs.writeFile('visual-qa-artifacts/report.json',JSON.stringify(results,null,2));
const failure=results.some(r=>r.horizontalOverflow||!r.countdownOkay||!r.launchDateValid||!r.launchNoticeReady||!r.discoveryLayout||r.timePeriodTest!=='pass'||r.communityEntryTest!=='pass'||r.deepLinkTest!=='pass'||r.mobileEntryTest==='fail'||r.firstTimerTest!=='pass'||!r.firstVisitUnblocked||r.packageTest!=='pass'||r.optionalFieldsTest!=='pass'||r.specialTimeTest!=='pass'||!r.cssLoaded||!r.hero||!r.selector||r.quickStartCount!==3||r.communityCount<5||r.routeTest!=='pass'||r.hubTest!=='pass'||r.menuTest==='fail'||r.errors.length);
if(failure){console.error('FIELDZERO visual QA detected layout or browser issues.');process.exit(1);}
console.log('FIELDZERO visual QA passed for desktop, mobile, tablet and narrow mobile.');