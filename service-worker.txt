/* Network first for app updates; cache only own static app files, never user documents. */
const CACHE_NAME='matrix-document-viewer-v2-app1';
const CACHE_PREFIX='matrix-document-viewer-';
const CORE=['./','./index.html','./app.css','./app.js','./manifest.json','./pdf.js','./pdf.worker.min.js','./jszip.min.js','./docx-preview.min.js','./mammoth.browser.min.js','./xlsx.full.min.js'];
const OPTIONAL=['./favicon.ico','./favicon-32x32.png','./favicon-16x16.png','./apple-touch-icon.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{const c=await caches.open(CACHE_NAME);await c.addAll(CORE);await Promise.all(OPTIONAL.map(async f=>{try{await c.add(f);}catch(e){console.warn('Optional asset not cached:',f,e);}}));await self.skipWaiting();})());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)));await self.clients.claim();})());
});
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;
 const scope=new URL(self.registration.scope);if(!url.pathname.startsWith(scope.pathname))return;
 const relative='./'+url.pathname.slice(scope.pathname.length);
 const allowed=new Set([...CORE,...OPTIONAL]);if(!allowed.has(relative)&&!req.mode.includes('navigate'))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE_NAME);try{const response=await fetch(req,{cache:'no-store'});if(response.ok&&response.type==='basic'){await cache.put(req,response.clone());if(req.mode==='navigate')await cache.put(new URL('./index.html',scope).href,response.clone());}return response;}catch(err){return await cache.match(req)||(req.mode==='navigate'?await cache.match(new URL('./index.html',scope).href):null)||Response.error();}})());
});
