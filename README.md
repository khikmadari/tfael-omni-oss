# TFAEL-OMNI v2.0

**Bahasa Indonesia** | [English](README.en.md)

TFAEL-OMNI adalah platform pusat komando terpadu (single pane of glass). Satu layar memadukan peta taktis, OSINT, analisis intelijen, pemantauan keamanan siber, forensik digital, dan aplikasi agen lapangan Android. Seluruh sistem dijalankan di komputer atau server sendiri (self-hosted).

> **Status: prototipe.** Proyek ini dibuat oleh tim TFAEL Labs untuk Kartika Cyber Hackathon 2026 dan kini dibuka sebagai open source agar dapat dikembangkan bersama. Baca bagian [Keterbatasan](#keterbatasan) sebelum memakainya untuk keperluan sungguhan.

## Daftar Isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Instalasi](#instalasi)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Docker](#docker)
- [Login pertama](#login-pertama)
- [Panduan penggunaan](#panduan-penggunaan)
- [Fitur opsional](#fitur-opsional)
- [Aplikasi Android dan radio](#aplikasi-android-dan-radio)
- [Konfigurasi](#konfigurasi)
- [Struktur proyek](#struktur-proyek)
- [Keterbatasan](#keterbatasan)
- [Berkontribusi](#berkontribusi)
- [Lisensi](#lisensi)

## Fitur

| Modul | Fungsi |
|---|---|
| **C4ISR** | Peta taktis, pelacakan unit, geofence, geolokasi menara seluler, triangulasi Cell-ID dengan metode least-squares, dan analisis CCTV publik. |
| **OSINT** | Penelusuran sembilan jenis indikator: domain, alamat IP, surel, nomor telepon, nama orang, nama pengguna, pelat nomor kendaraan, koordinat, dan URL. |
| **Intel Graph** | Knowledge graph, pattern of life, dan skor risiko sasaran. |
| **SIEM siber-fisik** | Aturan deteksi dengan pemetaan MITRE ATT&CK, deteksi impossible travel, dan playbook SOAR. |
| **Forensik digital** | Evidence vault dengan hash chain, pemeriksaan EXIF dan ELA, YARA rules, serta berita acara dalam bentuk PDF. |
| **Media sosial** | Pengambilan data Twitter/X dan deteksi Coordinated Inauthentic Behavior (CIB). |
| **SITREP** | Berita daring, gempa, dan peringatan dini cuaca BMKG pada satu peta. |
| **Agen lapangan** | Aplikasi Android untuk melaporkan posisi, baterai, dan sinyal seluler, dengan peta 2D dan 3D. |

Sebagian fitur memanggil layanan luar, yaitu OpenCellID/Unwired Labs, BMKG, GeoIP, dan media sosial. Sebagian besar panggilan keluar dari server dapat dimatikan dengan `OMNI_AIRGAP=1`.

## Teknologi

| Bagian | Teknologi |
|---|---|
| Server | Python (server HTTP dari standard library) dan SQLite |
| Antarmuka web | React, TypeScript, dan Vite |
| Aplikasi Android | Kotlin, osmdroid (peta 2D), dan MapLibre GL JS (peta 3D) |

## Instalasi

Perangkat lunak yang perlu disiapkan:

| Perangkat lunak | Versi | Kegunaan |
|---|---|---|
| Python | 3.10 atau lebih baru (disarankan 3.12) | Menjalankan server |
| Node.js | 22 atau lebih baru | Membangun antarmuka web |
| Git | Versi apa pun | Mengunduh kode |

Git boleh dilewati. Sebagai gantinya, klik **Code → Download ZIP** di halaman GitHub, lalu ekstrak berkasnya.

### macOS

Semua perintah dijalankan di aplikasi **Terminal**.

**1. Pasang prasyarat.** Cara termudah adalah [Homebrew](https://brew.sh):

```bash
brew install python@3.12 node git
```

Tanpa Homebrew, unduh pemasang dari [python.org](https://www.python.org/downloads/) dan [nodejs.org](https://nodejs.org/), lalu ganti `python3.12` pada langkah 3 dengan `python3`.

**2. Unduh kode.**

```bash
git clone https://github.com/khikmadari/tfael-omni-oss.git
cd tfael-omni-oss
```

**3. Pasang pustaka Python** di lingkungan terpisah (virtual environment) agar tidak bercampur dengan Python sistem.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-server.txt
```

**4. Bangun antarmuka web.** Hasilnya ditulis ke folder `frontend/`.

```bash
npm install --prefix tfael-omni
npm run build --prefix tfael-omni
```

**5. Jalankan server.** Ganti sandinya dengan sandi pilihan Anda.

```bash
OMNI_BOOTSTRAP_PASSWORD="ganti-dengan-sandi-anda" python backend/server.py 8080
```

**6. Buka `http://localhost:8080`** di peramban, lalu ikuti bagian [Login pertama](#login-pertama).

Untuk menjalankan server lagi di lain waktu, cukup ulangi `source .venv/bin/activate` dan langkah 5.

### Windows

Semua perintah dijalankan di **PowerShell**. Langkah Windows disusun dari pembacaan kode dan belum diuji langsung oleh tim. Bila ada kendala, laporkan melalui tab Issues.

**1. Pasang prasyarat** dengan winget, yang sudah tersedia di Windows 10 dan 11:

```powershell
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Setelah selesai, tutup PowerShell lalu buka kembali agar perintah baru dikenali. Tanpa winget, unduh pemasang dari [python.org](https://www.python.org/downloads/) (centang **Add python.exe to PATH**), [nodejs.org](https://nodejs.org/), dan [git-scm.com](https://git-scm.com/).

**2. Unduh kode.**

```powershell
git clone https://github.com/khikmadari/tfael-omni-oss.git
cd tfael-omni-oss
```

**3. Pasang pustaka Python** di lingkungan terpisah (virtual environment).

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements-server.txt
```

Bila muncul galat "running scripts is disabled on this system", jalankan perintah berikut lalu ulangi baris kedua:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**4. Bangun antarmuka web.** Hasilnya ditulis ke folder `frontend\`.

```powershell
npm install --prefix tfael-omni
npm run build --prefix tfael-omni
```

**5. Jalankan server.** Ganti sandinya dengan sandi pilihan Anda.

```powershell
$env:PYTHONUTF8 = "1"
$env:OMNI_BOOTSTRAP_PASSWORD = "ganti-dengan-sandi-anda"
python backend\server.py 8080
```

Bila Windows Firewall bertanya, pilih **Allow** hanya untuk jaringan privat. Pilih **Cancel** bila server hanya dibuka dari komputer yang sama.

**6. Buka `http://localhost:8080`** di peramban, lalu ikuti bagian [Login pertama](#login-pertama).

Untuk menjalankan server lagi di lain waktu, cukup ulangi `.venv\Scripts\Activate.ps1` dan langkah 5.

### Docker

Cara ini sama di macOS dan Windows, dan hanya memerlukan [Docker Desktop](https://www.docker.com/products/docker-desktop/). Python dan Node.js tidak perlu dipasang.

```bash
git clone https://github.com/khikmadari/tfael-omni-oss.git
cd tfael-omni-oss
docker build -t tfael-omni .
docker run --rm -p 8080:8080 -e OMNI_BOOTSTRAP_PASSWORD="ganti-dengan-sandi-anda" tfael-omni
```

Data pada cara ini hilang ketika kontainer dihentikan. Tambahkan `-v tfael-data:/data` pada perintah `docker run` agar data tersimpan.

## Login pertama

1. Buka `http://localhost:8080`.
2. Isi **Callsign** dengan `komandan`.
3. Isi **Access Code** dengan sandi yang Anda tetapkan pada `OMNI_BOOTSTRAP_PASSWORD`.

Akun bawaan lain memakai sandi yang sama:

| Callsign | Peran |
|---|---|
| `komandan` | Komandan (akses penuh) |
| `analis.intel` | Analis |
| `operator.c2` | Operator |
| `admin.sistem` | Admin |

Hal yang perlu diketahui:

- `OMNI_BOOTSTRAP_PASSWORD` perlu diset setiap kali server dijalankan. Tanpa variabel itu, sandi dibuat acak dan akun wajib mengganti sandi, sedangkan antarmuka web belum menyediakan formulir ganti sandi.
- Server mengisi data contoh fiktif saat pertama kali menyala. Jalankan dengan `OMNI_DEMO=0` untuk server tanpa data contoh.
- Data tersimpan di `backend/tfael_omni.db`. Hapus berkas itu untuk mengulang dari awal.
- Tekan `Ctrl+C` di Terminal atau PowerShell untuk menghentikan server.

## Panduan penggunaan

Cara memakai tiap ruang kerja dijelaskan langkah demi langkah di [`docs/PANDUAN_PENGGUNAAN.md`](docs/PANDUAN_PENGGUNAAN.md). Panduan itu mencakup SITREP, C4ISR, OSINT Profiler, SIEM, DFIR, Intel Graph, BotRadar, Admin, aplikasi agen Android, dan masalah yang sering muncul.

## Fitur opsional

Fitur berikut hanya aktif bila pustakanya dipasang. Server mendeteksinya sendiri saat menyala.

| Fitur | Yang perlu dipasang |
|---|---|
| Pemindaian YARA rules | `pip install yara-python` |
| OCR (membaca teks pada gambar) | `pip install pytesseract` dan program Tesseract: `brew install tesseract` (macOS) atau `winget install UB-Mannheim.TesseractOCR` (Windows) |
| Transkripsi suara | `pip install faster-whisper` |
| Deteksi objek (YOLO) | `pip install ultralytics` |

## Aplikasi Android dan radio

Aplikasi agen Android dijelaskan di [`android/README.md`](android/README.md). Alamat server bawaan aplikasi perlu diganti dengan alamat server Anda sendiri melalui Pengaturan → Lanjutan. Integrasi radio dijelaskan di [`docs/PANDUAN_RADIO.md`](docs/PANDUAN_RADIO.md).

## Konfigurasi

Server diatur melalui environment variable berikut:

| Variabel | Fungsi | Contoh |
|---|---|---|
| `OMNI_BOOTSTRAP_PASSWORD` | Kata sandi akun bawaan. Bila tidak diset, sandi dibuat acak dan ditampilkan sekali di log saat server menyala. | `Omni#Rahasia2026` |
| `OMNI_AGENT_KEY` | Kunci pra-berbagi untuk perangkat lapangan. Bila kosong, kunci dibuat acak setiap server menyala. | `FIELD-KEY-7a3f...` |
| `OMNI_ALLOWED_ORIGINS` | Daftar origin yang boleh mengakses lintas-asal, dipisah koma. Kosong berarti semua permintaan CORS ditolak. | `https://console.markas.local` |
| `OMNI_LOGIN_MAX_FAILS` | Jumlah gagal login sebelum akun dan IP terkunci sementara (bawaan `5`). | `5` |
| `OMNI_LOGIN_LOCK_SECONDS` | Lama penguncian dalam detik (bawaan `900`, yaitu 15 menit). | `900` |
| `OMNI_AIRGAP` | `1` untuk mematikan panggilan keluar ke GeoIP, BMKG, layanan geolokasi sel, dan media sosial. | `1` |
| `OMNI_DEMO` | `0` untuk server bersih tanpa data contoh. | `0` |
| `OMNI_DEMO_HINT` | `1` untuk membagikan kunci agen ke aplikasi lapangan melalui `/api/v2/agent/demo-key` agar mudah dicoba. Jangan diaktifkan pada server yang dipakai sungguhan. | `1` |
| `OMNI_DB_PATH` | Letak berkas basis data bila ingin disimpan di luar folder kode. | `/data/tfael_omni.db` |

Contoh menjalankan server untuk pemakaian sungguhan di macOS atau Linux:

```bash
OMNI_ALLOWED_ORIGINS="https://console.markas.local" \
OMNI_AGENT_KEY="FIELD-KEY-7a3f91c2" \
OMNI_BOOTSTRAP_PASSWORD="Omni#RahasiaAwal2026" \
OMNI_AIRGAP=1 \
OMNI_DEMO=0 \
python backend/server.py 8080
```

## Struktur proyek

| Folder atau berkas | Isi |
|---|---|
| [`backend/`](backend/) | Server API `/api/v2/*` dan seluruh mesin analisis. Titik masuknya adalah [`backend/server.py`](backend/server.py). |
| [`tfael-omni/`](tfael-omni/) | Kode sumber antarmuka web. Hasil build ditulis ke `frontend/`. |
| [`android/`](android/) | Aplikasi agen lapangan untuk Android. |
| [`deploy/`](deploy/) | Panduan deployment dengan Docker dan Railway. |
| [`tools/`](tools/) | Skrip pendukung, misalnya impor data OpenCellID. |
| [`docs/`](docs/) | Panduan penggunaan dan panduan radio. |

## Keterbatasan

- Sebagian besar modul berjalan dengan data contoh fiktif.
- Berkas pratinjau barang bukti di `frontend/uploads/` disajikan tanpa login dan penamaannya mudah ditebak, sehingga server ini belum layak menyimpan bukti sungguhan.
- Antarmuka web belum menyediakan formulir ganti sandi untuk akun yang wajib mengganti sandi.
- Integrasi radio APRS/LoRa belum pernah diuji dengan perangkat asli.
- Aplikasi agen Android sebagian besar diuji pada emulator di GitHub Actions.
- Banyak instance Nitter publik sudah tidak aktif, sehingga pengambilan data Twitter/X sering memerlukan token API resmi.

## Berkontribusi

Kontribusi terbuka untuk siapa saja dengan alur berikut:

1. Fork repo ini, lalu buat branch baru dari `main`.
2. Lakukan perubahan dan jalankan pengujian backend dengan `python -m pytest backend/tests` (memerlukan `pip install pytest`).
3. Kirim pull request yang menjelaskan perubahan beserta alasannya.

Bagian yang paling membutuhkan bantuan:

- pengujian aplikasi agen Android di lebih banyak ponsel;
- pengujian langkah instalasi di Windows;
- integrasi radio APRS/LoRa dengan perangkat asli;
- jalur pengambilan data Twitter/X;
- formulir ganti sandi dan perlindungan login untuk berkas di `frontend/uploads/`;
- modul yang masih memakai data contoh, dokumentasi, dan pengujian.

Bug dan usulan dapat dilaporkan melalui tab Issues.

## Lisensi

Kode ini dirilis dengan lisensi MIT; lihat berkas [`LICENSE`](LICENSE). Pustaka opsional yang dipasang terpisah mengikuti lisensinya masing-masing, misalnya ultralytics (YOLO) yang berlisensi AGPL-3.0.

**Catatan kepatuhan:** fitur link pelacak (`/checkin`), force GPS ping melalui SMS biner, dan pengambilan data media sosial bersifat dual-use. Gunakan hanya dengan dasar hukum dan izin yang sah, serta patuhi ketentuan pelindungan data pribadi yang berlaku.
