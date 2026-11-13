#!/usr/bin/env python3
"""P09 - Near-certain contracts close to settlement ("picking up the last cents").

Lists markets that close within --days where one side can be bought at --min..--max (default 90-99c),
with the yield to settlement after the taker fee, annualised. The yield is only worth it if such
contracts win more often than their price says: if out/p01_cat_zone.csv exists (run P01 first) the
measured win rate of takers who paid >= 80c in that category is attached, so each row shows
the historical hit rate next to the break-even one.

  python3 p09_near_expiry_carry.py --days 3 --min 0.90 --max 0.99 --min-size 200
"""
import argparse, csv, os, time
from kcommon import open_events, f, quote, fee_per, series_map, iso_ts, table, OUT

ap = argparse.ArgumentParser()
ap.add_argument("--days", type=float, default=3)
ap.add_argument("--min", type=float, default=0.90)
ap.add_argument("--max", type=float, default=0.99)
ap.add_argument("--min-size", type=float, default=200, help="contracts available at the ask")
ap.add_argument("--min-volume", type=float, default=1000)
a = ap.parse_args()
smap, now = series_map(), time.time()
hist = {}
p = os.path.join(OUT, "p01_cat_zone.csv")
if os.path.exists(p):
    for r in csv.DictReader(open(p)):
        if r["cb"].endswith("fav>=.80"):
            hist[r["cb"].split("|")[0]] = (float(r["taker_win"]), float(r["avg_price"]), int(r["events"]))
rows = []
for e in open_events():
    if e["series_ticker"].startswith("KXMVE"):
        continue
    rate = 0.07 * f(smap.get(e["series_ticker"], {}).get("fee_multiplier"), 1.0)
    for m in e.get("markets") or []:
        if m.get("status") != "active":
            continue
        days = (iso_ts(m.get("expected_expiration_time") or m["close_time"]) - now) / 86400
        if not 0 < days <= a.days or f(m.get("volume_fp")) < a.min_volume:
            continue
        yb, ya, nb, na = quote(m)
        for side, px, size in (("YES", ya, f(m.get("yes_ask_size_fp"))), ("NO", na, f(m.get("yes_bid_size_fp")))):
            if a.min <= px <= a.max and size >= a.min_size:
                net = 1 - px - fee_per(px, rate)
                if net <= 0:
                    continue
                h = hist.get((e.get("category") or "?")[:12])
                rows.append(dict(ticker=m["ticker"], buy=side, price=px, net_yield=net / px, days=days, annualised=net / px * 365 / days,
                                 breakeven_win=px + fee_per(px, rate), hist_win=h[0] if h else None, hist_avg_price=h[1] if h else None,
                                 hist_events=h[2] if h else None, size=size, usd_cap=size * px, cat=e.get("category"), title=(m.get("title") or "")[:44]))
cols = ["ticker", "buy", "price", "net_yield", "days", "annualised", "breakeven_win", "hist_win", "hist_avg_price", "hist_events", "size", "usd_cap", "cat", "title"]
table(sorted(rows, key=lambda r: -r["net_yield"] / max(r["days"], 0.02)), cols,
      "Near-certain sides by yield per day (hist_win vs hist_avg_price: did takers of favourites in this category get what they paid for?)",
      limit=40, file="p09_carry.csv")
import collections
c = collections.Counter(r["cat"] for r in rows)
print("\nCandidates per category:", dict(c.most_common()))
