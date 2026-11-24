// Pratinjau untuk pengguna: hanya isi contoh resmi BMKG (12 Okt 2025), jamnya digeser ke jam palsu peramban.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const OUT = `${AKAR}/uji-sitrep/potret`;
{
  const { browser, page, logs } = await open({ scale: 2, peringatan: 'contoh-bmkg' });
  // Label di dalam gambar itu sendiri, supaya berkasnya tidak terbaca sebagai catatan cuaca yang sebenarnya.
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.textContent = 'PRATINJAU. Data contoh resmi BMKG (12 Okt 2025), jamnya digeser. Bukan kondisi cuaca sebenarnya.';
    el.style.cssText = 'position:fixed;left:540px;top:168px;transform:translateX(-50%);z-index:9999;padding:7px 14px;background:#f0ede7;color:#161616;font:600 13px "IBM Plex Sans",system-ui,sans-serif;border-radius:3px;white-space:nowrap;pointer-events:none';
    document.body.appendChild(el);
  });
  await page.locator('#sr-tab-peringatan').click();
  await page.waitForTimeout(200);
  await page.mouse.move(700, 250);
  await page.screenshot({ path: `${OUT}/pratinjau-peringatan-cuaca.png` });
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: /Jawa Barat/ }).click();
  await page.clock.runFor(900); await page.waitForTimeout(250);
  await page.mouse.move(820, 190);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/pratinjau-peringatan-jawa-barat.png` });
  console.log(logs.filter(l => !/jetbrains|status of 404/.test(l)).join('\n') || '(konsol bersih)');
  await browser.close();
}
{
  const { browser, page } = await open({ scale: 2, peringatan: 'belum' });
  await page.locator('#sr-tab-peringatan').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/sitrep-peringatan-sebelum-restart.png` });
  await browser.close();
}
