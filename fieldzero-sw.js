/* FIELDZERO v28 Service Worker: app shell only, never private Supabase data. */
const SHELL_CACHE="fieldzero-app-shell-v28";
const SHELL_PATHS=[
 "./app.html","./fieldzero-app.css","./fieldzero-app.js",
 "./config.js","./fieldzero-app.webmanifest",
 "./assets/fieldzero-app-icon.svg",
 "./assets/fieldzero-shop-media-v27/category-gel-blasters.webp",
 "./assets/fieldzero-shop-media-v27/category-safety-masks.webp"
];
const SHELL_URLS=new Set(SHELL_PATHS.map(path=>new URL(path,self.registration.scope).pathname));
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL_PATHS.map(path=>new Request(path,{cache:"reload"})))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("fieldzero-app-shell-")&&k!==SHELL_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET"||req.mode==="navigate"&&new URL(req.url).pathname.endsWith("admin.html"))return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin||!SHELL_URLS.has(url.pathname))return;
 // Network-first to pick up new UI/bug fixes; stale cached shell when offline.
 event.respondWith(fetch(req).then(response=>{
  if(response.ok&&response.type==="basic"){
   const copy=response.clone();
   event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.put(req,copy)));
  }
  return response;
 }).catch(()=>caches.match(req).then(cached=>cached||caches.match(new Request(new URL(url.pathname,self.location.origin).href)).then(fallback=>fallback||Response.error()))));
});
