/* 由 src/build.mjs 生成，请勿直接编辑（改模板去 build.mjs）*/
const CACHE = "toolpocket-v3";
const CORE = [
  "/",
  "/zh/",
  "/ja/",
  "/advertise.html",
  "/zh/advertise.html",
  "/ja/advertise.html",
  "/assets/style.css?v=558fbd6b",
  "/assets/app.js?v=dd536e7e",
  "/assets/search.js?v=57c6f6fe",
  "/assets/tools/_shared.js?v=62a587aa",
  "/assets/search.json?v=076cc311",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // HTML：先要网络（保证用户看到最新版），断网时回退缓存
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // 静态资源：先用缓存（快），同时在后台更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
