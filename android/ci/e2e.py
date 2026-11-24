#!/usr/bin/env python3
"""Uji ujung-ke-ujung aplikasi agen di emulator CI, sekaligus mengambil tangkapan layar.

Dijalankan GitHub Actions di dalam android-emulator-runner. Skrip ini:
  1. menyalakan server TFAEL-OMNI sungguhan di mesin CI (basis data sementara, mode demo),
  2. memasang APK, mengarahkan aplikasi ke server CI itu (BUKAN server demo publik),
  3. menjalankan alur pemakaian sambil menyimpan tangkapan layar + struktur tampilan,
  4. memeriksa di sisi server bahwa laporan posisi dari aplikasi benar-benar tiba,
  5. menyimpan logcat agar galat/crash bisa dibaca.

Hasil ditulis ke folder shots/ dan diterbitkan oleh workflow ke cabang ci-screenshots.
"""
import glob
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET

WS = os.environ.get("GITHUB_WORKSPACE", os.getcwd())
OUT = os.path.join(WS, "shots")
os.makedirs(OUT, exist_ok=True)
PKG = "com.tfael.omni.agent"
ACT = PKG + "/.MainActivity"
EMU_SERVER = "http://10.0.2.2:8080"      # mesin CI dilihat dari dalam emulator
LOCAL = "http://127.0.0.1:8080"          # server yang sama dilihat dari mesin CI
LAT, LON = -6.1754, 106.8272             # titik uji (Monas), berbeda dari posisi contoh ALPHA-01
T0 = time.time()
notes = []
result = {"taps": {}, "checks": {}}
pos = {}                                 # koordinat ketukan terakhir per label (cadangan bila dump gagal)


def log(msg):
    line = f"[{time.time() - T0:6.1f}s] {msg}"
    print(line, flush=True)
    notes.append(line)


def adb(*args, timeout=90, data=None):
    try:
        p = subprocess.run(["adb", *args], capture_output=True, timeout=timeout, input=data)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, b"", b"timeout"


def sh(cmd, timeout=60):
    return adb("shell", cmd, timeout=timeout)


def text(b):
    return b.decode("utf-8", "replace").strip()


def shot(name):
    rc, out, _ = adb("exec-out", "screencap", "-p", timeout=40)
    if rc == 0 and out[:8] == b"\x89PNG\r\n\x1a\n":
        with open(os.path.join(OUT, name + ".png"), "wb") as f:
            f.write(out)
        log(f"tangkapan layar: {name}")
    else:
        log(f"tangkapan layar {name} GAGAL (rc={rc})")


def ui_xml(tries=3):
    """Struktur tampilan saat ini. Berkas lama dihapus dulu: `uiautomator dump` gagal bila layar
    belum diam (peta 3D yang sedang bergerak/memuat), dan tanpa penghapusan itu yang terbaca
    adalah hasil dump sebelumnya — data basi yang tampak sah."""
    for _ in range(tries):
        sh("rm -f /sdcard/ui.xml; uiautomator dump /sdcard/ui.xml", timeout=45)
        rc, out, _ = adb("exec-out", "cat", "/sdcard/ui.xml", timeout=20)
        if rc == 0 and out.lstrip().startswith(b"<?xml"):
            return out.decode("utf-8", "replace")
        time.sleep(1.5)
    return ""


def nodes(xml):
    res = []
    try:
        root = ET.fromstring(xml)
    except Exception:
        return res
    for n in root.iter("node"):
        m = re.match(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", n.get("bounds", ""))
        if not m:
            continue
        res.append({"text": n.get("text", ""), "desc": n.get("content-desc", ""), "cls": n.get("class", ""),
                    "pkg": n.get("package", ""), "clickable": n.get("clickable") == "true",
                    "b": tuple(int(v) for v in m.groups())})
    return res


def dump(name):
    xml = ui_xml()
    if clear_system_dialog(nodes(xml)):
        xml = ui_xml()
    with open(os.path.join(OUT, name + ".xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    return nodes(xml)


def find(ns, label):
    for n in ns:                       # cocok persis dulu (teks atau deskripsi konten)
        if n["text"] == label or n["desc"] == label:
            return n
    for n in ns:                       # lalu cocok sebagian
        if label in n["text"] or label in n["desc"]:
            return n
    low = label.lower()                # terakhir: abaikan huruf besar/kecil (tombol dialog tampil kapital)
    for n in ns:
        if n["text"].lower() == low or n["desc"].lower() == low:
            return n
    return None


def clear_system_dialog(ns):
    """Dialog sistem "… isn't responding" / "… keeps stopping" menutupi layar, sehingga tombol
    aplikasi tak terbaca. Bila milik aplikasi lain (mis. peluncur emulator yang kewalahan saat baru
    menyala): tekan Wait lalu lanjutkan. Bila milik aplikasi ini: dicatat sebagai kegagalan."""
    msg = next((n["text"] for n in ns if n["pkg"] == "android"
                and ("isn't responding" in n["text"] or "keeps stopping" in n["text"])), None)
    if not msg:
        return False
    ours = "OMNI" in msg or PKG in msg
    if ours:
        result["checks"]["dialog_galat_aplikasi"] = msg
    log(f"dialog sistem: {msg!r}" + (" — MILIK APLIKASI INI" if ours else " — ditutup"))
    btn = find(ns, "Wait") or find(ns, "Close app") or find(ns, "OK")
    if btn:
        x1, y1, x2, y2 = btn["b"]
        sh(f"input tap {(x1 + x2) // 2} {(y1 + y2) // 2}")
        time.sleep(2)
    return True


def tap(label, wait=1.5, remembered=False):
    """Ketuk elemen berlabel. remembered=True: bila label tak terbaca (dump gagal karena peta 3D
    sedang bergerak), pakai koordinat ketukan terakhir label itu — hanya untuk tombol yang
    letaknya tetap."""
    ns = nodes(ui_xml(2 if remembered else 3))
    if clear_system_dialog(ns):
        ns = nodes(ui_xml(2))
    n = find(ns, label)
    if n:
        x1, y1, x2, y2 = n["b"]
        x, y = (x1 + x2) // 2, (y1 + y2) // 2
        how = ""
    elif remembered and label in pos:
        x, y = pos[label]
        how = " (koordinat tersimpan)"
    else:
        log(f"ketuk '{label}': TIDAK DITEMUKAN di layar")
        result["taps"][label] = False
        return False
    sh(f"input tap {x} {y}")
    time.sleep(wait)
    pos[label] = (x, y)
    log(f"ketuk '{label}' di ({x},{y}){how}")
    result["taps"][label] = True
    return True


def hud_coords(tries=4):
    """Koordinat titik tengah peta, dibaca dari kotak koordinat di layar ('lat, lon' + MGRS)."""
    for _ in range(tries):
        for n in nodes(ui_xml(1)):
            m = re.match(r"^(-?\d+\.\d+), (-?\d+\.\d+)", n["text"])
            if m:
                return float(m.group(1)), float(m.group(2))
        time.sleep(1.5)
    return None


def far(a, b):
    """True bila dua titik terpaut lebih dari ±20 m."""
    return a is not None and b is not None and (abs(a[0] - b[0]) > 0.0002 or abs(a[1] - b[1]) > 0.0002)


LOGCAT_FILE = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "logcat-penuh.txt")


def start_logcat():
    """Rekam seluruh logcat ke berkas selama uji. Penyangga logcat di emulator hanya memuat
    kurang dari satu menit, sehingga jejak crash di tengah uji hilang bila baru dibaca di akhir."""
    try:
        return subprocess.Popen(["adb", "logcat", "-v", "time", "-T", "1"],
                                stdout=open(LOGCAT_FILE, "wb"), stderr=subprocess.DEVNULL)
    except OSError:
        return None


def logcat_lines():
    try:
        with open(LOGCAT_FILE, "rb") as f:
            return f.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return []


def save_3d_log():
    """Jejak mode 3D: tag omni3d dari aplikasi dan pesan mesin WebView (tag chromium)."""
    lines = [ln for ln in logcat_lines()
             if "omni3d" in ln or ("chromium" in ln.lower() and "nativeloader" not in ln)]
    with open(os.path.join(OUT, "logcat-3d.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines[-1500:]) or "(tidak ada jejak 3D)")
    return lines


def save_exit_info(label):
    """Catat mengapa proses aplikasi berhenti: crash Java, crash native, kehabisan memori, atau
    dihentikan sistem (ApplicationExitInfo), berikut isi penyangga crash."""
    info = text(sh(f"dumpsys activity exit-info {PKG}", timeout=40)[1])
    _, out, _ = adb("logcat", "-b", "crash", "-d", "-v", "time", timeout=60)
    with open(os.path.join(OUT, f"keluar-{label}.txt"), "w", encoding="utf-8") as f:
        f.write(info + "\n\n===== logcat -b crash =====\n" + out.decode("utf-8", "replace")[-80000:])
    # Contoh baris: "process=<paket> reason=5 (APP CRASH(NATIVE)) subreason=0 (UNKNOWN) status=6"
    result.setdefault("alasan_berhenti", {})[label] = re.findall(r"process=\S+ reason=(.*?) status=", info)[:6]
    log(f"alasan proses berhenti ({label}): {result['alasan_berhenti'][label]}")


GMS = "com.google.android.gms"


def font_provider_clients(label):
    """Siapa yang sedang memegang penyedia font Google Play Services. Mesin WebView mengambil
    berkas font dari sana; selama aplikasi memegang sambungan *stabil* (s1/..), Android ikut
    mematikan aplikasi bila proses Play Services mati. Format baris: '-> pid:paket s<stabil> u<tak stabil>'."""
    out = text(sh("dumpsys activity providers", timeout=90)[1])
    blok = ""
    for m in re.finditer(r"fonts\.provider\.FontsProvider\}", out):
        akhir = out.find("* ContentProviderRecord", m.end())
        kandidat = out[m.start():akhir if akhir > 0 else m.start() + 1500][:1500]
        if "->" in kandidat or not blok:
            blok = kandidat
    klien = re.findall(r"->\s*(\S+)\s+(s\d+/\d+ u\d+/\d+)", blok)
    with open(os.path.join(OUT, "penyedia-font.txt"), "a", encoding="utf-8") as f:
        f.write(f"===== {label} (t={time.time() - T0:.1f}s) =====\n{blok or '(penyedia font tidak terdaftar)'}\n\n")
    result.setdefault("pemegang_font", {})[label] = [f"{c} {n}" for c, n in klien]
    log(f"pemegang penyedia font ({label}): {result['pemegang_font'][label]}")


def gms_exit_info():
    """Mengapa proses Google Play Services berhenti selama uji (bukan bagian dari aplikasi ini)."""
    info = text(sh(f"dumpsys activity exit-info {GMS}", timeout=40)[1])
    with open(os.path.join(OUT, "keluar-gms.txt"), "w", encoding="utf-8") as f:
        f.write(info)
    entri = re.findall(r"timestamp=(\S+ \S+) pid=\d+.*?\n\s*process=(\S+) reason=(.*?) status=.*?\n\s*importance=\d+ .*?description=(.*?) state=",
                       info, re.S)
    result["play_services_berhenti"] = [f"{t} {p}: {r} — {d}"[:300] for t, p, r, d in entri][:8]
    log(f"Play Services berhenti: {result['play_services_berhenti']}")


def mem_snapshot(label):
    """Memori emulator dan pemakaian aplikasi, untuk menilai apakah mode 3D kehabisan memori."""
    sysmem = dict(re.findall(r"(\w+):\s+(\d+) kB", text(sh("head -3 /proc/meminfo")[1])))
    app = text(sh(f"dumpsys meminfo {PKG} | grep -E 'TOTAL PSS|TOTAL RSS' | head -1", timeout=60)[1])
    result.setdefault("memori", {})[label] = {
        "total_MB": int(sysmem.get("MemTotal", 0)) // 1024,
        "tersedia_MB": int(sysmem.get("MemAvailable", 0)) // 1024,
        "aplikasi": " ".join(app.split())[:120]}
    log(f"memori {label}: {result['memori'][label]}")


def back(wait=1.0):
    sh("input keyevent 4")
    time.sleep(wait)


def foreground():
    _, out, _ = sh("dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity' | head -2")
    return text(out)


def app_in_front():
    return PKG in foreground()


def http_json(url, headers=None, timeout=8):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def start_backend():
    env = dict(os.environ)
    env.pop("OMNI_AGENT_KEY", None)
    env.update({
        "OMNI_DB_PATH": os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "ci_omni.db"),
        "OMNI_AIRGAP": "1",                       # tanpa panggilan jaringan keluar
        "OMNI_DEMO_HINT": "1",                    # mode demo: kunci agen dibagikan ke aplikasi
        "OMNI_BOOTSTRAP_PASSWORD": "Ci#" + secrets.token_hex(8),
    })
    logf = open(os.path.join(OUT, "server.log"), "w")
    p = subprocess.Popen([sys.executable, "backend/server.py", "8080"], cwd=WS, env=env,
                         stdout=logf, stderr=subprocess.STDOUT)
    for _ in range(200):
        if p.poll() is not None:
            return None
        try:
            socket.create_connection(("127.0.0.1", 8080), timeout=0.5).close()
            return p
        except OSError:
            time.sleep(0.4)
    return None


PREFS = """<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="server">%s</string>
    <string name="unit">ALPHA-01</string>
    <string name="role">Tim Tindak Cepat</string>
    <string name="interval">5</string>
    <boolean name="batt_asked" value="true" />
    <boolean name="trace3d" value="true" />
</map>
"""


def write_prefs(server):
    """Arahkan aplikasi ke server CI lewat SharedPreferences (APK debug → run-as diizinkan)."""
    data = (PREFS % server).encode("utf-8")
    sh(f"am force-stop {PKG}")
    adb("shell", f"run-as {PKG} sh -c 'mkdir -p shared_prefs && cat > shared_prefs/omni_agent.xml'", data=data)
    _, out, _ = sh(f"run-as {PKG} cat shared_prefs/omni_agent.xml")
    if b"10.0.2.2" not in out:        # cadangan: salin lewat /data/local/tmp
        tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "omni_agent.xml")
        with open(tmp, "wb") as f:
            f.write(data)
        adb("push", tmp, "/data/local/tmp/omni_agent.xml")
        sh("chmod 644 /data/local/tmp/omni_agent.xml")
        sh(f"run-as {PKG} sh -c 'mkdir -p shared_prefs && cp /data/local/tmp/omni_agent.xml shared_prefs/omni_agent.xml'")
        _, out, _ = sh(f"run-as {PKG} cat shared_prefs/omni_agent.xml")
    ok = b"10.0.2.2" in out
    log("pengaturan aplikasi diarahkan ke server CI: " + ("ya" if ok else "TIDAK"))
    return ok


def geo(i=0):
    adb("emu", "geo", "fix", f"{LON + i * 0.00003:.6f}", f"{LAT:.6f}", timeout=20)


def keep_gps_fresh(stop):
    """Kirim posisi GPS berkala selama uji, seperti ponsel sungguhan yang terus mendapat fix."""
    i = 8
    while not stop.is_set():
        geo(i % 5)
        i += 1
        stop.wait(15)


def server_view():
    """Apa yang dilihat server tentang unit ALPHA-01 (bukti laporan tiba)."""
    try:
        key = http_json(LOCAL + "/api/v2/agent/demo-key").get("agent_key", "")
        o = http_json(LOCAL + "/api/v2/field/overview", {"X-Agent-Key": key})
        u = next((x for x in o.get("units", []) if x.get("unit_id") == "ALPHA-01"), None) or {}
        moved = u.get("lat") is not None and abs(u["lat"] - LAT) < 0.002 and abs(u["lon"] - LON) < 0.002
        return {"ok": True, "units": len(o.get("units", [])), "annotations": len(o.get("annotations", [])),
                "alpha_at_test_point": bool(moved), "alpha_battery": u.get("battery_pct"),
                "alpha_last_seen": u.get("last_seen"), "server_time": o.get("system_time_utc")}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def cam_trace():
    """Posisi berhenti kamera peta 3D menurut jejak halaman peta di logcat:
    daftar (lat, lon, oleh_pengguna). Tidak bergantung pada dump layar."""
    ev = []
    for ln in logcat_lines():
        m = re.search(r"\[omni3d\] kamera berhenti di (-?\d+\.\d+), (-?\d+\.\d+)( \(gerakan pengguna\))?", ln)
        if m:
            ev.append((float(m.group(1)), float(m.group(2)), bool(m.group(3))))
    return ev


def near_me(p):
    """True bila titik berada di posisi uji (GPS tiruan bergeser paling jauh 0,00012° ke timur)."""
    return p is not None and abs(p[0] - LAT) < 0.0002 and -0.0002 < p[1] - LON < 0.0004


def pan_3d():
    """Geser peta 3D dengan satu jari, lalu tunggu beberapa laporan posisi: kamera tidak boleh
    ditarik kembali ke posisi sendiri. Tarikan balik dulu muncul tidak di setiap percobaan
    (perintah ikut yang terlambat dijalankan), jadi geseran diuji dua putaran, dengan tombol
    "Posisi saya" di antaranya. Penilaian memakai jejak kamera dari halaman peta; koordinat di
    layar hanya dicatat sebagai pembanding karena dump layar sering gagal saat peta bergerak."""
    def swipe_round(cmds, settle):
        n = len(cam_trace())
        before = cam_trace()[-1][:2] if n else None
        tries = 0
        for cmd in cmds:
            # Emulator yang sedang sibuk kadang menelan geseran (sentuhan tercatat, peta tidak
            # bergerak). Geseran diulang, lebih lambat, sampai halaman peta mencatat gerakan.
            tries += 1
            sh(cmd)
            time.sleep(6)
            if any(e[2] for e in cam_trace()[n:]):
                break
        hud_after = hud_coords(1)
        time.sleep(settle)
        ev = cam_trace()[n:]
        user = [e[:2] for e in ev if e[2]]
        return {"sebelum": before, "akhir_geseran": user[-1] if user else None,
                "kamera_terakhir": ev[-1][:2] if ev else None, "layar": hud_after,
                "perpindahan_bukan_pengguna": sum(1 for e in ev if not e[2]), "percobaan_geser": tries}

    r1 = swipe_round(["input swipe 540 1500 540 1000 350", "input swipe 540 1500 540 1000 800",
                      "input swipe 540 1600 540 900 1200"], 14)
    shot("12b-peta-3d-setelah-geser")
    n = len(cam_trace())
    tapped = tap("Posisi saya", wait=7, remembered=True)
    back_ev = [e[:2] for e in cam_trace()[n:] if not e[2]]
    shot("12e-peta-3d-posisi-saya")
    r2 = swipe_round(["input swipe 540 1600 540 1000 600", "input swipe 540 1600 540 1000 900",
                      "input swipe 540 1600 540 900 1200"], 12)
    jejak = save_3d_log()
    result["geser_3d"] = {"putaran_1": r1, "posisi_saya": {"diketuk": tapped, "kamera": back_ev[-1] if back_ev else None},
                          "putaran_2": r2}
    c = result["checks"]
    c["peta_3d_bisa_digeser"] = far(r1["sebelum"], r1["akhir_geseran"])
    c["peta_3d_tidak_ditarik_balik"] = (r1["akhir_geseran"] is not None
                                        and not far(r1["akhir_geseran"], r1["kamera_terakhir"]))
    c["peta_3d_posisi_saya_kembali"] = bool(back_ev) and near_me(back_ev[-1])
    c["peta_3d_geser_kedua_bertahan"] = (far(r2["sebelum"], r2["akhir_geseran"])
                                         and not far(r2["akhir_geseran"], r2["kamera_terakhir"]))
    result["jejak_3d"] = {"baris": len(jejak),
                          "ikut_diabaikan": sum("diabaikan" in ln for ln in jejak),
                          "sentuhan": sum("disentuh" in ln for ln in jejak)}
    log(f"geser 3D: {result['geser_3d']}; jejak {result['jejak_3d']}")


def main():
    apks = sorted(glob.glob(os.path.join(WS, "apk", "*.apk")))
    if not apks:
        log("APK tidak ditemukan di folder apk/")
        return 2
    apk = apks[-1]
    log("APK: " + os.path.basename(apk))

    backend = start_backend()
    log("server CI: " + ("menyala di :8080" if backend else "GAGAL menyala"))

    adb("wait-for-device", timeout=120)
    logcat = start_logcat()
    _, out, _ = sh("getprop ro.build.version.release; wm size; wm density")
    log("emulator: " + text(out).replace("\n", " | "))
    rc, out, err = adb("install", "-r", apk, timeout=240)
    log("pasang APK: " + (text(out) or text(err))[-160:])
    sh("settings put secure location_mode 3")
    sh("cmd location set-location-enabled true")
    _, out, _ = sh(f"dumpsys package {PKG} | grep -E 'versionName|versionCode' | head -2")
    log("versi terpasang: " + text(out).replace("\n", " "))

    # 1) Buka pertama kali: layar pembuka (izin belum diberikan)
    sh(f"am start -n {ACT}")
    time.sleep(8)
    clear_system_dialog(nodes(ui_xml(1)))
    shot("01-pembuka")
    dump("01-pembuka")
    result["checks"]["pembuka_tampil"] = app_in_front()
    # Nama unit bawaan harus unik per pemasangan (AGEN-XXXX), bukan satu nama untuk semua ponsel.
    _, out, _ = sh(f"run-as {PKG} cat shared_prefs/omni_agent.xml")
    m = re.search(r'name="unit">([^<]+)<', out.decode("utf-8", "replace"))
    result["nama_unit_bawaan"] = m.group(1) if m else None
    result["checks"]["nama_unit_unik"] = bool(m and re.fullmatch(r"AGEN-[A-Z2-9]{4}", m.group(1)))
    log(f"nama unit bawaan pemasangan baru: {result['nama_unit_bawaan']}")

    # 1b) Sinyal "ponsel selesai menyala" ketika izin lokasi belum diberikan. Sebelum build 3.2.14
    #     penerima boot menyalakan layanan pelaporan tanpa memeriksa izin, Android 14 menolaknya
    #     (SecurityException), dan aplikasi crash. Aplikasi harus tetap hidup dan tetap di depan.
    sh(f"am broadcast -a android.intent.action.QUICKBOOT_POWERON -n {PKG}/.BootReceiver")
    time.sleep(5)
    save_exit_info("boot-tanpa-izin")
    result["checks"]["boot_tanpa_izin_tidak_crash"] = (
        app_in_front() and not any("CRASH" in r for r in result["alasan_berhenti"]["boot-tanpa-izin"]))
    log(f"boot tanpa izin lokasi: {'aman' if result['checks']['boot_tanpa_izin_tidak_crash'] else 'APLIKASI CRASH'}")

    # 2) Beri izin, arahkan ke server CI, beri posisi GPS, lalu buka lagi
    for perm in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION",
                 "READ_PHONE_STATE", "POST_NOTIFICATIONS"):
        sh(f"pm grant {PKG} android.permission.{perm}")
    pointed = write_prefs(EMU_SERVER) and backend is not None
    if not pointed:
        # Pengaman: jangan pernah melapor ke server demo publik dari CI.
        sh("svc wifi disable")
        sh("svc data disable")
        log("jaringan emulator DIMATIKAN (aplikasi tidak boleh melapor ke server publik)")
    geo()
    sh(f"am start -n {ACT}")
    for i in range(1, 8):
        time.sleep(4)
        geo(i)
    stop_gps = threading.Event()
    threading.Thread(target=keep_gps_fresh, args=(stop_gps,), daemon=True).start()
    clear_system_dialog(nodes(ui_xml(1)))
    shot("02-utama")
    ns = dump("02-utama")
    result["checks"]["utama_tampil"] = app_in_front()
    result["checks"]["status_di_layar"] = [n["text"] for n in ns if n["text"]][:14]
    result["server_setelah_buka"] = server_view() if pointed else {"ok": False, "error": "tidak diarahkan"}
    log("server melihat: " + json.dumps(result["server_setelah_buka"], ensure_ascii=False))

    # 3) Tampilan tim
    if tap("Tim", wait=9):
        shot("03-tim")
        dump("03-tim")

    # 4) Lembar Lainnya → Pengaturan → Lanjutan
    if tap("Lainnya", wait=2):
        shot("04-lainnya")
        dump("04-lainnya")
        if tap("Pengaturan", wait=2.5):
            shot("05-pengaturan")
            dump("05-pengaturan")
            if tap("Lanjutan", wait=1.5):
                shot("06-pengaturan-lanjutan")
            back()
            if not app_in_front() or find(nodes(ui_xml()), "Simpan"):
                back()
        else:
            back()

    # 5) Aksi di bilah bawah
    if tap("Tandai", wait=2):
        shot("07-tandai")
        tap("Batal", wait=1) or back()
    if tap("Ukur", wait=1.5):
        shot("08-ukur")
    if tap("Lainnya", wait=2):
        if tap("Lingkaran", wait=2):
            shot("09-lingkaran")
        else:
            back()
    if tap("SOS", wait=2):
        shot("10-sos")
        tap("Batal", wait=1) or back()

    # 6) Ganti lapisan peta (satelit ↔ peta jalan), lalu kembali ke posisi sendiri
    if tap("Lapisan peta", wait=8):
        shot("11-peta-jalan")
        tap("Lapisan peta", wait=5)
    tap("Posisi saya", wait=2)

    # 7) Mode 3D: tampilkan, geser, kembali ke posisi sendiri, coba alat Tandai, lalu kembali ke 2D
    mem_snapshot("sebelum_3d")
    font_provider_clients("sebelum_3d")
    if tap("3D", wait=3):
        font_provider_clients("3d_awal")
        time.sleep(9)
        font_provider_clients("3d_setelah_pembersihan")
        time.sleep(4)
        shot("12-peta-3d")
        dump("12-peta-3d")
        result["checks"]["mode_3d_bertahan"] = app_in_front()
        if not result["checks"]["mode_3d_bertahan"]:
            log("APLIKASI HILANG setelah masuk mode 3D")
            save_exit_info("mode-3d")
            save_3d_log()
            sh(f"am start -n {ACT}")                     # buka lagi agar langkah berikutnya tetap teruji
            time.sleep(8)
        else:
            mem_snapshot("dalam_3d")
            pan_3d()
            if tap("Tandai", wait=2, remembered=True):
                shot("12c-tandai-di-3d")
                tap("Batal", wait=1) or back()
            if not tap("2D", wait=4) and "3D" in pos:
                x, y = pos["3D"]                         # tombol 2D berada di tempat yang sama dengan 3D
                sh(f"input tap {x} {y}")
                time.sleep(4)
                log(f"ketuk tombol 2D lewat koordinat ({x},{y})")
            shot("12d-kembali-2d")
            result["checks"]["mode_3d_bertahan"] = app_in_front()

    # 8) Jeda pelaporan
    if tap("Jeda", wait=2):
        shot("13-jeda")
        dump("13-jeda")

    stop_gps.set()
    result["checks"]["masih_di_depan_di_akhir"] = app_in_front()
    result["server_di_akhir"] = server_view() if pointed else {"ok": False, "error": "tidak diarahkan"}

    # 9) Logcat: crash dan log aplikasi, dari rekaman sepanjang uji (cadangan: 6000 baris terakhir)
    save_exit_info("akhir")
    gms_exit_info()
    font_provider_clients("akhir")
    save_3d_log()
    if logcat:
        logcat.terminate()
    lines = logcat_lines()
    if not lines:
        _, out, _ = adb("logcat", "-d", "-v", "time", "-t", "6000", timeout=90)
        lines = out.decode("utf-8", "replace").splitlines()
    crash, keep = [], 0
    for ln in lines:
        if "FATAL EXCEPTION" in ln or "Fatal signal" in ln or "F/DEBUG" in ln or "A/chromium" in ln:
            keep = max(keep, 45)                         # jejak crash Java / native
        elif PKG in ln and ("has died" in ln or "Killing" in ln or "lowmemorykiller" in ln):
            keep = max(keep, 1)                          # proses aplikasi berhenti, apa pun sebabnya
        elif ("gms.persistent" in ln and ("has died" in ln or "Killing" in ln or "Force stopping" in ln)) \
                or "ANR in" in ln or "lowmemorykiller: Kill" in ln or "Force stopping com.google.android.gms" in ln:
            keep = max(keep, 6)                          # Play Services mati / sistem kehabisan memori
        if keep > 0:
            crash.append(ln)
            keep -= 1
    with open(os.path.join(OUT, "logcat-crash.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(crash[-1200:]) or "(tidak ada crash tercatat)")
    app_lines = [ln for ln in lines if "nativeloader" not in ln
                 and ("omni" in ln.lower() or "osmdroid" in ln.lower() or "chromium" in ln.lower())]
    with open(os.path.join(OUT, "logcat-app.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(app_lines[-2500:]))
    # Crash = sistem mencatat proses berhenti tidak wajar, atau ada jejak crash atas nama aplikasi.
    # (Penghentian oleh skrip ini sendiri tercatat sebagai USER REQUESTED dan tidak dihitung.)
    tak_wajar = [r for r in result.get("alasan_berhenti", {}).get("akhir", [])
                 if any(k in r for k in ("CRASH", "LOW_MEMORY", "SIGNALED", "ANR", "EXCESSIVE", "INITIALIZATION"))]
    result["checks"]["crash"] = bool(tak_wajar) or any(
        PKG in ln and ("AndroidRuntime" in ln or "F/DEBUG" in ln) for ln in lines)

    with open(os.path.join(OUT, "e2e.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "e2e-log.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(notes))
    if backend:
        backend.terminate()

    bad = (result["checks"]["crash"] or not result["checks"]["masih_di_depan_di_akhir"]
           or result["checks"].get("mode_3d_bertahan") is False
           or result["checks"].get("boot_tanpa_izin_tidak_crash") is False
           or bool(result["checks"].get("dialog_galat_aplikasi"))
           or not result["taps"].get("3D"))                 # alur utama tidak sempat dijalankan
    log("SELESAI: " + ("ADA MASALAH (crash / aplikasi tertutup)" if bad else "aplikasi bertahan sampai akhir"))
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        code = main()
    except Exception as exc:                       # jangan sampai kehilangan hasil karena galat skrip
        log(f"skrip uji berhenti: {type(exc).__name__}: {exc}")
        code = 3
    with open(os.path.join(OUT, "e2e-log.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(notes))
    sys.exit(code)
