#!/usr/bin/env python3
"""Membuat fixture dasar peringatan cuaca untuk server uji, dengan menjalankan fetch_bmkg_warnings() yang
sebenarnya atas contoh XML resmi BMKG (github.com/infoBMKG/data-cap) tanpa jaringan. Bentuk JSON-nya
karena itu persis sama dengan jawaban backend. Hanya peringatan Jawa Barat yang punya rincian CAP di
contoh BMKG; yang lain keluar tanpa poligon (detail=False), sama seperti bila rincian gagal diambil.
Pakai: python3 -I -B make-peringatan.py <folder engine_sitrep.py> <folder contoh BMKG> <keluaran.json>"""
import json, sys
from datetime import datetime, timezone, timedelta
sys.path.insert(0, sys.argv[1])
import engine_sitrep as E

S = sys.argv[2]
FEED = open(S + "/nowcast-feed-id.xml", encoding="utf-8").read()
CAP = open(S + "/nowcast-cap-id.xml", encoding="utf-8").read()
WIB = timezone(timedelta(hours=7))
NOW = datetime(2025, 10, 12, 15, 40, tzinfo=WIB).timestamp()
ITEMS = {i["link"]: i for i in E._parse_nowcast_feed(FEED)}

def fake_fetch(url, timeout=8):
    if url == E.BMKG_NOWCAST_RSS:
        return FEED
    it = ITEMS.get(url)
    if not it or it["area"] != "Jawa Barat":
        return None
    a, b = E._masa_dari_uraian(it["description"])
    iso = lambda t: datetime.fromtimestamp(t, WIB).isoformat()
    return CAP.replace("2025-10-13T12:23:00+07:00", iso(a)).replace("2025-10-13T14:30:00+07:00", iso(b))

E._fetch_url = fake_fetch
E.time.time = lambda: NOW
E._CACHE.clear()
r = E.fetch_bmkg_warnings()
assert r["ok"], r
out = {"now": datetime.fromtimestamp(NOW, timezone.utc).isoformat(), "response": r}
json.dump(out, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False)
print(len(r["warnings"]), "peringatan berlaku dari", r["in_feed"], "butir feed")
for w in r["warnings"]:
    print(" ", w["id"], "|", w["area"], "|", w["effective"][11:16], "-", w["expires"][11:16], "UTC | poligon", len(w["polygons"]), "| detail", w["detail"])
