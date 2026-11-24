// TFAEL-OMNI — SITREP · daftar laporan (padanan tabel dari peta sebaran)

import { useEffect, useRef } from 'react';
import { fmtAgo, fmtDateTime, fmtMag } from './format.ts';
import { provName } from './geo-names.ts';
import type { Quake, Report } from './reports.ts';

interface ReportListProps {
  incidents: Report[];
  quakes: Quake[];
  others: Report[];
  now: number;
  /** "Seluruh Indonesia" atau nama provinsi terpilih. */
  scope: string;
  /** Kalimat yang tampil saat tidak ada baris. */
  emptyText: string;
  selectedId: string | null;
  /** Sorotan dari peta. */
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  footer: React.ReactNode;
}

function placeLine(r: Report): string {
  const loc = r.loc;
  if (!loc) return '';
  if (!loc.place) return provName(loc.prov);
  const head = loc.label === loc.place.name ? loc.place.name : `${loc.label}, ${loc.place.name}`;
  return `${head}, ${provName(loc.prov)}`;
}

const coord = (v: number, pos: string, neg: string): string =>
  `${Math.abs(v).toFixed(2).replace('.', ',')}° ${v >= 0 ? pos : neg}`;

export function ReportList(props: ReportListProps) {
  const { incidents, quakes, others, now, scope, emptyText, selectedId, hoverId, onSelect, onHover, footer } = props;
  const rows = useRef(new Map<string, HTMLLIElement>());

  // dipilih dari peta → gulir daftar sampai barisnya terlihat
  useEffect(() => {
    if (selectedId) rows.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const bind = (id: string) => ({
    ref: (el: HTMLLIElement | null) => { if (el) rows.current.set(id, el); else rows.current.delete(id); },
    className: `sr-item${id === selectedId ? ' is-open' : ''}${id === hoverId ? ' is-hover' : ''}`,
  });
  const interact = (id: string) => ({
    'aria-expanded': id === selectedId,
    onClick: () => onSelect(id === selectedId ? null : id),
    onPointerEnter: () => onHover(id),
    onPointerLeave: () => onHover(null),
    onFocus: () => onHover(id),
    onBlur: () => onHover(null),
  });

  const time = (t: number | null) =>
    t === null
      ? <span className="sr-item-time">waktu tak tercantum</span>
      : <time className="sr-item-time" dateTime={new Date(t).toISOString()} title={fmtDateTime(t)}>{fmtAgo(t, now)}</time>;

  const report = (r: Report) => {
    const place = placeLine(r);
    return (
      <li key={r.id} {...bind(r.id)}>
        <button type="button" className="sr-item-btn" {...interact(r.id)}>
          <span className="sr-item-top">
            <span className={`sr-key ${r.incident ? 'is-incident' : 'is-other'}`} />
            {r.incident && <span className="sr-item-type">{r.label}</span>}
            {place
              ? <span className="sr-item-place">{place}</span>
              : r.incident ? <span className="sr-item-place is-none">lokasi tidak disebut</span> : <span className="sr-item-place" />}
            {time(r.time)}
          </span>
          <span className="sr-item-title">{r.title}</span>
          <span className="sr-item-src">{r.source}</span>
        </button>
        {r.id === selectedId && (
          <div className="sr-item-more">
            {r.summary && <p>{r.summary}</p>}
            <p className="sr-item-facts">
              {r.time !== null && <>{fmtDateTime(r.time)}. </>}
              {r.loc
                ? <>Lokasi dibaca dari {r.loc.via} berita{r.loc.place ? '' : ', hanya sampai tingkat provinsi'}.</>
                : <>Judul dan ringkasan tidak menyebut nama tempat, jadi laporan ini tidak ada di peta.</>}
            </p>
            {r.url && (
              <a className="sr-link" href={r.url} target="_blank" rel="noopener noreferrer">Buka artikel di {r.source}</a>
            )}
          </div>
        )}
      </li>
    );
  };

  const quake = (q: Quake) => (
    <li key={q.id} {...bind(q.id)}>
      <button type="button" className="sr-item-btn" {...interact(q.id)}>
        <span className="sr-item-top">
          <span className="sr-key is-quake" />
          <span className="sr-item-type">Gempa M {fmtMag(q.mag)}</span>
          <span className="sr-item-place">{q.prov ? provName(q.prov) : ''}</span>
          {time(q.time)}
        </span>
        <span className="sr-item-title">{q.place}</span>
        <span className="sr-item-src">{q.depthKm !== null ? `Kedalaman ${q.depthKm} km` : 'Kedalaman tidak tercatat'}</span>
      </button>
      {q.id === selectedId && (
        <div className="sr-item-more">
          <p className="sr-item-facts">
            {q.time !== null && <>{fmtDateTime(q.time)}. </>}
            Episenter {coord(q.lat, 'LU', 'LS')}, {coord(q.lon, 'BT', 'BB')}.
            {q.felt && <> Dirasakan: {q.felt}.</>}
            {' '}Sumber: BMKG.
          </p>
        </div>
      )}
    </li>
  );

  const total = incidents.length + quakes.length + others.length;

  return (
    <div className="sr-pane" role="tabpanel" id="sr-panel-laporan" aria-labelledby="sr-tab-laporan">
      <div className="sr-pane-head">{scope}</div>
      <div className="sr-list-scroll">
        {total === 0 && <p className="sr-empty">{emptyText}</p>}
        {incidents.length > 0 && (
          <section>
            <h3 className="sr-group-h"><span className="sr-key is-incident" />Insiden<span className="sr-num">{incidents.length}</span></h3>
            <ul>{incidents.map(report)}</ul>
          </section>
        )}
        {quakes.length > 0 && (
          <section>
            <h3 className="sr-group-h"><span className="sr-key is-quake" />Gempa M ≥ 5<span className="sr-num">{quakes.length}</span></h3>
            <ul>{quakes.map(quake)}</ul>
          </section>
        )}
        {others.length > 0 && (
          <section>
            <h3 className="sr-group-h"><span className="sr-key is-other" />Berita lain<span className="sr-num">{others.length}</span></h3>
            <ul>{others.map(report)}</ul>
          </section>
        )}
        <div className="sr-list-foot">{footer}</div>
      </div>
    </div>
  );
}
