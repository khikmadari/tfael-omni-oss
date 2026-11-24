// Tangkapan cepat untuk menilai tampilan popup kamera.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const OUT = `${AKAR}/uji-sitrep/potret`;
const frameLoaded = page => page.waitForResponse(r => r.url().includes('/vision/cctv-detect'));
const counted = page => page.waitForResponse(r => r.url().endsWith('/vision/detect'));

{
  const { browser, page, logs } = await open({ w: 1440, h: 900, scale: 2 });
  await page.locator('#sr-tab-cctv').click();
  const got = frameLoaded(page);
  await page.getByRole('button', { name: /Cikupa Mas/ }).click();
  await page.clock.runFor(900); await got; await page.waitForTimeout(250);
  await page.mouse.move(60, 500);
  await page.screenshot({ path: `${OUT}/p-popup.png` });
  const hit = counted(page);
  await page.getByRole('button', { name: /Deteksi objek/ }).click();
  await hit; await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/p-popup-deteksi.png` });
  await page.getByRole('button', { name: /Pantau 30 dtk/ }).click();
  await page.clock.runFor(1200); await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/p-popup-pantau.png` });
  console.log(logs.length ? logs.join('\n') : '(konsol bersih)');
  await browser.close();
}
{
  const { browser, page, logs } = await open({ w: 800, h: 900, scale: 2 });
  await page.locator('#sr-tab-cctv').scrollIntoViewIfNeeded();
  await page.locator('#sr-tab-cctv').click();
  const got = frameLoaded(page);
  await page.getByRole('button', { name: /Cikupa Mas/ }).click();
  await page.clock.runFor(900); await got; await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.sr-map').scrollIntoView());
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/p-popup-sempit.png` });
  console.log(logs.length ? logs.join('\n') : '(konsol bersih)');
  await browser.close();
}
