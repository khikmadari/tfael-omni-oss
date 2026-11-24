# Berkontribusi ke TFAEL-OMNI

**Bahasa Indonesia** | [English](CONTRIBUTING.en.md)

Terima kasih sudah mau membantu. Panduan ini menjelaskan cara menyiapkan lingkungan pengembangan, letak tiap bagian kode, dan cara menambah fitur dengan contoh nyata dari repo ini.

## Daftar Isi

1. [Menyiapkan lingkungan pengembangan](#1-menyiapkan-lingkungan-pengembangan)
2. [Peta kode](#2-peta-kode)
3. [Contoh: menambah platform ke pencarian username](#3-contoh-menambah-platform-ke-pencarian-username)
4. [Contoh: menambah endpoint API](#4-contoh-menambah-endpoint-api)
5. [Contoh: menambah tampilan di web](#5-contoh-menambah-tampilan-di-web)
6. [Pengujian](#6-pengujian)
7. [Gaya kode](#7-gaya-kode)
8. [Pesan commit dan pull request](#8-pesan-commit-dan-pull-request)
9. [Aturan yang wajib dipatuhi](#9-aturan-yang-wajib-dipatuhi)
10. [Celah keamanan dan lisensi](#10-celah-keamanan-dan-lisensi)

## 1. Menyiapkan lingkungan pengembangan

Pasang prasyarat dan pustaka dengan mengikuti [README](README.md#instalasi). Untuk mengembangkan, jalankan dua proses berikut di dua jendela terminal.

```bash
# Jendela 1: server API di port 8080
OMNI_BOOTSTRAP_PASSWORD="sandi-lokal-anda" python backend/server.py 8080

# Jendela 2: antarmuka web dengan muat ulang otomatis
npm run dev --prefix tfael-omni
```

Buka `http://localhost:5173`. Server pengembangan Vite meneruskan semua permintaan `/api` ke port 8080, sehingga perubahan pada kode web langsung terlihat tanpa membangun ulang.

## 2. Peta kode

| Lokasi | Isi |
|---|---|
| `backend/server.py` | Semua rute `/api/v2/*`. Rute GET ada di `_do_GET_inner`, rute POST di `_do_POST_inner`. |
| `backend/admin.py` | Login, sesi, peran dan izin (RBAC), serta audit log. |
| `backend/engine_*.py` | Mesin tiap modul: `engine_c2`, `engine_sitrep`, `engine_siem`, `engine_forensics`, `engine_cognitive`, `engine_graph`, `engine_vision`, dan lainnya. |
| `backend/osint_engine.py`, `backend/real_osint.py` | Penelusuran OSINT untuk tiap jenis indikator. |
| `backend/tests/` | Pengujian backend dengan pytest. |
| `tfael-omni/src/workspaces/` | Satu berkas untuk tiap ruang kerja di web. |
| `tfael-omni/src/components/<modul>/` | Komponen milik tiap ruang kerja. |
| `tfael-omni/src/api/` | `client.ts` berisi `apiFetch` dan `apiPost`; `endpoints.ts` berisi pembungkus tiap endpoint. |
| `android/` | Aplikasi agen lapangan (Kotlin) dan skrip uji emulator di `android/ci/`. |

## 3. Contoh: menambah platform ke pencarian username

Pencarian username memeriksa satu nama akun di banyak situs. Daftar situsnya ada di `PLATFORMS` dalam `backend/osint_engine.py`. Setiap situs adalah satu baris berisi empat nilai:

```python
PLATFORMS = [
    # (nama, alamat profil dengan {u}, penanda "tidak ditemukan", lewati)
    ("GitHub", "https://github.com/{u}",
     ["Not Found", "page not found", "Join GitHub today"], False),
]
```

Untuk menambah situs baru, tambahkan satu baris dengan ketentuan berikut:

1. **Alamat profil** memakai `{u}` di tempat nama akun.
2. **Penanda "tidak ditemukan"** adalah teks yang hanya muncul di halaman ketika akun tidak ada. Buka alamat profil dengan nama akun yang pasti tidak ada, lalu salin teks khas dari halaman itu.
3. **Nilai terakhir** diisi `True` hanya untuk menonaktifkan situs itu sementara.

Sebuah akun dinyatakan ditemukan dengan keyakinan tinggi bila halamannya memuat nama akun tersebut. Bila halamannya terbuka tetapi tidak memuat nama akun, hasilnya ditandai belum terverifikasi.

Uji baris baru Anda dari folder `backend` sebelum mengirim pull request, satu kali dengan akun yang ada dan satu kali dengan akun yang tidak ada:

```bash
cd backend
python -c "from osint_engine import _check_one; print(_check_one('torvalds', 'GitHub', 'https://github.com/{u}', ['Not Found'], False))"
```

Hanya tambahkan situs yang profilnya terbuka untuk umum. Jangan menambah pemeriksaan yang memerlukan login, melewati perlindungan situs, atau memakai data bocoran.

## 4. Contoh: menambah endpoint API

Semua endpoint wajib memeriksa login, kecuali yang memang harus terbuka seperti halaman login.

**Endpoint GET** ditulis di `_do_GET_inner` dalam `backend/server.py`:

```python
if path == "/api/v2/contoh/halo":
    sess, ok = self._require_auth()
    if not ok: return
    self._send_json({"ok": True, "pesan": f"Halo, {sess['username']}"})
    return
```

**Endpoint POST** ditulis di `_do_POST_inner`. Di sana `payload` sudah berisi badan JSON dan `sess` sudah berisi sesi pengguna.

```python
# 1. Bila endpoint butuh izin peran tertentu, daftarkan di PERM_BY_PATH.
PERM_BY_PATH = {
    "/api/v2/contoh/simpan": "run_recon",
}

# 2. Tulis penangannya. Tolak permintaan tanpa sesi.
if path == "/api/v2/contoh/simpan":
    if not sess:
        self._send_json({"ok": False, "error": "Sesi tidak valid."}, status=401); return
    nama = str(payload.get("nama", "")).strip()
    self._send_json({"ok": True, "nama": nama})
    return
```

**Di sisi web**, tambahkan pembungkusnya di `tfael-omni/src/api/endpoints.ts`. Selalu pakai `apiFetch` atau `apiPost`, bukan `fetch` langsung, agar token login ikut terkirim.

```ts
export function halo() {
  return apiFetch<{ ok: boolean; pesan: string }>('/api/v2/contoh/halo').then(r => r.data);
}
```

Logika yang lebih dari beberapa baris sebaiknya ditaruh di berkas `engine_*.py` yang sesuai, sedangkan `server.py` hanya memanggilnya.

## 5. Contoh: menambah tampilan di web

- **Komponen baru di ruang kerja yang sudah ada:** buat berkasnya di `tfael-omni/src/components/<modul>/`, lalu pakai dari berkas ruang kerja di `tfael-omni/src/workspaces/`.
- **Ruang kerja baru:** buat berkas di `tfael-omni/src/workspaces/`, tambahkan id-nya ke `WorkspaceId` di `src/context/AppContext.tsx`, daftarkan tabnya di `src/components/layout/workspaces.ts`, lalu muat komponennya di `src/App.tsx`.
- **Ikon dan font** disimpan di dalam repo. Jangan memuat ikon, font, atau skrip dari CDN, agar antarmuka web tetap dapat dimuat di jaringan tertutup.
- **Tampilan ponsel** memakai tata letak tersendiri untuk layar selebar 768 piksel atau kurang. Periksa perubahan Anda di kedua ukuran.

## 6. Pengujian

| Bagian | Perintah | Keterangan |
|---|---|---|
| Backend | `python -m pytest backend/tests` | Memerlukan `pip install pytest`. Tambahkan pengujian untuk logika baru di `backend/tests/`. |
| Web | `npm run build --prefix tfael-omni` | Harus selesai tanpa galat. |
| Web | `npm run lint --prefix tfael-omni` | Pemeriksaan gaya kode. Jangan menambah peringatan baru. |
| Android | Dorong perubahan ke fork Anda | GitHub Actions membangun APK dan mengujinya di emulator. Aktifkan Actions di fork lebih dulu. |

Pengujian backend memakai basis data sementara. Lihat `backend/tests/test_admin.py` untuk polanya.

## 7. Gaya kode

- Ikuti gaya dan bahasa berkas yang Anda ubah. Sebagian besar komentar dan teks antarmuka berbahasa Indonesia, sedangkan istilah teknis yang sudah mapan tetap berbahasa Inggris.
- **Python:** beri type hint pada fungsi baru, jaga fungsi tetap pendek, dan kembalikan pesan galat yang jelas alih-alih menelan galat.
- **TypeScript:** pakai komponen fungsi dan panggil API hanya lewat `apiFetch` atau `apiPost`.
- **Kotlin:** antarmuka aplikasi Android dibangun di kode, tanpa berkas layout XML.
- Jangan menambah pustaka baru tanpa keperluan yang jelas. Bila perlu, tulis alasannya di pull request.
- Perbarui README atau panduan penggunaan bila perilaku aplikasi berubah. Kedua dokumen itu tersedia dalam bahasa Indonesia dan Inggris, jadi ubah keduanya.

## 8. Pesan commit dan pull request

Pesan commit memakai bentuk `jenis: ringkasan`, dalam bahasa Indonesia atau Inggris.

| Jenis | Dipakai untuk |
|---|---|
| `feat` | Fitur baru |
| `fix` | Perbaikan bug |
| `docs` | Dokumentasi |
| `test` | Pengujian |
| `chore` | Perawatan yang tidak mengubah perilaku |
| `ci` | Perubahan otomasi |

Contoh: `fix(osint): penanda tidak ditemukan untuk GitLab`.

Alur pull request:

1. Fork repo ini, lalu buat branch baru dari `main` dengan nama yang menjelaskan isinya, misalnya `tambah-platform-gitlab`.
2. Buat perubahan sekecil mungkin. Satu pull request sebaiknya memuat satu tujuan.
3. Jalankan pengujian pada bagian 6.
4. Kirim pull request dan isi templat yang muncul. Untuk perubahan besar, buka issue lebih dulu agar arahnya dapat disepakati.

## 9. Aturan yang wajib dipatuhi

- **Tanpa data pribadi sungguhan.** Jangan memasukkan nama, nomor telepon, surel, NIK, pelat nomor, foto, atau data bocoran milik orang nyata ke dalam kode, data contoh, pengujian, maupun tangkapan layar. Gunakan data yang jelas fiktif, misalnya domain `example.com` dan nama akun berakhiran `_demo`. Aturan ini sejalan dengan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
- **Tanpa rahasia.** Jangan menyertakan kunci API, token, kata sandi, cookie sesi, atau berkas `.env`.
- **Data contoh bersifat netral.** Jangan memakai tokoh, partai, atau isu politik sebagai data contoh.
- **Tanpa akses tanpa izin.** Kontribusi yang menambah kemampuan mengakses akun, perangkat, atau data pihak lain tanpa izin tidak diterima.
- **Perubahan pada otomasi diperiksa lebih ketat.** Berkas di `.github/`, `android/ci/`, dan berkas Gradle dijalankan otomatis oleh GitHub Actions, sehingga perubahannya perlu alasan yang jelas di pull request.

## 10. Celah keamanan dan lisensi

Jangan melaporkan celah keamanan melalui issue publik. Ikuti [SECURITY.md](SECURITY.md).

Dengan mengirim kontribusi, Anda setuju bahwa kontribusi tersebut dirilis dengan [lisensi MIT](LICENSE) yang sama dengan proyek ini.
