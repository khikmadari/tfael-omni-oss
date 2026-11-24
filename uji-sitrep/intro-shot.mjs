// Tangkapan tiap tahap animasi pembuka (jam palsu). Login tiruan mesin uji, bukan akun sungguhan.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const OUT = `${AKAR}/uji-sitrep/potret`;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const w = Number(arg('w', 1440)), h = Number(arg('h', 900)), scale = Number(arg('scale', 1));
const tag = arg('tag', '');
const { browser, page, logs } = await open({ w, h, scale, login: true });
await page.getByPlaceholder('operator').fill('uji');
await page.locator('input[type="password"]').fill('uji');
// jam dihentikan: animasi hanya maju lewat runFor, jadi tiap tangkapan tepat pada waktunya
await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 50));
await page.getByRole('button', { name: /AUTHENTICATE/ }).click();
await page.locator('.intro').waitFor({ timeout: 5000 });
// React menahan tampilnya isi Suspense beberapa ratus ms (lewat timer), jadi jam dimajukan sedikit demi sedikit
let lead = 0;
for (; lead < 3000 && await page.locator('.intro-stage canvas').count() === 0; lead += 40) { await page.clock.runFor(40); await page.waitForTimeout(30); }
console.log(`bola dunia mulai ${lead} ms setelah login`);
await page.waitForTimeout(300);
let at = 0;
const times = arg('times', '60,500,1200,2000,2700,3200,3600,3900,4150,4380').split(',').map(Number);
for (const t of times) {
  await page.clock.runFor(t - at); at = t;
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/intro${tag}-${String(t).padStart(4, '0')}.png` });
  console.log(`  ${t} ms: keterangan negara terbaca ${await page.locator('.intro-stage canvas').getAttribute('data-negara')}, bentuk ${await page.locator('.intro-stage canvas').getAttribute('data-bentuk')}`);
}
await page.clock.runFor(200); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/intro${tag}-pudar.png` });
await page.clock.runFor(800); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/intro${tag}-akhir.png` });
console.log('tirai tersisa:', await page.locator('.intro').count());
console.log(logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l)).join('\n') || '(konsol bersih)');
await browser.close();
