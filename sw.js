// sw.js - Service Worker JADILO
const CACHE_NAME = 'jadilo-cache-v1.3';
const urlsToCache = [
  '/',
  '/index.html',
  // Tambahkan file CSS/JS utama Anda di sini
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// LOGIKA NOTIFIKASI SAAT APLIKASI TERTUTUP
self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
    body: data.pesan,
    icon: 'icon-chat.png', // Ganti dengan path ikon Anda
    badge: 'icon-badge.png',
    vibrate: [100, 50, 100],
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(`Pesan dari ${data.nama}`, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});