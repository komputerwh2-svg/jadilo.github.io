// sw.js - Service Worker JADILO (Revisi v3.6.1 - Pure Web Push Receiver)
const CACHE_NAME = 'jadilo-cache-v0.1.7';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// ====================================================================
// LOGIKA PUSH NOTIFICATION: MEMBANGUNKAN SW SAAT APLIKASI MATI TOTAL
// ====================================================================
self.addEventListener('push', event => {
  // Payload default jika data yang dikirim dari server kosong
  let dataNotif = { 
    title: "Update JADILO Logistik", 
    body: "Ada pembaruan status armada atau muatan baru.",
    tag: "logistik-update"
  };

  if (event.data) {
    try {
      // Jika server mengirimkan data berupa objek JSON terstruktur
      dataNotif = event.data.json();
    } catch (e) {
      // Jika server hanya mengirimkan teks biasa
      dataNotif.body = event.data.text();
    }
  }

  // Konfigurasi visual banner pop-up notifikasi luar sistem operasi
  const options = {
    body: dataNotif.body || dataNotif.message,
    icon: './icon.png',
    badge: './icon.png',
    vibrate: [100, 50, 100],
    tag: dataNotif.tag || 'logistik-update', // Memisahkan tag agar tidak saling menimpa
    renotify: true,
    data: { 
      url: dataNotif.url || './' 
    }
  };

  // Paksa sistem operasi untuk memunculkan banner pop-up saat ini juga
  event.waitUntil(
    self.registration.showNotification(dataNotif.title, options)
  );
});

// ====================================================================
// LIFECYCLE SERVICE WORKER STANDARD (INSTALL, ACTIVATE, FETCH, CLICK)
// ====================================================================

// 1. TAHAP INSTALASI: Simpan aset utama ke cache internal menggunakan path relatif ('./')
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Membuka cache dan mendaftarkan aset internal.');
      return cache.addAll(urlsToCache);
    })
  );
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

// 4. EVENT DIKLIK: Buka atau fokuskan kembali ke aplikasi saat banner notifikasi diketuk user
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data.url || './';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
