# Panduan Penggunaan TFAEL-OMNI

**Bahasa Indonesia** | [English](USER_GUIDE.md)

Panduan ini menjelaskan cara memakai TFAEL-OMNI setelah server berjalan. Langkah pemasangan ada di [README](../README.md#instalasi). Nama tombol dan tab ditulis persis seperti yang tampil di layar.

## Daftar Isi

1. [Masuk dan mengenal layar](#1-masuk-dan-mengenal-layar)
2. [SITREP: gambaran situasi](#2-sitrep-gambaran-situasi)
3. [C4ISR: peta taktis dan unit lapangan](#3-c4isr-peta-taktis-dan-unit-lapangan)
4. [OSINT Profiler: penelusuran sumber terbuka](#4-osint-profiler-penelusuran-sumber-terbuka)
5. [SIEM: pemantauan keamanan siber](#5-siem-pemantauan-keamanan-siber)
6. [DFIR: forensik digital](#6-dfir-forensik-digital)
7. [Intel Graph: jaringan keterkaitan](#7-intel-graph-jaringan-keterkaitan)
8. [BotRadar: pemantauan media sosial](#8-botradar-pemantauan-media-sosial)
9. [Admin: pengguna, peran, dan jejak audit](#9-admin-pengguna-peran-dan-jejak-audit)
10. [Aplikasi agen Android](#10-aplikasi-agen-android)
11. [Masalah yang sering muncul](#11-masalah-yang-sering-muncul)

## 1. Masuk dan mengenal layar

1. Buka alamat server di peramban, misalnya `http://localhost:8080`.
2. Isi **Callsign** dan **Access Code**, lalu tekan **AUTHENTICATE**. Akun bawaan dijelaskan di [README](../README.md#login-pertama).
3. Animasi pembuka akan diputar. Tekan **Lewati** untuk langsung masuk.

Setelah masuk, bilah atas menampilkan delapan ruang kerja:

| Ruang kerja | Kegunaan |
|---|---|
| **SITREP** | Gambaran situasi dari berita, gempa, dan peringatan cuaca |
| **C4ISR** | Peta taktis dan unit lapangan |
| **OSINT Profiler** | Penelusuran indikator dari sumber terbuka |
| **SIEM** | Antrean alert keamanan siber |
| **DFIR** | Barang bukti digital dan chain of custody |
| **Intel Graph** | Jaringan keterkaitan antarentitas |
| **BotRadar** | Pemantauan media sosial dan deteksi akun terkoordinasi |
| **Admin** | Pengguna, peran, dan jejak audit |

Di sisi kanan bilah atas terdapat jam UTC, jumlah unit, nama dan peran akun, serta tombol **Logout**. Ruang kerja yang tampil bergantung pada peran akun. Sebagai contoh, **Admin** hanya tampil untuk peran yang berhak mengelola pengguna. Di ponsel, daftar ruang kerja berada di bagian bawah layar.

Data bawaan yang bertanda `[CONTOH]` atau `(contoh)` adalah data fiktif untuk peragaan.

## 2. SITREP: gambaran situasi

SITREP mengumpulkan berita daring dari media nasional, gempa bermagnitudo 5 ke atas dari BMKG, dan peringatan dini cuaca BMKG, lalu menampilkannya pada peta Indonesia. Ruang kerja ini memerlukan sambungan internet.

1. Pilih rentang waktu dengan **24 jam**, **7 hari**, atau **Semua**.
2. Nyalakan atau matikan jenis laporan dengan tombol **Insiden**, **Gempa M ≥ 5**, **Berita lain**, **Peringatan cuaca**, dan **CCTV**. Angka di tiap tombol menunjukkan jumlah laporannya.
3. Lihat sebarannya pada peta. Lingkaran menandai gempa dan ukurannya mengikuti magnitudo. Segitiga menandai wilayah dengan peringatan cuaca. Perbesar peta dengan tombol **+** dan **−**.
4. Baca rinciannya di panel kanan. Tab **Laporan** memuat daftar berita dan gempa, tab **Peringatan** memuat peringatan cuaca yang sedang berlaku, dan tab **CCTV** memuat kamera publik.
5. Baca rangkuman di bagian bawah, yaitu **Ringkasan**, **Jenis insiden**, dan **Sebaran per provinsi**.
6. Tekan **Perbarui** untuk mengambil data terbaru.

## 3. C4ISR: peta taktis dan unit lapangan

C4ISR menampilkan posisi unit lapangan pada peta. Unit bawaan adalah data contoh. Unit sungguhan muncul ketika [aplikasi agen Android](#10-aplikasi-agen-android) mulai melapor.

1. Pilih tampilan peta di pojok kanan atas peta: **TAKTIS**, **SATELIT**, atau **OSM**.
2. Lihat daftar **UNIT LAPANGAN** pada tab **Unit & C2**. Setiap unit menampilkan jalur komunikasinya, koordinat, baterai, kekuatan sinyal, dan waktu terakhir terlihat.
3. Klik sebuah unit untuk membuka rinciannya, yaitu koordinat, MGRS, kecepatan, baterai, menara BTS, dan perkiraan radius presisi.
4. Gunakan tombol di bawah rincian unit sesuai kebutuhan:
   - **Kirim ping GPS sekarang (SMS terenkripsi)** meminta posisi terbaru unit.
   - **Uji keamanan: tolak SMS spoofing** memperagakan penolakan perintah palsu.
   - **Triangulasi Cell-ID offline** memperkirakan posisi dari menara seluler di basis data lokal.
   - **Geolokasi sel NYATA (Unwired Labs)** memakai layanan Unwired Labs dan memerlukan kunci API pada `OMNI_CELL_API_KEY`.
5. Tekan **Putar ulang** pada **MISSION PLAYBACK** untuk memutar ulang pergerakan unit.
6. Tekan **Impor GPX** pada **RUTE GPX** untuk menampilkan rute dari berkas GPX.
7. Buka tab **CCTV & Visi** untuk melihat kamera publik dan fitur analisis gambar.

Tanpa perangkat fisik, balasan ping GPS ditandai sebagai simulasi.

## 4. OSINT Profiler: penelusuran sumber terbuka

OSINT Profiler menelusuri satu indikator di sumber terbuka. Modul ini hanya memakai sumber publik, seperti profil publik, DNS, WHOIS, dan layanan pemeriksa kebocoran. Modul ini tidak memuat data kependudukan atau data bocoran.

**Menelusuri indikator**

1. Buka tab **Scanner**.
2. Pilih jenis indikator: **NAME**, **USERNAME**, **EMAIL**, **DOMAIN**, **IP**, **PHONE**, **PLATE**, **GPS**, atau **URL**. Contoh isian pada kolom pencarian akan menyesuaikan.
3. Ketik indikatornya, lalu tekan **SCAN**.
4. Baca hasilnya. Bagian **DORK LINKS** berisi tautan pencarian yang dibuka secara manual.
5. Gunakan tombol di atas hasil sesuai kebutuhan:
   - **Export PDF** menyimpan hasil sebagai PDF.
   - **Build Graph** mengubah hasil menjadi graf pada tab **Knowledge Graph**.
   - **Lampirkan ke Dossier** menyimpan hasil ke dossier sasaran.

Nomor telepon dan pelat nomor hanya diuraikan menjadi operator dan kode wilayah. Modul ini tidak mencari pemiliknya.

**Alat tambahan pada tab Scanner**

- **EMAIL HEADER ANALYZER**: tempel header surel mentah, lalu tekan **Analyze Header** untuk menelusuri jalur pengirimannya.
- **METADATA EXTRACTOR**: seret berkas gambar, PDF, atau dokumen untuk membaca EXIF, GPS, dan metadata lainnya.

**Tab lain**

- **Riwayat Scan** memuat penelusuran yang pernah dijalankan.
- **Dossier & Pelacakan** memuat daftar sasaran beserta skor risikonya. Gunakan **Rename** dan **Hapus** untuk mengelolanya, serta **Lampirkan Hasil Scan** untuk menambahkan hasil penelusuran.

## 5. SIEM: pemantauan keamanan siber

1. Buka tab **Alert Queue**. Empat angka di atas menunjukkan jumlah alert per tingkat: **CRITICAL**, **HIGH**, **MEDIUM**, dan **LOW**.
2. Saring daftar dengan tombol tingkat di bawahnya. Setiap alert menampilkan aturan pemicu, status **OPEN** atau **MITIGATED**, sumber, dan teknik MITRE ATT&CK.
3. Tekan **Impossible Travel** untuk menjalankan deteksi login dari dua lokasi yang mustahil ditempuh dalam waktu singkat.
4. Buka tab **Host Telemetry** untuk melihat beban CPU, memori, diska, dan uptime komputer server. Tekan **Refresh Telemetry** untuk memperbarui.
5. Buka tab **SOAR Playbooks** untuk memilih tindakan: **Block IP**, **Isolate Host**, **Snapshot & Preserve**, **Kill Process**, **Revoke Access Token**, atau **Notify SOC Team**.
6. Buka tab **MITRE ATT&CK** untuk melihat pemetaan alert ke teknik serangan.

Pada prototipe ini, playbook hanya mencatat tindakan dan mengubah status alert menjadi **MITIGATED**. Playbook tidak mengubah perangkat atau jaringan sungguhan.

## 6. DFIR: forensik digital

1. Buka tab **Evidence Board**.
2. Seret berkas ke kotak **Klik atau drag file untuk ingest**. Jenis yang didukung adalah gambar, SQLite, PCAP, PDF, dan berkas biner. Analisis berjalan otomatis.
3. Setiap barang bukti tampil sebagai kartu berisi jenis, nama berkas, SHA-256, dan ukuran. Tanda **ELA** dan **YARA** menunjukkan pemeriksaan yang tersedia.
4. Klik sebuah kartu, lalu buka tab **Forensic Analysis** untuk membaca hasil analisisnya.
5. Buka tab **Chain of Custody** untuk melihat catatan penanganan. Setiap catatan memuat hash catatan itu dan hash catatan sebelumnya.
6. Tekan **Verifikasi Chain** untuk memeriksa bahwa rantai catatan tidak berubah.

Berkas pratinjau barang bukti masih dapat dibuka tanpa login. Jangan mengunggah bukti sungguhan sebelum keterbatasan ini diperbaiki.

## 7. Intel Graph: jaringan keterkaitan

Intel Graph menampilkan hubungan antara sasaran, nomor telepon, alamat IP, domain, dan lokasi. Graf dibangun dari hasil OSINT dan dossier.

1. Buka tab **Link Graph**. Angka **Nodes**, **Edges**, dan **Types** menunjukkan ukuran graf.
2. Pilih tata letak **Force** atau **Radial**. Tekan **Fit** agar seluruh graf terlihat.
3. Klik sebuah node, lalu buka tab **Node Detail** untuk membaca rinciannya.
4. Buka tab **Statistics** untuk ringkasan graf dan tab **Analysis Tools** untuk analisis lanjutan, misalnya mencari jalur antara dua node.
5. Tekan **Rebuild** setelah menambah hasil OSINT agar graf diperbarui.

## 8. BotRadar: pemantauan media sosial

BotRadar mengumpulkan postingan media sosial dan mencari pola akun yang bergerak serempak (Coordinated Inauthentic Behavior).

**Mencoba dengan data demo**

1. Buka tab **Scrape & Pipeline**.
2. Tekan **Load Demo Data (Bot + CIB + Narrative)**. Data demo bersifat fiktif dan tidak memerlukan akun apa pun.
3. Buka tab **BotRadar** untuk melihat skor tiap akun dan labelnya, yaitu `BOT_CONFIRMED`, `BOT_PROBABLE`, `SUSPICIOUS`, atau `LOW_SIGNAL`. Saring dengan **Label** dan **Min score**.
4. Buka tab **Network Graph** untuk melihat hubungan antarakun.
5. Buka tab **Narrative Intel** untuk melihat **COORDINATED BEHAVIOR**, yaitu pasangan akun yang mengirim isi serupa dalam waktu berdekatan, dan **HASHTAG AMPLIFICATION**, yaitu tagar yang didorong bersama.

**Mengumpulkan data sungguhan**

1. Siapkan sumber data pada server. Cara yang disarankan adalah token API resmi X pada `OMNI_TWITTER_BEARER`. Instance Nitter milik sendiri dapat didaftarkan pada `OMNI_NITTER_INSTANCES`.
2. Pada **MODE**, pilih **Full Pipeline** untuk mengumpulkan sekaligus menganalisis, atau **Scrape Only** untuk mengumpulkan saja.
3. Pilih **PLATFORM** dan **METODE**. **Mention Search** mengumpulkan postingan yang menyebut kata kunci. **User Timeline** mengumpulkan postingan milik satu akun.
4. Isi **KATA KUNCI PENCARIAN**, atur **MAX POSTINGAN**, lalu tekan **Jalankan Full Pipeline**.

Skor bot adalah indikasi statistik, bukan bukti. Periksa akun secara manual sebelum menarik simpulan, dan patuhi ketentuan layanan platform yang datanya diambil.

## 9. Admin: pengguna, peran, dan jejak audit

Ruang kerja ini hanya tampil untuk peran yang berhak mengelola pengguna.

- **User Management**: tekan **+ Tambah User** untuk membuat akun. Kolom **ROLE** mengatur peran. Tombol pada kolom **ACTIONS** dipakai untuk menonaktifkan atau mengaktifkan akun (⏸ dan ▶), mengatur ulang sandi (🔑), dan menghapus akun (🗑). Sandi sementara ditampilkan sekali setelah pengaturan ulang.
- **RBAC Matrix**: tabel izin untuk tiap peran, yaitu KOMANDAN, ANALIS, OPERATOR, ADMIN, dan AUDITOR.
- **Audit Log**: catatan seluruh tindakan pengguna. Saring berdasarkan kategori (**Auth**, **Admin**, **Scan**, **Forensics**) dan hasil (**Success**, **Fail**). Tekan **Verify Chain** untuk memeriksa bahwa catatan audit tidak diubah.

## 10. Aplikasi agen Android

Aplikasi agen melaporkan posisi, baterai, dan sinyal seluler ponsel ke server, sehingga ponsel tampil sebagai unit di C4ISR.

1. Jalankan server dengan `OMNI_AGENT_KEY` yang tetap. Tanpa variabel ini, kunci berganti setiap server menyala.
2. Bangun dan pasang aplikasinya dengan mengikuti [`android/README.md`](../android/README.md).
3. Buka aplikasi dan izinkan akses lokasi.
4. Buka **Pengaturan → Lanjutan**, lalu isi alamat server dan kunci agen yang sama dengan `OMNI_AGENT_KEY`.
5. Buka ruang kerja **C4ISR** di web. Ponsel akan muncul pada daftar **UNIT LAPANGAN** setelah laporan pertama terkirim.

Ponsel dan server harus saling terjangkau, misalnya berada di jaringan Wi-Fi yang sama.

## 11. Masalah yang sering muncul

| Gejala | Penyebab dan jalan keluar |
|---|---|
| Sandi ditolak setelah server dijalankan ulang | `OMNI_BOOTSTRAP_PASSWORD` belum diset pada sesi itu. Hentikan server, set variabelnya, lalu jalankan lagi. |
| Halaman kosong atau galat "File not found" | Antarmuka web belum dibangun. Jalankan `npm install --prefix tfael-omni` dan `npm run build --prefix tfael-omni`. |
| SITREP kosong | Server tidak tersambung ke internet, atau `OMNI_AIRGAP=1` sedang aktif. |
| Port 8080 sudah dipakai | Jalankan server dengan port lain, misalnya `python backend/server.py 8081`, lalu buka `http://localhost:8081`. |
| Aplikasi agen ditolak server | Kunci agen di aplikasi berbeda dengan `OMNI_AGENT_KEY` di server. |
| Fitur OCR, YARA, transkripsi, atau deteksi objek tidak aktif | Pustaka opsionalnya belum dipasang. Lihat [Fitur opsional](../README.md#fitur-opsional). |
| Ingin mengulang dari awal | Hentikan server, hapus `backend/tfael_omni.db`, lalu jalankan lagi. |
