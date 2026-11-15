# -*- coding: utf-8 -*-
"""
MARSWEAVE - FAST Colab fetcher (parallel, every step has a hard time limit, so it cannot hang).

Colab cell 1:   !pip -q install rasterio pyproj netCDF4 requests numpy
Colab cell 2:   paste this whole file, run. It downloads marsweave_real_data.zip when done (usually < 3 minutes).

What it does (only products that can be made HONESTLY for the app's 16 x 16 km study window):
  dust_tau       LMD dust climatology, MY34 NetCDF -> daily series at the site (physical-range check)
  themis_ti      USGS THEMIS quantitative thermal inertia (tiu) over the study window
  swim_ice       SWIM2 ice-consistency GeoTIFF over the study window (coarse: ~3 km pixels)
NOT attempted, on purpose:
  hirise_albedo / crism_hydration  one HiRISE/CRISM image is only ~5-10 km wide, it cannot cover the 16 km window
                                   and the app stretches a grid over the whole window, so it would be misplaced.
  rad / meda                       already included as published reference values.
  relay_passes                     needs ~250 MB of SPICE kernels (slow); not worth it today.

Rules: nothing is invented; a product that is not found or fails a sanity check is SKIPPED and explained in notlar.txt.
"""
import os, re, io, json, math, time, shutil, zipfile, datetime, threading, statistics, traceback, urllib.parse
import numpy as np
import requests

# --- the app's study window (identical to data/arcadia_dem.json) ---------------------------------------------
MIN_LAT, MAX_LAT = 39.16503, 39.43497
MIN_LON_E, MAX_LON_E = 360 - 171.57441, 360 - 171.22559        # east longitude 188.42559 .. 188.77441
SITE_LAT, SITE_LON_E = (MIN_LAT + MAX_LAT) / 2, (MIN_LON_E + MAX_LON_E) / 2
GRID = 48                      # max output grid size
MARS_YEAR = 34
ELEVATION_M, VIS_SCALE, SCALE_H_KM = -3800.0, 2.6, 10.8
STEP_TIMEOUT = 150             # seconds per product
OVERRIDE = {"dust_nc": None, "themis": None, "swim": None}   # paste a direct URL to force a source
OUT = "/content/real" if os.path.isdir("/content") else "./real"
os.makedirs(OUT, exist_ok=True)
LOG, LOCK = [], threading.Lock()
NOW = lambda: datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(*a):
    s = " ".join(str(x) for x in a)
    with LOCK:
        print(s, flush=True); LOG.append(s)


def get(url, **kw):
    kw.setdefault("timeout", 40); kw.setdefault("headers", {"User-Agent": "marsweave-colab/2.0"})
    r = requests.get(url, **kw); r.raise_for_status(); return r


def write(pid, d):
    with open(os.path.join(OUT, pid + ".json"), "w") as f:
        json.dump(d, f, allow_nan=False)
    log(f"[{pid}] WROTE {pid}.json")


def prov(source, citation, lic):
    return {"source": source, "citation": citation, "license": lic, "retrievedUtc": NOW()}


def page_links(url, pattern):
    out = []
    for h in re.findall(r'href=["\']([^"\']+)["\']', get(url).text, flags=re.I):
        u = urllib.parse.urljoin(url, h)
        if re.search(pattern, u, re.I): out.append(u)
    return list(dict.fromkeys(out))


# ---------------------------------------------------------------------------------------------- raster window
def read_study_window(path, valid=None):
    """Read exactly the study window (lat/lon bbox above). Returns (array[north->south, west->east] with NaN, info)."""
    import rasterio
    from rasterio.windows import Window
    from rasterio.enums import Resampling
    from pyproj import CRS, Transformer
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="2", GDAL_HTTP_RETRY_DELAY="1",
               GDAL_HTTP_TIMEOUT="25", GDAL_HTTP_CONNECTTIMEOUT="10", CPL_VSIL_CURL_CACHE_SIZE="33554432")
    with rasterio.Env(**env):
        with rasterio.open(path) as ds:
            if ds.crs is None: raise RuntimeError("raster has no CRS")
            crs = CRS.from_wkt(ds.crs.to_wkt())
            tr = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
            L, B, R, T = ds.bounds
            for shift in (0.0, -360.0, 360.0):
                pts = [tr.transform(lo + shift, la) for lo in (MIN_LON_E, MAX_LON_E) for la in (MIN_LAT, MAX_LAT)]
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                if min(xs) >= L and max(xs) <= R and min(ys) >= B and max(ys) <= T: break
            else:
                raise RuntimeError(f"study window is not inside this raster (bounds {ds.bounds})")
            rx, ry = abs(ds.res[0]), abs(ds.res[1])
            c0, c1 = int((min(xs) - L) / rx), int(math.ceil((max(xs) - L) / rx))
            r0, r1 = int((T - max(ys)) / ry), int(math.ceil((T - min(ys)) / ry))
            h, w = r1 - r0, c1 - c0
            if h < 2 or w < 2: raise RuntimeError("window is smaller than 2 pixels")
            oh, ow = min(h, GRID), min(w, GRID)
            log(f"  raster {ds.width}x{ds.height}px, ~{rx:.0f} m/px, window {h}x{w}px -> grid {oh}x{ow}")
            a = ds.read(1, window=Window(c0, r0, w, h), out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
            nodata, dtype = ds.nodata, str(ds.dtypes[0])
    if nodata is not None: a[a == nodata] = np.nan
    a[~np.isfinite(a)] = np.nan
    a[np.abs(a) > 1e30] = np.nan
    if valid: a[(a < valid[0]) | (a > valid[1])] = np.nan
    return a, {"pixelMeters": round(rx, 1), "nativeWindowPx": [h, w], "dtype": dtype}


def grid_json(a):
    return [[None if not np.isfinite(v) else round(float(v), 4) for v in row] for row in a]


def window_tag():
    return {"bbox": {"minLat": MIN_LAT, "maxLat": MAX_LAT, "minLonEast": MIN_LON_E, "maxLonEast": MAX_LON_E},
            "orientation": "row 0 = north, col 0 = west; covers exactly the app study window"}


# ------------------------------------------------------------------------------------------------------ dust
def task_dust():
    from netCDF4 import Dataset
    url = OVERRIDE["dust_nc"]
    if not url:
        base = "https://www-mars.lmd.jussieu.fr/mars/dust_climatology/dataset_v2/"
        cands = [f"{base}griddedcdod_MY{MARS_YEAR}_v2-0.nc", f"{base}griddedcdod_MY{MARS_YEAR}_v2-5.nc"]
        try:
            cands = [u for u in page_links("https://www-mars.lmd.jussieu.fr/mars/dust_climatology/", r"\.nc$") if f"MY{MARS_YEAR}" in u] + cands
        except Exception as e:
            log("  (page listing failed:", str(e)[:60], ")")
    else:
        cands = [url]
    path = "/tmp/dust.nc"
    for u in cands:
        try:
            log("  trying", u)
            with get(u, stream=True, timeout=60) as r, open(path, "wb") as f:
                shutil.copyfileobj(r.raw, f)
            break
        except Exception as e:
            log("   failed:", str(e)[:80]); u = None
    if not u: raise RuntimeError("no MY%d NetCDF could be downloaded; put a URL in OVERRIDE['dust_nc']" % MARS_YEAR)
    ds = Dataset(path); names = list(ds.variables)
    for n in names:
        v = ds.variables[n]; log(f"   var {n} dims={v.dimensions} shape={getattr(v,'shape','')} units={getattr(v,'units','')} | {getattr(v,'long_name','')}")
    lat_n = next(n for n in names if n.lower() in ("latitude", "lat", "lats"))
    lon_n = next(n for n in names if n.lower() in ("longitude", "lon", "lons"))
    lats, lons = np.array(ds.variables[lat_n][:], float), np.array(ds.variables[lon_n][:], float)
    lon_t = SITE_LON_E if lons.max() > 180 else ((SITE_LON_E + 180) % 360) - 180
    i, j = int(np.argmin(abs(lats - SITE_LAT))), int(np.argmin(abs(lons - lon_t)))
    ls = next((np.array(ds.variables[n][:], float) for n in names if n.lower() in ("ls", "solar_longitude", "areocentric_longitude")), None)
    best = None
    # Variable choice: 'cdod610' = IR absorption column dust optical depth normalised to 610 Pa (the product the app needs).
    # Everything else ('...rel' reliability, '...unc' uncertainty, '...num', '...tw', '...rmsd', 'cdodtot' un-normalised) is skipped.
    PREFER = [n for n in names if n.lower() == "cdod610"]
    SKIP = re.compile(r"rel|unc|num|tw|rmsd|tot", re.I)
    order = PREFER + [n for n in names if n not in PREFER and re.search(r"cdod", n, re.I) and not SKIP.search(n)]
    for n in order:
        v = ds.variables[n]
        if len(v.dimensions) < 3 or lat_n not in v.dimensions or lon_n not in v.dimensions: continue
        arr = np.ma.filled(np.ma.masked_invalid(v[:]), np.nan).astype(float)
        sl = [slice(None)] * arr.ndim
        sl[v.dimensions.index(lat_n)], sl[v.dimensions.index(lon_n)] = i, j
        s = arr[tuple(sl)]
        while s.ndim > 1: s = np.nanmean(s, axis=-1)
        good = [(k, float(x)) for k, x in enumerate(s) if np.isfinite(x) and 0 < x < 10]
        med = statistics.median(x for _, x in good) if good else float("nan")
        log(f"   candidate '{n}': {len(good)}/{len(s)} valid, median {med:.3f}")
        if len(good) >= 100 and 0.02 <= med <= 2.5 and best is None:
            best = (n, good)
    if not best: raise RuntimeError("no variable has physical optical-depth values (0.02-2.5); see candidates above. NOT written.")
    n, good = best
    ratio = math.exp(-(ELEVATION_M / 1000.0) / SCALE_H_KM)
    pts = [{"sol": k, "ls": (round(float(ls[k]), 1) if ls is not None and k < len(ls) else None),
            "tau93At610Pa": round(x, 4), "tauVisSurface": round(x * ratio * VIS_SCALE, 4)} for k, x in good]
    vis = [p["tauVisSurface"] for p in pts]
    d = prov(u, "Montabone, L., et al. (2015), Icarus 251, 65-95; Montabone et al. (2020), JGR Planets 125, e2019JE006111", "CC BY-SA 3.0 (LMD)")
    d.update({"marsYear": MARS_YEAR, "lat": float(lats[i]), "lonEast": float(lons[j]), "variable": n,
              "valueMeaning": "tauVisSurface = tau(9.3um, 610 Pa) x surface-pressure ratio x VIS_SCALE",
              "cellNote": "LMD grid cell is 5 deg lat x 6 deg lon (regional value, not specific to the 16 km window)",
              "assumptions": {"visScale": VIS_SCALE, "pressureRatio": round(ratio, 3), "elevationM": ELEVATION_M},
              "tauTypical": round(statistics.median(vis), 3), "tauMax": round(max(vis), 3), "series": pts[:800]})
    write("dust_tau", d)


# ---------------------------------------------------------------------------------------------------- THEMIS
def task_themis():
    host = "https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/"
    cands = [OVERRIDE["themis"]] if OVERRIDE["themis"] else \
        [f"{host}THEMIS_TI_Mosaic_Quant_{la}{lo:03d}E_100mpp.cub" for la in ("30N", "00N", "60N") for lo in range(0, 360, 60)]
    found, lock = [], threading.Lock()

    def probe(u):
        try:
            a, info = read_study_window("/vsicurl/" + u, valid=(5, 1500))
            if np.isfinite(a).mean() >= 0.6:
                with lock: found.append((u, a, info))
            else:
                log(f"   {u.split('/')[-1]}: only {np.isfinite(a).mean():.0%} valid tiu")
        except Exception as e:
            log(f"   {u.split('/')[-1]}: {str(e)[:90]}")
    ths = [threading.Thread(target=probe, args=(u,), daemon=True) for u in cands]
    [t.start() for t in ths]; [t.join(STEP_TIMEOUT - 20) for t in ths]
    if not found: raise RuntimeError("no THEMIS TI tile covers the window with plausible tiu values; set OVERRIDE['themis']")
    u, a, info = found[0]
    log(f"  using {u}; tiu {np.nanmin(a):.0f}..{np.nanmax(a):.0f}, mean {np.nanmean(a):.0f}")
    d = prov(u, "Fergason, R. L., Christensen, P. R., & Kieffer, H. H. (2006), JGR 111, E12004; USGS Astropedia THEMIS TI mosaic", "Public Domain (NASA/USGS/ASU)")
    d.update({"unit": "tiu (J m-2 K-1 s-0.5)", "cols": a.shape[1], "rows": a.shape[0], "windowCoverage": round(float(np.isfinite(a).mean()), 3),
              **window_tag(), **info, "values": grid_json(a)})
    write("themis_ti", d)


# ------------------------------------------------------------------------------------------------------- SWIM
def task_swim():
    cands = [OVERRIDE["swim"]] if OVERRIDE["swim"] else []
    folder = "https://swim.psi.edu/output/SWIM2/Global/Composite/"
    for page in (folder, "https://swim.psi.edu/"):
        try:
            cands += page_links(page, r"\.tiff?$")
        except Exception as e:
            log("  listing failed", page, str(e)[:60])
    cands += [folder + n for n in ("SWIM_OriginalCi.tif", "SWIM_OriginalCi_GeoTIFF.tif", "SWIM_Original_Ci.tif", "SWIM_CompositeCi.tif")]
    cands = list(dict.fromkeys(cands))
    log("  GeoTIFF candidates:", len(cands))
    for u in cands:
        try:
            log("  trying", u)
            a, info = read_study_window("/vsicurl/" + u)
        except Exception as e:
            log("    ", str(e)[:90]); continue
        cov = float(np.isfinite(a).mean()); lo, hi = float(np.nanmin(a)), float(np.nanmax(a))
        log(f"    coverage {cov:.0%}, range {lo:.3f}..{hi:.3f}")
        if cov < 0.6: continue
        if lo < -1.01 or hi > 100.01: log("    unexpected value range; skipped"); continue
        if lo < 0 and hi <= 1.0001: sc, how = (a + 1) / 2 * 100, "(consistency+1)/2*100 (-1..1 -> 0..100)"
        elif hi <= 1.0001: sc, how = a * 100, "consistency*100 (0..1 -> 0..100)"
        else: sc, how = np.clip(a, 0, 100), "already 0..100"
        d = prov(u, "Morgan, G. A., Putzig, N. E., et al. (2021), Nature Astronomy 5, 230-236; SWIM project, swim.psi.edu", "Public Domain (NASA/PSI SWIM)")
        d.update({"unit": "ice consistency rescaled 0..100", "rescale": how, "rawMin": lo, "rawMax": hi, "cols": sc.shape[1], "rows": sc.shape[0],
                  "windowCoverage": round(cov, 3), **window_tag(), **info, "values": grid_json(sc)})
        write("swim_ice", d); return
    raise RuntimeError("no SWIM GeoTIFF found; open https://swim.psi.edu, copy a composite ice-consistency .tif link into OVERRIDE['swim']")


# --------------------------------------------------------------------------------------------------------- main
def run(name, fn):
    def wrap():
        try:
            log(f"\n===== {name} =====")
            fn()
        except Exception as e:
            log(f"[{name}] SKIPPED: {type(e).__name__}: {e}")
            LOG.append(traceback.format_exc())
    t = threading.Thread(target=wrap, daemon=True); t.start(); return t


if __name__ == "__main__":
    t0 = time.time()
    ths = [(n, run(n, f)) for n, f in (("dust_tau", task_dust), ("themis_ti", task_themis), ("swim_ice", task_swim))]
    for n, t in ths:
        t.join(max(1, STEP_TIMEOUT - (time.time() - t0)))
        if t.is_alive(): log(f"[{n}] TIMED OUT after {STEP_TIMEOUT}s - skipped")
    ok = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".json"))
    log("\n===== SUMMARY =====", f"({time.time()-t0:.0f}s)")
    log("written:", ok); log("not written:", sorted({"dust_tau", "themis_ti", "swim_ice"} - set(ok)))
    with open(os.path.join(OUT, "notlar.txt"), "w") as f: f.write("\n".join(LOG))
    zp = "/content/marsweave_real_data.zip" if os.path.isdir("/content") else "marsweave_real_data.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in os.listdir(OUT): z.write(os.path.join(OUT, fn), fn)
    log("zip:", zp)
    try:
        from google.colab import files; files.download(zp)
    except Exception:
        pass
