import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {chromium} from "playwright";
const base="http://127.0.0.1:8765";
const manifest=JSON.parse(await fs.readFile("fieldzero-app.webmanifest","utf8"));
assert.equal(manifest.display,"standalone");
assert.equal(manifest.start_url,"./app.html?source=installed");
for(const icon of manifest.icons){
 const file=icon.src.replace(/^\.\//,"");
 const stat=await fs.stat(file);
 assert.ok(stat.size>10000,"Missing or tiny install icon "+file);
}
assert.ok((await fs.readFile("index.html","utf8")).includes('href="app.html#install"'),"Homepage must link to install screen");
const mock=await fs.readFile("scripts/fieldzero-app-v28-mock.js","utf8");
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const problems=[];
await fs.mkdir("app-v28-artifacts",{recursive:true});
async function run(label,width,height,signed){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
 await context.addInitScript(args=>{window.__FZ_SIGNED=args.signed;},{signed});
 const page=await context.newPage();
 page.on("pageerror",e=>problems.push(label+": "+e.message));
 await page.route("**/npm/@supabase/supabase-js@2**",route=>route.fulfill({status:200,contentType:"application/javascript",body:mock}));
 await page.goto(base+"/app.html",{waitUntil:"domcontentloaded"});
 await page.locator(".fz-app-bottomnav button").first().waitFor();
 assert.equal(await page.locator(".fz-app-bottomnav button").count(),5);
 await page.locator(".fz-app-bottomnav [data-nav=book]").click();
 if(signed){
   await page.locator("#appBookingForm:not([hidden])").waitFor();
   await page.selectOption("#appExperience",{label:"Quick Skirmish"});
   await page.fill("#appDate","2027-03-20");
   await page.locator("#appSlots .fz-slot").first().waitFor();
   await page.locator("#appSlots .fz-slot:not([disabled])").first().click();
   await page.fill("#appRealName","Test Operator");
   await page.fill("#appCallsign","TESTER");
   await page.fill("#appMobile","0771234567");
   await page.locator('#appBookingForm [name="consent"]').check();
   await page.locator("#appBookSubmit").click();
   await page.locator("#appBookingSuccess:not([hidden])").waitFor();
   assert.equal(await page.locator("#appBookingReference").textContent(),"FZ-BK-TEST-123");
   assert.ok(await page.evaluate(()=>window.__FZ_CREATED_BOOKING?.p_booking?.booking_start),"Must create via server-owner RPC");
 }else{
   await page.locator("#bookingSignInPrompt:not([hidden])").waitFor();
   assert.ok(await page.locator("#appBookingForm").isHidden());
 }
 await page.locator(".fz-app-bottomnav [data-nav=profile]").click();
 if(signed){
   await page.locator("#profileSignedIn:not([hidden])").waitFor();
   assert.ok((await page.locator("#profileName").textContent()).includes("TESTER"));
 }else{
   await page.locator("#profileSignedOut:not([hidden])").waitFor();
   await page.locator("[data-auth-mode=register]").click();
   assert.ok(await page.locator("#appRegisterForm").isVisible());
 }
 await page.locator(".fz-app-bottomnav [data-nav=squads]").click();
 await page.locator("#squadList .fz-squad-card").first().waitFor();
 assert.ok((await page.locator("#squadList").textContent()).includes("Alpha Squad"));
 await page.locator("#appInstallHead").click();
 assert.ok(await page.locator('[data-screen="install"]').isVisible());
 await page.screenshot({path:"app-v28-artifacts/"+label+".png",fullPage:true});
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(dimensions.scroll<=dimensions.width+3,"Horizontal overflow in "+label+": "+JSON.stringify(dimensions));
 await context.close();
}
try{
 await run("desktop-signed-out",1400,900,false);
 await run("mobile-signed-out",390,844,false);
 await run("mobile-signed-in",390,844,true);
 assert.equal(problems.length,0,"Uncaught errors: "+problems.join("; "));
 console.log("FIELDZERO CUSTOMER APP V28: PASS — UI, auth states, booking, squads, install and mobile layouts");
}finally{await browser.close();}
