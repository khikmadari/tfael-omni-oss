// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Cognitive Domain / BotRadar Workspace
// 4 inner tabs: Scrape Panel, BotRadar, Network Graph, Narrative Tracker
// ═══════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect } from 'react';
import { apiPost } from '@/api/client';
import { SubTabs } from '@/components/ui/Tabs/Tabs';
import { ScrapePanel } from '@/components/cognitive/ScrapePanel';
import { BotRadar } from '@/components/cognitive/BotRadar';
import { NetworkGraph } from '@/components/cognitive/NetworkGraph';
import { NarrativeTracker } from '@/components/cognitive/NarrativeTracker';

type CogTab = 'scrape' | 'botradar' | 'network' | 'narrative';

interface JobEntry { job_id: string; platform: string; query: string; accounts: number }

const LS_JOBS = 'cog_jobs_v1';
const LS_ACTIVE = 'cog_active_job_v1';

function loadJobs(): JobEntry[] {
  try {
    const raw = localStorage.getItem(LS_JOBS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveJobs(jobs: JobEntry[]) {
  try { localStorage.setItem(LS_JOBS, JSON.stringify(jobs)); } catch { /* ignore */ }
}

const INNER_TABS = [
  { id: 'scrape',    label: 'Scrape & Pipeline' },
  { id: 'botradar',  label: 'BotRadar' },
  { id: 'network',   label: 'Network Graph' },
  { id: 'narrative',  label: 'Narrative Intel' },
];

export default function CognitiveWorkspace() {
  const [tab, setTab] = useState<CogTab>('scrape');
  const [jobs, setJobs] = useState<JobEntry[]>(loadJobs);
  const [activeJobId, setActiveJobId] = useState<string | undefined>(() => {
    try { return localStorage.getItem(LS_ACTIVE) || undefined; } catch { return undefined; }
  });

  const handleJobComplete = useCallback((jobId: string, jobInfo: { platform: string; query: string; accounts: number }) => {
    setActiveJobId(jobId);
    try { localStorage.setItem(LS_ACTIVE, jobId); } catch { /* ignore */ }
    setJobs(prev => {
      const exists = prev.find(j => j.job_id === jobId);
      const next = exists ? prev : [{ job_id: jobId, ...jobInfo }, ...prev].slice(0, 20);
      saveJobs(next);
      return next;
    });
  }, []);

  const handleSelectJob = useCallback((jobId: string) => {
    setActiveJobId(jobId);
    try { localStorage.setItem(LS_ACTIVE, jobId); } catch { /* ignore */ }
  }, []);

  const handleClearHistory = useCallback(() => {
    setJobs([]);
    setActiveJobId(undefined);
    try {
      localStorage.removeItem(LS_JOBS);
      localStorage.removeItem(LS_ACTIVE);
    } catch { /* ignore */ }
  }, []);

  // Load job history from backend on mount (delayed to allow auth init)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await apiPost<{ ok: boolean; jobs: Array<{ job_id: string; platform: string; query: string; total_accounts: number }> }>('/api/v2/cognitive/jobs', {});
        if (res?.data?.ok && res.data.jobs?.length) {
          setJobs(prev => {
            // Backend jobs take priority (already filtered: best run per query with accounts > 0)
            const backendJobs: JobEntry[] = res.data.jobs.map((j: any) => ({
              job_id: j.job_id, platform: j.platform, query: j.query, accounts: j.total_accounts || 0,
            }));
            // Add localStorage jobs not covered by backend (different query)
            const backendQueries = new Set(backendJobs.map(j => j.query.toLowerCase()));
            const localOnly = prev.filter(j => !backendQueries.has(j.query.toLowerCase()));
            const merged = [...backendJobs, ...localOnly].slice(0, 20);
            saveJobs(merged);
            return merged;
          });
          setActiveJobId(prev => {
            if (prev) return prev;
            const first = res.data.jobs[0]?.job_id;
            if (first) { try { localStorage.setItem(LS_ACTIVE, first); } catch {} }
            return first;
          });
        }
      } catch { /* backend offline or auth not ready */ }
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Show filter bar on non-scrape tabs, always if jobs exist
  const showFilterBar = tab !== 'scrape';

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SubTabs
        tabs={INNER_TABS}
        active={tab}
        onChange={id => setTab(id as CogTab)}
      />

      {showFilterBar && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-background-panel border-b border-border-dim text-[11px] font-mono max-[768px]:flex-wrap">
          <span className="text-foreground-muted uppercase tracking-wider max-[768px]:whitespace-nowrap">Filter job:</span>
          <select
            value={activeJobId || ''}
            onChange={e => handleSelectJob(e.target.value)}
            disabled={jobs.length === 0}
            className="bg-background-deep border border-border-dim rounded-sm px-2 py-0.5 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary cursor-pointer disabled:opacity-40 disabled:cursor-default max-[768px]:flex-1 max-[768px]:min-w-0"
          >
            {jobs.length === 0
              ? <option value="">— Belum ada job, jalankan scraping dulu —</option>
              : jobs.map(j => (
                  <option key={j.job_id} value={j.job_id}>
                    {j.platform.toUpperCase()} · {j.query}{j.accounts ? ' · ' + j.accounts + ' akun' : ''}
                  </option>
                ))
            }
          </select>
          {activeJobId && (
            <span className="text-foreground-dim text-[10px] max-[768px]:hidden">
              ID: {activeJobId.slice(-8)}
            </span>
          )}
          <button
            className="ml-auto text-[10px] text-foreground-dim hover:text-red-400 font-mono underline"
            onClick={handleClearHistory}
            title="Hapus semua history job"
          >
            clear history
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {tab === 'scrape' && (
          <ScrapePanel onJobComplete={handleJobComplete} />
        )}

        {tab === 'botradar' && (
          <BotRadar jobId={activeJobId} />
        )}

        {tab === 'network' && (
          <NetworkGraph jobId={activeJobId} />
        )}

        {tab === 'narrative' && (
          <NarrativeTracker jobId={activeJobId} />
        )}
      </div>
    </div>
  );
}
