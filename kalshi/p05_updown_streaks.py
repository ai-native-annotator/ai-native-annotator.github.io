#!/usr/bin/env python3
"""P05 - Is there any pattern in the up/down markets? (BTC 15-minute and the like)

Reads the settled results of a recurring up/down series straight from Kalshi (strike = the previous
reference price, expiration_value = the settled price) and tests the stories people tell:
momentum, mean reversion after streaks, big-move follow-through, time of day.
A coin flip bought at 50c costs 1.75c in fees, so a rule needs a hit rate above ~53.5% to pay as a taker.

  python3 p05_updown_streaks.py --series KXBTC15M --n 6000
"""
import argparse, collections, math
from kcommon import kpages, f, iso_ts, wilson, table

ap = argparse.ArgumentParser()
ap.add_argument("--series", default="KXBTC15M")
ap.add_argument("--n", type=int, default=6000)
a = ap.parse_args()
ms = [m for m in kpages("/markets", "markets", series_ticker=a.series, status="settled", limit=1000, max_items=a.n)
      if m.get("result") in ("yes", "no") and f(m.get("floor_strike")) > 0 and f(m.get("expiration_value")) > 0]
ms.sort(key=lambda m: m["close_time"])
up = [1 if m["result"] == "yes" else 0 for m in ms]
ret = [math.log(f(m["expiration_value"]) / f(m["floor_strike"])) for m in ms]
ts = [iso_ts(m["close_time"]) for m in ms]
gap = sorted(b - x for x, b in zip(ts, ts[1:]))[len(ts) // 2]
print(f"{a.series}: {len(ms)} settled markets, {ms[0]['close_time'][:10]} to {ms[-1]['close_time'][:10]}, one every {gap / 60:.0f} min")

def row(label, idx):
    k, n = sum(up[i] for i in idx), len(idx)
    lo, hi = wilson(k, n)
    # the better side of the rule, and whether its whole interval clears the fee hurdle
    best = max(k / n, 1 - k / n) if n else 0
    return dict(rule=label, n=n, p_up=k / n if n else 0, ci_lo=lo, ci_hi=hi, best_side=best,
                beats_fee="YES" if n and (lo > 0.535 or hi < 0.465) else "no")

consec = [i for i in range(1, len(ms)) if abs(ts[i] - ts[i - 1] - gap) < 1]
rows = [row("all", range(len(ms)))]
rows += [row("prev up", [i for i in consec if up[i - 1]]), row("prev down", [i for i in consec if not up[i - 1]])]
for L in (2, 3, 4, 5):
    ok = [i for i in range(L, len(ms)) if abs(ts[i] - ts[i - L] - L * gap) < 1]
    rows.append(row(f"last {L} up", [i for i in ok if all(up[i - j] for j in range(1, L + 1))]))
    rows.append(row(f"last {L} down", [i for i in ok if not any(up[i - j] for j in range(1, L + 1))]))
q = sorted(abs(ret[i - 1]) for i in consec)
big = q[int(len(q) * 0.9)]
rows.append(row(f"prev move up > {big:.2%} (top decile)", [i for i in consec if ret[i - 1] > big]))
rows.append(row(f"prev move down > {big:.2%} (top decile)", [i for i in consec if ret[i - 1] < -big]))
table(rows, ["rule", "n", "p_up", "ci_lo", "ci_hi", "best_side", "beats_fee"], "Does the last result predict the next?", file=f"p05_{a.series}.csv")

import time
hr = collections.defaultdict(list)
for i, t in enumerate(ts):
    hr[time.gmtime(t).tm_hour].append(i)
hrows = [row(f"UTC hour {h:02d}", hr[h]) for h in sorted(hr)]
table(hrows, ["rule", "n", "p_up", "ci_lo", "ci_hi", "beats_fee"], "By hour of day (24 looks at once: one or two 'significant' hours are expected by chance)")
r1 = sum(x * y for x, y in zip(ret, ret[1:])) / math.sqrt(sum(x * x for x in ret[:-1]) * sum(y * y for y in ret[1:]))
print(f"\nLag-1 autocorrelation of returns: {r1:+.4f} (2 standard errors = {2 / math.sqrt(len(ret)):.4f})")
