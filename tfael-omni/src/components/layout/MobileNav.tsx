// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Navigasi bawah (khusus ponsel, ≤768px)
//
// Mengikuti pola aplikasi Android: empat tujuan utama + "Lainnya". Tujuan
// yang aktif ditandai pil di belakang ikonnya. "Lainnya" membuka lembar dari
// bawah berisi modul sisanya, identitas pengguna, dan tombol keluar.
// Di atas 768px komponen ini tidak tampil sama sekali.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useApp, type WorkspaceId } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/icons/Icon';
import { cn } from '@/lib/utils';
import { WORKSPACES } from './workspaces';

/** jumlah tujuan yang tampil langsung di bilah; sisanya masuk "Lainnya" */
const PRIMARY_COUNT = 4;

function MoreGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="6" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" />
      <circle cx="6" cy="18" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

const itemBase = 'relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1 select-none font-mono text-[11px] font-semibold tracking-wide transition-colors active:bg-background-card';
const pillBase = 'flex h-8 w-16 items-center justify-center rounded-full transition-colors';

export function MobileNav() {
  const { workspace, setWorkspace, overview } = useApp();
  const { user, role, hasPerm, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const allowed = WORKSPACES.filter(ws => !ws.perm || hasPerm(ws.perm as never));
  const primary = allowed.slice(0, PRIMARY_COUNT);
  const more = allowed.slice(PRIMARY_COUNT);
  const moreActive = more.some(ws => ws.id === workspace);
  const alertCount = overview?.alerts?.length ?? 0;

  // lembar ditutup dengan Escape (papan ketik fisik / tombol kembali pada sebagian peramban)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: WorkspaceId) => { setWorkspace(id); setOpen(false); };

  return (
    <>
      <nav
        className="hidden max-[768px]:flex shrink-0 items-stretch h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-background-panel border-t border-border-dim z-[100]"
        aria-label="Navigasi utama"
      >
        {primary.map(ws => {
          const active = workspace === ws.id;
          return (
            <button
              key={ws.id}
              type="button"
              className={cn(itemBase, active ? 'text-primary' : 'text-foreground-muted')}
              onClick={() => go(ws.id)}
              aria-current={active ? 'page' : undefined}
              aria-label={ws.label}
            >
              <span className={cn(pillBase, active && 'bg-primary/20')}>
                <Icon name={ws.icon} size={20} />
              </span>
              <span className="leading-none">{ws.short}</span>
              {ws.id === 'siem' && alertCount > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2.5 min-w-[16px] rounded-full bg-destructive px-1 text-center text-[9px] font-bold leading-4 text-white">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </button>
          );
        })}

        {more.length > 0 && (
          <button
            type="button"
            className={cn(itemBase, moreActive || open ? 'text-primary' : 'text-foreground-muted')}
            onClick={() => setOpen(o => !o)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Modul lainnya"
          >
            <span className={cn(pillBase, (moreActive || open) && 'bg-primary/20')}>
              <MoreGlyph />
            </span>
            <span className="leading-none">Lainnya</span>
          </button>
        )}
      </nav>

      {open && (
        <div className="hidden max-[768px]:block fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-label="Modul lainnya">
          {/* tirai: ketuk di luar lembar untuk menutup */}
          <button type="button" className="absolute inset-0 w-full bg-black/60" aria-label="Tutup" onClick={() => setOpen(false)} />

          <div className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-2xl border-t border-border-dim bg-background-panel px-2 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.55)]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-foreground-muted/40" />
            <div className="px-3 pb-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-foreground-muted">Modul lainnya</div>

            <ul>
              {more.map(ws => {
                const active = workspace === ws.id;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors active:bg-background-card',
                        active ? 'bg-primary/10 text-primary' : 'text-foreground'
                      )}
                      onClick={() => go(ws.id)}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full border border-border-dim bg-background-deep', active && 'border-primary/50')}>
                        <Icon name={ws.icon} size={20} />
                      </span>
                      <span className="flex-1 font-mono text-sm font-semibold tracking-wide">{ws.label}</span>
                      <span className="text-foreground-muted"><Chevron /></span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mx-3 my-2 h-px bg-border-dim" />

            <div className="flex items-center gap-3 px-3 py-1.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-dim bg-background-deep text-foreground-muted">
                <Icon name="user" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{user ?? '—'}</div>
                <div className="font-mono text-[11px] uppercase tracking-wide text-foreground-muted">{role ?? ''}</div>
              </div>
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-full border border-destructive/50 px-4 font-mono text-xs font-bold uppercase tracking-wide text-destructive transition-colors active:bg-destructive/10"
                onClick={() => { setOpen(false); void logout(); }}
              >
                <Icon name="logout" size={16} />
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
