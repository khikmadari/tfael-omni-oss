# Contributing to TFAEL-OMNI

[Bahasa Indonesia](CONTRIBUTING.md) | **English**

Thank you for wanting to help. This guide explains how to set up a development environment, where each part of the code lives, and how to add features, with real examples from this repo.

## Contents

1. [Setting up a development environment](#1-setting-up-a-development-environment)
2. [Code map](#2-code-map)
3. [Example: adding a platform to the username search](#3-example-adding-a-platform-to-the-username-search)
4. [Example: adding an API endpoint](#4-example-adding-an-api-endpoint)
5. [Example: adding a view to the web interface](#5-example-adding-a-view-to-the-web-interface)
6. [Testing](#6-testing)
7. [Code style](#7-code-style)
8. [Commit messages and pull requests](#8-commit-messages-and-pull-requests)
9. [Rules that always apply](#9-rules-that-always-apply)
10. [Security vulnerabilities and license](#10-security-vulnerabilities-and-license)

## 1. Setting up a development environment

Install the prerequisites and libraries by following the [README](README.en.md#installation). To develop, run these two processes in two terminal windows.

```bash
# Window 1: the API server on port 8080
OMNI_BOOTSTRAP_PASSWORD="your-local-password" python backend/server.py 8080

# Window 2: the web interface with automatic reload
npm run dev --prefix tfael-omni
```

Open `http://localhost:5173`. The Vite development server forwards every `/api` request to port 8080, so changes to the web code show up without a rebuild.

## 2. Code map

| Location | Contents |
|---|---|
| `backend/server.py` | Every `/api/v2/*` route. GET routes are in `_do_GET_inner`, POST routes in `_do_POST_inner`. |
| `backend/admin.py` | Login, sessions, roles and permissions (RBAC), and the audit log. |
| `backend/engine_*.py` | The engine of each module: `engine_c2`, `engine_sitrep`, `engine_siem`, `engine_forensics`, `engine_cognitive`, `engine_graph`, `engine_vision`, and others. |
| `backend/osint_engine.py`, `backend/real_osint.py` | OSINT lookups for each indicator type. |
| `backend/tests/` | Backend tests with pytest. |
| `tfael-omni/src/workspaces/` | One file per workspace in the web interface. |
| `tfael-omni/src/components/<module>/` | The components that belong to each workspace. |
| `tfael-omni/src/api/` | `client.ts` holds `apiFetch` and `apiPost`; `endpoints.ts` holds a wrapper for each endpoint. |
| `android/` | The field-agent app (Kotlin) and the emulator test script in `android/ci/`. |

## 3. Example: adding a platform to the username search

The username search checks one account name on many sites. The list of sites is `PLATFORMS` in `backend/osint_engine.py`. Each site is one entry with four values:

```python
PLATFORMS = [
    # (name, profile URL with {u}, "not found" markers, skip)
    ("GitHub", "https://github.com/{u}",
     ["Not Found", "page not found", "Join GitHub today"], False),
]
```

To add a site, add one entry that follows these rules:

1. **The profile URL** uses `{u}` where the account name goes.
2. **The "not found" markers** are text that only appears on the page when the account does not exist. Open the profile URL with an account name that certainly does not exist, then copy a distinctive piece of text from that page.
3. **The last value** is `True` only to switch the site off temporarily.

An account is reported as found with high confidence when its page contains the account name. If the page opens but does not contain the name, the result is marked as unverified.

Test your new entry from the `backend` folder before opening a pull request, once with an account that exists and once with one that does not:

```bash
cd backend
python -c "from osint_engine import _check_one; print(_check_one('torvalds', 'GitHub', 'https://github.com/{u}', ['Not Found'], False))"
```

Only add sites whose profiles are open to the public. Do not add checks that need a login, get around a site's protections, or use leaked data.

## 4. Example: adding an API endpoint

Every endpoint must check the login, except those that have to be open, such as the login page.

**A GET endpoint** goes in `_do_GET_inner` in `backend/server.py`:

```python
if path == "/api/v2/contoh/halo":
    sess, ok = self._require_auth()
    if not ok: return
    self._send_json({"ok": True, "pesan": f"Halo, {sess['username']}"})
    return
```

**A POST endpoint** goes in `_do_POST_inner`. There, `payload` already holds the JSON body and `sess` already holds the user's session.

```python
# 1. If the endpoint needs a specific role permission, register it in PERM_BY_PATH.
PERM_BY_PATH = {
    "/api/v2/contoh/simpan": "run_recon",
}

# 2. Write the handler. Reject requests without a session.
if path == "/api/v2/contoh/simpan":
    if not sess:
        self._send_json({"ok": False, "error": "Sesi tidak valid."}, status=401); return
    nama = str(payload.get("nama", "")).strip()
    self._send_json({"ok": True, "nama": nama})
    return
```

**On the web side**, add its wrapper in `tfael-omni/src/api/endpoints.ts`. Always use `apiFetch` or `apiPost`, never a bare `fetch`, so the login token is sent along.

```ts
export function halo() {
  return apiFetch<{ ok: boolean; pesan: string }>('/api/v2/contoh/halo').then(r => r.data);
}
```

Logic longer than a few lines belongs in the matching `engine_*.py` file, with `server.py` only calling it.

## 5. Example: adding a view to the web interface

- **A new component in an existing workspace:** create the file in `tfael-omni/src/components/<module>/`, then use it from the workspace file in `tfael-omni/src/workspaces/`.
- **A new workspace:** create a file in `tfael-omni/src/workspaces/`, add its id to `WorkspaceId` in `src/context/AppContext.tsx`, register its tab in `src/components/layout/workspaces.ts`, then load the component in `src/App.tsx`.
- **Icons and fonts** are stored in the repo. Do not load icons, fonts, or scripts from a CDN, so the web interface can still load on a closed network.
- **The phone layout** uses its own arrangement for screens 768 pixels wide or less. Check your change at both sizes.

## 6. Testing

| Part | Command | Notes |
|---|---|---|
| Backend | `python -m pytest backend/tests` | Needs `pip install pytest`. Add tests for new logic in `backend/tests/`. |
| Web | `npm run build --prefix tfael-omni` | Must finish without errors. |
| Web | `npm run lint --prefix tfael-omni` | Code style check. Do not add new warnings. |
| Android | Push the change to your fork | GitHub Actions builds the APK and tests it on an emulator. Enable Actions in your fork first. |

Backend tests use a temporary database. See `backend/tests/test_admin.py` for the pattern.

## 7. Code style

- Follow the style and language of the file you are changing. Most comments and interface text are in Indonesian, while established technical terms stay in English.
- **Python:** add type hints to new functions, keep functions short, and return a clear error message instead of swallowing errors.
- **TypeScript:** use function components and call the API only through `apiFetch` or `apiPost`.
- **Kotlin:** the Android app builds its interface in code, without XML layout files.
- Do not add a new library without a clear need. If you need one, explain why in the pull request.
- Update the README or the user guide when the app's behaviour changes. Both exist in Indonesian and English, so change both.

## 8. Commit messages and pull requests

Commit messages use the form `type: summary`, in Indonesian or English.

| Type | Used for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation |
| `test` | Tests |
| `chore` | Maintenance that does not change behaviour |
| `ci` | Automation changes |

Example: `fix(osint): not-found marker for GitLab`.

The pull request flow:

1. Fork this repo and create a new branch from `main` with a name that says what it does, for example `add-gitlab-platform`.
2. Keep the change as small as possible. One pull request should have one purpose.
3. Run the tests in section 6.
4. Open a pull request and fill in the template. For a large change, open an issue first so the direction can be agreed.

## 9. Rules that always apply

- **No real personal data.** Do not put the name, phone number, email, national ID number, vehicle plate, photo, or leaked data of a real person into code, sample data, tests, or screenshots. Use data that is clearly fictional, such as the `example.com` domain and account names ending in `_demo`. This follows Indonesia's Law No. 27 of 2022 on Personal Data Protection.
- **No secrets.** Do not include API keys, tokens, passwords, session cookies, or `.env` files.
- **Sample data stays neutral.** Do not use political figures, parties, or issues as sample data.
- **No unauthorized access.** Contributions that add the ability to access someone else's account, device, or data without permission are not accepted.
- **Automation changes get a closer review.** Files in `.github/`, `android/ci/`, and Gradle files are run automatically by GitHub Actions, so changes to them need a clear reason in the pull request.

## 10. Security vulnerabilities and license

Do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

By submitting a contribution, you agree that it is released under the same [MIT license](LICENSE) as this project.
