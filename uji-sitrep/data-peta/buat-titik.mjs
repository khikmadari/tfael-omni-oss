// Butiran daratan dunia untuk bola dunia animasi pembuka.
// Sumber: Natural Earth 1:50m (domain publik) lewat paket npm world-atlas 2.0.2 (ISC).
// Kisi: baris lintang tiap STEP derajat; jumlah kolom tiap baris ~ cos(lintang) supaya kerapatan di permukaan bola seragam.
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoContains, geoBounds } from 'd3-geo';

const STEP = Number(process.argv[2] || 1.2);
const topo = JSON.parse(readFileSync('node_modules/world-atlas/land-50m.json', 'utf8'));
const land = feature(topo, topo.objects.land);            // FeatureCollection, satu MultiPolygon
const polys = land.features.flatMap(f => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) : [f.geometry]);
const boxed = polys.map(p => ({ p, b: geoBounds(p) }));
const inBox = (b, lon, lat) => {
  const [[w, s], [e, n]] = b;
  if (lat < s - 1e-9 || lat > n + 1e-9) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;   // w > e: melintasi antimeridian
};
const isLand = (lon, lat) => boxed.some(({ p, b }) => inBox(b, lon, lat) && geoContains(p, [lon, lat]));

const N = Math.round(180 / STEP);
const rows = [];
let total = 0, cells = 0;
for (let i = 0; i < N; i++) {
  const lat = -90 + (i + 0.5) * STEP;
  const n = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP));
  const runs = [];
  let start = -1;
  for (let j = 0; j < n; j++) {
    const lon = -180 + ((j + (i % 2 ? 0.5 : 0)) * 360) / n;      // baris berselang digeser setengah sel
    const on = isLand(lon > 180 ? lon - 360 : lon, lat);
    cells++;
    if (on) { total++; if (start < 0) start = j; }
    if ((!on || j === n - 1) && start >= 0) { runs.push(start, (on ? j + 1 : j) - start); start = -1; }
  }
  rows.push(runs);
}
const out = { sumber: 'Natural Earth 1:50m (domain publik), lewat world-atlas 2.0.2', step: STEP, rows };
writeFileSync(`dunia-titik-${STEP}.json`, JSON.stringify(out));
console.log(`STEP ${STEP}: ${N} baris, ${cells} sel, ${total} titik darat (${(100 * total / cells).toFixed(1)}%), ${JSON.stringify(out).length} byte`);
// uji petik: beberapa tempat yang pasti darat / laut
for (const [nm, lon, lat, want] of [['Jakarta', 106.8, -6.2, true], ['Makassar', 119.4, -5.1, true], ['Laut Banda', 128, -5.5, false], ['Sahara', 10, 23, true], ['Atlantik', -30, 30, false], ['Antartika', 0, -80, true], ['Greenland', -40, 72, true], ['Pasifik', -150, 0, false]])
  console.log(`  ${nm}: ${isLand(lon, lat)} ${isLand(lon, lat) === want ? 'ok' : 'SALAH'}`);
