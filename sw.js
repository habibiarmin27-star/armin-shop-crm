// sw.js — Service Worker
//
// Strategy: NETWORK-FIRST for everything on our own site. This is
// deliberate — this project has had repeated pain from stale cached files
// after deployments, so this service worker is designed to NEVER show an
// old cached page/script while the user is online. It only ever falls back
// to the cache (or the offline page) when there is truly no network
// connection. Firebase/Google requests are never touched — they always go
// straight to the network.

const CACHE_VERSION = "al-hudu-crm-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "dashboard.html",
  "customer.html",
  "scan.html",
  "reports.html",
  "reminders.html",
  "staff.html",
  "history.html",
  "offline.html",
  "style.css",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests to our own site — everything else (Firebase,
  // Google APIs, POST requests, etc.) is left completely untouched.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const offline = await caches.match("offline.html");
          if (offline) return offline;
        }
        return Response.error();
      })
  );
});
