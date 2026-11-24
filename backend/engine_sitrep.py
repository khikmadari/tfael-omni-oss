#!/usr/bin/env python3
"""
TFAEL-OMNI v2.0 - SITREP Engine
Indonesia Situational Awareness: RSS, BMKG (gempa + peringatan dini cuaca), IDX ticker, incident synthesis.
"""
import html, json, re, ssl, time, threading, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
import concurrent.futures
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional

_CACHE: Dict[str, Any] = {}
_CACHE_LOCK = threading.Lock()
CACHE_TTL = 120

def _cache_get(key):
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if entry and time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
    return None

def _cache_set(key, data):
    with _CACHE_LOCK:
        _CACHE[key] = {"data": data, "ts": time.time()}

# ── Jawab dari simpanan, segarkan di latar ──
# Mengambil 8 umpan berita makan beberapa detik. Dulu tiap kali simpanan (120 dtk) habis, permintaan berikutnya
# menunggu selama itu. Sekarang: simpanan yang baru saja habis tetap langsung dijawabkan sementara penyegaran
# berjalan di latar, dan selama masih ada yang meminta, simpanan disegarkan sebelum sempat habis.
# Hanya permintaan pertama setelah server menyala (atau setelah lama tidak dibuka) yang menunggu pengambilan.
STALE_MAX = 900        # simpanan lebih tua dari ini tidak dijawabkan lagi: ambil baru dulu
KEEP_WARM_S = 600      # terus disegarkan selama ada permintaan dalam rentang ini
REFRESH_AT = 80        # umur simpanan (dtk) saat penyegaran latar dimulai
_SWR_LOCK = threading.Lock()
_SWR_BUSY = set()                      # kunci yang sedang disegarkan
_SWR_BUILD: Dict[str, Any] = {}        # kunci -> fungsi pengambil (hanya saat tidak air-gap)
_SWR_ASKED: Dict[str, float] = {}      # kunci -> kapan terakhir diminta
_SWR_KEEPER = {"on": False}

def _cache_peek(key):
    """(data, umur dtk) tanpa memandang masa berlaku; (None, None) bila belum ada."""
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if entry: return entry["data"], time.time() - entry["ts"]
    return None, None

def _swr_refresh(key, build):
    """Ambil ulang di latar; satu pengambilan per kunci pada satu waktu. Gagal = simpanan lama dibiarkan."""
    with _SWR_LOCK:
        if key in _SWR_BUSY: return
        _SWR_BUSY.add(key)
    def run():
        try:
            result = build()
            if result: _cache_set(key, result)
        except Exception:
            pass
        finally:
            with _SWR_LOCK: _SWR_BUSY.discard(key)
    threading.Thread(target=run, name="sitrep-refresh-" + key, daemon=True).start()

def _swr_keeper():
    while True:
        time.sleep(10)
        now = time.time()
        with _SWR_LOCK: items = list(_SWR_BUILD.items())
        for key, build in items:
            if now - _SWR_ASKED.get(key, 0) > KEEP_WARM_S: continue
            _, age = _cache_peek(key)
            if age is not None and age >= REFRESH_AT: _swr_refresh(key, build)

def _swr_stop():
    """Mode air-gap: tidak ada lagi pengambilan ke luar di latar."""
    with _SWR_LOCK: _SWR_BUILD.clear()

def _swr_get(key, build):
    """Data untuk kunci ini; None bila pengambilan gagal dan tidak ada simpanan yang masih layak."""
    _SWR_ASKED[key] = time.time()
    with _SWR_LOCK:
        _SWR_BUILD[key] = build
        if not _SWR_KEEPER["on"]:
            _SWR_KEEPER["on"] = True
            threading.Thread(target=_swr_keeper, name="sitrep-keeper", daemon=True).start()
    data, age = _cache_peek(key)
    if data is not None and age < STALE_MAX:
        if age >= REFRESH_AT: _swr_refresh(key, build)
        return data
    result = build()
    if result: _cache_set(key, result)
    return result or None

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TFAEL-OMNI/2.0)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

def _fetch_url(url, timeout=8):
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return r.read(512*1024).decode("utf-8", errors="replace")
    except Exception:
        return None

def _parse_rss(xml_text, source_name, category):
    items = []
    try:
        root = ET.fromstring(xml_text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        entries = root.findall(".//item") or root.findall(".//atom:entry", ns)
        for entry in entries[:15]:
            title = (entry.findtext("title") or entry.findtext("atom:title", namespaces=ns) or "").strip()
            link = (entry.findtext("link") or "").strip()
            desc = (entry.findtext("description") or entry.findtext("atom:summary", namespaces=ns) or "").strip()
            pub_date = (entry.findtext("pubDate") or entry.findtext("atom:updated", namespaces=ns) or "").strip()
            title = _plain(title)
            desc = _plain(desc)[:200]
            if title:
                items.append({"id": f"{source_name}_{len(items)}_{hash(title)&0xFFFFFF:06x}",
                              "title": title, "source": source_name, "category": category,
                              "summary": desc, "url": link, "pubDate": pub_date,
                              "ts": _parse_date_ts(pub_date)})
    except Exception:
        pass
    return items

def _plain(text):
    """Teks polos dari potongan RSS: buang tag, urai entitas (&amp; &#8217; &nbsp;), rapikan spasi."""
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"<[^>]+>", " ", html.unescape(text))
    return re.sub(r"\s+", " ", text).strip()

def _parse_date_ts(date_str):
    """Epoch detik dari tanggal RSS/Atom. 0.0 bila kosong atau tidak terbaca.

    Dulu nilai gagal-urai diisi time.time(), sehingga berita lama tampak baru terbit;
    pemotongan [:30] juga membuat semua tanggal ber-zona "+0700" gagal diurai.
    """
    s = (date_str or "").strip()
    if not s: return 0.0
    dt = None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))      # ISO 8601 / Atom
    except Exception:
        dt = None
    if dt is None:
        try:
            dt = parsedate_to_datetime(s)                         # RFC 822: Sat, 14 Nov 2026 19:07:00 +0700
        except Exception:
            return 0.0
        if dt is None: return 0.0
    try:
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0

NEWS_SOURCES = [
    ("Detik", "https://rss.detik.com/index.php/detikcom", "nasional"),
    ("Kompas", "https://rss.kompas.com/nasional", "nasional"),
    ("Antara", "https://www.antaranews.com/rss/terkini.xml", "nasional"),
    ("Tempo", "https://rss.tempo.co/nasional", "nasional"),
    ("CNN-ID", "https://www.cnnindonesia.com/nasional/rss", "nasional"),
    ("Tribun", "https://www.tribunnews.com/rss", "nasional"),
    ("MetroTV", "https://www.metrotvnews.com/rss", "nasional"),
    ("BMKG", "https://www.bmkg.go.id/rss/gempa-bumi.xml", "gempa"),
]

def fetch_news_feed(airgap=False):
    if airgap:
        _swr_stop()
        return _cache_get("news_feed") or _mock_news()
    return _swr_get("news_feed", _build_news_feed) or _mock_news()

def _build_news_feed():
    all_items = []
    def _fetch_one(src):
        name, url, cat = src
        text = _fetch_url(url, timeout=6)
        return _parse_rss(text, name, cat) if text else []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(_fetch_one, src): src for src in NEWS_SOURCES}
        try:
            for f in concurrent.futures.as_completed(futs, timeout=12):
                try: all_items.extend(f.result())
                except Exception: pass
        except concurrent.futures.TimeoutError:
            pass  # feed yang lambat dilewati; yang sudah selesai tetap dipakai
    seen, deduped = set(), []
    all_items.sort(key=lambda x: x["ts"], reverse=True)
    for item in all_items:
        tk = item["title"][:30].lower()
        if tk not in seen: seen.add(tk); deduped.append(item)
    return deduped[:60]

def fetch_bmkg_gempa(airgap=False):
    if airgap:
        _swr_stop()
        return _cache_get("bmkg_gempa") or _mock_gempa()
    return _swr_get("bmkg_gempa", _build_bmkg_gempa) or _mock_gempa()

def _build_bmkg_gempa():
    result = []
    def _pl(s):
        s = str(s).strip()
        try: v = float(re.sub(r"[~0-9LUSo"+chr(176)+r"]", "", s) or s.replace(chr(176),"").replace("LS","").replace("LU",""))
        except: v = 5.0
        return -abs(v) if "LS" in s else abs(v)
    text = _fetch_url("https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json", timeout=8)
    if text:
        try:
            quakes = json.loads(text).get("Infogempa",{}).get("gempa",[])
            for q in quakes[:15]:
                mag = float(q.get("Magnitude",0) or 0)
                lat_s = q.get("Lintang","-5"); lon_s = q.get("Bujur","110")
                try: lat = -abs(float(re.sub(r"[^0-9.]","",lat_s))) if "LS" in lat_s else abs(float(re.sub(r"[^0-9.]","",lat_s)))
                except: lat = -5.0
                try: lon = float(re.sub(r"[^0-9.]","",lon_s))
                except: lon = 110.0
                _dt = q.get("DateTime","?").replace(" ","_"); result.append({"id":f"bmkg_{_dt}","type":"gempa",
                               "mag":mag,"depth":q.get("Kedalaman","?"),"location":q.get("Wilayah","Indonesia"),
                               "lat":lat,"lon":lon,"datetime":q.get("DateTime",""),
                               "felt":q.get("Dirasakan","-"),"source":"BMKG",
                               "severity":"critical" if mag>=7 else "high" if mag>=5.5 else "medium" if mag>=4 else "low"})
        except Exception: pass
    return result

def fetch_idx_ticker(airgap=False):
    cached = _cache_get("idx_ticker")
    if cached: return cached
    if airgap: return _mock_ticker()
    result = []
    def _fetch_yahoo(sym):
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval=1d&range=2d"
        text = _fetch_url(url, timeout=6)
        if not text: return None
        try:
            meta = json.loads(text)["chart"]["result"][0]["meta"]
            prev = meta.get("chartPreviousClose", meta.get("previousClose", 0)) or 0
            curr = meta.get("regularMarketPrice", 0) or 0
            change = round(curr - prev, 2); pct = round(change/prev*100,2) if prev else 0
            return {"symbol": sym.replace(".JK","").replace("^",""), "price": curr,
                    "change": change, "pct": pct, "name": meta.get("longName",sym)}
        except: return None
    syms = ["BBCA.JK","BBRI.JK","TLKM.JK","BMRI.JK","ASII.JK","^JKSE"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        try:
            for f in concurrent.futures.as_completed([ex.submit(_fetch_yahoo,s) for s in syms], timeout=10):
                try:
                    r = f.result()
                    if r: result.append(r)
                except Exception: pass
        except concurrent.futures.TimeoutError:
            pass
    if result: _cache_set("idx_ticker", result)
    return result or _mock_ticker()

# ── Peringatan dini cuaca (nowcast) BMKG ─────────────────────────────────────────────────────────
# Data terbuka BMKG: https://data.bmkg.go.id/peringatan-dini-cuaca (wajib menyebut BMKG sebagai
# sumber; batas 60 permintaan/menit per IP). Feed RSS berisi ±25 peringatan terakhir per provinsi,
# termasuk yang sudah lewat; rincian CAP tiap peringatan memuat masa berlaku dan poligon kecamatan.
BMKG_NOWCAST_RSS = "https://www.bmkg.go.id/alerts/nowcast/id/rss.xml"
_CAP_NS = "{urn:oasis:names:tc:emergency:cap:1.2}"
_CAP_DETAIL_CACHE: Dict[str, Dict[str, Any]] = {}   # link -> rincian; isi satu peringatan tidak pernah berubah
_CAP_MAX_POINTS = 6000
_WARN_LOCK = threading.Lock()            # satu pengambilan pada satu waktu (batas BMKG: 60 permintaan/menit per IP)
# Hasil yang gagal atau belum lengkap (ada rincian yang belum sempat terambil) hanya diingat sebentar: cukup supaya
# BMKG yang sedang mati tidak ditanya pada tiap permintaan, tetapi putaran berikutnya sudah mencoba lagi.
_WARN_SHORT = {"ts": 0.0, "res": None}
_WARN_SHORT_TTL = 30
_ZONA = {"WIB": 7, "WITA": 8, "WIT": 9}
_BULAN = {n: i for i, names in enumerate([
    ("january", "januari"), ("february", "februari"), ("march", "maret"), ("april",), ("may", "mei"),
    ("june", "juni"), ("july", "juli"), ("august", "agustus"), ("september",), ("october", "oktober"),
    ("november",), ("december", "desember")], 1) for n in names}
_WAKTU_RE = re.compile(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}),?\s+(\d{1,2})[:.](\d{2})\s*(WIB|WITA|WIT)")


def _waktu_lokal_ts(text):
    """Epoch detik dari '12 October 2025, 16:00 WIB' (nama bulan Inggris atau Indonesia); None bila tidak ada."""
    m = _WAKTU_RE.search(text or "")
    if not m: return None
    bulan = _BULAN.get(m.group(2).lower())
    if not bulan: return None
    try:
        dt = datetime(int(m.group(3)), bulan, int(m.group(1)), int(m.group(4)), int(m.group(5)), tzinfo=timezone.utc)
    except ValueError:
        return None
    return dt.timestamp() - _ZONA[m.group(6)] * 3600


def _masa_dari_uraian(desc):
    """(mulai, selesai) dari kalimat baku BMKG: '... akan terjadi pada <waktu> ...' dan '... berlangsung hingga <waktu>.'"""
    mulai = selesai = None
    m = re.search(r"terjadi pada\s+(.{0,40})", desc or "")
    if m: mulai = _waktu_lokal_ts(m.group(1))
    m = re.search(r"hingga\s+(.{0,40})", desc or "")
    if m: selesai = _waktu_lokal_ts(m.group(1))
    return mulai, selesai


def _iso_ts(s):
    try:
        dt = datetime.fromisoformat((s or "").strip().replace("Z", "+00:00"))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


def _iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None


def _bmkg_link(link):
    """Tautan rincian hanya boleh diikuti bila https dan host-nya bmkg.go.id atau subdomainnya; selain itu ''."""
    try:
        u = urllib.parse.urlsplit(link or "")
        host, port = (u.hostname or "").lower(), u.port
    except ValueError:
        return ""
    if u.scheme != "https" or u.username or u.password or port not in (None, 443):
        return ""
    return link if host == "bmkg.go.id" or host.endswith(".bmkg.go.id") else ""


def _parse_nowcast_feed(xml_text):
    """Butir feed nowcast: judul, tautan rincian CAP, uraian, waktu terbit.

    Butir yang tautannya tidak menuju bmkg.go.id tetap dipakai (peringatannya sah, berasal dari feed BMKG),
    hanya tautannya dikosongkan supaya tidak pernah diikuti.
    """
    out = []
    try:
        root = ET.fromstring(xml_text.strip())
    except Exception:
        return out
    for it in root.findall(".//item")[:60]:
        title = _plain(it.findtext("title") or "")
        if not title:
            continue
        link = _bmkg_link((it.findtext("link") or "").strip())
        pub = (it.findtext("pubDate") or "").strip()
        ident = (link.rsplit("/", 1)[-1].replace("_alert.xml", "") if link else "") or (it.findtext("guid") or "").strip() \
            or re.sub(r"\W+", "-", title + " " + pub)[:80]
        event, _, area = title.rpartition(" di ")
        out.append({"id": ident, "title": title,
                    "event": event or title, "area": area if event else "", "link": link,
                    "description": _plain(it.findtext("description") or ""),
                    "issued_ts": _parse_date_ts(pub) or None})
    return out


def _parse_cap(xml_text):
    """Rincian satu peringatan CAP 1.2: masa berlaku, tingkat, wilayah, poligon [[lon, lat], ...]."""
    try:
        root = ET.fromstring(xml_text.strip())
    except Exception:
        return None
    info = root.find(_CAP_NS + "info")
    if info is None:
        info = root.find("info")
    if info is None:
        return None
    ns = _CAP_NS if root.tag.startswith(_CAP_NS) else ""
    get = lambda tag: (info.findtext(ns + tag) or "").strip()
    polygons, areas, n = [], [], 0
    for area in info.findall(ns + "area"):
        name = (area.findtext(ns + "areaDesc") or "").strip()
        if name and name not in areas: areas.append(name)
        for poly in area.findall(ns + "polygon"):
            ring = []
            for pair in (poly.text or "").split():
                try:
                    lat, lon = pair.split(",")
                    lat, lon = round(float(lat), 3), round(float(lon), 3)
                except ValueError:
                    continue
                if -90 <= lat <= 90 and -180 <= lon <= 180: ring.append([lon, lat])
            if len(ring) >= 4 and n + len(ring) <= _CAP_MAX_POINTS:
                polygons.append(ring); n += len(ring)
    web = get("web")
    return {"event": get("event"), "urgency": get("urgency"), "severity": get("severity"), "certainty": get("certainty"),
            "effective_ts": _iso_ts(get("effective")), "expires_ts": _iso_ts(get("expires")),
            "headline": get("headline"), "area": ", ".join(areas),
            "infographic": web if web.startswith("https://") else "", "polygons": polygons}


def _cap_worker(link):
    """Ambil rincian satu peringatan dan simpan sendiri ke cache, supaya hasil yang datang terlambat tetap terpakai."""
    xml = _fetch_url(link, timeout=6)
    det = _parse_cap(xml) if xml else None
    if det: _CAP_DETAIL_CACHE[link] = det


def fetch_bmkg_warnings(airgap=False):
    """
    Peringatan dini cuaca BMKG yang MASIH BERLAKU, per wilayah, lengkap dengan poligon terdampak.
    Tidak ada data pengganti: bila feed tidak terjangkau hasilnya ok=False dan daftar kosong.
    Paling lama sekitar 20 detik (feed 8 detik + rincian 12 detik); hasil disimpan 2 menit.
    """
    if airgap:
        return {"ok": False, "error": "Mode air-gap: peringatan dini BMKG tidak diambil.", "warnings": []}
    with _WARN_LOCK:
        cached = _cache_get("bmkg_warnings")
        if cached: return cached
        if _WARN_SHORT["res"] and 0 <= time.time() - _WARN_SHORT["ts"] < _WARN_SHORT_TTL:
            return _WARN_SHORT["res"]
        result = _fetch_bmkg_warnings_now()
        if result.get("ok") and result.get("complete"):
            _WARN_SHORT["res"] = None
            _cache_set("bmkg_warnings", result)
        else:
            _WARN_SHORT["ts"], _WARN_SHORT["res"] = time.time(), result
        return result


def _fetch_bmkg_warnings_now():
    text = _fetch_url(BMKG_NOWCAST_RSS, timeout=8)
    if not text:
        return {"ok": False, "error": "Feed peringatan dini BMKG tidak terjangkau.", "warnings": []}
    items = _parse_nowcast_feed(text)
    # Tidak ada butir yang terbaca padahal feed bukan RSS, atau jelas memuat butir (XML terpotong/berubah bentuk):
    # itu kegagalan, bukan "tidak ada peringatan". Jangan sampai layar menyatakan aman karena feed tak terbaca.
    if not items and ("<rss" not in text or "<item" in text):
        return {"ok": False, "error": "Feed peringatan dini BMKG tidak terbaca.", "warnings": []}
    now = time.time()
    active = []
    for it in items:
        it["start_ts"], it["end_ts"] = _masa_dari_uraian(it["description"])
        # tanpa jam berakhir di uraian: anggap berlaku 3 jam sejak terbit (nowcast = 0-6 jam, lazimnya 1-3 jam)
        end = it["end_ts"] or ((it["issued_ts"] or now) + 3 * 3600)
        if end > now: active.append(it)
    # rincian CAP (poligon, masa berlaku persis) hanya untuk yang masih berlaku dan belum pernah diambil
    todo = list(dict.fromkeys(it["link"] for it in active if it["link"] and it["link"] not in _CAP_DETAIL_CACHE))
    if todo:
        ex = concurrent.futures.ThreadPoolExecutor(max_workers=6)
        concurrent.futures.wait([ex.submit(_cap_worker, l) for l in todo], timeout=12)
        # yang belum selesai tidak ditunggu: peringatannya tetap dikirim tanpa poligon, rinciannya menyusul di putaran berikut
        try:
            ex.shutdown(wait=False, cancel_futures=True)
        except TypeError:                # Python < 3.9
            ex.shutdown(wait=False)
    keep = {it["link"] for it in items}
    for link in [l for l in list(_CAP_DETAIL_CACHE) if l not in keep]:
        _CAP_DETAIL_CACHE.pop(link, None)
    out = []
    for it in active:
        det = _CAP_DETAIL_CACHE.get(it["link"]) or {}
        end = det.get("expires_ts") or it["end_ts"] or ((it["issued_ts"] or now) + 3 * 3600)
        if end <= now: continue
        out.append({"id": it["id"], "title": it["title"], "event": it["event"], "area": det.get("area") or it["area"],
                    "description": it["description"], "issued": _iso(it["issued_ts"]),
                    "effective": _iso(det.get("effective_ts") or it["start_ts"] or it["issued_ts"]),
                    "expires": _iso(end), "expires_estimated": not (det.get("expires_ts") or it["end_ts"]),
                    "severity": det.get("severity", ""), "urgency": det.get("urgency", ""), "certainty": det.get("certainty", ""),
                    "infographic": det.get("infographic", ""), "link": it["link"],
                    "detail": bool(det), "polygons": det.get("polygons", [])})
    out.sort(key=lambda w: w["expires"] or "")
    # lengkap = tidak ada rincian yang masih bisa diambil tetapi belum terambil
    complete = not any(it["link"] and it["link"] not in _CAP_DETAIL_CACHE for it in active)
    return {"ok": True, "source": "BMKG", "source_url": "https://www.bmkg.go.id/cuaca/peringatan-dini-cuaca",
            "in_feed": len(items), "complete": complete, "warnings": out}


INCIDENT_KW = {"gempa":("gempa","earthquake","tsunami"),"banjir":("banjir","flood","longsor"),
               "kebakaran":("kebakaran","terbakar","karhutla"),"demo":("demo","unjuk rasa","tawuran"),
               "kecelakaan":("kecelakaan","tabrakan","lakalantas"),"kriminal":("narkoba","teroris","pembunuhan")}
# Kata utuh saja. Pencocokan potongan kata dulu membuat "napi" dan "lapisan" terbaca sebagai
# kebakaran (kata kunci "api", kini dibuang: "kereta api" pun bukan kebakaran) dan "demokrasi" sebagai demo.
_INCIDENT_RE = {t: re.compile(r"\b(?:%s)\b" % "|".join(re.escape(k) for k in kws)) for t, kws in INCIDENT_KW.items()}

REGION_COORDS = {
    "jakarta":(-6.2088,106.8456),"bandung":(-6.9175,107.6191),"surabaya":(-7.2575,112.7521),
    "medan":(3.5952,98.6722),"makassar":(-5.1477,119.4327),"semarang":(-6.9667,110.4167),
    "yogyakarta":(-7.7956,110.3695),"palembang":(-2.9761,104.7754),"bali":(-8.4095,115.1889),
    "aceh":(5.5483,95.3238),"manado":(1.4748,124.8421),"pontianak":(-0.0263,109.3425),
    "jayapura":(-2.5337,140.7181),"palu":(-0.9003,119.8779),"lombok":(-8.5833,116.1167),
    "bogor":(-6.5971,106.8060),"depok":(-6.4025,106.7942),"bekasi":(-6.2383,106.9756),
    "tangerang":(-6.1702,106.6402),"cirebon":(-6.7320,108.5523),"cianjur":(-6.82,107.14),
    "garut":(-7.21,107.91),"lampung":(-5.4292,105.2610),"riau":(0.5071,101.4478),
}

_REGION_RE = re.compile(r"\b(%s)\b" % "|".join(re.escape(r) for r in sorted(REGION_COORDS, key=len, reverse=True)))

def _guess_loc(text):
    """(nama, lat, lon) kota pertama yang disebut sebagai kata utuh, atau None.

    Tidak pernah mengarang koordinat: dulu berita tanpa nama kota diberi titik acak di peta.
    """
    m = _REGION_RE.search((text or "").lower())
    if not m: return None
    lat, lon = REGION_COORDS[m.group(1)]
    return (m.group(1).title(), lat, lon)

def synthesize_incidents(news, gempa):
    inc = []
    for g in gempa[:10]:
        inc.append({"id":g["id"],"type":"gempa","title":f"Gempa M{g['mag']} — {g['location'][:40]}",
                    "location":g["location"],"lat":g["lat"],"lon":g["lon"],
                    "severity":g["severity"],"source":g["source"],"datetime":g["datetime"],"felt":g.get("felt","")})
    for item in news[:50]:
        text = (item["title"]+" "+item["summary"]).lower()
        for t,rx in _INCIDENT_RE.items():
            if rx.search(text):
                loc = _guess_loc(item["title"])
                # lat/lon None + located False = berita tidak menyebut kota yang dikenal; jangan digambar di peta
                inc.append({"id":item["id"],"type":t,"title":item["title"][:80],
                             "location":loc[0] if loc else "","lat":loc[1] if loc else None,"lon":loc[2] if loc else None,
                             "located":loc is not None,
                             "severity":"medium","source":item["source"],
                             "datetime":item.get("pubDate",""),"url":item.get("url","")})
                break
    return inc[:60]

def _mock_news():
    now = time.time()
    rows = [("Gempa M5.2 Guncang Cianjur","Kompas","gempa"),("Banjir Bandang di Garut","BNPB","banjir"),
            ("Demo Mahasiswa Ricuh di DPR","Detik","nasional"),("IHSG Melemah 1.2%","Tempo","ekonomi"),
            ("Kebakaran Gudang di Bekasi","Antara","kebakaran"),("BMKG: Potensi Tsunami","BMKG","gempa"),
            ("Polisi Tangkap Jaringan Narkoba","CNN-ID","kriminal"),("Longsor Jalan Trans-Sulawesi","MetroTV","bencana"),
            ("Kebakaran Hutan Kalimantan","Tribun","kebakaran"),("Pemprov DKI Siapkan Pengungsian","Kompas","banjir"),
            ("Latihan Militer TNI-AU Natuna","Antara","keamanan"),("Lakalantas Tol Cipali 3 Meninggal","Detik","kecelakaan")]
    return [{"id":f"mock_{i}","title":t,"source":s,"category":c,"summary":t,"url":"#","pubDate":"","ts":now-i*180,
             "simulated":True}
            for i,(t,s,c) in enumerate(rows)]

def _mock_gempa():
    return [dict(g, simulated=True) for g in [
        {"id":"g1","type":"gempa","mag":5.2,"depth":"10 km","location":"Cianjur, Jawa Barat","lat":-6.82,"lon":107.14,"datetime":"","felt":"III-IV MMI","source":"BMKG","severity":"medium"},
        {"id":"g2","type":"gempa","mag":4.1,"depth":"30 km","location":"Selatan Jawa","lat":-9.1,"lon":110.5,"datetime":"","felt":"-","source":"BMKG","severity":"low"},
        {"id":"g3","type":"gempa","mag":6.0,"depth":"15 km","location":"Sulawesi Tengah","lat":-0.90,"lon":119.88,"datetime":"","felt":"V MMI","source":"BMKG","severity":"high"},
    ]]

def _mock_ticker():
    return [dict(t, simulated=True) for t in
           [{"symbol":"JKSE","price":7250.5,"change":-87.3,"pct":-1.19,"name":"IHSG"},
            {"symbol":"BBCA","price":9875,"change":50,"pct":0.51,"name":"Bank BCA"},
            {"symbol":"BBRI","price":4820,"change":-30,"pct":-0.62,"name":"Bank BRI"},
            {"symbol":"TLKM","price":3680,"change":20,"pct":0.55,"name":"Telkom"},
            {"symbol":"BMRI","price":7250,"change":-50,"pct":-0.69,"name":"Bank Mandiri"},
            {"symbol":"ASII","price":4950,"change":75,"pct":1.54,"name":"Astra"}]]

def get_sitrep_dashboard(airgap=False):
    cached = _cache_get("sitrep_dashboard")
    if cached: return cached
    news = fetch_news_feed(airgap)
    gempa = fetch_bmkg_gempa(airgap)
    ticker = fetch_idx_ticker(airgap)
    incidents = synthesize_incidents(news, gempa)
    tc = {}
    for i in incidents: tc[i.get("type","other")] = tc.get(i.get("type","other"),0)+1
    critical = sum(1 for i in incidents if i.get("severity")=="critical")
    high = sum(1 for i in incidents if i.get("severity")=="high")
    alert = "MERAH" if critical>0 or high>=3 else ("KUNING" if high>0 or len(incidents)>10 else "HIJAU")
    result = {"timestamp":datetime.now(timezone.utc).isoformat(),"total_incidents":len(incidents),
              "incidents":incidents,"news":news[:40],"gempa":gempa[:15],"ticker":ticker,
              "incident_counts":tc,"alert_level":alert}
    _cache_set("sitrep_dashboard", result)
    return result
