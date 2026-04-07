// Pokaždé když změníš soubory, změň toto číslo verze
const CACHE_VERSION = 'homeos-v20';

// Instalace — skipWaiting okamžitě převezme kontrolu
self.addEventListener('install', event => {
  console.log('[SW] Install:', CACHE_VERSION);
  self.skipWaiting();
});

// Aktivace — smaž VŠECHNY staré cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key); // smaž vše, nejen starší verze
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — NETWORK FIRST pro HTML/CSS/JS, cache jen jako fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API — vždy síť
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/login') || url.pathname.startsWith('/logout')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML, CSS, JS — network first, bez cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => {
        // Offline fallback — zkus cache
        return caches.match(event.request);
      })
    );
    return;
  }

  // Externí zdroje (fonty, CDN) — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
