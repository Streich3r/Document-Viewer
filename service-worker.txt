/* IVY Docs V3: network-first app shell, offline fallback, no document caching. */
const CACHE_NAME = 'ivy-docs-shell-v3';
const OWN_PREFIXES = ['ivy-docs-shell-', 'matrix-document-viewer-'];
const CORE = [
  './', './index.html', './app.css', './app.js', './manifest.json',
  './pdf.js', './pdf.worker.min.js', './jszip.min.js',
  './docx-preview.min.js', './mammoth.browser.min.js', './xlsx.full.min.js'
];
const OPTIONAL = [
  './favicon.ico', './favicon-16x16.png', './favicon-32x32.png',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];
const ALLOWED = new Set([...CORE, ...OPTIONAL]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE);
    await Promise.all(OPTIONAL.map(async url => {
      try { await cache.add(url); }
      catch (error) { console.warn('Optionales PWA-Asset fehlt:', url, error); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name =>
      name !== CACHE_NAME && OWN_PREFIXES.some(prefix => name.startsWith(prefix))
    ).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const relative = './' + url.pathname.slice(scope.pathname.length);
  const navigation = request.mode === 'navigate';
  if (!ALLOWED.has(relative) && !navigation) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
        if (navigation) await cache.put(new URL('./index.html', scope).href, response.clone());
      }
      return response;
    } catch (error) {
      return await cache.match(request)
        || (navigation ? await cache.match(new URL('./index.html', scope).href) : null)
        || Response.error();
    }
  })());
});
