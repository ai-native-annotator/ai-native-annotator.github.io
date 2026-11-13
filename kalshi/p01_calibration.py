#!/usr/bin/env python3
"""P01 - Who makes money at which price? Taker vs maker P&L on settled Kalshi trades.

Samples the public trade tape, joins each trade to its market's final result, and reports the
return of the taker (the side that crossed the spread) and of the maker (the resting order),
net of fees, by price paid and by category. This is the favourite-longshot test: if takers
paying 5c win less than 5% of the time, selling longshots (= resting bids on the favourite) pays.

  python3 p01_calibration.py --days 40 --samples 200 --pages 1 [--series KXBTC15M]
"""
import argparse, collections, random, time
from kcommon import kget, kpages, f, fee_per, series_map, markets_by_ticker, series_of, table

ap = argparse.ArgumentParser()
ap.add_argument("--days", type=int, default=30, help="look back this many days")
ap.add_argument("--samples", type=int, default=200, help="random points in time to sample the tape at")
ap.add_argument("--pages", type=int, default=1, help="pages of 1000 trades per sample point")
ap.add_argument("--series", help="only this series (pulls its settled markets' trades instead of sampling)")
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()
random.seed(a.seed)
smap = series_map()
now = int(time.time())

trades = []
if a.series:
    mk = list(kpages("/markets", "markets", max_items=a.samples * 5, series_ticker=a.series, status="settled", limit=1000))
    for m in mk:
        trades += list(kpages("/markets/trades", "trades", max_items=a.pages * 1000, ticker=m["ticker"], limit=1000))
    res = {m["ticker"]: m for m in mk}
else:
    for _ in range(a.samples):
        t = now - random.randint(2 * 86400, a.days * 86400)  # 2 days back at least, so most have settled
        trades += list(kpages("/markets/trades", "trades", max_items=a.pages * 1000, max_ts=t, limit=1000))
    res = markets_by_ticker(t["ticker"] for t in trades)

BUCKETS = [(0, .05), (.05, .1), (.1, .2), (.2, .35), (.35, .5), (.5, .65), (.65, .8), (.8, .9), (.9, .95), (.95, 1.01)]
def bucket(p):
    for lo, hi in BUCKETS:
        if lo <= p < hi:
            return f"{lo:.2f}-{min(hi, 1):.2f}"

rows = []  # one per trade: taker price paid, contracts, win, fees, grouping keys
for t in trades:
    m = res.get(t["ticker"])
    if not m or m.get("result") not in ("yes", "no"):
        continue
    side = t["taker_side"]
    p = f(t["yes_price_dollars"] if side == "yes" else t["no_price_dollars"])
    if not 0 < p < 1:
        continue
    s = series_of(t["ticker"])
    info = smap.get(s, {})
    mult = f(info.get("fee_multiplier"), 1.0)
    rows.append(dict(p=p, n=f(t["count_fp"]), win=1.0 if m["result"] == side else 0.0,
                     tfee=fee_per(p, 0.07 * mult), mfee=fee_per(p, 0.0175 * mult) if "maker_fees" in (info.get("fee_type") or "") else 0.0,
                     cat=info.get("category") or "?", event=m.get("event_ticker"), b=bucket(p)))

def summarise(key, order=None, boot=200):
    """Cents per contract for taker and maker. The interval resamples whole events, because the
    thousands of trades inside one game or one hourly BTC event are a single bet, not thousands."""
    g = collections.defaultdict(list)
    for r in rows:
        g[r[key]].append(r)
    out = []
    for k in (order or sorted(g, key=lambda k: -sum(r["n"] for r in g[k]))):
        rs = g.get(k)
        if not rs:
            continue
        ev = collections.defaultdict(lambda: [0.0, 0.0, 0.0, 0.0, 0.0])  # contracts, cost, wins, taker fee, maker fee
        for r in rs:
            e = ev[r["event"]]
            e[0] += r["n"]; e[1] += r["n"] * r["p"]; e[2] += r["n"] * r["win"]; e[3] += r["n"] * r["tfee"]; e[4] += r["n"] * r["mfee"]
        evs = list(ev.values())
        n, cost, win, tf, mf = (sum(e[i] for e in evs) for i in range(5))
        edge = lambda es: 100 * sum(e[2] - e[1] for e in es) / sum(e[0] for e in es)   # taker cents/contract before fees
        bs = sorted(edge(random.choices(evs, k=len(evs))) for _ in range(boot)) if len(evs) > 1 else [0, 0]
        eq = 100 * sum(r["win"] - r["p"] for r in rs) / len(rs)
        out.append({key: k, "trades": len(rs), "events": len(evs), "contracts": round(n), "avg_price": cost / n, "taker_win": win / n,
                    "gross_c": edge(evs), "ci_lo": bs[int(.025 * len(bs))], "ci_hi": bs[int(.975 * len(bs)) - 1],
                    "gross_c_eqw": eq,                       # every trade counted once: mutes the whales
                    "taker_net_c": 100 * (win - cost - tf) / n, "maker_net_c": 100 * (cost - win - mf) / n,
                    "top_event_share": max(e[0] for e in evs) / n})
    return out

cols = ["trades", "events", "contracts", "avg_price", "taker_win", "gross_c", "ci_lo", "ci_hi", "gross_c_eqw", "taker_net_c", "maker_net_c", "top_event_share"]
print("Units: cents per contract. gross_c = taker's win rate minus price paid (0 if prices are fair); ci = 95% event bootstrap;")
print("taker_net_c / maker_net_c = after fees. A bucket is only evidence if the interval excludes 0 and top_event_share is small.")
print(f"{len(trades)} trades sampled, {len(rows)} in settled binary markets")
table(summarise("b", [f"{lo:.2f}-{min(hi, 1):.2f}" for lo, hi in BUCKETS]), ["b"] + cols,
      "By price the taker paid (taker_win should equal avg_price if prices were fair)", file="p01_by_price.csv")
table(summarise("cat"), ["cat"] + cols, "By category", file="p01_by_category.csv")
for r in rows:
    r["cb"] = f'{r["cat"][:12]}|{"long<.20" if r["p"] < .2 else "mid" if r["p"] < .8 else "fav>=.80"}'
table(summarise("cb"), ["cb"] + cols, "Category x price zone", limit=36, file="p01_cat_zone.csv")
