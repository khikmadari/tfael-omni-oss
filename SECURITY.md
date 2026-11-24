# Kebijakan Keamanan

**Bahasa Indonesia** | [English](#security-policy)

## Melaporkan celah keamanan

Jangan membuka issue publik untuk celah keamanan, karena rinciannya dapat disalahgunakan sebelum diperbaiki.

1. Buka tab **Security** di repo ini, lalu pilih **Report a vulnerability**. Laporan lewat jalur ini hanya terlihat oleh pengelola.
2. Bila tombol tersebut tidak tersedia, buka issue yang hanya berisi permintaan kontak, tanpa rincian teknis.

Sertakan hal berikut dalam laporan:

- commit atau tanggal versi yang Anda uji;
- langkah untuk mengulangi masalahnya;
- dampak yang mungkin terjadi.

Proyek ini dikelola secara sukarela, sehingga tanggapan dapat memerlukan beberapa hari.

## Versi yang didukung

Perbaikan keamanan hanya dikerjakan pada cabang `main` terbaru.

## Batasan yang sudah diketahui

Batasan berikut sudah tercatat di [README](README.md#batasan-saat-ini-dan-peta-jalan) dan tidak perlu dilaporkan ulang, tetapi perbaikannya sangat diharapkan:

- Pratinjau barang bukti di `frontend/uploads/` disajikan tanpa login.
- Antarmuka web belum menyediakan formulir ganti sandi untuk akun yang wajib mengganti sandi.

## Catatan untuk pemasang

TFAEL-OMNI masih berupa prototipe. Bila Anda memasangnya di luar komputer sendiri:

- tetapkan `OMNI_BOOTSTRAP_PASSWORD` dan `OMNI_AGENT_KEY` yang kuat serta berbeda;
- jangan aktifkan `OMNI_DEMO_HINT` karena variabel itu membagikan kunci agen;
- letakkan server di belakang HTTPS dan batasi siapa yang dapat menjangkaunya;
- jangan menyimpan data pribadi atau barang bukti sungguhan sebelum batasan di atas diperbaiki.

---

# Security Policy

[Bahasa Indonesia](#kebijakan-keamanan) | **English**

## Reporting a vulnerability

Do not open a public issue for a security vulnerability, because the details could be misused before a fix exists.

1. Open the **Security** tab of this repo and choose **Report a vulnerability**. Reports sent this way are visible only to the maintainers.
2. If that button is not available, open an issue that only asks for a contact, without technical details.

Please include:

- the commit or the date of the version you tested;
- the steps to reproduce the problem;
- the possible impact.

This project is maintained by volunteers, so a reply may take a few days.

## Supported versions

Security fixes are made only on the latest `main` branch.

## Known limits

These limits are already listed in the [README](README.en.md#current-limits-and-roadmap). You do not need to report them again, but fixes are very welcome:

- Evidence previews in `frontend/uploads/` are served without login.
- The web interface has no change-password form for accounts that must change their password.

## Notes for people who deploy it

TFAEL-OMNI is still a prototype. If you run it anywhere other than your own computer:

- set a strong `OMNI_BOOTSTRAP_PASSWORD` and a strong, different `OMNI_AGENT_KEY`;
- do not enable `OMNI_DEMO_HINT`, because it shares the agent key;
- put the server behind HTTPS and limit who can reach it;
- do not store real personal data or real evidence until the limits above are fixed.
