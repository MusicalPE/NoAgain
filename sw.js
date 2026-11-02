// 주또싫 서비스 워커 — 알림 띄우기·알림 누르면 앱 열기 (파일 저장은 하지 않음)
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
