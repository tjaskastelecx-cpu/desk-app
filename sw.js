/* service worker: cache the app shell. Plan B has no push endpoint. */
const CACHE = "desk-shell-v2";
const SHELL = ["./", "index.html", "app.css", "app.js", "chart.js", "manifest.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes("/d/")) return; // always network for live data
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
