import fs from "node:fs";
import assert from "node:assert/strict";
const files=[
 "staff.html","staff.js","staff-visit-v25.js","staff-visit-v25.css",
 "inventory.html","stats.html","stats-v25.js","stats-v25.css",
 "shop.html","shop-v25.js","supply-v25.css","shop-admin.html","shop-admin-v25.js",
 "partners.html","partners-v25.js","partners-v25.css","index.html","editorial-v25.css"
];
for(const f of files)assert.ok(fs.existsSync(f),"Missing release file: "+f);
const read=f=>fs.readFileSync(f,"utf8");
const needs=[
 ["staff.html",["bookingSearch","staff-visit-v25.js","shop-admin"]],
 ["staff-visit-v25.js",["fz_staff_checkin_bundle","fz_staff_finish_visit","fz_staff_finalize_bill","fz_staff_record_payment","visitMarkPaid","navigator.share"]],
 ["staff.js",["fz_staff_search_bookings","bookingSearch"]],
 ["shop.html",["productOverlay","cartOverlay","shopRequestForm","supply-v25.css"]],
 ["shop-v25.js",["fz_submit_shop_order","fz_shop_products","published"]],
 ["shop-admin-v25.js",["fz_owner_upsert_shop_product","fz_owner_review_shop_order","fz-shop-images"]],
 ["partners-v25.js",["fz_partner_leads"]],
 ["stats-v25.js",["fz_inventory_issues","fz_game_sessions","fz_inventory_forecast"]],
 ["index.html",["shop.html","partners.html","editorial-v25.css"]],
 ["admin.html",["shop-admin.html","stats.html"]]
];
for(const [file,terms] of needs)for(const term of terms)assert.ok(read(file).includes(term),file+" is missing "+term);
const publicPages=["shop.html","partners.html","index.html"];
for(const f of publicPages)assert.ok(read(f).includes('name="viewport"')||read(f).includes('name="viewport"'),f+" missing mobile viewport");
assert.ok(read("shop.html").includes('RECREATIONAL GEL BLASTER EQUIPMENT'),"Shop needs toy-sport scope");
const admin=read("shop-admin.html");
assert.ok(admin.includes('id="shopAdminWorkspace" hidden'),"Owner controls must not render before auth");
assert.ok(read("staff.html").includes('id="workspace" hidden'),"Worker controls must not render before auth");
assert.ok(read("inventory.html").includes('id="inventoryWorkspace" hidden'),"Inventory controls must not render before auth");
console.log("FIELDZERO V25 release checks PASSED ("+files.length+" files and "+needs.length+" integration checks).");
