// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · peringatan dini cuaca BMKG (nowcast)
//
// Sumber: /api/v2/sitrep/peringatan, yang membaca data terbuka BMKG
// (https://data.bmkg.go.id/peringatan-dini-cuaca). BMKG wajib disebut sebagai
// sumber di tampilan. Satu peringatan berlaku beberapa jam untuk satu wilayah dan
// membawa poligon daerah terdampak; yang sudah lewat masa berlakunya dibuang.
//
// Modul ini murni (tanpa DOM, tanpa impor JSON) supaya bisa diuji langsung di Node.
// ═══════════════════════════════════════════════════════════════════════

import { fmtClock } from './format.ts';
import { PROVINCES, type ProvCode } from './geo-names.ts';

export interface RawWarning {
  id?: string; title?: string; event?: string; area?: string; description?: string;
  issued?: string | null; effective?: string | null; expires?: string | null; expires_estimated?: boolean;
  severity?: string; infographic?: string; polygons?: unknown;
}

export interface Warning {
  kind: 'peringatan';
  id: string;
  /** "Hujan lebat disertai petir" */
  event: string;
  /** Nama wilayah menurut BMKG: "Jawa Timur", "Kep. Riau", "Jabodetabek". */
  area: string;
  /** Provinsi menurut nama wilayah; null bila namanya bukan satu provinsi. */
  prov: ProvCode | null;
  /** Semua provinsi yang tersentuh poligon, ditambah `prov`. Dipakai filter provinsi. */
  provs: ProvCode[];
  /** Uraian BMKG apa adanya (lokasi terdampak, dampak, imbauan). */
  description: string;
  /** Ringkasan lokasi dari uraian: "54 lokasi, antara lain Ajung, Ambulu, Balung"; '' bila polanya tidak dikenali. */
  places: string;
  issued: number | null;
  start: number | null;
  end: number;
  /** Jam berakhir tidak tercantum di sumber; diperkirakan 3 jam sejak terbit. */
  endEstimated: boolean;
  infographic: string | null;
  /** Cincin poligon terdampak, [bujur, lintang]. */
  polygons: [number, number][][];
  /** Tempat tanda di peta: poligon yang paling tengah, atau jangkar provinsi; null = tidak bisa dipetakan. */
  center: [number, number] | null;
}

// ── Provinsi dari nama wilayah ─────────────────────────────────────────
const PROV_BY_NAME: Map<string, ProvCode> = (() => {
  const m = new Map<string, ProvCode>();
  for (const [code, p] of Object.entries(PROVINCES)) {
    m.set(p.name.toLowerCase(), code);
    for (const k of p.keys) if (!m.has(k)) m.set(k, code);
  }
  return m;
})();

/** "Kep. Riau" → KR, "DI Yogyakarta" → YO, "Jabodetabek" → JK; null untuk wilayah yang bukan satu provinsi. */
export function provinceOfArea(area: string): ProvCode | null {
  const key = area.toLowerCase().replace(/\bkep\.?\s+/g, 'kepulauan ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return PROV_BY_NAME.get(key) ?? null;
}

// ── Provinsi dari koordinat ────────────────────────────────────────────
export type ProvinceLocator = (lon: number, lat: number) => ProvCode | null;

interface ProvFeature {
  properties: { code: ProvCode };
  geometry: { coordinates: number[][][][] };
}

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Pencari provinsi untuk satu titik, dari geometri provinsi terbundel. Titik di laut → null. */
export function makeProvinceLocator(features: ProvFeature[]): ProvinceLocator {
  const parts: { code: ProvCode; x0: number; y0: number; x1: number; y1: number; rings: number[][][] }[] = [];
  for (const f of features) {
    for (const rings of f.geometry.coordinates) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      parts.push({ code: f.properties.code, x0, y0, x1, y1, rings });
    }
  }
  return (lon, lat) => {
    for (const p of parts) {
      if (lon < p.x0 || lon > p.x1 || lat < p.y0 || lat > p.y1) continue;
      let inside = false;
      for (const ring of p.rings) if (inRing(lon, lat, ring)) inside = !inside;
      if (inside) return p.code;
    }
    return null;
  };
}

// ── Normalisasi ────────────────────────────────────────────────────────
const sentence = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const time = (v: unknown): number | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

function rings(raw: unknown): [number, number][][] {
  const out: [number, number][][] = [];
  if (!Array.isArray(raw)) return out;
  for (const ring of raw) {
    if (!Array.isArray(ring)) continue;
    const pts: [number, number][] = [];
    for (const p of ring) {
      if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) pts.push([p[0], p[1]]);
    }
    if (pts.length >= 4) out.push(pts);
  }
  return out;
}

function ringCenter(ring: [number, number][]): [number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/**
 * Tempat tanda di peta: pusat poligon yang paling dekat ke rata-rata semua poligon. Rata-ratanya sendiri
 * tidak dipakai karena untuk wilayah kepulauan ia sering jatuh di laut, jauh dari daerah yang diperingatkan.
 */
function middleRing(centers: [number, number][]): [number, number] | null {
  if (!centers.length) return null;
  let mx = 0, my = 0;
  for (const [x, y] of centers) { mx += x; my += y; }
  mx /= centers.length;
  my /= centers.length;
  let best = centers[0];
  let bestD = Infinity;
  for (const c of centers) {
    const d = (c[0] - mx) ** 2 + (c[1] - my) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Daftar lokasi dalam kalimat baku BMKG: "… khususnya di A, B, C. Kondisi ini …"; kosong bila polanya lain. */
export function listedPlaces(description: string): string[] {
  const m = /khususnya di\s+(.+?)\.\s+(?:Kondisi|Masyarakat|Dan\s+dapat|Dapat\s+meluas|Serta\s+dapat)\b/.exec(description);
  if (!m) return [];
  return m[1].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
}

function placeSummary(description: string): string {
  const names = listedPlaces(description);
  if (!names.length) return '';
  if (names.length <= 4) return names.join(', ');
  return `${names.length} lokasi, antara lain ${names.slice(0, 3).join(', ')}`;
}

const BMKG_HOST = /^https:\/\/([a-z0-9-]+\.)*bmkg\.go\.id\//i;

/** Hanya peringatan yang masih berlaku pada `now`; yang paling cepat berakhir lebih dulu. */
export function normalizeWarnings(
  raw: RawWarning[], now: number, anchors: Record<ProvCode, [number, number]>, provinceAt?: ProvinceLocator,
): Warning[] {
  const out: Warning[] = [];
  const seen = new Set<string>();
  for (const w of raw) {
    const end = time(w.expires);
    const area = clean(w.area);
    const event = sentence(clean(w.event) || clean(w.title));
    const key = clean(w.id) || `${area}|${w.expires}`;
    if (end === null || end <= now || !event || seen.has(key)) continue;
    seen.add(key);
    const prov = provinceOfArea(area);
    const polygons = rings(w.polygons);
    const centers = polygons.map(ringCenter);
    const provs = new Set<ProvCode>(prov ? [prov] : []);
    if (provinceAt) {
      polygons.forEach((ring, i) => {
        // pusat kotak pembatas bisa jatuh di laut (kecamatan pesisir): coba juga dua titik sudutnya
        const code = provinceAt(...centers[i]) ?? provinceAt(...ring[0]) ?? provinceAt(...ring[ring.length >> 1]);
        if (code) provs.add(code);
      });
    }
    const info = clean(w.infographic);
    const description = clean(w.description);
    out.push({
      kind: 'peringatan',
      id: `w:${key}`,
      event, area, prov,
      provs: [...provs],
      description,
      places: placeSummary(description),
      issued: time(w.issued),
      start: time(w.effective) ?? time(w.issued),
      end,
      endEstimated: w.expires_estimated === true,
      infographic: BMKG_HOST.test(info) ? info : null,
      polygons,
      center: middleRing(centers) ?? (prov ? anchors[prov] ?? null : null),
    });
  }
  out.sort((a, b) => a.end - b.end);
  return out;
}

/** Wilayah yang sedang dalam peringatan, tanpa pengulangan, urut abjad. */
export function warnedAreas(list: Warning[]): string[] {
  return [...new Set(list.map(w => w.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
}

/** Untuk kolom waktu: "mulai 16.00" bila belum mulai, selain itu "sampai 18.00". */
export function warnWhen(w: Warning, now: number): string {
  if (w.start !== null && w.start > now) return `mulai ${fmtClock(w.start)}`;
  return `sampai ${w.endEstimated ? 'sekitar ' : ''}${fmtClock(w.end)}`;
}

/** "Berlaku 16.00–18.00 WIB" */
export function warnSpan(w: Warning): string {
  const end = `${w.endEstimated ? 'sekitar ' : ''}${fmtClock(w.end)}`;
  return w.start !== null && w.start < w.end ? `Berlaku ${fmtClock(w.start)}–${end} WIB` : `Berlaku sampai ${end} WIB`;
}
