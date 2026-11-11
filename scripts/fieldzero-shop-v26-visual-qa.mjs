import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {chromium} from "playwright";

const base="http://127.0.0.1:8765/shop.html";
await fs.mkdir("shop-v26-artifacts",{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
let problems=[];
async function inspect(view, width,height){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 page.on("pageerror",e=>problems.push(view+": "+e.message));
 await page.goto(base,{waitUntil:"domcontentloaded",timeout:25000});
 await page.locator(".fz26-category-tile").first().waitFor();
 assert.equal(await page.locator(".fz26-category-tile").count(),8,"Must display eight shop categories");
 assert.equal(await page.locator(".fz27-category-media img").count(),8,"Every shop category must have real equipment photography");
 assert.equal(await page.locator(".fz26-cat-art").count(),0,"Remove old flat SVG icon graphics");
 assert.equal(await page.locator(".fz27-real-gear-stage img").count(),1,"Hero must contain real gel blaster photograph");
 assert.equal(await page.locator(".fz27-promo-real-gear img").count(),1,"Promotion must contain real gel blaster photograph");
 const hero=await page.locator(".supply-hero").boundingBox();
 assert.ok(hero&&hero.height>=440,"Flagship shop hero must render at useful size");
 await page.waitForSelector("#fz26PromoScreen:not([hidden])",{timeout:9000});
 await page.screenshot({path:"shop-v26-artifacts/"+view+"-popup.png",fullPage:false});
 await page.locator("#fz26PromoClose").click();
 assert.equal(await page.locator("#fz26PromoScreen").getAttribute("hidden"),"","Promo close button should hide modal");
 await page.screenshot({path:"shop-v26-artifacts/"+view+"-homepage.png",fullPage:true});
 const testTile=page.locator('[data-featured-search="mask"]').first();
 await testTile.click();
 assert.equal(await page.locator("#productSearch").inputValue(),"mask","Mask tile should apply meaningful search");
 assert.ok(await page.locator('#categoryFilters [data-cat="safety"]').evaluate(el=>el.classList.contains("selected")),
  "Safety category should activate existing product filter");
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(dimensions.scroll<=dimensions.width+3,
  view+" horizontal scroll detected: "+JSON.stringify(dimensions));
 await page.close();
}
try{
 await inspect("desktop",1440,900);
 await inspect("mobile",390,844);
 assert.equal(problems.length,0,"Uncaught browser script errors: "+problems.join("; "));
 console.log("FIELDZERO Supply photography browser checks PASSED; 8 real-photo categories, licensed hero, popup and filters, desktop/mobile.");
}finally{
 await browser.close();
}
