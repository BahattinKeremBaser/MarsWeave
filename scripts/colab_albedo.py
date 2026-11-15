# -*- coding: utf-8 -*-
"""
MARSWEAVE - surface brightness (albedo-like) fetcher for Colab.
Colab cell 1:   !pip -q install rasterio pyproj requests numpy
Colab cell 2:   paste this whole file, run. It downloads marsweave_albedo.zip.

Source: USGS Astrogeology, Mars Viking MDIM 2.1 colorized global mosaic, 232 m/px (a real global image, so it
covers the whole 16 km window). Reads only the study window with HTTP range requests (the file is 12 GB, nothing
is downloaded in full). Band 1 is used. The value is IMAGE BRIGHTNESS (0-255 digital number), NOT calibrated albedo,
and the resolution is ~232 m, not HiRISE. The app must label it that way.
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



def task_albedo():
    url = "https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif"
    a, info = read_study_window("/vsicurl/" + url, valid=(1, 254))
    cov = float(np.isfinite(a).mean()); lo, hi = float(np.nanmin(a)), float(np.nanmax(a))
    log(f"coverage {cov:.0%}, range {lo:.0f}..{hi:.0f}")
    if cov < 0.6 or hi - lo < 3: raise RuntimeError("window empty or flat; not written")
    d = prov(url, "USGS Astrogeology Science Center, Mars Viking MDIM 2.1 Colorized Global Mosaic 232m (Archinal et al. 2006)", "Public Domain (USGS/NASA)")
    d.update({"unit": "Viking MDIM2.1 band 1 digital number (image brightness, not calibrated albedo)", "rawMin": lo, "rawMax": hi,
              "cols": a.shape[1], "rows": a.shape[0], "windowCoverage": round(cov, 3), **window_tag(), **info, "values": grid_json(a)})
    write("viking_brightness", d)


if __name__ == "__main__":
    try:
        task_albedo()
    except Exception as e:
        log("FAILED:", type(e).__name__, e); log(traceback.format_exc())
    zp = "/content/marsweave_albedo.zip" if os.path.isdir("/content") else "marsweave_albedo.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in os.listdir(OUT): z.write(os.path.join(OUT, fn), fn)
        z.writestr("notlar.txt", "\n".join(LOG))
    try:
        from google.colab import files; files.download(zp)
    except Exception: pass
