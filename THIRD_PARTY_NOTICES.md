# Catatan Pihak Ketiga / Third-Party Notices

Kode TFAEL-OMNI dirilis dengan [lisensi MIT](LICENSE). Berkas di bawah ini berasal dari pihak lain dan tetap mengikuti lisensinya masing-masing.

The TFAEL-OMNI code is released under the [MIT license](LICENSE). The files below come from other parties and keep their own licenses.

## Font / Fonts

| Font | Lokasi / Path | Pemegang hak cipta / Copyright holder | Lisensi / License |
|---|---|---|---|
| Chivo | `tfael-omni/public/fonts/chivo-*.woff2` | The Chivo Project Authors | SIL Open Font License 1.1, lihat / see [`OFL.txt`](tfael-omni/public/fonts/OFL.txt) |
| JetBrains Mono | `tfael-omni/public/fonts/jetbrains-mono-*.woff2` | The JetBrains Mono Project Authors | SIL Open Font License 1.1, lihat / see [`OFL.txt`](tfael-omni/public/fonts/OFL.txt) |
| IBM Plex Sans, IBM Plex Mono | `tfael-omni/src/components/sitrep/fonts/` | IBM Corp. | SIL Open Font License 1.1, lihat / see [`OFL.txt`](tfael-omni/src/components/sitrep/fonts/OFL.txt) |

## Data peta / Map data

Semua berkas berada di `tfael-omni/src/components/sitrep/geo/`. All files are in `tfael-omni/src/components/sitrep/geo/`.

| Berkas / File | Sumber / Source | Lisensi / License |
|---|---|---|
| `indonesia-provinsi.json` | geoBoundaries gbOpen IDN ADM2 (BPS, WFP, OCHA ROAP). Diubah: 514 kabupaten/kota dilebur menjadi 38 provinsi dan garisnya disederhanakan. Modified: 514 regencies and cities dissolved into 38 provinces, with simplified outlines. | CC BY 3.0 IGO |
| `kabkota.json` | Nama dan titik label kabupaten/kota, disusun bersama data batas di atas. Asalnya tidak dicatat terpisah. Names and label points of regencies and cities, prepared together with the boundary data above. Its origin is not recorded separately. | Mengikuti data batas di atas / Follows the boundary data above |
| `konteks-daratan.json`, `dunia-negara.json`, `dunia-titik.json` | Natural Earth 1:50m, melalui paket / via the `world-atlas` 2.0.2 package (ISC) | Domain publik / Public domain |

## Layanan dan data saat aplikasi berjalan / Services and data used at runtime

Bahan berikut tidak ikut di repo ini. Aplikasi mengambilnya saat berjalan, dan pemakaiannya tunduk pada ketentuan tiap penyedia.

The following are not included in this repo. The app fetches them at runtime, and their use is subject to each provider's terms.

| Layanan / Service | Dipakai untuk / Used for | Catatan / Note |
|---|---|---|
| BMKG | Gempa dan peringatan dini cuaca / Earthquakes and early weather warnings | Data terbuka; BMKG wajib disebut sebagai sumber. Open data; BMKG must be credited as the source. |
| OpenStreetMap | Ubin peta dan Nominatim / Map tiles and Nominatim | © OpenStreetMap contributors, ODbL |
| Esri World Imagery | Citra satelit / Satellite imagery | Ketentuan Esri / Esri terms of use |
| OpenFreeMap, AWS Terrain Tiles | Peta 3D di aplikasi Android / 3D map in the Android app | Ketentuan tiap penyedia / Each provider's terms |
| OpenCellID, Unwired Labs | Geolokasi menara seluler / Cell-tower geolocation | Data OpenCellID berlisensi CC BY-SA 4.0; Unwired Labs memerlukan kunci API sendiri. OpenCellID data is CC BY-SA 4.0; Unwired Labs needs your own API key. |
| X (Twitter) API | Pengambilan data media sosial / Social media collection | Ketentuan layanan X / X terms of service |

## Pustaka / Libraries

Pustaka Python, JavaScript, dan Android tidak disertakan di repo ini. Pustaka tersebut dipasang melalui pip, npm, dan Gradle, dan masing-masing mengikuti lisensinya sendiri. Pustaka opsional ultralytics (YOLO) berlisensi AGPL-3.0.

Python, JavaScript, and Android libraries are not included in this repo. They are installed through pip, npm, and Gradle, and each keeps its own license. The optional ultralytics (YOLO) library is licensed under AGPL-3.0.
