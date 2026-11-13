#!/usr/bin/env python3
"""P08 - The same question on Kalshi and Polymarket: price gaps to check by hand.

Pulls Polymarket's most active Yes/No markets (Gamma API, public) and Kalshi's open non-sports markets,
pairs them by wording, and prints the pairs where buying one side on each venue costs less than $1:
    Kalshi YES ask + Polymarket NO ask < 1     or     Kalshi NO ask + Polymarket YES ask < 1
The matching is by words, so every row is a *candidate*: the two venues often differ in deadline,
data source or the exact condition, and that difference is usually the whole gap. Read both rule sets.
Also unpriced here: Polymarket settles in USDC on Polygon (transfer cost, some markets charge taker
fees), capital is tied up on both sides until resolution, and US persons are restricted on the
international Polymarket venue - check which venue you are permitted to use.

  python3 p08_polymarket_cross.py --min-sim 0.8 --max-gap 0.2
"""
import argparse, collections, json, re
from kcommon import open_events, http_json, f, quote, fee_per, table

ap = argparse.ArgumentParser()
ap.add_argument("--min-sim", type=float, default=0.8)
ap.add_argument("--max-gap", type=float, default=0.2, help="a larger mid-price gap almost always means the two questions differ")
ap.add_argument("--poly", type=int, default=3000, help="how many Polymarket markets to pull, by 24h volume")
ap.add_argument("--min-edge", type=float, default=0.0)
a = ap.parse_args()
STOP = set("will the a an of in on by to be is at for and or before after this that with from than as it its his her have has what who which how any".split())

def toks(s):
    return frozenset(w for w in re.findall(r"[a-z0-9$%.]+", s.lower().replace(",", "")) if w not in STOP and len(w) > 1)

poly = []
for off in range(0, a.poly, 100):
    try:
        page = http_json("https://gamma-api.polymarket.com/markets", {"limit": 100, "offset": off, "closed": "false", "active": "true",
                                                                         "order": "volume24hr", "ascending": "false"}, retries=2)
    except Exception as ex:     # Gamma refuses deep offsets; work with what we have
        print(f"Polymarket paging stopped at offset {off}: {ex}")
        break
    if not page:
        break
    for m in page:
        try:
            if json.loads(m.get("outcomes") or "[]") != ["Yes", "No"] or m.get("bestBid") is None or m.get("bestAsk") is None:
                continue
        except ValueError:
            continue
        poly.append(dict(q=m["question"], t=toks(m["question"]), bid=f(m["bestBid"]), ask=f(m["bestAsk"]), end=(m.get("endDate") or "")[:10],
                         slug=m.get("slug"), vol=f(m.get("volume24hr"))))
kal, index = [], collections.defaultdict(list)
for e in open_events():
    if e.get("category") == "Sports" or e["series_ticker"].startswith("KXMVE"):
        continue
    for m in e.get("markets") or []:
        yb, ya, nb, na = quote(m)
        if m.get("status") != "active" or (yb == 0 and ya == 1):
            continue
        text = f'{e.get("title", "")} {m.get("yes_sub_title") or ""}' if len(e["markets"]) > 1 else (m.get("title") or e.get("title", ""))
        k = dict(ticker=m["ticker"], text=text, t=toks(text), q=(yb, ya, nb, na), close=m["close_time"][:10], ysz=f(m.get("yes_ask_size_fp")), nsz=f(m.get("yes_bid_size_fp")))
        for w in k["t"]:
            index[w].append(len(kal))
        kal.append(k)
print(f"{len(poly)} Polymarket yes/no markets, {len(kal)} Kalshi non-sports markets")
rows = []
for p in poly:
    rare = sorted((w for w in p["t"] if w in index), key=lambda w: len(index[w]))[:3]
    best = None
    for i in {i for w in rare for i in index[w]}:
        k = kal[i]
        sim = len(p["t"] & k["t"]) / len(p["t"] | k["t"])
        nums = lambda t: {w for w in t if re.search(r"\d", w)}
        if sim >= a.min_sim and nums(p["t"]) == nums(k["t"]) and (not best or sim > best[0]):
            best = (sim, k)
    if not best:
        continue
    sim, k = best
    yb, ya, nb, na = k["q"]
    e1 = 1 - ya - (1 - p["bid"]) - fee_per(ya)   # Kalshi YES + Polymarket NO
    e2 = 1 - na - p["ask"] - fee_per(na)         # Kalshi NO + Polymarket YES
    kind, edge = ("K yes + P no", e1) if e1 > e2 else ("K no + P yes", e2)
    rows.append(dict(sim=sim, kalshi=k["ticker"], k_bid=yb, k_ask=ya, p_bid=p["bid"], p_ask=p["ask"], mid_gap=(yb + ya) / 2 - (p["bid"] + p["ask"]) / 2,
                     trade=kind, edge_net=edge, k_close=k["close"], p_end=p["end"], kalshi_text=k["text"][:52], poly_q=p["q"][:52], poly_slug=p["slug"]))
cols = ["sim", "kalshi", "k_bid", "k_ask", "p_bid", "p_ask", "mid_gap", "trade", "edge_net", "k_close", "p_end", "kalshi_text", "poly_q"]
print(f"{len(rows)} matched pairs")
same = [r for r in rows if abs(r["mid_gap"]) <= a.max_gap]
print(f"{len(same)} of them within {a.max_gap} of each other (the rest are treated as different questions; see the context table)")
table(sorted([r for r in same if r["edge_net"] > a.min_edge], key=lambda r: -r["edge_net"]), cols,
      "Pairs that cross after Kalshi's fee - verify the rules match before anything else", limit=30, file="p08_poly_cross.csv")
table(sorted(same, key=lambda r: -r["edge_net"])[:12], cols, "Closest to crossing among plausible matches")
table(sorted(rows, key=lambda r: -abs(r["mid_gap"]))[:6], cols, "Largest disagreements - wording matched, questions did not (why every row needs reading)")
