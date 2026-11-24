"""
twitter_stealth.py — Multi-layer stealth Twitter/X scraper for Tfael Omni
==========================================================================
Bypasses X anti-bot protection using:

Layer 1 (Primary):   curl_cffi (Chrome TLS fingerprint / JA3 spoofing)
                     + reverse-engineered x-client-transaction-id algorithm
                     (ported from twikit — no external dependency)
Layer 2 (Fallback):  standard requests — emergency last resort

Each layer maintains the same output format for seamless integration
with engine_cognitive.py
"""

import json
import time
import math
import random
import os
import re
import logging
import hashlib
import base64
import pathlib
from typing import List, Dict, Optional, Any, Union
from functools import reduce

# Auto-load .env from project root (godeye/)
try:
    from dotenv import load_dotenv
    _env_path = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path, override=True)
except ImportError:
    pass  # dotenv not installed — rely on os.environ or fallbacks

_log = logging.getLogger("twitter_stealth")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BEARER = (
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
    "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)

GRAPHQL_SEARCH = (
    "https://x.com/i/api/graphql/nK1dw4oV3k4w5TdtcAdSww/SearchTimeline"
)

FEATURES = {
    "rweb_video_screen_enabled": False,
    "rweb_cashtags_enabled": True,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    "responsive_web_profile_redirect_enabled": True,
    "rweb_tipjar_consumption_enabled": False,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "premium_content_api_read_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "responsive_web_grok_analyze_button_fetch_trends_enabled": False,
    "responsive_web_grok_analyze_post_followups_enabled": True,
    "rweb_cashtags_composer_attachment_enabled": True,
    "responsive_web_jetfuel_frame": True,
    "rweb_sports_post_context_enabled": True,
    "x_elections_post_context_enabled": True,
    "responsive_web_grok_share_attachment_enabled": True,
    "responsive_web_grok_annotations_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "rweb_conversational_replies_downvote_enabled": False,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "content_disclosure_indicator_enabled": True,
    "content_disclosure_ai_generated_indicator_enabled": True,
    "responsive_web_grok_show_grok_translated_post": True,
    "responsive_web_grok_analysis_button_from_backend": True,
    "post_ctas_fetch_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": False,
    "responsive_web_nested_quote_preview_enabled": True,
    "responsive_web_grok_image_annotation_enabled": True,
    "responsive_web_grok_imagine_annotation_enabled": True,
    "responsive_web_made_on_x_label_enabled": False,
    "responsive_web_grok_community_note_auto_translation_is_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
}

# Chrome-like user agent (keep updated)
_CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

def _get_cookies() -> Dict[str, str]:
    """Cookie sesi Twitter, hanya dari variabel lingkungan (.env). Tidak ada nilai cadangan di kode."""
    return {
        "auth_token": os.environ.get("OMNI_TWITTER_AUTH_TOKEN", ""),
        "ct0": os.environ.get("OMNI_TWITTER_CT0", ""),
        "cf_clearance": os.environ.get("OMNI_TWITTER_CF_CLEARANCE", ""),
        "twid": os.environ.get("OMNI_TWITTER_TWID", ""),
    }


def _cookie_dict(cookies: Dict[str, str]) -> Dict[str, str]:
    """Build a cookie dict for requests, omitting empty values."""
    d = {
        "auth_token": cookies["auth_token"],
        "ct0": cookies["ct0"],
        "twid": cookies["twid"],
    }
    if cookies.get("cf_clearance"):
        d["cf_clearance"] = cookies["cf_clearance"]
    return d


# ---------------------------------------------------------------------------
# Output normaliser — same dict shape regardless of which layer produced it
# ---------------------------------------------------------------------------

def _normalize_tweet(
    tweet_id: str,
    text: str,
    username: str,
    name: str,
    created_at: str,
    retweet_count: int = 0,
    like_count: int = 0,
    reply_count: int = 0,
    followers: int = 0,
    lang: str = "",
    is_retweet: bool = False,
    user_created_at: str = "",
) -> Dict[str, Any]:
    return {
        "id": tweet_id,
        "text": text,
        "username": username,
        "name": name,
        "created_at": created_at,
        "retweet_count": retweet_count,
        "like_count": like_count,
        "reply_count": reply_count,
        "followers": followers,
        "url": f"https://x.com/{username}/status/{tweet_id}",
        "lang": lang,
        "is_retweet": is_retweet,
        "user_created_at": user_created_at,
    }


# ===========================================================================
#  x-client-transaction-id generator
#  (Reverse-engineered from twikit — inlined, zero external dependency)
# ===========================================================================

# Old format (pre-2025): "ondemand.s":"HASH"
_OD_FILE_RE_OLD = re.compile(
    r"""['"][ondemand.s'"]\s*:\s*['"]([a-f0-9]+)['"]""",
)
# New format (2025+): two separate webpack maps
# Step 1: find chunk ID — e.g. 59924:"ondemand.s"
_OD_CHUNK_ID_RE = re.compile(r'(\d+)\s*:\s*["\']ondemand\.s["\']')
# Step 2: find hash for that chunk ID — e.g. 59924:"fde8982e679964f8"
# (built dynamically with the chunk ID)

_INDICES_RE = re.compile(
    r"""(\(\w{1}\[(\d{1,2})\],\s*16\))+""",
    re.VERBOSE | re.MULTILINE,
)


def _float_to_hex(x: float) -> str:
    result: list = []
    quotient = int(x)
    fraction = x - quotient
    while quotient > 0:
        quotient = int(x / 16)
        remainder = int(x - float(quotient) * 16)
        result.insert(0, chr(remainder + 55) if remainder > 9 else str(remainder))
        x = float(quotient)
    if fraction == 0:
        return "".join(result)
    result.append(".")
    while fraction > 0:
        fraction *= 16
        integer = int(fraction)
        fraction -= float(integer)
        result.append(chr(integer + 55) if integer > 9 else str(integer))
    return "".join(result)


def _is_odd(num: Union[int, float]) -> float:
    return -1.0 if num % 2 else 0.0


class _Cubic:
    """Cubic bezier curve solver."""

    def __init__(self, curves: List[Union[float, int]]):
        self.curves = curves

    def get_value(self, t: Union[float, int]) -> float:
        if t <= 0.0:
            if self.curves[0] > 0.0:
                return (self.curves[1] / self.curves[0]) * t
            if self.curves[1] == 0.0 and self.curves[2] > 0.0:
                return (self.curves[3] / self.curves[2]) * t
            return 0.0
        if t >= 1.0:
            if self.curves[2] < 1.0:
                g = (self.curves[3] - 1.0) / (self.curves[2] - 1.0)
            elif self.curves[0] < 1.0:
                g = (self.curves[1] - 1.0) / (self.curves[0] - 1.0)
            else:
                g = 0.0
            return 1.0 + g * (t - 1.0)
        lo, hi, mid = 0.0, 1.0, 0.0
        while lo < hi:
            mid = (lo + hi) / 2
            x_est = self._calc(self.curves[0], self.curves[2], mid)
            if abs(t - x_est) < 1e-5:
                return self._calc(self.curves[1], self.curves[3], mid)
            if x_est < t:
                lo = mid
            else:
                hi = mid
        return self._calc(self.curves[1], self.curves[3], mid)

    @staticmethod
    def _calc(a: float, b: float, m: float) -> float:
        return 3.0 * a * (1 - m) ** 2 * m + 3.0 * b * (1 - m) * m * m + m ** 3


def _interpolate(from_l: list, to_l: list, f: float) -> list:
    return [fr * (1 - f) + to * f for fr, to in zip(from_l, to_l)]


def _rotation_matrix(deg: float) -> list:
    r = math.radians(deg)
    return [math.cos(r), -math.sin(r), math.sin(r), math.cos(r)]


class _TransactionGenerator:
    """
    Generates valid x-client-transaction-id values by replicating
    the algorithm X's JS client uses (SVG animation + SHA-256 hash).
    All HTTP requests go through the caller-supplied session so we
    keep the Chrome TLS fingerprint from curl_cffi.
    """

    ADDITIONAL_RANDOM_NUMBER = 3
    DEFAULT_KEYWORD = "obfiowerehiring"

    def __init__(self):
        self._home_page = None
        self._row_index = None
        self._key_bytes_indices = None
        self._key = None
        self._key_bytes = None
        self._animation_key = None

    # -- public ---------------------------------------------------------------

    def init_sync(self, http_get, cookies: dict) -> bool:
        """
        Initialise from x.com.
        *http_get(url, **kw)* must be a synchronous GET that returns an
        object with .content (bytes) and .text (str).
        Returns True on success.
        """
        try:
            import bs4
        except ImportError:
            _log.warning("beautifulsoup4 not installed — cannot generate tx-id")
            return False

        try:
            hdrs = {"user-agent": _CHROME_UA}
            ck = _cookie_dict(cookies)

            # 1. homepage
            resp = http_get("https://x.com", headers=hdrs, cookies=ck, timeout=20)
            raw_text = resp.text  # keep raw for regex (BS4 mangles JS)
            page = bs4.BeautifulSoup(resp.content, "html.parser")
            page = self._handle_migration(page, resp, http_get, hdrs, ck)

            # 2. ondemand JS → key-byte indices
            od_hash = self._find_ondemand_hash(raw_text)
            if not od_hash:
                _log.warning("tx: no ondemand.s hash on homepage")
                return False

            js_url = (
                "https://abs.twimg.com/responsive-web/client-web/"
                f"ondemand.s.{od_hash}a.js"
            )
            js_resp = http_get(js_url, headers=hdrs, timeout=15)
            indices = [int(m.group(2)) for m in _INDICES_RE.finditer(js_resp.text)]
            if not indices:
                _log.warning("tx: no key-byte indices in ondemand JS")
                return False

            self._row_index = indices[0]
            self._key_bytes_indices = indices[1:]

            # 3. verification key from <meta>
            el = page.select_one("[name='twitter-site-verification']")
            if not el:
                _log.warning("tx: no twitter-site-verification meta")
                return False
            self._key = el.get("content")
            self._key_bytes = list(base64.b64decode(self._key.encode()))

            # 4. animation key from SVG frames
            self._home_page = page
            self._animation_key = self._compute_animation_key()
            _log.info("tx: transaction-id generator ready")
            return True

        except Exception as exc:
            _log.warning("tx init failed: %s", exc)
            return False

    def generate(self, method: str, path: str) -> str:
        """Return a valid x-client-transaction-id for *method* + *path*."""
        now = math.floor((time.time() * 1000 - 1682924400 * 1000) / 1000)
        time_bytes = [(now >> (i * 8)) & 0xFF for i in range(4)]
        h = hashlib.sha256(
            f"{method}!{path}!{now}{self.DEFAULT_KEYWORD}{self._animation_key}".encode()
        ).digest()
        rand = random.randint(0, 255)
        arr = [*self._key_bytes, *time_bytes, *list(h)[:16], self.ADDITIONAL_RANDOM_NUMBER]
        out = bytearray([rand, *[b ^ rand for b in arr]])
        return base64.b64encode(bytes(out)).decode().rstrip("=")

    # -- internals ------------------------------------------------------------

    @staticmethod
    def _find_ondemand_hash(raw_text: str):
        """
        Extract the webpack hash for ondemand.s chunk.
        Supports both old format ("ondemand.s":"HASH") and
        new format (two separate maps: ID:"ondemand.s" + ID:"HASH").
        """
        # Try old format first: "ondemand.s":"hash"
        old_m = _OD_FILE_RE_OLD.search(raw_text)
        if old_m:
            _log.debug("tx: found ondemand.s hash (old format)")
            return old_m.group(1)

        # New format: find chunk ID, then look up its hash
        cid_m = _OD_CHUNK_ID_RE.search(raw_text)
        if not cid_m:
            return None
        chunk_id = cid_m.group(1)
        _log.debug("tx: ondemand.s chunk ID = %s", chunk_id)

        # Find the hash for this chunk ID in a separate map
        # Pattern: chunkId:"hexhash" (at least 8 hex chars)
        hash_re = re.compile(
            rf'(?<!["\w]){chunk_id}\s*:\s*"([a-f0-9]{{8,}})"'
        )
        # There may be multiple maps; the chunk-name map has the
        # chunk name as value, so we skip matches where the value
        # equals "ondemand.s" and pick the hex hash.
        for hm in hash_re.finditer(raw_text):
            val = hm.group(1)
            if val != "ondemand":  # skip the name map entry
                _log.debug("tx: ondemand.s hash = %s", val)
                return val

        return None

    @staticmethod
    def _handle_migration(page, resp, http_get, hdrs, ck):
        import bs4

        mig_re = re.compile(
            r"(https?://(?:www\.)?(twitter|x)\.com(/x)?/migrate([/?])?tok=[a-zA-Z0-9%\-_]+)+",
            re.VERBOSE,
        )
        meta = page.select_one("meta[http-equiv='refresh']")
        m = re.search(mig_re, str(meta)) or re.search(mig_re, str(resp.content))
        if m:
            resp = http_get(m.group(0), headers=hdrs, cookies=ck, timeout=15)
            page = bs4.BeautifulSoup(resp.content, "html.parser")

        form = page.select_one("form[name='f']") or page.select_one(
            "form[action='https://x.com/x/migrate']"
        )
        if form:
            # Migration form — typically POST
            _log.debug("tx: handling migration form")
            act = form.attrs.get("action", "https://x.com/x/migrate") + "/?mx=2"
            resp = http_get(act, headers=hdrs, cookies=ck, timeout=15)
            page = bs4.BeautifulSoup(resp.content, "html.parser")
        return page

    def _compute_animation_key(self) -> str:
        total_time = 4096
        kb = self._key_bytes
        row_idx = kb[self._row_index] % 16
        frame_time = reduce(
            lambda a, b: a * b,
            [kb[i] % 16 for i in self._key_bytes_indices],
        )

        # Parse SVG frames
        frames_els = self._home_page.select("[id^='loading-x-anim']")
        svg_children = list(list(frames_els[kb[5] % 4].children)[0].children)
        d_attr = svg_children[1].get("d")
        arr_2d = [
            [int(x) for x in re.sub(r"[^\d]+", " ", s).strip().split()]
            for s in d_attr[9:].split("C")
        ]

        frame_row = arr_2d[row_idx]
        target_time = float(frame_time) / total_time
        return self._animate(frame_row, target_time)

    def _animate(self, frames: list, target_time: float) -> str:
        from_color = [float(v) for v in [*frames[:3], 1]]
        to_color = [float(v) for v in [*frames[3:6], 1]]
        from_rot = [0.0]
        to_rot = [self._solve(float(frames[6]), 60.0, 360.0, True)]
        curves_raw = frames[7:]
        curves = [
            self._solve(float(v), _is_odd(i), 1.0, False)
            for i, v in enumerate(curves_raw)
        ]
        cubic = _Cubic(curves)
        val = cubic.get_value(target_time)

        color = _interpolate(from_color, to_color, val)
        color = [max(0, c) for c in color]
        rotation = _interpolate(from_rot, to_rot, val)
        matrix = _rotation_matrix(rotation[0])

        parts = [format(round(c), "x") for c in color[:-1]]
        for v in matrix:
            rv = round(abs(v), 2)
            hx = _float_to_hex(rv)
            if hx.startswith("."):
                parts.append(f"0{hx}".lower())
            elif hx:
                parts.append(hx)
            else:
                parts.append("0")
        parts.extend(["0", "0"])
        return re.sub(r"[.\-]", "", "".join(parts))

    @staticmethod
    def _solve(value: float, mn: float, mx: float, rounding: bool) -> float:
        result = value * (mx - mn) / 255 + mn
        return math.floor(result) if rounding else round(result, 2)


# ===========================================================================
#  LAYER 1 — curl_cffi + real x-client-transaction-id  (PRIMARY)
# ===========================================================================

def _scrape_curl_cffi(query: str, max_results: int) -> Optional[List[Dict]]:
    """
    Chrome TLS fingerprint (JA3/JA4 spoofing via curl_cffi) combined with
    a real x-client-transaction-id generated from X's own algorithm.
    This is the highest-confidence approach.
    """
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        _log.debug("curl_cffi not installed, skipping")
        return None

    cookies = _get_cookies()

    try:
        session = cffi_requests.Session(impersonate="chrome")

        # Initialise the real transaction-id generator
        _log.debug("curl_cffi: building transaction-id generator via x.com…")
        tx = _TransactionGenerator()
        tx_ok = tx.init_sync(session.get, cookies)
        if tx_ok:
            _log.info("curl_cffi: real tx-id generator ready ✓")
        else:
            _log.warning("curl_cffi: tx-id init failed — using random fallback")

        # Pick up any refreshed ct0 from the init requests
        if "ct0" in session.cookies:
            cookies["ct0"] = session.cookies["ct0"]
            _log.debug("curl_cffi: got fresh ct0 from session")

        # Headers matching a real Chrome browser
        headers = {
            "authorization": f"Bearer {BEARER}",
            "x-csrf-token": cookies["ct0"],
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-client-language": "en",
            "user-agent": _CHROME_UA,
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "accept-encoding": "gzip, deflate, br",
            "referer": f"https://x.com/search?q={query}&src=typed_query",
            "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }

        request_cookies = _cookie_dict(cookies)
        results: List[Dict] = []
        cursor = None

        while len(results) < max_results:
            variables = {
                "rawQuery": query,
                "count": min(20, max_results - len(results)),
                "querySource": "typed_query",
                "product": "Latest",
            }
            if cursor:
                variables["cursor"] = cursor

            params = {
                "variables": json.dumps(variables, separators=(",", ":")),
                "features": json.dumps(FEATURES, separators=(",", ":")),
            }

            # Generate real (or random-fallback) transaction ID
            api_path = "/i/api/graphql/nK1dw4oV3k4w5TdtcAdSww/SearchTimeline"
            if tx_ok:
                try:
                    headers["x-client-transaction-id"] = tx.generate("GET", api_path)
                except Exception as tx_err:
                    _log.debug("tx-id gen error, random fallback: %s", tx_err)
                    headers["x-client-transaction-id"] = (
                        base64.b64encode(os.urandom(48)).decode().rstrip("=")
                    )
            else:
                headers["x-client-transaction-id"] = (
                    base64.b64encode(os.urandom(48)).decode().rstrip("=")
                )

            resp = session.get(
                GRAPHQL_SEARCH,
                params=params,
                headers=headers,
                cookies=request_cookies,
                timeout=15,
            )

            if resp.status_code == 429:
                _log.warning("curl_cffi: rate limited (429), waiting 30s")
                time.sleep(30)
                continue
            if resp.status_code != 200:
                _log.warning(
                    "curl_cffi: HTTP %d — %s",
                    resp.status_code,
                    resp.text[:500] if resp.text else "(empty)",
                )
                break

            data = resp.json()
            tweets, next_cursor = _parse_graphql_response(data)
            results.extend(tweets)

            if not next_cursor or not tweets:
                break
            cursor = next_cursor
            time.sleep(random.uniform(1.0, 2.5))

        return results if results else None

    except Exception as e:
        _log.warning("curl_cffi layer failed: %s", e)
        return None


# ===========================================================================
#  LAYER 2 — standard requests (emergency fallback)
# ===========================================================================

def _scrape_requests(query: str, max_results: int) -> Optional[List[Dict]]:
    """
    Emergency fallback using standard requests library.
    Lowest chance of success but works when nothing else is installed.
    """
    try:
        import requests
    except ImportError:
        return None

    cookies = _get_cookies()

    try:
        session = requests.Session()
        session.headers.update({
            "authorization": f"Bearer {BEARER}",
            "x-csrf-token": cookies["ct0"],
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-client-language": "en",
            "user-agent": _CHROME_UA,
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "referer": f"https://x.com/search?q={query}&src=typed_query",
        })
        session.cookies.set("auth_token", cookies["auth_token"], domain=".x.com")
        session.cookies.set("ct0", cookies["ct0"], domain=".x.com")
        session.cookies.set("twid", cookies["twid"], domain=".x.com")
        if cookies.get("cf_clearance"):
            session.cookies.set("cf_clearance", cookies["cf_clearance"], domain=".x.com")

        results: List[Dict] = []
        cursor = None

        while len(results) < max_results:
            variables = {
                "rawQuery": query,
                "count": min(20, max_results - len(results)),
                "querySource": "typed_query",
                "product": "Latest",
            }
            if cursor:
                variables["cursor"] = cursor

            params = {
                "variables": json.dumps(variables, separators=(",", ":")),
                "features": json.dumps(FEATURES, separators=(",", ":")),
            }

            resp = session.get(GRAPHQL_SEARCH, params=params, timeout=15)
            if resp.status_code == 429:
                time.sleep(30)
                continue
            if resp.status_code != 200:
                break

            data = resp.json()
            tweets, next_cursor = _parse_graphql_response(data)
            results.extend(tweets)

            if not next_cursor or not tweets:
                break
            cursor = next_cursor
            time.sleep(random.uniform(1.0, 2.5))

        return results if results else None

    except Exception as e:
        _log.warning("requests layer failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# GraphQL response parser (shared by both layers)
# ---------------------------------------------------------------------------

def _parse_graphql_response(data: dict):
    """Parse X GraphQL SearchTimeline response into normalised tweets."""
    tweets = []
    next_cursor = None

    instructions = (
        data.get("data", {})
        .get("search_by_raw_query", {})
        .get("search_timeline", {})
        .get("timeline", {})
        .get("instructions", [])
    )

    for instruction in instructions:
        itype = instruction.get("type", "")
        entries = []

        if itype == "TimelineAddEntries":
            entries = instruction.get("entries", [])
        elif itype == "TimelineReplaceEntry":
            entry = instruction.get("entry")
            if entry:
                entries = [entry]

        for entry in entries:
            entry_id = entry.get("entryId", "")

            # Cursor extraction
            if "cursor-bottom" in entry_id:
                next_cursor = (
                    entry.get("content", {}).get("value")
                    or entry.get("content", {})
                    .get("operation", {})
                    .get("cursor", {})
                    .get("value")
                )
                continue

            # Tweet extraction
            result = (
                entry.get("content", {})
                .get("itemContent", {})
                .get("tweet_results", {})
                .get("result", {})
            )
            if not result:
                continue

            if result.get("__typename") == "TweetWithVisibilityResults":
                result = result.get("tweet", result)

            legacy = result.get("legacy", {})

            # Extract user info - handle both old and new X formats
            user_obj = (
                result.get("core", {})
                .get("user_results", {})
                .get("result", {})
            )
            # Old format: everything in user_results.result.legacy
            user_legacy = user_obj.get("legacy", {}) if isinstance(user_obj, dict) else {}
            # New format (2025+): screen_name in user_results.result.core
            user_core = user_obj.get("core", {}) if isinstance(user_obj, dict) else {}
            user_rel = user_obj.get("relationship_counts", {}) if isinstance(user_obj, dict) else {}

            username = (
                user_legacy.get("screen_name")
                or user_core.get("screen_name", "")
            )
            display_name = (
                user_legacy.get("name")
                or user_core.get("name", "")
            )
            followers_raw = (
                user_legacy.get("followers_count")
                or user_rel.get("followers_count")
                or user_rel.get("followers", 0)
            )

            if not legacy:
                continue

            tweets.append(
                _normalize_tweet(
                    tweet_id=legacy.get("id_str", ""),
                    text=legacy.get("full_text", ""),
                    username=username,
                    name=display_name,
                    created_at=legacy.get("created_at", ""),
                    retweet_count=legacy.get("retweet_count", 0),
                    like_count=legacy.get("favorite_count", 0),
                    reply_count=legacy.get("reply_count", 0),
                    followers=followers_raw if isinstance(followers_raw, int) else 0,
                    lang=legacy.get("lang", ""),
                    is_retweet="retweeted_status_id_str" in legacy,
                    user_created_at=user_legacy.get("created_at", ""),
                )
            )

    return tweets, next_cursor


# ===========================================================================
#  Main scraper class — maintains backward compatibility
# ===========================================================================

class TwitterStealthScraper:
    """
    Multi-layer stealth scraper.
    Tries layers in order of reliability until one succeeds.
    """

    def __init__(self):
        self._layers = [
            ("curl_cffi", _scrape_curl_cffi),   # Chrome TLS + real tx-id
            ("requests", _scrape_requests),      # emergency fallback
        ]

    def scrape(self, query: str, max_results: int = 200) -> list:
        """
        Scrape X/Twitter search results.
        Tries each layer in order until one returns results.
        """
        last_error = None

        for layer_name, layer_fn in self._layers:
            _log.info("Trying layer: %s", layer_name)
            try:
                results = layer_fn(query, max_results)
                if results:
                    _log.info(
                        "Layer %s succeeded: %d tweets",
                        layer_name,
                        len(results),
                    )
                    return results[:max_results]
                else:
                    _log.warning("Layer %s returned no results", layer_name)
            except Exception as e:
                _log.warning("Layer %s error: %s", layer_name, e)
                last_error = e

        # All layers failed
        if last_error:
            raise Exception(
                f"Semua layer scraping gagal. Error terakhir: {last_error}"
            )
        return []


# ---------------------------------------------------------------------------
# Public API — backward compatible with engine_cognitive.py
# ---------------------------------------------------------------------------

def scrape_twitter(query: str, max_posts: int = 200) -> list:
    """
    Main entry point. Drop-in replacement for the old scrape_twitter().
    Returns list of tweet dicts with keys:
        id, text, username, name, created_at, retweet_count,
        like_count, reply_count, followers, url, lang, is_retweet
    """
    scraper = TwitterStealthScraper()
    return scraper.scrape(query, max_results=max_posts)


# ===========================================================================
#  UserByScreenName + UserTweets (User Timeline mode)
# ===========================================================================

GRAPHQL_USER_BY_SCREEN_NAME = os.environ.get(
    "OMNI_TWITTER_QID_USER_BY_SCREEN_NAME",
    "https://x.com/i/api/graphql/xmU6X_CKVnQ5lSroBOYH1A/UserByScreenName",
)

GRAPHQL_USER_TWEETS = os.environ.get(
    "OMNI_TWITTER_QID_USER_TWEETS",
    "https://x.com/i/api/graphql/V7H0Ap3_Hh2FyS75OCDO3Q/UserTweets",
)

FEATURES_USER = {
    "hidden_profile_subscriptions_enabled": True,
    "rweb_tipjar_consumption_enabled": False,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
    "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": True,
    "subscriptions_feature_can_gift_premium": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
}

FIELD_TOGGLES_USER = {
    "withAuxiliaryUserLabels": False,
}

# Cache: populated by _get_user_id; prevents duplicate UserByScreenName calls per session
_user_profile_cache: Dict[str, Dict] = {}


def _get_user_id_v1(username: str, session, cookies: dict, headers: dict) -> Optional[Dict]:
    """
    Fallback: resolve username via Twitter v1.1 REST API /users/show.json.
    More stable than GraphQL — hash never changes.
    """
    ct0 = cookies.get("ct0", "")
    h = {
        **headers,
        "Authorization": f"Bearer {BEARER}",
        "x-csrf-token": ct0,
    }
    try:
        resp = session.get(
            "https://api.twitter.com/1.1/users/show.json",
            params={"screen_name": username, "include_entities": "false"},
            headers=h,
            cookies=_cookie_dict(cookies),
            timeout=15,
        )
        if resp.status_code != 200:
            _log.warning("v1.1 users/show HTTP %d for @%s", resp.status_code, username)
            return None
        u = resp.json()
        user_id = str(u.get("id_str") or u.get("id", ""))
        if not user_id:
            return None
        profile = {
            "user_id": user_id,
            "followers_count": u.get("followers_count", 0),
            "friends_count": u.get("friends_count", 0),
            "statuses_count": u.get("statuses_count", 0),
            "created_at": u.get("created_at", ""),
            "description": u.get("description", ""),
            "name": u.get("name", ""),
            "screen_name": u.get("screen_name", username),
            "verified": u.get("verified", False),
            "profile_image_url": u.get("profile_image_url_https", ""),
        }
        _user_profile_cache[username.lower()] = profile
        _log.info("v1.1 resolved @%s → user_id %s", username, user_id)
        return profile
    except Exception as e:
        _log.warning("v1.1 users/show failed for @%s: %s", username, e)
        return None


def _get_user_id(username: str, session, cookies: dict, headers: dict) -> Optional[Dict]:
    """
    Resolve username → full profile dict via UserByScreenName endpoint.
    Returns dict with user_id, followers_count, friends_count, statuses_count,
    created_at, description, name, screen_name, verified, profile_image_url.
    Caches result in _user_profile_cache[username.lower()].
    Returns None on failure.
    """
    variables = {
        "screen_name": username,
        "withSafetyModeUserFields": True,
    }
    params = {
        "variables": json.dumps(variables, separators=(",", ":")),
        "features": json.dumps(FEATURES_USER, separators=(",", ":")),
        "fieldToggles": json.dumps(FIELD_TOGGLES_USER, separators=(",", ":")),
    }
    try:
        resp = session.get(
            GRAPHQL_USER_BY_SCREEN_NAME,
            params=params,
            headers=headers,
            cookies=_cookie_dict(cookies),
            timeout=15,
        )
        if resp.status_code != 200:
            try:
                _body = resp.text[:300]
            except Exception:
                _body = "(unreadable)"
            _log.warning("UserByScreenName HTTP %d for @%s — body: %s", resp.status_code, username, _body)
            # Fallback: try v1.1 REST API (more stable than GraphQL)
            return _get_user_id_v1(username, session, cookies, headers)
        data = resp.json()
        user_result = data.get("data", {}).get("user", {}).get("result", {})
        user_id = user_result.get("rest_id") or user_result.get("id_str")
        if user_id:
            legacy = user_result.get("legacy", {})
            profile = {
                "user_id": user_id,
                "followers_count": legacy.get("followers_count", 0),
                "friends_count": legacy.get("friends_count", 0),
                "statuses_count": legacy.get("statuses_count", 0),
                "created_at": legacy.get("created_at", ""),
                "description": legacy.get("description", ""),
                "name": legacy.get("name", ""),
                "screen_name": legacy.get("screen_name", username),
                "verified": legacy.get("verified", False) or bool(legacy.get("is_blue_verified")),
                "profile_image_url": legacy.get("profile_image_url_https", ""),
            }
            _user_profile_cache[username.lower()] = profile
            _log.info("Resolved @%s \u2192 user_id %s (profile cached)", username, user_id)
            return profile
        return None
    except Exception as e:
        _log.warning("UserByScreenName failed for @%s: %s", username, e)
        return None


def _parse_user_tweets_response(data: dict):
    """Parse UserTweets GraphQL response into normalised tweet list."""
    tweets = []
    next_cursor = None

    instructions = (
        data.get("data", {})
        .get("user", {})
        .get("result", {})
        .get("timeline_v2", {})
        .get("timeline", {})
        .get("instructions", [])
    )

    for instruction in instructions:
        itype = instruction.get("type", "")
        entries = []
        if itype == "TimelineAddEntries":
            entries = instruction.get("entries", [])
        elif itype == "TimelineReplaceEntry":
            entry = instruction.get("entry")
            if entry:
                entries = [entry]

        for entry in entries:
            entry_id = entry.get("entryId", "")

            if "cursor-bottom" in entry_id:
                next_cursor = (
                    entry.get("content", {}).get("value")
                    or entry.get("content", {})
                    .get("operation", {})
                    .get("cursor", {})
                    .get("value")
                )
                continue

            # tweet entry
            result = (
                entry.get("content", {})
                .get("itemContent", {})
                .get("tweet_results", {})
                .get("result", {})
            )
            if not result:
                continue

            if result.get("__typename") == "TweetWithVisibilityResults":
                result = result.get("tweet", result)

            legacy = result.get("legacy", {})
            if not legacy:
                continue

            user_obj = (
                result.get("core", {})
                .get("user_results", {})
                .get("result", {})
            )
            user_legacy = user_obj.get("legacy", {}) if isinstance(user_obj, dict) else {}
            user_core = user_obj.get("core", {}) if isinstance(user_obj, dict) else {}
            user_rel = user_obj.get("relationship_counts", {}) if isinstance(user_obj, dict) else {}

            username = user_legacy.get("screen_name") or user_core.get("screen_name", "")
            display_name = user_legacy.get("name") or user_core.get("name", "")
            followers_raw = (
                user_legacy.get("followers_count")
                or user_rel.get("followers_count")
                or user_rel.get("followers", 0)
            )

            tweets.append(
                _normalize_tweet(
                    tweet_id=legacy.get("id_str", ""),
                    text=legacy.get("full_text", ""),
                    username=username,
                    name=display_name,
                    created_at=legacy.get("created_at", ""),
                    retweet_count=legacy.get("retweet_count", 0),
                    like_count=legacy.get("favorite_count", 0),
                    reply_count=legacy.get("reply_count", 0),
                    followers=followers_raw if isinstance(followers_raw, int) else 0,
                    lang=legacy.get("lang", ""),
                    is_retweet="retweeted_status_id_str" in legacy,
                    user_created_at=user_legacy.get("created_at", ""),
                )
            )

    return tweets, next_cursor


def _scrape_user_tweets_curl_cffi(username: str, max_results: int) -> Optional[List[Dict]]:
    """
    Fetch tweets posted BY a public user (UserTweets endpoint).
    Returns list of tweet dicts — same format as SearchTimeline results.
    """
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        _log.debug("curl_cffi not installed, skipping user-tweets layer")
        return None

    cookies = _get_cookies()

    try:
        session = cffi_requests.Session(impersonate="chrome")
        tx = _TransactionGenerator()
        tx_ok = tx.init_sync(session.get, cookies)

        if "ct0" in session.cookies:
            cookies["ct0"] = session.cookies["ct0"]

        headers = {
            "authorization": f"Bearer {BEARER}",
            "x-csrf-token": cookies["ct0"],
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-client-language": "en",
            "user-agent": _CHROME_UA,
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "accept-encoding": "gzip, deflate, br",
            "referer": f"https://x.com/{username}",
            "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }

        # Step 1: resolve username → user_id + cache full profile
        _profile_data = _get_user_id(username, session, cookies, headers)
        if not _profile_data:
            _log.warning("user-tweets: could not resolve @%s to user_id", username)
            return None
        user_id = _profile_data["user_id"]

        # Step 2: paginate UserTweets
        results: List[Dict] = []
        cursor = None

        while len(results) < max_results:
            variables = {
                "userId": user_id,
                "count": min(20, max_results - len(results)),
                "includePromotedContent": False,
                "withQuickPromoteEligibilityTweetFields": True,
                "withVoice": True,
                "withV2Timeline": True,
            }
            if cursor:
                variables["cursor"] = cursor

            api_path = f"/i/api/graphql/V7H0Ap3_Hh2FyS75OCDO3Q/UserTweets"
            if tx_ok:
                try:
                    headers["x-client-transaction-id"] = tx.generate("GET", api_path)
                except Exception:
                    headers["x-client-transaction-id"] = (
                        base64.b64encode(os.urandom(48)).decode().rstrip("=")
                    )
            else:
                headers["x-client-transaction-id"] = (
                    base64.b64encode(os.urandom(48)).decode().rstrip("=")
                )

            params = {
                "variables": json.dumps(variables, separators=(",", ":")),
                "features": json.dumps(FEATURES_USER, separators=(",", ":")),
                "fieldToggles": json.dumps(FIELD_TOGGLES_USER, separators=(",", ":")),
            }

            resp = session.get(
                GRAPHQL_USER_TWEETS,
                params=params,
                headers=headers,
                cookies=_cookie_dict(cookies),
                timeout=15,
            )

            if resp.status_code == 429:
                _log.warning("user-tweets: rate limited (429), waiting 30s")
                time.sleep(30)
                continue
            if resp.status_code != 200:
                _log.warning("user-tweets: HTTP %d — %s", resp.status_code, resp.text[:300])
                break

            data = resp.json()
            tweets, next_cursor = _parse_user_tweets_response(data)
            results.extend(tweets)

            if not next_cursor or not tweets:
                break
            cursor = next_cursor
            time.sleep(random.uniform(1.0, 2.5))

        return results if results else None

    except Exception as e:
        _log.warning("user-tweets layer failed: %s", e)
        return None


def scrape_user_tweets(username: str, max_posts: int = 200) -> list:
    """
    Public API — fetch tweets posted BY a specific public user.
    Returns same format as scrape_twitter().
    Falls back to SearchTimeline mention search if UserTweets fails.
    """
    _log.info("user-tweets: scraping @%s (max %d)", username, max_posts)
    results = _scrape_user_tweets_curl_cffi(username, max_posts)
    if results:
        _log.info("user-tweets: got %d tweets from @%s", len(results), username)
        return results[:max_posts]
    # Fallback: search mentions (better than nothing)
    _log.warning("user-tweets: UserTweets failed for @%s, falling back to SearchTimeline", username)
    return scrape_twitter(username, max_posts=max_posts)


def scrape_user_profile(username: str) -> Optional[Dict]:
    """
    Fetch full profile data for a Twitter/X user via UserByScreenName.
    Returns dict with user_id, followers_count, friends_count, statuses_count,
    created_at, description, name, screen_name, verified, profile_image_url.
    Uses _user_profile_cache if available (populated as side-effect of scrape_user_tweets).
    Returns None on failure.
    """
    username = username.lstrip("@").strip()
    cached = _user_profile_cache.get(username.lower())
    if cached:
        _log.debug("scrape_user_profile: cache hit for @%s", username)
        return cached
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        return None
    cookies = _get_cookies()
    if not cookies.get("auth_token") or not cookies.get("ct0"):
        _log.warning("scrape_user_profile: missing Twitter cookies for @%s", username)
        return None
    try:
        session = cffi_requests.Session(impersonate="chrome")
        tx = _TransactionGenerator()
        tx.init_sync(session.get, cookies)
        if "ct0" in session.cookies:
            cookies["ct0"] = session.cookies["ct0"]
        headers = {
            "authorization": f"Bearer {BEARER}",
            "x-csrf-token": cookies.get("ct0", ""),
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
            "x-twitter-client-language": "en",
            "user-agent": _CHROME_UA,
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "accept-encoding": "gzip, deflate, br",
            "referer": f"https://x.com/{username}",
            "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }
        return _get_user_id(username, session, cookies, headers)
    except Exception as e:
        _log.warning("scrape_user_profile failed for @%s: %s", username, e)
        return None
