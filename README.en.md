# TFAEL-OMNI v2.0

[Bahasa Indonesia](README.md) | **English**

TFAEL-OMNI is a unified command-center platform (single pane of glass). One screen brings together a tactical map, OSINT, intelligence analysis, cyber security monitoring, digital forensics, and an Android field-agent app. The whole system runs on your own computer or server (self-hosted).

> **Status: prototype.** The project was built by team TFAEL Labs for Kartika Cyber Hackathon 2026 and is now open source so that others can develop it further. Read [Current limits and roadmap](#current-limits-and-roadmap) before using it for real work.

Much of the user interface and most code comments are in Indonesian.

## Contents

- [Features](#features)
- [Technology](#technology)
- [Installation](#installation)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Docker](#docker)
- [First login](#first-login)
- [User guide](#user-guide)
- [Optional features](#optional-features)
- [Android app and radio](#android-app-and-radio)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Current limits and roadmap](#current-limits-and-roadmap)
- [Contributing](#contributing)
- [License](#license)

## Features

| Module | What it does |
|---|---|
| **C4ISR** | Tactical map, unit tracking, geofences, cell-tower geolocation, Cell-ID triangulation with least-squares, and analysis of public CCTV feeds. |
| **OSINT** | Lookups for nine indicator types: domain, IP address, email, phone number, person name, username, vehicle plate, coordinates, and URL. |
| **Intel Graph** | Knowledge graph, pattern of life, and target risk score. |
| **Cyber-physical SIEM** | Detection rules mapped to MITRE ATT&CK, impossible-travel detection, and SOAR playbooks. |
| **Digital forensics** | Evidence vault with a hash chain, EXIF and ELA checks, YARA rules, and PDF evidence reports. |
| **Social media** | Twitter/X data collection and Coordinated Inauthentic Behavior (CIB) detection. |
| **SITREP** | Online news, earthquakes, and BMKG early weather warnings on one map. |
| **Field agent** | Android app that reports position, battery, and cellular signal, with 2D and 3D maps. |

Some features call outside services: OpenCellID/Unwired Labs, BMKG, GeoIP, and social media. Most outbound calls from the server can be turned off with `OMNI_AIRGAP=1`.

## Technology

| Part | Technology |
|---|---|
| Server | Python (HTTP server from the standard library) and SQLite |
| Web interface | React, TypeScript, and Vite |
| Android app | Kotlin, osmdroid (2D map), and MapLibre GL JS (3D map) |

## Installation

Software you need:

| Software | Version | Used for |
|---|---|---|
| Python | 3.10 or newer (3.12 recommended) | Running the server |
| Node.js | 22 or newer | Building the web interface |
| Git | Any version | Downloading the code |

Git is optional. You can click **Code → Download ZIP** on the GitHub page and extract the archive instead.

### macOS

Run every command in the **Terminal** app.

**1. Install the prerequisites.** The easiest way is [Homebrew](https://brew.sh):

```bash
brew install python@3.12 node git
```

Without Homebrew, download the installers from [python.org](https://www.python.org/downloads/) and [nodejs.org](https://nodejs.org/), then replace `python3.12` in step 3 with `python3`.

**2. Download the code.**

```bash
git clone https://github.com/khikmadari/tfael-omni-oss.git
cd tfael-omni-oss
```

**3. Install the Python libraries** in a virtual environment, so they stay separate from the system Python.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-server.txt
```

**4. Build the web interface.** The output is written to the `frontend/` folder.

```bash
npm install --prefix tfael-omni
npm run build --prefix tfael-omni
```

**5. Start the server.** Replace the password with one of your own.

```bash
OMNI_BOOTSTRAP_PASSWORD="replace-with-your-password" python backend/server.py 8080
```

**6. Open `http://localhost:8080`** in a browser, then follow [First login](#first-login).

To start the server again later, repeat `source .venv/bin/activate` and step 5.

### Windows

Run every command in **PowerShell**. The Windows steps were written from reading the code and have not been tested by the team. If something fails, please report it in the Issues tab.

**1. Install the prerequisites** with winget, which ships with Windows 10 and 11:

```powershell
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

When it finishes, close PowerShell and open it again so the new commands are found. Without winget, download the installers from [python.org](https://www.python.org/downloads/) (tick **Add python.exe to PATH**), [nodejs.org](https://nodejs.org/), and [git-scm.com](https://git-scm.com/).

**2. Download the code.**

```powershell
git clone https://github.com/khikmadari/tfael-omni-oss.git
cd tfael-omni-oss
```

**3. Install the Python libraries** in a virtual environment.

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements-server.txt
```

If you see the error "running scripts is disabled on this system", run the command below and then repeat the second line:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**4. Build the web interface.** The output is written to the `frontend\` folder.

```powershell
npm install --prefix tfael-omni
npm run build --prefix tfael-omni
```

**5. Start the server.** Replace the password with one of your own.

```powershell
$env:PYTHONUTF8 = "1"
$env:OMNI_BOOTSTRAP_PASSWORD = "replace-with-your-password"
python backend\server.py 8080
```

If Windows Firewall asks, choose **Allow** for private networks only. Choose **Cancel** if you only open the server from the same computer.

**6. Open `http://localhost:8080`** in a browser, then follow [First login](#first-login).

To start the server again later, repeat `.venv\Scripts\Activate.ps1` and step 5.

### Docker

This works the same on macOS and Windows and only needs [Docker Desktop](https://www.docker.com/products/docker-desktop/). You do not need to install Python or Node.js.

```bash
git clone https://github.com/khikmadari/tfael-omni-oss.git
cd tfael-omni-oss
docker build -t tfael-omni .
docker run --rm -p 8080:8080 -e OMNI_BOOTSTRAP_PASSWORD="replace-with-your-password" tfael-omni
```

With this method the data is lost when the container stops. Add `-v tfael-data:/data` to the `docker run` command to keep it.

## First login

1. Open `http://localhost:8080`.
2. Enter `komandan` as the **Callsign**.
3. Enter the password you set in `OMNI_BOOTSTRAP_PASSWORD` as the **Access Code**.

The other built-in accounts use the same password:

| Callsign | Role |
|---|---|
| `komandan` | Commander (full access) |
| `analis.intel` | Analyst |
| `operator.c2` | Operator |
| `admin.sistem` | Admin |

Good to know:

- Set `OMNI_BOOTSTRAP_PASSWORD` every time you start the server. Without it the password is random and the account must change its password, but the web interface has no change-password form yet.
- The server fills in fictional sample data the first time it starts. Run it with `OMNI_DEMO=0` for a server without sample data.
- Data is stored in `backend/tfael_omni.db`. Delete that file to start over.
- Press `Ctrl+C` in Terminal or PowerShell to stop the server.

## User guide

How to use each workspace is explained step by step in [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md). It covers SITREP, C4ISR, OSINT Profiler, SIEM, DFIR, Intel Graph, BotRadar, Admin, the Android agent app, and common problems.

## Optional features

These features only work when their libraries are installed. The server detects them when it starts.

| Feature | What to install |
|---|---|
| YARA rule scanning | `pip install yara-python` |
| OCR (reading text in images) | `pip install pytesseract` and the Tesseract program: `brew install tesseract` (macOS) or `winget install UB-Mannheim.TesseractOCR` (Windows) |
| Speech transcription | `pip install faster-whisper` |
| Object detection (YOLO) | `pip install ultralytics` |

## Android app and radio

The Android field-agent app is described in [`android/README.md`](android/README.md) (in Indonesian). The app's default server address must be replaced with your own server address under Pengaturan → Lanjutan (Settings → Advanced). Radio integration is described in [`docs/PANDUAN_RADIO.md`](docs/PANDUAN_RADIO.md).

## Configuration

The server is configured with these environment variables:

| Variable | Purpose | Example |
|---|---|---|
| `OMNI_BOOTSTRAP_PASSWORD` | Password of the built-in accounts. If unset, a random password is generated and printed once in the startup log. | `Omni#Rahasia2026` |
| `OMNI_AGENT_KEY` | Pre-shared key for field devices. If empty, a random key is generated every time the server starts. | `FIELD-KEY-7a3f...` |
| `OMNI_ALLOWED_ORIGINS` | Comma-separated list of origins allowed for cross-origin access. Empty means all CORS requests are rejected. | `https://console.markas.local` |
| `OMNI_LOGIN_MAX_FAILS` | Failed logins before the account and IP are locked temporarily (default `5`). | `5` |
| `OMNI_LOGIN_LOCK_SECONDS` | Lock duration in seconds (default `900`, which is 15 minutes). | `900` |
| `OMNI_AIRGAP` | `1` turns off outbound calls to GeoIP, BMKG, cell geolocation services, and social media. | `1` |
| `OMNI_DEMO` | `0` starts a clean server without sample data. | `0` |
| `OMNI_DEMO_HINT` | `1` shares the agent key with the field app through `/api/v2/agent/demo-key` so it is easy to try. Do not enable it on a server in real use. | `1` |
| `OMNI_DB_PATH` | Location of the database file if you want it outside the code folder. | `/data/tfael_omni.db` |

Example for real use on macOS or Linux:

```bash
OMNI_ALLOWED_ORIGINS="https://console.markas.local" \
OMNI_AGENT_KEY="FIELD-KEY-7a3f91c2" \
OMNI_BOOTSTRAP_PASSWORD="Omni#RahasiaAwal2026" \
OMNI_AIRGAP=1 \
OMNI_DEMO=0 \
python backend/server.py 8080
```

## Project structure

| Folder or file | Contents |
|---|---|
| [`backend/`](backend/) | The `/api/v2/*` API server and all analysis engines. The entry point is [`backend/server.py`](backend/server.py). |
| [`tfael-omni/`](tfael-omni/) | Source code of the web interface. The build output goes to `frontend/`. |
| [`android/`](android/) | The Android field-agent app. |
| [`deploy/`](deploy/) | Deployment guides for Docker and Railway. |
| [`tools/`](tools/) | Helper scripts, for example the OpenCellID data import. |
| [`docs/`](docs/) | The user guide and the radio guide. |

## Current limits and roadmap

- **Fictional data only, in line with Indonesia's data protection law.** This repository deliberately contains no real personal or operational data, in line with Law No. 27 of 2022 on Personal Data Protection (UU PDP). All built-in data is fictional, and real data may only be processed by parties with a legal basis.
- **The evidence vault is still a demonstration.** Evidence previews in `frontend/uploads/` are not yet protected by login and have guessable names. Do not store real evidence until this access control is built.
- **Password resets are done by an Admin.** A self-service change-password form for accounts that must change their password is not available yet and is on the roadmap.
- **APRS/LoRa radio awaits hardware validation.** The decoder exists in software but has never been tested with real radio hardware.
- **The Android app is tested automatically on an emulator.** Every app change is built and tested in GitHub Actions. Testing on a range of physical phones is still limited.
- **Twitter/X collection prefers the official API.** The fallback path through Nitter depends on public instances, many of which are no longer active.

## Contributing

Contributions are welcome from anyone:

1. Fork this repo and create a new branch from `main`.
2. Make your changes and run the backend tests with `python -m pytest backend/tests` (needs `pip install pytest`).
3. Open a pull request that explains what changed and why.

Where your help matters most right now:

- **Test it on your phone.** Install the Android agent app on a different phone and report the brand, Android version, and what happened. No coding needed.
- **Be the first Windows tester.** Follow the Windows installation steps in this README and report anything that fails or is unclear.
- **Bring the radio link to life.** Test the APRS/LoRa integration with real radio hardware and help refine the decoder.
- **Strengthen Twitter/X collection.** Update the collection paths so they stay reliable when public Nitter instances are down.
- **Close two known gaps.** Build a self-service change-password form and put the files in `frontend/uploads/` behind login.
- **Reduce the reliance on sample data.** Help modules that still depend on sample data work with the user's own input, then fill in their documentation and tests.

Report bugs and suggestions in the Issues tab. The full rules are in [`CONTRIBUTING.md`](CONTRIBUTING.md). Report security vulnerabilities as described in [`SECURITY.md`](SECURITY.md), not in a public issue.

## License

This code is released under the MIT license; see [`LICENSE`](LICENSE). Optional libraries installed separately keep their own licenses, for example ultralytics (YOLO), which is licensed under AGPL-3.0.

**Compliance note:** the tracker link (`/checkin`), force GPS ping over binary SMS, and social media collection are dual-use features. Use them only with a valid legal basis and authorization, and follow the personal data protection rules that apply to you.
