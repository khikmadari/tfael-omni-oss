// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · bola dunia animasi pembuka
//
// Diputar sekali tepat setelah login, di dalam tirai IntroCover: bola dunia berputar, mendekat ke
// Indonesia, lalu berubah bentuk dari proyeksi bola (ortografik) ke proyeksi peta SITREP (Mercator)
// sampai gambarnya berimpit persis dengan peta yang menunggu di bawah tirai. Tirai lalu memudar.
//
// Tidak ada data hiasan. Butiran hijau adalah daratan dunia (Natural Earth); nama negara ditaruh di tengah
// negaranya (batas Natural Earth, nama Indonesia menurut CLDR); bentuk Indonesia dan
// tetangganya adalah geometri peta SITREP sendiri; tanda yang menyala dibaca langsung dari peta SITREP
// di bawah tirai, jadi hanya laporan, gempa, peringatan, dan kamera yang benar-benar sudah diterima
// dari server dan sudah digambar di sana, tepat di tempat yang sama. Angka di sudut kiri bawah adalah
// jumlahnya yang sebenarnya. Data yang belum tiba tidak digambar.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { claimIntro, finishIntro, useIntroPhase, useIntroStage } from '@/components/intro/introStore';
import { useAuth } from '@/context/AuthContext';
import negaraJson from './geo/dunia-negara.json';
import duniaJson from './geo/dunia-titik.json';
import { KONTEKS, PROVINSI } from './geo-data.ts';
import { fitIndonesia } from './SebaranMap.tsx';
import type { CctvPhase } from './useCctv.ts';
import type { Phase, SitrepData } from './useSitrepData.ts';

export interface GlobeIntroProps {
  /** Keadaan pengambilan berita dan gempa. */
  phase: Phase;
  data: SitrepData | null;
  cctvPhase: CctvPhase;
  /** Angka untuk keterangan: berita dan gempa pada rentang waktu yang sedang dipilih, peringatan yang berlaku, semua kamera. */
  counts: { news: number; quakes: number; warnings: number; cams: number };
  /** Rentang waktu itu, mis. "7 hari". */
  span: string;
}

// ── Garis waktu, dalam ms waktu animasi ──
/**
 * Waktu animasi maju mengikuti bingkai yang benar-benar tergambar, paling banyak sekian ms per bingkai.
 * Kalau halaman tersendat (SITREP di bawah tirai sedang dimuat dan ditata, atau tab sempat ditinggal),
 * bola dunia berhenti sejenak lalu lanjut dari tempat yang sama; bagian yang tak sempat tergambar tidak dilompati.
 */
const MAX_STEP_MS = 100;
const SPIN: [number, number] = [100, 2400];
const ZOOM: [number, number] = [1950, 3650];
/** Tanda mulai menyala, menyapu dari barat ke timur. */
const MARKS_AT = 2900;
const MARKS_SPREAD = 480;
/** Seberapa sering letak tanda dibaca ulang dari peta SITREP (data bisa tiba di tengah animasi). */
const MARKS_POLL_MS = 100;
const POP_MS = 320;
const PING_MS = 520;
const HUD_OUT_AT = 3050;
/** Gambar sudah berimpit dengan peta; tahan sebentar, lalu tirai memudar. */
const END_AT = 3900;
/** Berita/gempa belum juga tiba: tunggu paling lama sampai sini supaya tandanya sempat menyala. */
const WAIT_UNTIL = 5200;

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** Putaran memakai lengkung sinus: kecepatan puncaknya lebih rendah, bola tidak terasa disentak. */
const easeSpin = (u: number): number => 0.5 - 0.5 * Math.cos(Math.PI * u);
const smooth = (a: number, b: number, v: number): number => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };
const popOut = (u: number): number => 1 + 2.70158 * Math.pow(u - 1, 3) + 1.70158 * Math.pow(u - 1, 2);
const mercY = (phi: number): number => Math.max(-4, Math.min(4, Math.log(Math.tan(Math.PI / 4 + phi / 2))));
const wrap = (a: number): number => a - TAU * Math.round(a / TAU);

/** Bujur tengah peta SITREP: ke sanalah bola dunia berhenti berputar. */
const LON_C = (fitIndonesia(1000, 500).invert?.([500, 250])?.[0] ?? 118.45) * D2R;
/** Awal putaran: Afrika dan Eropa di depan, Indonesia masih di balik tepi kanan. */
const LON_S = LON_C - 120 * D2R;
const LAT_S = 18 * D2R;

// ── Butiran daratan dunia: baris lintang, tiap baris berisi rentang kolom yang berupa darat ──
const DUNIA = duniaJson as { step: number; rows: number[][] };
interface Dots { n: number; sp: Float32Array; cp: Float32Array; sl: Float32Array; cl: Float32Array; dl: Float32Array; my: Float32Array }
function buildDots(): Dots {
  const { step, rows } = DUNIA;
  let n = 0;
  for (const r of rows) for (let k = 1; k < r.length; k += 2) n += r[k];
  const d: Dots = {
    n, sp: new Float32Array(n), cp: new Float32Array(n), sl: new Float32Array(n), cl: new Float32Array(n),
    dl: new Float32Array(n), my: new Float32Array(n),
  };
  let i = 0;
  rows.forEach((runs, row) => {
    const lat = (-90 + (row + 0.5) * step) * D2R;
    const cols = Math.max(1, Math.round((360 * Math.cos(lat)) / step));
    const s = Math.sin(lat), c = Math.cos(lat), m = mercY(lat);
    for (let k = 0; k < runs.length; k += 2) {
      for (let j = runs[k], e = runs[k] + runs[k + 1]; j < e; j++) {
        const lon = (-180 + ((j + (row % 2 ? 0.5 : 0)) * 360) / cols) * D2R;
        d.sp[i] = s; d.cp[i] = c; d.sl[i] = Math.sin(lon); d.cl[i] = Math.cos(lon);
        d.dl[i] = wrap(lon - LON_C); d.my[i] = m;
        i++;
      }
    }
  });
  return d;
}

// ── Bentuk Indonesia dan tetangganya, dihitung sekali untuk pandangan akhir (pusat di LON_C, khatulistiwa) ──
// xo, yo = letak pada bola; xm, ym = letak pada peta Mercator. Tiap bingkai tinggal mencampur keduanya.
// eps > 0 menipiskan garis: titik yang lebih rapat dari eps (radian pada peta) dilewati, dan cincin yang
// menyusut menjadi kurang dari tiga titik dibuang. Dipakai selagi gambar bergerak; bingkai terakhir memakai
// garis utuh supaya sama dengan peta SITREP sampai ke pulau terkecil.
interface Shape { start: Uint32Array; xo: Float32Array; yo: Float32Array; xm: Float32Array; ym: Float32Array }
function buildShape(polygons: number[][][][], eps: number): Shape {
  const xm: number[] = [], ym: number[] = [], lat: number[] = [], start: number[] = [];
  for (const poly of polygons) {
    for (const ring of poly) {
      const begin = xm.length;
      let lx = Infinity, ly = Infinity;
      for (const pt of ring) {
        const phi = pt[1] * D2R, d = wrap(pt[0] * D2R - LON_C), y = mercY(phi);
        if (Math.abs(d - lx) < eps && Math.abs(y - ly) < eps) continue;
        xm.push(d); ym.push(y); lat.push(phi);
        lx = d; ly = y;
      }
      if (xm.length - begin < 3) { xm.length = ym.length = lat.length = begin; continue; }
      start.push(begin);
    }
  }
  start.push(xm.length);
  const n = xm.length;
  const s: Shape = { start: Uint32Array.from(start), xo: new Float32Array(n), yo: new Float32Array(n), xm: Float32Array.from(xm), ym: Float32Array.from(ym) };
  for (let i = 0; i < n; i++) { s.xo[i] = Math.cos(lat[i]) * Math.sin(xm[i]); s.yo[i] = Math.sin(lat[i]); }
  return s;
}
/** Selagi bergerak, garis ditipiskan sampai ketelitian ini (piksel pada skala akhir): tidak terlihat, jauh lebih ringan. */
const MOVING_PX = 1.5;

// ── Keterangan negara: [nama, bujur, lintang, luas (ribu km²), 1 = tetangga], berurut menurut prioritas ──
// (Indonesia, lalu dari yang terluas). Lihat geo/dunia-negara.json untuk sumber dan aturannya.
const NEGARA = (negaraJson as unknown as { negara: [string, number, number, number, number?][] }).negara;
/** Tulisannya mengikuti label peta SITREP (.sr-map-label), supaya bola dunia dan peta terasa satu benda. */
const SANS = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const LABEL_FONT = `400 11.5px ${SANS}`;
const LABEL_FONT_HOME = `600 13px ${SANS}`;
/** Muncul setelah bola terlihat; hilang selagi butiran daratan berganti menjadi peta SITREP (lihat labelsA). */
const LABELS_IN: [number, number] = [350, 900];
/**
 * Negara mendapat keterangan bila di layar ia cukup besar untuk memuatnya: lebar kira-kiranya (akar luas) minimal
 * sekian piksel. Saat bola mendekat, negara yang lebih kecil ikut memenuhi syarat. Tetangga kecil Indonesia
 * (Brunei, Singapura, Timor Leste) tidak akan pernah sebesar itu: mereka ikut begitu bola mulai mendekat,
 * dan karena prioritasnya paling rendah hanya mengisi tempat yang memang kosong.
 */
const LABEL_MIN_PX = 18;
const EARTH_KM = 6371;
/** Jarak kosong antarketerangan (px). Kalau bertumpuk, yang prioritasnya lebih rendah mengalah dan memudar. */
const LABEL_GAP_X = 12;
const LABEL_GAP_Y = 6;
const LABEL_KEEP = 0.35;
const LABEL_FADE_MS = 220;
/** Di tepi bola negara terlihat sangat miring dan saling merapat: keterangan hanya untuk yang cukup menghadap ke depan. */
const LABEL_Z: [number, number] = [0.3, 0.55];
interface Label {
  name: string; home: boolean; near: boolean;
  /** Lebar kira-kira negara sebagai sudut di permukaan bumi (radian). */
  span: number;
  lon: number; sp: number; cp: number; dl: number; my: number;
  /** Setengah lebar dan setengah tinggi tulisan (px). */
  hw: number; hh: number;
  /** Keadaan antarbingkai: kepekatan 0–1, letak terakhir di layar, dan apakah sedang menghadap ke depan. */
  a: number; x: number; y: number; front: boolean;
}

type Rgb = [number, number, number];
const hex = (v: string, fallback: Rgb): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb, alpha = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;

/** Satu tanda di peta SITREP, dengan tempatnya di bumi dihitung balik dari letaknya di layar. */
interface Mark {
  key: string;
  kind: 'quake' | 'warn' | 'cam' | 'dot';
  lon: number; lat: number;
  /** Jari-jari (titik, cincin gempa, segitiga) atau setengah lebar (kamera), dalam piksel pada skala akhir. */
  r: number;
  /** Setengah tinggi tanda kamera. */
  hh: number;
  incident: boolean;
  /** Angka pada tanda gabungan kamera; '' untuk kamera tunggal. */
  text: string;
  opacity: number;
  born: number;
}

function makeScene(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, stage: HTMLElement) {
  const dots = buildDots();
  const dim = new Float32Array(dots.n * 2);
  const provPolys = PROVINSI.features.flatMap(f => f.geometry.coordinates);
  const ctxPolys = KONTEKS.geometry.coordinates;
  /** Garis utuh untuk bingkai terakhir; garis tipis (dibuat saat skala akhirnya diketahui) untuk bingkai bergerak. */
  let full: { prov: Shape; ctx: Shape } | null = null;
  let thin: { prov: Shape; ctx: Shape; rm: number } | null = null;
  /** Bingkai terakhir sudah tergambar dan tidak ada lagi yang bergerak: tidak perlu digambar ulang. */
  let still = '';
  /** Peta yang sudah berimpit (semua selain tanda), digambar sekali lalu ditempel selagi tanda masih menyala. */
  let base: { key: string; canvas: HTMLCanvasElement } | null = null;
  const labels: Label[] = NEGARA.map(([name, lon, lat, km2, near], i) => ({
    name, home: i === 0, near: near === 1, span: Math.sqrt(km2 * 1000) / EARTH_KM,
    lon: lon * D2R, sp: Math.sin(lat * D2R), cp: Math.cos(lat * D2R), dl: wrap(lon * D2R - LON_C), my: mercY(lat * D2R),
    hw: 0, hh: i === 0 ? 8 : 7, a: 0, x: 0, y: 0, front: false,
  }));
  /** Kotak keterangan yang sudah mendapat tempat pada bingkai ini: x, y, setengah lebar, setengah tinggi. */
  const taken = new Float32Array(labels.length * 4);
  /** Lebar tulisan sudah diukur dengan fon SITREP (true) atau baru dengan fon pengganti (false); null = belum diukur. */
  let measured: boolean | null = null;
  let lastT = 0;
  let shownLabels = -1;

  // warna tanda dan peta diambil dari tema SITREP supaya bingkai terakhir sama dengan peta di bawah tirai
  const root = document.querySelector<HTMLElement>('.sr');
  const tok = (name: string, fallback: string): Rgb => {
    const v = root ? getComputedStyle(root).getPropertyValue(name) : '';
    return hex(v || fallback, hex(fallback, [0, 0, 0]));
  };
  const SEA = tok('--sr-bg', '#161616');
  const LAND = tok('--sr-land', '#393939');
  const CTX = tok('--sr-ctx', '#222222');
  const INK = tok('--sr-ink', '#f0ede7');
  const INK2 = tok('--sr-ink-2', '#c6c3bc');
  const C_INCIDENT = tok('--sr-incident', '#d95926');
  const C_OTHER = tok('--sr-other', '#7d7b76');
  const C_QUAKE = tok('--sr-quake', '#3987e5');
  const C_WARN = tok('--sr-warn', '#f1c21b');
  const SPACE: Rgb = [13, 12, 8];
  const BODY: Rgb = [17, 21, 15];
  const GREEN: Rgb = [166, 206, 112];

  let fitW = 0, fitH = 0, fitK = 1, fitTx = 0, fitTy = 0;
  let marks: Mark[] = [];
  let polled = -Infinity;
  const born = new Map<string, number>();
  /** Berita/gempa masih ditunggu pada bingkai sebelumnya; dan kapan akhirnya tiba. */
  let wasWaiting = true;
  let arrived = 0;

  /**
   * Baca tanda yang sudah digambar peta SITREP di bawah tirai (peta itu masih pada tampilan seluruh Indonesia).
   * Letak layarnya, sudah termasuk susunan gugus dan geseran antartanda, dihitung balik menjadi bujur-lintang,
   * sehingga pada bingkai terakhir tiap tanda jatuh tepat di atas aslinya. Yang baru muncul diberi giliran
   * menyala dari barat ke timur.
   */
  function readMarks(t: number): void {
    polled = t;
    const svg = document.querySelector('.sr .sr-map-svg');
    if (!svg) { marks = []; return; }
    const list: Mark[] = [];
    const num = (el: Element, name: string): number => Number(el.getAttribute(name));
    const add = (kind: Mark['kind'], x: number, y: number, r: number, more: Partial<Mark> = {}) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(r > 0)) return;
      list.push({
        key: `${kind}:${Math.round(x)}:${Math.round(y)}`, kind,
        lon: (x - fitTx) / fitK, lat: 2 * Math.atan(Math.exp((fitTy - y) / fitK)) - Math.PI / 2,
        r, hh: r, incident: false, text: '', opacity: 1, born: 0, ...more,
      });
    };
    for (const g of svg.querySelectorAll('.sr-quake')) {
      const c = g.querySelector('.sr-quake-ring');
      if (c) add('quake', num(c, 'cx'), num(c, 'cy'), num(c, 'r'), { opacity: Number(g.getAttribute('opacity') ?? 1) || 1 });
    }
    for (const el of svg.querySelectorAll('.sr-warn-mark')) {
      // d = "M x,(y - r) L (x + 0.866 r),(y + 0.5 r) …": titik pertama puncak segitiga, titik kedua sudut kanan bawah
      const m = /^M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)/.exec(el.getAttribute('d') ?? '');
      if (!m) continue;
      const r = (Number(m[4]) - Number(m[2])) / 1.5;
      add('warn', Number(m[1]), Number(m[2]) + r, r);
    }
    for (const g of svg.querySelectorAll('.sr-camg')) {
      const rc = g.querySelector('rect');
      if (!rc) continue;
      const w = num(rc, 'width'), h = num(rc, 'height');
      add('cam', num(rc, 'x') + w / 2, num(rc, 'y') + h / 2, w / 2, { hh: h / 2, text: (g.textContent ?? '').trim() });
    }
    for (const rc of svg.querySelectorAll('rect.sr-cam')) {
      const w = num(rc, 'width'), h = num(rc, 'height');
      add('cam', num(rc, 'x') + w / 2, num(rc, 'y') + h / 2, w / 2, { hh: h / 2 });
    }
    for (const c of svg.querySelectorAll('circle.sr-dot')) {
      add('dot', num(c, 'cx'), num(c, 'cy'), num(c, 'r'), { incident: c.classList.contains('is-incident') });
    }
    const fresh = list.filter(m => !born.has(m.key)).sort((p1, p2) => p1.lon - p2.lon);
    const step = Math.min(22, MARKS_SPREAD / Math.max(1, fresh.length));
    fresh.forEach((m, i) => born.set(m.key, Math.max(t, MARKS_AT) + i * step));
    for (const m of list) m.born = born.get(m.key) ?? 0;
    marks = list;
  }

  /** Gambar satu bingkai pada waktu t; mengembalikan waktu animasi ini akan selesai. */
  function draw(t: number, p: GlobeIntroProps): number {
    const dt = Math.max(0, t - lastT);
    lastT = t;
    const W = stage.clientWidth, H = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Tujuan: peta SITREP yang sudah tertata di bawah tirai ──
    const sr = stage.getBoundingClientRect();
    const mr = document.querySelector('.sr .sr-map')?.getBoundingClientRect();
    let boxW = W, boxH = H * 0.6, boxL = 0, boxT = H * 0.2;
    if (mr && mr.width >= 80 && mr.height >= 80) { boxW = mr.width; boxH = mr.height; boxL = mr.left - sr.left; boxT = mr.top - sr.top; }
    if (boxW !== fitW || boxH !== fitH) {
      const m = fitIndonesia(boxW, boxH);
      fitK = m.scale(); [fitTx, fitTy] = m.translate(); fitW = boxW; fitH = boxH;
    }
    const Rm = fitK;
    const mx = boxL + fitTx + fitK * LON_C;   // letak (bujur tengah, khatulistiwa) di peta
    const my = boxT + fitTy;

    // ── Tanda dibaca lebih dulu: data yang baru tiba menggerakkan gambar lagi ──
    // Begitu berita/gempa tiba, peta langsung dibaca (tidak menunggu giliran baca berikutnya) dan animasi
    // tidak ditutup pada bingkai itu juga: tanda yang baru tiba harus sempat menyala.
    const waiting = p.phase === 'loading';
    const landed = wasWaiting && !waiting;
    if (landed) arrived = t;
    wasWaiting = waiting;
    if (t >= ZOOM[0] && (landed || t - polled >= MARKS_POLL_MS)) readMarks(t);
    let last = 0;
    for (const m of marks) if (m.born > last) last = m.born;
    const end = Math.min(WAIT_UNTIL, waiting ? WAIT_UNTIL : Math.max(END_AT, last + POP_MS + 150, arrived + 250));
    // gambar sudah berimpit dan tidak ada tanda yang masih menyala: bingkai ini sama persis dengan yang sebelumnya
    const frozen = t >= ZOOM[1] && t > last + PING_MS ? `${cw}x${ch}:${boxL},${boxT},${boxW},${boxH}:${marks.length}` : '';
    if (frozen && frozen === still) return end;
    still = frozen;

    // ── Waktu ──
    const aIn = clamp01(t / 450);
    const pS = easeSpin(clamp01((t - SPIN[0]) / (SPIN[1] - SPIN[0])));
    const pZ = ease(clamp01((t - ZOOM[0]) / (ZOOM[1] - ZOOM[0])));
    const settled = pS >= 1;
    const R0 = Math.max(120, Math.min(400, Math.min(W, H) * 0.37));
    const R = R0 * (0.92 + 0.08 * (1 - Math.pow(1 - aIn, 3))) * Math.pow(Rm / R0, pZ);
    const cx = W / 2 + (mx - W / 2) * pZ;
    const cy = H * 0.52 + (my - H * 0.52) * pZ;
    const lon0 = LON_S + (LON_C - LON_S) * pS;
    const lat0 = LAT_S * (1 - pS);
    /** 0 = bola (ortografik), 1 = peta SITREP (Mercator). Baru bergerak setelah bola berhenti berputar. */
    const a = settled ? smooth(0.5, 1, pZ) : 0;
    /** Warna ruang dan badan bola menuju warna laut peta, sehingga tepi bola hilang sebelum bentuknya berubah. */
    const flat = smooth(0.08, 0.5, pZ);

    const sl0 = Math.sin(lon0), cl0 = Math.cos(lon0), sp0 = Math.sin(lat0), cp0 = Math.cos(lat0);

    /** Semua selain tanda: ruang, bola, garis lintang-bujur, daratan, butiran, peredam di luar kotak peta. */
    const world = (g: CanvasRenderingContext2D): void => {
      // ── Ruang, pendar tepi, badan bola ──
      g.globalAlpha = 1;
      g.fillStyle = css(mix(SPACE, SEA, flat));
      g.fillRect(0, 0, W, H);
      const glow = aIn * (1 - flat);
      if (glow > 0.01) {
        const halo = g.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.16);
        halo.addColorStop(0, css(GREEN, 0.2 * glow));
        halo.addColorStop(1, css(GREEN, 0));
        g.fillStyle = halo;
        g.beginPath(); g.arc(cx, cy, R * 1.16, 0, TAU); g.fill();
      }
      if (flat < 1) {
        const body = mix(BODY, SEA, flat);
        const shade = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
        shade.addColorStop(0, css(mix(body, GREEN, 0.07 * (1 - flat)), aIn));
        shade.addColorStop(1, css(body, aIn));
        g.fillStyle = shade;
        g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
        g.strokeStyle = css(GREEN, 0.42 * glow);
        g.lineWidth = 1;
        g.stroke();
      }

      // ── Garis lintang dan bujur tiap 30° ──
      const grid = 0.1 * aIn * (1 - smooth(0.05, 0.45, pZ));
      if (grid > 0.004) {
        g.strokeStyle = css(GREEN, grid);
        g.lineWidth = 1;
        g.beginPath();
        const seg = (lon: number, lat: number, pen: boolean): boolean => {
          const d = lon - lon0, cp = Math.cos(lat), sp = Math.sin(lat), cd = Math.cos(d);
          if (sp0 * sp + cp0 * cp * cd <= 0) return false;
          const x = cx + R * cp * Math.sin(d), y = cy - R * (cp0 * sp - sp0 * cp * cd);
          if (pen) g.lineTo(x, y); else g.moveTo(x, y);
          return true;
        };
        for (let lon = -180; lon < 180; lon += 30) { let pen = false; for (let lat = -84; lat <= 84; lat += 4) pen = seg(lon * D2R, lat * D2R, pen); }
        for (let lat = -60; lat <= 60; lat += 30) { let pen = false; for (let lon = -180; lon <= 180; lon += 4) pen = seg(lon * D2R, lat * D2R, pen); }
        g.stroke();
      }

      // ── Indonesia dan tetangganya: geometri peta SITREP, dari bentuk bola ke bentuk peta ──
      const shapes = settled ? smooth(0.12, 0.7, pZ) : 0;
      if (shapes > 0.004) {
        const trace = (s: Shape): void => {
          g.beginPath();
          for (let r = 0; r < s.start.length - 1; r++) {
            let k = s.start[r];
            const e = s.start[r + 1];
            g.moveTo(cx + R * (s.xo[k] + a * (s.xm[k] - s.xo[k])), cy - R * (s.yo[k] + a * (s.ym[k] - s.yo[k])));
            for (k++; k < e; k++) g.lineTo(cx + R * (s.xo[k] + a * (s.xm[k] - s.xo[k])), cy - R * (s.yo[k] + a * (s.ym[k] - s.yo[k])));
            g.closePath();
          }
        };
        let set: { prov: Shape; ctx: Shape };
        if (pZ >= 1) set = full ??= { prov: buildShape(provPolys, 0), ctx: buildShape(ctxPolys, 0) };
        else {
          if (!thin || Math.abs(thin.rm - Rm) > Rm * 0.15) thin = { prov: buildShape(provPolys, MOVING_PX / Rm), ctx: buildShape(ctxPolys, MOVING_PX / Rm), rm: Rm };
          set = thin;
        }
        g.globalAlpha = shapes;
        g.fillStyle = css(CTX);
        trace(set.ctx); g.fill();
        g.fillStyle = css(LAND);
        trace(set.prov); g.fill();
        // batas provinsi setipis itu baru terlihat saat petanya sudah besar
        if (pZ > 0.7) {
          g.strokeStyle = css(SEA);
          g.lineWidth = 0.9;
          g.lineJoin = 'round';
          g.stroke();
        }
        g.globalAlpha = 1;
      }

      // ── Butiran daratan ──
      const dotsA = aIn * (1 - smooth(0.25, 0.8, pZ));
      if (dotsA > 0.004) {
        const size = 1.5 + 1.2 * pZ, half = size / 2;
        const { n, sp, cp, sl, cl, dl, my: dm } = dots;
        let nd = 0;
        g.fillStyle = css(GREEN, 0.92 * dotsA);
        for (let i = 0; i < n; i++) {
          const cd = cl[i] * cl0 + sl[i] * sl0;
          const z = sp0 * sp[i] + cp0 * cp[i] * cd;
          if (z <= 0.015) continue;
          let x = cp[i] * (sl[i] * cl0 - cl[i] * sl0);
          let y = cp0 * sp[i] - sp0 * cp[i] * cd;
          if (a > 0) { x += a * (dl[i] - x); y += a * (dm[i] - y); }
          const px = cx + R * x, py = cy - R * y;
          if (px < -2 || py < -2 || px > W + 2 || py > H + 2) continue;
          // dekat tepi bola butiran saling merapat: diredupkan supaya tepinya tidak menjadi garis putih
          if (z < 0.3) { dim[nd++] = px; dim[nd++] = py; } else g.fillRect(px - half, py - half, size, size);
        }
        // saat mendekat, butiran tepi yang merapat itu hanya menjadi coretan di pinggir layar: dilepas lebih dulu
        g.fillStyle = css(GREEN, 0.5 * dotsA * (1 - smooth(0.05, 0.4, pZ)));
        for (let i = 0; i < nd; i += 2) g.fillRect(dim[i] - half * 0.8, dim[i + 1] - half * 0.8, size * 0.8, size * 0.8);
      }

      // ── Di luar kotak peta, layar SITREP berisi panel, bukan peta: daratan di sana diredam menjelang akhir ──
      const veil = settled ? smooth(0.6, 1, pZ) : 0;
      if (veil > 0.004 && mr) {
        g.fillStyle = css(SEA, veil);
        g.fillRect(0, 0, W, boxT);
        g.fillRect(0, boxT + boxH, W, H - boxT - boxH);
        g.fillRect(0, boxT, boxL, boxH);
        g.fillRect(boxL + boxW, boxT, W - boxL - boxW, boxH);
      }
    };

    if (pZ < 1) world(ctx);
    else {
      // Gambar sudah berimpit dengan peta dan tidak bergerak lagi; yang masih hidup hanya tanda yang menyala.
      // Peta bergaris utuh (puluhan ribu titik) cukup digambar sekali ke kanvas simpanan, lalu ditempel tiap bingkai.
      const key = `${cw}x${ch}:${boxL},${boxT},${boxW},${boxH}:${mr ? 1 : 0}`;
      if (base?.key !== key) {
        const c = base?.canvas ?? document.createElement('canvas');
        c.width = cw; c.height = ch;
        const g = c.getContext('2d');
        if (g) { g.setTransform(dpr, 0, 0, dpr, 0, 0); world(g); base = { key, canvas: c }; } else base = null;
      }
      if (base) {
        ctx.globalAlpha = 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(base.canvas, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else world(ctx);
    }

    // ── Keterangan negara ──
    // Berurut menurut prioritas: yang kotaknya menimpa keterangan yang sudah mendapat tempat mengalah dan memudar.
    // Saat bola mendekat jarak antarnegara melebar, sehingga negara tetangga yang lebih kecil ikut mendapat tempat.
    const labelsA = smooth(LABELS_IN[0], LABELS_IN[1], t) * (1 - smooth(0.3, 0.75, pZ));
    let shown = 0;
    if (labelsA > 0.004) {
      const fontReady = document.fonts ? document.fonts.check(LABEL_FONT) && document.fonts.check(LABEL_FONT_HOME) : true;
      if (measured !== fontReady) {
        measured = fontReady;
        for (const L of labels) { ctx.font = L.home ? LABEL_FONT_HOME : LABEL_FONT; L.hw = ctx.measureText(L.name).width / 2; }
      }
      const up = dt / LABEL_FADE_MS, down = dt / (LABEL_FADE_MS * 0.7);
      let nt = 0, font = '';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = css(mix(BODY, SEA, flat), 0.92);
      const ink = css(INK2), inkHome = css(INK);
      const keepX = LABEL_GAP_X * LABEL_KEEP, keepY = LABEL_GAP_Y * LABEL_KEEP;
      for (let i = 0; i < labels.length; i++) {
        const L = labels[i];
        const d = L.lon - lon0, cd = Math.cos(d);
        const z = sp0 * L.sp + cp0 * L.cp * cd;
        L.front = z > LABEL_Z[0];
        let place = false;
        if (L.front) {
          let ux = L.cp * Math.sin(d), uy = cp0 * L.sp - sp0 * L.cp * cd;
          if (a > 0) { ux += a * (L.dl - ux); uy += a * (L.my - uy); }
          const x = (L.x = cx + R * ux), y = (L.y = cy - R * uy);
          place = (L.near ? pZ > 0 : R * L.span >= LABEL_MIN_PX) && x + L.hw > 0 && x - L.hw < W && y + L.hh > 0 && y - L.hh < H;
          // yang sudah mulai tampil baru mengalah bila hampir bersentuhan; yang belum, baru muncul bila ruangnya lega (tidak berkedip di ambang)
          const gx = L.a > 0 ? keepX : LABEL_GAP_X, gy = L.a > 0 ? keepY : LABEL_GAP_Y;
          for (let k = 0; place && k < nt; k += 4) {
            if (Math.abs(x - taken[k]) < L.hw + taken[k + 2] + gx && Math.abs(y - taken[k + 1]) < L.hh + taken[k + 3] + gy) place = false;
          }
          if (place) { taken[nt++] = x; taken[nt++] = y; taken[nt++] = L.hw; taken[nt++] = L.hh; }
        }
        if (!place) L.a = Math.max(0, L.a - down);
        else if (L.a < 1) {
          // yang baru mendapat tempat menunggu sampai keterangan berprioritas lebih rendah yang digesernya (yang kini hampir
          // bersentuhan dengannya, jadi pasti mengalah) selesai memudar: dua tulisan tidak pernah bertumpuk
          let wait = false;
          for (let j = i + 1; j < labels.length && !wait; j++) {
            const M = labels[j];
            wait = M.front && M.a > 0.25 && Math.abs(L.x - M.x) < L.hw + M.hw + keepX && Math.abs(L.y - M.y) < L.hh + M.hh + keepY;
          }
          if (!wait) L.a = Math.min(1, L.a + up);
        }
        if (!L.front) continue;
        const alpha = L.a * labelsA * smooth(LABEL_Z[0], LABEL_Z[1], z);
        if (alpha < 0.02) continue;
        if (alpha > 0.5) shown++;
        const f = L.home ? LABEL_FONT_HOME : LABEL_FONT;
        if (f !== font) { font = f; ctx.font = f; }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = L.home ? inkHome : ink;
        const line = L.y + (L.home ? 4.6 : 4.1);
        ctx.strokeText(L.name, L.x, line);
        ctx.fillText(L.name, L.x, line);
      }
      ctx.globalAlpha = 1;
    }
    // untuk pemeriksaan: berapa keterangan negara yang sedang terbaca
    if (shown !== shownLabels) { shownLabels = shown; canvas.dataset.negara = String(shown); }

    // ── Tanda: hanya yang sudah digambar peta SITREP, yaitu data yang sudah tiba ──
    if (marks.length) {
      const k = Math.max(0.4, Math.min(1, R / Rm));
      const colorOf = (m: Mark): Rgb => (m.kind === 'quake' ? C_QUAKE : m.kind === 'warn' ? C_WARN : m.kind === 'cam' ? INK2 : m.incident ? C_INCIDENT : C_OTHER);
      const live: { m: Mark; x: number; y: number; u: number }[] = [];
      for (const m of marks) {
        const u = (t - m.born) / POP_MS;
        if (u <= 0) continue;
        const d = m.lon - lon0, cp = Math.cos(m.lat), sp = Math.sin(m.lat), cd = Math.cos(d);
        if (sp0 * sp + cp0 * cp * cd <= 0) continue;
        let x = cp * Math.sin(d), y = cp0 * sp - sp0 * cp * cd;
        if (a > 0) { x += a * (wrap(m.lon - LON_C) - x); y += a * (mercY(m.lat) - y); }
        live.push({ m, x: cx + R * x, y: cy - R * y, u });
      }
      ctx.lineJoin = 'round';
      for (const { m, x, y } of live) {
        const v = (t - m.born) / PING_MS;
        if (v >= 1) continue;
        ctx.strokeStyle = css(colorOf(m), 0.55 * (1 - v) * m.opacity);
        ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.arc(x, y, (Math.max(m.r, m.hh) + 3 + 15 * v) * k, 0, TAU); ctx.stroke();
      }
      // urutan baca = urutan gambar di peta: gempa, peringatan, kamera, lalu titik laporan
      for (const { m, x, y, u } of live) {
        const s = k * popOut(Math.min(1, u));
        const r = m.r * s;
        ctx.globalAlpha = m.opacity;
        if (m.kind === 'quake') {
          ctx.fillStyle = css(C_QUAKE, 0.14); ctx.strokeStyle = css(C_QUAKE); ctx.lineWidth = 1.75;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = css(C_QUAKE);
          ctx.beginPath(); ctx.arc(x, y, 1.7 * s, 0, TAU); ctx.fill();
        } else if (m.kind === 'warn') {
          ctx.fillStyle = css(mix(SEA, C_WARN, 0.18)); ctx.strokeStyle = css(C_WARN); ctx.lineWidth = 1.75;
          ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.866, y + r * 0.5); ctx.lineTo(x - r * 0.866, y + r * 0.5); ctx.closePath();
          ctx.fill(); ctx.stroke();
        } else if (m.kind === 'cam') {
          const hh = m.hh * s;
          ctx.fillStyle = css(SEA); ctx.strokeStyle = css(INK2); ctx.lineWidth = m.text ? 1.5 : 1.75;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x - r, y - hh, r * 2, hh * 2, (m.text ? 3 : 1.5) * s); else ctx.rect(x - r, y - hh, r * 2, hh * 2);
          ctx.fill(); ctx.stroke();
          if (m.text) {
            ctx.fillStyle = css(INK);
            ctx.font = `500 ${10.5 * s}px 'IBM Plex Mono', ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(m.text, x, y + 3.7 * s);
          }
        } else {
          ctx.fillStyle = css(m.incident ? C_INCIDENT : C_OTHER); ctx.strokeStyle = css(SEA); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // untuk pemeriksaan: 1 = gambar sudah berimpit dengan peta
    const shape = a.toFixed(2);
    if (canvas.dataset.bentuk !== shape) canvas.dataset.bentuk = shape;

    return end;
  }

  return { draw };
}

export default function GlobeIntro(props: GlobeIntroProps) {
  const stage = useIntroStage();
  const phase = useIntroPhase();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [hudOut, setHudOut] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) { finishIntro(); return; }
    const scene = makeScene(canvas, ctx, stage);
    let raf = 0, prev = -1, t = 0, claimed = false, hud = false;
    const tick = (now: number) => {
      // dilewati atau sudah selesai: bingkai terakhir dibiarkan selagi tirai memudar
      if (phaseRef.current === 'leaving' || phaseRef.current === 'off') return;
      if (prev >= 0) t += Math.max(0, Math.min(MAX_STEP_MS, now - prev));
      prev = now;
      const end = scene.draw(t, live.current);
      if (!claimed) { claimed = true; claimIntro(); }
      if (!hud && t >= HUD_OUT_AT) { hud = true; setHudOut(true); }
      if (t >= end) { finishIntro(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  if (!stage) return null;

  const { phase: load, data, cctvPhase, counts, span } = props;
  const pending = <span className="intro-wait">memuat…</span>;
  const down = <span className="intro-down">tidak terjangkau</span>;
  const core = (ok: boolean | undefined, text: string) => (ok ? text : load === 'loading' ? pending : down);
  const ws = data?.sources.warnings.state;

  return createPortal(
    <>
      <canvas ref={canvasRef} />
      <dl className={`intro-status${hudOut ? ' is-out' : ''}`} aria-hidden="true">
        <div><dt>Sesi</dt><dd>{user ?? '–'}</dd></div>
        <div><dt>Berita</dt><dd>{core(data?.sources.news.ok, `${counts.news} dalam ${span}`)}</dd></div>
        <div><dt>Gempa M ≥ 5</dt><dd>{core(data?.sources.quakes.ok, `${counts.quakes} dalam ${span}, BMKG`)}</dd></div>
        <div>
          <dt>Peringatan cuaca</dt>
          <dd>
            {ws === 'ok' ? `${counts.warnings} berlaku`
              : ws === 'missing' ? <span className="intro-down">belum aktif di server</span>
              : ws === 'error' ? down
              : load === 'error' ? down : pending}
          </dd>
        </div>
        <div><dt>CCTV</dt><dd>{cctvPhase === 'ready' ? `${counts.cams} kamera` : cctvPhase === 'error' ? down : pending}</dd></div>
      </dl>
    </>,
    stage,
  );
}
