#!/usr/bin/env python3
"""P02 - Sum-to-one arbitrage inside mutually exclusive events.

At most one market of a mutually exclusive event resolves YES, so:
  SHORT basket: buy NO on all n markets -> pays at least n-1.   Arb if  sum(no_ask) + fees < n-1.
  LONG basket:  buy YES on all n markets -> pays 1 only if the list is exhaustive.
                Arb if sum(yes_ask) + fees < 1 AND some listed outcome must happen.
The short basket is riskless by construction; the long one is only flagged `exhaustive` when the
event is a strike ladder with both tails (less ... between ... greater), otherwise read the rules.
Prices are top of book; `size` is the smallest top-of-book size across the legs.

  python3 p02_event_sum_arb.py [--min-edge 0.0] [--series KXHIGHNY]
"""
import argparse
from kcommon import open_events, f, quote, fee_per, series_map, table

ap = argparse.ArgumentParser()
ap.add_argument("--min-edge", type=float, default=0.0, help="report baskets with net edge per basket above this ($)")
ap.add_argument("--series")
a = ap.parse_args()
smap = series_map()
rows, seen, near = [], 0, []
for e in open_events(series=a.series):
    if not e.get("mutually_exclusive"):
        continue
    ms = [m for m in e.get("markets") or [] if m.get("status") == "active"]
    if len(ms) < 2 or len(ms) != len(e.get("markets") or []):
        continue  # a leg that is closed or not yet open breaks the basket
    seen += 1
    n = len(ms)
    rate = 0.07 * f(smap.get(e["series_ticker"], {}).get("fee_multiplier"), 1.0)
    q = [quote(m) for m in ms]
    types = {m.get("strike_type") for m in ms}
    exhaustive = {"less", "greater"} <= types or {"less", "greater_or_equal"} <= types
    # long basket
    cost = sum(x[1] for x in q)
    fees = sum(fee_per(x[1], rate) for x in q)
    size = min(f(m.get("yes_ask_size_fp")) for m in ms)
    long_edge = 1 - cost - fees
    # short basket
    cost_s = sum(x[3] for x in q)
    fees_s = sum(fee_per(x[3], rate) for x in q)
    size_s = min(f(m.get("yes_bid_size_fp")) for m in ms)
    short_edge = (n - 1) - cost_s - fees_s
    base = dict(event=e["event_ticker"], legs=n, cat=e.get("category"), title=(e.get("title") or "")[:48])
    for kind, edge, sz, raw, ex in (("LONG all YES", long_edge, size, 1 - cost, exhaustive), ("SHORT all NO", short_edge, size_s, (n - 1) - cost_s, True)):
        r = dict(base, kind=kind, edge_net=edge, edge_gross=raw, size=sz, riskless=ex, usd=max(edge, 0) * sz)
        near.append(r)
        if edge > a.min_edge and sz > 0:
            rows.append(r)

cols = ["event", "kind", "legs", "edge_gross", "edge_net", "size", "usd", "riskless", "cat", "title"]
print(f"{seen} mutually exclusive events with every leg live")
safe = [r for r in rows if r["riskless"]]
table(sorted(safe, key=lambda r: -r["usd"]), cols, "RISKLESS baskets with positive net edge at top of book", limit=30, file="p02_sum_arb_riskless.csv")
table(sorted([r for r in rows if not r["riskless"]], key=lambda r: -r["usd"]), cols,
      "NOT an arb unless the list is exhaustive: YES asks sum below 1 (the gap is the market's price for 'someone not listed')",
      limit=12, file="p02_sum_below_one_conditional.csv")
table(sorted([r for r in near if r["riskless"]], key=lambda r: -r["edge_net"])[:12], cols, "Riskless baskets closest to an arb (how far the market is from one)")
import statistics
ov = [-r["edge_gross"] for r in near if r["kind"] == "LONG all YES" and r["legs"] <= 12]
if ov:
    print(f"\nMedian overround of the YES asks (events up to 12 legs): {statistics.median(ov):.3f} -> the price of taking liquidity")
