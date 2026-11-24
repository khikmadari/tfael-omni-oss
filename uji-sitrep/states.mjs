// Menjalankan serangkaian interaksi nyata dan memotret tiap keadaan.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { open } from './shot.mjs';
const AKAR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');   // folder proyek (induk uji-sitrep)
const OUT = `${AKAR}/uji-sitrep/potret`;
const only = process.argv.slice(2);
const want = n => !only.length || only.includes(n);
const allLogs = [];
const center = async (page, sel, nth = 0) => {
  const b = await page.locator(sel).nth(nth).boundingBox();
  if (!b) throw new Error(`tidak ada elemen: ${sel}`);
  return [b.x + b.width / 2, b.y + b.height / 2];
};
// Titik layar yang benar-benar berada di atas daratan provinsi (pusat bbox bisa jatuh di laut).
const landPoint = (page, code) => page.evaluate(c => {
  const el = document.querySelector(`path[data-prov="${c}"]`);
  const b = el.getBoundingClientRect();
  let best = null;
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
    const x = b.left + (b.width * i) / 24, y = b.top + (b.height * j) / 24;
    if (document.elementFromPoint(x, y) !== el) continue;
    const d = Math.hypot(x - (b.left + b.width / 2), y - (b.top + b.height / 2));
    if (!best || d < best.d) best = { x, y, d };
  }
  if (!best) throw new Error(`tidak ada titik darat untuk ${c}`);
  return [best.x, best.y];
}, code);
const expectText = async (page, sel, re) => {
  // textContent: innerText kosong untuk elemen SVG (label dan angka di peta)
  const t = (await page.locator(sel).allTextContents()).join(' | ');
  if (!re.test(t)) throw new Error(`"${sel}" berisi "${t}", diharapkan ${re}`);
};
async function run(name, opts, fn) {
  if (!want(name)) return;
  const { browser, page, logs } = await open(opts);
  try {
    await fn(page);
    await page.screenshot({ path: `${OUT}/s-${name}.png` });
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    await page.screenshot({ path: `${OUT}/s-${name}-GAGAL.png` }).catch(() => {});
  }
  const mine = logs.filter(l => !/\/fonts\/(jetbrains|chivo)|status of 404/.test(l));
  if (mine.length) allLogs.push(`${name}:\n  ${mine.join('\n  ')}`);
  await browser.close();
}

await run('hover-insiden', {}, async page => {
  const [x, y] = await center(page, 'circle.sr-dot.is-incident', 2);
  await page.mouse.move(x - 30, y - 30); await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(250);
});
await run('hover-gempa', {}, async page => {
  const [x, y] = await center(page, '.sr-quake', 0);
  await page.mouse.move(x - 40, y); await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(250);
});
await run('hover-provinsi', {}, async page => {
  const [x, y] = await center(page, 'path[data-prov="KT"]');
  await page.mouse.move(x - 20, y); await page.mouse.move(x, y, { steps: 3 });
  await page.waitForTimeout(250);
});
await run('pilih-provinsi', {}, async page => {
  const [x, y] = await landPoint(page, 'MU');
  await page.mouse.click(x, y);
  await page.clock.runFor(900);
  await page.mouse.move(40, 400);
  await expectText(page, '.sr-chip', /Maluku Utara/);
  await expectText(page, '.sr-pane-head', /Maluku Utara/);
});
await run('pilih-sumbar', {}, async page => {
  // provinsi tanpa laporan: tetap bisa dipilih, peta memperbesar ke Sumatera Barat saja
  const [x, y] = await landPoint(page, 'SB');
  await page.mouse.click(x, y);
  await page.clock.runFor(900);
  await page.mouse.move(40, 400);
  await expectText(page, '.sr-chip', /Sumatera Barat/);
  const b = await page.locator('path[data-prov="SB"]').boundingBox();
  const m = await page.locator('.sr-map').boundingBox();
  if (b.width > m.width || b.height > m.height || b.height < m.height * 0.5) throw new Error(`Sumatera Barat tidak pas di layar: ${JSON.stringify(b)}`);
});
await run('geser-peta', {}, async page => {
  // menggeser peta tidak boleh dianggap klik provinsi
  const [x, y] = await landPoint(page, 'KT');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 40, { steps: 6 });
  await page.mouse.up();
  await page.clock.runFor(300);
  if (await page.locator('.sr-chip').count()) throw new Error('geser peta memilih provinsi');
  await expectText(page, '.sr-map-zoom', /Seluruh Indonesia/);
});
await run('klik-laut', {}, async page => {
  const [x, y] = await landPoint(page, 'KT');
  await page.mouse.click(x, y);
  await page.clock.runFor(900);
  await expectText(page, '.sr-chip', /Kalimantan Tengah/);
  // cari titik laut: elemen di bawahnya adalah SVG itu sendiri, bukan path daratan
  const sea = await page.evaluate(() => {
    const svg = document.querySelector('.sr-map-svg');
    const b = svg.getBoundingClientRect();
    for (let j = 2; j < 18; j++) for (let i = 2; i < 18; i++) {
      const x = b.left + (b.width * i) / 20, y = b.top + (b.height * j) / 20;
      if (document.elementFromPoint(x, y) === svg) return [x, y];
    }
    return null;
  });
  if (!sea) throw new Error('tidak ada titik laut di tampilan ini');
  await page.mouse.click(sea[0], sea[1]);
  await page.clock.runFor(900);
  if (await page.locator('.sr-chip').count()) throw new Error('klik laut tidak melepas provinsi');
  if (/Seluruh Indonesia/.test(await page.locator('.sr-map-zoom').innerText())) throw new Error('peta tidak kembali ke seluruh Indonesia');
});
await run('klik-titik', {}, async page => {
  const [x, y] = await center(page, 'circle.sr-dot.is-incident', 0);
  await page.mouse.click(x, y);
  await page.clock.runFor(300);
  if (await page.locator('.sr-item.is-open').count() !== 1) throw new Error('klik titik tidak membuka laporannya di daftar');
});
await run('papan-ketik', {}, async page => {
  await page.locator('.sr-map-svg').focus();
  await page.keyboard.press('+'); await page.clock.runFor(400);
  await page.keyboard.press('+'); await page.clock.runFor(400);
  await page.keyboard.press('ArrowRight'); await page.clock.runFor(100);
  await expectText(page, '.sr-map-zoom', /Seluruh Indonesia/);
  await page.keyboard.press('0'); await page.clock.runFor(700);
  if (/Seluruh Indonesia/.test((await page.locator('.sr-map-zoom').innerText()))) throw new Error('tombol 0 tidak mengembalikan tampilan');
});
await run('pilih-jakarta', {}, async page => {
  await page.getByRole('button', { name: /DKI Jakarta/ }).first().click();
  await page.clock.runFor(900);
  await page.mouse.move(40, 400);
  await expectText(page, '.sr-pane-head', /DKI Jakarta/);
});
await run('zoom-maks', {}, async page => {
  const [x, y] = await landPoint(page, 'JK');
  await page.mouse.move(x, y);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -400); await page.clock.runFor(60); }
  await page.clock.runFor(400);
});
await run('semua', {}, async page => {
  await page.getByRole('button', { name: 'Semua', exact: true }).click();
  await page.waitForTimeout(300);
});
await run('jenis-keamanan', {}, async page => {
  await page.getByRole('button', { name: /Kriminal & keamanan/ }).click();
  await page.waitForTimeout(300);
});
await run('pilih-laporan', {}, async page => {
  await page.locator('.sr-item-btn').nth(1).click();
  await page.waitForTimeout(300);
});
await run('lapisan-mati', {}, async page => {
  await page.getByRole('button', { name: /Berita lain/ }).click();
  await page.getByRole('button', { name: /Gempa M/ }).first().click();
  await page.waitForTimeout(300);
});
await run('zoom-jawa', {}, async page => {
  const [x, y] = await center(page, 'path[data-prov="JB"]');
  await page.mouse.move(x, y);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -320); await page.clock.runFor(120); }
  await page.clock.runFor(400);
});
await run('bertahan', {}, async page => {
  // putaran berikutnya backend hanya mengirim 5 berita olahraga dan tanpa gempa:
  // laporan yang sudah tampil tidak boleh hilang dari peta
  const before = await page.locator('circle.sr-dot.is-incident').count();
  await fetch('http://localhost:8099/__scenario?name=quiet');
  const got = page.waitForResponse(r => r.url().includes('/sitrep/news'));
  await page.getByRole('button', { name: 'Perbarui' }).click();
  await got;
  await page.clock.runFor(500);
  const after = await page.locator('circle.sr-dot.is-incident').count();
  const quakes = await page.locator('.sr-quake').count();
  if (before !== 4 || after !== 4 || quakes !== 4) throw new Error(`insiden ${before} -> ${after}, gempa ${quakes}`);
});
await run('pulih', { sc: 'down' }, async page => {
  // server mati saat halaman dibuka, lalu hidup lagi: "Coba lagi" harus memuat data
  await expectText(page, '.sr-error', /tidak bisa dimuat/);
  await fetch('http://localhost:8099/__scenario?name=real');
  const got = page.waitForResponse(r => r.url().includes('/sitrep/news') && r.status() === 200);
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await got;
  await page.clock.runFor(500);
  if (await page.locator('.sr-error').count()) throw new Error('pita galat tidak hilang setelah server pulih');
  if (await page.locator('circle.sr-dot.is-incident').count() !== 4) throw new Error('data tidak termuat setelah pulih');
});
await run('padat', { sc: 'padat' }, async () => {});
await run('padat-jakarta', { sc: 'padat' }, async page => {
  await page.getByRole('button', { name: /DKI Jakarta/ }).first().click();
  await page.clock.runFor(900);
  await page.mouse.move(40, 400);
});
// ── CCTV ──
// Kamera terpilih = popup melayang di sisi kanan peta + retikel dan kartu pratinjau pada penandanya.
// Deteksi objek hanya atas permintaan; gambar dimuat ulang sendiri hanya dalam mode pantau.
const frameLoaded = page => page.waitForResponse(r => r.url().includes('/vision/cctv-detect'));
const counted = page => page.waitForResponse(r => r.url().endsWith('/vision/detect'));
const camCount = page => page.locator('rect.sr-cam').count();
const camRow = (page, re) => page.locator('#sr-panel-cctv').getByRole('button', { name: re });
const popBtn = (page, re) => page.locator('.sr-pop-actions').getByRole('button', { name: re });
const popTool = (page, name) => page.locator('.sr-pop-tools').getByRole('button', { name, exact: true });
const mapScale = async page => Number(/scale\(([\d.]+)\)/.exec(await page.locator('.sr-map-svg > g').first().getAttribute('transform'))[1]);
const boxOf = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) throw new Error(`tidak ada elemen: ${sel}`);
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2, r: b.x + b.width, b: b.y + b.height };
};
const has = async (page, sel, n, what) => {
  const got = await page.locator(sel).count();
  if (got !== n) throw new Error(`${what}: "${sel}" ada ${got}, diharapkan ${n}`);
};
const openGroup = async page => {
  const [x, y] = await center(page, '.sr-camg rect');
  await page.mouse.click(x, y);
  await page.clock.runFor(900);
};
/** Pilih kamera dari tab CCTV dan tunggu gambarnya tampil. */
const pickFromList = async (page, re) => {
  if (await page.locator('#sr-tab-cctv[aria-selected="true"]').count() === 0) await page.locator('#sr-tab-cctv').click();
  const got = frameLoaded(page);
  await camRow(page, re).click();
  await page.clock.runFor(900);
  await got;
  await page.locator('.sr-pop').waitFor();
  await page.waitForTimeout(150);
};
/** Penanda terpilih, retikel, dan kartu pratinjau harus berada di satu tempat, di bagian peta yang tidak tertutup popup. */
const checkMarker = async (page, name) => {
  await has(page, '.sr-cam-reticle', 1, 'retikel kamera terpilih');
  await has(page, '.sr-campeek-card', 1, 'kartu pratinjau');
  const sel = await boxOf(page, 'rect.sr-cam.is-selected, .sr-camg.is-selected rect');
  const ret = await boxOf(page, '.sr-cam-reticle circle');
  const card = await boxOf(page, '.sr-campeek-card');
  const line = await boxOf(page, '.sr-campeek-line');
  const map = await boxOf(page, '.sr-map');
  if (Math.abs(ret.cx - sel.cx) > 1.5 || Math.abs(ret.cy - sel.cy) > 1.5) throw new Error('retikel tidak berpusat di penanda terpilih');
  if (Math.abs(card.width - 184) > 1) throw new Error(`lebar kartu pratinjau ${card.width}, bukan 184`);
  if (card.height > 144.5) throw new Error(`kartu pratinjau lebih tinggi (${card.height}) dari yang dihitung peta (144)`);
  if (sel.cx < card.x - 1 || sel.cx > card.r + 1) throw new Error('kartu pratinjau tidak berada di atas/bawah penandanya');
  const above = card.b <= sel.y;
  if (!above && card.y < sel.b) throw new Error('kartu pratinjau menutupi penandanya');
  // garis penghubung: dari tepi kartu sampai tepi retikel, tepat di sumbu penanda
  if (Math.abs(line.cx - sel.cx) > 1) throw new Error('garis penghubung tidak di sumbu penanda');
  if (above ? Math.abs(line.y - card.b) > 4 || line.b > ret.y + 1 : Math.abs(line.b - card.y) > 4 || line.y < ret.b - 1) throw new Error(`garis penghubung tidak menyambung kartu dan retikel: ${JSON.stringify({ line, card, ret })}`);
  if (card.x < map.x || card.y < map.y || card.b > map.b) throw new Error('kartu pratinjau keluar dari peta');
  if (await page.locator('.sr-pop').count() && (await page.viewportSize()).width > 980) {
    const pop = await boxOf(page, '.sr-pop');
    if (card.r > pop.x || sel.r > pop.x) throw new Error('penanda atau kartu pratinjau tertutup popup');
  }
  if (name) await expectText(page, '.sr-campeek-name', name);
  return { sel, card, map };
};
const noMarker = async page => {
  await has(page, '.sr-cam-reticle', 0, 'retikel');
  await has(page, '.sr-campeek', 0, 'kartu pratinjau');
};
await run('cctv-awal', {}, async page => {
  await expectText(page, '.sr-layers', /CCTV\s*6/);
  await expectText(page, '#sr-tab-cctv', /CCTV\s*6/);
  await expectText(page, '.sr-camg text', /^6$/);
  if (await camCount(page)) throw new Error('kamera seharusnya masih tergabung pada tampilan nasional');
  await has(page, '.sr-pop', 0, 'popup sebelum ada kamera dipilih');
  await noMarker(page);
  const [x, y] = await center(page, '.sr-camg rect');
  await page.mouse.move(x - 40, y - 30); await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(200);
  await expectText(page, '.sr-map-tip', /6 kamera berdekatan/);
});
await run('cctv-pecah', {}, async page => {
  await openGroup(page);
  if (await camCount(page) !== 6) throw new Error(`setelah diperbesar harus 6 kamera terpisah, ada ${await camCount(page)}`);
  if (await page.locator('.sr-camg').count()) throw new Error('gabungan masih ada setelah diperbesar');
  if (await page.locator('.sr-chip').count()) throw new Error('klik gabungan kamera tidak boleh memilih provinsi');
});
await run('cctv-pilih', {}, async page => {
  let nDetect = 0, nFrame = 0;
  page.on('request', r => { if (r.url().endsWith('/vision/detect')) nDetect++; if (r.url().includes('/vision/cctv-detect')) nFrame++; });
  await openGroup(page);
  const [x, y] = await center(page, 'rect.sr-cam', 2);
  await page.mouse.move(x - 30, y - 30); await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(150);
  await expectText(page, '.sr-map-tip', /CCTV[\s\S]*Klik untuk melihat gambar terkini/);
  const name = (await page.locator('.sr-map-tip .sr-tip-title').innerText()).trim();
  await fetch('http://localhost:8099/__cctv?mode=ok&frameMs=1500');   // cukup lama untuk memeriksa keadaan memuat
  const got = frameLoaded(page);
  await page.mouse.click(x, y);
  await page.locator('.sr-pop').waitFor();
  // selagi server mengambil gambar: popup sudah terbuka dan mengatakan apa yang sedang terjadi
  await expectText(page, '.sr-pop-state', /Mengambil gambar dari kamera/);
  await expectText(page, '.sr-pop-status', /Mengambil gambar/);
  await expectText(page, '.sr-campeek-badge', /Memuat/);
  await page.screenshot({ path: `${OUT}/s-cctv-pilih-memuat.png` });
  if (!await page.locator('.sr-map-tip').isHidden()) throw new Error('tooltip "klik untuk melihat" tertinggal setelah kamera diklik');
  const res = await got; await page.clock.runFor(900); await page.waitForTimeout(150);
  await fetch('http://localhost:8099/__cctv?mode=ok');
  if (res.request().postDataJSON().detect !== false) throw new Error('permintaan gambar tidak meminta jalur tanpa deteksi');
  // popup terbuka di atas peta; tab di kolom kanan tidak berpindah
  if (await page.locator('#sr-tab-laporan[aria-selected="true"]').count() !== 1) throw new Error('tab berpindah saat kamera dipilih dari peta');
  await has(page, '.sr-pop-open img', 1, 'gambar kamera');
  await expectText(page, '.sr-pop-title', new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expectText(page, '.sr-pop-strip', /CAM-0{5}\d/);
  await expectText(page, '.sr-pop-strip', /≈ -6\.\d{4}, 106\.\d{4}/);
  await expectText(page, '.sr-pop-strip', /Stream publik/);
  await expectText(page, '.sr-pop-sub', /Sumber: ATCS Dishub Kabupaten Tangerang/);
  await expectText(page, '.sr-pop-badge', /Gambar \d\d\.\d\d\.\d\d/);
  await expectText(page, '.sr-pop-status.is-ok', /Terhubung/);
  await expectText(page, '.sr-pop-foot', /Gambar diam \(JPG\)/);
  // kecepatan dulu: tanpa diminta, tidak ada deteksi objek dan gambar tidak dimuat ulang sendiri
  await page.clock.runFor(15_000); await page.waitForTimeout(900);
  if (nDetect) throw new Error(`deteksi objek dijalankan tanpa diminta (${nDetect})`);
  if (nFrame !== 1) throw new Error(`gambar dimuat ulang tanpa diminta (${nFrame} permintaan)`);
  await has(page, '.sr-boxes', 0, 'kotak penanda tanpa deteksi');
  await has(page, '.sr-pop-note', 0, 'catatan deteksi tanpa deteksi');
  if (await popBtn(page, /Deteksi objek/).getAttribute('aria-pressed') !== 'false') throw new Error('tombol Deteksi objek menyala sejak awal');
  // di peta: penanda terpilih, retikel, kartu pratinjau dengan gambar yang sama
  await has(page, 'rect.sr-cam.is-selected', 1, 'kamera terpilih di peta');
  await checkMarker(page, new RegExp(name));
  const big = await page.locator('.sr-pop-open img').getAttribute('src');
  if (await page.locator('.sr-campeek-img img').getAttribute('src') !== big) throw new Error('gambar di kartu pratinjau berbeda dari gambar di popup');
  await expectText(page, '.sr-campeek-badge.is-ok', /^\d\d\.\d\d\.\d\d$/);
  // tombol zoom peta pindah ke kiri popup, tidak tertutup
  const zoom = await boxOf(page, '.sr-map-zoom');
  const pop = await boxOf(page, '.sr-pop');
  if (zoom.r > pop.x) throw new Error('tombol zoom peta tertutup popup');
  // klik ulang penanda yang sama: tidak ada yang berubah
  const [sx, sy] = await center(page, 'rect.sr-cam.is-selected');
  await page.mouse.move(sx - 20, sy + 30); await page.mouse.move(sx, sy, { steps: 3 });
  await page.waitForTimeout(150);
  if (/Klik untuk/.test(await page.locator('.sr-map-tip').innerText())) throw new Error('tooltip kamera yang sudah terbuka masih menyuruh klik');
  await page.mouse.click(sx, sy);
  await page.clock.runFor(900); await page.waitForTimeout(300);
  if (nFrame !== 1) throw new Error('klik ulang penanda terpilih mengambil gambar lagi');
  await has(page, '.sr-pop', 1, 'popup setelah klik ulang penanda');
  await page.mouse.move(40, 400);
  await page.screenshot({ path: `${OUT}/s-cctv-pilih-terbuka.png` });
  // Esc menutup popup tanpa mereset peta; fokus kembali ke peta, dan Esc berikutnya barulah mereset peta
  const k = await mapScale(page);
  await page.keyboard.press('Escape');
  await page.clock.runFor(900); await page.waitForTimeout(150);
  await has(page, '.sr-pop', 0, 'popup setelah Esc');
  await noMarker(page);
  await has(page, 'rect.sr-cam.is-selected', 0, 'kamera terpilih setelah popup ditutup');
  if (Math.abs(await mapScale(page) - k) > 0.01) throw new Error('Esc yang menutup popup ikut mereset peta');
  if (await page.evaluate(() => document.activeElement?.classList.contains('sr-map-svg')) !== true) throw new Error('fokus tidak kembali ke peta setelah popup ditutup');
  const zoom2 = await boxOf(page, '.sr-map-zoom');
  const map = await boxOf(page, '.sr-map');
  if (Math.abs(zoom2.r - (map.r - 12)) > 1) throw new Error('tombol zoom tidak kembali ke tepi kanan peta');
  await page.keyboard.press('Escape');
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await mapScale(page) > 1.01) throw new Error('Esc kedua tidak mengembalikan peta ke seluruh Indonesia');
});
await run('cctv-dari-daftar', {}, async page => {
  await page.locator('#sr-tab-cctv').click();
  await expectText(page, '.sr-pane-head', /Pilih kamera untuk membuka gambarnya di peta/);
  await expectText(page, '.sr-group-h', /ATCS Dishub Kabupaten Tangerang\s*6/);
  await pickFromList(page, /Cisauk 2/);
  if (await mapScale(page) < 12) throw new Error(`peta tidak terbang ke kamera (skala ${await mapScale(page)})`);
  await expectText(page, '.sr-pop-title', /^Cisauk 2$/);
  if (await page.locator('#sr-tab-cctv[aria-selected="true"]').count() !== 1) throw new Error('tab CCTV tertutup saat kamera dipilih dari daftar');
  await has(page, '#sr-panel-cctv .sr-item.is-open', 1, 'baris kamera terpilih di daftar');
  await expectText(page, '#sr-panel-cctv .sr-item.is-open', /Cisauk 2/);
  // kamera dibawa ke tengah bagian peta yang tidak tertutup popup, dengan ruang untuk kartu di atasnya
  const { sel, card, map } = await checkMarker(page, /Cisauk 2/);
  const pop = await boxOf(page, '.sr-pop');
  const free = map.width - (pop.width + 24);
  if (Math.abs(sel.cx - (map.x + free / 2)) > 30) throw new Error(`kamera tidak di tengah bagian peta yang terlihat: x=${sel.cx}, tengah=${map.x + free / 2}`);
  if (Math.abs(sel.cy - (map.y + map.height * 0.58)) > 30) throw new Error(`kamera tidak di ketinggian yang direncanakan: y=${sel.cy}`);
  if (card.b > sel.y) throw new Error('kartu pratinjau seharusnya di atas penanda saat ada ruang');
  if (Math.abs(pop.r - (map.r - 12)) > 1 || Math.abs(pop.y - (map.y + 12)) > 1) throw new Error(`popup tidak di pojok kanan atas peta: ${JSON.stringify(pop)}`);
  // sorotan dari daftar ke peta: tepat satu kamera lain yang bergaris tebal
  await camRow(page, /Cisauk 1/).hover();
  await page.waitForTimeout(150);
  await has(page, 'rect.sr-cam.is-focus:not(.is-selected)', 1, 'sorotan dari daftar di peta');
  // klik baris yang sama lagi = tutup
  await camRow(page, /Cisauk 2/).click();
  await page.waitForTimeout(150);
  await has(page, '.sr-pop', 0, 'popup setelah baris terpilih diklik lagi');
  await noMarker(page);
  await has(page, '#sr-panel-cctv .sr-item.is-open', 0, 'baris terpilih setelah ditutup');
});
await run('cctv-deteksi', {}, async page => {
  let nDetect = 0; page.on('request', r => { if (r.url().endsWith('/vision/detect')) nDetect++; });
  await pickFromList(page, /Cikupa Mas/);
  const btn = popBtn(page, /Deteksi objek/);
  await page.waitForTimeout(900);
  if (nDetect) throw new Error('deteksi dijalankan tanpa diminta');
  let hit = counted(page);
  await btn.click();
  await page.locator('.sr-pop-note').waitFor();
  await expectText(page, '.sr-pop-note', /Mendeteksi objek/);
  await has(page, '.sr-pop-open img', 1, 'gambar selagi deteksi berjalan');
  await hit; await page.waitForTimeout(150);
  if (await btn.getAttribute('aria-pressed') !== 'true') throw new Error('tombol Deteksi objek tidak menyala');
  await expectText(page, '.sr-pop-note', /Terdeteksi 5 mobil, 3 motor, 1 truk\./);
  // kotak penanda objek digambar di atas gambar, tepat di tempatnya; label hanya di tampilan besar
  await has(page, '.sr-pop-view rect.sr-box', 9, 'kotak penanda di popup');
  await has(page, '.sr-pop-view .sr-box-label', 0, 'label kotak di popup');
  const img = await page.locator('.sr-pop-open img').boundingBox();
  const b0 = await page.locator('.sr-pop-view rect.sr-box').first().boundingBox();
  const k = img.width / 960;
  const want = { x: img.x + 120 * k, y: img.y + 300 * k, w: 130 * k, h: 80 * k };
  if (Math.abs(b0.x - want.x) > 1.5 || Math.abs(b0.y - want.y) > 1.5 || Math.abs(b0.width - want.w) > 2.5 || Math.abs(b0.height - want.h) > 2.5) throw new Error(`kotak pertama meleset: ${JSON.stringify(b0)} vs ${JSON.stringify(want)}`);
  await page.mouse.move(40, 400);
  await page.screenshot({ path: `${OUT}/s-cctv-deteksi-hasil.png` });
  // gambar baru: tampil dulu tanpa kotak lama, deteksinya menyusul
  let got = frameLoaded(page); hit = counted(page);
  await popTool(page, 'Ambil gambar terbaru').click();
  await got; await page.waitForTimeout(100);
  await has(page, '.sr-pop-view .sr-boxes', 0, 'kotak gambar lama di gambar baru');
  await expectText(page, '.sr-pop-note', /Mendeteksi objek/);
  await hit; await page.waitForTimeout(150);
  await has(page, '.sr-pop-view rect.sr-box', 9, 'kotak penanda gambar baru');
  if (nDetect !== 2) throw new Error(`permintaan deteksi ${nDetect}, diharapkan 2`);
  // dimatikan: kotak dan hitungan dilepas, tanpa permintaan baru
  await btn.click(); await page.waitForTimeout(150);
  await has(page, '.sr-boxes', 0, 'kotak setelah deteksi dimatikan');
  await has(page, '.sr-pop-note', 0, 'catatan setelah deteksi dimatikan');
  if (await btn.getAttribute('aria-pressed') !== 'false') throw new Error('tombol Deteksi objek masih menyala');
  got = frameLoaded(page);
  await popTool(page, 'Ambil gambar terbaru').click();
  await got; await page.waitForTimeout(900);
  if (nDetect !== 2) throw new Error('deteksi tetap dijalankan setelah dimatikan');
  // dinyalakan lagi, lalu pindah kamera: deteksi berjalan sendiri untuk kamera baru, sesudah gambarnya tampil
  hit = counted(page); await btn.click(); await hit; await page.waitForTimeout(150);
  got = frameLoaded(page); hit = counted(page);
  await camRow(page, /Cisauk 1/).click();
  await page.clock.runFor(900); await got; await page.waitForTimeout(100);
  await expectText(page, '.sr-pop-title', /^Cisauk 1$/);
  await has(page, '.sr-pop-open img', 1, 'gambar kamera baru sebelum deteksinya dijawab');
  await has(page, '.sr-pop-view .sr-boxes', 0, 'kotak kamera lama di kamera baru');
  await hit; await page.waitForTimeout(150);
  await expectText(page, '.sr-pop-note', /Terdeteksi 5 mobil, 3 motor, 1 truk\./);
  if (nDetect !== 4) throw new Error(`permintaan deteksi ${nDetect}, diharapkan 4`);
});
await run('cctv-besar', {}, async page => {
  await pickFromList(page, /Cikupa Mas/);
  const hit = counted(page);
  await popBtn(page, /Deteksi objek/).click();
  await hit; await page.waitForTimeout(150);
  const k0 = await mapScale(page);
  await page.locator('.sr-pop-open').click();
  await page.waitForTimeout(100);
  await has(page, '.sr-zoom[role="dialog"] img', 1, 'gambar besar');
  // tampilan besar: kotak beserta labelnya, tetap menempel walau gambar diberi tepi kosong (letterbox)
  if (await page.locator('.sr-zoom rect.sr-box').count() !== 9 || await page.locator('.sr-zoom .sr-box-label').count() !== 9) throw new Error('kotak/label tidak lengkap di tampilan besar');
  await expectText(page, '.sr-zoom .sr-box-label', /mobil 91%[\s\S]*motor 81%[\s\S]*truk 86%/);
  await expectText(page, '.sr-zoom figcaption', /Cikupa Mas[\s\S]*Gambar pukul \d\d\.\d\d\.\d\d WIB\. Terdeteksi 5 mobil, 3 motor, 1 truk\./);
  const zi = await page.locator('.sr-zoom-img').boundingBox();
  const zk = Math.min(zi.width / 960, zi.height / 540);
  const zx = zi.x + (zi.width - 960 * zk) / 2, zy = zi.y + (zi.height - 540 * zk) / 2;
  const zb = await page.locator('.sr-zoom rect.sr-box').nth(8).boundingBox();   // truk [640,150,900,300]
  if (Math.abs(zb.x - (zx + 640 * zk)) > 2 || Math.abs(zb.y - (zy + 150 * zk)) > 2 || Math.abs(zb.width - 260 * zk) > 3 || Math.abs(zb.height - 150 * zk) > 3) throw new Error(`kotak truk meleset di tampilan besar: ${JSON.stringify(zb)}`);
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  if (focused !== 'Tutup') throw new Error(`fokus harus di tombol Tutup, bukan "${focused}"`);
  await page.screenshot({ path: `${OUT}/s-cctv-besar-terbuka.png` });
  // Esc pertama hanya menutup gambar besar; popup tetap, peta tidak direset
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await has(page, '.sr-zoom', 0, 'gambar besar setelah Esc');
  await has(page, '.sr-pop', 1, 'popup setelah Esc pertama');
  const back = await page.evaluate(() => document.activeElement?.className);
  if (!/sr-pop-open/.test(back)) throw new Error(`fokus tidak kembali ke gambar di popup (${back})`);
  if (Math.abs(await mapScale(page) - k0) > 0.01) throw new Error('Esc ikut mengubah peta');
  // lewat tombol di kepala popup, ditutup dengan klik di luar gambar
  await popTool(page, 'Perbesar gambar').click();
  await page.waitForTimeout(100);
  await has(page, '.sr-zoom', 1, 'gambar besar lewat tombol');
  const z = await boxOf(page, '.sr-zoom');
  await page.mouse.click(z.x + 6, z.y + 6);
  await page.waitForTimeout(100);
  await has(page, '.sr-zoom', 0, 'gambar besar setelah klik di luar');
  // Esc berikutnya menutup popup; fokus kembali ke baris kamera di daftar
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await has(page, '.sr-pop', 0, 'popup setelah Esc kedua');
  const row = await page.evaluate(() => `${document.activeElement?.className} | ${document.activeElement?.textContent}`);
  if (!/sr-camrow/.test(row) || !/Cikupa Mas/.test(row)) throw new Error(`fokus tidak kembali ke baris kamera (${row})`);
  if (Math.abs(await mapScale(page) - k0) > 0.01) throw new Error('menutup popup ikut mengubah peta');
});
await run('cctv-pantau', {}, async page => {
  let n = 0; page.on('request', r => { if (r.url().includes('/vision/cctv-detect')) n++; });
  await pickFromList(page, /Jayanti 1/);
  const first = await page.locator('.sr-pop-open img').getAttribute('src');
  await page.clock.runFor(20_000); await page.waitForTimeout(250);
  if (n !== 1) throw new Error(`gambar dimuat ulang sendiri tanpa mode pantau (${n} permintaan)`);
  await popBtn(page, /Pantau 30 dtk/).click();
  await page.waitForTimeout(120);
  await expectText(page, '.sr-pop-actions', /Berhenti · 30 dtk/);
  await has(page, '.sr-pop-badge.is-watch', 1, 'tanda memantau di popup');
  await has(page, '.sr-campeek-badge.is-watch', 1, 'tanda memantau di kartu pratinjau');
  let got = frameLoaded(page);
  await page.clock.runFor(5_050);
  await got; await page.waitForTimeout(150);
  const second = await page.locator('.sr-pop-open img').getAttribute('src');
  if (first === second) throw new Error('mode pantau tidak mengambil gambar baru');
  if (await page.locator('.sr-campeek-img img').getAttribute('src') !== second) throw new Error('kartu pratinjau tidak ikut gambar terbaru');
  await expectText(page, '.sr-pop-actions', /Berhenti · 2[45] dtk/);
  await page.mouse.move(40, 400);
  await page.screenshot({ path: `${OUT}/s-cctv-pantau-berjalan.png` });
  // popup tidak bergantung pada tab: pindah tab tidak menghentikan pemantauan
  await page.locator('#sr-tab-laporan').click();
  got = frameLoaded(page);
  await page.clock.runFor(5_000);
  await got; await page.waitForTimeout(150);
  if (n !== 3) throw new Error(`setelah pindah tab seharusnya 3 permintaan, ada ${n}`);
  // berhenti sendiri setelah 30 detik
  for (let i = 0; i < 4; i++) {
    const before = n;
    await page.clock.runFor(5_000);
    for (let j = 0; j < 40 && n === before; j++) await page.waitForTimeout(25);
    await page.waitForTimeout(450);
  }
  await page.clock.runFor(1_500); await page.waitForTimeout(150);
  if (n < 6 || n > 7) throw new Error(`selama 30 detik pantau seharusnya 5-6 gambar baru, ada ${n - 1}`);
  await expectText(page, '.sr-pop-actions', /Pantau 30 dtk/);
  await has(page, '.sr-pop-badge.is-watch', 0, 'tanda memantau setelah 30 detik');
  await has(page, '.sr-campeek-badge.is-ok', 1, 'kartu pratinjau kembali ke keadaan biasa');
  const after = n;
  await page.clock.runFor(30_000); await page.waitForTimeout(400);
  if (n !== after) throw new Error(`gambar masih dimuat ulang setelah mode pantau selesai (${n - after})`);
  // dihentikan sendiri sebelum waktunya
  await popBtn(page, /Pantau 30 dtk/).click();
  await page.waitForTimeout(100);
  await popBtn(page, /Berhenti/).click();
  await page.waitForTimeout(100);
  await page.clock.runFor(12_000); await page.waitForTimeout(400);
  if (n !== after) throw new Error('mode pantau tetap berjalan setelah dihentikan');
});
await run('cctv-deteksi-lambat', { cctv: 'deteksi-lambat' }, async page => {
  // deteksi lebih lambat dari selang mode pantau: permintaan tidak boleh menumpuk, dan kotak tidak boleh salah gambar
  let open = 0, max = 0, total = 0;
  page.on('request', r => { if (r.url().endsWith('/vision/detect')) { total++; open++; max = Math.max(max, open); } });
  page.on('response', r => { if (r.url().endsWith('/vision/detect')) open--; });
  await pickFromList(page, /Cikupa Mas/);
  await popBtn(page, /Deteksi objek/).click();          // deteksi pertama berjalan 3 detik
  await popBtn(page, /Pantau 30 dtk/).click();
  for (let i = 0; i < 2; i++) {
    const got = frameLoaded(page);
    await page.clock.runFor(5_050);
    await got; await page.waitForTimeout(120);
  }
  if (total !== 1) throw new Error(`deteksi menumpuk: ${total} permintaan selagi yang pertama belum dijawab`);
  await has(page, '.sr-pop-view .sr-boxes', 0, 'kotak selagi deteksi belum dijawab');
  await expectText(page, '.sr-pop-note', /Mendeteksi objek/);
  // jawaban pertama datang untuk gambar yang sudah berganti: dibuang, lalu deteksi dijalankan untuk gambar yang tampil
  for (let i = 0; i < 120 && total < 2; i++) await page.waitForTimeout(50);
  if (total !== 2) throw new Error('deteksi tidak dijalankan ulang untuk gambar yang sedang tampil');
  await has(page, '.sr-pop-view .sr-boxes', 0, 'kotak dari gambar yang sudah berganti');
  for (let i = 0; i < 120 && open > 0; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(200);
  await has(page, '.sr-pop-view rect.sr-box', 9, 'kotak penanda setelah deteksi menyusul');
  if (max !== 1) throw new Error(`ada ${max} permintaan deteksi berjalan bersamaan`);
});
await run('cctv-frame-gagal', { cctv: 'frame-gagal' }, async page => {
  await pickFromList(page, /Cikupa Kedaton 1/);
  await expectText(page, '.sr-pop-state', /Gambar tidak bisa diambil\. Gagal membuka stream/);
  await has(page, '.sr-pop-state .sr-btn', 1, 'tombol Coba lagi');
  await expectText(page, '.sr-pop-status.is-bad', /Tidak terjangkau/);
  await expectText(page, '.sr-campeek-badge.is-idle', /Gagal/);
  await has(page, '.sr-campeek-img img', 0, 'gambar di kartu pratinjau saat gagal');
  await has(page, '.sr-pop-badge', 0, 'lencana jam gambar saat belum ada gambar');
  if (!await popTool(page, 'Perbesar gambar').isDisabled()) throw new Error('tombol Perbesar aktif padahal belum ada gambar');
  await page.mouse.move(40, 400);
  await page.screenshot({ path: `${OUT}/s-cctv-frame-gagal-awal.png` });
  // kamera pulih: "Coba lagi" menampilkan gambarnya
  await fetch('http://localhost:8099/__cctv?mode=ok');
  let got = frameLoaded(page);
  await page.locator('.sr-pop-state .sr-btn').click();
  await got; await page.waitForTimeout(150);
  await has(page, '.sr-pop-open img', 1, 'gambar setelah kamera pulih');
  await expectText(page, '.sr-pop-status.is-ok', /Terhubung/);
  // gagal saat diperbarui: gambar terakhir tetap tampil, dengan keterangan
  await fetch('http://localhost:8099/__cctv?mode=frame-gagal');
  got = frameLoaded(page);
  await popTool(page, 'Ambil gambar terbaru').click();
  await got; await page.waitForTimeout(150);
  await has(page, '.sr-pop-open img', 1, 'gambar terakhir setelah gagal diperbarui');
  await expectText(page, '.sr-pop-note.is-warn', /Gagal memperbarui, gambar di atas yang terakhir berhasil\. Gagal membuka stream/);
  await expectText(page, '.sr-pop-status.is-bad', /Terputus/);
  await has(page, '.sr-pop-badge.is-stale', 1, 'lencana gambar lama');
  // keterangan di kaki popup tidak menimpa tombol portal
  const st = await boxOf(page, '.sr-pop-status');
  const link = await boxOf(page, '.sr-pop-foot a');
  if (st.r > link.x - 4 && st.b > link.y && st.y < link.b) throw new Error(`status menimpa tombol portal: ${JSON.stringify({ st, link })}`);
  await expectText(page, '.sr-campeek-badge.is-idle', /^\d\d\.\d\d\.\d\d$/);
});
await run('cctv-katalog-gagal', { cctv: 'katalog-gagal' }, async page => {
  if (await page.locator('.sr-camg, rect.sr-cam').count()) throw new Error('ada tanda kamera padahal katalog gagal');
  if (/\d/.test(await page.locator('#sr-tab-cctv').innerText())) throw new Error('tab CCTV menampilkan angka padahal katalog gagal');
  await page.locator('#sr-tab-cctv').click();
  await expectText(page, '.sr-cam-fail', /Daftar kamera tidak bisa dimuat\. Mode air-gap/);
  // katalog pulih setelah "Coba lagi"
  await fetch('http://localhost:8099/__cctv?mode=ok');
  const got = page.waitForResponse(r => r.url().includes('/vision/cctv-list'));
  await page.locator('.sr-cam-fail .sr-btn').click();
  await got; await page.waitForTimeout(150);
  await expectText(page, '#sr-tab-cctv', /CCTV\s*6/);
  if (await page.locator('.sr-camg').count() !== 1) throw new Error('kamera tidak muncul di peta setelah katalog pulih');
});
await run('cctv-tanpa-yolo', { cctv: 'tanpa-yolo' }, async page => {
  let total = 0; page.on('request', r => { if (r.url().endsWith('/vision/detect')) total++; });
  await pickFromList(page, /Cikupa Mas/);
  const btn = popBtn(page, /Deteksi objek/);
  let hit = counted(page);
  await btn.click();
  await hit; await page.waitForTimeout(150);
  await expectText(page, '.sr-pop-note', /Deteksi objek tidak aktif di server ini \(YOLO belum terpasang\)\./);
  await has(page, '.sr-boxes', 0, 'kotak penanda padahal deteksi tidak aktif');
  await has(page, '.sr-pop-open img', 1, 'gambar kamera');
  // gambar berikutnya tidak menanyai server lagi
  const got = frameLoaded(page);
  await popTool(page, 'Ambil gambar terbaru').click();
  await got; await page.waitForTimeout(900);
  if (total !== 1) throw new Error(`server ditanya lagi padahal sudah menjawab YOLO tidak terpasang (${total})`);
  await expectText(page, '.sr-pop-note', /YOLO belum terpasang/);
  // dimatikan lalu dinyalakan lagi = ditanya lagi
  await btn.click(); await page.waitForTimeout(120);
  await has(page, '.sr-pop-note', 0, 'catatan setelah deteksi dimatikan');
  hit = counted(page);
  await btn.click();
  await hit; await page.waitForTimeout(150);
  if (total !== 2) throw new Error(`setelah dinyalakan lagi seharusnya 2 permintaan, ada ${total}`);
});
await run('cctv-server-lama', { cctv: 'server-lama' }, async page => {
  // server belum dijalankan ulang: deteksi selalu ikut dan kotaknya sudah tergambar di dalam gambar
  let extra = 0; page.on('request', r => { if (r.url().endsWith('/vision/detect')) extra++; });
  await pickFromList(page, /Cikupa Mas/);
  await expectText(page, '.sr-pop-note', /Terdeteksi 5 mobil, 3 motor, 1 truk\./);
  const btn = popBtn(page, /Deteksi objek/);
  if (await btn.getAttribute('aria-pressed') !== 'true' || !await btn.isDisabled()) throw new Error('tombol Deteksi objek seharusnya menyala dan terkunci di server lama');
  if (!/Server versi lama/.test(await btn.getAttribute('title'))) throw new Error('alasan tombol terkunci tidak dijelaskan');
  await page.waitForTimeout(900);
  if (extra) throw new Error(`permintaan deteksi kedua tetap dikirim ke server lama (${extra})`);
  await has(page, '.sr-boxes', 0, 'kotak digambar ulang di atas gambar yang sudah beranotasi');
});
await run('cctv-hitung-gagal', { cctv: 'hitung-gagal' }, async page => {
  // deteksi objek gagal: gambar tetap tampil, kegagalannya dikatakan
  await pickFromList(page, /Cikupa Mas/);
  const hit = counted(page);
  await popBtn(page, /Deteksi objek/).click();
  await hit; await page.waitForTimeout(200);
  await has(page, '.sr-pop-open img', 1, 'gambar saat deteksi gagal');
  await expectText(page, '.sr-pop-note', /Deteksi objek gagal dijalankan\./);
  await has(page, '.sr-boxes', 0, 'kotak penanda padahal deteksi gagal');
  await expectText(page, '.sr-pop-status.is-ok', /Terhubung/);
});
await run('cctv-ganti-kamera', {}, async page => {
  // deteksi menyala; pindah kamera sebelum deteksi kamera sebelumnya dijawab: hasil lama tidak boleh menempel di gambar kamera baru
  let nHitung = 0; page.on('response', r => { if (r.url().endsWith('/vision/detect')) nHitung++; });
  const tunggu = async n => { for (let i = 0; i < 100 && nHitung < n; i++) await page.waitForTimeout(50); if (nHitung < n) throw new Error(`jawaban deteksi ke-${n} tidak datang`); };
  await pickFromList(page, /Jayanti 1/);
  await popBtn(page, /Deteksi objek/).click();
  await tunggu(1); await page.waitForTimeout(100);
  let got = frameLoaded(page);
  await camRow(page, /Cikupa Mas/).click();
  await page.clock.runFor(900); await got; await page.waitForTimeout(60);    // deteksi Cikupa Mas baru berangkat
  got = frameLoaded(page);
  await camRow(page, /Cisauk 1/).click();
  await page.clock.runFor(900); await got;
  await tunggu(2); await page.waitForTimeout(100);        // jawaban untuk Cikupa Mas baru tiba sekarang
  await expectText(page, '.sr-pop-title', /^Cisauk 1$/);
  if (/Terdeteksi/.test(await page.locator('.sr-pop').innerText())) throw new Error('hitungan kamera sebelumnya menempel di gambar kamera baru');
  await has(page, '.sr-boxes', 0, 'kotak kamera sebelumnya di gambar kamera baru');
  await tunggu(3); await page.waitForTimeout(150);         // deteksi untuk Cisauk 1
  await expectText(page, '.sr-pop-note', /Terdeteksi 5 mobil, 3 motor, 1 truk\./);
  await has(page, '.sr-pop-view rect.sr-box', 9, 'kotak penanda kamera baru');
  await checkMarker(page, /Cisauk 1/);
});
await run('cctv-campur', { cctv: 'campur' }, async page => {
  await page.locator('#sr-tab-cctv').click();
  await expectText(page, '#sr-tab-cctv', /CCTV\s*8/);
  await expectText(page, '.sr-pane', /tanpa posisi di peta/);
  await expectText(page, '.sr-pane', /hanya tautan/);
  if (await page.locator('.sr-group-h').count() !== 2) throw new Error('kamera tidak dikelompokkan per sumber');
  let asked = 0; page.on('request', r => { if (r.url().includes('/vision/cctv-detect')) asked++; });
  // kamera yang hanya punya tautan portal
  await camRow(page, /Bundaran HI/).click();
  await page.clock.runFor(900);
  await page.locator('.sr-pop').waitFor();
  await page.waitForTimeout(200);
  await expectText(page, '.sr-pop-linkonly', /hanya bisa dilihat di portal sumbernya/);
  await expectText(page, '.sr-pop-strip', /Tautan portal/);
  await expectText(page, '.sr-pop-strip', /-6\.1950, 106\.8230/);
  if (/≈/.test(await page.locator('.sr-pop-strip').innerText())) throw new Error('koordinat pasti ditandai sebagai perkiraan');
  await expectText(page, '.sr-pop-status', /Tanpa stream/);
  await expectText(page, '.sr-pop-foot', /Jenis\s*Tautan/i);
  await has(page, '.sr-pop-actions', 0, 'tombol deteksi/pantau untuk kamera tanpa stream');
  const href = await page.locator('.sr-pop-foot a').getAttribute('href');
  if (href !== 'https://jakcctv.jakarta.go.id/publik') throw new Error(`tautan portal salah: ${href}`);
  if (asked) throw new Error('kamera tanpa stream tidak boleh meminta frame ke server');
  if (!await popTool(page, 'Ambil gambar terbaru').isDisabled() || !await popTool(page, 'Perbesar gambar').isDisabled()) throw new Error('tombol gambar aktif untuk kamera tanpa stream');
  // kartu di peta hanya memuat nama: tidak ada gambar yang bisa ditunggu
  await checkMarker(page, /Bundaran HI/);
  await has(page, '.sr-campeek-img', 0, 'kotak gambar di kartu kamera tanpa stream');
  await page.mouse.move(40, 400);
  await page.screenshot({ path: `${OUT}/s-cctv-campur-tautan.png` });
  // kamera tanpa posisi: popup tetap terbuka, tanpa penanda di peta, tombol pusatkan mati
  const got = frameLoaded(page);
  await camRow(page, /Kamera tanpa koordinat/).click();
  await page.clock.runFor(900); await got; await page.waitForTimeout(150);
  await expectText(page, '.sr-pop-title', /^Kamera tanpa koordinat$/);
  await expectText(page, '.sr-pop-strip', /tanpa koordinat/);
  await has(page, '.sr-pop-open img', 1, 'gambar kamera tanpa posisi');
  await noMarker(page);
  if (!await popTool(page, 'Pusatkan di peta').isDisabled()) throw new Error('tombol Pusatkan aktif untuk kamera tanpa posisi');
});
await run('cctv-portal-gagal', { cctv: 'portal-gagal' }, async page => {
  // portal Tangerang mati, kamera tambahan (DKI) tetap bisa dipakai
  await expectText(page, '#sr-tab-cctv', /CCTV\s*1/);
  await page.locator('#sr-tab-cctv').click();
  await expectText(page, '.sr-cam-fail', /ATCS Dishub Kabupaten Tangerang tidak menjawab\./);
  await expectText(page, '.sr-group-h', /CCTV Publik DKI\s*1/);
  await pickFromList(page, /Bundaran HI arah Sudirman/);
  await has(page, '.sr-pop-open img', 1, 'gambar kamera tambahan');
  await expectText(page, '.sr-pop-sub', /Menteng • Sumber: CCTV Publik DKI/);
  const href = await page.locator('.sr-pop-foot a').getAttribute('href');
  if (href !== 'https://contoh.test') throw new Error(`tautan portal salah: ${href}`);
  await checkMarker(page, /Bundaran HI arah Sudirman/);
});
await run('cctv-lapisan-mati', {}, async page => {
  await page.locator('.sr-layers').getByRole('button', { name: /CCTV/ }).click();
  await page.waitForTimeout(100);
  if (await page.locator('.sr-camg, rect.sr-cam').count()) throw new Error('tanda kamera masih ada setelah lapisan dimatikan');
  await expectText(page, '.sr-filters', /Atur ulang/);
  await page.locator('#sr-tab-cctv').click();
  await expectText(page, '.sr-group-h', /ATCS Dishub Kabupaten Tangerang/);
  // lapisan mati: kamera tetap bisa dibuka dari daftar, hanya tanpa tanda di peta
  await pickFromList(page, /Cisauk 2/);
  await has(page, '.sr-pop-open img', 1, 'gambar kamera saat lapisan mati');
  await noMarker(page);
  if (await page.locator('.sr-camg, rect.sr-cam').count()) throw new Error('memilih kamera menyalakan lapisan tanpa diminta');
  if (await mapScale(page) > 1.01) throw new Error('peta terbang padahal lapisan kamera mati');
  // "Pusatkan di peta" menyalakan lapisannya lagi dan membawa kamera ke layar
  await popTool(page, 'Pusatkan di peta').click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('.sr-layers').getByRole('button', { name: /CCTV/ }).getAttribute('aria-pressed') !== 'true') throw new Error('lapisan CCTV tidak menyala lagi');
  if (await mapScale(page) < 12) throw new Error('peta tidak terbang ke kamera');
  await checkMarker(page, /Cisauk 2/);
});
await run('cctv-geser', {}, async page => {
  await pickFromList(page, /Cikupa Mas/);
  const a = await checkMarker(page, /Cikupa Mas/);
  // geser peta: kartu ikut bersama penandanya
  const drag = async (dx, dy) => {
    const m = await boxOf(page, '.sr-map');
    const x0 = m.x + 70, y0 = m.y + 150;
    await page.mouse.move(x0, y0); await page.mouse.down();
    await page.mouse.move(x0 + dx / 2, y0 + dy / 2, { steps: 4 }); await page.mouse.move(x0 + dx, y0 + dy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  await drag(-110, 50);
  const b = await checkMarker(page, /Cikupa Mas/);
  const moved = [b.sel.cx - a.sel.cx, b.sel.cy - a.sel.cy];
  if (Math.abs(moved[0] + 110) > 3 || Math.abs(moved[1] - 50) > 3) throw new Error(`peta tidak bergeser sesuai seretan: ${moved}`);
  if (Math.abs((b.card.x - a.card.x) - moved[0]) > 1.5 || Math.abs((b.card.y - a.card.y) - moved[1]) > 1.5) throw new Error('kartu pratinjau tidak ikut bergeser bersama penandanya');
  // penanda dekat tepi atas: kartu pindah ke bawah penanda
  await drag(0, -(b.sel.cy - b.map.y - 60));
  const c = await checkMarker(page, /Cikupa Mas/);
  if (c.card.y < c.sel.b) throw new Error('kartu pratinjau tidak pindah ke bawah penanda di dekat tepi atas');
  await page.screenshot({ path: `${OUT}/s-cctv-geser-bawah.png` });
  // penanda di dekat tepi popup: kartu dan tooltip tetap di bagian peta yang terlihat
  const pop = await boxOf(page, '.sr-pop');
  await drag(pop.x - 40 - c.sel.cx, 130);
  const e = await checkMarker(page, /Cikupa Mas/);
  await page.mouse.move(e.sel.cx - 30, e.sel.cy + 40); await page.mouse.move(e.sel.cx, e.sel.cy, { steps: 3 });
  await page.waitForTimeout(150);
  await expectText(page, '.sr-map-tip', /Cikupa Mas/);
  const tip = await boxOf(page, '.sr-map-tip');
  if (tip.r > pop.x) throw new Error(`tooltip terselip di bawah popup: ${JSON.stringify(tip)}`);
  await page.screenshot({ path: `${OUT}/s-cctv-geser-tepi.png` });
  // penanda digeser sampai ke bawah popup: kartunya disembunyikan, tidak menunjuk ke tempat kosong
  await drag(100, 0);
  await has(page, '.sr-campeek', 0, 'kartu pratinjau untuk penanda di bawah popup');
  // "Pusatkan di peta" membawanya kembali ke bagian yang terlihat
  await popTool(page, 'Pusatkan di peta').click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  const d = await checkMarker(page, /Cikupa Mas/);
  const free = d.map.width - (pop.width + 24);
  if (Math.abs(d.sel.cx - (d.map.x + free / 2)) > 30) throw new Error('Pusatkan di peta tidak membawa kamera ke tengah bagian yang terlihat');
  // diperkecil sampai kamera bergabung lagi: retikel dan kartu menempel di tanda gabungannya
  for (let i = 0; i < 4; i++) { await page.locator('.sr-map-zoom').getByRole('button', { name: 'Perkecil peta' }).click(); await page.clock.runFor(400); }
  await page.waitForTimeout(150);
  await has(page, '.sr-camg.is-selected', 1, 'gabungan yang memuat kamera terpilih');
  await checkMarker(page, /Cikupa Mas/);
  await page.mouse.move(40, 400);
});
await run('cctv-dan-lainnya', {}, async page => {
  // popup kamera terbuka: "bawa ke layar" untuk provinsi, peringatan, dan gabungan kamera memakai bagian peta yang terlihat
  await pickFromList(page, /Cikupa Mas/);
  const pop = await boxOf(page, '.sr-pop');
  const map = await boxOf(page, '.sr-map');
  await page.locator('.sr-rank').getByRole('button', { name: /Banten/ }).click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  await expectText(page, '.sr-chip', /Banten/);
  const prov = await boxOf(page, 'path.sr-map-prov.is-selected');
  if (prov.r > pop.x + 1 || prov.x < map.x - 1) throw new Error(`provinsi terpilih tidak seluruhnya di bagian peta yang terlihat: ${JSON.stringify(prov)}`);
  if (Math.abs(prov.cx - (map.x + (pop.x - 12 - map.x) / 2)) > 24) throw new Error('provinsi terpilih tidak di tengah bagian peta yang terlihat');
  await has(page, '.sr-pop', 1, 'popup setelah provinsi dipilih');
  await page.mouse.move(40, 400);
  await page.screenshot({ path: `${OUT}/s-cctv-dan-provinsi.png` });
  // peringatan cuaca di provinsi itu
  await page.locator('#sr-tab-peringatan').click();
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: /Banten/ }).click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  await has(page, 'path.sr-warn-area.is-selected', 1, 'bidang peringatan terpilih');
  const area = await boxOf(page, 'path.sr-warn-area.is-selected');
  if (area.r > pop.x + 1 || area.x < map.x - 1) throw new Error(`daerah peringatan tidak seluruhnya di bagian peta yang terlihat: ${JSON.stringify(area)}`);
  await page.screenshot({ path: `${OUT}/s-cctv-dan-peringatan.png` });
  // menutup popup tidak menggeser peta
  const before = await page.locator('.sr-map-svg > g').first().getAttribute('transform');
  await popTool(page, 'Tutup').click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('.sr-map-svg > g').first().getAttribute('transform') !== before) throw new Error('menutup popup menggeser peta');
  // buka lagi, kembali ke seluruh Indonesia, lalu klik gabungan kamera: semua kamera muncul di kiri popup
  await pickFromList(page, /Cisauk 1/);
  for (let i = 0; i < 2 && await mapScale(page) > 1.01; i++) {
    await page.locator('.sr-map-zoom').getByRole('button', { name: 'Seluruh Indonesia' }).click();
    await page.clock.runFor(900); await page.waitForTimeout(150);
  }
  if (await mapScale(page) > 1.01) throw new Error('peta tidak kembali ke seluruh Indonesia');
  await has(page, '.sr-pop', 1, 'popup setelah peta direset');
  await openGroup(page);
  await page.waitForTimeout(150);
  if (await camCount(page) !== 6) throw new Error(`setelah gabungan diklik harus 6 kamera terpisah, ada ${await camCount(page)}`);
  for (let i = 0; i < 6; i++) {
    const b = await page.locator('rect.sr-cam').nth(i).boundingBox();
    if (b.x + b.width > pop.x) throw new Error(`kamera ke-${i + 1} muncul di bawah popup`);
  }
  await checkMarker(page, /Cisauk 1/);
});
await run('cctv-papan-ketik', {}, async page => {
  await page.locator('#sr-tab-cctv').click();
  await camRow(page, /Cikupa Mas/).focus();
  const got = frameLoaded(page);
  await page.keyboard.press('Enter');
  await page.clock.runFor(900); await got;
  await page.locator('.sr-pop').waitFor();
  await page.waitForTimeout(150);
  // dipilih dengan papan ketik: fokus pindah ke popup, dan Tab menyusuri kendalinya secara berurutan
  if (!await page.evaluate(() => document.activeElement?.classList.contains('sr-pop'))) throw new Error('fokus tidak pindah ke popup saat kamera dipilih dengan papan ketik');
  const order = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const a = document.activeElement;
      return a?.closest('.sr-pop') ? (a.getAttribute('aria-label') || a.textContent || '').trim() : '(di luar popup)';
    }));
  }
  const want = ['Ambil gambar terbaru', 'Pusatkan di peta', 'Perbesar gambar', 'Tutup', 'Perbesar gambar Cikupa Mas', 'Deteksi objek', 'Pantau 30 dtk', 'Portal sumber'];
  if (order.join(' | ') !== want.join(' | ')) throw new Error(`urutan Tab di popup: ${order.join(' | ')}`);
  // Spasi pada "Deteksi objek" menyalakannya
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+Tab');
  const hit = counted(page);
  await page.keyboard.press('Space');
  await hit; await page.waitForTimeout(150);
  await expectText(page, '.sr-pop-note', /Terdeteksi 5 mobil, 3 motor, 1 truk\./);
  // Esc menutup popup dan mengembalikan fokus ke baris kamera
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await has(page, '.sr-pop', 0, 'popup setelah Esc');
  const back = await page.evaluate(() => `${document.activeElement?.className} | ${document.activeElement?.textContent}`);
  if (!/sr-camrow/.test(back) || !/Cikupa Mas/.test(back)) throw new Error(`fokus tidak kembali ke baris kamera (${back})`);
  // dipilih dengan mouse: fokus tidak dicuri popup, daftar tetap bisa dijelajahi
  const got2 = frameLoaded(page);
  await camRow(page, /Cisauk 1/).click();
  await page.clock.runFor(900); await got2;
  await page.locator('.sr-pop').waitFor();
  await page.waitForTimeout(150);
  const still = await page.evaluate(() => `${document.activeElement?.className} | ${document.activeElement?.textContent}`);
  if (!/sr-camrow/.test(still) || !/Cisauk 1/.test(still)) throw new Error(`popup mencuri fokus saat kamera dipilih dengan mouse (${still})`);
});
await run('cctv-pendek', { w: 1280, h: 620 }, async page => {
  // layar lebar tetapi pendek: popup tidak boleh keluar dari badan halaman, isinya digulir di dalam popup
  await pickFromList(page, /Cikupa Mas/);
  const hit = counted(page);
  await popBtn(page, /Deteksi objek/).click();
  await hit; await page.waitForTimeout(150);
  const pop = await boxOf(page, '.sr-pop');
  const body = await boxOf(page, '.sr-body');
  if (pop.b > body.b + 0.5 || pop.y < body.y) throw new Error(`popup keluar dari badan halaman: ${JSON.stringify({ pop, body })}`);
  await page.locator('.sr-pop-foot a').scrollIntoViewIfNeeded();
  const link = await boxOf(page, '.sr-pop-foot a');
  if (link.b > pop.b + 0.5) throw new Error('bagian bawah popup tidak bisa dijangkau');
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error('halaman bergulir mendatar');
  await checkMarker(page, /Cikupa Mas/);
});
await run('cctv-sempit', { w: 800, h: 900 }, async page => {
  await page.locator('#sr-tab-cctv').scrollIntoViewIfNeeded();
  await page.locator('#sr-tab-cctv').click();
  const got = frameLoaded(page);
  await camRow(page, /Cikupa Mas/).click();
  await page.clock.runFor(900); await got;
  await page.locator('.sr-pop').waitFor();
  await page.waitForTimeout(250);
  // tata letak sempit: popup dalam alur halaman tepat di bawah peta, selebar layar, dan dibawa ke layar
  const pop = await boxOf(page, '.sr-pop');
  const map = await boxOf(page, '.sr-map');
  if (pop.width < 790) throw new Error(`popup tidak selebar layar (${pop.width})`);
  if (Math.abs(pop.y - map.b) > 1) throw new Error(`popup tidak tepat di bawah peta: popup y=${pop.y}, peta bawah=${map.b}`);
  if (pop.y < 0 || pop.y > 400) throw new Error(`popup tidak dibawa ke layar (y=${pop.y})`);
  const img = await boxOf(page, '.sr-pop-open img');
  if (img.y < 0 || img.b > 900) throw new Error(`gambar kamera tidak seluruhnya di layar: ${JSON.stringify(img)}`);
  if (Math.abs(img.width - pop.width) > 2) throw new Error('gambar tidak selebar popup');
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error('halaman bergulir mendatar');
  await page.screenshot({ path: `${OUT}/s-cctv-sempit-popup.png` });
  // peta di atasnya: kamera di tengah lebar penuh, tombol zoom tetap di tepi kanan
  await page.locator('.sr-map').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('.sr-map').scrollIntoView());
  await page.waitForTimeout(150);
  const { sel, map: m2 } = await checkMarker(page, /Cikupa Mas/);
  if (Math.abs(sel.cx - (m2.x + m2.width / 2)) > 30) throw new Error('kamera tidak di tengah peta pada tata letak sempit');
  const zoom = await boxOf(page, '.sr-map-zoom');
  if (Math.abs(zoom.r - (m2.r - 12)) > 1) throw new Error('tombol zoom bergeser pada tata letak sempit');
  // memilih kamera dari peta tidak melompatkan halaman: popup sudah terlihat di bawah peta
  const top0 = await page.evaluate(() => document.querySelector('.sr').scrollTop);
  const other = await boxOf(page, 'rect.sr-cam:not(.is-selected)');
  const got2 = frameLoaded(page);
  await page.mouse.click(other.cx, other.cy);
  await page.clock.runFor(900); await got2; await page.waitForTimeout(200);
  const top1 = await page.evaluate(() => document.querySelector('.sr').scrollTop);
  if (Math.abs(top1 - top0) > 2) throw new Error(`halaman melompat saat kamera dipilih dari peta (${top0} → ${top1})`);
});
await run('cctv-popup-gagal-muat', {}, async page => {
  // berkas popup tidak bisa diambil (aplikasi dibangun ulang selagi halaman terbuka): pesan, bukan halaman kosong
  await page.route('**/assets/CctvPopup-*.js', r => r.abort());
  await page.locator('#sr-tab-cctv').click();
  await camRow(page, /Cikupa Mas/).click();
  await page.clock.runFor(900);
  await page.locator('.sr-pop-fail').waitFor({ timeout: 5000 });
  await expectText(page, '.sr-pop-fail', /Tampilan kamera tidak bisa dimuat\.\s*Muat ulang halaman ini/);
  await has(page, '.sr-map-svg', 1, 'peta setelah popup gagal dimuat');
  await has(page, '#sr-panel-cctv .sr-item', 6, 'daftar kamera setelah popup gagal dimuat');
  await page.locator('.sr-pop-fail').getByRole('button', { name: 'Tutup' }).click();
  await page.waitForTimeout(100);
  await has(page, '.sr-pop', 0, 'popup setelah ditutup');
});
// ── Peringatan dini cuaca BMKG ──
const triCount = page => page.locator('path.sr-warn-mark').count();
const areaCount = page => page.locator('path.sr-warn-area').count();
const warnRows = page => page.locator('#sr-panel-peringatan .sr-item').count();
const scaleOf = async page => Number(/scale\(([\d.]+)\)/.exec(await page.locator('.sr-map-svg > g').first().getAttribute('transform'))[1]);
const warnLoaded = page => page.waitForResponse(r => r.url().includes('/sitrep/peringatan'));
const tabOpen = async (page, id) => { if (await page.locator(`#sr-tab-${id}[aria-selected="true"]`).count() !== 1) throw new Error(`tab ${id} tidak terbuka`); };
const inMap = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  const m = await page.locator('.sr-map').boundingBox();
  if (!b) throw new Error(`tidak ada elemen: ${sel}`);
  return b.x < m.x + m.width && b.x + b.width > m.x && b.y < m.y + m.height && b.y + b.height > m.y;
};
// segitiga pertama yang tooltip-nya menyebut wilayah ini
const triOf = async (page, area) => {
  const n = await triCount(page);
  for (let i = 0; i < n; i++) {
    const [x, y] = await center(page, 'path.sr-warn-mark', i);
    await page.mouse.move(x - 25, y - 25); await page.mouse.move(x, y, { steps: 3 });
    await page.waitForTimeout(60);
    const t = (await page.locator('.sr-map-tip').allTextContents()).join(' ');
    if (/Peringatan cuaca BMKG/.test(t) && t.includes(area)) return [x, y];
  }
  throw new Error(`tidak ada segitiga untuk ${area}`);
};
await run('peringatan-awal', {}, async page => {
  await expectText(page, '.sr-alert', /^Peringatan dini cuaca BMKG berlaku di 20 wilayah: Aceh, Bali, Banten, Bengkulu, DI Yogyakarta, Jabodetabek/);
  await expectText(page, '.sr-layers', /Peringatan cuaca\s*23/);
  await expectText(page, '#sr-tab-peringatan', /^Peringatan\s*23$/);
  await expectText(page, '#sr-tab-laporan', /^Laporan\s*36$/);
  if (await triCount(page) !== 23 || await areaCount(page) !== 0) throw new Error(`tampilan nasional harus 23 segitiga tanpa bidang, ada ${await triCount(page)} dan ${await areaCount(page)}`);
  await tabOpen(page, 'laporan');
  if (await page.locator('#sr-panel-laporan .sr-key.is-warn').count()) throw new Error('peringatan tidak boleh mengisi tab Laporan');
  if (await page.locator('.sr-map-place').count()) throw new Error('nama kab/kota tidak boleh tampil pada tampilan nasional');
  if (await page.locator('.sr-market, .sr-tick').count()) throw new Error('pita saham masih ada');
  if (/IHSG|BBCA/.test(await page.locator('.sr').innerText())) throw new Error('teks saham masih ada');
});
await run('peringatan-hover', {}, async page => {
  await triOf(page, 'Jawa Barat');
  await page.waitForTimeout(150);
  await expectText(page, '.sr-map-tip', /Peringatan cuaca BMKG\s*sampai 20\.05[\s\S]*Hujan lebat disertai petir[\s\S]*Jawa Barat: 18 lokasi, antara lain Bantargadung[\s\S]*Berlaku 18\.25–20\.05 WIB[\s\S]*Klik untuk melihat daerah terdampak/);
  if (await page.locator('path.sr-warn-mark.is-focus').count() !== 1) throw new Error('segitiga yang disorot tidak ditandai');
  // di tempat lapang, segitiga yang disorot juga diberi label (di Jabodetabek yang padat label mengalah pada tanda lain)
  await triOf(page, 'Aceh');
  await page.waitForTimeout(150);
  await expectText(page, '.sr-map-label', /Aceh\s*sampai 20\.35/);
});
await run('peringatan-klik', {}, async page => {
  const [x, y] = await triOf(page, 'Jawa Barat');
  await page.mouse.click(x, y);
  await page.clock.runFor(900); await page.waitForTimeout(150);
  await tabOpen(page, 'peringatan');
  await expectText(page, '.sr-item.is-open', /Jawa Barat[\s\S]*Hujan lebat disertai petir[\s\S]*khususnya di Bantargadung[\s\S]*Berlaku 18\.25–20\.05 WIB\.[\s\S]*Buka infografik BMKG/);
  const a = page.locator('.sr-item.is-open a.sr-link');
  if (await a.getAttribute('href') !== 'https://nowcasting.bmkg.go.id/infografis/CJB/2025/10/13/infografis.jpg' || await a.getAttribute('target') !== '_blank' || await a.getAttribute('rel') !== 'noopener noreferrer') throw new Error('tautan infografik salah');
  if (await scaleOf(page) < 6) throw new Error(`peta tidak terbang ke daerah terdampak (skala ${await scaleOf(page)})`);
  if (await page.locator('path.sr-warn-area.is-selected').count() !== 1) throw new Error('bidang terpilih tidak ditandai');
  const b = await page.locator('path.sr-warn-area.is-selected').boundingBox();
  const m = await page.locator('.sr-map').boundingBox();
  if (b.x < m.x || b.y < m.y || b.x + b.width > m.x + m.width || b.y + b.height > m.y + m.height) throw new Error(`daerah terdampak tidak muat di peta: ${JSON.stringify(b)}`);
  if (b.width < m.width * 0.3 && b.height < m.height * 0.3) throw new Error('daerah terdampak terlalu kecil setelah diperbesar');
  await expectText(page, '.sr-map-place', /Bandung/);
  if (await page.locator('.sr-chip').count()) throw new Error('memilih peringatan tidak boleh memilih provinsi');
  await page.mouse.move(m.x + 40, m.y + 40);
});
await run('peringatan-bidang-hover', {}, async page => {
  // setelah diperbesar, bidang wilayah bisa disorot dan diklik langsung
  await page.locator('#sr-tab-peringatan').click();
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: /Jawa Barat/ }).click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  const pt = await page.evaluate(() => {
    const el = document.querySelector('path.sr-warn-area.is-selected');
    const b = el.getBoundingClientRect();
    for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) {
      const x = b.left + (b.width * i) / 30, y = b.top + (b.height * j) / 30;
      if (document.elementFromPoint(x, y) === el) return [x, y];
    }
    return null;
  });
  if (!pt) throw new Error('tidak ada titik di dalam bidang terpilih');
  await page.mouse.move(pt[0] - 10, pt[1] - 10); await page.mouse.move(pt[0], pt[1], { steps: 3 });
  await page.waitForTimeout(150);
  await expectText(page, '.sr-map-tip', /Peringatan cuaca BMKG[\s\S]*Jawa Barat/);
  if (/Klik untuk melihat daerah terdampak/.test((await page.locator('.sr-map-tip').allTextContents()).join(' '))) throw new Error('petunjuk klik tidak perlu saat bidang sudah tampil');
  if (await page.locator('.sr-item.is-hover, .sr-item.is-open').count() < 1) throw new Error('sorotan peta tidak sampai ke daftar');
  // klik bidang yang sama melepas pilihan, tanpa menggeser peta
  const k = await scaleOf(page);
  await page.mouse.click(pt[0], pt[1]);
  await page.clock.runFor(900); await page.waitForTimeout(100);
  if (await page.locator('.sr-item.is-open').count()) throw new Error('klik kedua tidak melepas pilihan');
  if (Math.abs(await scaleOf(page) - k) > 0.01) throw new Error('melepas pilihan menggeser peta');
});
await run('peringatan-dari-daftar', {}, async page => {
  await page.locator('#sr-tab-peringatan').click();
  if (await warnRows(page) !== 23) throw new Error(`daftar harus 23 baris, ada ${await warnRows(page)}`);
  await expectText(page, '#sr-panel-peringatan .sr-pane-head', /Seluruh Indonesia/);
  await expectText(page, '#sr-panel-peringatan .sr-list-foot', /Sumber: BMKG/);
  // sorotan baris → segitiganya di peta
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: /Kalimantan Barat/ }).hover();
  await page.waitForTimeout(150);
  if (await page.locator('path.sr-warn-mark.is-focus').count() !== 1) throw new Error('sorotan dari daftar tidak sampai ke peta');
  await expectText(page, '.sr-map-label', /Kalimantan Barat/);
  // wilayah kepulauan: poligon terpencar, peta menuju poligon yang paling tengah dan cukup besar untuk dibaca
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: /Kep\. Riau/ }).click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('path.sr-warn-area.is-selected').count() !== 1) throw new Error('bidang Kep. Riau tidak tampil');
  if (!await inMap(page, 'path.sr-warn-area.is-selected')) throw new Error('bidang Kep. Riau di luar layar');
  await expectText(page, '.sr-item.is-open', /Kep\. Riau\s*sampai 21\.05[\s\S]*Berlaku 19\.15–21\.05 WIB\./);
  // peringatan yang sudah terbit tetapi belum mulai menulis jam mulainya
  await expectText(page, '#sr-panel-peringatan', /Jawa Timur\s*mulai 19\.35/);
  await page.mouse.move(40, 400);
});
await run('peringatan-dari-kepala', {}, async page => {
  // provinsi dipilih dan lapisan dimatikan, lalu kalimat di kepala diklik: seluruh Indonesia, lapisan menyala, tab Peringatan
  const [x, y] = await landPoint(page, 'MU');
  await page.mouse.click(x, y);
  await page.clock.runFor(900);
  await expectText(page, '.sr-chip', /Maluku Utara/);
  await page.locator('.sr-layers').getByRole('button', { name: /Peringatan cuaca/ }).click();
  await page.locator('.sr-alert').click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('.sr-chip').count()) throw new Error('filter provinsi tidak dilepas');
  await tabOpen(page, 'peringatan');
  if (await warnRows(page) !== 23) throw new Error('daftar tidak memuat semua peringatan');
  if (await triCount(page) !== 23) throw new Error('lapisan peringatan tidak menyala lagi');
  if (/Seluruh Indonesia/.test(await page.locator('.sr-map-zoom').innerText())) throw new Error('peta tidak kembali ke seluruh Indonesia');
});
await run('peringatan-provinsi', {}, async page => {
  const pilih = async nama => { await page.locator('.sr-rank-row', { hasText: nama }).click(); await page.clock.runFor(900); await page.waitForTimeout(100); };
  const daftar = async () => (await page.locator('#sr-panel-peringatan .sr-item-type').allTextContents()).sort().join('|');
  // Jabodetabek menyentuh tiga provinsi (poligonnya di Jakarta Selatan, Depok, Tangerang Selatan)
  await pilih('Jawa Barat');
  await expectText(page, '#sr-tab-peringatan', /^Peringatan\s*2$/);
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-pane-head', /^Jawa Barat$/);
  if (await daftar() !== 'Jabodetabek|Jawa Barat') throw new Error(`Jawa Barat: ${await daftar()}`);
  await pilih('DKI Jakarta');
  if (await daftar() !== 'Jabodetabek') throw new Error(`DKI Jakarta: ${await daftar()}`);
  await page.screenshot({ path: `${OUT}/s-peringatan-provinsi-jakarta.png` });
  await pilih('Banten');
  if (await daftar() !== 'Banten|Jabodetabek') throw new Error(`Banten: ${await daftar()}`);
  // provinsi tanpa peringatan: sebabnya dijelaskan, ada jalan keluar
  await pilih('Maluku Utara');
  await expectText(page, '#sr-tab-peringatan', /^Peringatan\s*0$/);
  await expectText(page, '#sr-panel-peringatan .sr-pane-msg', /Tidak ada peringatan cuaca untuk Maluku Utara\. Di provinsi lain ada 23 yang sedang berlaku\./);
  await page.getByRole('button', { name: 'Tampilkan seluruh Indonesia' }).click();
  await page.clock.runFor(900); await page.waitForTimeout(100);
  if (await page.locator('.sr-chip').count() || await warnRows(page) !== 23) throw new Error('"Tampilkan seluruh Indonesia" tidak melepas filter provinsi');
});
await run('peringatan-luar-provinsi', {}, async page => {
  // provinsi terpilih, lalu tanda di provinsi lain diklik: filter dilepas dan barisnya terbuka (dulu klik seperti ini tidak berbuat apa-apa)
  const [x, y] = await landPoint(page, 'KT');
  await page.mouse.click(x, y);
  await page.clock.runFor(900);
  await expectText(page, '.sr-chip', /Kalimantan Tengah/);
  await page.locator('.sr-map-svg').focus();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('-'); await page.clock.runFor(400); }
  const [tx, ty] = await triOf(page, 'Kalimantan Barat');
  await page.mouse.click(tx, ty);
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('.sr-chip').count()) throw new Error('filter provinsi tidak dilepas saat tanda di luar provinsi dipilih');
  await tabOpen(page, 'peringatan');
  await expectText(page, '.sr-item.is-open', /Kalimantan Barat/);
  // hal yang sama untuk titik laporan
  const [px, py] = await landPoint(page, 'KB');
  await page.mouse.click(px, py);
  await page.clock.runFor(900);
  await expectText(page, '.sr-chip', /Kalimantan Barat/);
  await page.locator('.sr-map-svg').focus();
  for (let i = 0; i < 5; i++) { await page.keyboard.press('-'); await page.clock.runFor(400); }
  const [dx, dy] = await center(page, 'circle.sr-dot.is-incident', 0);
  await page.mouse.click(dx, dy);
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('.sr-chip').count()) throw new Error('filter provinsi tidak dilepas saat titik laporan di luar provinsi dipilih');
  await tabOpen(page, 'laporan');
  if (await page.locator('#sr-panel-laporan .sr-item.is-open').count() !== 1) throw new Error('laporan yang diklik tidak terbuka');
});
await run('peringatan-lapisan-mati', {}, async page => {
  await page.locator('.sr-layers').getByRole('button', { name: /Peringatan cuaca/ }).click();
  await page.waitForTimeout(100);
  if (await triCount(page) || await areaCount(page)) throw new Error('tanda peringatan masih ada setelah lapisan dimatikan');
  await expectText(page, '.sr-filters', /Atur ulang/);
  await expectText(page, '.sr-alert', /20 wilayah/);
  if (await page.locator('.sr-map-legend .sr-key.is-warn').count()) throw new Error('legenda segitiga masih tampil');
  // tab tetap memuat daftar; memilih baris menyalakan lapisan lagi
  await page.locator('#sr-tab-peringatan').click();
  if (await warnRows(page) !== 23) throw new Error('tab Peringatan kosong saat lapisan dimatikan');
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: /Jawa Tengah/ }).click();
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('.sr-layer[aria-pressed="true"]', { hasText: 'Peringatan cuaca' }).count() !== 1) throw new Error('memilih baris tidak menyalakan lapisan');
  if (await page.locator('path.sr-warn-area.is-selected').count() !== 1) throw new Error('daerah terdampak tidak tampil');
  await page.mouse.move(40, 400);
});
await run('peringatan-zoom', {}, async page => {
  // perbesar bertahap di atas Jawa bagian barat: segitiga berganti menjadi bidang begitu poligonnya terbaca
  const [x, y] = await center(page, 'path[data-prov="JB"]');
  await page.mouse.move(x, y);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -320); await page.clock.runFor(120); }
  await page.clock.runFor(400); await page.waitForTimeout(100);
  const a = await areaCount(page), t = await triCount(page);
  if (a < 1 || t < 1 || a + t !== 23) throw new Error(`pada perbesaran menengah harus ada bidang dan segitiga (bidang ${a}, segitiga ${t})`);
  await page.screenshot({ path: `${OUT}/s-peringatan-zoom-menengah.png` });
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -320); await page.clock.runFor(120); }
  await page.clock.runFor(400); await page.waitForTimeout(100);
  if (await page.locator('.sr-map-place').count() < 3) throw new Error('nama kab/kota tidak tampil saat diperbesar');
  await page.mouse.move(40, 400);
});
await run('peringatan-kedaluwarsa', {}, async page => {
  // waktu berjalan: yang masa berlakunya habis hilang sendiri dari kepala, peta, dan daftar
  await page.locator('#sr-tab-peringatan').click();
  await page.clock.fastForward(21 * 60_000);
  await page.waitForTimeout(500);
  if (await warnRows(page) !== 21) throw new Error(`setelah 19.36 harus 21 baris (NTB dan Sumsel berakhir), ada ${await warnRows(page)}`);
  await expectText(page, '.sr-alert', /19 wilayah/);
  if (await triCount(page) !== 21) throw new Error('segitiga yang kedaluwarsa masih di peta');
  await page.clock.fastForward(4 * 3_600_000);
  await page.waitForTimeout(500);
  await expectText(page, '.sr-alertbar', /^Tidak ada peringatan dini cuaca BMKG yang sedang berlaku$/);
  await expectText(page, '#sr-panel-peringatan', /Tidak ada peringatan dini cuaca BMKG yang sedang berlaku\./);
  await expectText(page, '.sr-layers', /Peringatan cuaca\s*0/);
  if (await triCount(page) || await areaCount(page)) throw new Error('masih ada tanda peringatan setelah semuanya berakhir');
});
await run('peringatan-kosong', { peringatan: 'kosong' }, async page => {
  await expectText(page, '.sr-alertbar', /^Tidak ada peringatan dini cuaca BMKG yang sedang berlaku$/);
  if (await page.locator('.sr-alert').count()) throw new Error('kalimat kosong tidak boleh berupa tombol');
  await expectText(page, '.sr-layers', /Peringatan cuaca\s*0/);
  await expectText(page, '#sr-tab-peringatan', /^Peringatan\s*0$/);
  if (await page.locator('.sr-map-legend .sr-key.is-warn').count()) throw new Error('legenda segitiga tampil padahal tidak ada peringatan');
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-empty', /Tidak ada peringatan dini cuaca BMKG yang sedang berlaku\./);
  await expectText(page, '#sr-panel-peringatan .sr-list-foot', /Sumber: BMKG/);
});
await run('peringatan-gagal', { peringatan: 'gagal' }, async page => {
  await expectText(page, '.sr-alertbar', /^Peringatan dini cuaca BMKG tidak bisa diambil$/);
  await expectText(page, '.sr-notice', /^Feed peringatan dini BMKG tidak terjangkau\.$/);
  if (/\d/.test(await page.locator('#sr-tab-peringatan').innerText())) throw new Error('tab menampilkan angka padahal sumber gagal');
  if (/\d/.test(await page.locator('.sr-layer', { hasText: 'Peringatan cuaca' }).innerText())) throw new Error('chip menampilkan angka padahal sumber gagal');
  if (await page.locator('circle.sr-dot.is-incident').count() !== 4) throw new Error('laporan ikut hilang saat peringatan gagal');
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-pane-msg.is-fail', /Peringatan dini cuaca tidak bisa diambil\. Feed peringatan dini BMKG tidak terjangkau\./);
  await page.screenshot({ path: `${OUT}/s-peringatan-gagal-tab.png` });
  // sumber pulih
  await fetch('http://localhost:8099/__peringatan?mode=ok');
  const got = warnLoaded(page);
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: 'Coba lagi' }).click();
  await got; await page.waitForTimeout(250);
  if (await warnRows(page) !== 23) throw new Error('peringatan tidak termuat setelah sumber pulih');
  await expectText(page, '.sr-alert', /20 wilayah/);
  if (await page.locator('.sr-notice').count()) throw new Error('catatan gagal tidak hilang setelah pulih');
});
await run('peringatan-airgap', { peringatan: 'airgap' }, async page => {
  await expectText(page, '.sr-notice', /^Mode air-gap: peringatan dini BMKG tidak diambil\.$/);
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-pane-msg.is-fail', /Mode air-gap: peringatan dini BMKG tidak diambil\./);
});
await run('peringatan-belum', { peringatan: 'belum' }, async page => {
  // server Python belum dijalankan ulang: endpoint baru menjawab 404, sisanya berjalan seperti biasa
  await expectText(page, '.sr-alertbar', /^Peringatan dini cuaca BMKG muncul setelah server Python dijalankan ulang$/);
  if (await page.locator('.sr-error').count()) throw new Error('pita galat muncul padahal hanya peringatan yang belum ada');
  if (await page.locator('.sr-notice').count()) throw new Error('catatan sumber muncul untuk keadaan "belum dijalankan ulang"');
  if (await page.locator('circle.sr-dot.is-incident').count() !== 4 || await page.locator('.sr-quake').count() !== 4) throw new Error('laporan tidak tampil');
  if (await triCount(page)) throw new Error('ada segitiga padahal endpoint belum ada');
  if (/\d/.test(await page.locator('#sr-tab-peringatan').innerText())) throw new Error('tab menampilkan angka padahal endpoint belum ada');
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-pane-msg.is-todo', /Belum aktif di server yang sedang berjalan\.[\s\S]*Hentikan server Python, jalankan lagi, lalu tekan Coba lagi\./);
  await page.screenshot({ path: `${OUT}/s-peringatan-belum-tab.png` });
  // setelah server dijalankan ulang
  await fetch('http://localhost:8099/__peringatan?mode=ok');
  const got = warnLoaded(page);
  await page.locator('#sr-panel-peringatan').getByRole('button', { name: 'Coba lagi' }).click();
  await got; await page.waitForTimeout(250);
  if (await warnRows(page) !== 23 || await triCount(page) !== 23) throw new Error('peringatan tidak muncul setelah endpoint tersedia');
});
await run('peringatan-tanpa-poligon', { peringatan: 'tanpa-poligon' }, async page => {
  // rincian CAP gagal untuk semuanya: tanda diletakkan di provinsinya, tidak ada bidang, peta tidak dipindah
  if (await triCount(page) !== 23) throw new Error(`harus 23 segitiga, ada ${await triCount(page)}`);
  const [x, y] = await triOf(page, 'Sumatera Barat');
  await page.waitForTimeout(100);
  if (/Klik untuk melihat daerah terdampak/.test((await page.locator('.sr-map-tip').allTextContents()).join(' '))) throw new Error('petunjuk "daerah terdampak" tampil padahal poligon tidak ada');
  await page.mouse.click(x, y);
  await page.clock.runFor(900); await page.waitForTimeout(150);
  await tabOpen(page, 'peringatan');
  await expectText(page, '.sr-item.is-open', /Sumatera Barat[\s\S]*Batas daerah terdampak tidak berhasil diambil, jadi di peta hanya ada tanda di provinsinya\./);
  if (await scaleOf(page) !== 1) throw new Error('peta berpindah padahal tidak ada daerah untuk dituju');
  if (await areaCount(page)) throw new Error('ada bidang padahal poligon tidak ada');
});
await run('peringatan-basi', {}, async page => {
  // gagal saat diperbarui: peringatan terakhir tetap tampil selama masih berlaku, dan ditandai
  await fetch('http://localhost:8099/__peringatan?mode=gagal');
  const got = warnLoaded(page);
  await page.getByRole('button', { name: 'Perbarui' }).click();
  await got; await page.waitForTimeout(250);
  await expectText(page, '.sr-alert', /20 wilayah/);
  await expectText(page, '.sr-notice', /^Feed peringatan dini BMKG tidak terjangkau\. Menampilkan peringatan yang diambil pukul 19\.15\.$/);
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-pane-msg.is-fail', /Gagal memperbarui\. Feed peringatan dini BMKG tidak terjangkau\. Daftar di bawah diambil pukul 19\.15 WIB\./);
  if (await warnRows(page) !== 23 || await triCount(page) !== 23) throw new Error('peringatan terakhir tidak dipertahankan');
});
await run('peringatan-lambat', { peringatan: 'lambat', wait: 'load' }, async page => {
  // server butuh beberapa detik untuk peringatan: berita dan gempa tidak ikut tertahan
  const got = warnLoaded(page);
  if (await page.locator('circle.sr-dot.is-incident').count() !== 4) throw new Error('laporan tertahan menunggu peringatan cuaca');
  if ((await page.locator('.sr-alertbar').innerText()).trim()) throw new Error('kepala sudah berisi sebelum peringatan dijawab');
  await page.locator('#sr-tab-peringatan').click();
  await expectText(page, '#sr-panel-peringatan .sr-empty', /Memuat peringatan cuaca…/);
  await page.screenshot({ path: `${OUT}/s-peringatan-lambat-menunggu.png` });
  await got; await page.waitForTimeout(250);
  await expectText(page, '.sr-alert', /20 wilayah/);
  if (await warnRows(page) !== 23) throw new Error('peringatan tidak muncul setelah dijawab');
});
await run('peringatan-papan-ketik', {}, async page => {
  // kalimat di kepala bisa dicapai dan dijalankan dari papan ketik
  await page.locator('.sr-alert').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await tabOpen(page, 'peringatan');
  await page.locator('#sr-panel-peringatan .sr-item-btn').first().focus();
  await page.waitForTimeout(100);
  if (await page.locator('path.sr-warn-mark.is-focus').count() !== 1) throw new Error('fokus papan ketik pada baris tidak menyorot segitiganya');
  await page.keyboard.press('Enter');
  await page.clock.runFor(900); await page.waitForTimeout(150);
  if (await page.locator('#sr-panel-peringatan .sr-item.is-open').count() !== 1) throw new Error('Enter tidak membuka baris');
});
await run('peringatan-sempit', { w: 800, h: 900 }, async page => {
  // kepala dua baris: kalimat peringatan turun ke baris sendiri dan boleh terlipat, tidak terpotong
  const head = await page.locator('.sr-head').boundingBox();
  const alert = await page.locator('.sr-alert').boundingBox();
  const title = await page.locator('.sr-title').boundingBox();
  if (alert.y < title.y + title.height - 2) throw new Error('kalimat peringatan tidak turun ke baris sendiri');
  if (alert.x + alert.width > head.x + head.width + 1) throw new Error('kalimat peringatan keluar dari kepala');
  await expectText(page, '.sr-alert', /Sumatera Utara$/);
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error('halaman bergulir mendatar');
});
// ── Animasi pembuka setelah login ──
// Login tiruan mesin uji (server uji menerima apa pun; tidak ada akun sungguhan). Jam dihentikan, jadi animasi
// hanya maju lewat runFor dan tiap pemeriksaan jatuh tepat pada waktunya.
const pauseClock = async page => page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 50));
const doLogin = async page => {
  await page.getByPlaceholder('operator').fill('uji');
  await page.locator('input[type="password"]').fill('uji');
  await page.getByRole('button', { name: /AUTHENTICATE/ }).click();
};
/** React menahan tampilnya isi Suspense beberapa ratus ms lewat timer, jadi jam dimajukan sedikit demi sedikit. */
const untilGlobe = async page => {
  let lead = 0;
  for (; lead < 3000 && await page.locator('.intro-stage canvas').count() === 0; lead += 40) { await page.clock.runFor(40); await page.waitForTimeout(30); }
  if (await page.locator('.intro-stage canvas').count() === 0) throw new Error('bola dunia tidak muncul di dalam tirai');
  await page.waitForTimeout(250);
  return lead;
};
const step = async (page, ms) => { await page.clock.runFor(ms); await page.waitForTimeout(110); };
const introPhase = async page => (await page.locator('.intro').count() === 0 ? 'off' : await page.locator('.intro.is-leaving').count() ? 'leaving' : 'on');
const shape = async page => Number(await page.locator('.intro-stage canvas').getAttribute('data-bentuk'));
/**
 * Bingkai terakhir harus berimpit dengan peta SITREP di bawah tirai. Kotak peta dipotret dua kali: sekali dari
 * tirai (bingkai terakhir bola dunia), sekali dari peta aslinya setelah tirai hilang, dengan tulisan dan kontrol
 * peta disembunyikan karena memang tidak digambar bola dunia. Yang dibandingkan piksel demi piksel.
 */
const mapClip = async page => { const b = await page.locator('.sr .sr-map').boundingBox(); return { x: Math.ceil(b.x), y: Math.ceil(b.y), width: Math.floor(b.width) - 1, height: Math.floor(b.height) - 1 }; };
const HIDE_MAP_TEXT = '.sr-map-label, .sr-map-more, .sr-map-place, .sr-map-legend, .sr-map-zoom, .sr-map-attr, .sr-map-note, .sr-map-tip { visibility: hidden !important; }';
const pixelDiff = (a, b) => Number(execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB')
assert a.size == b.size, (a.size, b.size)
d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 24 else 0)
print(d.histogram()[255] / (a.size[0] * a.size[1]))
`, a, b], { encoding: 'utf8' }).trim());
/** Tanda di canvas harus jatuh di atas tanda aslinya: di pusat tiap gempa dan titik insiden, piksel canvas berwarna sama. */
const marksOnTop = page => page.evaluate(() => {
  const cv = document.querySelector('.intro-stage canvas');
  const dpr = cv.width / cv.clientWidth;
  const stage = cv.getBoundingClientRect();
  const map = document.querySelector('.sr .sr-map').getBoundingClientRect();
  const x0 = Math.round((map.left - stage.left) * dpr), y0 = Math.round((map.top - stage.top) * dpr);
  const img = cv.getContext('2d').getImageData(x0, y0, Math.round(map.width * dpr), Math.round(map.height * dpr));
  const at = (x, y) => { const i = (Math.round(y * dpr) * img.width + Math.round(x * dpr)) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  const near = (c, r, g, b) => Math.abs(c[0] - r) < 40 && Math.abs(c[1] - g) < 40 && Math.abs(c[2] - b) < 40;
  const out = { gempa: 0, gempaPas: 0, insiden: 0, insidenPas: 0 };
  for (const c of document.querySelectorAll('.sr .sr-quake .sr-quake-core')) { out.gempa++; if (near(at(+c.getAttribute('cx'), +c.getAttribute('cy')), 57, 135, 229)) out.gempaPas++; }
  for (const c of document.querySelectorAll('.sr circle.sr-dot.is-incident')) { out.insiden++; if (near(at(+c.getAttribute('cx'), +c.getAttribute('cy')), 217, 89, 38)) out.insidenPas++; }
  return out;
});
await run('intro-login', { login: true }, async page => {
  const chunks = []; page.on('request', r => { if (/GlobeIntro-/.test(r.url())) chunks.push(r.url()); });
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  // tirai langsung menutup: cangkang di bawahnya tidak bisa disentuh, fokus di tombol Lewati
  if (await page.locator('div[inert]').count() !== 1) throw new Error('cangkang aplikasi tidak dibekukan selagi tirai menutup');
  if (await page.evaluate(() => document.activeElement?.className) !== 'intro-skip') throw new Error('fokus tidak di tombol Lewati');
  await expectText(page, '.intro', /RESTRICTED \/\/ FOUO/);
  await untilGlobe(page);
  if (chunks.length !== 1) throw new Error(`modul bola dunia harus dimuat tepat sekali, ${chunks.length} kali`);
  // merek di tirai berada tepat di atas merek TopBar, jadi tidak bergeser saat tirai memudar
  const brand = await page.evaluate(() => [...document.querySelectorAll('span.font-mono.text-base')].map(e => { const b = e.getBoundingClientRect(); return [e.textContent, Math.round(b.x * 2) / 2, Math.round(b.y * 2) / 2]; }));
  if (brand.length !== 2 || Math.abs(brand[0][1] - brand[1][1]) > 0.5 || Math.abs(brand[0][2] - brand[1][2]) > 1) throw new Error(`merek tirai tidak berimpit dengan merek TopBar: ${JSON.stringify(brand)}`);
  await step(page, 600);
  if (await shape(page) !== 0) throw new Error('bentuk peta sudah mulai padahal bola masih berputar');
  // keterangan memuat berisi angka yang sebenarnya dari server
  await expectText(page, '.intro-status', /Sesi\s*Analis Piket/);
  await expectText(page, '.intro-status', /Berita\s*32 dalam 7 hari/);
  await expectText(page, '.intro-status', /Gempa M ≥ 5\s*4 dalam 7 hari, BMKG/);
  await expectText(page, '.intro-status', /Peringatan cuaca\s*23 berlaku/);
  await expectText(page, '.intro-status', /CCTV\s*6 kamera/);
  await page.screenshot({ path: `${OUT}/s-intro-login-bola.png` });
  await step(page, 1400);                       // 2,0 dtk: masih bola, mulai mendekat
  if (await introPhase(page) !== 'on') throw new Error('tirai membuka terlalu cepat');
  await page.screenshot({ path: `${OUT}/s-intro-login-mendekat.png` });
  await step(page, 1700);                       // 3,7 dtk: sudah berimpit, tanda sudah menyala
  if (await shape(page) !== 1) throw new Error(`gambar belum berbentuk peta pada 3,7 dtk (${await shape(page)})`);
  const mk = await marksOnTop(page);
  if (mk.gempa !== 4 || mk.gempaPas !== 4 || mk.insiden < 3 || mk.insidenPas !== mk.insiden) throw new Error(`tanda tidak jatuh di atas aslinya: ${JSON.stringify(mk)}`);
  if (!await page.locator('.intro-status.is-out').count()) throw new Error('keterangan memuat belum memudar');
  await page.screenshot({ path: `${OUT}/s-intro-login-berimpit.png` });
  await step(page, 160);                        // 3,86 dtk: tanda selesai menyala, tirai belum memudar
  if (await introPhase(page) !== 'on') throw new Error('tirai memudar sebelum waktunya');
  const clip = await mapClip(page);
  await page.screenshot({ path: `${OUT}/s-intro-login-kotak-tirai.png`, clip });
  await step(page, 140);                        // 4,0 dtk: selesai, tirai memudar
  if (await introPhase(page) !== 'leaving') throw new Error(`tirai belum memudar pada 4,0 dtk (${await introPhase(page)})`);
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await page.addStyleTag({ content: HIDE_MAP_TEXT });
  await page.screenshot({ path: `${OUT}/s-intro-login-kotak-peta.png`, clip });
  const beda = pixelDiff(`${OUT}/s-intro-login-kotak-tirai.png`, `${OUT}/s-intro-login-kotak-peta.png`);
  console.log(`  (selisih piksel bingkai terakhir vs peta: ${(beda * 100).toFixed(3)}%)`);
  if (beda > 0.003) throw new Error(`bingkai terakhir tidak berimpit dengan peta: ${(beda * 100).toFixed(2)}% piksel berbeda`);
  if (await page.locator('div[inert]').count()) throw new Error('cangkang aplikasi masih beku setelah tirai hilang');
  await expectText(page, '#sr-tab-laporan', /Laporan\s*36/);
  if (await page.locator('.sr-map-svg circle.sr-dot').count() < 5) throw new Error('peta SITREP tidak tampil setelah animasi');
});
await run('intro-lewati', { login: true }, async page => {
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 900);
  // klik di mana saja = lewati
  await page.mouse.click(700, 500);
  await page.waitForTimeout(120);
  if (await introPhase(page) !== 'leaving') throw new Error('klik tidak melewati animasi');
  await page.screenshot({ path: `${OUT}/s-intro-lewati-pudar.png` });
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang setelah dilewati');
  // klik yang melewati animasi tidak boleh ikut menekan sesuatu di aplikasi di bawahnya
  if (await page.locator('.sr-chip').count() || await page.locator('.sr-item.is-open').count()) throw new Error('klik untuk melewati ikut menekan peta di bawah tirai');
  // keluar, masuk lagi: animasi diputar lagi; kali ini dilewati dengan Esc, lalu dengan tombolnya
  for (const how of ['Escape', 'tombol']) {
    await page.getByTitle('Logout').click();
    await page.locator('form input[type="password"]').waitFor();
    await doLogin(page);
    await page.locator('.intro').waitFor({ timeout: 5000 });
    await untilGlobe(page);
    await step(page, 500);
    if (how === 'Escape') await page.keyboard.press('Escape'); else await page.keyboard.press('Enter');   // fokus ada di tombol Lewati
    await page.waitForTimeout(120);
    if (await introPhase(page) !== 'leaving') throw new Error(`${how} tidak melewati animasi`);
    await step(page, 700);
    if (await introPhase(page) !== 'off') throw new Error(`tirai tidak hilang setelah ${how}`);
  }
});
await run('intro-muat-ulang', {}, async page => {
  // sesi lama dipulihkan (halaman dimuat ulang): tidak ada animasi, modul bola dunia tidak diambil
  const chunks = []; page.on('request', r => { if (/GlobeIntro-/.test(r.url())) chunks.push(r.url()); });
  await has(page, '.intro', 0, 'tirai saat sesi dipulihkan');
  const got = page.waitForResponse(r => r.url().includes('/sitrep/news'));
  await page.reload();
  await got; await page.waitForSelector('.sr');
  await page.clock.runFor(600); await page.waitForTimeout(300);
  await has(page, '.intro', 0, 'tirai setelah halaman dimuat ulang');
  if (chunks.length) throw new Error('modul bola dunia diambil padahal tidak ada login');
});
await run('intro-gerak-dikurangi', { login: true, reducedMotion: 'reduce' }, async page => {
  await doLogin(page);
  await page.waitForSelector('.sr', { timeout: 8000 });
  await page.clock.runFor(500); await page.waitForTimeout(200);
  await has(page, '.intro', 0, 'tirai padahal sistem meminta gerak dikurangi');
  await has(page, 'div[inert]', 0, 'cangkang beku');
});
await run('intro-data-lambat', { login: true }, async page => {
  // server butuh waktu untuk berita/gempa: animasi menunggu sebentar supaya tandanya sempat menyala, tetapi tidak selamanya
  await fetch('http://localhost:8099/__lambat?ms=2500');
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 1000);
  await expectText(page, '.intro-status', /Berita\s*memuat…/);
  await expectText(page, '.intro-status', /Gempa M ≥ 5\s*memuat…/);
  await expectText(page, '.intro-status', /CCTV\s*memuat…/);
  await step(page, 3200);                       // 4,2 dtk: lewat waktu selesai biasa, data belum tiba → masih menunggu
  if (await introPhase(page) !== 'on') throw new Error('animasi selesai padahal data hampir tiba');
  if (await shape(page) !== 1) throw new Error('gambar belum berbentuk peta');
  await has(page, '.sr .sr-quake', 0, 'tanda gempa di peta padahal data belum tiba');
  await page.waitForResponse(r => r.url().includes('/sitrep/gempa'), { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);               // data tiba (waktu sungguhan); jam animasi masih 4,2 dtk
  await step(page, 300);                        // 4,5 dtk: sapuan dari barat sedang berjalan
  await page.screenshot({ path: `${OUT}/s-intro-data-lambat-menyapu.png` });
  await step(page, 580);                        // 5,08 dtk: semua tanda sudah menyala (sapuan 0,48 dtk + muncul 0,32 dtk)
  const mk = await marksOnTop(page);
  if (mk.gempa !== 4 || mk.gempaPas !== 4 || mk.insidenPas !== mk.insiden) throw new Error(`tanda tidak menyala setelah datanya tiba: ${JSON.stringify(mk)}`);
  if (await introPhase(page) !== 'on') throw new Error('tirai membuka sebelum tanda selesai menyala');
  await page.screenshot({ path: `${OUT}/s-intro-data-lambat-menyala.png` });
  await step(page, 250);                        // 5,33 dtk: lewat batas tunggu
  if (await introPhase(page) !== 'leaving') throw new Error('animasi tidak selesai setelah tandanya menyala');
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
});
await run('intro-data-tak-tiba', { login: true }, async page => {
  // server tidak kunjung menjawab: animasi berhenti menunggu pada batasnya, aplikasi tetap terbuka
  await fetch('http://localhost:8099/__lambat?ms=20000');
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 5000);
  if (await introPhase(page) !== 'on') throw new Error('animasi selesai sebelum batas tunggu');
  await step(page, 350);                        // 5,35 dtk > batas 5,2 dtk
  if (await introPhase(page) !== 'leaving') throw new Error('animasi menunggu data melewati batasnya');
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await expectText(page, '.sr-map-note', /Memuat laporan/);
  await fetch('http://localhost:8099/__lambat?ms=0');
});
await run('intro-data-gagal', { login: true, sc: 'down' }, async page => {
  // server berita/gempa mati: animasi tetap berjalan sampai selesai dan mengatakan apa adanya
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 1200);
  await expectText(page, '.intro-status', /Berita\s*tidak terjangkau/);
  await expectText(page, '.intro-status', /Gempa M ≥ 5\s*tidak terjangkau/);
  await expectText(page, '.intro-status', /Peringatan cuaca\s*tidak terjangkau/);
  await expectText(page, '.intro-status', /CCTV\s*6 kamera/);
  await page.screenshot({ path: `${OUT}/s-intro-data-gagal-bola.png` });
  await step(page, 2800);                       // 4,0 dtk
  if (await introPhase(page) !== 'leaving') throw new Error('animasi tidak selesai tepat waktu saat data gagal');
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await expectText(page, '.sr-error', /Data SITREP tidak bisa dimuat/);
});
await run('intro-modul-gagal', { login: true }, async page => {
  // modul bola dunia tidak bisa diambil: tirai membuka sendiri, aplikasi tetap bisa dipakai
  await page.route('**/assets/GlobeIntro-*.js', r => r.abort());
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  for (let i = 0; i < 25 && await introPhase(page) === 'on'; i++) await step(page, 100);
  if (await introPhase(page) === 'on') throw new Error('tirai tidak membuka sendiri saat modul bola dunia gagal dimuat');
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await has(page, '.sr-map-svg', 1, 'peta SITREP');
  await has(page, 'div[inert]', 0, 'cangkang beku');
});
await run('intro-sesi-habis', { login: true }, async page => {
  // sesi kedaluwarsa di tengah animasi: kembali ke layar login tanpa tirai tersisa, dan login berikutnya mulai dari awal
  await fetch('http://localhost:8099/__lambat?ms=20000');      // supaya animasi masih berjalan saat sesi habis
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 1500);
  await fetch('http://localhost:8099/__sesi?habis=1');
  await step(page, 3000);                       // jajak /overview tiap 4 dtk mendapat 401
  await page.locator('form input[type="password"]').waitFor({ timeout: 5000 });
  await has(page, '.intro', 0, 'tirai di layar login');
  await fetch('http://localhost:8099/__sesi?habis=0');
  await fetch('http://localhost:8099/__lambat?ms=0');
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 400);
  if (await shape(page) !== 0) throw new Error('animasi tidak mulai dari awal setelah login ulang');
  await step(page, 3700);
  if (await introPhase(page) !== 'leaving') throw new Error('animasi kedua tidak selesai');
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
});
await run('intro-modul-lain', { login: true }, async page => {
  // animasinya menuju peta SITREP: bila yang terbuka setelah login modul lain, tidak ada animasi
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await step(page, 800);
  await page.getByRole('button', { name: /^DFIR$/i }).click();
  await step(page, 400);
  await page.getByTitle('Logout').click();
  await page.locator('form input[type="password"]').waitFor();
  await doLogin(page);
  await step(page, 600);
  await has(page, '.intro', 0, 'tirai padahal yang terbuka bukan SITREP');
  await has(page, '.sr', 0, 'SITREP');
});
await run('intro-sempit', { login: true, w: 800, h: 900 }, async page => {
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 700);
  await page.screenshot({ path: `${OUT}/s-intro-sempit-bola.png` });
  await step(page, 3160);                       // 3,86 dtk
  const clip = await mapClip(page);
  await page.screenshot({ path: `${OUT}/s-intro-sempit-kotak-tirai.png`, clip });
  await step(page, 900);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await page.addStyleTag({ content: HIDE_MAP_TEXT });
  await page.screenshot({ path: `${OUT}/s-intro-sempit-kotak-peta.png`, clip });
  const beda = pixelDiff(`${OUT}/s-intro-sempit-kotak-tirai.png`, `${OUT}/s-intro-sempit-kotak-peta.png`);
  console.log(`  (selisih piksel layar sempit: ${(beda * 100).toFixed(3)}%)`);
  if (beda > 0.003) throw new Error(`bingkai terakhir tidak berimpit dengan peta pada layar sempit: ${(beda * 100).toFixed(2)}% piksel berbeda`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error('halaman bergulir mendatar');
});
await run('intro-ubah-ukuran', { login: true }, async page => {
  // jendela diubah ukurannya di tengah animasi: gambar mengikuti peta yang baru
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 1200);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.waitForTimeout(250);
  await step(page, 2660);                       // 3,86 dtk
  const clip = await mapClip(page);
  await page.screenshot({ path: `${OUT}/s-intro-ubah-kotak-tirai.png`, clip });
  await step(page, 900);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await page.addStyleTag({ content: HIDE_MAP_TEXT });
  await page.screenshot({ path: `${OUT}/s-intro-ubah-kotak-peta.png`, clip });
  const beda = pixelDiff(`${OUT}/s-intro-ubah-kotak-tirai.png`, `${OUT}/s-intro-ubah-kotak-peta.png`);
  console.log(`  (selisih piksel setelah jendela diubah: ${(beda * 100).toFixed(3)}%)`);
  if (beda > 0.003) throw new Error(`bingkai terakhir tidak berimpit setelah jendela diubah: ${(beda * 100).toFixed(2)}% piksel berbeda`);
});
await run('intro-ubah-ukuran-akhir', { login: true }, async page => {
  // jendela diubah ukurannya SETELAH gambar berimpit (peta simpanan sudah dibuat): simpanan harus dibuat ulang
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 3700);
  if (await shape(page) !== 1) throw new Error(`gambar belum berimpit pada 3,7 dtk (${await shape(page)})`);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.waitForTimeout(250);
  // tanda dibaca ulang di tempat barunya dan menyala lagi; potret kotak peta tiap 40 ms sampai tirai mulai memudar
  let clip = null, n = 0;
  for (; n < 60 && await introPhase(page) === 'on'; n++) {
    await step(page, 40);
    if (await introPhase(page) !== 'on') break;
    clip = await mapClip(page);
    await page.screenshot({ path: `${OUT}/s-intro-ubah-akhir-kotak-tirai.png`, clip });
  }
  if (await introPhase(page) !== 'leaving') throw new Error(`animasi tidak selesai setelah jendela diubah di akhir (${await introPhase(page)}, ${n} langkah)`);
  if (n < 8) throw new Error(`animasi selesai terlalu cepat setelah jendela diubah (${n} langkah): tanda belum sempat menyala di tempat barunya`);
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await page.addStyleTag({ content: HIDE_MAP_TEXT });
  await page.screenshot({ path: `${OUT}/s-intro-ubah-akhir-kotak-peta.png`, clip });
  const beda = pixelDiff(`${OUT}/s-intro-ubah-akhir-kotak-tirai.png`, `${OUT}/s-intro-ubah-akhir-kotak-peta.png`);
  console.log(`  (selisih piksel setelah jendela diubah di akhir: ${(beda * 100).toFixed(3)}%, ${n} langkah)`);
  if (beda > 0.003) throw new Error(`bingkai terakhir tidak berimpit setelah jendela diubah di akhir: ${(beda * 100).toFixed(2)}% piksel berbeda`);
});
await run('intro-tersendat', { login: true }, async page => {
  // Halaman tersendat: bingkai datang berjarak 1 detik (fastForward = satu bingkai setelah lompatan waktu).
  // Animasi harus berhenti sejenak lalu lanjut dari tempat yang sama, bukan melompati bagian yang tak tergambar.
  const jeda = async () => { await page.clock.fastForward(1000); await page.waitForTimeout(120); };
  await pauseClock(page);
  await doLogin(page);
  await page.locator('.intro').waitFor({ timeout: 5000 });
  await untilGlobe(page);
  await step(page, 40);                         // bingkai pertama sudah tergambar; sendatan berikutnya jatuh di antara dua bingkai
  for (let i = 0; i < 3; i++) await jeda();     // 3 dtk berlalu, waktu animasi hanya maju 0,3 dtk
  await step(page, 1160);                       // waktu animasi ±1,5 dtk: bola masih berputar
  if (await introPhase(page) !== 'on') throw new Error(`animasi sudah selesai padahal baru tersendat di awal (${await introPhase(page)})`);
  if (await shape(page) !== 0) throw new Error('bentuk peta sudah mulai: waktu animasi melompat');
  if (await page.locator('.intro-status.is-out').count()) throw new Error('keterangan memuat sudah memudar: waktu animasi melompat');
  await page.screenshot({ path: `${OUT}/s-intro-tersendat-bola.png` });
  await step(page, 1000);                       // 2,5 dtk: sedang mendekat
  await jeda();                                 // tersendat lagi di tengah gerakan: 2,6 dtk
  if (await introPhase(page) !== 'on') throw new Error('animasi selesai saat tersendat di tengah');
  if (await page.locator('.intro-status.is-out').count()) throw new Error('keterangan memuat memudar terlalu cepat setelah tersendat di tengah');
  await step(page, 1100);                       // 3,7 dtk: sudah berimpit, tanda sudah menyala
  if (await shape(page) !== 1) throw new Error(`gambar belum berbentuk peta pada 3,7 dtk waktu animasi (${await shape(page)})`);
  const mk = await marksOnTop(page);
  if (mk.gempa !== 4 || mk.gempaPas !== 4 || mk.insiden < 3 || mk.insidenPas !== mk.insiden) throw new Error(`tanda tidak jatuh di atas aslinya: ${JSON.stringify(mk)}`);
  // sisa waktu animasi sampai 3,9 dtk ±0,2 dtk: maju 20 ms sekali sambil memotret kotak peta, sampai tirai mulai memudar
  const clip = await mapClip(page);
  let n = 0;
  for (; n < 30 && await introPhase(page) === 'on'; n++) {
    await page.screenshot({ path: `${OUT}/s-intro-tersendat-kotak-tirai.png`, clip });
    await step(page, 20);
  }
  if (await introPhase(page) !== 'leaving') throw new Error(`tirai belum memudar (${await introPhase(page)}, ${n} langkah)`);
  if (n < 5 || n > 16) throw new Error(`animasi berakhir ${n * 20} ms setelah 3,7 dtk waktu animasi; seharusnya sekitar 200 ms`);
  await step(page, 700);
  if (await introPhase(page) !== 'off') throw new Error('tirai tidak hilang');
  await page.addStyleTag({ content: HIDE_MAP_TEXT });
  await page.screenshot({ path: `${OUT}/s-intro-tersendat-kotak-peta.png`, clip });
  const beda = pixelDiff(`${OUT}/s-intro-tersendat-kotak-tirai.png`, `${OUT}/s-intro-tersendat-kotak-peta.png`);
  console.log(`  (selisih piksel setelah tersendat: ${(beda * 100).toFixed(3)}%; tirai memudar ${n * 20} ms setelah 3,7 dtk waktu animasi)`);
  if (beda > 0.003) throw new Error(`bingkai terakhir tidak berimpit setelah tersendat: ${(beda * 100).toFixed(2)}% piksel berbeda`);
});
// ── Keterangan negara di bola dunia ──
// Tiap tulisan yang digambar ke canvas dicatat (fillText dibungkus sebelum aplikasi dimuat), lalu diperiksa:
// namanya berasal dari daftar negara, yang terbaca tidak saling menimpa, Indonesia ada dan ditebalkan,
// dan semuanya sudah hilang sebelum gambar berubah menjadi peta SITREP.
const NEGARA_SAH = new Set(JSON.parse(readFileSync(`${AKAR}/tfael-omni/src/components/sitrep/geo/dunia-negara.json`, 'utf8')).negara.map(r => r[0]));
const catatTeks = () => {
  const asli = CanvasRenderingContext2D.prototype.fillText;
  window.__teks = [];
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
    window.__teks.push({ t: performance.now(), text: String(text), x, y, a: this.globalAlpha, font: this.font, w: this.measureText(String(text)).width });
    return asli.call(this, text, x, y, ...rest);
  };
};
/** Maju ms, lalu kembalikan keterangan negara yang digambar pada bingkai terakhir (angka gugus kamera tidak dihitung). */
const majuLaluBaca = async (page, ms) => {
  await page.evaluate(() => { window.__teks.length = 0; });
  await step(page, ms);
  return page.evaluate(() => {
    const all = window.__teks.filter(e => !/^\d+$/.test(e.text));
    if (!all.length) return [];
    const t = all[all.length - 1].t;
    return all.filter(e => e.t === t);
  });
};
for (const [name, opts, min] of [['intro-negara', {}, 14], ['intro-negara-sempit', { w: 800, h: 900 }, 10], ['intro-negara-pendek', { w: 1366, h: 700 }, 8], ['intro-negara-kecil', { w: 569, h: 706 }, 5]]) {
  await run(name, { login: true, init: catatTeks, ...opts }, async page => {
    await pauseClock(page);
    await doLogin(page);
    await page.locator('.intro').waitFor({ timeout: 5000 });
    await untilGlobe(page);
    let at = 0;
    for (const t of [1000, 1400, 1800, 2200, 2600]) {
      const teks = await majuLaluBaca(page, t - at); at = t;
      const asing = teks.filter(e => !NEGARA_SAH.has(e.text)).map(e => e.text);
      if (asing.length) throw new Error(`${t} ms: tulisan di luar daftar negara: ${asing.join(', ')}`);
      const terbaca = teks.filter(e => e.a >= 0.6);
      // saat mendekat yang terlihat tinggal Asia Tenggara dan sekitarnya: cukup separuhnya
      const perlu = t <= 1800 ? min : Math.ceil(min / 2);
      if (terbaca.length < perlu) throw new Error(`${t} ms: hanya ${terbaca.length} keterangan negara yang terbaca (minimal ${perlu})`);
      const ganda = terbaca.map(e => e.text).filter((v, i, arr) => arr.indexOf(v) !== i);
      if (ganda.length) throw new Error(`${t} ms: negara digambar dua kali: ${ganda.join(', ')}`);
      // kotak tulisan: lebar terukur, tinggi dari garis dasar (naik ±10 px, turun ±3 px)
      for (let i = 0; i < terbaca.length; i++) for (let j = i + 1; j < terbaca.length; j++) {
        const p = terbaca[i], q = terbaca[j];
        if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < 13) throw new Error(`${t} ms: "${p.text}" dan "${q.text}" bertumpuk`);
      }
      const luar = terbaca.filter(e => e.x + e.w / 2 < 0 || e.x - e.w / 2 > page.viewportSize().width || e.y < 0 || e.y > page.viewportSize().height + 12).map(e => e.text);
      if (luar.length) throw new Error(`${t} ms: keterangan digambar di luar layar: ${luar.join(', ')}`);
      const id = teks.find(e => e.text === 'Indonesia');
      if (t >= 1800 && !(id && id.a >= 0.6 && /^600 /.test(id.font))) throw new Error(`${t} ms: keterangan Indonesia tidak terbaca atau tidak ditebalkan: ${JSON.stringify(id)}`);
      if (Number(await page.locator('.intro-stage canvas').getAttribute('data-negara')) < perlu) throw new Error(`${t} ms: data-negara lebih kecil dari ${perlu}`);
      console.log(`  ${t} ms: ${terbaca.length} terbaca${t === 1800 ? ` (${terbaca.slice(0, 9).map(e => e.text).join(', ')}, …)` : ''}`);
      await page.screenshot({ path: `${OUT}/s-${name}-${t}.png` });
    }
    await step(page, 700);                        // 3,3 dtk: gambar hampir berimpit
    const sisa = await majuLaluBaca(page, 60);    // bingkai-bingkai sesudahnya tidak boleh lagi menggambar keterangan negara
    if (sisa.length) throw new Error(`3,3 dtk: masih ada keterangan negara: ${sisa.map(e => e.text).join(', ')}`);
    if (await page.locator('.intro-stage canvas').getAttribute('data-negara') !== '0') throw new Error('3,3 dtk: data-negara belum 0');
    if (await shape(page) < 0.9) throw new Error('3,3 dtk: gambar belum mendekati bentuk peta');
  });
}
await run('galat', { sc: 'down' }, async () => {});
await run('simulasi', { sc: 'mock' }, async () => {});
await run('parsial', { sc: 'partial' }, async () => {});
await run('sepi', { sc: 'quiet' }, async () => {});
await run('lebar-1180', { w: 1180, h: 800 }, async () => {});
await run('lebar-1024', { w: 1024, h: 768 }, async () => {});
await run('lebar-800', { w: 800, h: 900 }, async () => {});
await run('besar-1920', { w: 1920, h: 1080 }, async () => {});
await run('pendek-1366', { w: 1366, h: 700 }, async () => {});
console.log(allLogs.length ? `\nLOG KONSOL:\n${allLogs.join('\n')}` : '\n(konsol bersih di semua keadaan, di luar 404 font shell yang sudah ada)');
