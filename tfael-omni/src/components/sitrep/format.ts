// TFAEL-OMNI — SITREP · format waktu (WIB) dan angka (id-ID)

const TZ = 'Asia/Jakarta';

const clockFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const dayFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: TZ });
const fullFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
});
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** "19.07" */
export const fmtClock = (t: number): string => clockFmt.format(t);
const clockSecFmt = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ,
});
/** "19.07.42" — untuk gambar kamera, yang umurnya dihitung dalam detik. */
export const fmtClockSec = (t: number): string => clockSecFmt.format(t);
/** "14 Nov" */
export const fmtDay = (t: number): string => dayFmt.format(t);
/** "14 Nov 2026, 19.07 WIB" */
export const fmtDateTime = (t: number): string => `${fullFmt.format(t).replace(' pukul ', ', ')} WIB`;

/** "baru saja", "12 mnt lalu", "3 jam lalu", "5 hari lalu"; lebih dari 30 hari → tanggal. */
export function fmtAgo(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 90) return 'baru saja';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.round(h / 24);
  if (d <= 30) return `${d} hari lalu`;
  return fmtDay(t);
}

/** Jam bila hari ini (WIB), selain itu tanggal. */
export function fmtWhen(t: number, now: number): string {
  return dayKeyFmt.format(t) === dayKeyFmt.format(now) ? fmtClock(t) : fmtDay(t);
}

/** "5,5" */
export const fmtMag = (m: number): string => m.toFixed(1).replace('.', ',');
