// Memastikan halaman SITREP tidak meminta apa pun ke luar asalnya sendiri, dan font termuat.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const { browser, page, logs } = await open({ scale: 2 });
const ext = [];
page.on('request', r => { if (!r.url().startsWith('http://localhost:8099') && !r.url().startsWith('data:')) ext.push(r.url()); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.sr');
await page.evaluate(() => document.fonts.ready);
await page.clock.runFor(800);
const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.family.includes('IBM Plex')).map(f => `${f.family} ${f.weight} ${f.status}`));
console.log('permintaan ke luar:', ext.length ? ext : 'tidak ada');
console.log('font:', fonts.join(' | '));
const m = await page.evaluate(() => {
  const el = document.querySelector('.sr-title'); const n = document.querySelector('.sr-num');
  return [getComputedStyle(el).fontFamily.split(',')[0], getComputedStyle(n).fontFamily.split(',')[0]];
});
console.log('font terpakai:', m.join(' / '));
await page.screenshot({ path: `${AKAR}/uji-sitrep/potret/final-default@2x.png` });
console.log(logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l)).join('\n') || '(konsol bersih)');
await browser.close();
