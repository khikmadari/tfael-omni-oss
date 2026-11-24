// Tangkapan layar SITREP dari build nyata. Pemakaian: node shot.mjs <nama> [--scenario x] [--w 1440] [--h 900] [--script file]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as fx from './fixture-real.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const require = createRequire(import.meta.url);
mkdirSync(`${AKAR}/uji-sitrep/potret`, { recursive: true });
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const name = process.argv[2] || 'default';
const W = Number(arg('w', 1440)), H = Number(arg('h', 900));
const scenario = arg('scenario', 'real');
const BASE = `http://localhost:${process.env.PORT || 8099}`;
const FONT = `${AKAR}/uji-sitrep/node_modules/@fontsource`;

// login: true = mulai dari layar login (tanpa token tersimpan); realClock: true = jam sungguhan (untuk mengukur kinerja)
export async function open({ w = W, h = H, scale = 1, sc = scenario, nowOffsetMin = 4, cctv = 'ok', peringatan = 'ok', wait = 'networkidle', login = false, realClock = false, reducedMotion = null, init = null } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  page.on('requestfailed', r => logs.push(`[gagal] ${r.url()} ${r.failure()?.errorText ?? ''}`));
  // Google Fonts tidak terjangkau dari sandbox: layani IBM Plex lokal supaya render = yang dilihat pengguna daring
  await page.route('https://fonts.googleapis.com/**', async r => {
    const faces = [];
    for (const [fam, pkg, weights] of [['IBM Plex Sans', 'ibm-plex-sans', [400, 500, 600]], ['IBM Plex Mono', 'ibm-plex-mono', [400, 500]]])
      for (const wgt of weights) faces.push(`@font-face{font-family:'${fam}';font-style:normal;font-weight:${wgt};font-display:block;src:url(https://fonts.gstatic.com/local/${pkg}-latin-${wgt}-normal.woff2) format('woff2')}`);
    await r.fulfill({ contentType: 'text/css', body: faces.join('\n') });
  });
  await page.route('https://fonts.gstatic.com/local/**', async r => {
    const f = r.request().url().split('/').pop();
    const pkg = f.startsWith('ibm-plex-sans') ? 'ibm-plex-sans' : 'ibm-plex-mono';
    await r.fulfill({ contentType: 'font/woff2', body: await readFile(`${FONT}/${pkg}/files/${f}`) });
  });
  if (reducedMotion) await page.emulateMedia({ reducedMotion });
  if (!realClock) await page.clock.install({ time: new Date(fx.capturedAt + nowOffsetMin * 60_000) });
  if (!login) await page.addInitScript(() => localStorage.setItem('tfael_token', 'harness'));
  if (init) await page.addInitScript(init);
  await fetch(`${BASE}/__scenario?name=${sc}&cctv=${cctv}&peringatan=${peringatan}`);
  await page.goto(BASE, { waitUntil: wait });
  await page.waitForSelector(login ? 'form input[type="password"]' : '.sr', { timeout: 15000 });
  await page.waitForTimeout(login ? 200 : 600);
  await page.evaluate(() => document.fonts.ready);
  if (!realClock && !login) await page.clock.runFor(700);
  return { browser, page, logs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { browser, page, logs } = await open();
  const script = arg('script', null);
  if (script) { const mod = await import(script.startsWith('/') ? script : `./${script}`); await mod.default(page); }
  await page.screenshot({ path: `${AKAR}/uji-sitrep/potret/${name}.png` });
  console.log(`shot: ${AKAR}/uji-sitrep/potret/${name}.png`);
  console.log(logs.length ? logs.join('\n') : '(konsol bersih)');
  await browser.close();
}
