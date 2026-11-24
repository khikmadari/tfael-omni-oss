// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Social Media Scrape Control Panel
// Launch scraping jobs, run full pipeline, monitor progress
// ═══════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { cogScrape, cogFullPipeline, cogSeedDemo, cogTwitterCookieTest } from '@/api/endpoints';
import { Icon } from '@/components/icons/Icon';
import { cn } from '@/lib/utils';

interface Props {
  onJobComplete?: (jobId: string, jobInfo: { platform: string; query: string; accounts: number }) => void;
}

export function ScrapePanel({ onJobComplete }: Props) {
  const [platform, setPlatform] = useState<'twitter' | 'telegram'>('twitter');
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('');
  const [maxPosts, setMaxPosts] = useState(200);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<'scrape' | 'full'>('full');
  const [scrapeMode, setScrapeMode] = useState<'mention_search' | 'user_timeline'>('mention_search');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [cookieTest, setCookieTest] = useState<{ status: string; detail: string; ok: boolean } | null>(null);
  const [testingCookie, setTestingCookie] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setError('');
    setResult(null);

    try {
      let res: any;
      if (mode === 'full') {
        res = await cogFullPipeline({
          platform,
          query: platform === 'twitter' ? query : '',
          channel: platform === 'telegram' ? channel : '',
          max_posts: maxPosts,
          scrape_mode: platform === 'twitter' ? scrapeMode : 'mention_search',
        });
      } else {
        res = await cogScrape({
          platform,
          query: platform === 'twitter' ? query : undefined,
          channel: platform === 'telegram' ? channel : undefined,
          max_posts: maxPosts,
          scrape_mode: platform === 'twitter' ? scrapeMode : 'mention_search',
        });
      }

      if (res?.ok) {
        setResult(res);
        onJobComplete?.(res.job_id, { platform, query: query || channel, accounts: res.summary?.accounts || res.summary?.total_accounts || 0 });
      } else {
        setError(res?.error || 'Gagal menjalankan operasi.');
      }
    } catch (e: any) {
      setError(e.message || 'Network error.');
    }
    setRunning(false);
  };

  const canRun = platform === 'twitter' ? query.trim().length > 0 : channel.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Config Panel ─────────────────────────────── */}
        <div className="bg-background-card border border-border-dim rounded-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-dim bg-background-panel">
            <Icon name="broadcast" size={14} className="text-primary" />
            <span className="font-mono text-xs font-bold uppercase tracking-wide text-foreground">
              Konfigurasi Scraping
            </span>
          </div>

          <div className="p-3 space-y-3">
            {/* Mode */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">Mode</label>
              <div className="flex gap-1">
                {[
                  { id: 'full', label: 'Full Pipeline', desc: 'Scrape + Bot Detection + CIB + Graph + Hoax' },
                  { id: 'scrape', label: 'Scrape Only', desc: 'Kumpulkan data saja' },
                ].map(m => (
                  <button
                    key={m.id}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-sm font-mono text-[10px] border transition-colors',
                      mode === m.id
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-background-deep border-border-dim text-foreground-muted hover:bg-background-panel'
                    )}
                    onClick={() => setMode(m.id as any)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">Platform</label>
              <div className="flex gap-1">
                {[
                  { id: 'twitter', label: 'Twitter / X', icon: '𝕏' },
                  { id: 'telegram', label: 'Telegram', icon: '✈' },
                ].map(p => (
                  <button
                    key={p.id}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded-sm font-mono text-[10px] border transition-colors',
                      platform === p.id
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-background-deep border-border-dim text-foreground-muted hover:bg-background-panel'
                    )}
                    onClick={() => setPlatform(p.id as any)}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>


            {/* Metode (Twitter only) */}
            {platform === 'twitter' && (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">Metode</label>
                <div className="flex gap-1">
                  {[
                    { id: 'mention_search', label: 'Mention Search', desc: 'Tweet yang menyebut target' },
                    { id: 'user_timeline', label: 'User Timeline', desc: 'Tweet milik akun target' },
                  ].map(m => (
                    <button
                      key={m.id}
                      title={m.desc}
                      className={cn(
                        'flex-1 px-2 py-1.5 rounded-sm font-mono text-[10px] border transition-colors',
                        scrapeMode === m.id
                          ? 'bg-primary/20 border-primary/50 text-primary'
                          : 'bg-background-deep border-border-dim text-foreground-muted hover:bg-background-panel'
                      )}
                      onClick={() => setScrapeMode(m.id as any)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] font-mono text-foreground-muted/70 leading-snug">
                  {scrapeMode === 'mention_search'
                    ? 'Kumpulkan tweet yang menyebut kata kunci — cocok untuk mapping jaringan & buzzer.'
                    : 'Ambil tweet asli dari akun publik — cocok untuk analisis narasi tokoh.'}
                </div>
              </div>
            )}

            {/* Query / Channel */}
            {platform === 'twitter' ? (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">
                  Kata Kunci Pencarian
                </label>
                <input
                  className="w-full px-2 py-1.5 bg-background-deep border border-border-dim rounded-sm font-mono text-xs text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                  placeholder={scrapeMode === 'user_timeline' ? 'Username target (tanpa @)' : 'Contoh: #TNI operasi militer 2026'}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />

                {/* Cookie self-test */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded-sm font-mono text-[10px] border transition-colors',
                      testingCookie
                        ? 'bg-background-deep text-foreground-muted cursor-not-allowed border-border-dim'
                        : 'bg-background-deep border-border-dim text-foreground-muted hover:bg-background-panel'
                    )}
                    disabled={testingCookie}
                    onClick={async () => {
                      setTestingCookie(true);
                      setCookieTest(null);
                      try {
                        const res = await cogTwitterCookieTest();
                        setCookieTest({ status: res.status, detail: res.detail, ok: !!res.ok });
                      } catch (e: any) {
                        setCookieTest({ status: 'ERROR', detail: e.message || 'Network error.', ok: false });
                      }
                      setTestingCookie(false);
                    }}
                  >
                    {testingCookie ? (
                      <div className="w-3 h-3 border border-foreground-muted/30 border-t-foreground-muted rounded-full animate-spin" />
                    ) : (
                      <Icon name="shield" size={11} />
                    )}
                    Test Cookie Twitter
                  </button>
                  {cookieTest && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border',
                      cookieTest.ok
                        ? 'bg-green-900/30 text-green-400 border-green-700/40'
                        : 'bg-red-900/30 text-red-400 border-red-700/40'
                    )}>
                      {cookieTest.status}
                    </span>
                  )}
                </div>
                {cookieTest && (
                  <div className={cn(
                    'text-[10px] font-mono leading-snug',
                    cookieTest.ok ? 'text-green-400/80' : 'text-foreground-muted'
                  )}>
                    {cookieTest.detail}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">
                  Nama Channel
                </label>
                <input
                  className="w-full px-2 py-1.5 bg-background-deep border border-border-dim rounded-sm font-mono text-xs text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                  placeholder="Contoh: detikcom (tanpa @)"
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                />
              </div>
            )}

            {/* Max Posts */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-foreground-muted uppercase tracking-wider">
                  Max Postingan: {maxPosts}
                </label>
                <span className={cn(
                  'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border',
                  maxPosts <= 150
                    ? 'bg-green-900/30 text-green-400 border-green-700/40'
                    : maxPosts <= 300
                      ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40'
                      : 'bg-red-900/30 text-red-400 border-red-700/40'
                )}>
                  {maxPosts <= 150 ? 'AMAN' : maxPosts <= 300 ? 'SEDANG' : 'RISIKO TINGGI'}
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={500}
                step={50}
                value={maxPosts}
                onChange={e => setMaxPosts(Number(e.target.value))}
                className="w-full accent-primary"
              />
              {maxPosts > 300 && (
                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-900/20 border border-red-700/30 rounded-sm">
                  <span className="text-red-400 text-[10px] leading-none mt-0.5">⚠</span>
                  <span className="text-[10px] font-mono text-red-400 leading-snug">
                    {maxPosts} post = {Math.ceil(maxPosts / 20)} req GraphQL. Risiko rate-limit & soft-ban akun naik signifikan. Gunakan hanya untuk deep dive sesekali.
                  </span>
                </div>
              )}
              {maxPosts > 150 && maxPosts <= 300 && (
                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-yellow-900/20 border border-yellow-700/30 rounded-sm">
                  <span className="text-yellow-400 text-[10px] leading-none mt-0.5">⚠</span>
                  <span className="text-[10px] font-mono text-yellow-400 leading-snug">
                    {maxPosts} post = {Math.ceil(maxPosts / 20)} req GraphQL. Jeda antar job disarankan minimal 5 menit.
                  </span>
                </div>
              )}
              {maxPosts <= 150 && (
                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-green-900/20 border border-green-700/30 rounded-sm">
                  <span className="text-green-400 text-[10px] leading-none mt-0.5">✓</span>
                  <span className="text-[10px] font-mono text-green-400 leading-snug">
                    Aman untuk penggunaan rutin. Cukup untuk bot detection & CIB analysis.
                  </span>
                </div>
              )}
            </div>

            {/* Run Button */}
            <button
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-sm font-mono text-xs font-bold uppercase tracking-wide transition-colors',
                canRun && !running
                  ? 'bg-primary text-background-deep hover:bg-primary/80'
                  : 'bg-background-deep text-foreground-muted cursor-not-allowed'
              )}
              onClick={handleRun}
              disabled={!canRun || running}
            >
              {running ? (
                <>
                  <div className="w-4 h-4 border-2 border-background-deep/30 border-t-background-deep rounded-full animate-spin" />
                  {mode === 'full' ? 'Menjalankan Full Pipeline...' : 'Scraping...'}
                </>
              ) : (
                <>
                  <Icon name="play" size={14} />
                  {mode === 'full' ? 'Jalankan Full Pipeline' : 'Mulai Scraping'}
                </>
              )}
            </button>

            {error && (
              <div className="px-2 py-1.5 bg-red-900/20 border border-red-700/30 rounded-sm text-red-400 text-[10px] font-mono">
                {error}
              </div>
            )}

            {/* Demo Data — fallback when scraping sources are dead */}
            <div className="border-t border-border-dim pt-3 mt-1">
              <div className="text-[10px] font-mono text-foreground-muted mb-1.5 uppercase tracking-wider">
                Atau gunakan data demo
              </div>
              <button
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-sm font-mono text-[10px] border transition-colors',
                  running
                    ? 'bg-background-deep text-foreground-muted cursor-not-allowed border-border-dim'
                    : 'bg-cyan-900/20 border-cyan-700/30 text-cyan-400 hover:bg-cyan-900/40'
                )}
                disabled={running}
                onClick={async () => {
                  setRunning(true);
                  setError('');
                  setResult(null);
                  try {
                    const res = await cogSeedDemo({ force: true });
                    if (res?.ok && res?.seeded) {
                      setResult({
                        ok: true,
                        job_id: res.job_id,
                        summary: { accounts: res.accounts, posts: res.posts, mode: 'demo_seed' },
                      });
                      onJobComplete?.(res.job_id || 'demo', { platform, query: query || channel, accounts: res.accounts || 0 });
                    } else if (res?.ok && !res?.seeded) {
                      setError(res?.reason || 'Demo data sudah ada. Gunakan force=true.');
                    } else {
                      setError(res?.error || 'Gagal load demo data.');
                    }
                  } catch (e: any) {
                    setError(e.message || 'Network error.');
                  }
                  setRunning(false);
                }}
              >
                <Icon name="database" size={12} />
                Load Demo Data (Bot + CIB + Narrative)
              </button>
            </div>
          </div>
        </div>

        {/* ── Results Panel ─────────────────────────────── */}
        <div className="bg-background-card border border-border-dim rounded-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-dim bg-background-panel">
            <Icon name="chart" size={14} className="text-primary" />
            <span className="font-mono text-xs font-bold uppercase tracking-wide text-foreground">
              Hasil Operasi
            </span>
          </div>

          <div className="p-3">
            {result ? (
              <div className="space-y-2 font-mono text-xs">
                {result.job_id && (
                  <div className="flex justify-between">
                    <span className="text-foreground-muted">Job ID:</span>
                    <span className="text-primary font-bold">{result.job_id}</span>
                  </div>
                )}

                {/* Full Pipeline Stages */}
                {result.pipeline_stages && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider mb-1">
                      Pipeline Stages
                    </div>
                    {Object.entries(result.pipeline_stages).map(([stage, data]: [string, any]) => (
                      <div key={stage} className="flex items-center gap-2 px-2 py-1 bg-background-deep rounded-sm">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          data.status === 'OK' ? 'bg-green-500' : data.status === 'SKIPPED' ? 'bg-yellow-500' : 'bg-red-500'
                        )} />
                        <span className="flex-1 text-foreground-muted text-[10px]">{stage}</span>
                        <span className="text-foreground text-[10px]">{data.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                {result.summary && (
                  <div className="space-y-1 mt-2 p-2 bg-background-deep rounded-sm">
                    <div className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Ringkasan</div>
                    {Object.entries(result.summary).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[10px]">
                        <span className="text-foreground-muted">{k.replace(/_/g, ' ')}:</span>
                        <span className="text-foreground font-bold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Scrape-only results */}
                {result.posts_collected !== undefined && !result.pipeline_stages && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">Posts:</span>
                      <span className="text-foreground">{result.posts_collected}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-foreground-muted">Accounts:</span>
                      <span className="text-foreground">{result.accounts_found}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-foreground-muted text-xs font-mono">
                <Icon name="globe" size={24} />
                <span>Belum ada operasi dijalankan.</span>
                <span className="text-[10px] text-center">
                  Pilih platform, masukkan kata kunci,
                  <br />lalu tekan tombol untuk memulai.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

