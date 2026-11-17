// Only a public offline help page is cached. No inventory, credentials, API,
// tickets, images from API, or business data are stored by this worker.
const CACHE='smartbod-public-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html'))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('smartbod-public-offline-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.mode!=='navigate')return;
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 event.respondWith(fetch(event.request).catch(async()=>await caches.match('/offline.html')||Response.error()));
});
