// TFAEL-OMNI — SITREP · tab CCTV: daftar kamera (gambarnya terbuka di popup di atas peta)

import { useEffect, useMemo, useRef } from 'react';
import type { Camera, CctvPhase } from './useCctv.ts';

interface KameraPanelProps {
  cams: Camera[];
  phase: CctvPhase;
  error: string | null;
  /** Nama portal yang tidak menjawab, bila daftar hanya berisi kamera dari sumber lain. */
  missing: string | null;
  onReload: () => void;
  selectedId: string | null;
  /** Sorotan dari peta. */
  hoverId: string | null;
  /** viaKeyboard: baris diaktifkan dengan Enter/Spasi, bukan diklik. */
  onSelect: (id: string | null, viaKeyboard: boolean) => void;
  onHover: (id: string | null) => void;
}

export function KameraPanel(props: KameraPanelProps) {
  const { cams, phase, error, missing, onReload, selectedId, hoverId, onSelect, onHover } = props;
  const rows = useRef(new Map<string, HTMLLIElement>());
  const scroller = useRef<HTMLDivElement>(null);

  // Kamera dipilih dari peta → barisnya di daftar ikut terlihat. Yang digulir hanya daftar ini sendiri: pada tata
  // letak sempit daftar tidak punya gulungan sendiri, dan menggulir halaman ke barisnya akan menjauhkan pengguna
  // dari peta dan popup kamera yang baru dibukanya.
  useEffect(() => {
    const row = selectedId ? rows.current.get(selectedId) : undefined;
    const box = scroller.current;
    if (!row || !box || box.scrollHeight <= box.clientHeight + 1) return;
    const r = row.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    // kepala kelompok menempel di atas daftar dan menutupi baris di bawahnya
    const head = box.querySelector('.sr-group-h')?.getBoundingClientRect().height ?? 0;
    if (r.top < b.top + head) box.scrollTop -= b.top + head - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  }, [selectedId]);

  const groups = useMemo(() => {
    const m = new Map<string, Camera[]>();
    for (const c of cams) {
      const g = m.get(c.source);
      if (g) g.push(c); else m.set(c.source, [c]);
    }
    return [...m.entries()];
  }, [cams]);

  const anyUnplaced = cams.some(c => c.lat === null);

  return (
    <div className="sr-pane" role="tabpanel" id="sr-panel-cctv" aria-labelledby="sr-tab-cctv">
      <div className="sr-pane-head">Pilih kamera untuk membuka gambarnya di peta</div>
      <div ref={scroller} className="sr-list-scroll">
        {phase === 'loading' && cams.length === 0 && <p className="sr-empty" role="status">Memuat daftar kamera…</p>}

        {phase === 'error' && (
          <div className="sr-cam-fail" role="alert">
            <p><strong>Daftar kamera tidak bisa dimuat.</strong> {error}</p>
            <button type="button" className="sr-btn" onClick={onReload}>Coba lagi</button>
          </div>
        )}

        {phase === 'ready' && cams.length === 0 && (
          <p className="sr-empty">Server tidak mengirim satu pun kamera.</p>
        )}

        {phase === 'ready' && missing && (
          <div className="sr-cam-fail" role="status">
            <p><strong>{missing} tidak menjawab.</strong> Kameranya tidak ada di daftar ini sampai portal itu bisa dihubungi lagi.</p>
            <button type="button" className="sr-btn" onClick={onReload}>Coba lagi</button>
          </div>
        )}

        {groups.map(([source, list]) => (
          <section key={source}>
            <h3 className="sr-group-h"><span className="sr-key is-cam" />{source}<span className="sr-num">{list.length}</span></h3>
            <ul>
              {list.map(c => (
                <li
                  key={c.id}
                  ref={el => { if (el) rows.current.set(c.id, el); else rows.current.delete(c.id); }}
                  className={`sr-item${c.id === selectedId ? ' is-open' : ''}${c.id === hoverId ? ' is-hover' : ''}`}
                >
                  <button
                    type="button"
                    className="sr-item-btn sr-camrow"
                    aria-pressed={c.id === selectedId}
                    onClick={e => onSelect(c.id === selectedId ? null : c.id, e.detail === 0)}
                    onPointerEnter={() => onHover(c.id)}
                    onPointerLeave={() => onHover(null)}
                    onFocus={() => onHover(c.id)}
                    onBlur={() => onHover(null)}
                  >
                    <span className="sr-camrow-name">{c.name}</span>
                    <span className="sr-camrow-area">
                      {c.area}
                      {c.lat === null && <span className="sr-camrow-tag">tanpa posisi di peta</span>}
                      {!c.streamUrl && <span className="sr-camrow-tag">hanya tautan</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {cams.length > 0 && (
          <div className="sr-list-foot">
            <p>Yang tampil adalah gambar diam yang diambil server dari stream publik saat diminta, bukan video langsung.</p>
            {cams.some(c => c.approx && c.lat !== null) && (
              <p>Posisi kamera di peta adalah perkiraan tingkat kecamatan; portal sumber tidak mencantumkan koordinat.</p>
            )}
            {anyUnplaced && <p>Kamera tanpa posisi tetap bisa dibuka dari daftar ini.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
