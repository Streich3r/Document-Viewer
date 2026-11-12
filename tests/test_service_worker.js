/* Test the actual service worker script in an isolated Node VM with mocked caches/network. */
'use strict';
const fs=require('fs'), vm=require('vm'),path=require('path');
const text=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
const base='https://example.test/Document-Viewer/';
const events={}; const all=new Map();let online=true;let requests=[];let updatedHtml='<html>New V2</html>';
const abs=p=>new URL(typeof p==='string'?p:p.url,base).href;
const cacheFactory=name=>({
 async addAll(arr){for(const a of arr)await this.add(a);},
 async add(p){const res=await fakeFetch({url:abs(p),method:'GET'}); if(!res.ok)throw Error('cache.add failed');await this.put(p,res);},
 async put(req,response){all.get(name).set(abs(req),response.clone());},
 async match(req){return all.get(name).get(abs(req))?.clone();}
});
const caches={
 async open(name){if(!all.has(name))all.set(name,new Map());return cacheFactory(name);},
 async keys(){return [...all.keys()];},
 async delete(k){return all.delete(k);}
};
async function fakeFetch(req){requests.push(abs(req));if(!online)throw Error('offline');return new Response(abs(req).endsWith('index.html')?updatedHtml:'static asset',{status:200,headers:{'Content-Type':'text/plain'}});}
const self={location:{origin:'https://example.test'},registration:{scope:base},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(name,fn)=>{events[name]=fn}};
vm.runInNewContext(text,{self,caches,fetch:fakeFetch,URL,Response,Promise,console,Set});
async function runLifecycle(name){let task;events[name]({waitUntil(p){task=p;}});await task;}
async function runFetch(url,mode='same-origin',method='GET'){
 let responsePromise=null;events.fetch({request:{url,mode,method},respondWith(r){responsePromise=r;}});return responsePromise?await responsePromise:null;
}
function ok(assert,label){if(!assert)throw Error('FAIL '+label);console.log('PASS '+label);}
(async()=>{
 await caches.open('calendar-cache-v1');await caches.open('matrix-document-viewer-old');
 await runLifecycle('install');await runLifecycle('activate');
 const names=await caches.keys();ok(names.includes('matrix-document-viewer-v2-app1'),'Core cache installed');
 ok(!names.includes('matrix-document-viewer-old'),'Old viewer cache removed');
 ok(names.includes('calendar-cache-v1'),'Unrelated app cache preserved');
 let cache=await caches.open('matrix-document-viewer-v2-app1');ok(Boolean(await cache.match('./pdf.worker.min.js')),'PDF worker offline cached');
 ok(Boolean(await cache.match('./docx-preview.min.js')),'DOCX library offline cached');
 let response=await runFetch(base+'index.html','navigate');ok((await response.text())===updatedHtml,'Network-first HTML returns fresh response');
 online=false;response=await runFetch(base+'index.html','navigate');ok((await response.text())===updatedHtml,'Offline HTML cache fallback works');
 response=await runFetch(base+'pdf.worker.min.js');ok(Boolean(response),'Offline library fallback works');
 response=await runFetch('https://other.test/track.js');ok(response===null,'Third-party requests not intercepted');
 response=await runFetch('https://example.test/private/uploaded-document.docx');ok(response===null,'Private documents not cached/intercepted');
 response=await runFetch(base+'docs/private.pdf');ok(response===null,'Unknown same-scope document not intercepted');
 response=await runFetch(base+'index.html','navigate','POST');ok(response===null,'Non-GET requests not intercepted');
 console.log('PASS 12/12 Service Worker checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
