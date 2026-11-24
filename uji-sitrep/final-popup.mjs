// Tangkapan @2x popup kamera dari build final. Gambar kamera di sini gambar uji buatan, bukan rekaman.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const OUT = `${AKAR}/uji-sitrep/potret`;
const { browser, page, logs } = await open({ scale: 2 });
await page.locator('#sr-tab-cctv').click();
const got = page.waitForResponse(r => r.url().includes('/vision/cctv-detect'));
await page.locator('#sr-panel-cctv').getByRole('button', { name: /Cikupa Mas/ }).click();
await page.clock.runFor(900); await got;
await page.locator('.sr-pop').waitFor();
await page.waitForTimeout(250);
await page.mouse.move(150, 770);
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/sitrep-popup-cctv.png` });
const hit = page.waitForResponse(r => r.url().endsWith('/vision/detect'));
await page.locator('.sr-pop-actions').getByRole('button', { name: /Deteksi objek/ }).click();
await hit; await page.waitForTimeout(250);
await page.mouse.move(150, 770);
await page.screenshot({ path: `${OUT}/sitrep-popup-cctv-deteksi.png` });
console.log(logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l)).join('\n') || '(konsol bersih)');
await browser.close();
