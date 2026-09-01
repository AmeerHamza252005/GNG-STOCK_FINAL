// StockFlow service worker
// Only job: receive push messages from the backend and show an OS
// notification (with the platform's default sound), even when this app
// isn't open. Also makes foreground notifications (sendSystemNotification
// in index.html) show up more reliably, and is required at all for
// notifications on an installed iOS home-screen app.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'StockFlow', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'StockFlow';
  const options = {
    body: data.body || '',
    icon: data.icon || 'icon-192.png',
    badge: data.badge || 'icon-192.png',
    tag: data.tag || ('stockflow-' + Date.now()),
    vibrate: [120, 60, 120],
    data: { url: data.url || self.registration.scope }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
