// 또싫 서비스 워커 — 알림 띄우기·알림 누르면 앱 열기 (파일 저장은 하지 않음)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { c.postMessage({ type: "openList" }); return c.focus(); } }
    return self.clients.openWindow(self.registration.scope);
  })());
});

// 늘 새 판 받기: 이 앱의 파일은 휴대폰에 저장된 옛 판 대신 서버에 새 판이 있는지 먼저 확인
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req, { cache: "no-cache" }).catch(() => fetch(req)));
});
