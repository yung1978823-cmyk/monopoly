// 大富翁 service worker: keeps the app shell and art so the board opens without a network.
const CACHE = "dafuweng-v12";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/art/board-28-cut.png",
  "/art/board-scene.jpg",
  "/art/title.jpg",
  "/art/logo.webp",
  "/art/avatars/vampire.jpg",
  "/art/avatars/jiangshi.jpg",
  "/art/avatars/mummy.jpg",
  "/art/avatars/zombie.jpg",
  "/art/city-jiangshi.jpg",
  "/art/city-mummy.jpg",
  "/art/city-zombie.jpg",
  "/art/shield-block.jpg",
  "/art/tiles/start.png",
  "/art/tiles/coin.png",
  "/art/tiles/chest.png",
  "/art/tiles/lucky.png",
  "/art/tiles/attack.png",
  "/art/tiles/jail.png",
  "/art/tiles/tax.png",
  "/art/fx/sparkle.png",
  "/art/fx/smash.png",
  "/art/crane.png",
  "/art/buildings/1.png",
  "/art/buildings/2.png",
  "/art/buildings/3.png",
  "/art/buildings/4.png",
  "/art/buildings/5.png",
  "/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: try the network first so updates land, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Build output and art never change under the same name: serve from cache, fill on first use.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/art/") || url.pathname.startsWith("/icon")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
