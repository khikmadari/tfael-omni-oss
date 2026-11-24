# TFAEL-OMNI User Guide

[Bahasa Indonesia](PANDUAN_PENGGUNAAN.md) | **English**

This guide explains how to use TFAEL-OMNI once the server is running. Installation steps are in the [README](../README.en.md#installation). Button and tab names are written exactly as they appear on screen, so many of them are in Indonesian.

## Contents

1. [Signing in and finding your way around](#1-signing-in-and-finding-your-way-around)
2. [SITREP: situation overview](#2-sitrep-situation-overview)
3. [C4ISR: tactical map and field units](#3-c4isr-tactical-map-and-field-units)
4. [OSINT Profiler: open-source lookups](#4-osint-profiler-open-source-lookups)
5. [SIEM: cyber security monitoring](#5-siem-cyber-security-monitoring)
6. [DFIR: digital forensics](#6-dfir-digital-forensics)
7. [Intel Graph: link analysis](#7-intel-graph-link-analysis)
8. [BotRadar: social media monitoring](#8-botradar-social-media-monitoring)
9. [Admin: users, roles, and audit trail](#9-admin-users-roles-and-audit-trail)
10. [Android agent app](#10-android-agent-app)
11. [Common problems](#11-common-problems)

## 1. Signing in and finding your way around

1. Open the server address in a browser, for example `http://localhost:8080`.
2. Fill in **Callsign** and **Access Code**, then press **AUTHENTICATE**. The built-in accounts are listed in the [README](../README.en.md#first-login).
3. An intro animation plays. Press **Lewati** (Skip) to go straight in.

After you sign in, the top bar shows eight workspaces:

| Workspace | Used for |
|---|---|
| **SITREP** | Situation overview from news, earthquakes, and weather warnings |
| **C4ISR** | Tactical map and field units |
| **OSINT Profiler** | Looking up indicators in open sources |
| **SIEM** | Queue of cyber security alerts |
| **DFIR** | Digital evidence and chain of custody |
| **Intel Graph** | Links between entities |
| **BotRadar** | Social media monitoring and coordinated-account detection |
| **Admin** | Users, roles, and audit trail |

The right side of the top bar shows the UTC clock, the number of units, the account name and role, and the **Logout** button. Which workspaces you see depends on the account's role. For example, **Admin** only appears for roles allowed to manage users. On a phone, the workspace list is at the bottom of the screen.

Built-in records marked `[CONTOH]` or `(contoh)` are fictional sample data.

## 2. SITREP: situation overview

SITREP collects online news from Indonesian national media, earthquakes of magnitude 5 and above from BMKG, and BMKG early weather warnings, and shows them on a map of Indonesia. This workspace needs an internet connection.

1. Choose a time range with **24 jam** (24 hours), **7 hari** (7 days), or **Semua** (all).
2. Switch report types on or off with **Insiden**, **Gempa M ≥ 5**, **Berita lain**, **Peringatan cuaca**, and **CCTV**. The number on each button is its report count.
3. Look at the spread on the map. Circles mark earthquakes and their size follows the magnitude. Triangles mark areas with a weather warning. Zoom with the **+** and **−** buttons.
4. Read the details in the right panel. The **Laporan** tab lists news and earthquakes, the **Peringatan** tab lists the weather warnings in force, and the **CCTV** tab lists public cameras.
5. Read the summary at the bottom: **Ringkasan** (summary), **Jenis insiden** (incident types), and **Sebaran per provinsi** (spread by province).
6. Press **Perbarui** to fetch the latest data.

## 3. C4ISR: tactical map and field units

C4ISR shows the position of field units on a map. The built-in units are sample data. Real units appear once the [Android agent app](#10-android-agent-app) starts reporting.

1. Choose a map style in the top right corner of the map: **TAKTIS**, **SATELIT**, or **OSM**.
2. See the **UNIT LAPANGAN** list on the **Unit & C2** tab. Each unit shows its communication link, coordinates, battery, signal strength, and when it was last seen.
3. Click a unit to open its details: coordinates, MGRS, speed, battery, cell tower, and estimated precision radius.
4. Use the buttons under the unit details as needed:
   - **Kirim ping GPS sekarang (SMS terenkripsi)** requests the unit's latest position.
   - **Uji keamanan: tolak SMS spoofing** demonstrates that a forged command is rejected.
   - **Triangulasi Cell-ID offline** estimates the position from cell towers in the local database.
   - **Geolokasi sel NYATA (Unwired Labs)** uses the Unwired Labs service and needs an API key in `OMNI_CELL_API_KEY`.
5. Press **Putar ulang** under **MISSION PLAYBACK** to replay unit movement.
6. Press **Impor GPX** under **RUTE GPX** to show a route from a GPX file.
7. Open the **CCTV & Visi** tab for public cameras and the image analysis features.

Without a physical device, the reply to a GPS ping is marked as simulated.

## 4. OSINT Profiler: open-source lookups

OSINT Profiler looks up one indicator in open sources. It only uses public sources, such as public profiles, DNS, WHOIS, and breach-check services. It contains no population records and no leaked data.

**Looking up an indicator**

1. Open the **Scanner** tab.
2. Choose the indicator type: **NAME**, **USERNAME**, **EMAIL**, **DOMAIN**, **IP**, **PHONE**, **PLATE**, **GPS**, or **URL**. The example text in the search box changes to match.
3. Type the indicator, then press **SCAN**.
4. Read the result. The **DORK LINKS** section holds search links that you open by hand.
5. Use the buttons above the result as needed:
   - **Export PDF** saves the result as a PDF.
   - **Build Graph** turns the result into a graph on the **Knowledge Graph** tab.
   - **Lampirkan ke Dossier** saves the result to a target dossier.

Phone numbers and vehicle plates are only broken down into carrier and region code. The module does not look for the owner.

**Extra tools on the Scanner tab**

- **EMAIL HEADER ANALYZER**: paste a raw email header, then press **Analyze Header** to trace its delivery path.
- **METADATA EXTRACTOR**: drop an image, PDF, or document to read its EXIF, GPS, and other metadata.

**Other tabs**

- **Riwayat Scan** lists the lookups you have run.
- **Dossier & Pelacakan** lists targets with their risk scores. Use **Rename** and **Hapus** (delete) to manage them, and **Lampirkan Hasil Scan** to add a lookup result.

## 5. SIEM: cyber security monitoring

1. Open the **Alert Queue** tab. The four numbers at the top count alerts by level: **CRITICAL**, **HIGH**, **MEDIUM**, and **LOW**.
2. Filter the list with the level buttons below them. Each alert shows the rule that fired, its status (**OPEN** or **MITIGATED**), the source, and the MITRE ATT&CK technique.
3. Press **Impossible Travel** to run the detection for logins from two places that cannot be reached in so short a time.
4. Open the **Host Telemetry** tab to see CPU, memory, disk, and uptime of the server computer. Press **Refresh Telemetry** to update it.
5. Open the **SOAR Playbooks** tab to choose an action: **Block IP**, **Isolate Host**, **Snapshot & Preserve**, **Kill Process**, **Revoke Access Token**, or **Notify SOC Team**.
6. Open the **MITRE ATT&CK** tab to see how alerts map to attack techniques.

In this prototype a playbook only records the action and sets the alert status to **MITIGATED**. It does not change any real device or network.

## 6. DFIR: digital forensics

1. Open the **Evidence Board** tab.
2. Drop a file on the **Klik atau drag file untuk ingest** box. Supported types are images, SQLite, PCAP, PDF, and binary files. Analysis runs automatically.
3. Each piece of evidence appears as a card with its type, file name, SHA-256, and size. The **ELA** and **YARA** badges show which checks are available.
4. Click a card, then open the **Forensic Analysis** tab to read its analysis.
5. Open the **Chain of Custody** tab to see the handling record. Each entry holds its own hash and the hash of the previous entry.
6. Press **Verifikasi Chain** to check that the chain of entries has not changed.

Evidence preview files can still be opened without logging in. Do not upload real evidence until this limitation is fixed.

## 7. Intel Graph: link analysis

Intel Graph shows the links between targets, phone numbers, IP addresses, domains, and locations. The graph is built from OSINT results and dossiers.

1. Open the **Link Graph** tab. **Nodes**, **Edges**, and **Types** show the size of the graph.
2. Choose the **Force** or **Radial** layout. Press **Fit** to bring the whole graph into view.
3. Click a node, then open the **Node Detail** tab to read its details.
4. Open the **Statistics** tab for a summary of the graph and the **Analysis Tools** tab for further analysis, such as finding a path between two nodes.
5. Press **Rebuild** after adding OSINT results so the graph is updated.

## 8. BotRadar: social media monitoring

BotRadar collects social media posts and looks for accounts that move together (Coordinated Inauthentic Behavior).

**Trying it with demo data**

1. Open the **Scrape & Pipeline** tab.
2. Press **Load Demo Data (Bot + CIB + Narrative)**. The demo data is fictional and needs no account.
3. Open the **BotRadar** tab to see each account's score and label: `BOT_CONFIRMED`, `BOT_PROBABLE`, `SUSPICIOUS`, or `LOW_SIGNAL`. Filter with **Label** and **Min score**.
4. Open the **Network Graph** tab to see the links between accounts.
5. Open the **Narrative Intel** tab to see **COORDINATED BEHAVIOR**, which lists pairs of accounts that posted similar content close together in time, and **HASHTAG AMPLIFICATION**, which lists hashtags pushed by several accounts together.

**Collecting real data**

1. Set up a data source on the server. The recommended way is an official X API token in `OMNI_TWITTER_BEARER`. Your own Nitter instances can be listed in `OMNI_NITTER_INSTANCES`.
2. Under **MODE**, choose **Full Pipeline** to collect and analyze, or **Scrape Only** to collect only.
3. Choose the **PLATFORM** and **METODE**. **Mention Search** collects posts that mention a keyword. **User Timeline** collects the posts of one account.
4. Fill in **KATA KUNCI PENCARIAN** (search keywords), set **MAX POSTINGAN** (maximum posts), then press **Jalankan Full Pipeline**.

A bot score is a statistical indication, not proof. Check accounts by hand before drawing conclusions, and follow the terms of service of the platform you collect from.

## 9. Admin: users, roles, and audit trail

This workspace only appears for roles allowed to manage users.

- **User Management**: press **+ Tambah User** to create an account. The **ROLE** column sets the role. The buttons in the **ACTIONS** column deactivate or activate an account (⏸ and ▶), reset its password (🔑), and delete it (🗑). The temporary password is shown once after a reset.
- **RBAC Matrix**: the permission table for each role: KOMANDAN, ANALIS, OPERATOR, ADMIN, and AUDITOR.
- **Audit Log**: the record of every user action. Filter by category (**Auth**, **Admin**, **Scan**, **Forensics**) and result (**Success**, **Fail**). Press **Verify Chain** to check that the audit record has not been altered.

## 10. Android agent app

The agent app reports the phone's position, battery, and cellular signal to the server, so the phone shows up as a unit in C4ISR.

1. Start the server with a fixed `OMNI_AGENT_KEY`. Without it, the key changes every time the server starts.
2. Build and install the app by following [`android/README.md`](../android/README.md) (in Indonesian).
3. Open the app and allow location access.
4. Open **Pengaturan → Lanjutan** (Settings → Advanced), then enter the server address and the same agent key as `OMNI_AGENT_KEY`.
5. Open the **C4ISR** workspace on the web. The phone appears in the **UNIT LAPANGAN** list after its first report arrives.

The phone and the server must be able to reach each other, for example on the same Wi-Fi network.

## 11. Common problems

| Symptom | Cause and fix |
|---|---|
| Password rejected after restarting the server | `OMNI_BOOTSTRAP_PASSWORD` was not set in that session. Stop the server, set the variable, and start it again. |
| Blank page or a "File not found" error | The web interface has not been built. Run `npm install --prefix tfael-omni` and `npm run build --prefix tfael-omni`. |
| SITREP is empty | The server has no internet connection, or `OMNI_AIRGAP=1` is on. |
| Port 8080 is already in use | Start the server on another port, for example `python backend/server.py 8081`, then open `http://localhost:8081`. |
| The agent app is rejected by the server | The agent key in the app differs from `OMNI_AGENT_KEY` on the server. |
| OCR, YARA, transcription, or object detection is not active | The optional library is not installed. See [Optional features](../README.en.md#optional-features). |
| You want to start over | Stop the server, delete `backend/tfael_omni.db`, and start it again. |
