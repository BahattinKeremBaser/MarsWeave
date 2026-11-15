# -*- coding: utf-8 -*-
"""
MARSWEAVE - CRISM COVERAGE PROBE (Colab). This does NOT write app data; it only answers:
"does CRISM have map-projected products that cover the 16 km study window, and how many?"
Colab cell 1:   !pip -q install requests
Colab cell 2:   paste, run. It prints a report and downloads crism_probe.zip (send it to me).
Uses the PDS Geosciences ODE REST service (oderest.rsl.wustl.edu). Parameter names are from memory of the ODE docs,
so if the service answers with an error, the error text is saved in the report - that is also useful to me.
"""
import json, zipfile, requests
MIN_LAT, MAX_LAT, W, E = 39.16503, 39.43497, 188.42559, 188.77441
BASE = "https://oderest.rsl.wustl.edu/live2/"
report = {}
for pt in ("MRDR", "TER", "MTRDR", "FRT", "HRL", "HRS", "MSP", "HSP"):
    q = dict(query="product", results="m", output="JSON", target="mars", ihid="MRO", iid="CRISM", pt=pt,
             minlat=MIN_LAT, maxlat=MAX_LAT, westernlon=W, easternlon=E, loc="f", limit=50)
    try:
        r = requests.get(BASE, params=q, timeout=60)
        j = r.json()
        res = j.get("ODEResults", {})
        prods = res.get("Products", {}).get("Product", []) if isinstance(res.get("Products"), dict) else []
        if isinstance(prods, dict): prods = [prods]
        report[pt] = {"status": res.get("Status"), "error": res.get("Error"), "count": len(prods),
                      "ids": [p.get("pdsid") or p.get("ODE_ID") for p in prods][:30]}
    except Exception as e:
        report[pt] = {"exception": f"{type(e).__name__}: {str(e)[:200]}"}
    print(pt, {k: v for k, v in report[pt].items() if k != "ids"}, report[pt].get("ids", [])[:5])
json.dump(report, open("crism_probe.json", "w"), indent=1)
with zipfile.ZipFile("crism_probe.zip", "w") as z: z.write("crism_probe.json")
try:
    from google.colab import files; files.download("crism_probe.zip")
except Exception: pass
