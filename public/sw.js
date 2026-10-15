// Service worker: receives push notifications and opens the app when one is tapped.
// It deliberately does not cache pages, so staff always see the live schedule.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'ENDO Clinic', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'ENDO Clinic Operations', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.location.origin)) { await w.focus(); return w.navigate(url); } }
    return self.clients.openWindow(url);
  })());
});
