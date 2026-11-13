#!/usr/bin/env python3
"""P06 - Overnight vs intraday returns, and what the opening gap says about the close.

The "stocks earn their return overnight" effect: split each day's return into
  overnight = previous close -> open      intraday = open -> close
and compare the two legs per ticker. Then the part that maps onto Kalshi's daily up/down markets
(KXINXDUD: S&P closes above yesterday's close; KXNASDAQDUD): given the size of the opening gap,
how often does the day finish above the previous close, and above the open?
Yahoo daily bars are split-adjusted but not dividend-adjusted, so overnight is understated a little.

  python3 p06_overnight_intraday.py --tickers ^GSPC,^NDX,SPY,QQQ,MU,NVDA --range 10y
"""
import argparse, math, time
from kcommon import yahoo_daily, kget, quote, wilson, table

ap = argparse.ArgumentParser()
ap.add_argument("--tickers", default="^GSPC,^NDX,SPY,QQQ,MU,NVDA,TSLA,AAPL")
ap.add_argument("--range", default="10y")
a = ap.parse_args()

def stats(x):
    n = len(x)
    mu = sum(x) / n
    sd = math.sqrt(sum((v - mu) ** 2 for v in x) / (n - 1))
    return mu, sd, mu / (sd / math.sqrt(n))

summary, cond, yearly = [], [], []
for tk in a.tickers.split(","):
    bars, _ = yahoo_daily(tk, a.range)
    on = [math.log(b["o"] / p["c"]) for p, b in zip(bars, bars[1:])]
    intra = [math.log(b["c"] / b["o"]) for b in bars[1:]]
    (mo, so, to), (mi, si, ti) = stats(on), stats(intra)
    summary.append(dict(ticker=tk, days=len(on), overnight_ann=mo * 252, intraday_ann=mi * 252, overnight_t=to, intraday_t=ti,
                        overnight_vol=so * math.sqrt(252), intraday_vol=si * math.sqrt(252),
                        p_overnight_up=sum(v > 0 for v in on) / len(on), p_intraday_up=sum(v > 0 for v in intra) / len(on),
                        p_day_up=sum(o + i > 0 for o, i in zip(on, intra)) / len(on)))
    yrs = {}
    for b, o, i in zip(bars[1:], on, intra):
        y = time.gmtime(b["t"]).tm_year
        yrs.setdefault(y, [0.0, 0.0])
        yrs[y][0] += o; yrs[y][1] += i
    yearly.append(dict(ticker=tk, **{str(y): f"{v[0]:+.0%}/{v[1]:+.0%}" for y, v in sorted(yrs.items())}))
    # gap in units of the ticker's own overnight volatility
    for lo, hi, lab in ((-9, -1, "gap < -1 sd"), (-1, -.25, "-1..-0.25 sd"), (-.25, .25, "flat +-0.25 sd"), (.25, 1, "0.25..1 sd"), (1, 9, "gap > +1 sd")):
        idx = [j for j, v in enumerate(on) if lo <= v / so < hi]
        if not idx:
            continue
        k1 = sum(on[j] + intra[j] > 0 for j in idx)
        k2 = sum(intra[j] > 0 for j in idx)
        l1, h1 = wilson(k1, len(idx)); l2, h2 = wilson(k2, len(idx))
        cond.append(dict(ticker=tk, gap=lab, n=len(idx), p_close_above_prev_close=k1 / len(idx), ci=f"{l1:.2f}-{h1:.2f}",
                         p_close_above_open=k2 / len(idx), ci2=f"{l2:.2f}-{h2:.2f}",
                         mean_intraday_after=sum(intra[j] for j in idx) / len(idx)))

table(summary, ["ticker", "days", "overnight_ann", "intraday_ann", "overnight_t", "intraday_t", "overnight_vol", "intraday_vol", "p_overnight_up", "p_intraday_up", "p_day_up"],
      "Where the return was earned (annualised log return; t-stat of the daily mean)", file="p06_summary.csv")
ycols = ["ticker"] + sorted({k for r in yearly for k in r if k != "ticker"})
table(yearly, ycols, "Per calendar year: overnight / intraday (is it stable, or two good years?)")
table(cond, ["ticker", "gap", "n", "p_close_above_prev_close", "ci", "p_close_above_open", "ci2", "mean_intraday_after"],
      "After the open: given the gap, where does the day close?", file="p06_gap_conditional.csv")

rows = []
for s, tk in (("KXINXDUD", "^GSPC"), ("KXNASDAQDUD", "^NDX")):
    for m in kget("/markets", series_ticker=s, status="open", limit=5).get("markets") or []:
        yb, ya, _, _ = quote(m)
        rows.append(dict(market=m["ticker"], means=f"{tk} closes above {m.get('floor_strike')}", yes_bid=yb, yes_ask=ya, closes=m["close_time"]))
table(rows, ["market", "means", "yes_bid", "yes_ask", "closes"],
      "Live Kalshi daily up/down markets to compare with the gap table (use the index level now vs the strike as the 'gap')")
