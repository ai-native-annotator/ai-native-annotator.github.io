#!/usr/bin/env python3
"""P03 - Strike-ladder consistency: monotonicity, and range markets against threshold markets.

A. Monotonic: for "above K" markets on one expiry, P(above K_low) >= P(above K_high).
   Buy YES(K_low) + NO(K_high): pays at least 1.  Arb if yes_ask(K_low) + no_ask(K_high) + fees < 1.
B. Range vs threshold: series pairs that settle on the same value at the same time
   (KXBTC buckets vs KXBTCD thresholds, KXINX vs KXINXU, ...). For a boundary K,
   YES(above K) must cost the same as the sum of all buckets above K.
     buy YES(above K) + NO on each of the nB buckets above K -> pays exactly nB
     buy NO(above K)  + YES on each of the nB buckets above K -> pays exactly 1
Both are static, riskless if both legs fill; the edge after fees is what is reported.

  python3 p03_ladder_arb.py [--pairs KXBTC:KXBTCD,KXETH:KXETHD]
"""
import argparse, collections
from kcommon import kpages, f, quote, fee_per, table

PAIRS = "KXBTC:KXBTCD,KXETH:KXETHD,KXSOL:KXSOLD,KXXRP:KXXRPD,KXDOGE:KXDOGED,KXINX:KXINXU,KXNASDAQ100:KXNASDAQ100U"
ap = argparse.ArgumentParser()
ap.add_argument("--pairs", default=PAIRS)
ap.add_argument("--min-edge", type=float, default=0.0)
a = ap.parse_args()

def bound(x):
    """Strike as the boundary it means: 82799.99 and 7699.9999 are '82800 or above' / '7700 or above'."""
    r = round(x)
    return float(r) if abs(x - r) < 0.011 else x

def events(series):
    out = {}
    for e in kpages("/events", "events", status="open", with_nested_markets="true", limit=200, series_ticker=series):
        ms = [m for m in e.get("markets") or [] if m.get("status") == "active"]
        if ms:
            out[ms[0]["close_time"]] = ms
    return out

mono, cross = [], []
for pair in a.pairs.split(","):
    rng_s, thr_s = pair.split(":")
    rng, thr = events(rng_s), events(thr_s)
    for close, ms in thr.items():
        lad = sorted(((bound(f(m["floor_strike"])), m) for m in ms if m.get("strike_type", "").startswith("greater")), key=lambda x: x[0])
        # A. monotonicity: cheapest YES at or below each strike vs best NO at a higher strike
        for i, (k1, m1) in enumerate(lad):
            for k2, m2 in lad[i + 1:]:
                ya, na = quote(m1)[1], quote(m2)[3]
                edge = 1 - ya - na - fee_per(ya) - fee_per(na)
                size = min(f(m1.get("yes_ask_size_fp")), f(m2.get("yes_bid_size_fp")))
                if edge > a.min_edge and size > 0:
                    mono.append(dict(buy_yes=m1["ticker"], buy_no=m2["ticker"], yes_ask=ya, no_ask=na, edge_net=edge, size=size, usd=edge * size, close=close))
        # B. buckets above K vs threshold K
        buckets = rng.get(close)
        if not buckets:
            continue
        bk = sorted(((bound(f(m["floor_strike"])), m) for m in buckets if m.get("strike_type") in ("between", "greater", "greater_or_equal")), key=lambda x: x[0])
        for k, mt in lad:
            above = [m for kb, m in bk if kb >= k]
            if not above or not any(kb == k for kb, _ in bk):
                continue
            nB = len(above)
            tq = quote(mt)
            c1 = tq[1] + sum(quote(m)[3] for m in above)          # YES thr + NO buckets -> nB
            f1 = fee_per(tq[1]) + sum(fee_per(quote(m)[3]) for m in above)
            s1 = min([f(mt.get("yes_ask_size_fp"))] + [f(m.get("yes_bid_size_fp")) for m in above])
            c2 = tq[3] + sum(quote(m)[1] for m in above)          # NO thr + YES buckets -> 1
            f2 = fee_per(tq[3]) + sum(fee_per(quote(m)[1]) for m in above)
            s2 = min([f(mt.get("yes_bid_size_fp"))] + [f(m.get("yes_ask_size_fp")) for m in above])
            for kind, edge, gross, size in (("YES thr + NO buckets", nB - c1 - f1, nB - c1, s1), ("NO thr + YES buckets", 1 - c2 - f2, 1 - c2, s2)):
                cross.append(dict(threshold=mt["ticker"], kind=kind, legs=nB + 1, edge_gross=gross, edge_net=edge, size=size, usd=max(edge, 0) * size, close=close))

table(sorted(mono, key=lambda r: -r["usd"]), ["buy_yes", "buy_no", "yes_ask", "no_ask", "edge_net", "size", "usd", "close"],
      "A. Monotonicity violations (net of taker fees)", limit=25, file="p03_monotonic.csv")
hits = [r for r in cross if r["edge_net"] > a.min_edge and r["size"] > 0]
cols = ["threshold", "kind", "legs", "edge_gross", "edge_net", "size", "usd", "close"]
table(sorted(hits, key=lambda r: -r["usd"]), cols, "B. Range-vs-threshold arbs (net of taker fees)", limit=25, file="p03_cross.csv")
table(sorted(cross, key=lambda r: -r["edge_net"])[:12], cols, f"B. Closest of {len(cross)} boundary checks")
