#!/usr/bin/env python3
"""P07 - Daily high-temperature markets against ensemble weather forecasts.

Each city event is a ladder of 2-degree buckets on the day's maximum at one airport station.
The forecast distribution comes from Open-Meteo's ensemble API (GEFS 31 members + ECMWF 51 members,
free, no key): every member's daily maximum, shifted by a bias and smeared with a normal kernel.
The centre is then averaged with the National Weather Service point forecast, and edges are only listed
where the two forecasts agree. Bias and kernel are fitted on the spot: the last few days' settled highs (Kalshi's own expiration_value) minus the
ensemble mean for those days, pooled over all stations. Bucket probability vs the ask = the edge.

Thin validation: a few days per station, and against short-lead ensemble values. Before trusting it,
log this script's output daily and compare with settlements. Events whose day has started are skipped:
by then the observed high so far beats any forecast, and traders watching the station feed win.

  python3 p07_weather_ensemble.py --edge 0.05
"""
import argparse, re, time
from datetime import datetime
from kcommon import kget, http_json, series_map, f, quote, fee_per, ncdf, table

STATIONS = {"NYC": (40.779, -73.969), "MDW": (41.786, -87.752), "MIA": (25.79, -80.29), "AUS": (30.19, -97.67), "LAX": (33.94, -118.41),
            "DEN": (39.85, -104.66), "PHL": (39.87, -75.24), "BOS": (42.36, -71.01), "ATL": (33.64, -84.43), "DFW": (32.90, -97.04),
            "HOU": (29.65, -95.28), "SEA": (47.45, -122.31), "SFO": (37.62, -122.37), "PHX": (33.43, -112.01), "DCA": (38.85, -77.04),
            "LAS": (36.08, -115.15), "MSP": (44.88, -93.22), "MSY": (29.99, -90.25), "SAT": (29.53, -98.47), "OKC": (35.39, -97.60),
            "SAN": (32.73, -117.19), "EWR": (40.69, -74.17), "TTN": (40.28, -74.81), "SDF": (38.17, -85.74)}
ap = argparse.ArgumentParser()
ap.add_argument("--sigma", type=float, default=0, help="kernel width in F; 0 = use the calibration residual")
ap.add_argument("--agree", type=float, default=1.5, help="only list edges where bias-corrected ensemble and NWS high differ by at most this")
ap.add_argument("--same-day", action="store_true", help="also price events whose day has already started")
ap.add_argument("--edge", type=float, default=0.05)
a = ap.parse_args()

def members(lat, lon):
    d = http_json("https://ensemble-api.open-meteo.com/v1/ensemble", {"latitude": lat, "longitude": lon, "daily": "temperature_2m_max",
                  "models": "gfs025,ecmwf_ifs025", "forecast_days": 4, "past_days": 5, "temperature_unit": "fahrenheit", "timezone": "auto"})["daily"]
    return {day: [v[i] for k, v in d.items() if k != "time" and v[i] is not None] for i, day in enumerate(d["time"])}

def nws_highs(lat, lon):
    """{date: forecast high F} from the National Weather Service point forecast - the number most traders anchor on."""
    try:
        url = http_json(f"https://api.weather.gov/points/{lat},{lon}")["properties"]["forecast"]
        return {p["startTime"][:10]: p["temperature"] for p in http_json(url)["properties"]["periods"] if p["isDaytime"]}
    except Exception:
        return {}

def evday(e):
    return datetime.strptime(e["event_ticker"].split("-")[1], "%y%b%d").strftime("%Y-%m-%d")

def prob(mem, lo, hi, sig):
    """P(lo < T < hi) under the kernel-smoothed ensemble."""
    return sum(ncdf((hi - x) / sig) - ncdf((lo - x) / sig) for x in mem) / len(mem)

# ---- pull every station's ensemble and its recently settled highs ------------------------------
now_day = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 6 * 3600))   # "today" in US terms
city = {}
for s, info in series_map().items():
    if not (s.startswith("KXHIGH") and info.get("frequency") == "daily"):
        continue
    ev = kget("/events", series_ticker=s, status="open", with_nested_markets="true", limit=5).get("events") or []
    ms0 = (ev[0].get("markets") or [None])[0] if ev else None
    code = re.search(r"\(CLI(\w{3})\)", ms0.get("rules_primary", "")) if ms0 else None
    if not code or code.group(1) not in STATIONS:
        continue
    done = kget("/events", series_ticker=s, status="settled", with_nested_markets="true", limit=8).get("events") or []
    actual = {evday(e): f(e["markets"][0].get("expiration_value")) for e in done if e.get("markets") and e["markets"][0].get("expiration_value")}
    mem = members(*STATIONS[code.group(1)])
    diffs = [actual[d] - sum(mem[d]) / len(mem[d]) for d in actual if mem.get(d)]
    city[s] = dict(code=code.group(1), events=ev, mem=mem, diffs=diffs, nws=nws_highs(*STATIONS[code.group(1)]))

# ---- bias: the ensemble's grid-cell maximum runs colder than the station thermometer ----------
alld = [d for c in city.values() for d in c["diffs"]]
gbias = sum(alld) / len(alld) if alld else 0.0
resid = (sum((d - gbias) ** 2 for d in alld) / max(len(alld) - 1, 1)) ** 0.5 if alld else a.sigma
sig = a.sigma if a.sigma > 0 else max(resid, 1.0)
print(f"Calibration on {len(alld)} station-days: settled high minus ensemble mean = {gbias:+.2f}F on average, sd {resid:.2f}F -> kernel sigma {sig:.2f}F")
print("(those past ensemble values are short-lead, so the day-ahead error is larger than this sd: treat edges as optimistic)")

rows, summary = [], []
for s, c in city.items():
    # station bias shrunk half-way to the pooled bias: a handful of days per station is not much
    bias = 0.5 * gbias + 0.5 * (sum(c["diffs"]) / len(c["diffs"]) if c["diffs"] else gbias)
    for e in c["events"]:
        ms = [m for m in e.get("markets") or [] if m.get("status") == "active"]
        day = evday(e)
        if not ms or (day <= now_day and not a.same_day):
            continue   # once the day is under way the observed high so far beats any forecast
        mem = [x + bias for x in c["mem"].get(day) or []]
        if not mem:
            continue
        mu = sum(mem) / len(mem)
        nws = c["nws"].get(day)
        agree = nws is not None and abs(nws - mu) <= a.agree
        if nws is not None:                      # centre the distribution half-way between the two forecasts
            mem = [x + (nws - mu) / 2 for x in mem]
            mu = (mu + nws) / 2
        sd = (sum((x - mu) ** 2 for x in mem) / len(mem)) ** 0.5
        fav = max(ms, key=lambda m: f(m.get("yes_bid_dollars")))
        summary.append(dict(event=e["event_ticker"], station=c["code"], bias=bias, nws_high=nws, fcst_mean=mu, ens_sd=sd, forecasts_agree=agree,
                            market_favourite=fav.get("yes_sub_title"), fav_bid=f(fav.get("yes_bid_dollars"))))
        for m in ms:
            t, lo, hi = m.get("strike_type"), m.get("floor_strike"), m.get("cap_strike")
            # the station reports whole degrees: "less than 59" is T <= 58, "greater than 66" is T >= 67
            lo, hi = (-1e9, hi - 0.5) if t == "less" else (lo + 0.5, 1e9) if t == "greater" else (lo - 0.5, hi + 0.5)
            p = prob(mem, lo, hi, sig)
            yb, ya, nb, na = quote(m)
            ey, en = p - ya - fee_per(ya), (1 - p) - na - fee_per(na)
            side, edge, px, size = ("YES", ey, ya, f(m.get("yes_ask_size_fp"))) if ey > en else ("NO", en, na, f(m.get("yes_bid_size_fp")))
            if edge > a.edge and size > 0 and agree:
                rows.append(dict(ticker=m["ticker"], bucket=m.get("yes_sub_title"), model_p=p, yes_bid=yb, yes_ask=ya, buy=side, at=px, edge_net=edge, size=size, fcst_mean=mu))
table(sorted(summary, key=lambda r: r["event"]), ["event", "station", "bias", "nws_high", "fcst_mean", "ens_sd", "forecasts_agree", "market_favourite", "fav_bid"], "Forecast vs the market's favourite bucket")
table(sorted(rows, key=lambda r: -r["edge_net"]), ["ticker", "bucket", "model_p", "yes_bid", "yes_ask", "buy", "at", "edge_net", "size", "fcst_mean"],
      f"Modelled edges above {a.edge} after fees, only where the ensemble and the NWS forecast agree within {a.agree}F", limit=30, file="p07_weather.csv")
