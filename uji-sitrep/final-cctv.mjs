// Tangkapan @2x lapisan CCTV dari build final. Gambar kamera di sini gambar uji, bukan rekaman.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const { browser, page, logs } = await open({ scale: 2 });
const g = await page.locator('.sr-camg rect').boundingBox();
await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
await page.clock.runFor(900);
const c = await page.locator('rect.sr-cam').nth(3).boundingBox();
const got = page.waitForResponse(r => r.url().includes('/vision/cctv-detect'));
await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
await got; await page.waitForTimeout(200);
await page.mouse.move(150, 770);
await page.waitForTimeout(100);
await page.screenshot({ path: `${AKAR}/uji-sitrep/potret/sitrep-cctv.png` });
console.log(logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l)).join('\n') || '(konsol bersih)');
await browser.close();
