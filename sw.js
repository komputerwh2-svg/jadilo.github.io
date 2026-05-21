// sw.js - Service Worker JADILO (Revisi v3.6.1)
const CACHE_NAME = 'jadilo-cache-v0.1.7';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// 1. TAHAP INSTALASI: Simpan aset utama ke cache internal menggunakan path relatif ('./')
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Membuka cache dan mendaftarkan aset internal.');
      return cache.addAll(urlsToCache);
    })
  );
  // Langsung aktifkan SW baru tanpa menunggu tab browser ditutup
  self.skipWaiting();
});

// 2. TAHAP AKTIVASI: Hapus sisa cache versi lama agar space penyimpanan bersih
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Membersihkan cache usang -> ' + cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. TAHAP FETCH: Strategi Network First untuk file utama agar data selalu update saat ada sinyal
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 4. LOGIKA NOTIFIKASI SAAT APLIKASI TERTUTUP (PUSH)
self.addEventListener('push', event => {
  let data = { nama: "Sistem", pesan: "Ada pembaruan data baru." };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.pesan = event.data.text();
    }
  }

  const options = {
    body: data.pesan,
    icon: './icon.png',   // Swapped ke file asli yang ada di GitHub Anda
    badge: './icon.png',  // Swapped ke file asli yang ada di GitHub Anda
    vibrate: [100, 50, 100],
    data: { url: './' }
  };

  event.waitUntil(
    self.registration.showNotification(`Pesan dari ${data.nama}`, options)
  );
});

// 5. EVENT DIKLIK: Buka atau fokuskan kembali ke aplikasi saat banner notifikasi diketuk driver
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const targetUrl = event.notification.data.url;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Jika aplikasi sudah terbuka di latar belakang, langsung fokuskan ke tab tersebut
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Jika belum terbuka sama sekali, buka jendela baru
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});