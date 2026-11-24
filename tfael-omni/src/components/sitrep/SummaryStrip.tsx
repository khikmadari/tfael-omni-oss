// TFAEL-OMNI — SITREP · ringkasan, jenis insiden, dan sebaran per provinsi

import { CATEGORY_LABEL, INCIDENT_CATEGORIES, type Category } from './classify.ts';
import { fmtMag } from './format.ts';
import { provName, type ProvCode } from './geo-names.ts';
import type { ProvStat } from './reports.ts';

interface SummaryStripProps {
  /** false selama data belum pernah berhasil dimuat: angka belum diketahui, bukan nol. */
  ready: boolean;
  windowLabel: string;
  incidents: number;
  quakes: number;
  maxMag: number | null;
  located: number;
  totalNews: number;
  notices: string[];
  catCounts: Record<Category, number>;
  cat: Category | null;
  onCat: (c: Category | null) => void;
  ranking: ProvStat[];
  selectedProv: ProvCode | null;
  /** Sorotan dari peta. */
  hoverProv: ProvCode | null;
  onSelectProv: (code: ProvCode | null) => void;
  onHoverProv: (code: ProvCode | null) => void;
}

export function SummaryStrip(props: SummaryStripProps) {
  const {
    ready, windowLabel, incidents, quakes, maxMag, located, totalNews, notices, catCounts, cat, onCat,
    ranking, selectedProv, hoverProv, onSelectProv, onHoverProv,
  } = props;
  const max = ranking.reduce((m, s) => Math.max(m, s.total), 0);
  const pct = (n: number) => `${(n / max) * 100}%`;
  const num = (n: number) => (ready ? n : '–');

  return (
    <div className="sr-strip">
      <section className="sr-block" aria-label="Ringkasan">
        <h2 className="sr-h">Ringkasan <span className="sr-h-sub">{windowLabel}</span></h2>
        <dl className="sr-kv">
          <dt>Insiden dari berita</dt>
          <dd className="sr-num">{num(incidents)}</dd>
          <dt>Gempa M ≥ 5{maxMag !== null && <span className="sr-kv-sub">terbesar M {fmtMag(maxMag)}</span>}</dt>
          <dd className="sr-num">{num(quakes)}</dd>
          <dt>Berita yang menyebut lokasi</dt>
          <dd className="sr-num">{num(located)}{ready && <span className="sr-kv-of"> dari {totalNews}</span>}</dd>
        </dl>
        {notices.map(n => <p key={n} className="sr-notice">{n}</p>)}
      </section>

      <section className="sr-block" aria-label="Jenis insiden">
        <h2 className="sr-h">Jenis insiden</h2>
        <ul className="sr-types">
          {INCIDENT_CATEGORIES.map(c => (
            <li key={c}>
              <button
                type="button"
                className={`sr-type${catCounts[c] === 0 ? ' is-zero' : ''}`}
                aria-pressed={cat === c}
                disabled={!ready || (catCounts[c] === 0 && cat !== c)}
                onClick={() => onCat(cat === c ? null : c)}
              >
                <span>{CATEGORY_LABEL[c]}</span>
                <span className="sr-num">{num(catCounts[c])}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="sr-block sr-block-rank" aria-label="Sebaran per provinsi">
        <h2 className="sr-h">
          Sebaran per provinsi
          <span className="sr-h-sub">{ranking.length ? `${ranking.length} dari 38 provinsi` : ''}</span>
        </h2>
        {ranking.length === 0 ? (
          <p className="sr-empty">{ready ? 'Tidak ada laporan berlokasi untuk ditampilkan.' : 'Belum ada data.'}</p>
        ) : (
          <div className="sr-rank-wrap">
            <ol className="sr-rank">
              {ranking.map(s => (
                <li key={s.code}>
                  <button
                    type="button"
                    className={`sr-rank-row${hoverProv === s.code ? ' is-hover' : ''}`}
                    aria-pressed={selectedProv === s.code}
                    title={`${provName(s.code)}: ${s.incidents} insiden, ${s.quakes} gempa, ${s.others} berita lain`}
                    onClick={() => onSelectProv(selectedProv === s.code ? null : s.code)}
                    onPointerEnter={() => onHoverProv(s.code)}
                    onPointerLeave={() => onHoverProv(null)}
                    onFocus={() => onHoverProv(s.code)}
                    onBlur={() => onHoverProv(null)}
                  >
                    <span className="sr-rank-name">{provName(s.code)}</span>
                    <span className="sr-bar" aria-hidden="true">
                      {s.incidents > 0 && <span className="is-incident" style={{ width: pct(s.incidents) }} />}
                      {s.quakes > 0 && <span className="is-quake" style={{ width: pct(s.quakes) }} />}
                      {s.others > 0 && <span className="is-other" style={{ width: pct(s.others) }} />}
                    </span>
                    <span className="sr-num">{s.total}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
