// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · katalog dan gambar CCTV publik
//
// Memakai endpoint yang sama dengan panel CCTV di C4ISR:
//   GET  /api/v2/vision/cctv-list    daftar kamera: portal ATCS Dishub Kab. Tangerang, dan dengan
//                                    ?extra=1 juga kamera dari backend/cctv_tambahan.json (mis. DKI)
//   POST /api/v2/vision/cctv-detect  satu frame terbaru dari stream kamera. Dengan detect:false server
//                                    hanya mengirim gambarnya (jalur cepat, tanpa YOLO)
//   POST /api/v2/vision/detect       objek pada gambar yang sudah tampil (jenis + kotaknya), bila YOLO terpasang
// Kecepatan memuat gambar didahulukan: deteksi objek hanya dijalankan bila dinyalakan dari popup kamera,
// sesudah gambarnya tampil, dan kotak penandanya digambar di atas gambar oleh browser.
// Frame diambil oleh server; browser tidak pernah menghubungi stream langsung
// (CSP: connect-src 'self'). Yang tampil adalah gambar diam, bukan video.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiPost } from '@/api/client';

export interface Camera {
  id: string;
  name: string;
  /** Kecamatan/kawasan menurut portal sumber. */
  area: string;
  /** Pengelola/portal, mis. "ATCS Dishub Kabupaten Tangerang". */
  source: string;
  lon: number | null;
  lat: number | null;
  /** Posisi hanya perkiraan (portal tidak memberi koordinat kamera). */
  approx: boolean;
  /** Alamat stream yang gambarnya bisa diambil server; null = hanya ada halaman portal. */
  streamUrl: string | null;
  /** Halaman kamera di portal sumber, bila ada. */
  pageUrl: string | null;
}

export interface Frame {
  /** Nomor urut pengambilan: tetap sama walau hasil deteksi ditempelkan atau dilepas dari gambar ini. */
  id: number;
  /** data:image/jpeg;base64,… */
  src: string;
  w: number;
  h: number;
  /** Kapan gambar diterima dari server (epoch ms). */
  at: number;
  /** Hitungan objek per jenis, terbanyak dulu; null bila deteksi belum/tidak dijalankan untuk gambar ini. */
  counts: [string, number][] | null;
  /** Kotak penanda objek dalam piksel gambar, untuk digambar di atasnya; null bila tidak ada. */
  boxes: Box[] | null;
  /** Server versi lama: deteksi selalu dijalankan dan kotaknya sudah digambar langsung ke dalam gambar. */
  annotated: boolean;
}

export interface Box {
  /** Nama kelas YOLO: "car", "motorcycle", … */
  label: string;
  /** Keyakinan 0–1. */
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RawCam {
  id?: string; name?: string; location?: string; source?: string; stream_url?: string; page_url?: string;
  lat?: number | null; lon?: number | null; coord_approx?: boolean;
}
interface RawCatalog { ok?: boolean; error?: string; portal?: string; portal_error?: string; cams?: RawCam[] }
interface RawDetect {
  ok?: boolean; error?: string; available?: boolean; frame_wh?: [number, number];
  summary?: Record<string, number>; frame_b64?: string;
  /** Server mengirim gambar tanpa menjalankan deteksi objek (hitungan bisa disusulkan). */
  detect_skipped?: boolean;
}
interface RawObjects {
  ok?: boolean; available?: boolean;
  detections?: { label?: string; confidence?: number; bbox?: unknown }[];
}
const MAX_BOXES = 300;

const CATALOG_TIMEOUT_MS = 25_000;
/** Server menunggu stream sampai ±12 detik bila jalur cepatnya tidak bisa dipakai. */
const FRAME_TIMEOUT_MS = 45_000;
/** Deteksi objek pertama sejak server menyala ikut memuat modelnya. */
const COUNT_TIMEOUT_MS = 60_000;
/** Mode pantau: gambar dimuat ulang tiap 5 detik selama 30 detik, lalu berhenti sendiri. */
export const WATCH_REFRESH_MS = 5_000;
export const WATCH_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('Server tidak menjawab tepat waktu.')), ms);
    p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

const httpUrl = (v: unknown): string | null => (typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
/** Stream boleh HLS lewat http(s) atau RTSP: yang membukanya server, bukan browser. */
const streamUrlOf = (v: unknown): string | null => (typeof v === 'string' && /^(https?|rtsp):\/\//i.test(v.trim()) ? v.trim() : null);
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const coord = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max ? v : null);

export function normalizeCameras(raw: RawCam[], portal: string): Camera[] {
  const out: Camera[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const name = text(c.name);
    const streamUrl = streamUrlOf(c.stream_url);
    const pageUrl = httpUrl(c.page_url);
    if (!name || (!streamUrl && !pageUrl)) continue;
    const id = text(c.id) || streamUrl || pageUrl || name;
    if (seen.has(id)) continue;
    seen.add(id);
    const lon = coord(c.lon, 180);
    const lat = coord(c.lat, 90);
    out.push({
      id, name,
      area: text(c.location),
      source: text(c.source) || portal || 'Sumber tidak disebut',
      lon: lon !== null && lat !== null ? lon : null,
      lat: lon !== null && lat !== null ? lat : null,
      approx: c.coord_approx !== false,
      streamUrl, pageUrl,
    });
  }
  return out;
}

const describe = (e: unknown): string =>
  e instanceof TypeError ? 'Server tidak menjawab.' : e instanceof Error && e.message ? e.message : 'Kesalahan tidak dikenal.';

export type CctvPhase = 'loading' | 'ready' | 'error';

/** Katalog kamera. Dimuat sekali; kegagalan memuat ulang tidak menghapus daftar yang sudah ada. */
export function useCctv() {
  const [cams, setCams] = useState<Camera[]>([]);
  const [phase, setPhase] = useState<CctvPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  /** Portal utama gagal tetapi kamera tambahan tetap ada: nama portal yang tidak menjawab. */
  const [missing, setMissing] = useState<string | null>(null);
  const inflight = useRef(false);

  const reload = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setPhase(p => (p === 'ready' ? p : 'loading'));
    try {
      const { data } = await withTimeout(apiFetch<RawCatalog>('/api/v2/vision/cctv-list?extra=1'), CATALOG_TIMEOUT_MS);
      if (!data || data.ok === false || !Array.isArray(data.cams)) throw new Error(text(data?.error) || 'Server tidak mengirim daftar kamera.');
      setCams(normalizeCameras(data.cams, text(data.portal)));
      setMissing(data.portal_error ? text(data.portal) || 'Portal utama' : null);
      setError(null);
      setPhase('ready');
    } catch (e) {
      setError(describe(e));
      setPhase('error');
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { cams, phase, error, missing, reload };
}

let frameSeq = 0;

const countsOf = (summary: Record<string, number>): [string, number][] =>
  Object.entries(summary).filter(([, n]) => Number(n) > 0).sort((a, b) => b[1] - a[1]);

/**
 * Gambar terkini satu kamera. detect:false → server yang sudah diperbarui mengirim gambarnya saja (jalur cepat,
 * tanpa YOLO). Server yang belum diperbarui mengabaikannya: deteksinya ikut dan kotaknya sudah tergambar.
 */
async function fetchFrame(cam: Camera): Promise<Frame> {
  const { data } = await withTimeout(
    apiPost<RawDetect>('/api/v2/vision/cctv-detect', { stream_url: cam.streamUrl, detect: false }), FRAME_TIMEOUT_MS,
  );
  const src = typeof data?.frame_b64 === 'string' && data.frame_b64.startsWith('data:image/') ? data.frame_b64 : null;
  if (!data || data.ok === false || !src) throw new Error(text(data?.error) || 'Server tidak mengirim gambar.');
  const [w, h] = Array.isArray(data.frame_wh) ? data.frame_wh : [0, 0];
  const annotated = data.available === true && data.detect_skipped !== true;
  return {
    id: ++frameSeq,
    src, w: Number(w) > 0 ? Number(w) : 16, h: Number(h) > 0 ? Number(h) : 9, at: Date.now(),
    counts: annotated ? countsOf(data.summary ?? {}) : null,
    boxes: null,
    annotated,
  };
}

type Detected = { counts: [string, number][]; boxes: Box[] } | 'unavailable' | 'failed';

/** Objek pada gambar yang sudah tampil. */
async function detectObjects(src: string): Promise<Detected> {
  try {
    const { data } = await withTimeout(apiPost<RawObjects>('/api/v2/vision/detect', { image_b64: src }), COUNT_TIMEOUT_MS);
    if (!data || data.ok === false) return 'failed';
    if (!data.available || !Array.isArray(data.detections)) return 'unavailable';
    const summary: Record<string, number> = {};
    const boxes: Box[] = [];
    for (const d of data.detections) {
      const label = text(d?.label);
      if (!label) continue;
      summary[label] = (summary[label] ?? 0) + 1;
      const bb = Array.isArray(d.bbox) && d.bbox.length === 4 ? d.bbox.map(Number) : null;
      if (!bb || !bb.every(Number.isFinite) || boxes.length >= MAX_BOXES) continue;
      const [x1, y1, x2, y2] = bb;
      const conf = Number(d.confidence);
      boxes.push({
        label, conf: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0,
        x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      });
    }
    return { counts: countsOf(summary), boxes };
  } catch {
    return 'failed';
  }
}

/** off = tidak diminta; done = hasilnya menempel di gambar; unavailable = YOLO tidak terpasang di server. */
export type DetectStatus = 'off' | 'running' | 'done' | 'unavailable' | 'failed';

export interface FrameState {
  frame: Frame | null;
  loading: boolean;
  /** Pesan kegagalan terakhir; gambar lama (bila ada) tetap ditampilkan. */
  error: string | null;
  /** Keadaan deteksi objek untuk gambar yang sedang tampil. */
  detect: DetectStatus;
}

const IDLE: FrameState = { frame: null, loading: false, error: null, detect: 'off' };

/**
 * Gambar terkini untuk satu kamera. Ganti kamera → gambar lama dibuang dan yang baru diambil.
 * `watch` memuat ulang berkala selama tab browser terlihat. `detect` menjalankan deteksi objek untuk tiap
 * gambar SESUDAH gambarnya tampil; mati secara bawaan supaya memuat gambar tidak pernah menunggu apa pun.
 */
export function useCameraFrame(cam: Camera | null, opts: { watch: boolean; detect: boolean }) {
  const { watch, detect } = opts;
  const [state, setState] = useState<FrameState>(IDLE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const camRef = useRef(cam);
  camRef.current = cam;
  const detectRef = useRef(detect);
  detectRef.current = detect;
  const seq = useRef(0);
  const busy = useRef(false);
  /** Gambar yang sedang tampil, diperbarui saat itu juga (state baru terbaca sesudah render berikutnya). */
  const shown = useRef<Frame | null>(null);
  const detecting = useRef(false);
  /** Server sudah menjawab bahwa YOLO tidak terpasang: tidak ditanya lagi untuk tiap gambar berikutnya. */
  const noDetector = useRef(false);

  // Satu permintaan deteksi pada satu waktu. Bila gambar sudah berganti saat jawabannya datang (mode pantau di
  // server yang lambat), jawaban itu dibuang dan deteksi dijalankan untuk gambar yang sedang tampil: permintaan
  // tidak menumpuk di server, dan kotak tidak pernah menempel di gambar yang salah.
  const runDetect = useCallback((frame: Frame) => {
    const mark = (detect: DetectStatus) => setState(s => (s.frame?.id === frame.id ? { ...s, detect } : s));
    if (noDetector.current) { mark('unavailable'); return; }
    mark('running');
    if (detecting.current) return;
    detecting.current = true;
    void detectObjects(frame.src).then(found => {
      detecting.current = false;
      const cur = shown.current;
      if (!detectRef.current || !cur) return;
      if (cur.id !== frame.id) {
        if (!cur.annotated) runDetect(cur);
        return;
      }
      if (found === 'unavailable') noDetector.current = true;
      setState(s => {
        if (s.frame?.id !== frame.id) return s;
        return typeof found === 'string' ? { ...s, detect: found } : { ...s, frame: { ...s.frame, ...found }, detect: 'done' };
      });
    });
  }, []);

  const refresh = useCallback(async () => {
    const c = camRef.current;
    if (!c || !c.streamUrl || busy.current) return;
    busy.current = true;
    const mine = seq.current;
    setState(s => ({ ...s, loading: true }));
    try {
      const frame = await fetchFrame(c);
      if (seq.current === mine) {
        shown.current = frame;
        setState({ frame, loading: false, error: null, detect: frame.annotated ? 'done' : 'off' });
        if (detectRef.current && !frame.annotated) runDetect(frame);
      }
    } catch (e) {
      if (seq.current === mine) setState(s => ({ ...s, loading: false, error: describe(e) }));
    } finally {
      if (seq.current === mine) busy.current = false;
    }
  }, [runDetect]);

  const camId = cam?.id ?? null;
  const canGrab = !!cam?.streamUrl;
  useEffect(() => {
    // jawaban untuk kamera sebelumnya (kalau masih di jalan) diabaikan
    seq.current++;
    busy.current = false;
    shown.current = null;
    setState(IDLE);
    if (canGrab) void refresh();
  }, [camId, canGrab, refresh]);

  // Deteksi dinyalakan saat gambar sudah tampil → jalankan untuk gambar itu. Dimatikan → kotak dan hitungannya dilepas.
  useEffect(() => {
    // dinyalakan lagi nanti = server ditanya lagi (YOLO bisa saja sudah dipasang sementara itu)
    if (!detect) noDetector.current = false;
    const s = stateRef.current;
    if (!s.frame || s.frame.annotated) return;
    if (detect) {
      if (s.detect === 'off') runDetect(s.frame);
    } else if (s.detect !== 'off') {
      setState(cur => (cur.frame && !cur.frame.annotated ? { ...cur, frame: { ...cur.frame, counts: null, boxes: null }, detect: 'off' } : cur));
    }
  }, [detect, runDetect]);

  useEffect(() => {
    if (!watch || !canGrab) return;
    const id = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, WATCH_REFRESH_MS);
    return () => clearInterval(id);
  }, [watch, camId, canGrab, refresh]);

  return { ...state, refresh };
}
