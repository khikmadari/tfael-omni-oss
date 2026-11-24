// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — App Shell (Tailwind migration)
// Routes: Login → TopBar + Workspace + StatusBar
// ═══════════════════════════════════════════════════════════════════════

import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { IntroCover } from '@/components/intro/IntroCover';
import { endIntro, prefersReducedMotion, startIntro, useIntroPhase } from '@/components/intro/introStore';
import { TopBar } from '@/components/layout/TopBar';
import { ClassificationBanner } from '@/components/layout/ClassificationBanner';
import { StatusBar } from '@/components/layout/StatusBar';
import { MobileNav } from '@/components/layout/MobileNav';
import { LoginScreen } from '@/components/layout/LoginScreen';
import { ToastContainer } from '@/components/ui/Toast/ToastContainer';

// ── Lazy-loaded workspaces ────────────────────────────────────────────
const SitrepWorkspace       = lazy(() => import('@/workspaces/SitrepWorkspace'));
const C4ISRWorkspace        = lazy(() => import('@/workspaces/C4ISRWorkspace'));
const OsintWorkspace        = lazy(() => import('@/workspaces/OsintWorkspace'));
const SiemWorkspace         = lazy(() => import('@/workspaces/SiemWorkspace'));
const DfirWorkspace         = lazy(() => import('@/workspaces/DfirWorkspace'));
const IntelligenceWorkspace = lazy(() => import('@/workspaces/IntelligenceWorkspace'));
const CognitiveWorkspace    = lazy(() => import('@/workspaces/CognitiveWorkspace'));
const AdminWorkspace        = lazy(() => import('@/workspaces/AdminWorkspace'));

function WorkspaceLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 min-h-[200px] h-full bg-background-deep text-foreground-muted font-mono text-xs">
      <div className="w-6 h-6 border-2 border-border-dim border-t-primary rounded-full animate-spin" />
      <span>Memuat modul...</span>
    </div>
  );
}

function WorkspaceRouter() {
  const { workspace } = useApp();

  return (
    <Suspense fallback={<WorkspaceLoader />}>
      {workspace === 'sitrep'       && <SitrepWorkspace />}
      {workspace === 'c4isr'        && <C4ISRWorkspace />}
      {workspace === 'osint'        && <OsintWorkspace />}
      {workspace === 'siem'         && <SiemWorkspace />}
      {workspace === 'dfir'         && <DfirWorkspace />}
      {workspace === 'intelligence' && <IntelligenceWorkspace />}
      {workspace === 'cognitive'    && <CognitiveWorkspace />}
      {workspace === 'admin'        && <AdminWorkspace />}
    </Suspense>
  );
}

export default function App() {
  const { token, ready } = useAuth();
  const { workspace } = useApp();
  const introOn = useIntroPhase() !== 'off';

  // ── Animasi pembuka: hanya tepat setelah login berhasil (dari layar login ke bertoken), tidak saat sesi
  //    lama dipulihkan ketika halaman dimuat ulang. Tujuannya peta SITREP, jadi hanya bila SITREP yang terbuka.
  //    Layout effect: tirai sudah menutup sebelum cangkang sempat tergambar.
  const before = useRef({ ready: false, token: null as string | null });
  useLayoutEffect(() => {
    const was = before.current;
    before.current = { ready, token };
    // sesi berakhir di tengah animasi: tirainya ikut dibuang, supaya login berikutnya mulai dari awal
    if (!token) endIntro();
    else if (was.ready && !was.token && workspace === 'sitrep' && !prefersReducedMotion()) startIntro();
  }, [ready, token, workspace]);

  // ── Wait for session restoration ──────────────────────────────────
  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 min-h-screen bg-background-deep text-foreground-muted font-mono text-xs">
        <div className="w-6 h-6 border-2 border-border-dim border-t-primary rounded-full animate-spin" />
        <span>Initializing secure session...</span>
      </div>
    );
  }

  // ── Not authenticated → Login ─────────────────────────────────────
  if (!token) {
    return <LoginScreen />;
  }

  // ── Authenticated → Main Shell ────────────────────────────────────
  return (
    <>
      {/* selagi tirai menutup, cangkang di bawahnya tidak menerima fokus atau klik */}
      {/* ponsel: tinggi mengikuti area tampak yang sebenarnya (100dvh), supaya navigasi bawah tidak tertutup bilah peramban */}
      <div className="flex flex-col h-screen overflow-hidden bg-background-deep max-[768px]:h-dvh" inert={introOn}>
        <ClassificationBanner />
        <TopBar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <WorkspaceRouter />
        </main>
        {/* desktop: bilah status; ponsel: navigasi bawah (masing-masing menyembunyikan diri di luar ukurannya) */}
        <StatusBar />
        <MobileNav />
        <ToastContainer />
      </div>
      <IntroCover />
    </>
  );
}
