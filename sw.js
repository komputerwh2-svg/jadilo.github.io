// sw.js - Service Worker JADILO (Revisi v3.6.1 - Background Live Broadcast Sync)
const CACHE_NAME = 'jadilo-cache-v0.1.7';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// --------------------------------------------------------------------
// INTEGRASI INITIALIZATION FIREBASE DI BACKGROUND (SERVICE WORKER)
// --------------------------------------------------------------------
// Mengimpor Firebase Compat SDK khusus lingkungan Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js');

// Menggunakan konfigurasi resmi Firebase asli milik proyek Anda
const firebaseConfig = {
  apiKey: "AIzaSyDbkKZHb3j4_SGTWjkfShjZKXbCv-QRy3s",
  authDomain: "chat-logistik-wh.firebaseapp.com",
  databaseURL: "https://chat-logistik-wh-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-logistik-wh",
  storageBucket: "chat-logistik-wh.firebasestorage.app",
  messagingSenderId: "424291622772",
  appId: "1:424291622772:web:e7c2c3cfbbe27260621621"
};

// Inisialisasi Firebase secara mandiri di Service Worker
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// Flag bantuan pengaman agar data pertama saat SW aktif tidak dianggap sebagai update (anti-spam)
let dataAwalSelesaiLoadedSW = false;
database.ref('master_jadwal').once('value').then(() => {
  dataAwalSelesaiLoadedSW = true;
  console.log("🔊 SW Background Broadcast: Pemantau Database Aktif di Latar Belakang.");
});

// Mulai dengarkan database real-time di background menggunakan .on('value')
database.ref('master_jadwal').on('value', async (snapshot) => {
  if (!dataAwalSelesaiLoadedSW) return;

  const rootData = snapshot.val();
  if (!rootData) return;

  // Tarik semua data driver dari seluruh hari
  let gabunganSemuaHari = [];
  Object.keys(rootData).forEach(keyHari => {
    if (rootData[keyHari] && rootData[keyHari].list) {
      const listHariIni = Array.isArray(rootData[keyHari].list)
        ? rootData[keyHari].list
        : Object.values(rootData[keyHari].list);
      gabunganSemuaHari = gabunganSemuaHari.concat(listHariIni);
    }
  });

  // Iterasi data untuk mengecek perubahan state lewat IndexedDB
  for (const driverData of gabunganSemuaHari) {
    if (!driverData || !driverData.id) continue;

    const id = driverData.id;
    const statusBaru = driverData.status || 'BELUM';
    const wh1Baru = parseInt(driverData.wh1 || 0);
    const wh2Baru = parseInt(driverData.wh2 || 0);

    const namaDriver = driverData.driver || driverData.Driver || "Driver";
    const namaEkspedisi = driverData.ekspedisi || driverData.Ekspedisi || "-";
    const namaTujuan = driverData.kota || driverData.Kota || "-";

    try {
      // Ambil data cache state sebelumnya dari IndexedDB
      const dataLama = await dapatkanStateLokalDB(id);

      if (dataLama) {
        const skrg = new Date();
        const jamUpdate = String(skrg.getHours()).padStart(2, '0') + ':' + String(skrg.getMinutes()).padStart(2, '0');

        // 1. Pemicu Notifikasi Status Armada (DATANG / PENDING)
        if (dataLama.status !== statusBaru) {
          if (statusBaru === 'PENDING' || statusBaru === 'DATANG') {
            pemicuNotifikasiSistem(`STATUS ARMADA: ${statusBaru}`, `🚚 ${namaDriver} (${namaEkspedisi}) tujuan ${namaTujuan} status ${statusBaru} jam ${jamUpdate}`, 'logistik-update');
          }
        }

        // 2. Pemicu Notifikasi Selesai Muat WH-1
        if (dataLama.wh1 !== wh1Baru && wh1Baru > 0 && wh1Baru > dataLama.wh1) {
          pemicuNotifikasiSistem(`WH-1 SELESAI MUAT`, `📦 ${namaDriver} (${namaEkspedisi}) ${namaTujuan} selesai dimuat di WH-1 sebanyak ${wh1Baru} Karton jam ${jamUpdate}`, 'logistik-update');
        }

        // 3. Pemicu Notifikasi Selesai Muat WH-2
        if (dataLama.wh2 !== wh2Baru && wh2Baru > 0 && wh2Baru > dataLama.wh2) {
          pemicuNotifikasiSistem(`WH-2 SELESAI MUAT`, `📦 ${namaDriver} (${namaEkspedisi}) ${namaTujuan} selesai dimuat di WH-2 sebanyak ${wh2Baru} Karton jam ${jamUpdate}`, 'logistik-update');
        }
      }

      // Selalu simpan/perbarui kondisi terbaru ke IndexedDB
      await simpanStateLokalDB(id, statusBaru, wh1Baru, wh2Baru);
    } catch (err) {
      console.error("SW: Gagal memproses data perubahan IndexedDB", err);
    }
  }
});

// Fungsi pembantu eksekusi showNotification internal Service Worker
function pemicuNotifikasiSistem(title, bodyText, tagKategori) {
  self.registration.showNotification(`[JDL INFO] ${title}`, {
    body: bodyText,
    icon: './icon.png',
    badge: './icon.png',
    vibrate: [100, 50, 100],
    tag: tagKategori,
    renotify: true,
    data: { url: './' }
  });
}

// --------------------------------------------------------------------
// LOGIK MEKANISME AKSES INDEXEDDB (PENGGANTI STORAGE PADA SERVICE WORKER)
// --------------------------------------------------------------------
function bukaIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('jadilo_bg_notif_db', 1);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('driver_states')) {
        db.createObjectStore('driver_states', { keyPath: 'id' });
      }
    };
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

async function dapatkanStateLokalDB(id) {
  const db = await bukaIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('driver_states', 'readonly');
    const store = transaction.objectStore('driver_states');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function simpanStateLokalDB(id, status, wh1, wh2) {
  const db = await bukaIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('driver_states', 'readwrite');
    const store = transaction.objectStore('driver_states');
    const request = store.put({ id, status, wh1, wh2 });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

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

// 4. LOGIKA PUSH NOTIFICATION (OPSIONAL JIKA MENGGUNAKAN SERVER FCM EKSTERNAL)
self.addEventListener('push', event => {
  let data = { nama: "Sistem", pesan: "Ada pembaruan data baru." };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.pesan = event.data.text(); }
  }
  pemicuNotifikasiSistem(data.nama, data.pesan, 'pesan-baru');
});

// 5. EVENT DIKLIK: Buka atau fokuskan kembali ke aplikasi saat banner notifikasi diketuk driver
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = './';
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
