// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · normalisasi data mentah backend → laporan siap peta
//
// Sumber: /api/v2/sitrep/news (RSS) dan /gempa (BMKG). Peringatan cuaca: peringatan.ts.
// Waktu dibaca dari pubDate asli (field `ts` backend tidak dipakai), lokasi dan
// jenis diturunkan dari teks. Entri simulasi dari backend disingkirkan, bukan
// ditampilkan seolah-olah nyata.
// ═══════════════════════════════════════════════════════════════════════

import { classify, INCIDENT_CATEGORIES, type Category } from './classify.ts';
import { locate, parseBmkgWilayah, type Gazetteer, type LocMatch, type ProvCode } from './geo-names.ts';

export interface RawNews {
  id?: string; title?: string; source?: string; category?: string; summary?: string;
  url?: string; pubDate?: string; ts?: number; simulated?: boolean;
}
export interface RawQuake {
  id?: string; mag?: number | string; depth?: string; location?: string; lat?: number; lon?: number;
  datetime?: string; felt?: string; source?: string; simulated?: boolean;
}

export interface Report {
  kind: 'berita';
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string | null;
  /** Epoch ms dari pubDate; null bila feed tidak mencantumkan waktu. */
  time: number | null;
  cat: Category;
  label: string;
  incident: boolean;
  loc: LocMatch | null;
}

export interface Quake {
  kind: 'gempa';
  id: string;
  mag: number;
  depthKm: number | null;
  lon: number;
  lat: number;
  time: number | null;
  /** "116 km timur laut Halmahera Selatan, Maluku Utara" */
  place: string;
  prov: ProvCode | null;
  felt: string | null;
}

export type Item = Report | Quake;
export type TimeWindow = '24h' | '7d' | 'all';

const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const clean = (s: unknown): string => decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim();

const SOURCE_NAME: Record<string, string> = { 'CNN-ID': 'CNN Indonesia', MetroTV: 'Metro TV' };

function parseTime(s: unknown, now: number): number | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = Date.parse(s.trim());
  if (!Number.isFinite(t)) return null;
  return t > now + 3_600_000 ? null : t;
}

export interface Normalized<T> { items: T[]; simulated: number }

export function normalizeNews(raw: RawNews[], g: Gazetteer, now: number): Normalized<Report> {
  const out: Report[] = [];
  const seen = new Set<string>();
  let simulated = 0;
  for (const n of raw) {
    const title = clean(n.title);
    if (!title) continue;
    if (n.simulated === true || String(n.id ?? '').startsWith('mock_')) { simulated++; continue; }
    const source = SOURCE_NAME[String(n.source ?? '')] ?? clean(n.source) ?? '';
    const url = typeof n.url === 'string' && /^https?:\/\//i.test(n.url) ? n.url : null;
    const key = url ?? `${source}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let summary = clean(n.summary);
    if (summary === title) summary = '';
    if (summary.length >= 196 && !/[.!?…]$/.test(summary)) summary += '…';
    const c = classify(title, summary);
    out.push({
      kind: 'berita',
      id: `n:${key}`,
      title, summary, source, url,
      time: parseTime(n.pubDate, now),
      cat: c.cat,
      label: c.label,
      incident: INCIDENT_CATEGORIES.includes(c.cat),
      loc: locate(g, title, summary),
    });
  }
  out.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return { items: out, simulated };
}

const R_EARTH_KM = 6371;
function distKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Provinsi berjangkar terdekat (untuk gempa yang teks wilayahnya tak dikenali); null bila > 400 km. */
export function nearestProv(lon: number, lat: number, anchors: Record<ProvCode, [number, number]>): ProvCode | null {
  let best: ProvCode | null = null;
  let bestD = 400;
  for (const [code, [alon, alat]] of Object.entries(anchors)) {
    const d = distKm(lon, lat, alon, alat);
    if (d < bestD) { bestD = d; best = code; }
  }
  return best;
}

export function normalizeQuakes(
  raw: RawQuake[], g: Gazetteer, now: number, anchors: Record<ProvCode, [number, number]>,
): Normalized<Quake> {
  const out: Quake[] = [];
  const seen = new Set<string>();
  let simulated = 0;
  for (const q of raw) {
    const id = String(q.id ?? '');
    if (q.simulated === true || (/^g\d+$/.test(id) && !q.datetime)) { simulated++; continue; }
    const mag = typeof q.mag === 'string' ? parseFloat(q.mag) : Number(q.mag);
    const lon = Number(q.lon);
    const lat = Number(q.lat);
    if (!Number.isFinite(mag) || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const key = id || `${q.datetime}|${lon}|${lat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const depth = /(\d+(?:[.,]\d+)?)/.exec(String(q.depth ?? ''));
    const parsed = parseBmkgWilayah(g, clean(q.location));
    const felt = clean(q.felt);
    out.push({
      kind: 'gempa',
      id: `q:${key}`,
      mag,
      depthKm: depth ? parseFloat(depth[1].replace(',', '.')) : null,
      lon, lat,
      time: parseTime(q.datetime, now),
      place: parsed.text,
      prov: parsed.prov ?? nearestProv(lon, lat, anchors),
      felt: felt && felt !== '-' ? felt : null,
    });
  }
  out.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return { items: out, simulated };
}

const WINDOW_MS: Record<TimeWindow, number> = { '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000, all: Infinity };

/** Berita tanpa waktu dianggap terkini (RSS = entri terbaru); gempa tanpa waktu hanya muncul di "Semua". */
export function inWindow(item: Item, win: TimeWindow, now: number): boolean {
  if (win === 'all') return true;
  if (item.time === null) return item.kind === 'berita';
  return now - item.time <= WINDOW_MS[win];
}

export const itemProv = (item: Item): ProvCode | null => (item.kind === 'gempa' ? item.prov : item.loc ? item.loc.prov : null);

export interface ProvStat {
  code: ProvCode;
  incidents: number;
  quakes: number;
  others: number;
  total: number;
}

export function provinceStats(reports: Report[], quakes: Quake[]): Map<ProvCode, ProvStat> {
  const m = new Map<ProvCode, ProvStat>();
  const get = (code: ProvCode) => {
    let s = m.get(code);
    if (!s) { s = { code, incidents: 0, quakes: 0, others: 0, total: 0 }; m.set(code, s); }
    return s;
  };
  for (const r of reports) {
    if (!r.loc) continue;
    const s = get(r.loc.prov);
    if (r.incident) s.incidents++; else s.others++;
    s.total++;
  }
  for (const q of quakes) {
    if (!q.prov) continue;
    const s = get(q.prov);
    s.quakes++;
    s.total++;
  }
  return m;
}
