// TFAEL-OMNI — service worker minimal.
// Tujuannya hanya agar aplikasi dapat dipasang ke layar utama (Android/Chrome).
// Sengaja TIDAK menyimpan cache: setiap permintaan diteruskan ke jaringan apa adanya,
// sehingga data dan versi aplikasi selalu yang terbaru dari server.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* diteruskan ke jaringan oleh peramban */ });
