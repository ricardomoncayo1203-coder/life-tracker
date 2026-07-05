// ============================================================
//  sw.js — offline app shell.
//  Same-origin app files: NETWORK-FIRST (fresh when online, so
//  updates land immediately; cache is the offline fallback).
//  Fonts / supabase-js lib: cache-first.
//  Supabase REST/Auth: never touched — always live.
// ============================================================
const CACHE = "lt-v3";
const SHELL = [
  "./", "./index.html", "./styles.css",
  "./app.js", "./store.js", "./ui.js", "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache Supabase API/auth traffic — always live.
  if (url.hostname.endsWith("supabase.co")) return;

  // Same-origin app shell → network-first with forced revalidation
  // (cache: "no-cache" bypasses stale HTTP-cache copies; SW cache = offline fallback).
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(request, { cache: "no-cache" })
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cross-origin (fonts, cdn lib) → cache-first with background fill.
  e.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        if (res && res.status === 200 && /gstatic|googleapis|jsdelivr/.test(url.hostname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
