const CACHE_NAME = "matrix-docs-cache-v1";
const urlsToCache = [
  "index.html",
  "manifest.json",
  "pdf.js",
  "pdf.worker.min.js",
  "mammoth.browser.min.js",
  "xlsx.full.min.js",
  "jszip.min.js",
  "pptxjs.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
