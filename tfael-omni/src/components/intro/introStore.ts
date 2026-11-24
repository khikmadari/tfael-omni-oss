// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — animasi pembuka setelah login · keadaan bersama
//
// Dua bagian yang dimuat terpisah bertemu di sini:
//   IntroCover  (cangkang aplikasi)  tirai selayar penuh yang langsung menutup layar begitu login berhasil
//   GlobeIntro  (modul SITREP)       bola dunia yang digambar di panggung di dalam tirai itu
// Tirai tidak pernah bergantung pada bola dunianya: bila modul SITREP tidak datang, tirai membuka sendiri.
// ═══════════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';

/** off = tidak ada; cover = tirai menutup, bola dunia belum menggambar; globe = bola dunia berjalan; leaving = tirai memudar. */
export type IntroPhase = 'off' | 'cover' | 'globe' | 'leaving';

let phase: IntroPhase = 'off';
let stage: HTMLElement | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const f of listeners) f(); };
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const set = (next: IntroPhase) => { if (phase !== next) { phase = next; emit(); } };

/** Login baru saja berhasil: tutup layar. */
export const startIntro = (): void => { if (phase === 'off') set('cover'); };
/** Bola dunia sudah menggambar bingkai pertamanya. */
export const claimIntro = (): void => { if (phase === 'cover') set('globe'); };
/** Selesai, dilewati, atau gagal: tirai memudar. Aman dipanggil kapan saja dan berulang kali. */
export const finishIntro = (): void => { if (phase === 'cover' || phase === 'globe') set('leaving'); };
/** Tirai selesai memudar. */
export const endIntro = (): void => { set('off'); };

/** Elemen tempat bola dunia menempelkan canvas-nya; null selama tirai tidak ada. */
export const setIntroStage = (el: HTMLElement | null): void => { if (stage !== el) { stage = el; emit(); } };

export const useIntroPhase = (): IntroPhase => useSyncExternalStore(subscribe, () => phase);
export const useIntroStage = (): HTMLElement | null => useSyncExternalStore(subscribe, () => stage);

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
