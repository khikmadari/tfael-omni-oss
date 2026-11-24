// Keterangan negara untuk bola dunia animasi pembuka.
// Batas negara : Natural Earth 1:50m (domain publik) lewat paket npm world-atlas 2.0.2 (ISC).
// Nama         : bahasa Indonesia menurut CLDR (Unicode), dibaca lewat Intl.DisplayNames di Node; versinya dicatat di keluaran.
// Kode negara  : i18n-iso-countries (MIT), hanya untuk memetakan kode angka ISO 3166-1 ke kode dua huruf.
// Yang diberi keterangan: negara anggota PBB yang luasnya >= MIN_KM2 (cukup besar untuk tampak sebagai butiran),
// ditambah anggota ASEAN yang lebih kecil dan Timor Leste (tetangga Indonesia). Urutan = prioritas: Indonesia, lalu dari yang terluas.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoArea, geoCentroid } from 'd3-geo';

const require = createRequire(import.meta.url);
const iso = require('i18n-iso-countries');

const MIN_KM2 = Number(process.argv[2] || 30000);
const R_KM = 6371.0088;
const TETANGGA = new Set(['BN', 'SG', 'TL']);
// 193 negara anggota PBB (kode ISO 3166-1 dua huruf)
const PBB = new Set((
  'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW ' +
  'AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PH QA KR SA SG LK SY TJ TH TL TR TM AE UZ VN YE ' +
  'AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB ' +
  'AG AR BS BB BZ BO BR CA CL CO CR CU DM DO EC SV GD GT GY HT HN JM MX NI PA PY PE KN LC VC SR TT US UY VE ' +
  'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU'
).split(' '));
if (PBB.size !== 193) throw new Error(`daftar anggota PBB berisi ${PBB.size}, seharusnya 193`);
for (const c of PBB) if (!iso.isValid(c)) throw new Error(`kode tidak dikenal: ${c}`);

// CLDR memberi bentuk pembeda untuk dua Kongo dan Myanmar; di peta dipakai bentuk pendek yang lazim.
const NAMA = { CD: 'RD Kongo', CG: 'Kongo', MM: 'Myanmar' };
const dn = new Intl.DisplayNames(['id'], { type: 'region' });

const topo = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json', 'utf8'));
const fc = feature(topo, topo.objects.countries);
const rows = [];
const seen = new Set();
for (const f of fc.features) {
  const a2 = f.id ? iso.numericToAlpha2(String(f.id).padStart(3, '0')) : undefined;
  if (!a2 || !PBB.has(a2)) continue;
  // Natural Earth memberi kode Australia juga kepada Kepulauan Ashmore dan Cartier (wilayah luarnya): yang kecil dilewati
  if (f.properties.name === 'Ashmore and Cartier Is.') continue;
  if (seen.has(a2)) throw new Error(`negara ganda: ${a2} (${f.properties.name})`);
  seen.add(a2);
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const areas = polys.map(c => geoArea({ type: 'Polygon', coordinates: c }) * R_KM * R_KM);
  const total = areas.reduce((s, v) => s + v, 0);
  let big = 0;
  for (let i = 1; i < areas.length; i++) if (areas[i] > areas[big]) big = i;
  // Daratan utama memegang hampir seluruh luas: keterangan di tengahnya (wilayah seberang lautan tidak menariknya ke laut).
  // Negara kepulauan: di titik berat seluruh pulaunya.
  const utama = areas[big] / total >= 0.8;
  const [lon, lat] = utama ? geoCentroid({ type: 'Polygon', coordinates: polys[big] }) : geoCentroid(f);
  const name = NAMA[a2] ?? dn.of(a2);
  if (!name || name === a2) throw new Error(`tidak ada nama Indonesia untuk ${a2}`);
  rows.push({ a2, name, en: f.properties.name, km2: total, lon, lat, utama, bagian: polys.length });
}
const missing = [...PBB].filter(c => !seen.has(c));
const pick = rows.filter(r => r.km2 >= MIN_KM2 || TETANGGA.has(r.a2))
  .sort((p, q) => (q.a2 === 'ID') - (p.a2 === 'ID') || q.km2 - p.km2);
const out = {
  sumber: 'Batas negara: Natural Earth 1:50m (domain publik), lewat world-atlas 2.0.2. Nama: bahasa Indonesia menurut CLDR ' + process.versions.cldr + '.',
  aturan: `Negara anggota PBB seluas >= ${MIN_KM2} km2, ditambah Brunei, Singapura, Timor Leste. Urutan = prioritas (Indonesia, lalu dari yang terluas).`,
  // [nama, bujur, lintang, luas dalam ribu km2 (dihitung dari batas Natural Earth), 1 bila tetangga yang selalu diberi keterangan]
  negara: pick.map(r => { const row = [r.name, +r.lon.toFixed(1), +r.lat.toFixed(1), Math.max(1, Math.round(r.km2 / 1000))]; if (TETANGGA.has(r.a2)) row.push(1); return row; }),
};
writeFileSync('dunia-negara.json', JSON.stringify(out));
console.log(`${rows.length} anggota PBB ada di Natural Earth 50m; tidak ada: ${missing.join(' ') || '-'}`);
console.log(`${pick.length} diberi keterangan (>= ${MIN_KM2} km2 + tetangga); ${JSON.stringify(out).length} byte; ICU ${process.versions.icu}, CLDR ${process.versions.cldr}`);
for (const r of pick) console.log(`${r.a2} ${r.name.padEnd(24)} ${String(Math.round(r.km2)).padStart(9)} km2  ${r.lon.toFixed(1).padStart(7)} ${r.lat.toFixed(1).padStart(6)}  ${r.utama ? 'daratan utama' : 'titik berat'} (${r.bagian})  [${r.en}]`);
