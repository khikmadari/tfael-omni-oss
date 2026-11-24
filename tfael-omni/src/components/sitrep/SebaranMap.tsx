// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · peta sebaran interaktif
//
// Peta vektor 38 provinsi dari geometri terbundel (tanpa tile, tanpa CDN — tetap
// tampil di mode air-gap). Satu titik = satu laporan berita; cincin = episenter
// gempa BMKG, besar cincin mengikuti magnitudo; segitiga atau bidang kuning =
// peringatan dini cuaca BMKG yang sedang berlaku; kotak = kamera CCTV, dan kamera
// yang sedang dibuka diberi retikel hijau serta kartu pratinjau gambarnya. Tidak
// ada animasi otomatis: yang bergerak hanya zoom/geser yang dipicu pengguna.
// Selagi popup kamera terbuka di sisi kanan, "bagian peta yang terlihat" adalah
// sisanya di kiri: ke sanalah kamera, provinsi, dan peringatan dibawa.
//
// Batas wilayah: BPS · WFP · OCHA ROAP via geoBoundaries (CC BY 3.0 IGO), 514
// kab/kota dilebur menjadi 38 provinsi. Daratan tetangga: Natural Earth.
// ═══════════════════════════════════════════════════════════════════════

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import type { MultiPoint } from 'geojson';
import { fmtAgo, fmtDateTime, fmtMag } from './format.ts';
import { GAZETTEER, KONTEKS, PROVINSI, PROV_ANCHORS } from './geo-data.ts';
import { provName, type ProvCode } from './geo-names.ts';
import { warnSpan, warnWhen, type Warning } from './peringatan.ts';
import type { ProvStat, Quake, Report } from './reports.ts';
import type { Camera } from './useCctv.ts';

/** Sabang–Merauke plus sedikit ruang untuk episenter di tepi wilayah. */
const EXTENT: MultiPoint = { type: 'MultiPoint', coordinates: [[94.7, -11.3], [142.2, 6.3]] };
/**
 * Proyeksi dasar peta: seluruh Indonesia pas di kotak w×h. Animasi pembuka (GlobeIntro) memakai fungsi yang
 * sama supaya bingkai terakhirnya berimpit dengan peta ini; ia juga membaca letak tanda langsung dari SVG
 * peta (.sr-dot, .sr-quake, .sr-warn-mark, .sr-cam, .sr-camg), jadi nama kelas itu jangan diganti sepihak.
 */
export const fitIndonesia = (w: number, h: number): GeoProjection =>
  geoMercator().fitExtent([[16, 16], [w - 16, h - 16]], EXTENT);

const DOT_R = 4.5;
const DOT_STEP = DOT_R * 2 + 1.5;
const MAX_DOTS = 37;
const MAX_ZOOM = 24;
/** Batas perbesaran saat provinsi dipilih; DKI Jakarta dan DIY berhenti di sini. */
const FIT_ZOOM = 20;

/** Kamera yang jaraknya di layar kurang dari ini digabung menjadi satu tanda berangka. */
const CAM_MERGE = 18;
/** Dari perbesaran ini gabungan dipecah: tiap kamera digambar sendiri, berjajar di sekitar lokasinya. */
const CAM_SPLIT_ZOOM = 8;
const CAM_HALF = 4.5;
const CAM_STEP = CAM_HALF * 2 + 4;
const camGroupHalf = (n: number): number => 8 + (String(n).length - 1) * 3.5;

/** Jari-jari lingkaran luar segitiga peringatan cuaca. */
const WARN_R = 7;
/**
 * Poligon peringatan dianggap terbaca bila cincin terbesarnya selebar ini di layar. Di bawah itu
 * (tampilan nasional) peringatan digambar sebagai segitiga; di atasnya, bidang wilayahnya sendiri.
 */
const WARN_LEGIBLE = 14;
const trianglePath = (x: number, y: number, r: number): string =>
  `M${x},${y - r}L${x + r * 0.866},${y + r * 0.5}L${x - r * 0.866},${y + r * 0.5}Z`;

/** Dari perbesaran ini nama kab/kota ditulis di peta: tanpa itu tampilan dekat hanya bidang abu tanpa penunjuk arah. */
const PLACE_ZOOM = 4.5;
const MAX_PLACE_NAMES = 48;
/** Kota dulu, baru kabupaten: bila tempat terbatas, nama kota lebih membantu orientasi. */
const PLACE_ORDER = [...GAZETTEER.places].sort((a, b) => Number(a.kind === 'kab') - Number(b.kind === 'kab'));

export interface SebaranMapProps {
  /** Laporan yang lolos filter; hanya yang berlokasi digambar. */
  reports: Report[];
  quakes: Quake[];
  /** Peringatan dini cuaca BMKG yang sedang berlaku (kosong bila lapisannya dimatikan). */
  warnings: Warning[];
  stats: Map<ProvCode, ProvStat>;
  now: number;
  /** Keterangan di atas peta saat tidak ada yang bisa digambar (memuat, kosong); null = tidak ada. */
  note: string | null;
  selectedProv: ProvCode | null;
  selectedId: string | null;
  /** Sorotan dari daftar di luar peta. */
  hoverProv: ProvCode | null;
  hoverId: string | null;
  /** Kamera CCTV berposisi (kosong bila lapisannya dimatikan). Kotak = kamera, supaya beda dari titik laporan. */
  cameras: Camera[];
  selectedCam: string | null;
  /** Sorotan kamera dari panel CCTV. */
  hoverCam: string | null;
  /** Kartu pratinjau di atas penanda kamera terpilih; null = tidak ada kamera terpilih. */
  camPreview: CamPreview | null;
  /** Popup kamera sedang menutupi sisi kanan peta: kamera terpilih dibawa ke bagian yang masih terlihat. */
  popupOpen: boolean;
  /** Bertambah tiap kali pengguna meminta kamera terpilih dipusatkan lagi di peta. */
  centerCam: number;
  onSelectProv: (code: ProvCode | null) => void;
  onSelectItem: (id: string | null) => void;
  onSelectCam: (id: string) => void;
  onHoverChange: (h: MapHover) => void;
}

export interface MapHover { prov: ProvCode | null; id: string | null; cam: string | null }

export interface CamPreview {
  name: string;
  /** data:image/… gambar terakhir; null selama belum ada. */
  src: string | null;
  /** Keterangan singkat di sudut gambar: jam gambar, atau keadaan memuat/gagal. */
  badge: string;
  /** ok = gambar terakhir berhasil diambil; watch = sedang dipantau (dimuat ulang berkala); idle = selain itu. */
  tone: 'ok' | 'watch' | 'idle';
  /** Kamera punya stream yang gambarnya bisa diambil. Tanpa itu kartunya hanya memuat nama. */
  hasStream: boolean;
}
/** Lebar popup kamera (sama dengan .sr-pop di sitrep.css) + jaraknya dari tepi peta. */
const popupInset = (w: number): number => Math.min(432, w * 0.46) + 24;
/** Ukuran kartu pratinjau (sama dengan .sr-campeek-card); tingginya untuk nama dua baris. */
const PEEK_W = 184;
const PEEK_H = 144;
/** Garis penghubung kartu ke retikel: sepanjang ini bila lapang, boleh memendek sampai batas bawahnya. */
const PEEK_GAP = 21;
const PEEK_GAP_MIN = 6;
/** Sudut kiri bawah peta yang ditempati legenda. */
const LEGEND_W = 288;
const LEGEND_H = 120;

type Hover =
  | { kind: 'item'; id: string }
  | { kind: 'prov'; code: ProvCode }
  | { kind: 'cam'; id: string }
  | { kind: 'camgroup'; key: string }
  | null;

/** Satu tanda kamera di layar: satu kamera, atau gabungan beberapa kamera yang berimpit. */
interface CamMark { key: string; x: number; y: number; cams: Camera[] }

interface Cluster {
  key: string;
  prov: ProvCode;
  lon: number;
  lat: number;
  items: Report[];
  incidents: number;
  name: string;
}

const quakeRadius = (mag: number): number => Math.max(5, Math.min(22, 5 + (mag - 5) * 6));

function placeText(r: Report): string {
  const loc = r.loc!;
  if (loc.label.length <= 20) return loc.label;
  return loc.place ? loc.place.name : provName(loc.prov);
}

/**
 * Satu gugus per tempat yang disebut: kab/kota di titiknya sendiri, laporan yang hanya
 * menyebut provinsi di jangkar provinsi. Tidak ada peleburan per provinsi — "Kebakaran
 * Ranai" harus tampil di Natuna, bukan di ibu kota Kepulauan Riau.
 */
function buildClusters(reports: Report[]): Cluster[] {
  const groups = new Map<string, Report[]>();
  for (const r of reports) {
    if (!r.loc) continue;
    const key = r.loc.place ? r.loc.place.id : `P:${r.loc.prov}`;
    const g = groups.get(key);
    if (g) g.push(r); else groups.set(key, [r]);
  }
  const out: Cluster[] = [];
  for (const [key, items] of groups) {
    const first = items[0].loc!;
    const [lon, lat] = first.place ? [first.place.lon, first.place.lat] : PROV_ANCHORS[first.prov];
    // insiden di tengah gugus, berita lain di luar; masing-masing terbaru dulu
    items.sort((a, b) => Number(b.incident) - Number(a.incident) || (b.time ?? 0) - (a.time ?? 0));
    out.push({
      key, prov: first.prov, lon, lat, items,
      incidents: items.filter(r => r.incident).length,
      name: first.place ? placeText(items[0]) : provName(first.prov),
    });
  }
  return out;
}

/** Titik ke-n pada spiral heksagonal: 1, lalu cincin 6, 12, 18 … */
function hexOffsets(n: number, step: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  for (let ring = 1; out.length < n; ring++) {
    let q = dirs[4][0] * ring;
    let r = dirs[4][1] * ring;
    for (let side = 0; side < 6; side++) {
      for (let s = 0; s < ring; s++) {
        if (out.length < n) out.push([step * (q + r / 2), step * r * 0.8660254]);
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
  }
  return out;
}

const ringsFor = (n: number): number => {
  let rings = 0;
  while (1 + 3 * rings * (rings + 1) < n) rings++;
  return rings;
};

interface Node { x: number; y: number; ox: number; oy: number; r: number }

/** Geser gugus yang bertumpuk secukupnya; tetap ditarik ke posisi aslinya. */
function relax(nodes: Node[]): void {
  for (let it = 0; it < 28; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.r + b.r + 3;
        if (d >= min) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
    for (const n of nodes) { n.x += (n.ox - n.x) * 0.05; n.y += (n.oy - n.y) * 0.05; }
  }
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
const widthCache = new Map<string, number>();
function textWidth(text: string, weight: 400 | 600): number {
  const key = `${weight}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  if (measureCtx === undefined) {
    try { measureCtx = document.createElement('canvas').getContext('2d'); } catch { measureCtx = null; }
  }
  let w = text.length * (weight === 600 ? 6.6 : 6.1);
  if (measureCtx) {
    measureCtx.font = `${weight} 11.5px "IBM Plex Sans", system-ui, sans-serif`;
    w = measureCtx.measureText(text).width;
  }
  widthCache.set(key, w);
  return w;
}

interface LabelSpec { key: string; x: number; y: number; r: number; strong: string; rest: string; priority: number }
interface PlacedLabel { key: string; x: number; y: number; strong: string; rest: string; anchor: 'start' }
interface Circle { x: number; y: number; r: number }
type Box = [number, number, number, number];

const touchesMark = (x0: number, y0: number, x1: number, y1: number, m: Circle): boolean => {
  const cx = Math.max(x0, Math.min(m.x, x1));
  const cy = Math.max(y0, Math.min(m.y, y1));
  return (m.x - cx) ** 2 + (m.y - cy) ** 2 < m.r * m.r;
};

function placeLabels(specs: LabelSpec[], marks: Circle[], w: number, h: number): { labels: PlacedLabel[]; boxes: Box[] } {
  const placed: PlacedLabel[] = [];
  const boxes: Box[] = [];
  const hits = (x0: number, y0: number, x1: number, y1: number, self: LabelSpec): boolean => {
    if (x0 < 4 || y0 < 4 || x1 > w - 4 || y1 > h - 4) return true;
    for (const [a, b, c, d] of boxes) if (x0 < c && x1 > a && y0 < d && y1 > b) return true;
    for (const m of marks) {
      if (m.x === self.x && m.y === self.y) continue;
      if (touchesMark(x0, y0, x1, y1, m)) return true;
    }
    return false;
  };
  for (const s of [...specs].sort((a, b) => b.priority - a.priority)) {
    const tw = textWidth(s.strong, 600) + (s.rest ? 5 + textWidth(s.rest, 400) : 0);
    const th = 15;
    const gap = s.r + 6;
    const d = gap * 0.71;
    // urutan = urutan pilihan; diagonal menolong di wilayah padat seperti Jabodetabek
    const tries: [number, number][] = [
      [s.x + gap, s.y - th / 2],             // kanan
      [s.x - gap - tw, s.y - th / 2],        // kiri
      [s.x + d, s.y - d - th],               // kanan atas
      [s.x + d, s.y + d],                    // kanan bawah
      [s.x - d - tw, s.y - d - th],          // kiri atas
      [s.x - d - tw, s.y + d],               // kiri bawah
      [s.x - tw / 2, s.y - gap - th],        // atas
      [s.x - tw / 2, s.y + gap],             // bawah
    ];
    for (const [x0, y0] of tries) {
      if (hits(x0 - 2, y0 - 1, x0 + tw + 2, y0 + th + 1, s)) continue;
      boxes.push([x0 - 2, y0 - 1, x0 + tw + 2, y0 + th + 1]);
      placed.push({ key: s.key, x: x0, y: y0 + 11.5, strong: s.strong, rest: s.rest, anchor: 'start' });
      break;
    }
  }
  return { labels: placed, boxes };
}

interface BaseProps {
  ctx: string;
  provs: { code: ProvCode; d: string }[];
  hover: ProvCode | null;
  selected: ProvCode | null;
}

/** Lapisan dasar: dirender ulang hanya saat sorotan/pilihan berubah, bukan tiap bingkai zoom. */
const BaseLayer = memo(function BaseLayer({ ctx, provs, hover, selected }: BaseProps) {
  const top = provs.filter(p => p.code === hover || p.code === selected);
  return (
    <>
      <path className="sr-map-ctx" d={ctx} />
      {provs.map(p => (
        <path
          key={p.code}
          data-prov={p.code}
          d={p.d}
          className={`sr-map-prov${p.code === selected ? ' is-selected' : ''}${p.code === hover ? ' is-hover' : ''}`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {top.map(p => (
        <path key={`o-${p.code}`} d={p.d} className={`sr-map-outline${p.code === selected ? ' is-selected' : ''}`} vectorEffect="non-scaling-stroke" />
      ))}
    </>
  );
});

interface WarnLayerProps {
  areas: { id: string; d: string }[];
  focus: string | null;
  selected: string | null;
}

/** Bidang daerah terdampak peringatan cuaca, dalam koordinat peta; ikut diperbesar bersama lapisan dasar. */
const WarnLayer = memo(function WarnLayer({ areas, focus, selected }: WarnLayerProps) {
  return (
    <>
      {areas.map(a => (
        <path
          key={a.id}
          data-warn={a.id}
          d={a.d}
          className={`sr-warn-area${a.id === selected ? ' is-selected' : ''}${a.id === focus ? ' is-focus' : ''}`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
});

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function SebaranMap(props: SebaranMapProps) {
  const {
    reports, quakes, warnings, stats, now, note, selectedProv, selectedId, hoverProv, hoverId,
    cameras, selectedCam, hoverCam, camPreview, popupOpen, centerCam, onSelectProv, onSelectItem, onSelectCam, onHoverChange,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const pointer = useRef<[number, number]>([0, 0]);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const [hover, setHover] = useState<Hover>(null);
  const [fontsReady, setFontsReady] = useState(false);

  // lebar label diukur dengan font yang sedang terpasang; ukur ulang begitu IBM Plex selesai dimuat
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) { widthCache.clear(); setFontsReady(true); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setSize(p => (Math.abs(p.w - r.width) < 0.5 && Math.abs(p.h - r.height) < 0.5 ? p : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;

  const geo = useMemo(() => {
    if (w < 80 || h < 80) return null;
    const projection = fitIndonesia(w, h);
    const path = geoPath(projection);
    return {
      projection,
      ctx: path(KONTEKS) ?? '',
      provs: PROVINSI.features.map(f => ({ code: f.properties.code, d: path(f) ?? '', bounds: path.bounds(f) })),
    };
  }, [w, h]);

  // Popup kamera hanya menutupi peta pada tata letak lebar; di layar sempit ia turun ke bawah peta.
  const narrow = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 980px)').matches;
  /** Lebar sisi kanan peta yang tertutup popup kamera. Semua "bawa ke layar" memakai sisa peta di kirinya. */
  const inset = popupOpen && !narrow ? popupInset(w) : 0;
  const insetRef = useRef(inset);
  insetRef.current = inset;

  const fitTransform = useCallback((code: ProvCode | null): ZoomTransform => {
    const p = code && geo ? geo.provs.find(x => x.code === code) : null;
    if (!p) return zoomIdentity;
    const [[x0, y0], [x1, y1]] = p.bounds;
    // lewat ref: buka-tutup popup tidak boleh memasang ulang zoom dan mengembalikan peta ke tampilan awal
    const vw = w - insetRef.current;
    const k = Math.max(1, Math.min(FIT_ZOOM, 0.78 / Math.max((x1 - x0) / vw, (y1 - y0) / h)));
    return zoomIdentity.translate(vw / 2 - (k * (x0 + x1)) / 2, h / 2 - (k * (y0 + y1)) / 2).scale(k);
  }, [geo, w, h]);

  // Pasang perilaku zoom; ukuran berubah → kembalikan ke tampilan yang sedang dipilih tanpa animasi.
  const selectedProvRef = useRef(selectedProv);
  selectedProvRef.current = selectedProv;
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !geo) return;
    const z = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .extent([[0, 0], [w, h]])
      .translateExtent([[-w * 0.12, -h * 0.12], [w * 1.12, h * 1.12]])
      .on('zoom', ev => {
        const tr = ev.transform as ZoomTransform;
        setT({ k: tr.k, x: tr.x, y: tr.y });
      });
    const sel = select(el);
    sel.call(z);
    zoomRef.current = z;
    sel.call(z.transform, fitTransform(selectedProvRef.current));
    return () => { sel.on('.zoom', null); zoomRef.current = null; };
  }, [geo, w, h, fitTransform]);

  // Provinsi dipilih/dilepas → perbesar ke provinsi itu / kembali ke seluruh Indonesia.
  const lastProv = useRef<ProvCode | null>(selectedProv);
  useEffect(() => {
    if (lastProv.current === selectedProv) return;
    lastProv.current = selectedProv;
    const el = svgRef.current;
    const z = zoomRef.current;
    if (!el || !z) return;
    select(el).transition().duration(prefersReducedMotion() ? 0 : 480).call(z.transform, fitTransform(selectedProv));
  }, [selectedProv, fitTransform]);

  // Kamera dipilih (atau diminta dipusatkan lagi) → bawa ke tengah bagian peta yang tidak tertutup popup, dengan
  // ruang di atasnya untuk kartu pratinjau. Tidak digeser bila sudah terlihat sendiri di tempat yang lapang.
  const lastCam = useRef<string | null>(selectedCam);
  const lastCenter = useRef(centerCam);
  useEffect(() => {
    const forced = lastCenter.current !== centerCam;
    if (lastCam.current === selectedCam && !forced) return;
    lastCam.current = selectedCam;
    lastCenter.current = centerCam;
    const c = selectedCam ? cameras.find(x => x.id === selectedCam) : undefined;
    const el = svgRef.current;
    const z = zoomRef.current;
    if (!c || c.lon === null || c.lat === null || !el || !z || !geo) return;
    const p = geo.projection([c.lon, c.lat]);
    if (!p) return;
    const cur = tRef.current;
    const sx = p[0] * cur.k + cur.x;
    const sy = p[1] * cur.k + cur.y;
    const right = w - inset;
    const underLegend = (x: number, y: number): boolean => x < LEGEND_W + 24 && y > h - LEGEND_H - 24;
    const roomy = sx > PEEK_W / 2 + 12 && sx < right - PEEK_W / 2 - 12 && sy > PEEK_H + 56 && sy < h - 72 && !underLegend(sx, sy);
    if (!forced && cur.k >= CAM_SPLIT_ZOOM && roomy) return;
    const k = Math.max(cur.k, 12);
    // Agak di bawah tengah supaya kartu pratinjau muat di atasnya; peta yang terlalu pendek untuk kartu → di tengah
    // saja. Pada peta pendek ketinggian itu sejajar legenda, jadi penanda digeser ke sebelah kanan legenda.
    const ty = h >= PEEK_H + 72 ? Math.min(Math.max(h * 0.58, PEEK_H + 60), h - 30) : h / 2;
    const tx = underLegend(right / 2, ty) && right - LEGEND_W >= 96 ? (LEGEND_W + right) / 2 : right / 2;
    const to = zoomIdentity.translate(tx - k * p[0], ty - k * p[1]).scale(k);
    select(el).transition().duration(prefersReducedMotion() ? 0 : 480).call(z.transform, to);
  }, [selectedCam, centerCam, cameras, geo, w, h, inset]);

  // ── Peringatan cuaca: poligon diproyeksikan sekali per ukuran peta, bukan tiap bingkai zoom ──
  const warnGeo = useMemo(() => {
    const m = new Map<string, { d: string; box: [number, number, number, number] | null; maxRing: number; c: [number, number] | null }>();
    if (!geo) return m;
    for (const wn of warnings) {
      let d = '';
      let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity, maxRing = 0;
      for (const ring of wn.polygons) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        let seg = '';
        for (const pt of ring) {
          const p = geo.projection(pt);
          if (!p) continue;
          seg += `${seg ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`;
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1];
          if (p[1] > y1) y1 = p[1];
        }
        if (!seg) continue;
        d += `${seg}Z`;
        maxRing = Math.max(maxRing, x1 - x0, y1 - y0);
        X0 = Math.min(X0, x0); Y0 = Math.min(Y0, y0); X1 = Math.max(X1, x1); Y1 = Math.max(Y1, y1);
      }
      m.set(wn.id, { d, box: d ? [X0, Y0, X1, Y1] : null, maxRing, c: wn.center ? geo.projection(wn.center) : null });
    }
    return m;
  }, [geo, warnings]);

  // Peringatan dipilih → bawa daerah terdampaknya ke layar, cukup besar untuk dibaca.
  const lastItem = useRef<string | null>(selectedId);
  useEffect(() => {
    if (lastItem.current === selectedId) return;
    lastItem.current = selectedId;
    const g = selectedId ? warnGeo.get(selectedId) : undefined;
    const el = svgRef.current;
    const z = zoomRef.current;
    if (!g || !g.box || !g.c || !el || !z) return;
    const cur = tRef.current;
    const sx = g.c[0] * cur.k + cur.x;
    const sy = g.c[1] * cur.k + cur.y;
    const vw = w - inset;
    if (g.maxRing * cur.k >= WARN_LEGIBLE && sx > 48 && sx < vw - 48 && sy > 48 && sy < h - 48) return;
    const [x0, y0, x1, y1] = g.box;
    const fit = 0.72 / Math.max((x1 - x0) / vw, (y1 - y0) / h, 1e-6);
    const readable = (WARN_LEGIBLE * 1.6) / Math.max(g.maxRing, 1e-6);
    // Semua poligon muat dan terbaca → tampilkan semuanya. Bila terpencar (kepulauan) sehingga muat berarti
    // terlalu kecil untuk dibaca, perbesar ke poligon yang paling tengah saja. Kecamatan di Jakarta hanya
    // beberapa kilometer lebarnya, jadi batasnya perbesaran maksimum, bukan batas pas-provinsi.
    const all = fit >= readable;
    const k = Math.max(1, Math.min(MAX_ZOOM, all ? fit : readable));
    const [cx, cy] = all ? [(x0 + x1) / 2, (y0 + y1) / 2] : g.c;
    const to = zoomIdentity.translate(vw / 2 - k * cx, h / 2 - k * cy).scale(k);
    select(el).transition().duration(prefersReducedMotion() ? 0 : 480).call(z.transform, to);
  }, [selectedId, warnGeo, w, h, inset]);

  const clusters = useMemo(() => buildClusters(reports), [reports]);
  const byId = useMemo(() => {
    const m = new Map<string, Report | Quake | Warning>();
    for (const r of reports) m.set(r.id, r);
    for (const q of quakes) m.set(q.id, q);
    for (const wn of warnings) m.set(wn.id, wn);
    return m;
  }, [reports, quakes, warnings]);
  const warnByProv = useMemo(() => {
    const m = new Map<ProvCode, number>();
    for (const wn of warnings) for (const code of wn.provs) m.set(code, (m.get(code) ?? 0) + 1);
    return m;
  }, [warnings]);

  // ── Posisi layar semua tanda pada transformasi saat ini ──
  const scene = useMemo(() => {
    if (!geo) return null;
    const toScreen = (lon: number, lat: number): [number, number] => {
      const p = geo.projection([lon, lat]) ?? [0, 0];
      return [p[0] * t.k + t.x, p[1] * t.k + t.y];
    };

    const nodes: (Node & { c: Cluster })[] = clusters.map(c => {
      const [x, y] = toScreen(c.lon, c.lat);
      return { x, y, ox: x, oy: y, r: ringsFor(Math.min(c.items.length, MAX_DOTS)) * DOT_STEP + DOT_R, c };
    });

    // ── Kamera: yang berimpit di layar digabung; saat diperbesar gabungan dipecah per kamera ──
    const split = t.k >= CAM_SPLIT_ZOOM;
    const groups: { x: number; y: number; items: Camera[] }[] = [];
    for (const c of cameras) {
      if (c.lon === null || c.lat === null) continue;
      const [x, y] = toScreen(c.lon, c.lat);
      const g = groups.find(q => Math.hypot(q.x - x, q.y - y) < CAM_MERGE);
      if (g) {
        const n = g.items.length;
        g.x = (g.x * n + x) / (n + 1);
        g.y = (g.y * n + y) / (n + 1);
        g.items.push(c);
      } else groups.push({ x, y, items: [c] });
    }
    const camNodes = groups.map(g => ({
      x: g.x, y: g.y, ox: g.x, oy: g.y, g,
      r: g.items.length === 1 ? CAM_HALF + 2
        : split ? ringsFor(g.items.length) * CAM_STEP + CAM_HALF + 2
        : camGroupHalf(g.items.length) + 2,
    }));

    // ── Peringatan cuaca: segitiga selama poligonnya terlalu kecil untuk dibaca, selain itu bidangnya sendiri ──
    const legible: string[] = [];
    const warnNodes: (Node & { id: string })[] = [];
    for (const wn of warnings) {
      const g = warnGeo.get(wn.id);
      if (!g || !g.c) continue;
      if (g.d && g.maxRing * t.k >= WARN_LEGIBLE) { legible.push(wn.id); continue; }
      const x = g.c[0] * t.k + t.x;
      const y = g.c[1] * t.k + t.y;
      warnNodes.push({ x, y, ox: x, oy: y, r: WARN_R + 1, id: wn.id });
    }

    // laporan, kamera, dan segitiga peringatan saling memberi ruang
    relax([...nodes, ...camNodes, ...warnNodes]);
    const tris = warnNodes.map(n => ({ id: n.id, x: n.x, y: n.y }));

    const cams: CamMark[] = [];
    for (const n of camNodes) {
      const items = n.g.items;
      if (items.length === 1 || split) {
        const offs = hexOffsets(items.length, CAM_STEP);
        items.forEach((c, i) => cams.push({ key: c.id, x: n.x + offs[i][0], y: n.y + offs[i][1], cams: [c] }));
      } else cams.push({ key: `g:${items[0].id}`, x: n.x, y: n.y, cams: items });
    }

    const dots: { id: string; x: number; y: number; incident: boolean }[] = [];
    const more: { key: string; x: number; y: number; n: number }[] = [];
    for (const n of nodes) {
      const shown = n.c.items.slice(0, MAX_DOTS);
      const offs = hexOffsets(shown.length, DOT_STEP);
      shown.forEach((r, i) => dots.push({ id: r.id, x: n.x + offs[i][0], y: n.y + offs[i][1], incident: r.incident }));
      if (n.c.items.length > MAX_DOTS) more.push({ key: n.c.key, x: n.x, y: n.y + n.r + 11, n: n.c.items.length - MAX_DOTS });
    }
    // berita lain dulu, insiden di atasnya
    dots.sort((a, b) => Number(a.incident) - Number(b.incident));

    const rings = quakes.map(q => {
      const [x, y] = toScreen(q.lon, q.lat);
      const age = q.time === null ? Infinity : now - q.time;
      return { id: q.id, x, y, r: quakeRadius(q.mag), mag: q.mag, opacity: age <= 48 * 3.6e6 ? 1 : age <= 7 * 864e5 ? 0.82 : 0.5 };
    }).sort((a, b) => b.r - a.r);

    const marks: Circle[] = [
      ...nodes.map(n => ({ x: n.x, y: n.y, r: n.r + 1 })),
      ...rings.map(q => ({ x: q.x, y: q.y, r: q.r + 1 })),
      ...camNodes.map(n => ({ x: n.x, y: n.y, r: n.r })),
      ...warnNodes.map(n => ({ x: n.x, y: n.y, r: n.r })),
    ];

    const focusId = hover?.kind === 'item' ? hover.id : hoverId ?? selectedId;
    const specs: LabelSpec[] = [];
    for (const n of nodes) {
      const c = n.c;
      const focused = focusId !== null && c.items.some(r => r.id === focusId);
      if (!c.incidents && !focused) continue;
      const one = c.incidents === 1 ? c.items[0] : null;
      const strong = one ? one.label : c.incidents ? `${c.incidents} insiden` : `${c.items.length} berita`;
      const rest = one ? placeText(one) : c.name;
      specs.push({ key: `c-${c.key}`, x: n.x, y: n.y, r: n.r, strong, rest, priority: (focused ? 1000 : 100) + c.incidents });
    }
    const labelled = new Set([...rings].sort((a, b) => b.mag - a.mag).slice(0, 6).map(q => q.id));
    for (const q of rings) {
      const focused = q.id === focusId;
      if (!focused && !labelled.has(q.id)) continue;
      specs.push({ key: q.id, x: q.x, y: q.y, r: q.r, strong: `M ${fmtMag(q.mag)}`, rest: '', priority: (focused ? 900 : 10) + q.mag });
    }
    // Segitiga peringatan hanya diberi label saat disorot atau dipilih. Bidang wilayah tidak diberi label:
    // yang disorot sudah menonjol sendiri, dan namanya ada di tooltip serta di tab Peringatan.
    const wt = focusId ? tris.find(m => m.id === focusId) : undefined;
    const wf = wt ? warnings.find(wn => wn.id === wt.id) : undefined;
    if (wt && wf) {
      specs.push({ key: wf.id, x: wt.x, y: wt.y, r: WARN_R, strong: wf.area || 'Peringatan cuaca', rest: warnWhen(wf, now), priority: 980 });
    }
    const extProv = hoverProv && !(hover?.kind === 'prov') ? hoverProv : null;
    if (extProv && !clusters.some(c => c.prov === extProv && c.incidents > 0)) {
      const [x, y] = toScreen(...PROV_ANCHORS[extProv]);
      specs.push({ key: `p-${extProv}`, x, y, r: 2, strong: provName(extProv), rest: '', priority: 950 });
    }
    // Kamera tidak diberi label nama di peta: di kelompok rapat label mudah terbaca milik kamera sebelahnya.
    // Yang terpilih digambar penuh, yang disorot bergaris tebal; namanya ada di tooltip dan di panel CCTV.
    const { labels, boxes } = placeLabels(specs, marks, w, h);

    // Nama kab/kota sebagai penunjuk arah saat diperbesar; kalah dari semua tanda dan label di atas.
    const names: { key: string; x: number; y: number; text: string }[] = [];
    if (t.k >= PLACE_ZOOM) {
      // jangan menulis nama di bawah legenda, tombol zoom, dan baris atribusi
      boxes.push([0, h - LEGEND_H, LEGEND_W, h], [w - inset - 150, h - 130, w - inset, h - 26], [w - 440, h - 26, w, h]);
      for (const p of PLACE_ORDER) {
        if (names.length >= MAX_PLACE_NAMES) break;
        const [x, y] = toScreen(p.lon, p.lat);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const half = textWidth(p.name, 400) / 2 + 4;
        const x0 = x - half, x1 = x + half, y0 = y - 9, y1 = y + 7;
        if (x0 < 4 || y0 < 4 || x1 > w - 4 || y1 > h - 4) continue;
        if (boxes.some(([a, b, c, d]) => x0 < c && x1 > a && y0 < d && y1 > b)) continue;
        if (marks.some(m => touchesMark(x0, y0, x1, y1, m))) continue;
        // kotak dilebihkan supaya nama tidak berdesakan: jarak antarnama minimal ±1 baris
        boxes.push([x0 - 12, y0 - 9, x1 + 12, y1 + 9]);
        names.push({ key: p.id, x, y: y + 3.5, text: p.name });
      }
    }
    // penanda kamera terpilih (sendiri, atau gabungan yang memuatnya): jangkar retikel dan kartu pratinjau
    const selMark = selectedCam ? cams.find(m => m.cams.some(c => c.id === selectedCam)) : undefined;
    const sel = selMark ? { x: selMark.x, y: selMark.y, r: selMark.cams.length > 1 ? camGroupHalf(selMark.cams.length) : CAM_HALF } : null;
    return { dots, more, rings, cams, tris, legible, labels, names, sel };
    // fontsReady: susun ulang label setelah lebar teks berubah
  }, [geo, clusters, quakes, cameras, selectedCam, warnings, warnGeo, now, t, w, h, inset, hover, hoverId, selectedId, hoverProv, fontsReady]);

  // daftar bidang hanya berganti saat sebuah peringatan melewati ambang terbaca, bukan tiap bingkai zoom
  const legibleKey = scene ? scene.legible.join('\n') : '';
  const warnAreas = useMemo(
    () => (legibleKey ? legibleKey.split('\n').map(id => ({ id, d: warnGeo.get(id)?.d ?? '' })) : []),
    [legibleKey, warnGeo],
  );

  // ── Penunjuk: tanda terdekat dulu, kalau tidak ada baru provinsi di bawah kursor ──
  const positionTip = useCallback(() => {
    const el = tipRef.current;
    if (!el) return;
    const [px, py] = pointer.current;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x = px + 14;
    let y = py + 16;
    // batas kanan = tepi bagian peta yang terlihat, supaya tooltip tidak terselip di bawah popup kamera
    if (x + tw > w - inset - 6) x = px - tw - 14;
    if (y + th > h - 6) y = py - th - 12;
    el.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`;
  }, [w, h, inset]);

  const hitTest = useCallback((px: number, py: number, target: EventTarget | null): Hover => {
    if (scene) {
      // titik tepat di bawah kursor > segitiga peringatan > kamera > cincin gempa yang melingkupi kursor > titik terdekat
      let dot: string | null = null;
      let dotD = Infinity;
      for (const d of scene.dots) {
        const dist = Math.hypot(d.x - px, d.y - py);
        if (dist < dotD) { dotD = dist; dot = d.id; }
      }
      if (dot && dotD <= DOT_R + 2) return { kind: 'item', id: dot };
      for (const m of scene.tris) {
        if (Math.hypot(m.x - px, m.y - py) <= WARN_R + 2) return { kind: 'item', id: m.id };
      }
      for (const m of scene.cams) {
        const half = (m.cams.length > 1 ? camGroupHalf(m.cams.length) : CAM_HALF) + 3;
        if (Math.abs(m.x - px) <= half && Math.abs(m.y - py) <= (m.cams.length > 1 ? 11 : half)) {
          return m.cams.length > 1 ? { kind: 'camgroup', key: m.key } : { kind: 'cam', id: m.cams[0].id };
        }
      }
      let ring: string | null = null;
      let ringR = Infinity;
      for (const q of scene.rings) {
        if (Math.hypot(q.x - px, q.y - py) <= q.r + 4 && q.r < ringR) { ringR = q.r; ring = q.id; }
      }
      if (ring) return { kind: 'item', id: ring };
      if (dot && dotD <= DOT_R + 8) return { kind: 'item', id: dot };
    }
    if (!(target instanceof Element)) return null;
    // bidang peringatan cuaca berada di atas provinsi
    const warn = target.getAttribute('data-warn');
    if (warn) return { kind: 'item', id: warn };
    const code = target.getAttribute('data-prov');
    return code ? { kind: 'prov', code } : null;
  }, [scene]);

  const hoverRef = useRef<Hover>(null);
  const applyHover = useCallback((next: Hover) => {
    const prev = hoverRef.current;
    const same = prev === next || (!!prev && !!next && (
      (prev.kind === 'item' && next.kind === 'item' && prev.id === next.id) ||
      (prev.kind === 'prov' && next.kind === 'prov' && prev.code === next.code) ||
      (prev.kind === 'cam' && next.kind === 'cam' && prev.id === next.id) ||
      (prev.kind === 'camgroup' && next.kind === 'camgroup' && prev.key === next.key)
    ));
    if (same) return;
    hoverRef.current = next;
    setHover(next);
    onHoverChange({
      prov: next?.kind === 'prov' ? next.code : null,
      id: next?.kind === 'item' ? next.id : null,
      cam: next?.kind === 'cam' ? next.id : null,
    });
  }, [onHoverChange]);

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    pointer.current = [px, py];
    applyHover(e.buttons ? null : hitTest(px, py, e.target));
    positionTip();
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, e.target);
    if (hit?.kind === 'item') onSelectItem(hit.id === selectedId ? null : hit.id);
    else if (hit?.kind === 'cam') {
      onSelectCam(hit.id);
      // peta akan terbang ke kamera ini: tooltip "klik untuk melihat" tidak ikut tertinggal di tempat kursor
      applyHover(null);
    } else if (hit?.kind === 'camgroup') zoomToCams(scene?.cams.find(m => m.key === hit.key)?.cams ?? []);
    else if (hit?.kind === 'prov') onSelectProv(hit.code);
    else { onSelectItem(null); onSelectProv(null); }
  };

  /** Perbesar sampai sekelompok kamera terpisah satu per satu. */
  const zoomToCams = (list: Camera[]) => {
    const el = svgRef.current;
    const z = zoomRef.current;
    if (!el || !z || !geo || !list.length) return;
    const pts = list.map(c => geo.projection([c.lon!, c.lat!]) ?? [0, 0]);
    const x0 = Math.min(...pts.map(p => p[0]));
    const x1 = Math.max(...pts.map(p => p[0]));
    const y0 = Math.min(...pts.map(p => p[1]));
    const y1 = Math.max(...pts.map(p => p[1]));
    const vw = w - inset;
    const k = Math.max(CAM_SPLIT_ZOOM + 1, Math.min(16, 0.45 / Math.max((x1 - x0) / vw, (y1 - y0) / h, 1e-6)));
    const to = zoomIdentity.translate(vw / 2 - (k * (x0 + x1)) / 2, h / 2 - (k * (y0 + y1)) / 2).scale(k);
    select(el).transition().duration(prefersReducedMotion() ? 0 : 480).call(z.transform, to);
  };

  useLayoutEffect(positionTip, [hover, positionTip]);

  const zoomBy = (factor: number) => {
    const el = svgRef.current;
    const z = zoomRef.current;
    if (el && z) select(el).transition().duration(prefersReducedMotion() ? 0 : 220).call(z.scaleBy, factor);
  };
  const resetView = () => {
    onSelectItem(null);
    if (selectedProv) { onSelectProv(null); return; }
    const el = svgRef.current;
    const z = zoomRef.current;
    if (el && z) select(el).transition().duration(prefersReducedMotion() ? 0 : 480).call(z.transform, zoomIdentity);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    const z = zoomRef.current;
    if (!el || !z) return;
    const pan = (dx: number, dy: number) => { e.preventDefault(); select(el).call(z.translateBy, dx / t.k, dy / t.k); };
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.6); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.6); }
    else if (e.key === '0' || e.key === 'Escape') { e.preventDefault(); resetView(); }
    else if (e.key === 'ArrowLeft') pan(60, 0);
    else if (e.key === 'ArrowRight') pan(-60, 0);
    else if (e.key === 'ArrowUp') pan(0, 60);
    else if (e.key === 'ArrowDown') pan(0, -60);
  };

  const hoverProvCode = hover?.kind === 'prov' ? hover.code : hoverProv;
  const focusItem = hover?.kind === 'item' ? hover.id : hoverId;
  const focusCam = hover?.kind === 'cam' ? hover.id : hoverCam;
  const focusWarn = focusItem && warnGeo.has(focusItem) ? focusItem : null;
  const selectedWarn = selectedId && warnGeo.has(selectedId) ? selectedId : null;
  const zoomed = t.k > 1.02 || Math.abs(t.x) > 1 || Math.abs(t.y) > 1;
  const nLocated = reports.reduce((n, r) => n + (r.loc ? 1 : 0), 0);
  const nIncident = reports.reduce((n, r) => n + (r.loc && r.incident ? 1 : 0), 0);

  // ── Isi tooltip ──
  let tip: React.ReactNode = null;
  if (hover?.kind === 'item') {
    const it = byId.get(hover.id);
    if (it?.kind === 'berita') {
      const loc = it.loc!;
      const where = loc.place && loc.place.name !== loc.label ? `${loc.label}, ${loc.place.name}` : loc.label;
      tip = (
        <>
          <div className="sr-tip-kicker">
            <span className={`sr-key ${it.incident ? 'is-incident' : 'is-other'}`} />
            <span>{it.incident ? it.label : 'Berita'}</span>
            {it.time !== null && <span className="sr-tip-time">{fmtAgo(it.time, now)}</span>}
          </div>
          <div className="sr-tip-title">{it.title}</div>
          <div className="sr-tip-meta">{loc.place ? `${where}, ${provName(loc.prov)}` : where}</div>
          <div className="sr-tip-meta">{it.source}</div>
        </>
      );
    } else if (it?.kind === 'peringatan') {
      const g = warnGeo.get(it.id);
      const asMark = !scene?.legible.includes(it.id);
      tip = (
        <>
          <div className="sr-tip-kicker">
            <span className="sr-key is-warn" />
            <span>Peringatan cuaca BMKG</span>
            <span className="sr-tip-time">{warnWhen(it, now)}</span>
          </div>
          <div className="sr-tip-title">{it.event}</div>
          <div className="sr-tip-meta">{[it.area, it.places].filter(Boolean).join(': ')}</div>
          <div className="sr-tip-meta">{warnSpan(it)}</div>
          {asMark && g?.d && <div className="sr-tip-meta">Klik untuk melihat daerah terdampak</div>}
        </>
      );
    } else if (it?.kind === 'gempa') {
      tip = (
        <>
          <div className="sr-tip-kicker">
            <span className="sr-key is-quake" />
            <span>Gempa</span>
            {it.time !== null && <span className="sr-tip-time">{fmtAgo(it.time, now)}</span>}
          </div>
          <div className="sr-tip-title">Magnitudo {fmtMag(it.mag)}</div>
          <div className="sr-tip-meta">{it.place}</div>
          <div className="sr-tip-meta">
            {it.depthKm !== null ? `Kedalaman ${it.depthKm} km` : 'Kedalaman tidak tercatat'}
            {it.time !== null ? `, ${fmtDateTime(it.time)}` : ''}
          </div>
        </>
      );
    }
  } else if (hover?.kind === 'cam') {
    const c = cameras.find(x => x.id === hover.id);
    if (c) {
      tip = (
        <>
          <div className="sr-tip-kicker"><span className="sr-key is-cam" /><span>CCTV</span></div>
          <div className="sr-tip-title">{c.name}</div>
          <div className="sr-tip-meta">{[c.area, c.source].filter(Boolean).join(', ')}</div>
          {c.id !== selectedCam && <div className="sr-tip-meta">Klik untuk melihat gambar terkini</div>}
        </>
      );
    }
  } else if (hover?.kind === 'camgroup') {
    const m = scene?.cams.find(x => x.key === hover.key);
    if (m) {
      const sources = [...new Set(m.cams.map(c => c.source))];
      tip = (
        <>
          <div className="sr-tip-kicker"><span className="sr-key is-cam" /><span>CCTV</span></div>
          <div className="sr-tip-title">{m.cams.length} kamera berdekatan</div>
          <div className="sr-tip-meta">{sources.join(', ')}</div>
          <div className="sr-tip-meta">Klik untuk memperbesar dan memilih kamera</div>
        </>
      );
    }
  } else if (hover?.kind === 'prov') {
    const s = stats.get(hover.code);
    const nWarn = warnByProv.get(hover.code) ?? 0;
    tip = (
      <>
        <div className="sr-tip-title">{provName(hover.code)}</div>
        {s || nWarn > 0 ? (
          <dl className="sr-tip-rows">
            {nWarn > 0 && <><dt><span className="sr-key is-warn" />Peringatan cuaca</dt><dd>{nWarn}</dd></>}
            {s && s.incidents > 0 && <><dt><span className="sr-key is-incident" />Insiden</dt><dd>{s.incidents}</dd></>}
            {s && s.quakes > 0 && <><dt><span className="sr-key is-quake" />Gempa</dt><dd>{s.quakes}</dd></>}
            {s && s.others > 0 && <><dt><span className="sr-key is-other" />Berita lain</dt><dd>{s.others}</dd></>}
          </dl>
        ) : (
          <div className="sr-tip-meta">Tidak ada laporan pada rentang ini</div>
        )}
      </>
    );
  }

  return (
    <div ref={wrapRef} className="sr-map">
      {geo && scene && (
        <svg
          ref={svgRef}
          className={`sr-map-svg${selectedProv ? ' has-selection' : ''}`}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          tabIndex={0}
          aria-label={`Peta sebaran laporan Indonesia: ${nIncident} insiden berlokasi, ${quakes.length} gempa, ${nLocated - nIncident} berita lain${warnings.length ? `, ${warnings.length} peringatan cuaca BMKG` : ''}${cameras.length ? `, ${cameras.length} kamera CCTV` : ''}. Tombol plus dan minus untuk memperbesar, panah untuk menggeser, 0 untuk kembali. Daftar provinsi di bawah peta memuat angka yang sama.`}
          onPointerMove={onPointerMove}
          onPointerLeave={() => applyHover(null)}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
            <BaseLayer ctx={geo.ctx} provs={geo.provs} hover={hoverProvCode} selected={selectedProv} />
            <WarnLayer areas={warnAreas} focus={focusWarn} selected={selectedWarn} />
          </g>
          <g className="sr-map-marks">
            {scene.names.map(n => (
              <text key={n.key} className="sr-map-place" x={n.x} y={n.y} textAnchor="middle">{n.text}</text>
            ))}
            {scene.rings.map(q => (
              <g key={q.id} className={`sr-quake${q.id === selectedId ? ' is-selected' : ''}${q.id === focusItem ? ' is-focus' : ''}`} opacity={q.opacity}>
                <circle className="sr-quake-ring" cx={q.x} cy={q.y} r={q.r} />
                <circle className="sr-quake-core" cx={q.x} cy={q.y} r={1.7} />
              </g>
            ))}
            {scene.tris.map(m => (
              <path
                key={m.id}
                className={`sr-warn-mark${m.id === selectedId ? ' is-selected' : ''}${m.id === focusItem ? ' is-focus' : ''}`}
                d={trianglePath(m.x, m.y, WARN_R)}
              />
            ))}
            {scene.cams.map(m => {
              const focus = m.cams.some(c => c.id === focusCam) || (hover?.kind === 'camgroup' && hover.key === m.key);
              if (m.cams.length > 1) {
                const hw = camGroupHalf(m.cams.length);
                return (
                  <g key={m.key} className={`sr-camg${focus ? ' is-focus' : ''}${m.cams.some(c => c.id === selectedCam) ? ' is-selected' : ''}`}>
                    <rect x={m.x - hw} y={m.y - 8} width={hw * 2} height={16} rx={3} />
                    <text x={m.x} y={m.y + 3.7} textAnchor="middle">{m.cams.length}</text>
                  </g>
                );
              }
              return (
                <rect
                  key={m.key}
                  className={`sr-cam${m.cams[0].id === selectedCam ? ' is-selected' : ''}${focus ? ' is-focus' : ''}`}
                  x={m.x - CAM_HALF}
                  y={m.y - CAM_HALF}
                  width={CAM_HALF * 2}
                  height={CAM_HALF * 2}
                  rx={1.5}
                />
              );
            })}
            {scene.sel && (
              <g className="sr-cam-reticle" transform={`translate(${scene.sel.x},${scene.sel.y})`}>
                <circle r={scene.sel.r + 8} />
                <path d={`M0,${-scene.sel.r - 13}v6M0,${scene.sel.r + 7}v6M${-scene.sel.r - 13},0h6M${scene.sel.r + 7},0h6`} />
              </g>
            )}
            {scene.dots.map(d => (
              <circle
                key={d.id}
                className={`sr-dot${d.incident ? ' is-incident' : ''}${d.id === selectedId ? ' is-selected' : ''}${d.id === focusItem ? ' is-focus' : ''}`}
                cx={d.x}
                cy={d.y}
                r={DOT_R}
              />
            ))}
            {scene.more.map(m => (
              <text key={m.key} className="sr-map-more" x={m.x} y={m.y} textAnchor="middle">+{m.n}</text>
            ))}
            {scene.labels.map(l => (
              <text key={l.key} className="sr-map-label" x={l.x} y={l.y}>
                <tspan className="sr-map-label-strong">{l.strong}</tspan>
                {l.rest && <tspan dx={5}>{l.rest}</tspan>}
              </text>
            ))}
          </g>
        </svg>
      )}

      {note && <div className="sr-map-note" role="status">{note}</div>}

      <div className="sr-map-legend" aria-hidden="true">
        <svg width="150" height="52" viewBox="0 0 150 52">
          <text className="sr-map-legend-text" x="0" y="10">Magnitudo gempa</text>
          {[5, 6, 7].map((m, i) => {
            const r = quakeRadius(m);
            const cx = [8, 44, 96][i];
            return (
              <g key={m}>
                <circle className="sr-quake-ring" cx={cx} cy={50 - r - 1} r={r} />
                <text className="sr-map-legend-text" x={cx + r + 4} y={48}>{m}</text>
              </g>
            );
          })}
        </svg>
        <div className="sr-map-legend-row">Satu titik = satu laporan berita</div>
        {warnings.length > 0 && (
          <div className="sr-map-legend-row"><span className="sr-key is-warn" />Peringatan cuaca; perbesar untuk daerahnya</div>
        )}
      </div>

      {/* popup kamera menutupi sisi kanan peta: tombol zoom pindah ke tepi bagian yang masih terlihat */}
      <div className="sr-map-zoom" style={inset ? { right: inset + 12 } : undefined}>
        {(zoomed || selectedProv) && (
          <button type="button" className="sr-map-btn is-wide" onClick={resetView}>Seluruh Indonesia</button>
        )}
        <button type="button" className="sr-map-btn" onClick={() => zoomBy(1.6)} aria-label="Perbesar peta">+</button>
        <button type="button" className="sr-map-btn" onClick={() => zoomBy(1 / 1.6)} aria-label="Perkecil peta">−</button>
      </div>

      <div className="sr-map-attr">Batas wilayah: BPS, WFP, OCHA melalui geoBoundaries (CC BY 3.0 IGO); Natural Earth</div>

      {scene?.sel && camPreview && (() => {
        // Kartu pratinjau menempel pada penanda dan ikut bergerak bersama peta: di atas penanda bila muat, selain
        // itu di bawahnya, dan digeser mendatar secukupnya supaya tetap di bagian peta yang terlihat. Penanda yang
        // tergeser ke luar layar atau ke bawah popup tidak diberi kartu (kartunya akan menunjuk ke tempat kosong),
        // begitu pula bila peta terlalu pendek untuk kartu di sisi mana pun: cukup retikelnya.
        const { x, y, r } = scene.sel;
        const right = w - inset;
        if (x < 0 || x > right || y < 0 || y > h) return null;
        const reach = r + 9;                       // tepi retikel
        const above = y - reach - 4 - PEEK_H;      // sisa ruang untuk garis penghubung bila kartu di atas
        const under = h - y - reach - 4 - PEEK_H;
        const below = above < PEEK_GAP_MIN;
        const gap = Math.min(PEEK_GAP, below ? under : above);
        if (gap < PEEK_GAP_MIN) return null;
        const left = Math.max(8, Math.min(x - PEEK_W / 2, right - PEEK_W - 8));
        return (
          <div className={`sr-campeek${below ? ' is-below' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }} aria-hidden="true">
            <span className="sr-campeek-line" style={below ? { top: reach, height: gap } : { bottom: reach, height: gap }} />
            <div className="sr-campeek-card" style={{ left: left - x, ...(below ? { top: reach + gap } : { bottom: reach + gap }) }}>
              {camPreview.hasStream && (
                <div className="sr-campeek-img">
                  {camPreview.src && <img src={camPreview.src} alt="" />}
                  <span className={`sr-campeek-badge is-${camPreview.tone}`}><i />{camPreview.badge}</span>
                </div>
              )}
              <div className="sr-campeek-name"><i /><span>{camPreview.name}</span></div>
            </div>
          </div>
        );
      })()}

      <div ref={tipRef} className="sr-map-tip" role="tooltip" hidden={!tip}>{tip}</div>
    </div>
  );
}
