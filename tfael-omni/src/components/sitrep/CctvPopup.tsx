// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · popup kamera CCTV di atas peta
//
// Kartu melayang di sisi kanan peta untuk kamera yang dipilih: gambar terkini, tombol
// muat ulang / pusatkan / perbesar, deteksi objek (atas permintaan), dan mode pantau.
// Semua keterangan di kartu ini menyatakan keadaan sebenarnya: yang tampil adalah
// gambar diam dari stream publik, bukan video langsung, dan tidak ada yang direkam.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtClockSec } from './format.ts';
import { WATCH_MS, type Camera, type Frame, type FrameState } from './useCctv.ts';

export interface CctvPopupProps {
  cam: Camera;
  frame: FrameState;
  onRefresh: () => void;
  /** Deteksi objek dinyalakan (kotak + hitungan untuk tiap gambar, sesudah gambarnya tampil). */
  detect: boolean;
  onDetect: (on: boolean) => void;
  /** Sisa waktu mode pantau dalam detik; null = tidak sedang memantau. */
  watchLeft: number | null;
  onWatch: (on: boolean) => void;
  onCenter: () => void;
  onClose: () => void;
  /** Kamera dipilih dengan papan ketik: fokus dipindahkan ke popup supaya tombolnya langsung terjangkau. */
  takeFocus?: boolean;
}

/** Nama kelas YOLO (COCO) yang lazim muncul di CCTV lalu lintas. */
const OBJECT_NAME: Record<string, string> = {
  car: 'mobil', motorcycle: 'motor', truck: 'truk', bus: 'bus', person: 'orang', bicycle: 'sepeda',
};

function describeCounts(frame: Frame): string | null {
  if (frame.counts === null) return null;
  if (frame.counts.length === 0) return 'Tidak ada kendaraan atau orang yang terdeteksi.';
  return `Terdeteksi ${frame.counts.map(([k, n]) => `${n} ${OBJECT_NAME[k] ?? k}`).join(', ')}.`;
}

/**
 * Kotak penanda objek di atas gambar kamera. viewBox = ukuran gambar dan penempatannya sama dengan
 * object-fit: contain, jadi kotak tetap menempel di objeknya berapa pun ukuran gambar di layar.
 * Label ("mobil 87%") hanya untuk tampilan besar; di popup ia menutupi gambar.
 */
function DetectionBoxes({ frame, labels }: { frame: Frame; labels: boolean }) {
  if (!frame.boxes || frame.boxes.length === 0) return null;
  const fs = frame.w / 72;
  return (
    <svg className="sr-boxes" viewBox={`0 0 ${frame.w} ${frame.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {frame.boxes.map((b, i) => (
        <g key={i}>
          <rect className="sr-box-halo" x={b.x} y={b.y} width={b.w} height={b.h} vectorEffect="non-scaling-stroke" />
          <rect className="sr-box" x={b.x} y={b.y} width={b.w} height={b.h} vectorEffect="non-scaling-stroke" />
          {labels && (
            <text
              className="sr-box-label"
              x={b.x + fs * 0.1}
              y={b.y > fs * 1.4 ? b.y - fs * 0.38 : b.y + fs * 1.1}
              fontSize={fs}
              strokeWidth={fs * 0.26}
            >
              {OBJECT_NAME[b.label] ?? b.label} {Math.round(b.conf * 100)}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

const origin = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch { return null; }
};

/** Kode pendek dari pengenal kamera di portal sumbernya: "CAM-4CTVX1". */
const camCode = (id: string): string => `CAM-${id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || '?'}`;
const coordText = (cam: Camera): string =>
  cam.lat === null || cam.lon === null ? 'tanpa koordinat' : `${cam.approx ? '≈ ' : ''}${cam.lat.toFixed(4)}, ${cam.lon.toFixed(4)}`;
/** "JPG" dari data:image/jpeg;… — jenis berkas gambar yang benar-benar dikirim server. */
const imageKind = (src: string): string => {
  const m = /^data:image\/([a-z0-9]+)/i.exec(src);
  if (!m) return '';
  return m[1].toLowerCase() === 'jpeg' ? 'JPG' : m[1].toUpperCase();
};

// Ikon garis 16 px; warnanya mengikuti teks tombol.
const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I = {
  camera: 'M2 5.2h2.4l1-1.7h5.2l1 1.7H14v7.3H2zM8 10.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  refresh: 'M13.2 6.2A5.4 5.4 0 0 0 3.4 5M2.8 9.8A5.4 5.4 0 0 0 12.6 11M13.4 2.8v3.4H10M2.6 13.2V9.8H6',
  pin: 'M8 14.2s4.4-4 4.4-7.4A4.4 4.4 0 0 0 3.6 6.8C3.6 10.2 8 14.2 8 14.2zM8 8.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  expand: 'M9.6 2.6h3.8v3.8M6.4 13.4H2.6V9.6M13.4 2.6 9 7M2.6 13.4 7 9',
  close: 'M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8',
  scan: 'M2.6 5.4V2.6h2.8M10.6 2.6h2.8v2.8M13.4 10.6v2.8h-2.8M5.4 13.4H2.6v-2.8M5.6 6h4.8v4H5.6z',
  watch: 'M8 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8 6.4V9l1.6 1M6.4 2h3.2',
  out: 'M9.4 2.6h4v4M13.4 2.6 7.6 8.4M11.4 9.2v4.2H2.6V4.6h4.2',
};

type Focusable = HTMLElement | SVGElement;
const focusable = (el: Element | null): Focusable | null => (el instanceof HTMLElement || el instanceof SVGElement ? el : null);

export default function CctvPopup(props: CctvPopupProps) {
  const { cam, frame, onRefresh, detect, onDetect, watchLeft, onWatch, onCenter, onClose, takeFocus = false } = props;
  const f = frame.frame;
  const watching = watchLeft !== null;
  const portal = cam.pageUrl ?? (cam.streamUrl ? origin(cam.streamUrl) : null);
  const counts = f ? describeCounts(f) : null;
  const popRef = useRef<HTMLElement>(null);

  // ── Dari mana popup dibuka (baris daftar atau peta): ke sanalah fokus kembali saat popup ditutup ──
  const fromRef = useRef<Focusable | null>(null);
  useEffect(() => {
    const a = focusable(document.activeElement);
    if (a && a !== document.body && !popRef.current?.contains(a)) fromRef.current = a;
    const el = popRef.current;
    if (!el) return;
    if (takeFocus) el.focus({ preventScroll: true });
    // Tata letak sempit: popup berada di bawah peta, sedangkan daftar kamera lebih bawah lagi. Bila popup tidak
    // terlihat dari tempat pengguna menggulir, bawa ke layar.
    const r = el.getBoundingClientRect();
    const seen = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (seen < Math.min(160, r.height)) el.scrollIntoView({ block: 'start' });
  }, [cam.id, takeFocus]);
  const close = useCallback(() => {
    const from = fromRef.current;
    onClose();
    if (from?.isConnected) from.focus();
  }, [onClose]);

  // ── Gambar besar: fokus pindah ke tombol Tutup, lalu kembali ke tombol yang membukanya ──
  const [enlarged, setEnlarged] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Focusable | null>(null);
  const openLarge = useCallback(() => {
    openerRef.current = focusable(document.activeElement);
    setEnlarged(true);
  }, []);
  const closeLarge = useCallback(() => {
    setEnlarged(false);
    openerRef.current?.focus();
  }, []);
  const showLarge = enlarged && f !== null;
  useEffect(() => { if (showLarge) closeRef.current?.focus(); }, [showLarge]);
  // ganti kamera → gambar besar kamera sebelumnya ditutup
  useEffect(() => setEnlarged(false), [cam.id]);

  // Esc menutup yang paling atas: gambar besar dulu, baru popup. Ditangkap sebelum peta, supaya peta tidak
  // ikut kembali ke tampilan seluruh Indonesia.
  const escRef = useRef(close);
  escRef.current = showLarge ? closeLarge : close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      escRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const status =
    !cam.streamUrl ? { text: 'Tanpa stream', cls: '' }
    : frame.error ? { text: f ? 'Terputus' : 'Tidak terjangkau', cls: ' is-bad' }
    : f ? { text: 'Terhubung', cls: ' is-ok' }
    : { text: 'Mengambil gambar', cls: '' };

  const detectNote =
    frame.detect === 'running' ? 'Mendeteksi objek…'
    : frame.detect === 'unavailable' ? 'Deteksi objek tidak aktif di server ini (YOLO belum terpasang).'
    : frame.detect === 'failed' ? 'Deteksi objek gagal dijalankan.'
    : counts;

  const sub = [cam.area, `Sumber: ${cam.source}`].filter(Boolean).join(' • ');
  const kind = f ? imageKind(f.src) : '';

  return (
    <>
      <section ref={popRef} className="sr-pop" aria-label={`CCTV ${cam.name}`} tabIndex={-1}>
        <div className="sr-pop-strip">
          <span className="sr-pop-code">{camCode(cam.id)}</span>
          <span
            className="sr-pop-coord"
            title={cam.approx && cam.lat !== null ? 'Posisi perkiraan tingkat kecamatan; portal sumber tidak mencantumkan koordinat' : undefined}
          >
            {coordText(cam)}
          </span>
          <span className="sr-pop-kind">{cam.streamUrl ? 'Stream publik' : 'Tautan portal'}</span>
        </div>

        <header className="sr-pop-head">
          <span className="sr-pop-icon"><Icon d={I.camera} /></span>
          <div className="sr-pop-names">
            <h2 className="sr-pop-title" title={cam.name}>{cam.name}</h2>
            <p className="sr-pop-sub" title={sub}>{sub}</p>
          </div>
          <div className="sr-pop-tools">
            <button type="button" className="sr-pop-tool" onClick={onRefresh} disabled={!cam.streamUrl || frame.loading} aria-label="Ambil gambar terbaru" title="Ambil gambar terbaru"><Icon d={I.refresh} /></button>
            <button type="button" className="sr-pop-tool" onClick={onCenter} disabled={cam.lat === null} aria-label="Pusatkan di peta" title={cam.lat === null ? 'Kamera ini tidak punya posisi di peta' : 'Pusatkan di peta'}><Icon d={I.pin} /></button>
            <button type="button" className="sr-pop-tool" onClick={openLarge} disabled={!f} aria-label="Perbesar gambar" title="Perbesar gambar"><Icon d={I.expand} /></button>
            <button type="button" className="sr-pop-tool is-close" onClick={close} aria-label="Tutup" title="Tutup (Esc)"><Icon d={I.close} /></button>
          </div>
        </header>

        {cam.streamUrl ? (
          <div className="sr-pop-view" style={f ? { aspectRatio: `${f.w} / ${f.h}` } : undefined}>
            {f && (
              <button type="button" className="sr-pop-open" onClick={openLarge} aria-label={`Perbesar gambar ${cam.name}`}>
                <img src={f.src} alt={`Gambar CCTV ${cam.name}, diambil pukul ${fmtClockSec(f.at)} WIB`} />
                <DetectionBoxes frame={f} labels={false} />
              </button>
            )}
            {!f && frame.loading && <p className="sr-pop-state" role="status">Mengambil gambar dari kamera…</p>}
            {!f && !frame.loading && frame.error && (
              <div className="sr-pop-state" role="alert">
                <p>Gambar tidak bisa diambil. {frame.error}</p>
                <button type="button" className="sr-btn" onClick={onRefresh}>Coba lagi</button>
              </div>
            )}
            {f && (
              <span className={`sr-pop-badge${watching ? ' is-watch' : frame.error ? ' is-stale' : ''}`} role="status">
                <span className="sr-pop-dot" />
                Gambar {fmtClockSec(f.at)}
                {frame.loading && !watching && ' · memperbarui'}
              </span>
            )}
          </div>
        ) : (
          <p className="sr-pop-linkonly">Kamera ini tidak punya alamat stream, jadi gambarnya hanya bisa dilihat di portal sumbernya.</p>
        )}

        {cam.streamUrl && (
          <div className="sr-pop-actions">
            <button
              type="button" className="sr-pop-btn is-primary" aria-pressed={detect || f?.annotated === true}
              disabled={f?.annotated === true}
              title={f?.annotated ? 'Server versi lama selalu menyertakan deteksi objek' : 'Tandai kendaraan dan orang pada gambar; dijalankan sesudah gambar tampil'}
              onClick={() => onDetect(!detect)}
            >
              <Icon d={I.scan} />Deteksi objek
            </button>
            <button type="button" className="sr-pop-btn" aria-pressed={watching} onClick={() => onWatch(!watching)} title="Muat ulang gambar tiap 5 detik selama 30 detik">
              <Icon d={I.watch} />{watching ? `Berhenti · ${watchLeft} dtk` : `Pantau ${WATCH_MS / 1000} dtk`}
            </button>
          </div>
        )}

        {detectNote && <p className="sr-pop-note" role="status">{detectNote}</p>}
        {f && frame.error && !frame.loading && (
          <p className="sr-pop-note is-warn">Gagal memperbarui, gambar di atas yang terakhir berhasil. {frame.error}</p>
        )}

        <footer className="sr-pop-foot">
          <dl>
            <div><dt>Jenis</dt><dd>{cam.streamUrl ? `Gambar diam${kind ? ` (${kind})` : ''}` : 'Tautan'}</dd></div>
            <div><dt>Status</dt><dd className={`sr-pop-status${status.cls}`}>{status.text}</dd></div>
          </dl>
          {portal && (
            <a className="sr-pop-btn" href={portal} target="_blank" rel="noopener noreferrer"><Icon d={I.out} />Portal sumber</a>
          )}
        </footer>
      </section>

      {showLarge && f && (
        <div className="sr-zoom" role="dialog" aria-modal="true" aria-label={`Gambar CCTV ${cam.name}`} onClick={closeLarge}>
          <figure onClick={e => e.stopPropagation()}>
            <div className="sr-zoom-img">
              <img src={f.src} alt={`Gambar CCTV ${cam.name}, diambil pukul ${fmtClockSec(f.at)} WIB`} />
              <DetectionBoxes frame={f} labels />
            </div>
            <figcaption>
              <span className="sr-zoom-text">
                <strong>{cam.name}</strong>
                <span>{[cam.area, cam.source].filter(Boolean).join(', ')}</span>
                <span>Gambar pukul {fmtClockSec(f.at)} WIB. {counts}{frame.loading ? ' Memperbarui…' : ''}</span>
              </span>
              <button type="button" className="sr-btn" onClick={onRefresh} disabled={frame.loading}>Ambil gambar terbaru</button>
              <button ref={closeRef} type="button" className="sr-btn" onClick={closeLarge}>Tutup</button>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
