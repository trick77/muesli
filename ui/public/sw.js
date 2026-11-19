// Offline support: cache first for hashed assets, network first for everything else.
/* global self, caches, fetch, URL, location, Request */
// The name carries the game's id: other games may share this origin under their own sub-paths, and their caches
// are theirs (Cache Storage is per origin). Bump the version when a file keeps its name but changes.
const ID = 'muesli';
const CACHE = `${ID}-v1`;

self.addEventListener('install', () => self.skipWaiting());
// Drops this game's older caches only.
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(`${ID}-`) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

/** A Vite asset's name without its hash: index-Chi_eKqg.js → index.js. */
const stem = (path) => path.replace(/-[\w-]{8}(\.\w+)$/, '$1');

/** Keeps one build of each asset: a new hashed file replaces the old ones of the same name. */
async function prune(cache, url) {
  const s = stem(url.pathname);
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p !== url.pathname && p.includes('/assets/') && stem(p) === s) await cache.delete(req);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) return;
  // Only Vite's assets/ carry a hash in their name (relative to wherever the game is served).
  const hashed = url.pathname.includes('/assets/');
  // ?seed, ?demo and friends are one page: cached once, under its bare path.
  const key = new Request(url.origin + url.pathname);
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (hashed) {
        const hit = await cache.match(key);
        if (hit) return hit;
      }
      try {
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(key, res.clone());
          if (hashed) await prune(cache, url);
        }
        return res;
      } catch (err) {
        const hit = await cache.match(key);
        if (hit) return hit;
        throw err;
      }
    }),
  );
});
