// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Top Bar (Tailwind migration)
// Brand block + workspace tabs + status cluster (UTC, sync, user)
//
// Ponsel (≤768px): bilah ini menjadi "app bar" bergaya aplikasi Android —
// ikon aplikasi, judul ruang kerja yang sedang dibuka, dan jumlah unit.
// Tab ruang kerja pindah ke navigasi bawah (MobileNav), dan tombol keluar
// pindah ke lembar "Lainnya". Di atas 768px tata letaknya tidak berubah.
// ═══════════════════════════════════════════════════════════════════════

import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/icons/Icon';
import { cn } from '@/lib/utils';
import { WORKSPACES } from './workspaces';

export function TopBar() {
  const { workspace, setWorkspace, overview, utcTime } = useApp();
  const { user, role, hasPerm, logout } = useAuth();

  const unitCount = overview?.units?.length ?? 0;
  const alertCount = overview?.alerts?.length ?? 0;
  const current = WORKSPACES.find(ws => ws.id === workspace);

  return (
    <header className="flex items-center gap-3 h-12 px-3 bg-background-panel border-b border-border-dim shrink-0 z-[100] max-[768px]:h-14 max-[768px]:gap-2.5">
      {/* ── Brand Block ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mr-2 max-[768px]:mr-0">
        <div className="w-8 h-8 flex items-center justify-center bg-background-deep border border-border-dim rounded-sm max-[768px]:w-9 max-[768px]:h-9 max-[768px]:rounded-lg">
          <Icon name="satellite" size={20} color="#8c9663" />
        </div>
        <div className="flex items-baseline gap-1 max-[900px]:hidden">
          <span className="font-mono text-base font-extrabold text-primary tracking-widest">TFAEL</span>
          <span className="font-mono text-2xs font-bold text-foreground-muted tracking-widest opacity-50">OMNI</span>
        </div>
      </div>

      {/* ── Judul layar (hanya ponsel) ──────────────────────────── */}
      <div className="hidden max-[768px]:flex flex-1 min-w-0 flex-col justify-center leading-tight">
        <span className="font-mono text-[10px] font-bold text-foreground-muted tracking-[0.18em]">TFAEL-OMNI</span>
        <span className="font-mono text-[15px] font-extrabold text-primary tracking-wide truncate">{current?.label ?? ''}</span>
      </div>

      {/* ── Workspace Tabs (desktop; di ponsel digantikan navigasi bawah) ── */}
      <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide max-[768px]:hidden">
        {WORKSPACES.map(ws => {
          if (ws.perm && !hasPerm(ws.perm as never)) return null;
          const isActive = workspace === ws.id;
          return (
            <button
              key={ws.id}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap transition-colors',
                isActive
                  ? 'text-primary bg-background-card after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-primary after:rounded-sm'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-card'
              )}
              onClick={() => setWorkspace(ws.id)}
              title={ws.label}
            >
              <Icon name={ws.icon} size={15} />
              <span className="max-[900px]:hidden">{ws.label}</span>
              {ws.id === 'siem' && alertCount > 0 && (
                <span className="bg-destructive text-white text-[9px] font-bold px-1.5 py-px rounded-lg min-w-[16px] text-center animate-pulse-red">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Status Cluster ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 ml-auto max-[900px]:gap-1">
        {/* UTC clock */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-background-card border border-border-dim font-mono text-[11px] max-[768px]:hidden">
          <span className="text-foreground-muted text-2xs uppercase">UTC</span>
          <span className="text-foreground font-semibold">{utcTime}</span>
        </div>

        {/* Unit count */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-background-card border border-border-dim font-mono text-[11px] max-[768px]:rounded-full max-[768px]:px-3 max-[768px]:py-1.5">
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            unitCount > 0 ? 'bg-accent-olive' : 'bg-secondary'
          )} />
          <span className="text-foreground-muted text-2xs uppercase">UNITS</span>
          <span className="text-foreground font-semibold">{unitCount}</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] text-foreground-muted max-[900px]:hidden">
          <Icon name="user" size={14} />
          <span className="text-foreground font-semibold">{user ?? '—'}</span>
          <span className="text-2xs opacity-50 uppercase">{role ?? ''}</span>
        </div>

        {/* Logout (di ponsel ada di lembar "Lainnya") */}
        <button
          className="p-1 rounded-sm text-foreground-muted hover:text-destructive hover:bg-destructive/10 transition-colors max-[768px]:hidden"
          onClick={logout}
          title="Logout"
        >
          <Icon name="logout" size={16} />
        </button>
      </div>
    </header>
  );
}
