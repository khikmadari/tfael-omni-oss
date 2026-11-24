// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — animasi pembuka setelah login · tirai
//
// Menutup seluruh layar begitu login berhasil, sebelum cangkang aplikasi sempat terlihat. Bola dunianya
// digambar modul SITREP (components/sitrep/GlobeIntro) di dalam "panggung" tirai ini. Pita klasifikasi dan
// merek diletakkan persis di tempat yang sama dengan pita dan TopBar aplikasi, sehingga saat tirai memudar
// keduanya tidak bergeser. Tirai tidak pernah menahan aplikasi: bisa dilewati kapan saja, dan membuka
// sendiri bila bola dunianya tidak kunjung datang.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/icons/Icon';
import { ClassificationBanner } from '@/components/layout/ClassificationBanner';
import { endIntro, finishIntro, setIntroStage, useIntroPhase } from './introStore';
import './intro.css';

/** Bola dunia belum menggambar selama ini → tirai membuka (modul SITREP gagal dimuat, atau bukan SITREP yang terbuka). */
const NO_GLOBE_MS = 2500;
/** Batas keras: apa pun yang terjadi, tirai tidak menutup lebih lama dari ini. */
const HARD_CAP_MS = 9000;
/** Sama dengan lama transisi opacity .intro di intro.css. */
const FADE_MS = 600;

export function IntroCover() {
  const phase = useIntroPhase();
  const skipRef = useRef<HTMLButtonElement>(null);
  const on = phase !== 'off';

  useEffect(() => {
    if (phase !== 'cover') return;
    const id = setTimeout(finishIntro, NO_GLOBE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (!on) return;
    skipRef.current?.focus();
    const id = setTimeout(finishIntro, HARD_CAP_MS);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finishIntro(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [on]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const id = setTimeout(endIntro, FADE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (!on) return null;

  return (
    <div
      className={`intro${phase === 'leaving' ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Animasi pembuka"
      onClick={finishIntro}
    >
      <div ref={setIntroStage} className="intro-stage" />
      <div className="intro-top">
        <ClassificationBanner />
        {/* susunan dan kelasnya sama dengan blok merek di TopBar */}
        <div className="flex items-center gap-3 h-12 px-3">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-8 h-8 flex items-center justify-center bg-background-deep border border-border-dim rounded-sm">
              <Icon name="satellite" size={20} color="#8c9663" />
            </div>
            <div className="flex items-baseline gap-1 max-[900px]:hidden">
              <span className="font-mono text-base font-extrabold text-primary tracking-widest">TFAEL</span>
              <span className="font-mono text-2xs font-bold text-foreground-muted tracking-widest opacity-50">OMNI</span>
            </div>
          </div>
        </div>
      </div>
      <button ref={skipRef} type="button" className="intro-skip" onClick={finishIntro}>
        Lewati <kbd>Esc</kbd>
      </button>
    </div>
  );
}
