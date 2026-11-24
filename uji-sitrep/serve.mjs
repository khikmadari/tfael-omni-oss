// Server uji: menyajikan hasil build + API tiruan, dengan header CSP yang SAMA dengan backend/server.py.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import * as fx from './fixture-real.mjs';
import { provinceOfArea } from '../tfael-omni/src/components/sitrep/peringatan.ts';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)

const ROOT = `${AKAR}/frontend`;
const PORT = Number(process.env.PORT || 8099);
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.arcgisonline.com; connect-src 'self'; frame-ancestors 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

let scenario = 'real';
const MOCK_NEWS = [["Gempa M5.2 Guncang Cianjur","Kompas","gempa"],["Banjir Bandang di Garut","BNPB","banjir"],["Demo Mahasiswa Ricuh di DPR","Detik","nasional"]]
  .map(([t, s, c], i) => ({ id: `mock_${i}`, title: t, source: s, category: c, summary: t, url: '#', pubDate: '', ts: Date.now() / 1000 - i * 180 }));
const MOCK_GEMPA = [{ id: 'g1', type: 'gempa', mag: 5.2, depth: '10 km', location: 'Cianjur, Jawa Barat', lat: -6.82, lon: 107.14, datetime: '', felt: 'III-IV MMI', source: 'BMKG', severity: 'medium' }];
const MOCK_TICKER = [{ symbol: 'JKSE', price: 7250.5, change: -87.3, pct: -1.19, name: 'IHSG' }, { symbol: 'BBCA', price: 9875, change: 50, pct: 0.51, name: 'Bank BCA' }, { symbol: 'BBRI', price: 4820, change: -30, pct: -0.62, name: 'Bank BRI' }, { symbol: 'TLKM', price: 3680, change: 20, pct: 0.55, name: 'Telkom' }];

// Berita nyata dari backend pengguna 14 Nov 2026 20.29 WIB (judul dan ringkasan apa adanya): wilayah Jabodetabek padat.
const at = min => new Date(fx.capturedAt - min * 60_000).toUTCString();
const PADAT = [
  ['Tower Crane Jatuh, Proyek di Mega Kuningan Dihentikan Sementara', 'CNN-ID', ' Tower crane jatuh di Mega Kuningan, Jakarta Selatan, menewaskan seorang pekerja. Proyek dihentikan sementara, penyelidikan dan olah TKP sedang berlangsung.', 190],
  ['Insiden Tower Crane Jatuh di Kuningan, Polisi Periksa Kontraktor', 'CNN-ID', ' Kepolisian memeriksa kontraktor terkait insiden tower crane jatuh di Mega Kuningan, Jakarta, yang menewaskan satu pekerja. Penyelidikan masih berlangsung.', 310],
  ['Jasad Teknisi yang Tenggelam di Kalimalang Bekasi Ditemukan Setelah Tiga Hari Pencarian', 'Tribun', 'Jasad teknisi ditemukan tim SAR gabungan.', 28],
  ['DPR dorong Polda objektif usut dugaan kekerasan seksual Bupati Kupang', 'Antara', 'Anggota DPR meminta Polda NTT objektif.', 11],
  ['Dugaan Pemerkosaan Bupati Kupang, Polisi Periksa 2 Pengantar Korban', 'CNN-ID', 'Polisi memeriksa dua orang.', 55],
  ['Dilaporkan Kasus Pemerkosaan, Bupati Kupang Siap Diperiksa Polisi', 'CNN-ID', 'Bupati Kupang menyatakan siap diperiksa.', 180],
  ['FOTO: Hiu Paus 8 Meter Mati Terdampar di Pantai Tenjolaya Banten', 'CNN-ID', ' Seekor hiu paus panjang diperkirakan 8 meter terdampar di Pantai Tenjolaya, Kabupaten Lebak, Banten, Jumat (13/11).', 300],
].map(([title, source, summary, min], i) => ({ id: `padat_${i}`, title, source, category: 'nasional', summary, url: `https://contoh.test/padat/${i}`, pubDate: at(min), ts: 0 }));

// ── CCTV: katalog = 6 kamera halaman pertama portal ATCS Dishub Kab. Tangerang (nama dan koordinat perkiraan
//    sama dengan backend/engine_c2.py); frame = gambar uji buatan, jelas bukan rekaman.
const CAM = [['Jayanti 1 Arah Serang', 'Jayanti', -6.2490, 106.3340], ['Jayanti 2 Arah Gembong', 'Jayanti', -6.2505, 106.3375],
  ['Cikupa Kedaton 1', 'Cikupa', -6.2340, 106.5100], ['Cikupa Mas', 'Cikupa', -6.2385, 106.5160],
  ['Cisauk 1', 'Cisauk', -6.3215, 106.6410], ['Cisauk 2', 'Cisauk', -6.3245, 106.6455]]
  .map(([name, location, lat, lon], i) => {
    const id = `01uji${String(i).padStart(21, '0')}`;
    return { id, name, location, lat, lon, coord_approx: true, stream_url: `https://cctv-dishub.tangerangkab.go.id/storage/video/${id}/${id}.m3u8` };
  });
const FRAMES = ['frame-uji-1.jpg', 'frame-uji-2.jpg'].map(f => `data:image/jpeg;base64,${readFileSync(new URL(f, import.meta.url)).toString('base64')}`);
let frameNo = 0;
let frameMs = 350;   // lama server "mengambil gambar"; /__cctv?mode=ok&frameMs=1500 untuk menguji keadaan memuat
let sesiHabis = false;   // /__sesi?habis=1: semua API (kecuali login) menjawab 401, seperti sesi yang kedaluwarsa
let sitrepMs = 0;    // jeda jawaban berita/gempa/peringatan/katalog kamera; /__lambat?ms=1500 (server asli butuh beberapa detik saat cache dingin)
// ok = server baru: /cctv-detect mengirim gambar saja (detect_skipped), hitungan objek lewat /vision/detect
// server-lama = server yang belum dijalankan ulang: /cctv-detect langsung menyertakan hitungan dan mengabaikan detect:false
let cctv = 'ok';   // ok | server-lama | katalog-gagal | frame-gagal | tanpa-yolo | hitung-gagal | campur | portal-gagal | deteksi-lambat
// kotak [x1, y1, x2, y2] dalam piksel gambar uji 960x540 (letaknya buatan; gambar uji tidak berisi kendaraan)
const OBJEK = [['car', 0.91, [120, 300, 250, 380]], ['car', 0.88, [300, 260, 400, 330]], ['car', 0.84, [470, 250, 555, 310]], ['car', 0.77, [610, 330, 760, 430]], ['car', 0.62, [40, 20, 130, 80]],
  ['motorcycle', 0.81, [260, 400, 300, 470]], ['motorcycle', 0.74, [420, 350, 455, 410]], ['motorcycle', 0.58, [820, 380, 860, 450]], ['truck', 0.86, [640, 150, 900, 300]]]
  .map(([label, confidence, bbox]) => ({ label, confidence, bbox }));
function vision(path) {
  if (path.endsWith('/cctv-list')) {
    if (cctv === 'katalog-gagal') return { ok: false, error: 'Mode air-gap: katalog CCTV online dinonaktifkan.', cams: [] };
    if (cctv === 'portal-gagal') return { ok: true, cached: false, portal: 'ATCS Dishub Kabupaten Tangerang', portal_error: 'Gagal mengambil katalog: URLError: timed out',
      cams: [{ id: 'xdki1', name: 'Bundaran HI arah Sudirman', location: 'Menteng', source: 'CCTV Publik DKI', lat: -6.195, lon: 106.823, coord_approx: false, stream_url: 'https://contoh.test/hi/index.m3u8' }] };
    const cams = cctv === 'campur'
      ? [...CAM, { id: 'tanpa-posisi', name: 'Kamera tanpa koordinat', location: 'Balaraja', lat: null, lon: null, stream_url: 'https://contoh.test/a.m3u8' },
          { id: 'hanya-tautan', name: 'Bundaran HI (contoh tautan)', location: 'Menteng', source: 'CCTV Publik DKI', lat: -6.195, lon: 106.823, coord_approx: false, page_url: 'https://jakcctv.jakarta.go.id/publik' }]
      : CAM;
    return { ok: true, cached: false, portal: 'ATCS Dishub Kabupaten Tangerang', cams };
  }
  if (path.endsWith('/cctv-detect')) {
    if (cctv === 'frame-gagal') return { ok: false, error: 'Gagal membuka stream (URL kedaluwarsa / tak terjangkau).' };
    const src = FRAMES[frameNo++ % FRAMES.length];
    if (cctv === 'server-lama') return { ok: true, available: true, frame_wh: [960, 540], count: 9, summary: { motorcycle: 3, car: 5, truck: 1 }, detections: [], frame_b64: src };
    return { ok: true, available: false, reason: 'Deteksi tidak diminta.', frame_wh: [960, 540], count: 0, summary: {}, detections: [], frame_b64: src, detect_skipped: true, grab: 'hls-cepat', grab_ms: 420 };
  }
  if (path.endsWith('/vision/detect')) {
    if (cctv === 'hitung-gagal') return null;
    if (cctv === 'tanpa-yolo') return { ok: true, engine: 'yolov8', available: false, reason: 'ultralytics/Pillow tak terpasang', detections: [] };
    return { ok: true, engine: 'yolov8', available: true, detections: OBJEK, count: OBJEK.length };
  }
  return { ok: true };
}

// ── Peringatan dini cuaca BMKG ──
// Dasar: jawaban fetch_bmkg_warnings() yang sebenarnya atas contoh XML resmi BMKG (lihat make-peringatan.py),
// digeser ke jam palsu peramban. Hanya Jawa Barat yang poligonnya asli dari contoh BMKG; provinsi lain diberi
// BENTUK UJI (gumpalan di sekitar titik kab/kota, bukan batas kecamatan), dan dua dibiarkan tanpa poligon.
const KAB = JSON.parse(readFileSync(new URL('../tfael-omni/src/components/sitrep/geo/kabkota.json', import.meta.url), 'utf8'));
const WBASE = JSON.parse(readFileSync(new URL('peringatan-dasar.json', import.meta.url), 'utf8'));
const W_T0 = Date.parse(WBASE.now);
const W_REF = fx.capturedAt + 4 * 60_000;          // = jam palsu peramban saat halaman dibuka (shot.mjs)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ZONE = { WIB: 7, WITA: 8, WIT: 9 };
const lokal = (t, z) => {
  const l = new Date(t + ZONE[z] * 3600e3);
  return `${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}, ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')} ${z}`;
};
const geserTeks = (text, delta) => text.replace(/(\d{1,2}) ([A-Za-z]+) (\d{4}), (\d{2}):(\d{2}) (WIB|WITA|WIT)/g, (m, d, mon, y, hh, mm, z) => {
  const mi = MONTHS.indexOf(mon);
  return mi < 0 ? m : lokal(Date.UTC(+y, mi, +d, +hh - ZONE[z], +mm) + delta, z);
});
const rng = seed => { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
function gumpal(lon, lat, rad, seed) {
  const r = rng(seed); const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 2 * Math.PI; const k = rad * (0.65 + 0.6 * r());
    pts.push([+(lon + Math.cos(a) * k).toFixed(3), +(lat + Math.sin(a) * k * 0.9).toFixed(3)]);
  }
  pts.push(pts[0]);
  return pts;
}
function bentukUji(code, seed, max = 5) {
  const r = rng(seed);
  const rows = KAB.filter(k => k[1] === code).map(k => [r(), k]).sort((a, b) => a[0] - b[0]).slice(0, max).map(x => x[1]);
  return rows.map((k, i) => gumpal(k[2] + (r() - 0.5) * 0.08, k[3] + (r() - 0.5) * 0.08, 0.05 + r() * 0.07, seed * 31 + i));
}
const TANPA_POLIGON = new Set(['Bengkulu', 'Jambi']);
function daftarPeringatan({ poligon = true, uji = true } = {}) {
  const delta = W_REF - W_T0;
  const iso = v => (v ? new Date(Date.parse(v) + delta).toISOString() : v);
  const list = WBASE.response.warnings.map((w, i) => {
    const asli = w.polygons.length > 0;
    const code = provinceOfArea(w.area);
    const buatan = uji && !asli && code && !TANPA_POLIGON.has(w.area) ? bentukUji(code, 100 + i) : [];
    const polygons = poligon ? (asli ? w.polygons : buatan) : [];
    return { ...w, description: geserTeks(w.description, delta), issued: iso(w.issued), effective: iso(w.effective), expires: iso(w.expires),
      detail: polygons.length > 0, polygons };
  });
  // peringatan lintas provinsi (uji): Jakarta Selatan, Depok (Jawa Barat), Tangerang Selatan (Banten)
  const a = W_REF - 10 * 60_000, b = W_REF + 110 * 60_000;
  if (uji) list.push({
    id: 'CJK-UJI-001', title: 'Hujan Lebat disertai Petir di Jabodetabek', event: 'Hujan Lebat disertai Petir', area: 'Jabodetabek',
    description: `Hujan lebat disertai petir akan terjadi pada ${lokal(a, 'WIB')} di sebagian wilayah Jabodetabek, khususnya di Pasar Minggu, Jagakarsa, Beji, Pamulang. Kondisi ini berpotensi menimbulkan dampak berupa jarak pandang berkurang, angin kencang, dan banjir lokal. Masyarakat dihimbau untuk tetap waspada. Kondisi diperkirakan dapat berlangsung hingga ${lokal(b, 'WIB')}.`,
    issued: new Date(a - 20 * 60_000).toISOString(), effective: new Date(a).toISOString(), expires: new Date(b).toISOString(), expires_estimated: false,
    severity: 'Moderate', urgency: 'Immediate', certainty: 'Observed', infographic: 'https://contoh.test/bukan-bmkg.jpg', link: '', detail: poligon,
    polygons: poligon ? [gumpal(106.845, -6.285, 0.022, 7), gumpal(106.82, -6.335, 0.02, 8), gumpal(106.82, -6.40, 0.022, 9), gumpal(106.73, -6.345, 0.022, 10)] : [],
  });
  list.sort((x, y) => (x.expires < y.expires ? -1 : x.expires > y.expires ? 1 : 0));
  return list;
}
// beban terberat yang masuk akal: tiap peringatan membawa 29 poligon (746 titik) seperti contoh Jawa Barat
const POLI_JABAR = WBASE.response.warnings.find(w => w.polygons.length > 0).polygons;
const JABAR_C = [107.6, -6.9];
function daftarBerat() {
  return daftarPeringatan().map(w => {
    const code = provinceOfArea(w.area);
    const row = KAB.find(k => k[1] === code);
    if (!row || w.area === 'Jawa Barat') return w;
    const dx = row[2] - JABAR_C[0], dy = row[3] - JABAR_C[1];
    return { ...w, detail: true, polygons: POLI_JABAR.map(r => r.map(([x, y]) => [+(x + dx).toFixed(3), +(y + dy).toFixed(3)])) };
  });
}
// contoh-bmkg: hanya isi contoh resmi BMKG (tanpa bentuk uji, tanpa peringatan buatan) — dipakai untuk pratinjau ke pengguna
let peringatan = 'ok';   // ok | kosong | gagal | airgap | belum | tanpa-poligon | lambat | berat | contoh-bmkg
function peringatanBody() {
  if (peringatan === 'belum') return { __status: 404, __html: '<!DOCTYPE HTML><html><head><title>Error response</title></head><body><h1>Error response</h1><p>Error code: 404</p><p>Message: File not found: /api/v2/sitrep/peringatan.</p></body></html>' };
  if (peringatan === 'gagal') return { ok: false, error: 'Feed peringatan dini BMKG tidak terjangkau.', warnings: [] };
  if (peringatan === 'airgap') return { ok: false, error: 'Mode air-gap: peringatan dini BMKG tidak diambil.', warnings: [] };
  const warnings = peringatan === 'kosong' ? [] : peringatan === 'berat' ? daftarBerat()
    : daftarPeringatan({ poligon: peringatan !== 'tanpa-poligon', uji: peringatan !== 'contoh-bmkg' });
  return { ok: true, source: 'BMKG', source_url: 'https://www.bmkg.go.id/cuaca/peringatan-dini-cuaca', in_feed: 25, warnings };
}

function api(path) {
  if (path === '/api/v2/auth/session') return { ok: true, user: { username: 'analis', full_name: 'Analis Piket', role: 'admin' }, permissions: { view_siem: true, manage_users: true } };
  // login tiruan mesin uji: menerima apa pun, tidak ada akun sungguhan di sini
  if (path === '/api/v2/auth/login') return { ok: true, token: 'harness', user: { username: 'analis', full_name: 'Analis Piket', role: 'admin' }, permissions: { view_siem: true, manage_users: true } };
  if (path === '/api/v2/overview') return { units: [], alerts: [], targets: [] };
  if (path.startsWith('/api/v2/vision/')) return vision(path);
  if (path.startsWith('/api/v2/sitrep/')) {
    const what = path.split('/').pop();
    if (scenario === 'down') return null;
    if (what === 'peringatan') return peringatanBody();
    if (scenario === 'partial' && what === 'gempa') return null;
    if (scenario === 'mock') return { news: { news: MOCK_NEWS }, gempa: { gempa: MOCK_GEMPA }, ticker: { ticker: MOCK_TICKER } }[what];
    if (scenario === 'quiet') return { news: { news: fx.news.filter(n => /Alcaraz|Zverev|Murray|Portugal|Milan/.test(n.title)) }, gempa: { gempa: [] }, ticker: { ticker: [] } }[what];
    if (scenario === 'padat') return { news: { news: [...PADAT, ...fx.news] }, gempa: { gempa: fx.gempa }, ticker: { ticker: fx.ticker } }[what];
    return { news: { news: fx.news }, gempa: { gempa: fx.gempa }, ticker: { ticker: fx.ticker } }[what];
  }
  return { ok: true };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const head = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  if (url.pathname === '/__scenario') {
    scenario = url.searchParams.get('name') || 'real'; cctv = url.searchParams.get('cctv') || 'ok'; peringatan = url.searchParams.get('peringatan') || 'ok';
    frameMs = 350; sitrepMs = 0; sesiHabis = false;
    res.writeHead(200, head); res.end(scenario); return;
  }
  if (url.pathname === '/__cctv') {
    cctv = url.searchParams.get('mode') || 'ok'; frameMs = Number(url.searchParams.get('frameMs')) || 350;
    res.writeHead(200, head); res.end(cctv); return;
  }
  if (url.pathname === '/__sesi') { sesiHabis = url.searchParams.get('habis') === '1'; res.writeHead(200, head); res.end(String(sesiHabis)); return; }
  if (url.pathname === '/__lambat') { sitrepMs = Number(url.searchParams.get('ms')) || 0; res.writeHead(200, head); res.end(String(sitrepMs)); return; }
  if (url.pathname === '/__peringatan') { peringatan = url.searchParams.get('mode') || 'ok'; res.writeHead(200, head); res.end(peringatan); return; }
  if (url.pathname.startsWith('/api/')) {
    if (sesiHabis && !url.pathname.endsWith('/auth/login')) { res.writeHead(401, { ...head, 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"unauthorized"}'); return; }
    const body = api(url.pathname);
    // server asli butuh beberapa detik untuk mengambil frame
    if (url.pathname.endsWith('/cctv-detect')) await new Promise(r => setTimeout(r, frameMs));
    // deteksi objek menyusul setelah gambar tampil
    // deteksi-lambat: YOLO di CPU yang lebih lambat dari selang mode pantau
    if (url.pathname.endsWith('/vision/detect')) await new Promise(r => setTimeout(r, cctv === 'deteksi-lambat' ? 3000 : 700));
    // putaran pertama server asli: feed BMKG + rincian tiap peringatan
    if (url.pathname.endsWith('/sitrep/peringatan') && peringatan === 'lambat') await new Promise(r => setTimeout(r, 3500));
    if (sitrepMs && (url.pathname.startsWith('/api/v2/sitrep/') || url.pathname.endsWith('/vision/cctv-list'))) await new Promise(r => setTimeout(r, sitrepMs));
    if (body && body.__status) { res.writeHead(body.__status, { ...head, 'Content-Type': 'text/html;charset=utf-8' }); res.end(body.__html); return; }
    if (body === null) { res.writeHead(502, { ...head, 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"upstream"}'); return; }
    res.writeHead(200, { ...head, 'Content-Type': 'application/json; charset=utf-8', ETag: '"x"' });
    res.end(JSON.stringify(body));
    return;
  }
  let rel = normalize(url.pathname).replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  try {
    const buf = await readFile(join(ROOT, rel));
    res.writeHead(200, { ...head, 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    if (extname(rel)) { res.writeHead(404, head); res.end('not found'); return; }
    const buf = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { ...head, 'Content-Type': TYPES['.html'] });
    res.end(buf);
  }
}).listen(PORT, () => console.log(`harness http://localhost:${PORT}`));
