import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const png=await readFile("social-preview.png");
if(png.subarray(1,4).toString("ascii")!=="PNG"||png.readUInt32BE(16)!==600||png.readUInt32BE(20)!==315)throw Error("Social preview PNG invalid");
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
for(const width of [390,320,1440]){
 const page=await browser.newPage({viewport:{width,height:850}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:8765/staff.html",{waitUntil:"domcontentloaded",timeout:30000});
 await page.waitForTimeout(500);
 if(!(await page.locator("#loginForm").count()))throw Error("Worker login missing at "+width);
 if(!(await page.locator("#workspace").isHidden()))throw Error("Worker workspace visible without login");
 await page.goto("http://127.0.0.1:8765/inventory.html",{waitUntil:"domcontentloaded",timeout:30000});
 if(!(await page.locator("#ownerInventory").isHidden()))throw Error("Owner stock form visible before login");
 const w=await page.evaluate(()=>({vw:innerWidth,scroll:document.documentElement.scrollWidth}));
 if(w.scroll>w.vw+2)throw Error("Inventory horizontal overflow at "+width+"px");
 if(errors.length)throw Error("Page JavaScript errors: "+errors.join(" | "));
 await page.close();
}
await browser.close();
console.log("FIELDZERO staff smoke test passed: 320, 390, 1440px; unauthenticated controls remain hidden; PNG valid");
