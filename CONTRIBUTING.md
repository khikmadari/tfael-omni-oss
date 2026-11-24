# Berkontribusi ke TFAEL-OMNI

**Bahasa Indonesia** | [English](#contributing-to-tfael-omni)

Terima kasih sudah mau membantu. Proyek ini masih berupa prototipe, sehingga perbaikan kecil pun berarti: laporan bug, pengujian di perangkat lain, dokumentasi, maupun kode.

## Sebelum mulai

- Baca [README](README.md) dan [panduan penggunaan](docs/PANDUAN_PENGGUNAAN.md) agar tahu cara menjalankan aplikasinya.
- Periksa tab Issues untuk melihat apakah hal yang sama sudah dibahas.
- Untuk perubahan besar, buka issue lebih dulu agar arahnya dapat disepakati sebelum Anda menulis kode.

## Alur kontribusi

1. Fork repo ini, lalu buat branch baru dari `main` dengan nama yang menjelaskan isinya, misalnya `perbaiki-filter-audit-log`.
2. Buat perubahan sekecil mungkin. Satu pull request sebaiknya memuat satu tujuan.
3. Jalankan pengujian backend dengan `python -m pytest backend/tests`. Bila antarmuka web diubah, pastikan `npm run build --prefix tfael-omni` berhasil.
4. Kirim pull request dan isi templat yang muncul.

## Aturan yang wajib dipatuhi

- **Tanpa data pribadi sungguhan.** Jangan memasukkan nama, nomor telepon, surel, NIK, pelat nomor, foto, atau data bocoran milik orang nyata ke dalam kode, data contoh, pengujian, maupun tangkapan layar. Gunakan data yang jelas fiktif, misalnya domain `example.com` dan nama akun berakhiran `_demo`. Aturan ini sejalan dengan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
- **Tanpa rahasia.** Jangan menyertakan kunci API, token, kata sandi, cookie sesi, atau berkas `.env`.
- **Data contoh bersifat netral.** Jangan memakai tokoh, partai, atau isu politik sebagai data contoh.
- **Tanpa akses tanpa izin.** Kontribusi yang menambah kemampuan mengakses akun, perangkat, atau data pihak lain tanpa izin tidak diterima.
- **Perubahan pada otomasi diperiksa lebih ketat.** Berkas di `.github/`, `android/ci/`, dan berkas Gradle dijalankan otomatis oleh GitHub Actions, sehingga perubahannya perlu alasan yang jelas di pull request.

## Gaya kode

- Ikuti gaya dan bahasa berkas yang Anda ubah. Sebagian besar komentar dan teks antarmuka berbahasa Indonesia, sedangkan istilah teknis yang sudah mapan tetap berbahasa Inggris.
- Jangan menambah pustaka baru tanpa keperluan yang jelas. Bila perlu, tulis alasannya di pull request.
- Perbarui README atau panduan penggunaan bila perilaku aplikasi berubah. Kedua dokumen itu tersedia dalam bahasa Indonesia dan Inggris, jadi ubah keduanya.

## Melaporkan celah keamanan

Jangan melaporkan celah keamanan melalui issue publik. Ikuti [SECURITY.md](SECURITY.md).

## Lisensi

Dengan mengirim kontribusi, Anda setuju bahwa kontribusi tersebut dirilis dengan [lisensi MIT](LICENSE) yang sama dengan proyek ini.

---

# Contributing to TFAEL-OMNI

[Bahasa Indonesia](#berkontribusi-ke-tfael-omni) | **English**

Thank you for wanting to help. The project is still a prototype, so small improvements matter: bug reports, testing on other devices, documentation, and code.

## Before you start

- Read the [README](README.en.md) and the [user guide](docs/USER_GUIDE.md) so you know how to run the app.
- Check the Issues tab to see whether the same thing is already being discussed.
- For a large change, open an issue first so the direction can be agreed before you write code.

## How to contribute

1. Fork this repo and create a new branch from `main` with a name that says what it does, for example `fix-audit-log-filter`.
2. Keep the change as small as possible. One pull request should have one purpose.
3. Run the backend tests with `python -m pytest backend/tests`. If you changed the web interface, make sure `npm run build --prefix tfael-omni` succeeds.
4. Open a pull request and fill in the template.

## Rules that always apply

- **No real personal data.** Do not put the name, phone number, email, national ID number, vehicle plate, photo, or leaked data of a real person into code, sample data, tests, or screenshots. Use data that is clearly fictional, such as the `example.com` domain and account names ending in `_demo`. This follows Indonesia's Law No. 27 of 2022 on Personal Data Protection.
- **No secrets.** Do not include API keys, tokens, passwords, session cookies, or `.env` files.
- **Sample data stays neutral.** Do not use political figures, parties, or issues as sample data.
- **No unauthorized access.** Contributions that add the ability to access someone else's account, device, or data without permission are not accepted.
- **Automation changes get a closer review.** Files in `.github/`, `android/ci/`, and Gradle files are run automatically by GitHub Actions, so changes to them need a clear reason in the pull request.

## Code style

- Follow the style and language of the file you are changing. Most comments and interface text are in Indonesian, while established technical terms stay in English.
- Do not add a new library without a clear need. If you need one, explain why in the pull request.
- Update the README or the user guide when the app's behaviour changes. Both exist in Indonesian and English, so change both.

## Reporting a security vulnerability

Do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By submitting a contribution, you agree that it is released under the same [MIT license](LICENSE) as this project.
