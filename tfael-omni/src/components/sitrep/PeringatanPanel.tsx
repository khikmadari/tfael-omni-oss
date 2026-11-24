// TFAEL-OMNI — SITREP · panel peringatan dini cuaca BMKG (padanan daftar dari tanda di peta)

import { useEffect, useRef } from 'react';
import { fmtClock } from './format.ts';
import { warnSpan, warnWhen, type Warning } from './peringatan.ts';
import type { Phase, WarningSource } from './useSitrepData.ts';

interface PeringatanPanelProps {
  /** Peringatan yang sedang berlaku untuk wilayah terpilih, yang paling cepat berakhir dulu. */
  warnings: Warning[];
  /** Jumlah yang sedang berlaku di seluruh Indonesia: menjelaskan daftar yang kosong karena filter provinsi. */
  national: number;
  /** Keadaan sumber; undefined selama data SITREP belum pernah dimuat. */
  source: WarningSource | undefined;
  phase: Phase;
  now: number;
  /** "Seluruh Indonesia" atau nama provinsi terpilih. */
  scope: string;
  onShowAll: () => void;
  onRetry: () => void;
  retrying: boolean;
  selectedId: string | null;
  /** Sorotan dari peta. */
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

export function PeringatanPanel(props: PeringatanPanelProps) {
  const {
    warnings, national, source, phase, now, scope, onShowAll, onRetry, retrying, selectedId, hoverId, onSelect, onHover,
  } = props;
  const rows = useRef(new Map<string, HTMLLIElement>());

  // dipilih dari peta → gulir daftar sampai barisnya terlihat
  useEffect(() => {
    if (selectedId) rows.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const retry = <button type="button" className="sr-btn" onClick={onRetry} disabled={retrying}>{retrying ? 'Memeriksa…' : 'Coba lagi'}</button>;

  // ── Daftar kosong: katakan sebabnya, dan apa yang bisa dilakukan ──
  let empty: React.ReactNode = null;
  if (warnings.length === 0) {
    if (national > 0) {
      empty = (
        <div className="sr-pane-msg">
          <p>Tidak ada peringatan cuaca untuk {scope}. Di provinsi lain ada {national} yang sedang berlaku.</p>
          <button type="button" className="sr-btn" onClick={onShowAll}>Tampilkan seluruh Indonesia</button>
        </div>
      );
    } else if (!source) {
      empty = phase === 'loading'
        ? <p className="sr-empty" role="status">Memuat peringatan cuaca…</p>
        : <p className="sr-empty">Daftar kosong karena server tidak menjawab.</p>;
    } else if (source.state === 'pending') {
      empty = <p className="sr-empty" role="status">Memuat peringatan cuaca…</p>;
    } else if (source.state === 'missing') {
      empty = (
        <div className="sr-pane-msg is-todo">
          <p>
            <strong>Belum aktif di server yang sedang berjalan.</strong> Server belum mengenal permintaan peringatan cuaca
            karena masih memakai kode lama. Hentikan server Python, jalankan lagi, lalu tekan Coba lagi.
          </p>
          {retry}
        </div>
      );
    } else if (source.state === 'error') {
      empty = (
        <div className="sr-pane-msg is-fail" role="alert">
          <p><strong>Peringatan dini cuaca tidak bisa diambil.</strong> {source.error}</p>
          {retry}
        </div>
      );
    } else {
      empty = <p className="sr-empty">Tidak ada peringatan dini cuaca BMKG yang sedang berlaku.</p>;
    }
  }

  // sumber gagal diperbarui, tetapi peringatan terakhir masih dalam masa berlakunya
  const stale = source?.state === 'error' && warnings.length > 0;

  return (
    <div className="sr-pane" role="tabpanel" id="sr-panel-peringatan" aria-labelledby="sr-tab-peringatan">
      <div className="sr-pane-head">{scope}</div>
      <div className="sr-list-scroll">
        {empty}

        {stale && source && (
          <div className="sr-pane-msg is-fail" role="status">
            <p>
              <strong>Gagal memperbarui.</strong> {source.error}
              {source.at > 0 && <> Daftar di bawah diambil pukul {fmtClock(source.at)} WIB.</>}
            </p>
            {retry}
          </div>
        )}

        {warnings.length > 0 && (
          <ul>
            {warnings.map(wn => (
              <li
                key={wn.id}
                ref={el => { if (el) rows.current.set(wn.id, el); else rows.current.delete(wn.id); }}
                className={`sr-item${wn.id === selectedId ? ' is-open' : ''}${wn.id === hoverId ? ' is-hover' : ''}`}
              >
                <button
                  type="button"
                  className="sr-item-btn"
                  aria-expanded={wn.id === selectedId}
                  onClick={() => onSelect(wn.id === selectedId ? null : wn.id)}
                  onPointerEnter={() => onHover(wn.id)}
                  onPointerLeave={() => onHover(null)}
                  onFocus={() => onHover(wn.id)}
                  onBlur={() => onHover(null)}
                >
                  <span className="sr-item-top">
                    <span className="sr-key is-warn" />
                    <span className="sr-item-type">{wn.area || 'Wilayah tidak disebut'}</span>
                    <span className="sr-item-place" />
                    <span className="sr-item-time">{warnWhen(wn, now)}</span>
                  </span>
                  <span className="sr-item-title">{wn.event}</span>
                  {wn.places && <span className="sr-item-src">{wn.places}</span>}
                </button>
                {wn.id === selectedId && (
                  <div className="sr-item-more">
                    {wn.description && <p>{wn.description}</p>}
                    <p className="sr-item-facts">
                      {warnSpan(wn)}.
                      {wn.endEstimated && <> Jam berakhir tidak tercantum di sumber, diperkirakan tiga jam sejak terbit.</>}
                      {wn.polygons.length === 0 && (wn.center
                        ? <> Batas daerah terdampak tidak berhasil diambil, jadi di peta hanya ada tanda di provinsinya.</>
                        : <> Batas daerah terdampak tidak berhasil diambil dan wilayahnya tidak dikenali, jadi peringatan ini tidak ada di peta.</>)}
                    </p>
                    {wn.infographic && (
                      <a className="sr-link" href={wn.infographic} target="_blank" rel="noopener noreferrer">Buka infografik BMKG</a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {(warnings.length > 0 || source?.state === 'ok') && (
          <div className="sr-list-foot">
            <p>
              Sumber: BMKG, data terbuka peringatan dini cuaca. Yang tampil hanya peringatan yang masih berlaku,
              tidak mengikuti rentang waktu di atas. Diperbarui tiap 2 menit, jam ditulis dalam WIB.
            </p>
            <p>Di peta, peringatan tampil sebagai segitiga pada tampilan jauh dan sebagai bidang daerah terdampak setelah diperbesar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
