import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const SR = `${AKAR}/tfael-omni/src/components/sitrep`;
const { buildGazetteer, locate, parseBmkgWilayah, tokenize } = await import(`${SR}/geo-names.ts`);
const { classify } = await import(`${SR}/classify.ts`);
const R = await import(`${SR}/reports.ts`);
const fx = await import('./fixture-real.mjs');
const rows = JSON.parse(readFileSync(`${SR}/geo/kabkota.json`, 'utf8'));
const prov = JSON.parse(readFileSync(`${SR}/geo/indonesia-provinsi.json`, 'utf8'));
const anchors = Object.fromEntries(prov.features.map(f => [f.id, f.properties.anchor]));
const g = buildGazetteer(rows);
let fail = 0;
const check = (name, got, want) => { if (got !== want) { fail++; console.log(`  ✗ ${name}\n      got:  ${got}\n      want: ${want}`); } };
const locStr = l => (l ? `${l.prov}|${l.place ? l.place.name : '-'}|${l.label}|${l.via}` : 'null');

// 0) duplikat kunci di tabel ALIASES (JS diam-diam menimpa)
const src = readFileSync(`${SR}/geo-names.ts`, 'utf8');
const block = src.slice(src.indexOf('const ALIASES'), src.indexOf('/** Butuh penanda apa pun'));
const keys = [...block.matchAll(/^\s+'([^']+)':\s*\[/gm)].map(m => m[1]);
const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
check('ALIASES tanpa kunci ganda', dup.join(','), '');
console.log(`gazetteer: ${g.places.length} kab/kota, ${[...g.byFirst.values()].reduce((a, b) => a + b.length, 0)} kunci, ${keys.length} entri alias`);

// 1) data nyata
console.log('\n── 40 berita nyata ──');
const news = R.normalizeNews(fx.news, g, fx.capturedAt);
for (const r of news.items) {
  const loc = r.loc ? `${r.loc.label}${r.loc.place && r.loc.place.name !== r.loc.label ? ` → ${r.loc.place.name}` : ''}, ${r.loc.prov} (${r.loc.via})` : '—';
  console.log(`${(r.incident ? r.label : '·').padEnd(14)} ${loc.padEnd(46)} ${r.title.slice(0, 70)}`);
}
const byTitle = t => news.items.find(r => r.title.startsWith(t));
const exp = [
  ['Lanal Ranai-Natuna', 'kebakaran', 'KR|Natuna'],
  ['BP Tapera', 'lain', 'KR|-'],
  ['Pemkab Kepulauan Seribu', 'lain', 'JK|Kepulauan Seribu'],
  ['Prabowo serukan perbaikan', 'lain', 'null'],
  ['OJK Cirebon', 'lain', 'JB|Cirebon'],
  ['Gunung Dukono', 'bencana', 'MU|Halmahera Utara'],
  ['AS, China bahas', 'lain', 'null'],
  ['Dokter Tifa', 'lain', 'null'],
  ['Lowongan Kerja PPPA', 'lain', 'JK|-'],
  ['Enam Napi Target', 'keamanan', 'KU|Tarakan'],
  ['Hitung-hitungan Politik', 'lain', 'null'],
  ['Iran Tampilkan', 'lain', 'null'],
  ['Kursi Wapres Kosong', 'lain', 'null'],
  ['Uya Kuya', 'lain', 'JK|-'],
  ['BNI Hadirkan', 'lain', 'NB|Lombok Tengah'],
  ['Satgas PRR', 'bencana', 'AC|Aceh Utara'],
  ['Ahmad Luthfi Targetkan', 'lain', 'JT|-'],
  ['DPRD Kota Bandung', 'lain', 'JB|Bandung'],
  ['Ahmad Luthfi Dorong', 'kebakaran', 'JT|Temanggung'],
  ['Konsep Glow', 'lain', 'null'],
  ['Flyover Pesing', 'lain', 'JK|Jakarta Barat'],
  ['Barantin Gagalkan', 'keamanan', 'BT|Tangerang'],
  ['Zverev', 'lain', 'null'],
  ['Portugal Lanjut', 'lain', 'null'],
];
for (const [t, cat, loc] of exp) {
  const r = byTitle(t);
  assert(r, `berita tidak ditemukan: ${t}`);
  check(`jenis: ${t}`, r.cat, cat);
  check(`lokasi: ${t}`, r.loc ? `${r.loc.prov}|${r.loc.place ? r.loc.place.name : '-'}` : 'null', loc);
}
const inc = news.items.filter(r => r.incident);
console.log(`\ninsiden: ${inc.length} · berlokasi: ${news.items.filter(r => r.loc).length}/${news.items.length} · waktu terbaca: ${news.items.filter(r => r.time).length}`);
check('semua pubDate terbaca', news.items.filter(r => r.time === null).length, 0);
check('entitas HTML didekode', news.items.some(r => /&nbsp;|&amp;/.test(r.summary)), false);

// 2) gempa BMKG
console.log('\n── gempa BMKG ──');
const quakes = R.normalizeQuakes(fx.gempa, g, fx.capturedAt, anchors);
for (const q of quakes.items) console.log(`M${q.mag.toFixed(1)} ${String(q.depthKm).padStart(4)} km  ${(q.prov ?? '??')}  ${q.place}`);
const qexp = {
  '116 km TimurLaut HALMAHERASELATAN-MALUT': ['116 km timur laut Halmahera Selatan, Maluku Utara', 'MU'],
  '69 km BaratLaut KEBARMANOKWARI-PAPUABRT': ['69 km barat laut Kebar, Manokwari, Papua Barat', 'PB'],
  '90 km BaratDaya TANIMBAR': ['90 km barat daya Kepulauan Tanimbar', 'MA'],
  '20 km BaratLaut SERAMBAGIANTIMUR-MALUKU': ['20 km barat laut Seram Bagian Timur, Maluku', 'MA'],
  '1 km BaratDaya TOMOHON-SULUT': ['1 km barat daya Tomohon, Sulawesi Utara', 'SA'],
  '153 km Tenggara OKSIBIL-PAPUAPGNGN': ['153 km tenggara Oksibil, Papua Pegunungan', 'PE'],
  '187 km BaratLaut TAHUNA-KEP.SANGIHE-SULUT': ['187 km barat laut Tahuna, Kepulauan Sangihe, Sulawesi Utara', 'SA'],
  '221 km BaratLaut PULAUKARATUNG-SULUT': ['221 km barat laut Pulau Karatung, Sulawesi Utara', 'SA'],
  '136 km BaratDaya GUNUNGKIDUL-DIY': ['136 km barat daya Gunungkidul, DI Yogyakarta', 'YO'],
  '6 km BaratLaut LEBONG-BENGKULU': ['6 km barat laut Lebong, Bengkulu', 'BE'],
  '62 km TimurLaut MALUKUBRTDAYA': ['62 km timur laut Maluku Barat Daya', 'MA'],
  '59 km BaratDaya MEULABOH-ACEHBARAT': ['59 km barat daya Meulaboh, Aceh Barat', 'AC'],
  '139 km BaratLaut TUAL-MALUKU': ['139 km barat laut Tual, Maluku', 'MA'],
};
for (const [raw, [text, pv]] of Object.entries(qexp)) {
  const p = parseBmkgWilayah(g, raw);
  check(`bmkg teks: ${raw}`, p.text, text);
  check(`bmkg prov: ${raw}`, p.prov, pv);
}

// 3) kasus sulit
console.log('\n── kasus sulit (lokasi) ──');
const L = [
  // dari data langsung 14 Nov 2026
  ['Canda Prabowo: Bintang 4, Presiden tapi di Muhammadiyah Anggota', 'Presiden Prabowo Subianto melontarkan candaan saat membuka Tanwir dan Milad ke-114 Muhammadiyah di Palu, menegaskan perannya sebagai anggota organisasi.', 'ST|Palu'],
  ['Insiden Tower Crane Jatuh di Kuningan, Polisi Periksa Kontraktor', 'Kepolisian memeriksa kontraktor terkait insiden tower crane jatuh di Mega Kuningan, Jakarta, yang menewaskan satu pekerja.', 'JK|-'],
  ['Tower Crane Jatuh, Proyek di Mega Kuningan Dihentikan Sementara', 'Tower crane jatuh di Mega Kuningan, Jakarta Selatan, menewaskan seorang pekerja.', 'JK|Jakarta Selatan'],
  ['FOTO: Hiu Paus 8 Meter Mati Terdampar di Pantai Tenjolaya Banten', 'Seekor hiu paus panjang diperkirakan 8 meter terdampar di Pantai Tenjolaya, Kabupaten Lebak, Banten, Jumat (13/11).', 'BT|Lebak'],
  ['Yang Tak Sempat Dibaca Jakarta tampil di Padang', 'Pengunjung melihat karya seni rupa pada pameran Yang Tak Sempat Dibaca Jakarta di Galeri Taman Budaya Sumatera Barat di ...', 'SB|Padang'],
  ['PNM Ajak Keluarga Karyawan di MABAR 2026 untuk Perkuat Kebersamaan di Lingkungan Kerja', '', 'null'],
  ['Demokrat Jonathan Kreiss-Tomkins menang pemilihan gubernur Alaska', '', 'null'],
  ['Israel Serang Iran, Harga Minyak Naik', '', 'null'],
  ['Kebakaran Pabrik di Serang, 3 Orang Luka', '', 'BT|Serang'],
  ['Polisi Buru Pelaku Penembakan di Yahukimo', '', 'PE|Yahukimo'],
  ['Polisi Sita 5 Kg Sabu dari Kurir Asal Aceh', '', 'AC|-'],
  ['Kisah Seram Rumah Kosong di Bandung', '', 'JB|Bandung'],
  ['Medan Berat Hambat Evakuasi Korban Longsor di Luwu', '', 'SN|Luwu'],
  ['Banjir Rendam Medan, Ribuan Warga Mengungsi', '', 'SU|Medan'],
  ['Nasib Malang Bocah Korban Banjir Demak', '', 'JT|Demak'],
  ['Polda Metro Jaya Tangkap Komplotan Begal', '', 'JK|-'],
  ['Karo Penmas Polri: Kasus Masih Diselidiki', '', 'null'],
  ['Brigjen A, Karo Penmas Divisi Humas Polri, Sebut Pelaku Ditangkap', '', 'null'],
  ['Erupsi Gunung Sinabung di Karo, Warga Dievakuasi', '', 'SU|Karo'],
  ['Warung Nasi Padang di Bekasi Terbakar', '', 'JB|Bekasi'],
  ['Tawuran Pecah di Manggarai, Dua Orang Luka', '', 'null'],
  ['Bupati Manggarai Tinjau Lokasi Longsor', '', 'NT|Manggarai'],
  ['KPK Geledah Kantor di Kuningan, Jakarta Selatan', '', 'JK|Jakarta Selatan'],
  ['Gelombang Tinggi di Pesisir Selatan Jawa, BMKG Imbau Nelayan', '', 'null'],
  ['Jalur Puncak Macet Total Saat Libur Panjang', '', 'JB|Kab. Bogor'],
  ['KKB Tembak Warga di Kabupaten Puncak, Papua Tengah', '', 'PT|Puncak'],
  ['Gempa M 5,4 Guncang Papua Nugini', '', 'null'],
  ['Banjir di Malaysia Meluas, 3 WNI Dievakuasi', '', 'null'],
  ['Pemprov Kalimantan Timur Siapkan Anggaran IKN', '', 'KI|-'],
  ['Kebakaran Lahan di Kalimantan Meluas', '', 'null'],
  ['Persib Bandung Kalahkan Bali United 2-1', '', 'null'],
  ['Harga Batu Bara Naik, Emiten Tambang Dari Batu Bara Untung', '', 'null'],
  ['Banjir Rob Rendam Pekalongan dan Semarang', '', 'JT|Pekalongan'],
  ['Banjir Jawa Tengah: Ribuan Rumah Terendam', 'Banjir merendam ribuan rumah di Kabupaten Demak, Jawa Tengah, sejak Senin.', 'JT|Demak'],
  ['Longsor Tutup Jalan Trans Sulawesi', 'Longsor menutup jalan Trans Sulawesi di Kabupaten Parigi Moutong, Sulawesi Tengah.', 'ST|Parigi Moutong'],
  ['Pengamat: Koalisi Perlu Hitung Ulang', 'Direktur Eksekutif Al-Jabar Strategic menilai koalisi perlu berhitung.', 'null'],
  ['Demo Buruh di Depan Gedung DPR Ricuh', '', 'JK|Jakarta Pusat'],
  ['Kapal Tenggelam di Perairan Kepulauan Seribu, 2 Hilang', '', 'JK|Kepulauan Seribu'],
  ['Gempa Guncang Kota Batu dan Malang', '', 'JI|Batu'],
  ['Jembatan Putus di Kab. Lebak Akibat Banjir Bandang', '', 'BT|Lebak'],
  ['Kecelakaan Beruntun di Tol Cipali, 4 Tewas', '', 'null'],
  ['Gunung Semeru Erupsi, Awan Panas Meluncur 5 Km', '', 'JI|Lumajang'],
  ['Gunung Lewotobi Laki-laki Meletus Lagi', '', 'NT|Flores Timur'],
  ['Wali Kota Solo Tinjau Banjir', '', 'JT|Surakarta'],
  ['Konser Solo Perdana Raisa Digelar Meriah', '', 'null'],
  ['Penyelundupan 20 Kg Sabu Digagalkan di Pelabuhan Tanjung Priok', '', 'JK|Jakarta Utara'],
  ['Pencarian Korban Longsor di Tana Toraja Dihentikan', '', 'SN|Tana Toraja'],
  ['Kopi Toraja Tembus Pasar Eropa', '', 'null'],
  ['Mie Aceh Jadi Favorit di Festival Kuliner', '', 'null'],
  ['Kebakaran di Kota Baru Parahyangan', '', 'null'],
  ['Bentrok Warga di Kabupaten Banjar, 1 Tewas', '', 'KS|Kab. Banjar'],
  ['Warga Sorong Blokade Jalan Tuntut Ganti Rugi', '', 'PD|Sorong'],
  ['Kontak Tembak TNI dan KKB di Intan Jaya', '', 'PT|Intan Jaya'],
  ['Banjir Bandang Terjang Sumbar, 3 Kabupaten Terdampak', '', 'SB|-'],
  ['Kebakaran Hutan di Riau dan Kepulauan Riau', '', 'RI|-'],
  ['Angin Puting Beliung Rusak 40 Rumah di Sidrap', '', 'SN|Sidenreng Rappang'],
  ['Laka Lantas di Jalan Daan Mogot, Pemotor Tewas', '', 'JK|Jakarta Barat'],
];
for (const [title, sum, want] of L) {
  const l = locate(g, title, sum);
  check(`lokasi: ${title}`, l ? `${l.prov}|${l.place ? l.place.name : '-'}` : 'null', want);
}
console.log('── kasus sulit (jenis) ──');
const C = [
  ['Prabowo Bicara Demokrasi di Depan Kader Demokrat', '', 'lain|'],
  ['Enam Napi Dipindahkan ke Lapas Baru', '', 'lain|'],
  ['Tetapi Pemerintah Belum Memutuskan', 'Seluruh lapisan masyarakat diminta sabar.', 'lain|'],
  ['Demo Buruh di Depan Gedung DPR Ricuh', '', 'unras|Unjuk rasa'],
  ['Demo Masak Chef Juna Ramaikan Festival', '', 'lain|'],
  ['Gempa M 7,1 Guncang Jepang, Peringatan Tsunami Dikeluarkan', '', 'lain|'],
  ['Simulasi Gempa dan Tsunami Digelar di Padang', '', 'lain|'],
  ['Antisipasi Banjir, Pemkot Bekasi Keruk Kali', '', 'lain|'],
  ['Banjir Bandang Terjang Sumbar, 3 Kabupaten Terdampak', '', 'bencana|Banjir'],
  ['Kebakaran Hutan di Riau Meluas', '', 'kebakaran|Karhutla'],
  ['Pasar Senen Terbakar, 20 Unit Damkar Dikerahkan', '', 'kebakaran|Kebakaran'],
  ['Kapal Tenggelam di Perairan Kepulauan Seribu, 2 Hilang', '', 'kecelakaan|Kapal tenggelam'],
  ['Kontak Tembak TNI dan KKB di Intan Jaya', '', 'keamanan|Penembakan'],
  ['Polisi Sita 5 Kg Sabu dari Kurir Asal Aceh', '', 'keamanan|Narkoba'],
  ['Bupati Sabu Raijua Resmikan Pasar', '', 'lain|'],
  ['IHSG Anjlok 2 Persen, Rupiah Ambruk', '', 'lain|'],
  ['Kereta Anjlok di Cirebon, Perjalanan Terganggu', '', 'kecelakaan|Kecelakaan'],
  ['Barantin Gagalkan Pengeluaran 180 Ribu Benih Lobster di Bandara Soetta', 'Badan Karantina Indonesia gagalkan pengeluaran benih lobster, dukung pemberantasan penyelundupan.', 'keamanan|Penyelundupan'],
  ['Pemain Persib Terbakar Semangat Jelang Derbi', '', 'lain|'],
  ['Warga Geruduk Kantor Bupati Tuntut Perbaikan Jalan', '', 'unras|Unjuk rasa'],
  ['Tawuran Pelajar di Bogor, Satu Tewas', '', 'unras|Bentrok'],
  ['Gunung Semeru Erupsi, Awan Panas Meluncur 5 Km', '', 'bencana|Erupsi'],
  ['Angin Puting Beliung Rusak 40 Rumah di Sidrap', '', 'bencana|Cuaca ekstrem'],
  ['Badai PHK Hantam Industri Tekstil', '', 'lain|'],
  // dari data langsung 14 Nov 2026 (belum pernah dilihat saat aturan ditulis)
  ['Tower Crane Jatuh, Proyek di Mega Kuningan Dihentikan Sementara', 'Tower crane jatuh di Mega Kuningan, Jakarta Selatan, menewaskan seorang pekerja.', 'kecelakaan|Kecelakaan kerja'],
  ['Insiden Tower Crane Jatuh di Kuningan, Polisi Periksa Kontraktor', '', 'kecelakaan|Kecelakaan kerja'],
  ['Jasad Teknisi yang Tenggelam di Kalimalang Bekasi Ditemukan Setelah Tiga Hari Pencarian', '', 'kecelakaan|Tenggelam'],
  ['Dugaan Pemerkosaan Bupati Kupang, Polisi Periksa 2 Pengantar Korban', '', 'keamanan|Kekerasan seksual'],
  ['Prabowo Ngaku Diserang Buzzer Tiap Malam: Uang Besar Biayai Itu Semua', '', 'lain|'],
  ['PBB suarakan keprihatinan serangan drone terhadap warga sipil di Yaman', '', 'lain|'],
  ['FOTO: Hiu Paus 8 Meter Mati Terdampar di Pantai Tenjolaya Banten', '', 'lain|'],
  ['Harga Cabai Jatuh, Petani Merugi', '', 'lain|'],
  ['Jatuh Bangun UMKM Batik di Pekalongan', '', 'lain|'],
  ['Buruh Bangunan Tewas Tersengat Listrik di Depok', '', 'kecelakaan|Kecelakaan kerja'],
  ['Panggung Roboh Saat Konser di Bogor, 5 Luka', '', 'kecelakaan|Bangunan runtuh'],
];
for (const [title, sum, want] of C) {
  const c = classify(title, sum);
  check(`jenis: ${title}`, `${c.cat}|${c.label}`, want);
}

// 4) simulasi
const mockNews = R.normalizeNews([{ id: 'mock_0', title: 'Gempa M5.2 Guncang Cianjur', source: 'Kompas', summary: 'x', url: '#', pubDate: '' }], g, Date.now());
check('berita tiruan ditolak', `${mockNews.items.length}/${mockNews.simulated}`, '0/1');
const mockQ = R.normalizeQuakes([{ id: 'g1', mag: 5.2, depth: '10 km', location: 'Cianjur, Jawa Barat', lat: -6.82, lon: 107.14, datetime: '' }], g, Date.now(), anchors);
check('gempa tiruan ditolak', `${mockQ.items.length}/${mockQ.simulated}`, '0/1');

// 5) jendela waktu
const now = fx.capturedAt;
const w = k => `${news.items.filter(r => R.inWindow(r, k, now)).length}n/${quakes.items.filter(q => R.inWindow(q, k, now)).length}q`;
console.log(`\njendela: 24j=${w('24h')}  7h=${w('7d')}  semua=${w('all')}`);
check('jendela 24 jam', w('24h'), '32n/0q');
check('jendela 7 hari', w('7d'), '32n/4q');
check('jendela semua', w('all'), '40n/15q');

// 6) peringatan dini cuaca BMKG — atas jawaban fetch_bmkg_warnings() yang sebenarnya untuk contoh XML resmi BMKG
const P = await import(`${SR}/peringatan.ts`);
const base = JSON.parse(readFileSync(new URL('peringatan-dasar.json', import.meta.url), 'utf8'));
const t0 = Date.parse(base.now);
const rawW = base.response.warnings;
const provinceAt = P.makeProvinceLocator(prov.features);
for (const [nama, lon, lat, want] of [['Monas', 106.827, -6.175, 'JK'], ['Bandung', 107.61, -6.91, 'JB'], ['Depok', 106.82, -6.40, 'JB'],
  ['Pamulang', 106.73, -6.345, 'BT'], ['Jayapura', 140.70, -2.55, 'PA'], ['Batam', 104.03, 1.08, 'KR'], ['Samosir (pulau di Danau Toba)', 98.75, 2.60, 'SU'],
  ['Laut Jawa', 110.0, -5.0, null], ['Kuala Lumpur', 101.69, 3.14, null]]) check(`provinsi dari titik: ${nama}`, provinceAt(lon, lat), want);
for (const [area, want] of [['Jawa Timur', 'JI'], ['Kep. Riau', 'KR'], ['Kep. Bangka Belitung', 'BB'], ['DI Yogyakarta', 'YO'], ['Jabodetabek', 'JK'],
  ['DKI Jakarta', 'JK'], ['Papua Barat Daya', 'PD'], ['Papua Barat', 'PB'], ['Riau', 'RI'], ['Nusa Tenggara Barat', 'NB'], ['Sumatera Utara', 'SU'],
  ['Perairan Selat Sunda', null], ['', null]]) check(`provinsi dari nama wilayah: "${area}"`, P.provinceOfArea(area), want);
check('semua wilayah di contoh BMKG dikenali', rawW.filter(x => !P.provinceOfArea(x.area)).map(x => x.area).join(','), '');

const ws = P.normalizeWarnings(rawW, t0, anchors, provinceAt);
check('contoh BMKG: 22 peringatan berlaku pada t0', ws.length, 22);
check('urut: yang paling cepat berakhir dulu', ws.every((x, i) => i === 0 || ws[i - 1].end <= x.end), true);
check('wilayah unik, urut abjad', `${P.warnedAreas(ws).length}|${P.warnedAreas(ws).slice(0, 4).join(',')}`, '19|Aceh,Bali,Banten,Bengkulu');
const jb = ws.find(x => x.area === 'Jawa Barat');
check('Jabar: 29 poligon asli', jb.polygons.length, 29);
check('Jabar: provinsi dari poligon', jb.provs.join(','), 'JB');
check('Jabar: tanda berada di daratan Jawa Barat', provinceAt(...jb.center), 'JB');
check('Jabar: tanda adalah pusat salah satu poligon', jb.polygons.some(r => Math.min(...r.map(p => p[0])) <= jb.center[0] && Math.max(...r.map(p => p[0])) >= jb.center[0] && Math.min(...r.map(p => p[1])) <= jb.center[1] && Math.max(...r.map(p => p[1])) >= jb.center[1]), true);
check('Jabar: jenis ditulis sebagai kalimat', jb.event, 'Hujan lebat disertai petir');
check('Jabar: tautan infografik BMKG dipakai', jb.infographic, 'https://nowcasting.bmkg.go.id/infografis/CJB/2025/10/13/infografis.jpg');
check('Jabar: ringkasan lokasi', jb.places.replace(/^\d+/, 'N'), 'N lokasi, antara lain Bantargadung, Campakamulya, Cibeureum');
check('lokasi: singkatan bertitik ("Bl. Limbangan") tidak memutus daftar', P.listedPlaces('Hujan lebat disertai petir akan terjadi pada 13 October 2025, 12:23 WIB di sebagian wilayah Jawa Barat, khususnya di Babakancikao, Bl. Limbangan, Bungursari. Kondisi ini berpotensi menimbulkan dampak.').join('|'), 'Babakancikao|Bl. Limbangan|Bungursari');
check('Jabar: jumlah lokasi = jumlah nama di uraian', Number(/^\d+/.exec(jb.places)[0]), P.listedPlaces(jb.description).length);
const ji = ws.find(x => x.id === 'w:CJT20251012004');
check('Jatim (tanpa rincian): tidak ada poligon, tanda di jangkar provinsi', `${ji.polygons.length}|${ji.center.join(',')}`, `0|${anchors.JI.join(',')}`);
check('Jatim: provinsi dari nama', `${ji.prov}|${ji.provs.join(',')}`, 'JI|JI');
check('Jatim: ringkasan lokasi', ji.places, '54 lokasi, antara lain Ajung, Ambulu, Balung');
check('Jatim: belum mulai pada 15.40 WIB', P.warnWhen(ji, t0), 'mulai 16.00');
check('Jatim: sudah mulai pada 16.10 WIB', P.warnWhen(ji, t0 + 30 * 60_000), 'sampai 18.00');
check('Jatim: rentang berlaku', P.warnSpan(ji), 'Berlaku 16.00–18.00 WIB');
check('lewat masa berlaku → dibuang', P.normalizeWarnings(rawW, t0 + 6 * 3_600_000, anchors, provinceAt).length, 0);
check('tepat pada jam berakhir → dibuang', P.normalizeWarnings([rawW[0]], Date.parse(rawW[0].expires), anchors).length, 0);
check('id ganda → satu', P.normalizeWarnings([...rawW, rawW[0], rawW[5]], t0, anchors).length, 22);
const later = new Date(t0 + 3_600_000).toISOString();
const mk = (id, extra) => ({ id, event: 'Hujan Lebat disertai Petir', area: 'Bali', expires: later, ...extra });
const evil = P.normalizeWarnings([mk('a', { infographic: 'https://bmkg.go.id.contoh.test/x.jpg' }), mk('b', { infographic: 'javascript:alert(1)' }),
  mk('c', { infographic: 'http://nowcasting.bmkg.go.id/x.jpg' }), mk('d', { infographic: 'https://contoh.test/?u=https://www.bmkg.go.id/' }),
  mk('e', { infographic: 'https://www.bmkg.go.id/infografis/x.jpg' })], t0, anchors);
check('tautan infografik: hanya https di bmkg.go.id', evil.map(x => (x.infographic ? 'ya' : '-')).join(''), '----ya');
check('tanpa jam berakhir / tanpa jenis → dibuang', P.normalizeWarnings([{ id: 'x', event: 'Hujan', area: 'Bali' }, { id: 'y', area: 'Bali', expires: later }, { id: 'z', event: 'Hujan', area: 'Bali', expires: 'kapan-kapan' }], t0, anchors).length, 0);
const rusak = P.normalizeWarnings([mk('p', { polygons: [[[115.2, -8.6], [115.3, 'a'], [115.3, -8.7]], 'bukan', [[200, 0], [1, 1], [2, 2], [3, 3]], null] })], t0, anchors, provinceAt)[0];
check('poligon rusak diabaikan, tanda jatuh ke jangkar provinsi', `${rusak.polygons.length}|${rusak.center.join(',')}`, `0|${anchors.BA.join(',')}`);
const kotak = (lon, lat, r = 0.02) => [[lon - r, lat - r], [lon + r, lat - r], [lon + r, lat + r], [lon - r, lat + r], [lon - r, lat - r]];
const jk = P.normalizeWarnings([mk('jk', { area: 'Jabodetabek', polygons: [kotak(106.845, -6.285), kotak(106.82, -6.40), kotak(106.73, -6.345)] })], t0, anchors, provinceAt)[0];
check('Jabodetabek: provinsi dari poligon (lintas provinsi)', [...jk.provs].sort().join(','), 'BT,JB,JK');
const laut = P.normalizeWarnings([mk('l', { area: 'Perairan Selat Sunda', polygons: [kotak(105.5, -6.0)] })], t0, anchors, provinceAt)[0];
check('wilayah bukan provinsi, poligon di laut: tanpa provinsi tetapi tetap bisa dipetakan', `${laut.prov}|${laut.provs.length}|${laut.center.join(',')}`, 'null|0|105.5,-6');
const takDikenal = P.normalizeWarnings([mk('t', { area: 'Perairan Selat Sunda' })], t0, anchors, provinceAt)[0];
check('wilayah tak dikenal tanpa poligon: tidak bisa dipetakan', takDikenal.center, null);
// kepulauan: rata-rata poligon jatuh di laut, tanda harus tetap di salah satu poligon
const kr = P.normalizeWarnings([mk('kr', { area: 'Kep. Riau', polygons: [kotak(104.03, 1.08), kotak(108.2, 3.9), kotak(104.5, -0.2)] })], t0, anchors, provinceAt)[0];
check('kepulauan: tanda di poligon paling tengah, bukan di laut', provinceAt(...kr.center), 'KR');
check('perkiraan jam berakhir ditandai', P.warnWhen({ ...ji, endEstimated: true }, t0 + 30 * 60_000) + ' / ' + P.warnSpan({ ...ji, endEstimated: true }), 'sampai sekitar 18.00 / Berlaku 16.00–sekitar 18.00 WIB');
check('lokasi: kalimat "Dan dapat meluas" tidak ikut', P.listedPlaces('Hujan lebat akan terjadi di sebagian wilayah X, khususnya di A, B. Dan dapat meluas ke wilayah C, D. Kondisi ini berpotensi banjir.').join('|'), 'A|B');
check('lokasi: pola tak dikenal → kosong', P.listedPlaces('Waspada hujan lebat di Bali.').length, 0);
check('lokasi: empat atau kurang ditulis semua', P.normalizeWarnings([mk('q', { description: 'Hujan akan terjadi di sebagian wilayah Bali, khususnya di Kuta, Mengwi, Ubud. Kondisi ini berpotensi banjir.' })], t0, anchors)[0].places, 'Kuta, Mengwi, Ubud');

if (process.argv.includes('--keys')) {
  const single = [...g.byFirst.values()].flat().filter(e => e.tokens.length === 1 && e.prov && e.tier <= 2).map(e => e.tokens[0]).sort();
  console.log(`\nkunci satu kata yang diterima tanpa penanda (${single.length}):\n` + single.join(' '));
}
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS');
process.exit(fail ? 1 : 0);
