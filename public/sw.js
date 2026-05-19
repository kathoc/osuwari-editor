// 最小 Service Worker
// CACHE 名を更新すると、activate で旧キャッシュが一掃される。
// バンドル変更（特に削除した依存が残るような変更）後はここを上げてください。
const CACHE = "osuwari-shell-v8";
// インストール時にプリキャッシュするのは静的アセットのみ。
// "/" を入れると古い index.html を保持して新しい hash 付き JS を引けず白画面になるため除外。
const SHELL = ["/icon/icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // API はネット優先で素通し（オフライン時は localStorage フォールバックがある）
  if (url.pathname.startsWith("/api/")) return;
  // ナビゲーション: ネット優先、失敗時のみキャッシュにフォールバック
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((r) => r || new Response("offline", { status: 503 }))
      )
    );
    return;
  }
  // ハッシュ無し HTML / マニフェスト: 常にネット優先（古い参照を残さない）
  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || new Response("offline", { status: 503 }))));
    return;
  }
  // それ以外: キャッシュ優先 → ネット → エラー
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req)
        .then((resp) => {
          if (resp.ok && resp.type === "basic") {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached || new Response("offline", { status: 503 }))
    )
  );
});
