# Deploy ke Railway

Berkas yang dipakai: `Dockerfile`, `.dockerignore`, `railway.json` (di akar repo) dan `backend/requirements-server.txt`.
Image membangun frontend dari `tfael-omni/`, lalu menjalankan `python3 backend/server.py $PORT`.

## Langkah

1. Push repo ke GitHub.
2. Di Railway: **New → Deploy from GitHub repo**, pilih repo ini. Railway membaca `railway.json` dan memakai `Dockerfile`.
3. Tambahkan **Volume** pada layanan, pasang di `/data`. Basis data ada di `/data/tfael_omni.db`
   (`OMNI_DB_PATH`). Tanpa volume, isinya kosong lagi setiap deploy.
4. Isi **Variables** (lihat di bawah), lalu **Settings → Networking → Generate Domain**.
5. Buka domainnya, login dengan akun awal dan kata sandi `OMNI_BOOTSTRAP_PASSWORD`, lalu ganti kata sandinya.

## Variables

Wajib:

| Nama | Isi |
|---|---|
| `OMNI_BOOTSTRAP_PASSWORD` | Kata sandi awal semua akun bawaan. Kalau kosong, dibuat acak dan tampil sekali di log deploy. |
| `OMNI_AGENT_KEY` | Kunci untuk endpoint perangkat lapangan. Kalau kosong, endpoint itu memakai kunci sementara yang berganti tiap restart. |
| `OMNI_ALLOWED_ORIGINS` | Alamat `https://…` domain Railway-nya. |

Sesuai kebutuhan:

| Nama | Isi |
|---|---|
| `OMNI_AIRGAP` | Biarkan kosong supaya SITREP mengambil berita, gempa, dan peringatan BMKG. `1` = tanpa jaringan keluar (data simulasi). |
| `OMNI_TWITTER_AUTH_TOKEN`, `OMNI_TWITTER_CT0`, `OMNI_TWITTER_TWID`, `OMNI_TWITTER_CF_CLEARANCE` | Cookie sesi untuk scrape Twitter (modul Cognitive). |
| `ABUSEIPDB_API_KEY`, `VIRUSTOTAL_API_KEY`, `OTX_API_KEY`, `IPINFO_TOKEN`, `HIBP_API_KEY`, `OMNI_CELL_API_KEY` | Kunci layanan OSINT/SIEM, bila dipakai. |

Jangan menaruh nilai-nilai ini di repo.

## Yang tidak ikut di image ini

- **YOLO, Whisper, OCR, YARA** tidak dipasang (berat; paket trial dibatasi RAM 1 GB dan image 4 GB).
  Deteksi objek CCTV dan fitur forensik yang memakainya melapor "tidak terpasang"; gambar CCTV tetap tampil.
- **Unggahan** (`frontend/uploads`) tidak berada di volume, jadi hilang saat deploy ulang.
- **HTTPS port 8443** bawaan server tidak dipakai; Railway yang memberi HTTPS di domainnya.

## Mencoba image di komputer sendiri

    docker build -t tfael-omni .
    docker run --rm -p 8080:8080 -v tfael-data:/data -e OMNI_BOOTSTRAP_PASSWORD=ganti-ini tfael-omni

Catatan: image ini belum pernah dibangun dengan Docker sungguhan. Yang sudah dicoba adalah langkah-langkahnya satu per satu
di Linux x64 (pasang dependensi, build frontend, jalankan server dengan `OMNI_DB_PATH`, login, rute SITREP).
