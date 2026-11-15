# -*- coding: utf-8 -*-
"""
MARSWEAVE - space weather fetcher (NASA DONKI). Colab cell 1: !pip -q install requests
Colab cell 2: paste, run. Downloads marsweave_spaceweather.zip (send it to me).
Source: NASA DONKI (kauai.ccmc.gsfc.nasa.gov / api.nasa.gov). WSA-Enlil simulations list modelled CME impacts on planets
and spacecraft, including Mars. These are archival MODEL FORECASTS of arrival at Mars, not measurements at Mars.
Also lists X-class solar flares in the same window (observed at Earth's side, for context).
Nothing is invented: whatever the API returns is saved; if it returns nothing, the file is not written.
"""
import json, datetime, zipfile, traceback, requests
KEY = "DEMO_KEY"            # works but rate-limited; replace with a free key from api.nasa.gov if you get 429 errors
DAYS = 365
BASES = ["https://api.nasa.gov/DONKI/", "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/"]
LOG = []
def log(*a):
    s = " ".join(str(x) for x in a); print(s); LOG.append(s)
def get(path, params):
    last = None
    for b in BASES:
        p = dict(params); 
        if "api.nasa.gov" in b: p["api_key"] = KEY
        try:
            r = requests.get(b + path, params=p, timeout=60)
            if r.status_code == 200: return r.json()
            last = f"{b} HTTP {r.status_code}"
        except Exception as e:
            last = f"{b} {type(e).__name__}"
    log("  failed:", path, last); return None

now = datetime.datetime.now(datetime.timezone.utc)
events, mars_n, sims_n = [], 0, 0
step = 30
for k in range(0, DAYS, step):
    end = now - datetime.timedelta(days=k); start = end - datetime.timedelta(days=step)
    sd, ed = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    sims = get("WSAEnlilSimulations", {"startDate": sd, "endDate": ed}) or []
    sims_n += len(sims)
    for s in sims:
        for imp in (s.get("impactList") or []):
            loc = str(imp.get("location", ""))
            if "mars" in loc.lower():
                mars_n += 1
                events.append({"date": imp.get("arrivalTime") or s.get("modelCompletionTime"), "what": f"CME arrival at {loc} (WSA-Enlil model)",
                               "kind": "cme_mars_modelled", "simulationId": s.get("simulationID"), "isGlancingBlow": imp.get("isGlancingBlow")})
    fl = get("FLR", {"startDate": sd, "endDate": ed}) or []
    for f in fl:
        cls = str(f.get("classType", ""))
        if cls.startswith("X"):
            events.append({"date": f.get("peakTime"), "what": f"X-class solar flare {cls} (observed from Earth side)", "kind": "flare_x"})
    log(sd, "->", ed, "simulations", len(sims), "flares", len(fl))
log("simulations:", sims_n, "Mars impacts:", mars_n, "events:", len(events))
events.sort(key=lambda e: str(e.get("date")), reverse=True)
if sims_n == 0:
    log("NO DATA: the API returned nothing; file not written (try your own api.nasa.gov key).")
else:
    d = {"source": "https://api.nasa.gov/DONKI/WSAEnlilSimulations + /FLR", "citation": "NASA CCMC DONKI (Space Weather Database Of Notifications, Knowledge, Information); WSA-Enlil model",
         "license": "Public Domain (NASA)", "retrievedUtc": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "windowDays": DAYS, "simulationsChecked": sims_n,
         "marsDirectedCount": mars_n, "events": events[:60],
         "note": "Mars arrivals are WSA-Enlil model forecasts. Flares are observed at Earth's side; they are context, not Mars measurements."}
    json.dump(d, open("space_weather.json", "w"), indent=1)
open("notlar.txt", "w").write("\n".join(LOG))
with zipfile.ZipFile("marsweave_spaceweather.zip", "w") as z:
    import os
    for f in ("space_weather.json", "notlar.txt"):
        if os.path.exists(f): z.write(f)
try:
    from google.colab import files; files.download("marsweave_spaceweather.zip")
except Exception: pass
