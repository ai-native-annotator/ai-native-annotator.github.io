#!/usr/bin/env python3
"""P10 - Where would a resting order earn the spread? (market-making shortlist)

P01 shows the money on Kalshi flows from takers to makers. This ranks live markets by what a maker
could capture: quoted spread x recent volume, mid away from the extremes, and whether the series
charges maker fees. For the best few it pulls the recent tape to measure the *effective* half-spread
takers actually paid against the mid of the trade prices around them - a market whose quoted spread is
wide but whose trades all print at one side is a market where you get run over.

  python3 p10_market_making_scan.py --min-spread 0.03 --min-vol24 2000 --top 25
"""
import argparse, time
from kcommon import open_events, kpages, f, quote, fee_per, series_map, iso_ts, table

ap = argparse.ArgumentParser()
ap.add_argument("--min-spread", type=float, default=0.03)
ap.add_argument("--min-vol24", type=float, default=2000)
ap.add_argument("--min-days", type=float, default=0.5, help="skip markets about to close (in-play books move too fast to quote by hand)")
ap.add_argument("--top", type=int, default=25)
a = ap.parse_args()
smap, now = series_map(), time.time()
rows = []
for e in open_events():
    if e["series_ticker"].startswith("KXMVE"):
        continue
    info = smap.get(e["series_ticker"], {})
    mult = f(info.get("fee_multiplier"), 1.0)
    mrate = 0.0175 * mult if "maker_fees" in (info.get("fee_type") or "") else 0.0
    for m in e.get("markets") or []:
        yb, ya, _, _ = quote(m)
        v = f(m.get("volume_24h_fp"))
        days = (iso_ts(m.get("expected_expiration_time") or m["close_time"]) - now) / 86400
        if m.get("status") != "active" or not (0 < yb < ya < 1) or v < a.min_vol24 or days < a.min_days:
            continue
        sp, mid = ya - yb, (ya + yb) / 2
        if sp < a.min_spread or not 0.1 <= mid <= 0.9:
            continue
        half_net = sp / 2 - fee_per(mid, mrate) if mrate else sp / 2
        rows.append(dict(ticker=m["ticker"], bid=yb, ask=ya, spread=sp, vol24=v, oi=f(m.get("open_interest_fp")), maker_fee=mrate > 0,
                         half_spread_net=half_net, score=half_net * v, days=days, cat=e.get("category"), title=(m.get("title") or "")[:40]))
rows.sort(key=lambda r: -r["score"])
for r in rows[:a.top]:
    tr = list(kpages("/markets/trades", "trades", ticker=r["ticker"], limit=200, max_items=200))
    px = [f(t["yes_price_dollars"]) for t in tr]
    if len(px) >= 10:
        # effective half-spread: distance of each print from the average of the prints around it
        eff = [abs(px[i] - sum(px[max(0, i - 5):i + 6]) / len(px[max(0, i - 5):i + 6])) for i in range(len(px))]
        r["eff_half_spread"] = sum(eff) / len(eff)
        r["taker_yes_share"] = sum(t["taker_side"] == "yes" for t in tr) / len(tr)   # one-sided flow = informed flow
        r["drift_200"] = px[0] - px[-1]                                             # price move over those trades
cols = ["ticker", "bid", "ask", "spread", "vol24", "oi", "maker_fee", "half_spread_net", "score", "eff_half_spread", "taker_yes_share", "drift_200", "days", "cat", "title"]
print(f"{len(rows)} markets pass the filters")
table(rows, cols, "Market-making shortlist (score = net half-spread x 24h volume: an upper bound, you will not get every fill)", limit=a.top, file="p10_mm_scan.csv")
