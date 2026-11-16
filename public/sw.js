const CACHE='smartbod-shell-offline-v2';
const SHELL=['/','/offline.html','/pwa.js','/prices.js','/cloud.js','/operations.js','/manifest.webmanifest','/assets/icon-180.png','/assets/icon-192.png','/assets/icon-512.png','/vendor/pdf-lib.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('smartbod-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>{
   if(response.ok&&url.pathname==='/')caches.open(CACHE).then(cache=>cache.put('/',response.clone()));
   return response;
  }).catch(async()=>await caches.match(url.pathname==='/'?'/':'/offline.html')||Response.error()));
  return;
 }
 if(SHELL.includes(url.pathname))event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
