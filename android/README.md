# OMNI Agent — Aplikasi Android Unit Lapangan

Aplikasi pendamping TFAEL-OMNI yang dijalankan di HP tiap unit lapangan. Ia melapor
**data nyata** ke pusat komando secara berkala:

- **Posisi GPS** (lat, lon, akurasi, ketinggian, kecepatan)
- **Baterai** perangkat
- **Kekuatan sinyal** seluler (dBm)
- **Serving cell** (radio, mcc, mnc, lac/tac, cid) untuk geolokasi sel

Unit yang tadinya data contoh di peta berubah jadi perangkat betulan yang bergerak.

Ini **agen/beacon ringan**, bukan ATAK penuh (tanpa peta/pesan CoT). Fokusnya satu:
menarik telemetri nyata dari HP ke server.

## Cara kerja

Setiap interval, service latar belakang mengirim `POST` ke:

```
POST {server}/api/v2/telemetry/live-device
Header: X-Agent-Key: <kunci agen>   (wajib; server selalu memeriksanya)
Body  : { unit_id, name, role, lat, lon, alt_m, accuracy_m, speed_kmh,
          battery_pct, is_sos, rssi_dbm, mcc, mnc, cells:[{radio,lac,cid,mcc,mnc,signal}] }
```

Server (`backend/server.py`) sudah punya endpoint ini dan memperbarui peta C4ISR
secara real-time.

> Catatan: field `cells` sudah dikirim, tapi agar menara dipakai untuk **geolokasi
> sel**, endpoint `live-device` di backend perlu ditambah sedikit agar meneruskan
> `cells` ke `geolocate_live_cells()`. Lihat "Tindak lanjut backend" di bawah.

## Mengunduh APK siap pasang

Server TFAEL-OMNI menyajikan APK terbaru pada alamat `/unduh/omni-agent.apk`, misalnya
`https://server-anda.example/unduh/omni-agent.apk`. Halaman login menampilkan
kode QR menuju alamat tersebut, sehingga APK dapat diunduh dengan memindai layar memakai kamera
ponsel. Nomor versi, ukuran, dan nilai SHA-256 berkas tercantum pada `/unduh/versi.json` untuk
memeriksa keutuhan unduhan. Berkasnya berada di `tfael-omni/public/unduh/` dan ikut dipasang
saat server di-deploy.

## Membangun APK

Laptop ini belum punya toolchain Android. Pilih salah satu:

### A. Build di cloud (disarankan — tanpa memasang apa pun)
1. Push repo ini ke GitHub.
2. Buka tab **Actions** → workflow **Build OMNI Agent APK** → **Run workflow**
   (atau otomatis jalan saat ada perubahan di `android/`).
3. Setelah hijau, unduh artifact **omni-agent-v\<versi\>** (misalnya `omni-agent-v3.2.5`), berisi
   berkas APK bernama sama. Nomor versi = isi `android/VERSION` + nomor urut build, dan nomor
   yang sama tampil di aplikasi (menu **Lainnya** dan layar Pengaturan).
4. Pindahkan APK ke HP dan pasang (lihat "Memasang di HP"). Setiap build ditandatangani dengan
   kunci debug yang berbeda, sehingga versi lama perlu dihapus dahulu sebelum memasang yang baru.

Workflow yang sama menjalankan aplikasi di **emulator Android** terhadap server TFAEL-OMNI yang
dinyalakan di mesin CI (`android/ci/e2e.py`): izin, pelaporan posisi, tampilan tim, tanda peta,
mode 3D, dan jeda diuji secara otomatis. Tangkapan layar, struktur tampilan, logcat, dan log
build diterbitkan ke cabang `ci-screenshots`, sehingga hasil setiap build dapat ditinjau tanpa
perangkat fisik. Uji ini tidak menyentuh server demo publik. Perilaku kamera mode 3D dinilai dari
jejak peristiwa halaman peta (`logcat-3d.txt`), dan alasan sistem menghentikan proses aplikasi
dicatat pada `keluar-akhir.txt`.

### B. Android Studio
1. Buka folder `android/` di Android Studio (akan mengunduh SDK/Gradle).
2. **Run** ke HP yang tersambung USB, atau **Build > Build APK(s)**.

### C. Command-line
```bash
cd android
gradle wrapper --gradle-version 8.7   # sekali, untuk membuat ./gradlew
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Memasang di HP

1. Di HP: **Pengaturan > Tentang ponsel** → ketuk **Nomor bentukan** 7x untuk
   membuka **Opsi pengembang**.
2. Aktifkan **USB debugging** (untuk `adb`) atau izinkan **pasang dari sumber tak
   dikenal** (untuk salin APK langsung).
3. `adb install app-debug.apk`, atau salin APK ke HP lalu ketuk untuk memasang.
4. Saat pertama dibuka, **izinkan Lokasi (Selalu izinkan), Telepon, dan Notifikasi**.

## Mengonfigurasi & menjalankan

Aplikasi siap pakai tanpa pengisian formulir:

1. Buka aplikasi. Layar pembuka menjelaskan izin yang diperlukan; ketuk **Izinkan & Mulai**,
   lalu setujui izin Lokasi, Telepon, dan Notifikasi.
2. Alamat server sudah terisi (bawaan: server demo), sehingga pelaporan langsung berjalan.
   Kartu status di bagian atas layar menampilkan keadaannya:
   - **Mengirim** (hijau): laporan diterima server; tampil akurasi, baterai, dan sinyal.
   - **Offline** (kuning): tidak ada koneksi; pengiriman dicoba lagi secara otomatis.
   - **Ditolak server** (merah): kunci agen tidak cocok dengan server.
3. Tombol **Jeda/Mulai** pada kartu status menghentikan atau melanjutkan pengiriman posisi.
   Jeda bersifat menetap, termasuk setelah ponsel dinyalakan ulang.
4. Buka **Peta C4ISR** di layar komando: unit tersebut bergerak dengan posisi nyata.

Tata letak layar utama: kartu status (atas), kontrol peta di sisi kanan (lapisan satelit/peta
jalan, mode 2D/3D, tampilan tim, perbesar, perkecil, posisi saya), dan bilah aksi di bawah
(SOS, Tandai, Ukur, Foto, Lainnya). Menu **Lainnya** memuat PING via SMS, lingkaran radius,
impor rute GPX, unduh peta offline, hapus tanda, dan Pengaturan. Setiap aksi menampilkan pesan
singkat sebagai tanggapan.

### Mode peta 2D dan 3D

Tombol **3D** pada rel kanan mengganti peta datar (osmdroid) dengan tampilan tiga dimensi: citra
satelit di atas medan berelevasi, bangunan 3D, dan kamera miring yang dapat diputar. Posisi
sendiri, unit tim, tanda, lingkaran, rute, dan garis ukur ikut ditampilkan, dan alat Tandai, Ukur,
Foto, SOS, serta zoom tetap berfungsi. Mode 3D memerlukan koneksi internet; peta offline tersedia
pada mode 2D.

Selama ikon **Posisi saya** berwarna hijau, kamera mengikuti posisi sendiri. Menyentuh peta
menghentikan mode ikut sampai tombol tersebut ditekan kembali. Pada mode 3D keputusan itu dipegang
oleh halaman peta sendiri (`omni.follow` diabaikan setelah peta disentuh), sehingga perintah ikut
yang dikirim sesaat sebelum sentuhan tidak menarik peta kembali. Tampilan yang dikirim aplikasi
diterapkan seketika tanpa menunggu peta selesai dimuat, sehingga geseran yang dilakukan selagi
peta memuat tidak hilang.

Ketahanan mode 3D. Mesin WebView mengambil berkas font dari Google Play Services ketika mulai.
Selama pegangan ke penyedia font itu masih ada, Android ikut menutup aplikasi apabila proses Play
Services mati atau diperbarui; hal ini teramati pada uji emulator build 3.2.8 dan 3.2.9 (alasan
sistem: `depends on provider com.google.android.gms/.fonts.provider.FontsProvider in dying proc`).
Aplikasi memicu pembersihan memori beberapa kali sejak WebView dibuat supaya pegangan tersebut
segera lepas; pada uji emulator sambungan itu muncul sekitar satu detik setelah WebView dibuat dan
hilang setelah pembersihan. Apabila proses penggambar WebView sendiri berhenti (misalnya karena
memori perangkat menipis), hanya mode 3D yang ditutup dan tampilan kembali ke peta 2D.

Implementasi: halaman `app/src/main/assets/map3d.html` (MapLibre GL JS) di dalam WebView. Pustaka
dimuat dari CDN dengan pemeriksaan integritas (SRI), aplikasi mengendalikan halaman secara satu
arah (tanpa jembatan JavaScript ke kode native), dan seluruh label ditulis sebagai teks biasa.
Sumber data: citra Esri World Imagery, elevasi Mapzen/AWS Terrain Tiles, bangunan OpenStreetMap
melalui OpenFreeMap.

### Kunci agen

Server selalu memeriksa kunci agen (`OMNI_AGENT_KEY`; bila tidak diset, server membuat kunci
acak setiap kali menyala).

- **Mode demo** (`OMNI_DEMO_HINT=1`): saat laporannya ditolak, aplikasi mengambil kunci secara
  otomatis dari `GET /api/v2/agent/demo-key`, sehingga tidak ada yang perlu diketik.
- **Pemasangan sungguhan** (mode demo mati): endpoint tersebut tidak membagikan kunci.
  Tetapkan `OMNI_AGENT_KEY` di server, lalu isi nilai yang sama pada
  **Lainnya → Pengaturan → Lanjutan**.

Tampilan tim (tombol **Tim**) membaca `GET /api/v2/field/overview` dengan kunci agen pada
header `X-Agent-Key`. Endpoint itu hanya memuat posisi unit, anotasi peta, dan rute aktif;
data pusat komando (target, SIEM, forensik) tidak dapat dibuka dengan kunci agen.

### Mengganti server

Buka **Lainnya → Pengaturan → Lanjutan → Alamat server**, misalnya `http://<IP-LAN-laptop>:8080` untuk
server lokal (ponsel dan laptop harus berada pada jaringan WiFi yang sama).

## Catatan & batasan

- **Lokasi latar belakang**: pilih "Izinkan sepanjang waktu" agar lapor saat layar mati. Izin ini
  juga syarat agar pelaporan menyala sendiri setelah ponsel di-restart; tanpa izin tersebut
  pelaporan baru berjalan lagi ketika aplikasi dibuka. (Android 14 menolak layanan lokasi yang
  dinyalakan dari latar belakang tanpa izin ini, sehingga aplikasi tidak mencobanya.)
  Sebagian HP (Xiaomi/Oppo/Vivo) perlu mematikan optimasi baterai untuk aplikasi ini.
- **Tanpa Google Play Services**: memakai `LocationManager` murni (AOSP), jadi jalan di
  HP polos. Fix GPS pertama bisa butuh beberapa detik di luar ruangan.
- **Serving cell** butuh izin Telepon; di beberapa HP data sel kosong saat mode pesawat
  atau tanpa SIM.
- Build **debug** (belum ditandatangani rilis) — cukup untuk uji lapangan, bukan untuk
  Play Store.

## Tindak lanjut backend (opsional, untuk geolokasi sel)

Agar `cells` yang dikirim HP dipakai menghitung posisi dari menara (bukan hanya GPS),
tambahkan di handler `live-device` server: bila `payload["cells"]` ada, panggil
`geolocate_live_cells(cells=..., attach_unit_id=unit_id)` setelah menyimpan GPS. Ini
membuat jalur geolokasi seluler nyata end-to-end.
