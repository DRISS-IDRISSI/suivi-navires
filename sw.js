/* Service worker minimal : le réseau est toujours prioritaire (pas de version périmée),
   le cache ne sert qu'à ouvrir l'application hors connexion. Les appels Supabase ne sont jamais mis en cache. */
const CACHE = 'escales-tc3-v15';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(res => { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)).catch(() => {}); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match('./')))
  );
});
