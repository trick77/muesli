// Offline support: cache first for hashed assets, network first for everything else.
/* global self, caches, fetch, URL, location, Request */
// The name carries the game's id: other games may share this origin under their own sub-paths, and their caches
// are theirs (Cache Storage is per origin). Bump the version when a file keeps its name but changes, or when the
// cache keys change (v2: pages keyed without their query string).
const ID = 'muesli';
const CACHE = `${ID}-v2`;

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

/**
 * A fresh page names the current build's assets: cached assets it no longer names are an old release's and go. An
 * asset the page loads only later (none today) is simply fetched again.
 */
async function prune(cache, html) {
  const names = new Set(html.match(/assets\/[\w.-]+/g) ?? []);
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    const i = p.lastIndexOf('assets/');
    if (i >= 0 && !names.has(p.slice(i))) await cache.delete(req);
  }
}

/** Caching is best effort: a full quota or an uncacheable response never turns a good answer into a failure. */
async function store(cache, key, copy) {
  try {
    const page = (copy.headers.get('content-type') ?? '').includes('text/html') ? copy.clone() : null;
    await cache.put(key, copy);
    if (page) await prune(cache, await page.text());
  } catch {
    // not cached this time
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
      let res;
      try {
        res = await fetch(req);
      } catch (err) {
        const hit = await cache.match(key);
        if (hit) return hit;
        throw err;
      }
      // cloned now, before the page reads the body
      if (res.ok && res.status === 200) e.waitUntil(store(cache, key, res.clone()));
      return res;
    }),
  );
});
