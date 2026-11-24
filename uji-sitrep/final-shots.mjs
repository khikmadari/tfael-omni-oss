// Dua tangkapan akhir @2x dari build final, data nyata tangkapan 14 Nov 2026 19.11 WIB.
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const OUT = `${AKAR}/uji-sitrep/potret`;
{
  const { browser, page, logs } = await open({ scale: 2 });
  await page.mouse.move(700, 120);
  await page.screenshot({ path: `${OUT}/sitrep-peta-sebaran.png` });
  console.log('1', logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l)).join('\n') || '(konsol bersih)');
  await browser.close();
}
{
  const { browser, page, logs } = await open({ scale: 2 });
  await page.getByRole('button', { name: /DKI Jakarta/ }).first().click();
  await page.clock.runFor(900);
  // titik insiden yang benar-benar terlihat di dalam bingkai peta
  const pt = await page.evaluate(() => {
    const m = document.querySelector('.sr-map').getBoundingClientRect();
    for (const c of document.querySelectorAll('circle.sr-dot.is-incident')) {
      const b = c.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      if (x > m.left + 20 && x < m.right - 20 && y > m.top + 20 && y < m.bottom - 20) return [x, y];
    }
    return null;
  });
  await page.mouse.move(pt[0] - 30, pt[1] - 30);
  await page.mouse.move(pt[0], pt[1], { steps: 4 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/sitrep-pilih-provinsi.png` });
  console.log('2', logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l)).join('\n') || '(konsol bersih)');
  await browser.close();
}
