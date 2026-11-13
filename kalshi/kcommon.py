"""Shared helpers for the Kalshi research pipelines (stdlib only).

Market data on Kalshi is public: none of the pipelines needs a key. `signed_headers`
is here for the day a pipeline needs /portfolio endpoints; nothing in this folder places orders.
"""
import base64, json, math, os, sys, time, urllib.parse, urllib.request, urllib.error

BASE = os.environ.get("KALSHI_BASE", "https://api.elections.kalshi.com/trade-api/v2")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
UA = {"User-Agent": "Mozilla/5.0 (research script)", "Accept": "application/json"}
_last = [0.0]


def http_json(url, params=None, headers=None, retries=7, pause=0.08):
    """GET url -> parsed JSON, with a small global throttle and backoff on 429/5xx."""
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    for i in range(retries):
        wait = pause - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < retries - 1:
                time.sleep(1.5 * 2**i)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == retries - 1:
                raise
            time.sleep(1.5 * 2**i)


def kget(path, **params):
    return http_json(BASE + path, params)


def kpages(path, key, max_items=None, **params):
    """Yield items across cursor pages of a Kalshi list endpoint."""
    n, cursor = 0, None
    while True:
        d = kget(path, cursor=cursor, **params)
        items = d.get(key) or []
        for it in items:
            yield it
            n += 1
            if max_items and n >= max_items:
                return
        cursor = d.get("cursor")
        if not cursor or not items:
            return


def signed_headers(method, path):
    """Auth headers for private endpoints. Needs KALSHI_KEY_ID, KALSHI_PRIVATE_KEY_PATH and `cryptography`."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    key = serialization.load_pem_private_key(open(os.environ["KALSHI_PRIVATE_KEY_PATH"], "rb").read(), None)
    ts = str(int(time.time() * 1000))
    msg = (ts + method.upper() + "/trade-api/v2" + path.split("?")[0]).encode()
    sig = key.sign(msg, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH), hashes.SHA256())
    return {"KALSHI-ACCESS-KEY": os.environ["KALSHI_KEY_ID"], "KALSHI-ACCESS-TIMESTAMP": ts,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(sig).decode()}


# ---- prices and fees -------------------------------------------------------------------------
def f(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def quote(m):
    """(yes_bid, yes_ask, no_bid, no_ask) in dollars; a missing side comes back as 0 / 1."""
    yb, ya = f(m.get("yes_bid_dollars")), f(m.get("yes_ask_dollars"), 1.0)
    nb, na = f(m.get("no_bid_dollars")), f(m.get("no_ask_dollars"), 1.0)
    return yb, ya or 1.0, nb, na or 1.0


_series_fee = {}


def fee_rates(series_ticker):
    """(taker_rate, maker_rate) per contract, as multiples of P*(1-P).

    General schedule: taker 0.07; maker 0 unless the series is `quadratic_with_maker_fees` (0.0175).
    Both scale with the series' fee_multiplier. Check kalshi.com/fee-schedule before sizing anything.
    """
    if series_ticker not in _series_fee:
        try:
            s = kget(f"/series/{series_ticker}").get("series", {})
        except Exception:
            s = {}
        mult = f(s.get("fee_multiplier"), 1.0)
        maker = 0.0175 * mult if "maker_fees" in (s.get("fee_type") or "") else 0.0
        _series_fee[series_ticker] = (0.07 * mult, maker)
    return _series_fee[series_ticker]


def fee(price, contracts=1.0, rate=0.07):
    """Fee in dollars for `contracts` at `price`; Kalshi rounds the order's total up to the cent."""
    return math.ceil(rate * contracts * price * (1 - price) * 100 - 1e-9) / 100


def fee_per(price, rate=0.07, contracts=100):
    """Per-contract fee at a realistic clip size (rounding matters for 1-lots, not for 100-lots)."""
    return fee(price, contracts, rate) / contracts


# ---- small maths -----------------------------------------------------------------------------
def ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def iso_ts(s):
    from datetime import datetime
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def series_of(ticker):
    return ticker.split("-")[0]


def table(rows, cols, title=None, limit=None, file=None):
    """Print rows (list of dicts) as an aligned table and optionally save them as CSV under out/."""
    if title:
        print(f"\n## {title}")
    if not rows:
        print("(none)")
    shown = rows[:limit] if limit else rows
    cells = [[_fmt(r.get(c)) for c in cols] for r in shown]
    w = [max(len(c), *(len(x[i]) for x in cells)) if cells else len(c) for i, c in enumerate(cols)]
    if cells:
        print("  ".join(c.ljust(w[i]) for i, c in enumerate(cols)))
        for x in cells:
            print("  ".join(v.ljust(w[i]) for i, v in enumerate(x)))
        if limit and len(rows) > limit:
            print(f"... {len(rows) - limit} more rows" + (f" in out/{file}" if file else ""))
    if file and rows:
        import csv
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, file), "w", newline="") as fh:
            wr = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
            wr.writeheader()
            wr.writerows(rows)


def _fmt(v):
    if isinstance(v, float):
        return f"{v:.4f}" if abs(v) < 10 else f"{v:,.1f}"
    return "" if v is None else str(v)


def yahoo_daily(symbol, rng="10y"):
    """Daily bars from Yahoo: list of dicts t, o, h, l, c (unadjusted, so splits are not handled)."""
    d = http_json(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}",
                  {"range": rng, "interval": "1d", "events": "div,splits"})
    r = d["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    splits = {int(k): v["numerator"] / v["denominator"] for k, v in (r.get("events", {}).get("splits") or {}).items()}
    out = [dict(t=t, o=o, h=h, l=l, c=c) for t, o, h, l, c in zip(r["timestamp"], q["open"], q["high"], q["low"], q["close"])
           if None not in (o, h, l, c)]
    return out, splits


def coinbase_candles(product, granularity, start, end):
    """Candles [t, low, high, open, close, vol] oldest first; pages 300 at a time."""
    from datetime import datetime, timezone
    out, t = [], start
    while t < end:
        e = min(end, t + granularity * 300)
        iso = lambda x: datetime.fromtimestamp(x, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = http_json(f"https://api.exchange.coinbase.com/products/{product}/candles",
                         {"granularity": granularity, "start": iso(t), "end": iso(e)}, pause=0.12)
        out += rows
        t = e
    return sorted({r[0]: r for r in out}.values())


def series_map(max_age=86400):
    """{series_ticker: {category, fee_type, fee_multiplier, frequency, title}} from one bulk call, cached a day."""
    path = os.path.join(OUT, "series_cache.json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age:
        return json.load(open(path))
    m = {s["ticker"]: {k: s.get(k) for k in ("category", "fee_type", "fee_multiplier", "frequency", "title")}
         for s in kget("/series").get("series") or []}
    os.makedirs(OUT, exist_ok=True)
    json.dump(m, open(path, "w"))
    for t, s in m.items():
        mult = f(s.get("fee_multiplier"), 1.0)
        _series_fee[t] = (0.07 * mult, 0.0175 * mult if "maker_fees" in (s.get("fee_type") or "") else 0.0)
    return m


def markets_by_ticker(tickers, chunk=80):
    out = {}
    tickers = sorted(set(tickers))
    for i in range(0, len(tickers), chunk):
        for m in kget("/markets", tickers=",".join(tickers[i:i + chunk]), limit=1000).get("markets") or []:
            out[m["ticker"]] = m
    return out


_EV_KEYS = ("event_ticker", "series_ticker", "category", "title", "sub_title", "mutually_exclusive")
_MK_KEYS = ("ticker", "status", "title", "yes_sub_title", "strike_type", "floor_strike", "cap_strike", "yes_bid_dollars", "yes_ask_dollars",
            "no_bid_dollars", "no_ask_dollars", "yes_bid_size_fp", "yes_ask_size_fp", "volume_fp", "volume_24h_fp", "open_interest_fp",
            "close_time", "expected_expiration_time", "result")


def open_events(max_age=600, series=None):
    """Every open event with its markets nested (a minute or two to pull); a slimmed copy is cached under out/.

    Multivariate combo events (KXMVE...) are left out: there are hundreds of thousands and no pipeline here uses them.
    """
    if series:
        return list(kpages("/events", "events", status="open", with_nested_markets="true", limit=200, series_ticker=series))
    path = os.path.join(OUT, "open_events_cache.json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age:
        return json.load(open(path))
    ev = []
    for e in kpages("/events", "events", status="open", with_nested_markets="true", limit=200):
        if e.get("series_ticker", "").startswith("KXMVE"):
            continue
        s = {k: e.get(k) for k in _EV_KEYS}
        s["markets"] = [{k: m.get(k) for k in _MK_KEYS} for m in e.get("markets") or []]
        ev.append(s)
    os.makedirs(OUT, exist_ok=True)
    json.dump(ev, open(path, "w"))
    return ev
