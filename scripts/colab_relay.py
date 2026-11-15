# -*- coding: utf-8 -*-
"""
MARSWEAVE - Colab: MRO relay passes over the study site from real SPICE data (geometry only).
Cell 1:  !pip -q install spiceypy requests numpy
Cell 2:  paste this file and run. Downloads relay_passes.json (+ notlar_relay.txt) in a zip. ~1-3 min (kernels ~100 MB).
Honest scope: pure geometric visibility (elevation >= 10 deg) of ONE orbiter (MRO) over ONE Mars solar day; no terrain masking, no link budget.
"""
import os, re, json, math, shutil, zipfile, datetime, urllib.parse
import numpy as np, requests, spiceypy as sp
LAT, LON_E = 39.30, 188.60
MIN_EL = 10.0
KD = "/tmp/kernels"; os.makedirs(KD, exist_ok=True)
OUT = "/content/relay" if os.path.isdir("/content") else "./relay"; os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    s = " ".join(map(str, a)); print(s, flush=True); LOG.append(s)
def get(u, **kw):
    kw.setdefault("timeout", 60); r = requests.get(u, headers={"User-Agent": "marsweave"}, **kw); r.raise_for_status(); return r
def dl(u):
    p = os.path.join(KD, u.split("/")[-1])
    if not os.path.exists(p):
        log("downloading", u)
        with get(u, stream=True, timeout=300) as r, open(p, "wb") as f: shutil.copyfileobj(r.raw, f)
    return p
N = "https://naif.jpl.nasa.gov/pub/naif/"
lsk = dl(N + "generic_kernels/lsk/naif0012.tls")
pck = dl(N + "generic_kernels/pck/pck00010.tpc")
sat_page = N + "generic_kernels/spk/satellites/"
sat_names = sorted(set(re.findall(r'href="(mar\d+\.bsp)"', get(sat_page).text)))
log("Mars satellite SPKs found:", sat_names)
mar = dl(sat_page + (sat_names[-1] if sat_names else "mar099.bsp"))
page = N + "MRO/kernels/spk/"
spks = [urllib.parse.urljoin(page, h) for h in re.findall(r'href="([^"]+\.bsp)"', get(page).text)]
spks = [s for s in spks if "mro" in s.lower()]
log("MRO spk files:", len(spks), spks[-3:])
if not spks: raise SystemExit("no MRO SPK listed")
spk = dl(sorted(spks)[len(spks) // 2])
for k in (lsk, pck, mar, spk): sp.furnsh(k)
cov = sp.spkcov(spk, -74); t0 = (cov[0] + cov[1]) / 2
R = sp.bodvrd("MARS", "RADII", 3)[1]; f = (R[0] - R[2]) / R[0]
site = np.array(sp.georec(math.radians(LON_E), math.radians(LAT), 0.0, R[0], f)); up = site / np.linalg.norm(site)
SOL = 88775.244; step = 20.0; n = int(SOL // step)
el = []
for k in range(n):
    pos, _ = sp.spkpos("-74", t0 + step * k, "IAU_MARS", "NONE", "MARS")
    v = np.array(pos) - site
    el.append(math.degrees(math.asin(np.dot(v, up) / np.linalg.norm(v))))
vis = np.array(el) >= MIN_EL
passes, i = [], 0
while i < n:
    if vis[i]:
        j = i
        while j < n and vis[j]: j += 1
        passes.append({"orbiter": "MRO", "startMinutes": round(i * step / 60, 1), "durationMin": round((j - i) * step / 60, 1), "maxElevationDeg": round(max(el[i:j]), 1)})
        i = j
    else: i += 1
log(f"{len(passes)} passes >= {MIN_EL} deg in one sol; geometric coverage {vis.mean()*100:.1f}%")
d = {"source": page + " + generic_kernels (naif0012.tls, pck00010.tpc, mar*.bsp); " + os.path.basename(spk),
     "citation": "NAIF SPICE (Acton 1996); MRO SPK " + os.path.basename(spk), "license": "Public Domain (NASA/JPL NAIF)",
     "retrievedUtc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
     "orbiter": "MRO only", "minElevationDeg": MIN_EL, "site": {"lat": LAT, "lonEast": LON_E}, "passes": passes,
     "coveragePct": round(float(vis.mean() * 100), 1), "note": "geometric visibility only (no terrain masking, no link budget), one Mars solar day"}
json.dump(d, open(os.path.join(OUT, "relay_passes.json"), "w"), allow_nan=False)
open(os.path.join(OUT, "notlar_relay.txt"), "w").write("\n".join(LOG))
zp = "/content/relay.zip" if os.path.isdir("/content") else "relay.zip"
with zipfile.ZipFile(zp, "w") as z:
    for fn in os.listdir(OUT): z.write(os.path.join(OUT, fn), fn)
try:
    from google.colab import files; files.download(zp)
except Exception: pass
