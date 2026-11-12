/* FIELDZERO app temporarily unpublished. Clear previous installable app shell cache. */
const APP_CACHE_PREFIX="fieldzero-app-shell-";
self.addEventListener("install", event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(APP_CACHE_PREFIX)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith("/app.html")){
    event.respondWith(fetch(new Request(event.request,{cache:"no-store"})).catch(()=>new Response(
      "<!doctype html><html><meta name='viewport' content='width=device-width, initial-scale=1'><title>FIELDZERO App Unavailable</title><body style='font-family:sans-serif;padding:3rem;background:#08120d;color:white'><h1>FIELDZERO App coming soon</h1><p>Visit the FIELDZERO website for bookings.</p><a style='color:#badb92' href='./'>Go to website</a></body></html>",
      {headers:{"Content-Type":"text/html;charset=UTF-8"}}
    )));
  }
});
