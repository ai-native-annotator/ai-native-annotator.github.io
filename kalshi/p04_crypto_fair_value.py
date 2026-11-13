#!/usr/bin/env python3
"""P04 - Crypto price markets against a volatility model: live scan and backtest.

"Will BTC be above K at time T" is a digital option. With spot S, time left t and volatility sigma,
    p = N( ln(S/K) / (sigma * sqrt(t)) )
sigma is realised volatility of Coinbase 1-minute closes (5-minute returns over the trailing --vol-hours).
Settlement is the 60-second average of CF Benchmarks' BRTI, which Coinbase spot tracks closely but not exactly.

  --backtest  replays settled events: at `--lead` minutes before the close it reads the market's bid/ask
              from Kalshi's 1-minute candles, prices each strike with the model, and takes liquidity
              whenever the modelled edge after fees exceeds --edge. Reports market vs model calibration and P&L.
  (default)   prices the events closing in the next --hours and lists the largest modelled edges.

  python3 p04_crypto_fair_value.py --series KXBTCD --backtest --events 80 --lead 30
  python3 p04_crypto_fair_value.py --series KXBTC15M --product BTC-USD --backtest --events 400 --lead 5
"""
import argparse, bisect, collections, math, time
from kcommon import kget, kpages, f, quote, fee_per, ncdf, iso_ts, coinbase_candles, table, wilson

ap = argparse.ArgumentParser()
ap.add_argument("--series", default="KXBTCD")
ap.add_argument("--product", default="BTC-USD")
ap.add_argument("--backtest", action="store_true")
ap.add_argument("--events", type=int, default=80)
ap.add_argument("--lead", type=float, default=30, help="minutes before close at which the backtest trades")
ap.add_argument("--hours", type=float, default=26, help="live: events closing within this many hours")
ap.add_argument("--vol-hours", type=float, default=12)
ap.add_argument("--vol-mult", type=float, default=1.0, help="scale realised vol (try 1.1-1.3 if the tails come out underpriced)")
ap.add_argument("--edge", type=float, default=0.03, help="minimum modelled edge per contract after fees")
a = ap.parse_args()

class Spot:
    def __init__(self, product, start, end):
        c = coinbase_candles(product, 60, int(start), int(end))
        self.t = [r[0] + 60 for r in c]      # candle close time
        self.c = [r[4] for r in c]
    def at(self, ts):
        i = bisect.bisect_right(self.t, ts) - 1
        return self.c[i] if i >= 0 and ts - self.t[i] < 300 else None
    def vol(self, ts, hours):
        """Per-second volatility from 5-minute log returns over the trailing window."""
        j = bisect.bisect_right(self.t, ts) - 1
        i = bisect.bisect_left(self.t, ts - hours * 3600)
        px = self.c[i:j + 1:5]
        if len(px) < 20:
            return None
        r = [math.log(b / x) for x, b in zip(px, px[1:])]
        return math.sqrt(sum(x * x for x in r) / len(r) / 300)

def prob_above(S, K, sig, secs):
    return ncdf(math.log(S / K) / (sig * math.sqrt(max(secs, 1))))

def bound(m):
    k = f(m.get("floor_strike"))
    return k

now = time.time()
if not a.backtest:
    spot = Spot(a.product, now - (a.vol_hours + 1) * 3600, now)
    S, sig = spot.c[-1], spot.vol(now, a.vol_hours) * a.vol_mult
    print(f"{a.product} spot {S:,.2f}; realised vol {sig * math.sqrt(365 * 86400):.1%} annualised ({a.vol_hours:g}h window x{a.vol_mult})")
    rows = []
    for m in kpages("/markets", "markets", series_ticker=a.series, status="open", limit=1000,
                    max_close_ts=int(now + a.hours * 3600)):
        if not (m.get("strike_type") or "").startswith("greater") or m.get("status") != "active":
            continue
        secs = iso_ts(m["close_time"]) - now
        if secs < 60:
            continue
        p = prob_above(S, bound(m), sig, secs)
        yb, ya, nb, na = quote(m)
        ey, en = p - ya - fee_per(ya), (1 - p) - na - fee_per(na)
        side, edge, px, size = ("YES", ey, ya, f(m.get("yes_ask_size_fp"))) if ey > en else ("NO", en, na, f(m.get("yes_bid_size_fp")))
        if edge > a.edge and 0.03 < p < 0.97 and size > 0:
            rows.append(dict(ticker=m["ticker"], mins=secs / 60, model_p=p, yes_bid=yb, yes_ask=ya, buy=side, at=px, edge_net=edge, size=size))
    table(sorted(rows, key=lambda r: -r["edge_net"]), ["ticker", "mins", "model_p", "yes_bid", "yes_ask", "buy", "at", "edge_net", "size"],
          "Largest modelled edges (the model's vol is the whole bet: check the backtest before believing these)", limit=25, file=f"p04_live_{a.series}.csv")
    raise SystemExit

# ---- backtest --------------------------------------------------------------------------------
ev = collections.OrderedDict()
for m in kpages("/markets", "markets", series_ticker=a.series, status="settled", limit=1000, max_items=200000):
    if (m.get("strike_type") or "").startswith("greater") and m.get("result") in ("yes", "no"):
        if m["event_ticker"] not in ev and len(ev) >= a.events:
            break
        ev.setdefault(m["event_ticker"], []).append(m)
closes = [iso_ts(ms[0]["close_time"]) for ms in ev.values()]
spot = Spot(a.product, min(closes) - (a.vol_hours + 2) * 3600, max(closes))
obs = []
for et, ms in ev.items():
    close = iso_ts(ms[0]["close_time"])
    t0 = close - a.lead * 60
    if iso_ts(ms[0]["open_time"]) > t0 - 60:
        continue
    S, sig = spot.at(t0), spot.vol(t0, a.vol_hours)
    if not S or not sig:
        continue
    sig *= a.vol_mult
    cand = [m for m in ms if 0.02 < prob_above(S, bound(m), sig, a.lead * 60) < 0.98 and f(m.get("volume_fp")) > 0]
    for i in range(0, len(cand), 20):
        chunk = cand[i:i + 20]
        d = kget("/markets/candlesticks", market_tickers=",".join(m["ticker"] for m in chunk),
                 start_ts=int(t0 - 180), end_ts=int(t0), period_interval=1)
        cs = {x["market_ticker"]: x["candlesticks"] for x in d.get("markets") or []}
        for m in chunk:
            c = cs.get(m["ticker"])
            if not c:
                continue
            yb, ya = f(c[-1]["yes_bid"]["close_dollars"]), f(c[-1]["yes_ask"]["close_dollars"])
            if not (0 < yb < ya < 1):
                continue
            obs.append(dict(event=et, ticker=m["ticker"], p=prob_above(S, bound(m), sig, a.lead * 60), yb=yb, ya=ya,
                            y=1.0 if m["result"] == "yes" else 0.0))
print(f"{len(ev)} events, {len(obs)} strike snapshots {a.lead:g} min before close "
      f"({time.strftime('%Y-%m-%d', time.gmtime(min(closes)))} to {time.strftime('%Y-%m-%d', time.gmtime(max(closes)))})")

def calib(key, label):
    g = collections.defaultdict(list)
    for o in obs:
        g[min(int(key(o) * 10), 9)].append(o)
    rows = []
    for b in sorted(g):
        rs = g[b]
        k, n = sum(r["y"] for r in rs), len(rs)
        lo, hi = wilson(k, n)
        rows.append({"bucket": f"{b / 10:.1f}-{(b + 1) / 10:.1f}", "n": n, "mean_pred": sum(key(r) for r in rs) / n, "realised": k / n, "ci_lo": lo, "ci_hi": hi})
    table(rows, ["bucket", "n", "mean_pred", "realised", "ci_lo", "ci_hi"], label)
calib(lambda o: (o["yb"] + o["ya"]) / 2, "Calibration of the MARKET mid")
calib(lambda o: o["p"], "Calibration of the MODEL")
brier = lambda key: sum((key(o) - o["y"]) ** 2 for o in obs) / max(len(obs), 1)
print(f"\nBrier score: market mid {brier(lambda o: (o['yb'] + o['ya']) / 2):.4f}   model {brier(lambda o: o['p']):.4f}   (lower is better)")
print(f"Mean quoted spread: {sum(o['ya'] - o['yb'] for o in obs) / max(len(obs), 1):.3f}")

rows = []
for thr in (0.02, 0.03, 0.05, 0.08, 0.12):
    pnl = cost = n = wins = 0
    per_event = collections.defaultdict(float)
    for o in obs:
        ey = o["p"] - o["ya"] - fee_per(o["ya"])
        en = (1 - o["p"]) - (1 - o["yb"]) - fee_per(1 - o["yb"])
        if max(ey, en) <= thr:
            continue
        px, win = (o["ya"], o["y"]) if ey > en else (1 - o["yb"], 1 - o["y"])
        r = win - px - fee_per(px)
        pnl += r; cost += px; n += 1; wins += win; per_event[o["event"]] += r
    if n:
        ev_p = list(per_event.values())
        mu = sum(ev_p) / len(ev_p)
        sd = math.sqrt(sum((x - mu) ** 2 for x in ev_p) / max(len(ev_p) - 1, 1))
        rows.append(dict(min_edge=thr, trades=n, events=len(ev_p), hit=wins / n, avg_price=cost / n, pnl_per_contract=pnl / n,
                         ret_on_stake=pnl / cost, t_stat_by_event=mu / (sd / math.sqrt(len(ev_p))) if sd else 0.0))
table(rows, ["min_edge", "trades", "events", "hit", "avg_price", "pnl_per_contract", "ret_on_stake", "t_stat_by_event"],
      "Backtest: take liquidity when the model disagrees with the quote by more than min_edge (1 contract per signal, net of fees)",
      file=f"p04_backtest_{a.series}.csv")
