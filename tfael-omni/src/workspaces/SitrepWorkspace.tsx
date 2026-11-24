// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP Workspace · peta sebaran laporan Indonesia
//
// Semua yang tampil berasal dari data nyata backend:
//   /api/v2/sitrep/news        berita RSS (Antara, Detik, Kompas, Tempo, CNN Indonesia, Tribun, Metro TV)
//   /api/v2/sitrep/gempa       gempa M ≥ 5 terkini BMKG
//   /api/v2/sitrep/peringatan  peringatan dini cuaca BMKG yang sedang berlaku (data terbuka BMKG)
//   /api/v2/vision/cctv-*      kamera CCTV publik (katalog yang sama dengan C4ISR)
// Jenis dan lokasi laporan dibaca dari teks berita (components/sitrep/classify.ts,
// geo-names.ts). Tidak ada data contoh: sumber yang gagal ditampilkan sebagai gagal.
// ═══════════════════════════════════════════════════════════════════════

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { finishIntro, useIntroPhase } from '@/components/intro/introStore';
import type { CctvPopupProps } from '@/components/sitrep/CctvPopup.tsx';
import { CATEGORY_LABEL, type Category } from '@/components/sitrep/classify.ts';
import { fmtClock, fmtClockSec, fmtWhen } from '@/components/sitrep/format.ts';
import { provName, type ProvCode } from '@/components/sitrep/geo-names.ts';
import { KameraPanel } from '@/components/sitrep/KameraPanel.tsx';
import { warnedAreas } from '@/components/sitrep/peringatan.ts';
import { PeringatanPanel } from '@/components/sitrep/PeringatanPanel.tsx';
import { ReportList } from '@/components/sitrep/ReportList.tsx';
import { inWindow, itemProv, provinceStats, type Item, type TimeWindow } from '@/components/sitrep/reports.ts';
import { SebaranMap, type CamPreview, type MapHover } from '@/components/sitrep/SebaranMap.tsx';
import { SummaryStrip } from '@/components/sitrep/SummaryStrip.tsx';
import { useCameraFrame, useCctv, WATCH_MS } from '@/components/sitrep/useCctv.ts';
import { useSitrepData } from '@/components/sitrep/useSitrepData.ts';
import '@/components/sitrep/sitrep.css';

// Popup kamera baru dibutuhkan saat sebuah kamera dipilih: dimuat terpisah supaya halaman awal tetap ringan.
// Bila berkasnya tidak bisa diambil (aplikasi dibangun ulang selagi halaman ini terbuka, atau server mati),
// yang tampil adalah pesan dengan tombol muat ulang, bukan halaman kosong.
const CctvPopup = lazy<ComponentType<CctvPopupProps>>(() =>
  import('@/components/sitrep/CctvPopup.tsx').catch(() => ({ default: PopupUnavailable })));

// Bola dunia animasi pembuka: hanya dimuat tepat setelah login. Gagal dimuat = tirai langsung membuka.
const GlobeIntro = lazy(() => import('@/components/sitrep/GlobeIntro.tsx').catch(() => ({ default: IntroUnavailable })));

function IntroUnavailable() {
  useEffect(finishIntro, []);
  return null;
}

function PopupUnavailable({ cam, onClose }: CctvPopupProps) {
  return (
    <section className="sr-pop" aria-label={`CCTV ${cam.name}`}>
      <div className="sr-pop-fail" role="alert">
        <p><strong>Tampilan kamera tidak bisa dimuat.</strong> Muat ulang halaman ini, lalu pilih kameranya lagi.</p>
        <div>
          <button type="button" className="sr-btn" onClick={() => window.location.reload()}>Muat ulang halaman</button>
          <button type="button" className="sr-btn" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </section>
  );
}

const WINDOWS: { id: TimeWindow; label: string; long: string }[] = [
  { id: '24h', label: '24 jam', long: '24 jam terakhir' },
  { id: '7d', label: '7 hari', long: '7 hari terakhir' },
  { id: 'all', label: 'Semua', long: 'semua data yang tersedia' },
];

type LayerId = 'insiden' | 'gempa' | 'lain' | 'peringatan' | 'cctv';
type PanelId = 'laporan' | 'peringatan' | 'cctv';
const ALL_LAYERS: Record<LayerId, boolean> = { insiden: true, gempa: true, lain: true, peringatan: true, cctv: true };
const NO_HOVER: MapHover = { prov: null, id: null, cam: null };

export default function SitrepWorkspace() {
  const { data, phase, refreshing, refresh } = useSitrepData();
  const cctv = useCctv();
  const intro = useIntroPhase() !== 'off';

  const [now, setNow] = useState(() => Date.now());
  const [win, setWin] = useState<TimeWindow>('7d');
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(ALL_LAYERS);
  const [cat, setCat] = useState<Category | null>(null);
  const [prov, setProv] = useState<ProvCode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapHover, setMapHover] = useState(NO_HOVER);
  const [listHover, setListHover] = useState(NO_HOVER);

  // ── Panel kanan punya tiga tab: laporan, peringatan cuaca, daftar CCTV ──
  const [panel, setPanel] = useState<PanelId>('laporan');
  const showPanel = useCallback((id: PanelId) => setPanel(id), []);

  // ── Kamera terpilih: gambarnya terbuka di popup di atas peta, dengan kartu pratinjau pada penandanya ──
  const [camId, setCamId] = useState<string | null>(null);
  /** Deteksi objek: mati secara bawaan supaya gambar dimuat secepat mungkin. */
  const [detect, setDetect] = useState(false);
  /** Mode pantau: kapan berakhir (epoch ms), atau null. */
  const [watchEnd, setWatchEnd] = useState<number | null>(null);
  const [watchNow, setWatchNow] = useState(0);
  const [centerCam, setCenterCam] = useState(0);
  /** Kamera terakhir dipilih dengan papan ketik (Enter pada baris daftar): fokus dipindahkan ke popupnya. */
  const [camByKeyboard, setCamByKeyboard] = useState(false);
  const cam = useMemo(() => cctv.cams.find(c => c.id === camId) ?? null, [cctv.cams, camId]);
  const frame = useCameraFrame(cam, { watch: watchEnd !== null, detect });
  const mapCams = useMemo(
    () => (layers.cctv ? cctv.cams.filter(c => c.lon !== null && c.lat !== null) : []),
    [cctv.cams, layers.cctv],
  );
  const selectCam = useCallback((id: string | null, viaKeyboard = false) => {
    // klik ulang penanda kamera yang sudah terbuka tidak mengubah apa pun (mode pantau tetap berjalan)
    if (id === camId) return;
    setCamId(id);
    setCamByKeyboard(viaKeyboard);
    setWatchEnd(null);
  }, [camId]);
  // mode pantau berhenti sendiri setelah 30 detik
  useEffect(() => {
    if (watchEnd === null) return;
    setWatchNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      if (t >= watchEnd) setWatchEnd(null); else setWatchNow(t);
    }, 1000);
    return () => clearInterval(id);
  }, [watchEnd]);
  const watchLeft = watchEnd === null ? null : Math.min(WATCH_MS / 1000, Math.max(1, Math.ceil((watchEnd - watchNow) / 1000)));
  const camPreview = useMemo<CamPreview | null>(() => {
    if (!cam) return null;
    const f = frame.frame;
    return {
      name: cam.name,
      src: f ? f.src : null,
      badge: f ? fmtClockSec(f.at) : frame.error ? 'Gagal' : 'Memuat',
      tone: !f || frame.error ? 'idle' : watchEnd !== null ? 'watch' : 'ok',
      hasStream: !!cam.streamUrl,
    };
  }, [cam, frame.frame, frame.error, watchEnd]);

  // jam untuk "x menit lalu" dan batas rentang waktu
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (data) setNow(Date.now()); }, [data]);

  // ── Data dalam rentang waktu ──
  const scoped = useMemo(() => {
    const news = (data?.news ?? []).filter(r => inWindow(r, win, now));
    const quakes = (data?.quakes ?? []).filter(q => inWindow(q, win, now));
    return { news, quakes, incidents: news.filter(r => r.incident), others: news.filter(r => !r.incident) };
  }, [data, win, now]);

  const catCounts = useMemo(() => {
    const c = { bencana: 0, kebakaran: 0, kecelakaan: 0, keamanan: 0, unras: 0, lain: 0 } as Record<Category, number>;
    for (const r of scoped.incidents) c[r.cat]++;
    return c;
  }, [scoped]);

  // ── Yang lolos lapisan + jenis: dipakai peta, peringkat provinsi, dan daftar ──
  const visible = useMemo(() => {
    const incidents = layers.insiden ? scoped.incidents.filter(r => !cat || r.cat === cat) : [];
    const others = layers.lain ? scoped.others : [];
    const quakes = layers.gempa ? scoped.quakes : [];
    const reports = [...incidents, ...others];
    const stats = provinceStats(reports, quakes);
    const ranking = [...stats.values()].sort((a, b) =>
      b.total - a.total || (b.incidents + b.quakes) - (a.incidents + a.quakes) || provName(a.code).localeCompare(provName(b.code)));
    return { incidents, others, quakes, reports, stats, ranking };
  }, [scoped, layers, cat]);

  // ── Peringatan dini cuaca BMKG: yang sedang berlaku saat ini, tidak mengikuti rentang waktu ──
  const activeWarnings = useMemo(() => (data?.warnings ?? []).filter(w => w.end > now), [data, now]);
  const warnAreas = useMemo(() => warnedAreas(activeWarnings), [activeWarnings]);
  // chip lapisan hanya mengatur peta; tab Peringatan tetap memuat semuanya (sama seperti CCTV)
  const mapWarnings = useMemo(() => (layers.peringatan ? activeWarnings : []), [activeWarnings, layers.peringatan]);

  const listed = useMemo(() => {
    const inProv = (x: Item) => !prov || itemProv(x) === prov;
    return {
      // satu peringatan bisa menyentuh beberapa provinsi (mis. Jabodetabek)
      warnings: prov ? activeWarnings.filter(w => w.provs.includes(prov)) : activeWarnings,
      incidents: visible.incidents.filter(inProv),
      quakes: visible.quakes.filter(inProv),
      others: visible.others.filter(inProv),
    };
  }, [visible, activeWarnings, prov]);

  // pilihan yang sudah tidak tampil (filter berubah, peringatan berakhir) dilepas
  useEffect(() => {
    if (!selectedId) return;
    const still = listed.incidents.some(r => r.id === selectedId) || listed.quakes.some(q => q.id === selectedId) ||
      listed.others.some(r => r.id === selectedId) || listed.warnings.some(w => w.id === selectedId);
    if (!still) setSelectedId(null);
  }, [listed, selectedId]);

  // kepala halaman → tab Peringatan untuk seluruh Indonesia, dengan lapisannya menyala di peta
  const showWarnings = useCallback(() => {
    setLayers(v => (v.peringatan ? v : { ...v, peringatan: true }));
    setProv(null);
    showPanel('peringatan');
  }, [showPanel]);
  const selectWarning = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setLayers(v => (v.peringatan ? v : { ...v, peringatan: true }));
  }, []);

  // Tanda diklik di peta → barisnya dibuka di tab yang sesuai. Bila tanda itu di luar provinsi yang sedang
  // dipilih, filter provinsi dilepas: tanpa itu barisnya tidak ada di daftar dan kliknya tidak berbuat apa-apa.
  const selectFromMap = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const wn = activeWarnings.find(w => w.id === id);
    showPanel(wn ? 'peringatan' : 'laporan');
    if (!prov) return;
    const it = wn ? null : visible.reports.find(r => r.id === id) ?? visible.quakes.find(q => q.id === id);
    const inside = wn ? wn.provs.includes(prov) : it ? itemProv(it) === prov : true;
    if (!inside) setProv(null);
  }, [activeWarnings, visible, prov, showPanel]);

  const onMapHover = useCallback((h: MapHover) => setMapHover(h), []);
  const onListHoverItem = useCallback((id: string | null) => setListHover({ prov: null, id, cam: null }), []);
  const onListHoverProv = useCallback((code: ProvCode | null) => setListHover({ prov: code, id: null, cam: null }), []);
  const onListHoverCam = useCallback((id: string | null) => setListHover({ prov: null, id: null, cam: id }), []);

  const winDef = WINDOWS.find(x => x.id === win)!;
  const located = scoped.news.filter(r => r.loc).length;
  const maxMag = scoped.quakes.length ? Math.max(...scoped.quakes.map(q => q.mag)) : null;
  const loading = phase === 'loading';
  const ready = data !== null;

  // ── Catatan jujur tentang keadaan sumber ──
  const notices: string[] = [];
  if (data) {
    const s = data.sources;
    const stale = (at: number) => (at ? ` Menampilkan data pukul ${fmtClock(at)}.` : '');
    if (!s.news.ok) notices.push(`Sumber berita tidak menjawab.${stale(s.news.at)}`);
    if (!s.quakes.ok) notices.push(`Sumber gempa tidak menjawab.${stale(s.quakes.at)}`);
    if (s.news.simulated) notices.push(`Backend mengirim ${s.news.simulated} berita simulasi (feed asli tidak terjangkau). Tidak ditampilkan.`);
    if (s.quakes.simulated) notices.push(`Backend mengirim ${s.quakes.simulated} gempa simulasi (BMKG tidak terjangkau). Tidak ditampilkan.`);
    if (s.warnings.state === 'error') {
      const kept = activeWarnings.length > 0 && s.warnings.at > 0;
      notices.push(`${s.warnings.error ?? 'Peringatan dini cuaca BMKG tidak bisa diambil.'}${kept ? ` Menampilkan peringatan yang diambil pukul ${fmtClock(s.warnings.at)}.` : ''}`);
    }
  }

  const sourceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of scoped.news) m.set(r.source, (m.get(r.source) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped]);

  // chip lapisan sekaligus legenda warna peta
  const layerDefs: { id: LayerId; label: string; key: string; n: number }[] = [
    { id: 'insiden', label: 'Insiden', key: 'is-incident', n: cat ? catCounts[cat] : scoped.incidents.length },
    { id: 'gempa', label: 'Gempa M ≥ 5', key: 'is-quake', n: scoped.quakes.length },
    { id: 'lain', label: 'Berita lain', key: 'is-other', n: scoped.others.length },
  ];
  const narrowed = cat !== null || prov !== null || !layers.insiden || !layers.gempa || !layers.lain;
  const filtered = narrowed || win !== '7d' || !layers.cctv || !layers.peringatan;

  // ── Peringatan cuaca di kepala halaman dan di chip lapisan ──
  const warnSrc = data?.sources.warnings;
  const warnKnown = warnSrc?.state === 'ok' || activeWarnings.length > 0;
  const warnTitle =
    warnSrc?.state === 'missing' ? 'Muncul setelah server Python dijalankan ulang.'
    : warnSrc?.state === 'error' ? warnSrc.error ?? undefined
    : undefined;
  let alert: React.ReactNode = null;
  if (activeWarnings.length > 0) {
    alert = (
      <button type="button" className="sr-alert" onClick={showWarnings} title="Lihat di daftar dan di peta">
        <span className="sr-key is-warn" />
        <span className="sr-alert-text">
          Peringatan dini cuaca BMKG berlaku di{' '}
          {warnAreas.length === 0 ? <strong>{activeWarnings.length} wilayah</strong>
            : warnAreas.length === 1 ? <strong>{warnAreas[0]}</strong>
            : <><strong>{warnAreas.length} wilayah</strong>: {warnAreas.join(', ')}</>}
        </span>
      </button>
    );
  } else if (warnSrc?.state === 'ok') {
    alert = <span className="sr-alert-none">Tidak ada peringatan dini cuaca BMKG yang sedang berlaku</span>;
  } else if (warnSrc?.state === 'missing') {
    alert = <span className="sr-alert-none">Peringatan dini cuaca BMKG muncul setelah server Python dijalankan ulang</span>;
  } else if (warnSrc?.state === 'error') {
    alert = <span className="sr-alert-none" title={warnSrc.error ?? undefined}>Peringatan dini cuaca BMKG tidak bisa diambil</span>;
  }

  // ── Kalimat untuk keadaan kosong: bedakan "belum dimuat", "sumber kosong", dan "tersaring habis" ──
  const anyReal = data !== null && (data.news.length > 0 || data.quakes.length > 0);
  const hasMarks = visible.quakes.length > 0 || visible.reports.some(r => r.loc);
  const nListed = listed.incidents.length + listed.quakes.length + listed.others.length;
  const mapNote =
    loading ? 'Memuat laporan…'
    : !ready ? null // galat: sudah dijelaskan di pita merah
    : !anyReal ? 'Belum ada laporan dari sumber asli untuk dipetakan.'
    : hasMarks ? null
    : narrowed ? 'Tidak ada laporan berlokasi untuk filter ini.'
    : `Tidak ada laporan berlokasi dalam ${winDef.long}.`;
  const listEmpty =
    loading ? 'Memuat laporan…'
    : !ready ? 'Daftar kosong karena server tidak menjawab.'
    : !anyReal ? 'Belum ada laporan dari sumber asli.'
    : nListed > 0 ? ''
    : prov ? `Tidak ada laporan untuk ${provName(prov)} dengan filter ini.`
    : win !== 'all' ? 'Tidak ada laporan untuk filter ini. Coba rentang waktu yang lebih panjang atau nyalakan lapisan lain.'
    : 'Tidak ada laporan untuk filter ini. Nyalakan lapisan lain atau hapus filter.';
  const resetFilters = () => {
    setWin('7d'); setLayers(ALL_LAYERS); setCat(null); setProv(null); setSelectedId(null);
  };
  const cctvTitle = cctv.phase === 'error' ? `Daftar kamera tidak bisa dimuat. ${cctv.error ?? ''}` : undefined;

  return (
    <div className="sr">
      {intro && (
        <Suspense fallback={null}>
          <GlobeIntro
            phase={phase}
            data={data}
            cctvPhase={cctv.phase}
            counts={{ news: scoped.news.length, quakes: scoped.quakes.length, warnings: activeWarnings.length, cams: cctv.cams.length }}
            span={winDef.label}
          />
        </Suspense>
      )}
      <header className="sr-head">
        <h1 className="sr-title">Sebaran laporan Indonesia</h1>

        <div className="sr-alertbar" aria-live="polite">{alert}</div>

        <div className="sr-refresh">
          {phase === 'error'
            ? <span className="sr-warn">Server tidak menjawab</span>
            : data
              ? <span title="Diperbarui otomatis tiap 2 menit">Data {fmtWhen(data.fetchedAt, now)} WIB</span>
              : <span>Memuat…</span>}
          <button type="button" className="sr-btn" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Memperbarui…' : 'Perbarui'}
          </button>
        </div>
      </header>

      <div className="sr-filters" role="group" aria-label="Filter">
        <div className="sr-seg" role="group" aria-label="Rentang waktu">
          {WINDOWS.map(x => (
            <button key={x.id} type="button" aria-pressed={win === x.id} onClick={() => setWin(x.id)}>{x.label}</button>
          ))}
        </div>

        <div className="sr-layers" role="group" aria-label="Lapisan peta">
          {layerDefs.map(l => (
            <button
              key={l.id}
              type="button"
              className="sr-layer"
              aria-pressed={layers[l.id]}
              onClick={() => setLayers(v => ({ ...v, [l.id]: !v[l.id] }))}
            >
              <span className={`sr-key ${l.key}`} />
              <span>{l.label}</span>
              {ready && <span className="sr-num">{l.n}</span>}
            </button>
          ))}
          <button
            type="button"
            className="sr-layer"
            aria-pressed={layers.peringatan}
            title={warnTitle}
            onClick={() => setLayers(v => ({ ...v, peringatan: !v.peringatan }))}
          >
            <span className="sr-key is-warn" />
            <span>Peringatan cuaca</span>
            {warnKnown && <span className="sr-num">{activeWarnings.length}</span>}
          </button>
          <button
            type="button"
            className="sr-layer"
            aria-pressed={layers.cctv}
            title={cctvTitle}
            onClick={() => setLayers(v => ({ ...v, cctv: !v.cctv }))}
          >
            <span className="sr-key is-cam" />
            <span>CCTV</span>
            {cctv.phase === 'ready' && <span className="sr-num">{cctv.cams.length}</span>}
          </button>
        </div>

        {cat && (
          <button type="button" className="sr-chip" onClick={() => setCat(null)} aria-label={`Hapus filter jenis ${CATEGORY_LABEL[cat]}`}>
            Hanya {CATEGORY_LABEL[cat].toLowerCase()} <span aria-hidden="true">✕</span>
          </button>
        )}
        {prov && (
          <button type="button" className="sr-chip" onClick={() => setProv(null)} aria-label={`Hapus filter provinsi ${provName(prov)}`}>
            {provName(prov)} <span aria-hidden="true">✕</span>
          </button>
        )}
        {filtered && <button type="button" className="sr-textbtn" onClick={resetFilters}>Atur ulang</button>}
      </div>

      {phase === 'error' && (
        <div className="sr-error" role="alert">
          <p>
            <strong>Data SITREP tidak bisa dimuat.</strong> Server di alamat ini tidak menjawab permintaan berita, gempa, maupun peringatan cuaca.
            Peta tetap tampil, tetapi tanpa laporan. Periksa apakah backend berjalan, lalu coba lagi.
          </p>
          <button type="button" className="sr-btn" onClick={() => void refresh()} disabled={refreshing}>Coba lagi</button>
        </div>
      )}

      <div className="sr-body">
        <SebaranMap
          reports={visible.reports}
          quakes={visible.quakes}
          warnings={mapWarnings}
          stats={visible.stats}
          now={now}
          note={mapNote}
          selectedProv={prov}
          selectedId={selectedId}
          hoverProv={listHover.prov}
          hoverId={listHover.id}
          cameras={mapCams}
          selectedCam={layers.cctv ? camId : null}
          hoverCam={listHover.cam}
          camPreview={layers.cctv ? camPreview : null}
          popupOpen={cam !== null}
          centerCam={centerCam}
          onSelectProv={setProv}
          onSelectItem={selectFromMap}
          onSelectCam={id => selectCam(id)}
          onHoverChange={onMapHover}
        />

        {/* tepat sesudah peta: itulah urutannya di layar sempit, dan urutan Tab di semua ukuran layar */}
        {cam && (
          <Suspense fallback={null}>
            <CctvPopup
              cam={cam}
              frame={frame}
              onRefresh={() => void frame.refresh()}
              detect={detect}
              onDetect={setDetect}
              watchLeft={watchLeft}
              onWatch={on => {
                const t = Date.now();
                setWatchNow(t);
                setWatchEnd(on ? t + WATCH_MS : null);
              }}
              onCenter={() => { setLayers(v => (v.cctv ? v : { ...v, cctv: true })); setCenterCam(n => n + 1); }}
              onClose={() => selectCam(null)}
              takeFocus={camByKeyboard}
            />
          </Suspense>
        )}

        <SummaryStrip
          ready={ready}
          windowLabel={winDef.long}
          incidents={scoped.incidents.length}
          quakes={scoped.quakes.length}
          maxMag={maxMag}
          located={located}
          totalNews={scoped.news.length}
          notices={notices}
          catCounts={catCounts}
          cat={cat}
          onCat={c => { setCat(c); if (c) setLayers(v => ({ ...v, insiden: true })); }}
          ranking={visible.ranking}
          selectedProv={prov}
          hoverProv={mapHover.prov}
          onSelectProv={setProv}
          onHoverProv={onListHoverProv}
        />

        <aside className="sr-list" aria-label="Laporan, peringatan cuaca, dan CCTV">
          <div className="sr-tabs" role="tablist" aria-label="Isi panel">
            <button
              type="button" role="tab" id="sr-tab-laporan" className="sr-tab"
              aria-selected={panel === 'laporan'} aria-controls="sr-panel-laporan"
              onClick={() => showPanel('laporan')}
            >
              Laporan{ready && <span className="sr-num">{nListed}</span>}
            </button>
            <button
              type="button" role="tab" id="sr-tab-peringatan" className="sr-tab"
              aria-selected={panel === 'peringatan'} aria-controls="sr-panel-peringatan"
              onClick={() => showPanel('peringatan')}
            >
              Peringatan{warnKnown && <span className="sr-num">{listed.warnings.length}</span>}
            </button>
            <button
              type="button" role="tab" id="sr-tab-cctv" className="sr-tab"
              aria-selected={panel === 'cctv'} aria-controls="sr-panel-cctv"
              onClick={() => showPanel('cctv')}
            >
              CCTV{cctv.phase === 'ready' && <span className="sr-num">{cctv.cams.length}</span>}
            </button>
          </div>

          {panel === 'laporan' ? (
            <ReportList
              incidents={listed.incidents}
              quakes={listed.quakes}
              others={listed.others}
              now={now}
              scope={prov ? provName(prov) : 'Seluruh Indonesia'}
              emptyText={listEmpty}
              selectedId={selectedId}
              hoverId={mapHover.id}
              onSelect={setSelectedId}
              onHover={onListHoverItem}
              footer={data && (
                <>
                  {sourceCounts.length > 0 && (
                    <p>Berita pada rentang ini: {sourceCounts.map(([src, n]) => `${src} ${n}`).join(', ')}. Gempa: BMKG.</p>
                  )}
                  <p>
                    Jenis dan lokasi dibaca otomatis dari judul dan ringkasan berita, dengan ketelitian kab/kota atau provinsi.
                    Berita yang tidak menyebut tempat tidak digambar di peta.
                  </p>
                </>
              )}
            />
          ) : panel === 'peringatan' ? (
            <PeringatanPanel
              warnings={listed.warnings}
              national={activeWarnings.length}
              source={warnSrc}
              phase={phase}
              now={now}
              scope={prov ? provName(prov) : 'Seluruh Indonesia'}
              onShowAll={() => setProv(null)}
              onRetry={() => void refresh()}
              retrying={refreshing}
              selectedId={selectedId}
              hoverId={mapHover.id}
              onSelect={selectWarning}
              onHover={onListHoverItem}
            />
          ) : (
            <KameraPanel
              cams={cctv.cams}
              phase={cctv.phase}
              error={cctv.error}
              missing={cctv.missing}
              onReload={() => void cctv.reload()}
              selectedId={camId}
              hoverId={mapHover.cam}
              onSelect={selectCam}
              onHover={onListHoverCam}
            />
          )}
        </aside>

      </div>
    </div>
  );
}
