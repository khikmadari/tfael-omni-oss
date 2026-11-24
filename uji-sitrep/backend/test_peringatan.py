#!/usr/bin/env python3
"""Uji fetch_bmkg_warnings tanpa jaringan, memakai contoh XML resmi BMKG (github.com/infoBMKG/data-cap).
Pakai: python3 -B test_peringatan.py <folder engine_sitrep.py> <folder contoh BMKG>"""
import json, re, sys
from datetime import datetime, timezone, timedelta
sys.path.insert(0, sys.argv[1])
import engine_sitrep as E
S = sys.argv[2]
FEED = open(S + "/nowcast-feed-id.xml", encoding="utf-8").read()
CAP = open(S + "/nowcast-cap-id.xml", encoding="utf-8").read()

ok = True
def check(name, cond, detail=""):
    global ok
    if not cond: ok = False
    print(("  lulus  " if cond else "  GAGAL  ") + name + (("  -> " + str(detail)[:300]) if detail and not cond else ""))

WIB = timezone(timedelta(hours=7))
ts = lambda *a: datetime(*a, tzinfo=WIB).timestamp()

# ── potongan kecil ──
check("waktu WIB", E._waktu_lokal_ts("12 October 2025, 16:00 WIB") == ts(2025, 10, 12, 16, 0))
check("waktu WITA", E._waktu_lokal_ts("12 Oktober 2025, 16:00 WITA") == ts(2025, 10, 12, 15, 0))
check("waktu WIT, titik sebagai pemisah", E._waktu_lokal_ts("3 Mei 2026 09.05 WIT") == ts(2026, 5, 3, 7, 5))
check("waktu tak terbaca -> None", E._waktu_lokal_ts("besok sore") is None and E._waktu_lokal_ts("31 February 2026, 10:00 WIB") is None)
items = E._parse_nowcast_feed(FEED)
check("feed contoh: 25 butir", len(items) == 25, len(items))
check("butir pertama terurai", items[0]["id"] == "CJT20251012004" and items[0]["event"] == "Hujan Lebat disertai Petir" and items[0]["area"] == "Jawa Timur" and items[0]["issued_ts"] == ts(2025, 10, 12, 15, 30), items[0])
check("masa berlaku dari uraian", E._masa_dari_uraian(items[0]["description"]) == (ts(2025, 10, 12, 16, 0), ts(2025, 10, 12, 18, 0)))
cap = E._parse_cap(CAP)
check("CAP contoh: masa berlaku, wilayah, 29 poligon [lon, lat]", cap["effective_ts"] == ts(2025, 10, 13, 12, 23) and cap["expires_ts"] == ts(2025, 10, 13, 14, 30) and cap["area"] == "Jawa Barat" and len(cap["polygons"]) == 29 and cap["polygons"][0][0] == [107.424, -6.987] and cap["severity"] == "Moderate", {k: v for k, v in cap.items() if k != "polygons"})
check("CAP rusak -> None", E._parse_cap("<alert><bukan") is None and E._parse_cap("<alert/>") is None)
EVIL_URL = "http://169.254.169.254/latest/meta-data"
evil = FEED.replace("https://www.bmkg.go.id/alerts/nowcast/id/CJT20251012004_alert.xml", EVIL_URL)
ev = E._parse_nowcast_feed(evil)
check("tautan ke luar bmkg.go.id: butir tetap dipakai, tautannya dikosongkan, id dari guid", len(ev) == 25 and ev[0]["link"] == "" and ev[0]["id"] == "2.49.0.1.360.0.2025.10.12.08.35.004" and ev[0]["area"] == "Jawa Timur", ev[0])
ok_links = ["https://www.bmkg.go.id/alerts/nowcast/id/CJT20251012004_alert.xml", "https://nowcasting.bmkg.go.id/x.xml", "https://bmkg.go.id/a", "https://WWW.BMKG.GO.ID/a"]
bad_links = ["http://www.bmkg.go.id/a", "https://bmkg.go.id.contoh.test/a", "https://contoh.test/?u=https://www.bmkg.go.id/", "https://admin@www.bmkg.go.id/a",
             "https://www.bmkg.go.id:8443/a", "https://169.254.169.254/a", "file:///etc/passwd", "https://www.bmkg.go.id@contoh.test/a", "https://xbmkg.go.id/a", "", "https://[::1/a"]
check("tautan rincian: hanya https ke bmkg.go.id dan subdomainnya", all(E._bmkg_link(u) == u for u in ok_links) and not any(E._bmkg_link(u) for u in bad_links), [u for u in bad_links if E._bmkg_link(u)])

# ── alur penuh dengan jaringan tiruan ──
calls = []
state = {"feed": FEED, "cap_fail": set(), "now": ts(2025, 10, 12, 16, 30)}
def cap_for(link):
    it = next(i for i in E._parse_nowcast_feed(FEED) if i["link"] == link)
    a, b = E._masa_dari_uraian(it["description"])
    iso = lambda t: datetime.fromtimestamp(t, WIB).isoformat()
    x = CAP.replace("2025-10-13T12:23:00+07:00", iso(a)).replace("2025-10-13T14:30:00+07:00", iso(b))
    return x.replace("<areaDesc>Jawa Barat</areaDesc>", "<areaDesc>%s</areaDesc>" % it["area"])
def fake_fetch(url, timeout=8):
    calls.append(url)
    if url == E.BMKG_NOWCAST_RSS: return state["feed"]
    if url in state["cap_fail"]: return None
    return cap_for(url)
E._fetch_url = fake_fetch
E.time.time = lambda: state["now"]          # modul memakai time.time() untuk "sekarang" dan cache
def fresh(): E._CACHE.clear(); E._WARN_SHORT["res"] = None; calls.clear()

fresh(); r = E.fetch_bmkg_warnings()
ends = {i["id"]: E._masa_dari_uraian(i["description"])[1] for i in items}
want = sorted(k for k, v in ends.items() if v > state["now"])
check("hanya yang masih berlaku pukul 16.30 WIB", r["ok"] and sorted(w["id"] for w in r["warnings"]) == want and 0 < len(want) < 25, (len(r["warnings"]), len(want)))
check("rincian CAP hanya diambil untuk yang berlaku", len(calls) == 1 + len(want), len(calls))
w = next(x for x in r["warnings"] if x["id"] == "CJT20251012004")
check("isi peringatan lengkap", w["area"] == "Jawa Timur" and w["event"] == "Hujan Lebat disertai Petir" and w["effective"] == "2025-10-12T09:00:00+00:00" and w["expires"] == "2025-10-12T11:00:00+00:00" and w["detail"] and len(w["polygons"]) == 29 and w["severity"] == "Moderate" and w["infographic"].startswith("https://nowcasting.bmkg.go.id/") and w["expires_estimated"] is False, {k: v for k, v in w.items() if k not in ("polygons", "description")})
check("urut menurut waktu berakhir", [x["expires"] for x in r["warnings"]] == sorted(x["expires"] for x in r["warnings"]))
json.dumps(r); size = len(json.dumps(r))
check("bisa di-JSON-kan, ukuran wajar (< 400 KB)", size < 400_000, size)
n1 = len(calls); r2 = E.fetch_bmkg_warnings()
check("cache 2 menit: panggilan kedua tanpa jaringan", len(calls) == n1 and r2 is r)
E._CACHE.clear(); calls.clear(); E.fetch_bmkg_warnings()
check("setelah cache habis: hanya feed yang diambil ulang, rincian tidak", calls == [E.BMKG_NOWCAST_RSS], calls)

# semua sudah lewat -> daftar kosong tetapi ok
state["now"] = ts(2025, 10, 13, 9, 0); fresh(); r = E.fetch_bmkg_warnings()
check("semua lewat masa berlaku: ok, kosong, tanpa mengambil rincian", r["ok"] and r["warnings"] == [] and r["in_feed"] == 25 and calls == [E.BMKG_NOWCAST_RSS], r)
state["now"] = ts(2025, 10, 12, 16, 30)

# rincian gagal -> peringatan tetap ada, tanpa poligon, masa berlaku dari uraian
E._CAP_DETAIL_CACHE.clear(); state["cap_fail"] = {i["link"] for i in items}; fresh(); r = E.fetch_bmkg_warnings()
w = next(x for x in r["warnings"] if x["id"] == "CJT20251012004")
check("rincian CAP gagal: tetap tampil, poligon kosong, masa dari uraian", len(r["warnings"]) == len(want) and w["polygons"] == [] and w["detail"] is False and w["expires"] == "2025-10-12T11:00:00+00:00" and w["area"] == "Jawa Timur", {k: v for k, v in w.items() if k != "description"})
state["cap_fail"] = set()

# uraian tanpa jam berakhir -> perkiraan 3 jam sejak terbit, ditandai
state["feed"] = re.sub(r"Kondisi diperkirakan dapat berlangsung hingga[^<]*", "", FEED); state["cap_fail"] = {i["link"] for i in items}
E._CAP_DETAIL_CACHE.clear(); fresh(); r = E.fetch_bmkg_warnings()
w = next((x for x in r["warnings"] if x["id"] == "CJT20251012004"), None)
check("tanpa jam berakhir: 3 jam sejak terbit dan ditandai perkiraan", w and w["expires_estimated"] is True and w["expires"] == "2025-10-12T11:30:00+00:00", w and {k: v for k, v in w.items() if k not in ("description", "polygons")})
state["feed"] = FEED; state["cap_fail"] = set()

# kegagalan sumber: tidak ada data pengganti
state["feed"] = None; E._CAP_DETAIL_CACHE.clear(); fresh(); r = E.fetch_bmkg_warnings()
check("feed tidak terjangkau: ok False, kosong", r["ok"] is False and r["warnings"] == [] and "tidak terjangkau" in r["error"], r)
state["feed"] = "<html>503 Service Unavailable</html>"; fresh(); r = E.fetch_bmkg_warnings()
check("feed bukan RSS: ok False", r["ok"] is False and r["warnings"] == [], r)
state["feed"] = '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>'; fresh(); r = E.fetch_bmkg_warnings()
check("feed sah tanpa butir: ok True, kosong", r["ok"] is True and r["warnings"] == [], r)
state["feed"] = FEED; fresh(); r = E.fetch_bmkg_warnings(airgap=True)
check("air-gap: ok False, tanpa jaringan, tanpa data tiruan", r["ok"] is False and r["warnings"] == [] and calls == [], (r, calls))
fresh(); E.fetch_bmkg_warnings(); 
check("cache rincian dipangkas ke isi feed", set(E._CAP_DETAIL_CACHE) <= {i["link"] for i in items})

# kegagalan diingat 30 detik: BMKG yang sedang mati tidak ditanya pada tiap permintaan
state["feed"] = None; fresh(); r1 = E.fetch_bmkg_warnings(); n = len(calls); r2 = E.fetch_bmkg_warnings()
check("gagal: permintaan berikutnya dalam 30 detik tidak ke jaringan", r1["ok"] is False and r2 is r1 and len(calls) == n == 1, (n, len(calls)))
state["feed"] = FEED; state["now"] += 31; r3 = E.fetch_bmkg_warnings()
check("gagal: setelah 30 detik dicoba lagi dan pulih", r3["ok"] is True and len(r3["warnings"]) > 0, r3.get("error"))
state["now"] -= 31

# rincian yang lambat tidak menahan jawaban; peringatannya tetap keluar tanpa poligon dan rinciannya menyusul
import threading, time as _t
gate = threading.Event(); slow = items[0]["link"]
def slow_fetch(url, timeout=8):
    if url == slow: gate.wait(5)
    return fake_fetch(url, timeout)
E._fetch_url = slow_fetch; E._CAP_DETAIL_CACHE.clear(); fresh()
_wait = E.concurrent.futures.wait
E.concurrent.futures.wait = lambda fs, timeout=None: _wait(fs, timeout=0.6)
t0 = _t.monotonic(); r = E.fetch_bmkg_warnings(); dt = _t.monotonic() - t0
E.concurrent.futures.wait = _wait
w = next(x for x in r["warnings"] if x["link"] == slow)
others = [x for x in r["warnings"] if x["link"] != slow]
check("rincian lambat: jawaban tidak menunggu (< 2 detik), yang lain lengkap", dt < 2 and w["detail"] is False and w["polygons"] == [] and all(x["detail"] for x in others), (round(dt, 2), w["detail"]))
gate.set(); _t.sleep(0.3)
check("rincian lambat: hasilnya tetap masuk cache untuk putaran berikut", slow in E._CAP_DETAIL_CACHE)
check("hasil yang belum lengkap tidak disimpan 2 menit", E._cache_get("bmkg_warnings") is None and E.fetch_bmkg_warnings() is r)
calls.clear(); state["now"] += 31; r = E.fetch_bmkg_warnings(); state["now"] -= 31
w = next(x for x in r["warnings"] if x["link"] == slow)
check("30 detik kemudian: poligonnya sudah ada, hanya feed yang diambil ulang", w["detail"] is True and len(w["polygons"]) == 29 and calls == [E.BMKG_NOWCAST_RSS], calls)
check("hasil lengkap disimpan 2 menit", E._cache_get("bmkg_warnings") is r)
E._fetch_url = fake_fetch

# dua permintaan bersamaan saat cache kosong: hanya satu yang ke jaringan
fresh(); E._CAP_DETAIL_CACHE.clear(); res = []
ths = [threading.Thread(target=lambda: res.append(E.fetch_bmkg_warnings())) for _ in range(4)]
[th.start() for th in ths]; [th.join() for th in ths]
check("permintaan bersamaan: feed diambil sekali, semua mendapat hasil yang sama", calls.count(E.BMKG_NOWCAST_RSS) == 1 and all(x is res[0] for x in res) and len(res) == 4, calls.count(E.BMKG_NOWCAST_RSS))
# butir dengan tautan asing: ikut tampil tanpa poligon, tautannya tidak pernah dipanggil, dan hasilnya dianggap lengkap
state["feed"] = evil; E._CAP_DETAIL_CACHE.clear(); fresh(); r = E.fetch_bmkg_warnings()
w = next((x for x in r["warnings"] if x["id"] == "2.49.0.1.360.0.2025.10.12.08.35.004"), None)
check("tautan asing: peringatan tampil tanpa poligon, tautan tidak dipanggil", w is not None and w["detail"] is False and w["polygons"] == [] and w["area"] == "Jawa Timur" and w["link"] == "" and EVIL_URL not in calls and not any("169.254" in c for c in calls), calls[:3])
check("tautan asing: hasil tetap lengkap dan disimpan 2 menit", r["complete"] is True and E._cache_get("bmkg_warnings") is r)

# feed terpotong di tengah (batas baca 512 KB) atau XML rusak: itu kegagalan, bukan "tidak ada peringatan"
state["feed"] = FEED[: len(FEED) // 2]; fresh(); r = E.fetch_bmkg_warnings()
check("feed terpotong: ok False (tidak pernah 'tidak ada peringatan')", r["ok"] is False and "tidak terbaca" in r["error"], r)
state["feed"] = FEED.replace("<title>", "<judul>").replace("</title>", "</judul>"); fresh(); r = E.fetch_bmkg_warnings()
check("feed berubah bentuk (butir tanpa judul): ok False", r["ok"] is False, r)
state["feed"] = FEED
print("\nSEMUA LULUS" if ok else "\nADA YANG GAGAL"); sys.exit(0 if ok else 1)
