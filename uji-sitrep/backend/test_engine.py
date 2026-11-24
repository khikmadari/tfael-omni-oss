#!/usr/bin/env python3
"""Uji engine_sitrep.py tanpa jaringan. Pakai: python3 -B test_engine.py <folder berisi engine_sitrep.py>"""
import json, sys, time
sys.path.insert(0, sys.argv[1])
import engine_sitrep as E

ok = True
def check(name, cond, detail=""):
    global ok
    if not cond: ok = False
    print(("  lulus  " if cond else "  GAGAL  ") + name + (("  -> " + str(detail)) if detail and not cond else ""))

# 1. tanggal
exp = 1794658020.0   # 2026-11-14T12:07:00Z
for s in ["Sat, 14 Nov 2026 19:07:00 +0700", "Sat, 14 Nov 2026 12:07:00 GMT", "Sat, 14 Nov 2026 12:07:00 +0000",
          "2026-11-14T12:07:00Z", "2026-11-14T19:07:00+07:00", "14 Nov 2026 12:07:00 GMT", "  Sat, 14 Nov 2026 19:07:00 +0700  "]:
    check("tanggal %r" % s, E._parse_date_ts(s) == exp, E._parse_date_ts(s))
for s in ["", None, "kemarin sore", "0000-00-00"]:
    check("tanggal tak terbaca %r -> 0.0 (bukan 'sekarang')" % (s,), E._parse_date_ts(s) == 0.0, E._parse_date_ts(s))

# 2. RSS: entitas, tag, tanggal
rss = """<?xml version="1.0"?><rss><channel>
<item><title>Banjir &amp; longsor di Garut, 3 desa terisolasi</title><link>https://example.test/a</link>
 <description><![CDATA[<img src="x.jpg"/><p>Warga&nbsp;mengungsi &#8211; BPBD &amp; TNI turun tangan.</p>]]></description>
 <pubDate>Sat, 14 Nov 2026 19:07:00 +0700</pubDate></item>
<item><title>Enam Napi Target Operasi Narkoba di Lapas Tarakan Dipindahkan</title><link>https://example.test/b</link>
 <description>Pemindahan dilakukan dini hari.</description><pubDate>Sat, 14 Nov 2026 18:00:00 +0700</pubDate></item>
<item><title>Indeks demokrasi naik, lapisan masyarakat makin kritis</title><link>https://example.test/c</link>
 <description>Kereta api tambahan disiapkan.</description><pubDate>bukan tanggal</pubDate></item>
</channel></rss>"""
items = E._parse_rss(rss, "Uji", "nasional")
check("3 item terbaca", len(items) == 3, len(items))
check("judul: &amp; terurai", items[0]["title"] == "Banjir & longsor di Garut, 3 desa terisolasi", items[0]["title"])
check("ringkasan: tag hilang, &nbsp; dan &#8211; terurai", items[0]["summary"] == "Warga mengungsi – BPBD & TNI turun tangan.".replace(" ", " "), repr(items[0]["summary"]))
check("ts dari pubDate +0700", items[0]["ts"] == exp, items[0]["ts"])
check("ts tak terbaca = 0.0", items[2]["ts"] == 0.0, items[2]["ts"])

# 3. insiden: tanpa positif palsu, tanpa koordinat karangan
inc = {i["id"]: i for i in E.synthesize_incidents(items, [])}
a, b, c = (inc.get(it["id"]) for it in items)
check("banjir Garut -> banjir, berlokasi di Garut", a and a["type"] == "banjir" and a["located"] and a["location"] == "Garut" and (a["lat"], a["lon"]) == (-7.21, 107.91), a)
check("'Napi ... Narkoba' -> kriminal (bukan kebakaran dari 'api')", b and b["type"] == "kriminal", b)
check("Tarakan tidak ada di tabel kota -> lat/lon None, located False", b and b["lat"] is None and b["lon"] is None and b["located"] is False, b)
check("'demokrasi', 'lapisan', 'kereta api' bukan insiden", c is None, c)
many = [{"id": "x%d" % i, "title": t, "summary": "", "source": "Uji"} for i, t in enumerate([
    "Kebakaran pasar di Kembali Jaya", "Tawuran pelajar pecah lagi", "Tabrakan beruntun di tol", "Karhutla meluas", "Demo buruh di Medan"])]
out = E.synthesize_incidents(many, [])
check("5 insiden nyata dikenali", [o["type"] for o in out] == ["kebakaran", "demo", "kecelakaan", "kebakaran", "demo"], [o["type"] for o in out])
check("'Kembali' tidak terbaca sebagai Bali", out[0]["located"] is False, out[0])
check("'di Medan' -> Medan", out[4]["located"] and out[4]["location"] == "Medan", out[4])
check("tidak ada koordinat acak", all((o["lat"] is None) == (not o["located"]) for o in out))

# 4. gempa BMKG diteruskan apa adanya
g = [{"id": "bmkg_x", "mag": 5.5, "location": "20 km BaratLaut SERAMBAGIANTIMUR-MALUKU", "lat": -3.1, "lon": 130.4, "severity": "high", "source": "BMKG", "datetime": "2026-11-09T09:48:11+00:00"}]
out = E.synthesize_incidents([], g)
check("gempa tetap punya koordinat asli", out[0]["lat"] == -3.1 and out[0]["lon"] == 130.4)

# 5. data simulasi bertanda
check("mock berita bertanda simulated", all(n.get("simulated") is True for n in E._mock_news()) and len(E._mock_news()) == 12)
check("mock gempa bertanda simulated", all(n.get("simulated") is True for n in E._mock_gempa()) and len(E._mock_gempa()) == 3)
check("mock ticker bertanda simulated", all(n.get("simulated") is True for n in E._mock_ticker()) and len(E._mock_ticker()) == 6)
check("mode airgap tetap jalan", len(E.fetch_news_feed(True)) == 12 and len(E.fetch_bmkg_gempa(True)) == 3 and len(E.fetch_idx_ticker(True)) == 6)

# 6. dashboard airgap: bisa di-JSON-kan, bentuk tetap
E._CACHE.clear()
d = E.get_sitrep_dashboard(True)
json.dumps(d)
check("dashboard: kunci lama tetap ada", all(k in d for k in ("timestamp", "total_incidents", "incidents", "news", "gempa", "ticker", "incident_counts", "alert_level")), list(d))

print("\nSEMUA LULUS" if ok else "\nADA YANG GAGAL")
sys.exit(0 if ok else 1)
