// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Daftar ruang kerja (dipakai bilah atas desktop dan navigasi bawah ponsel)
// ═══════════════════════════════════════════════════════════════════════

import type { WorkspaceId } from '@/context/AppContext';
import type { IconName } from '@/components/icons/Icon';

export interface WorkspaceTab {
  id: WorkspaceId;
  label: string;
  /** label ringkas untuk navigasi bawah di ponsel */
  short: string;
  icon: IconName;
  perm?: string;
}

export const WORKSPACES: WorkspaceTab[] = [
  { id: 'sitrep',       label: 'SITREP',          short: 'SITREP', icon: 'globe' },
  { id: 'c4isr',        label: 'C4ISR',           short: 'C4ISR',  icon: 'satellite' },
  { id: 'osint',        label: 'OSINT Profiler',  short: 'OSINT',  icon: 'search' },
  { id: 'siem',         label: 'SIEM',            short: 'SIEM',   icon: 'shield',   perm: 'view_siem' },
  { id: 'dfir',         label: 'DFIR',            short: 'DFIR',   icon: 'flask' },
  { id: 'intelligence', label: 'Intel Graph',     short: 'Intel',  icon: 'graph' },
  { id: 'cognitive',    label: 'BotRadar',        short: 'Bot',    icon: 'bug' },
  { id: 'admin',        label: 'Admin',           short: 'Admin',  icon: 'settings', perm: 'manage_users' },
];
