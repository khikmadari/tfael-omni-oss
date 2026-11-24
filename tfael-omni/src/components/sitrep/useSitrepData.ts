// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · pengambilan data
//
// Tiga sumber diambil terpisah supaya kegagalan satu sumber tidak menjatuhkan
// yang lain, dan statusnya bisa dilaporkan apa adanya. Bila server tidak
// menjawab, layar menampilkan galat — tidak ada data pengganti buatan.
//
// Feed RSS di backend sering gagal bergantian (satu putaran Antara masuk, putaran
// berikutnya tidak). Laporan yang sudah diterima selama halaman terbuka karena
// itu dipertahankan dan digabung dengan hasil terbaru, supaya titik di peta tidak
// hilang-timbul tiap dua menit. Yang dipertahankan tetap laporan nyata yang sama.
//
// Peringatan dini cuaca BMKG tidak digabung: daftar terakhir yang berhasil diambil
// menggantikan yang lama, dan yang masa berlakunya habis disaring saat ditampilkan.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch } from '@/api/client';
import { GAZETTEER, PROV_ANCHORS, PROVINCE_AT } from './geo-data.ts';
import { normalizeWarnings, type RawWarning, type Warning } from './peringatan.ts';
import { normalizeNews, normalizeQuakes, type Quake, type RawNews, type RawQuake, type Report } from './reports.ts';

/** Sama dengan TTL cache backend (engine_sitrep.CACHE_TTL). */
export const REFRESH_MS = 120_000;
const TIMEOUT_MS = 25_000;
/** Server membaca feed BMKG lalu rincian tiap peringatan; putaran pertama bisa lebih dari 20 detik. */
const WARN_TIMEOUT_MS = 35_000;

export interface SourceState {
  /** Permintaan terakhir berhasil. */
  ok: boolean;
  /** Jumlah entri simulasi yang dikirim backend dan disingkirkan. */
  simulated: number;
  /** Kapan data sumber ini terakhir berhasil diambil (epoch ms); 0 = belum pernah. */
  at: number;
}

export interface WarningSource {
  /**
   * pending = belum ada jawaban; missing = server yang sedang berjalan belum mengenal endpoint ini
   * (kode backend sudah baru, prosesnya belum dijalankan ulang); error = BMKG atau server tidak menjawab.
   */
  state: 'pending' | 'ok' | 'missing' | 'error';
  /** Alasan saat state = 'error', sudah berupa kalimat. */
  error: string | null;
  /** Kapan terakhir berhasil diambil (epoch ms); 0 = belum pernah. */
  at: number;
}

export interface SitrepData {
  news: Report[];
  quakes: Quake[];
  /** Dari pengambilan terakhir yang berhasil. Saring lagi dengan `end > now` saat menampilkan. */
  warnings: Warning[];
  sources: { news: SourceState; quakes: SourceState; warnings: WarningSource };
  /** Waktu pengambilan terakhir yang berhasil untuk setidaknya satu sumber. */
  fetchedAt: number;
}

export type Phase = 'loading' | 'ready' | 'error';

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
  });
}

async function getList<T>(url: string, key: string): Promise<T[]> {
  const { data } = await withTimeout(apiFetch<Record<string, unknown>>(url));
  const list = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : null;
  if (!Array.isArray(list)) throw new Error('bentuk respons tidak dikenal');
  return list as T[];
}

type WarnResult = { state: 'ok'; raw: RawWarning[] } | { state: 'missing' } | { state: 'error'; error: string };

async function getWarnings(): Promise<WarnResult> {
  try {
    const { data } = await withTimeout(
      apiFetch<{ ok?: boolean; error?: string; warnings?: RawWarning[] }>('/api/v2/sitrep/peringatan'), WARN_TIMEOUT_MS,
    );
    if (!data || typeof data !== 'object') return { state: 'error', error: 'Jawaban server untuk peringatan cuaca tidak dikenali.' };
    if (data.ok === false || !Array.isArray(data.warnings)) {
      // server menjawab, tetapi BMKG tidak terjangkau (atau mode air-gap): alasannya dari server
      const reason = typeof data.error === 'string' ? data.error.replace(/\s+/g, ' ').trim() : '';
      return { state: 'error', error: reason || 'Peringatan dini cuaca BMKG tidak bisa diambil.' };
    }
    return { state: 'ok', raw: data.warnings };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { state: 'missing' };
    return { state: 'error', error: 'Server tidak menjawab permintaan peringatan cuaca.' };
  }
}

const EMPTY: SourceState = { ok: false, simulated: 0, at: 0 };
const PENDING: WarningSource = { state: 'pending', error: null, at: 0 };

const MAX_NEWS = 300;
const MAX_QUAKES = 60;

/** Hasil terbaru menang; entri lama yang tidak ikut terkirim lagi tetap disimpan. Terbaru dulu, dibatasi `max`. */
function merge<T extends { id: string; time: number | null }>(prev: T[], fresh: T[], max: number): T[] {
  const ids = new Set(fresh.map(x => x.id));
  const all = [...fresh, ...prev.filter(x => !ids.has(x.id))];
  all.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  return all.slice(0, max);
}

export function useSitrepData() {
  const [data, setData] = useState<SitrepData | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const inflight = useRef(false);
  const lastTry = useRef(0);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    lastTry.current = Date.now();
    setRefreshing(true);

    // Peringatan cuaca berjalan berdampingan dan tidak menahan berita/gempa.
    const warnTask = getWarnings();

    const [n, q] = await Promise.allSettled([
      getList<RawNews>('/api/v2/sitrep/news', 'news'),
      getList<RawQuake>('/api/v2/sitrep/gempa', 'gempa'),
    ]);
    const now = Date.now();
    const coreOk = n.status === 'fulfilled' || q.status === 'fulfilled';
    setData(prev => {
      if (!coreOk && !prev) return null;
      const news = n.status === 'fulfilled' ? normalizeNews(n.value, GAZETTEER, now) : null;
      const quakes = q.status === 'fulfilled' ? normalizeQuakes(q.value, GAZETTEER, now, PROV_ANCHORS) : null;
      const src = (fresh: { simulated: number } | null, old: SourceState | undefined): SourceState =>
        fresh ? { ok: true, simulated: fresh.simulated, at: now } : { ...(old ?? EMPTY), ok: false };
      return {
        // sumber yang gagal mempertahankan data terakhirnya (ditandai lewat sources.*.ok)
        news: news ? merge(prev?.news ?? [], news.items, MAX_NEWS) : prev?.news ?? [],
        quakes: quakes ? merge(prev?.quakes ?? [], quakes.items, MAX_QUAKES) : prev?.quakes ?? [],
        warnings: prev?.warnings ?? [],
        sources: {
          news: src(news, prev?.sources.news),
          quakes: src(quakes, prev?.sources.quakes),
          warnings: prev?.sources.warnings ?? PENDING,
        },
        fetchedAt: coreOk ? now : prev?.fetchedAt ?? 0,
      };
    });
    if (coreOk) setPhase('ready');

    let w = await warnTask;
    const warnAt = Date.now();
    let list: Warning[] | null = null;
    if (w.state === 'ok') {
      try {
        list = normalizeWarnings(w.raw, warnAt, PROV_ANCHORS, PROVINCE_AT);
      } catch {
        w = { state: 'error', error: 'Data peringatan cuaca dari server tidak terbaca.' };
      }
    }
    const ws = w;
    setData(prev => {
      if (!prev && !list) return null;
      const base: SitrepData = prev ?? {
        news: [], quakes: [], warnings: [],
        sources: { news: EMPTY, quakes: EMPTY, warnings: PENDING },
        fetchedAt: 0,
      };
      return {
        ...base,
        // gagal mengambil: peringatan terakhir dipertahankan sampai masa berlakunya habis
        warnings: list ?? base.warnings,
        sources: {
          ...base.sources,
          warnings: ws.state === 'ok'
            ? { state: 'ok', error: null, at: warnAt }
            : { state: ws.state, error: ws.state === 'error' ? ws.error : null, at: base.sources.warnings.at },
        },
        fetchedAt: list ? warnAt : base.fetchedAt,
      };
    });
    const anyOk = coreOk || list !== null;
    setPhase(p => (anyOk ? 'ready' : p === 'ready' ? 'ready' : 'error'));
    setRefreshing(false);
    inflight.current = false;
  }, []);

  useEffect(() => {
    void refresh();
    // tab tersembunyi tidak ikut menarik data; saat kembali terlihat, susul bila sudah waktunya
    const id = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastTry.current > REFRESH_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh]);

  return { data, phase, refreshing, refresh };
}
