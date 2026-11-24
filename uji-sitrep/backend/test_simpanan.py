#!/usr/bin/env python3
"""Uji jawab-dari-simpanan engine_sitrep.py tanpa jaringan. Pakai: python3 -B test_simpanan.py <folder>"""
import sys, time, threading
sys.path.insert(0, sys.argv[1])
import engine_sitrep as E
ok = True
def check(name, cond, detail=""):
    global ok
    if not cond: ok = False
    print(("  lulus  " if cond else "  GAGAL  ") + name + (("  -> " + str(detail)) if not cond else ""))
calls = {"n": 0, "fail": False}
def fake_fetch(url, timeout=8):
    calls["n"] += 1
    time.sleep(0.4)                       # umpan yang lambat
    if calls["fail"]: return None
    return '<rss><channel><item><title>Berita %d dari %s</title><link>https://example.test/x</link><pubDate>Sat, 14 Nov 2026 19:07:00 +0700</pubDate></item></channel></rss>' % (calls["n"], url[-12:])
E._fetch_url = fake_fetch
def timed(f):
    t = time.time(); r = f(); return r, time.time() - t
# 1. permintaan pertama: menunggu pengambilan
r1, d1 = timed(E.fetch_news_feed)
check("pertama: menunggu pengambilan (>=0,4 dtk) dan berisi berita", d1 >= 0.39 and len(r1) >= 5, (d1, len(r1)))
n1 = calls["n"]
# 2. masih segar: langsung, tanpa pengambilan
r2, d2 = timed(E.fetch_news_feed)
check("segar: langsung dan tanpa pengambilan baru", d2 < 0.05 and calls["n"] == n1 and r2 is r1, (d2, calls["n"]))
# 3. simpanan habis (dituakan): tetap langsung, penyegaran di latar, lalu isi baru
E._CACHE["news_feed"]["ts"] -= 200
r3, d3 = timed(E.fetch_news_feed)
check("basi: tetap langsung dijawab dengan isi lama", d3 < 0.05 and r3 is r1, d3)
r3b, d3b = timed(E.fetch_news_feed)
check("basi: permintaan kedua tidak memulai pengambilan ganda", d3b < 0.05, d3b)
time.sleep(1.2)
check("penyegaran latar: tepat satu putaran pengambilan (8 umpan)", calls["n"] == n1 + 8, calls["n"] - n1)
r4, d4 = timed(E.fetch_news_feed)
check("sesudah penyegaran: isi baru, langsung", d4 < 0.05 and r4 is not r1 and len(r4) >= 5, d4)
# 4. penyegaran gagal: simpanan lama dipertahankan, bukan diganti data simulasi
calls["fail"] = True
E._CACHE["news_feed"]["ts"] -= 200
r5, _ = timed(E.fetch_news_feed); time.sleep(1.0)
r6, _ = timed(E.fetch_news_feed)
check("penyegaran gagal: isi lama tetap dipakai", r5 is r4 and r6 is r4)
# 5. simpanan terlalu tua + gagal: jatuh ke data simulasi seperti sebelumnya (bertanda mock)
E._CACHE["news_feed"]["ts"] -= 5000
r7, d7 = timed(E.fetch_news_feed)
check("terlalu tua + gagal: menunggu lalu data simulasi", d7 >= 0.39 and r7 == E._mock_news() or [x.get("title") for x in r7] == [x.get("title") for x in E._mock_news()], d7)
calls["fail"] = False
# 6. penjaga: selama masih diminta, simpanan disegarkan sebelum habis
E.REFRESH_AT = 1; E._CACHE.pop("news_feed", None)
E.fetch_news_feed(); nb = calls["n"]
orig_sleep = time.sleep
t0 = time.time()
while time.time() - t0 < 13 and calls["n"] == nb: orig_sleep(0.5)
check("penjaga latar menyegarkan tanpa diminta (dalam 13 dtk)", calls["n"] > nb, calls["n"] - nb)
# 7. air-gap: tidak ada pengambilan, penjaga berhenti
E.REFRESH_AT = 80
nc = calls["n"]; orig_sleep(1.0); nc = calls["n"]
ra = E.fetch_news_feed(airgap=True)
check("air-gap: tidak mengambil ke luar", calls["n"] == nc and len(ra) > 0)
check("air-gap: penjaga tidak lagi punya pengambil", len(E._SWR_BUILD) == 0)
# 8. gempa memakai jalur yang sama
E._fetch_url = lambda url, timeout=8: '{"Infogempa":{"gempa":[{"Magnitude":"5.6","Lintang":"3.2 LS","Bujur":"128.1 BT","DateTime":"2026-11-14T10:00:00+00:00","Wilayah":"Laut Banda","Kedalaman":"10 km"}]}}'
g = E.fetch_bmkg_gempa()
check("gempa: terbaca dan tersimpan", len(g) == 1 and g[0]["mag"] == 5.6 and g[0]["lat"] == -3.2 and E._cache_peek("bmkg_gempa")[0] is g, g)
print("SEMUA LULUS" if ok else "ADA YANG GAGAL"); sys.exit(0 if ok else 1)
