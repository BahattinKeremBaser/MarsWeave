# -*- coding: utf-8 -*-
"""
MARSWEAVE - CRISM hydration (BD1900) fetcher for Colab.  Colab cell 1: !pip -q install rasterio pyproj requests numpy
Colab cell 2: paste, run. Downloads marsweave_crism.zip (send it to me).
The probe showed ODE has 1 MTRDR product (200 m multispectral-survey tile) that overlaps the study window.
Steps: ask ODE for that product's file list -> pick the summary-parameter map (SR, else SU) .IMG -> read only the window
-> pick the band whose name contains BD1900 (hdr band names) -> write crism_hydration.json.
Everything it finds is logged to notlar.txt, so if a step fails I can fix it from the log.
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
def read_study_window(path, valid=None, band=1):
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
            a = ds.read(band, window=Window(c0, r0, w, h), out_shape=(oh, ow), resampling=Resampling.average).astype("float64")
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




def ode_files(pt):
    q = dict(query="product", results="f", output="JSON", target="mars", ihid="MRO", iid="CRISM", pt=pt,
             minlat=MIN_LAT, maxlat=MAX_LAT, westernlon=W_, easternlon=E_, loc="f", limit=20)
    j = requests.get("https://oderest.rsl.wustl.edu/live2/", params=q, timeout=90).json()
    res = j.get("ODEResults", {})
    log("ODE status:", res.get("Status"), res.get("Error"))
    prods = res.get("Products", {}).get("Product", []) if isinstance(res.get("Products"), dict) else []
    if isinstance(prods, dict): prods = [prods]
    urls = []
    for p in prods:
        pf = p.get("Product_files", {}).get("Product_file", [])
        if isinstance(pf, dict): pf = [pf]
        for f in pf: urls.append(f.get("URL") or f.get("url") or "")
    return [u for u in urls if u]


def task_crism():
    global W_, E_
    W_, E_ = MIN_LON_E, MAX_LON_E
    urls = []
    for pt in ("MTRDR", "TER"):
        u = ode_files(pt); log(pt, "files:", len(u))
        for x in u: log("   ", x)
        urls += [(pt, x) for x in u]
    cands = [(pt, u) for pt, u in urls if re.search(r"_(sr|su)\d+[a-z]_(mtr|ter)\d\.img$", u, re.I)]
    cands.sort(key=lambda t: (t[0] != "MTRDR", "_sr" not in t[1].lower()))
    if not cands: raise RuntimeError("no SR/SU .IMG in the ODE file list - see the logged URLs")
    for pt, u in cands:
        try:
            log("trying", pt, u)
            import rasterio
            loc = os.path.join(OUT, "_" + os.path.basename(u))
            for ext_u, ext_l in ((u, loc), (u[:-4] + ".hdr", loc[:-4] + ".hdr")):
                with requests.get(ext_u, stream=True, timeout=120) as r:
                    r.raise_for_status()
                    with open(ext_l, "wb") as fh:
                        for chunk in r.iter_content(1 << 20): fh.write(chunk)
                log("  downloaded", os.path.basename(ext_l), os.path.getsize(ext_l) // 1024, "KB")
            log("  hdr head:", open(loc[:-4] + ".hdr", errors="ignore").read()[:600].replace("\n", " | "))
            with rasterio.Env():
                with rasterio.open(loc, driver="ENVI") as ds:
                    names = list(ds.descriptions); log("  bands:", ds.count, "names:", names[:60], "crs:", ds.crs is not None)
            idx = next((i + 1 for i, n in enumerate(names) if n and "BD1900" in n.upper()), None)
            if idx is None: log("  no BD1900 band name"); continue
            a, info = read_study_window(loc, band=idx)
            a[(a < -1) | (a > 5)] = np.nan          # summary parameters are band depths, roughly 0..1; 65535/-32768 etc. are no-data
            cov = float(np.isfinite(a).mean()); lo, hi = float(np.nanmin(a)), float(np.nanmax(a))
            log(f"  band {idx} ({names[idx-1]}) coverage {cov:.0%} range {lo:.4f}..{hi:.4f}")
            if cov < 0.6 or hi - lo < 1e-4: continue
            d = prov(u, "Murchie et al. (2007) JGR 112, E05S03; Seelos et al. (2016) CRISM MTRDR; PDS Geosciences Node (ODE)", "Public Domain (NASA/PDS)")
            d.update({"unit": "CRISM summary parameter " + str(names[idx-1]) + " (band depth, unitless)", "product": pt, "rawMin": lo, "rawMax": hi,
                      "cols": a.shape[1], "rows": a.shape[0], "windowCoverage": round(cov, 3), **window_tag(), **info, "values": grid_json(a)})
            write("crism_hydration", d); return
        except Exception as e:
            log("  failed:", type(e).__name__, str(e)[:150])
    raise RuntimeError("no usable CRISM BD1900 map; see log")


if __name__ == "__main__":
    try:
        task_crism()
    except Exception as e:
        log("FAILED:", type(e).__name__, e); log(traceback.format_exc())
    zp = "/content/marsweave_crism.zip" if os.path.isdir("/content") else "marsweave_crism.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in os.listdir(OUT):
            if not fn.startswith("_"): z.write(os.path.join(OUT, fn), fn)
        z.writestr("notlar.txt", "\n".join(LOG))
    try:
        from google.colab import files; files.download(zp)
    except Exception: pass
