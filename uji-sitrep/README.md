# uji-sitrep

Alat uji otomatis untuk modul SITREP. Bukan bagian dari aplikasi dan tidak ikut ke build.

- `serve.mjs`: server tiruan di port 8099. Menyajikan `../frontend` (hasil build) dan meniru API backend dengan
  data contoh, termasuk keadaan gagal (berita tidak terjangkau, sesi habis, kamera tidak mengirim gambar).
  Login di sini login tiruan; tidak ada akun sungguhan.
- `states.mjs`: browser robot (Playwright) yang menjalankan 90 skenario dan memotret hasilnya ke `potret/`.
- `shot.mjs`: pembuka halaman yang dipakai skrip lain. `intro-shot.mjs`, `intro-perf.mjs`, dan `*-shot.mjs` memotret
  atau mengukur bagian tertentu.
- `backend/`: uji `backend/engine_sitrep.py` tanpa jaringan.
- `data-peta/`: pembuat `dunia-titik.json` dan `dunia-negara.json` (butiran daratan dan nama negara di bola dunia).

## Menjalankan

    cd tfael-omni && npm run build          # alat uji memeriksa hasil build di ../frontend
    cd ../uji-sitrep && npm install && npx playwright install chromium
    node serve.mjs &                        # server tiruan
    node states.mjs                         # semua skenario (sekitar 5 menit)
    node states.mjs intro-login cctv        # hanya skenario yang disebut

    python3 -B backend/test_engine.py ../backend
    python3 -B backend/test_simpanan.py ../backend

`backend/test_peringatan.py` dan `make-peringatan.py` butuh contoh XML resmi BMKG (github.com/infoBMKG/data-cap)
sebagai argumen kedua; contoh itu tidak disertakan di sini. `data-peta/*.mjs` butuh
`npm install world-atlas topojson-client d3-geo i18n-iso-countries` di foldernya.

Catatan: alat ini dibuat dan dijalankan di Linux dengan Chromium tanpa layar. Di mesin lain belum pernah dijalankan.
