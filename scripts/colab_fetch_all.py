# -*- coding: utf-8 -*-
"""
MARSWEAVE - Google Colab real-data fetcher.

Usage in Colab:  cell 1:  !pip -q install rasterio pyproj netCDF4 spiceypy requests numpy
                 cell 2:  paste this whole file and run it. At the end it downloads marsweave_real_data.zip.

HONESTY RULES (same as the app):
  * Nothing is invented. If a source cannot be reached or fails a sanity check, that product is SKIPPED and the
    reason is written to notlar.txt. A missing file is correct; a wrong file is not.
  * Every JSON carries source / citation / license / retrievedUtc (the app rejects files without them).
  * This script has NOT been run by its author (no network there). URLs are discovered at run time and every
    step prints what it found, so you can fix a URL in the CONFIG block below and re-run just that step.
"""
import os, re, io, sys, json, math, time, shutil, statistics, zipfile, datetime, traceback, urllib.parse
import numpy as np
import requests

# ============================================================ CONFIG (edit if a step says "set ... URL")
LAT, LON_E = 39.30, 188.60          # Arcadia Planitia study site (planetocentric N, east longitude)
HALF_KM = 9.0                        # half-width of the study window (DEM is 16 km wide)
GRID = 64                            # output grid size for raster products
MARS_YEAR = 34                       # dust climatology year (MY34 = 2018 global storm)
ELEVATION_M = -3800.0                # site elevation (from the DEM) for the pressure scaling of dust tau
VIS_SCALE = 2.6                      # 9.3 um -> visible tau scale (ASSUMPTION, flagged in the JSON)
SCALE_HEIGHT_KM = 10.8
OUT = "/content/real" if os.path.isdir("/content") else "./real"
OVERRIDE = {                         # paste a direct URL here to force a source, e.g. "swim_ice": "https://.../x.tif"
    "dust_nc": None, "themis_ti": None, "hirise_jp2": None, "swim_ice": None, "crism_hydration": None,
}
# ==============================================================================================================
os.makedirs(OUT, exist_ok=True)
LOG = []
NOW = lambda: datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s)
    LOG.append(s)


def write(pid, d):
    path = os.path.join(OUT, pid + ".json")
    with open(path, "w") as f:
        json.dump(d, f, allow_nan=False)
    log(f"  -> wrote {pid}.json ({os.path.getsize(path)//1024} kB)")


def prov(source, citation, license_):
    return {"source": source, "citation": citation, "license": license_, "retrievedUtc": NOW()}


def get(url, **kw):
    kw.setdefault("timeout", 60)
    kw.setdefault("headers", {"User-Agent": "marsweave-colab/1.0"})
    r = requests.get(url, **kw)
    r.raise_for_status()
    return r


def links(page_url, pattern):
    """All hrefs on a page matching a regex (absolute URLs)."""
    html = get(page_url).text
    out = []
    for h in re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I):
        u = urllib.parse.urljoin(page_url, h)
        if re.search(pattern, u, flags=re.I):
            out.append(u)
    return list(dict.fromkeys(out))


def step(name):
    def deco(fn):
        def run():
            log(f"\n===== {name} =====")
            try:
                fn()
            except SystemExit as e:
                log(f"  SKIPPED: {e}")
            except Exception as e:
                log(f"  FAILED: {type(e).__name__}: {e}")
                LOG.append(traceback.format_exc())
        return run
    return deco


# ---------------------------------------------------------------------------------------------- raster helpers
def read_window(path, band=1):
    """Read a ~2*HALF_KM square around the site from a (remote) raster. Returns (array float64 with NaN, info)."""
    import rasterio
    from rasterio.windows import Window
    from pyproj import CRS, Transformer
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2",
                      CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.tiff,.cub,.jp2,.JP2,.img"):
        with rasterio.open(path) as ds:
            if ds.crs is None:
                raise SystemExit("raster has no CRS, cannot place the window")
            crs = CRS.from_wkt(ds.crs.to_wkt())
            R = crs.ellipsoid.semi_major_metre if crs.ellipsoid else 3396190.0
            tr = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
            dlat = math.degrees(HALF_KM * 1000.0 / R)
            dlon = dlat / math.cos(math.radians(LAT))
            left, bottom, right, top = ds.bounds
            for lon in (LON_E, LON_E - 360.0):
                pts = [tr.transform(lon + sx * dlon, LAT + sy * dlat) for sx in (-1, 1) for sy in (-1, 1)]
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                if min(xs) >= left and max(xs) <= right and min(ys) >= bottom and max(ys) <= top:
                    break
            else:
                raise SystemExit(f"site is not inside this raster (bounds {ds.bounds})")
            rx, ry = abs(ds.res[0]), abs(ds.res[1])
            c0, c1 = int((min(xs) - left) / rx), int(math.ceil((max(xs) - left) / rx))
            r0, r1 = int((top - max(ys)) / ry), int(math.ceil((top - min(ys)) / ry))
            if (r1 - r0) * (c1 - c0) > 60_000_000 or r1 <= r0 or c1 <= c0:
                raise SystemExit(f"refusing to read {r1-r0}x{c1-c0} px (geometry looks wrong)")
            log(f"  raster {ds.width}x{ds.height}px res {rx:.1f} m, window rows {r0}:{r1} cols {c0}:{c1}")
            data = ds.read(band, window=Window(c0, r0, c1 - c0, r1 - r0)).astype("float64")
            nodata = ds.nodata
            info = {"pixelMeters": round(rx, 2), "windowPx": [r1 - r0, c1 - c0], "dtype": str(ds.dtypes[band - 1])}
    if nodata is not None:
        data[data == nodata] = np.nan
    data[~np.isfinite(data)] = np.nan
    return data, info


def block_mean(a, n):
    out = np.full((n, n), np.nan)
    rs = np.linspace(0, a.shape[0], n + 1).astype(int)
    cs = np.linspace(0, a.shape[1], n + 1).astype(int)
    for i in range(n):
        for j in range(n):
            blk = a[rs[i]:max(rs[i + 1], rs[i] + 1), cs[j]:max(cs[j + 1], cs[j] + 1)]
            if np.isfinite(blk).any():
                out[i, j] = np.nanmean(blk)
    return out


def grid_json(grid):
    return [[(None if not np.isfinite(v) else round(float(v), 4)) for v in row] for row in grid]


def coverage(a):
    return float(np.isfinite(a).mean())


# ------------------------------------------------------------------------------------------------------- 1 DEM note
def tau_site_factor():
    return math.exp(-(ELEVATION_M / 1000.0) / SCALE_HEIGHT_KM)


# ----------------------------------------------------------------------------------------------------- dust (LMD)
@step("1/8 dust_tau  (LMD dust climatology, MY%d)" % MARS_YEAR)
def run_dust():
    from netCDF4 import Dataset
    page = "https://www-mars.lmd.jussieu.fr/mars/dust_climatology/"
    url = OVERRIDE["dust_nc"]
    if not url:
        ncs = links(page, r"\.nc$")
        log("  .nc links found on the LMD page:", len(ncs))
        for u in ncs[:40]:
            log("   ", u)
        mine = [u for u in ncs if re.search(r"MY ?0?%d(?!\d)" % MARS_YEAR, u, flags=re.I)]
        if not mine:
            raise SystemExit(f"no MY{MARS_YEAR} .nc link found; copy one from the list above into OVERRIDE['dust_nc']")
        url = mine[0]
    log("  downloading", url)
    path = "/tmp/dust.nc"
    with get(url, stream=True, timeout=300) as r, open(path, "wb") as f:
        shutil.copyfileobj(r.raw, f)
    ds = Dataset(path)
    for n, v in ds.variables.items():
        log(f"   var {n} dims={v.dimensions} units={getattr(v,'units','')} long_name={getattr(v,'long_name','')}")
    names = list(ds.variables)
    var = next((n for n in names if len(ds.variables[n].dimensions) >= 3 and re.search(r"cdod|dust|tau|opac", n, re.I)), None)
    if not var:
        raise SystemExit("no optical-depth variable found; see the variable list above")
    lat_n = next(n for n in names if n.lower() in ("latitude", "lat", "lats"))
    lon_n = next(n for n in names if n.lower() in ("longitude", "lon", "lons"))
    lats = np.array(ds.variables[lat_n][:], float)
    lons = np.array(ds.variables[lon_n][:], float)
    lon_t = LON_E if lons.max() > 180 else ((LON_E + 180) % 360) - 180
    i, j = int(np.argmin(abs(lats - LAT))), int(np.argmin(abs(lons - lon_t)))
    v = ds.variables[var]
    arr = np.ma.filled(np.ma.masked_invalid(v[:]), np.nan).astype(float)
    dims = v.dimensions
    sl = [slice(None)] * arr.ndim
    sl[dims.index(lat_n)], sl[dims.index(lon_n)] = i, j
    series = arr[tuple(sl)]
    while series.ndim > 1:
        series = np.nanmean(series, axis=-1)
    ls = None
    for n in names:
        if n.lower() in ("ls", "solar_longitude", "areocentric_longitude"):
            ls = np.array(ds.variables[n][:], float)
    good = [(k, float(x)) for k, x in enumerate(series) if np.isfinite(x) and 0 < x < 10]
    log(f"  variable '{var}' at lat={lats[i]:.2f} lon={lons[j]:.2f}: {len(good)}/{len(series)} valid days")
    if len(good) < 5:
        raise SystemExit("fewer than 5 valid days at the site")
    med = statistics.median(x for _, x in good)
    log(f"  median raw value {med:.3f}, max {max(x for _, x in good):.3f}")
    if not (0.02 <= med <= 2.5):
        raise SystemExit(f"median {med:.2f} is outside the physical range 0.02-2.5 for 9.3 um column dust optical depth "
                         "(this is what went wrong in the earlier hand-made file). Wrong variable or units - NOT written.")
    ratio = tau_site_factor()
    pts = [{"sol": k, "ls": (round(float(ls[k]), 1) if ls is not None and k < len(ls) else None),
            "tau93At610Pa": round(x, 4), "tauVisSurface": round(x * ratio * VIS_SCALE, 4)} for k, x in good]
    vis = [p["tauVisSurface"] for p in pts]
    d = prov(url, "Montabone, L., et al. (2015), Icarus 251, 65-95; Montabone, L., et al. (2020), JGR Planets 125, e2019JE006111",
             "CC BY-SA 3.0 (LMD)")
    d.update({"marsYear": MARS_YEAR, "lat": float(lats[i]), "lonEast": float(lons[j]), "variable": var,
              "valueMeaning": "tauVisSurface = tau(9.3um, 610 Pa) x surface-pressure ratio x VIS_SCALE",
              "assumptions": {"visScale": VIS_SCALE, "pressureRatio": round(ratio, 3), "elevationM": ELEVATION_M,
                              "note": "vis scale and pressure scaling are ASSUMPTIONS"},
              "tauTypical": round(statistics.median(vis), 3), "tauMax": round(max(vis), 3), "series": pts[:800]})
    write("dust_tau", d)


# ------------------------------------------------------------------------------------------------------ THEMIS TI
@step("2/8 themis_ti  (USGS THEMIS quantitative thermal inertia, tiu)")
def run_themis():
    base = ("http://astropedia.astrogeology.usgs.gov/download/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/"
            "Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_{t}_100mpp.cub")
    cands = [OVERRIDE["themis_ti"]] if OVERRIDE["themis_ti"] else \
        [base.format(t=f"{la}{lo:03d}E") for la in ("30N", "30S", "00N", "60N") for lo in (0, 60, 120, 180, 240, 300)]
    for u in cands:
        try:
            log("  trying", u)
            data, info = read_window("/vsicurl/" + u)
        except SystemExit as e:
            log("   ", e); continue
        except Exception as e:
            log("    cannot open:", str(e)[:120]); continue
        cov = coverage(data)
        valid = data[np.isfinite(data) & (data > 5) & (data < 1500)]
        log(f"   coverage {cov:.0%}, value range {np.nanmin(data):.1f}..{np.nanmax(data):.1f}, valid-tiu pixels {valid.size}")
        if valid.size < 0.6 * data.size:
            log("    less than 60% plausible tiu values (5..1500) - not this tile"); continue
        data[(data <= 5) | (data >= 1500)] = np.nan
        d = prov(u, "Fergason, R. L., Christensen, P. R., & Kieffer, H. H. (2006), JGR 111, E12004; Edwards et al. (2011), JGR 116, E10008",
                 "Public Domain (NASA/USGS/ASU)")
        d.update({"unit": "tiu (J m-2 K-1 s-0.5)", "cols": GRID, "rows": GRID, "windowCoverage": round(coverage(data), 3),
                  "center": {"lat": LAT, "lonEast": LON_E, "halfKm": HALF_KM}, **info,
                  "values": grid_json(block_mean(data, GRID))})
        write("themis_ti", d); return
    raise SystemExit("no tile contained the site with plausible tiu values; find the tile on https://astrogeology.usgs.gov and set OVERRIDE['themis_ti']")


# ------------------------------------------------------------------------------------------------------- HiRISE
def ode_urls(iid, pt, extra=None):
    q = {"query": "", "target": "mars", "results": "v", "output": "JSON", "ihid": "MRO", "iid": iid, "pt": pt,
         "minlat": LAT - 0.1, "maxlat": LAT + 0.1, "westernlon": LON_E - 0.2, "easternlon": LON_E + 0.2, "limit": 50}
    if extra:
        q.update(extra)
    url = "https://oderest.rsl.wustl.edu/live2/?" + urllib.parse.urlencode(q).replace("query=&", "query&")
    log("  ODE query:", url)
    js = get(url, timeout=120).json()
    found = []
    def walk(o):
        if isinstance(o, dict):
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
        elif isinstance(o, str) and o.startswith("http"):
            found.append(o)
    walk(js)
    return list(dict.fromkeys(found))


@step("3/8 hirise_albedo  (HiRISE RDR RED image covering the site)")
def run_hirise():
    urls = [OVERRIDE["hirise_jp2"]] if OVERRIDE["hirise_jp2"] else \
        [u for u in ode_urls("HIRISE", "RDRV11") if re.search(r"_RED.*\.JP2$", u, re.I)]
    log("  candidate JP2 files:", len(urls))
    for u in urls[:6]:
        log("   ", u)
    for u in urls[:6]:
        try:
            data, info = read_window("/vsicurl/" + u)
        except SystemExit as e:
            log("   ", e); continue
        except Exception as e:
            log("    cannot read:", str(e)[:120]); continue
        data[data <= 0] = np.nan                       # 0 = no-data/edge in HiRISE RDR
        cov = coverage(data)
        log(f"   coverage {cov:.0%}")
        if cov < 0.6:
            continue
        p99 = float(np.nanpercentile(data, 99))
        rel = np.clip(data / p99, 0, 1.2)
        d = prov(u, "McEwen, A. S., et al. (2007), JGR 112, E05S02 (HiRISE)", "Public Domain (NASA/JPL/UArizona)")
        d.update({"unit": "relative reflectance (HiRISE RDR DN / 99th percentile; NOT absolute I/F)", "dn99": p99,
                  "cols": GRID, "rows": GRID, "windowCoverage": round(cov, 3),
                  "center": {"lat": LAT, "lonEast": LON_E, "halfKm": HALF_KM}, **info,
                  "values": grid_json(block_mean(rel, GRID))})
        write("hirise_albedo", d); return
    raise SystemExit("no HiRISE RED JP2 covering the site could be read; pick an observation ID on https://www.uahirise.org and set OVERRIDE['hirise_jp2']")


# --------------------------------------------------------------------------------------------------------- SWIM
@step("4/8 swim_ice  (SWIM2 ice-consistency GeoTIFF, swim.psi.edu)")
def run_swim():
    u = OVERRIDE["swim_ice"]
    if not u:
        for page in ("https://swim.psi.edu/", "https://swim.psi.edu/data/", "https://swim.psi.edu/products/"):
            try:
                tifs = links(page, r"\.tiff?$")
            except Exception as e:
                log("  page failed", page, str(e)[:80]); continue
            log(f"  {page}: {len(tifs)} .tif links")
            for t in tifs[:30]: log("   ", t)
            pick = [t for t in tifs if re.search(r"consisten|composite|swim", t, re.I)]
            if pick:
                u = pick[0]; break
        if not u:
            raise SystemExit("no GeoTIFF link found automatically; open https://swim.psi.edu, copy a composite ice-consistency .tif link into OVERRIDE['swim_ice']")
    log("  using", u)
    data, info = read_window("/vsicurl/" + u if u.startswith("http") else u)
    cov = coverage(data)
    log(f"  coverage {cov:.0%}, range {np.nanmin(data):.3f}..{np.nanmax(data):.3f}")
    if cov < 0.6:
        raise SystemExit("less than 60% of the window has data in this raster")
    lo, hi = float(np.nanmin(data)), float(np.nanmax(data))
    if lo < 0 and hi <= 1.0001:
        scaled, how = (data + 1) / 2 * 100, "(consistency+1)/2*100  (-1..1 -> 0..100)"
    elif hi <= 1.0001:
        scaled, how = data * 100, "consistency*100 (0..1 -> 0..100)"
    else:
        scaled, how = np.clip(data, 0, 100), "clipped to 0..100 (already percent)"
    d = prov(u, "Morgan, G. A., Putzig, N. E., et al. (2021), Nature Astronomy 5, 230-236; SWIM project, swim.psi.edu", "Public Domain (NASA/PSI SWIM)")
    d.update({"unit": "ice consistency, rescaled 0..100", "rescale": how, "rawMin": lo, "rawMax": hi, "cols": GRID, "rows": GRID,
              "windowCoverage": round(cov, 3), **info, "values": grid_json(block_mean(scaled, GRID))})
    write("swim_ice", d)


# --------------------------------------------------------------------------------------------------------- CRISM
@step("5/8 crism_hydration  (CRISM MRDR summary parameter)")
def run_crism():
    u = OVERRIDE["crism_hydration"]
    if not u:
        c = [x for x in ode_urls("CRISM", "MRRDE") + ode_urls("CRISM", "MRDR")
             if re.search(r"\.(img|tif|lbl)$", x, re.I)]
        log("  CRISM candidates:", len(c))
        for x in c[:20]: log("   ", x)
        raise SystemExit("CRISM MRDR tiles are large and need the right tile + band (e.g. BD1900); open https://ode.rsl.wustl.edu/mars, "
                         "find the MRDR tile for the site, convert to GeoTIFF and set OVERRIDE['crism_hydration']")
    data, info = read_window(u)
    cov = coverage(data)
    if cov < 0.6:
        raise SystemExit("less than 60% valid data in the window")
    d = prov(u, "Viviano-Beck, C. E., et al. (2014), JGR Planets 119, 1403-1431; Seelos et al. (2016), CRISM MRDR", "Public Domain (NASA PDS)")
    d.update({"unit": "summary-parameter value (band depth, unitless)", "cols": GRID, "rows": GRID, "windowCoverage": round(cov, 3),
              **info, "values": grid_json(block_mean(data, GRID))})
    write("crism_hydration", d)


# ----------------------------------------------------------------------------------------------------------- RAD
@step("6/8 rad  (published MSL RAD value, Gale reference)")
def run_rad():
    # No download: this is a published, peer-reviewed number. It is stored as such, not as an archive product.
    d = prov("Hassler et al. (2014), Science 343, 1244797 (MSL RAD, Gale Crater, first ~300 sols)",
             "Hassler, D. M., et al. (2014), Science 343(6169), 1244797, doi:10.1126/science.1244797",
             "published literature value")
    d.update({"kind": "published_literature", "doseEquivMicroSvPerH": 26.67, "doseEquivMilliSvPerDay": 0.64,
              "scopeNote": "GALE REFERENCE, PUBLISHED VALUE - not measured at Arcadia"})
    write("rad", d)


# ----------------------------------------------------------------------------------------------------------- MEDA
@step("7/8 meda  (Mars 2020 MEDA derived environment CSV, Jezero reference)")
def run_meda():
    import csv
    root = "https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/"
    dirs = [x for x in links(root, r"data_derived_env/?$")] or [root + "data_derived_env/"]
    log("  looking in", dirs[0])
    sub = links(dirs[0], r"/sol_\d+[_-]\d+/?$") or links(dirs[0], r"sol_")
    log("  sol folders:", len(sub))
    csvs = []
    for s in sub[:3]:
        csvs += links(s, r"\.csv$")
    csvs = [c for c in csvs if re.search(r"derived|env|DER", c, re.I)][:8]
    log("  csv files:", len(csvs))
    T, P, W = [], [], []
    for c in csvs:
        log("   reading", c)
        txt = get(c, timeout=300).text
        rd = csv.DictReader(io.StringIO(txt))
        cols = rd.fieldnames or []
        tc = next((x for x in cols if re.search(r"air.*temp|ground_temp|^temp", x, re.I)), None)
        pc = next((x for x in cols if re.search(r"pressure", x, re.I)), None)
        wc = next((x for x in cols if re.search(r"wind.*speed|horizontal_wind", x, re.I)), None)
        log("    columns used:", tc, pc, wc, "of", cols[:12])
        for row in rd:
            for lst, col in ((T, tc), (P, pc), (W, wc)):
                try:
                    v = float(row[col])
                    if np.isfinite(v): lst.append(v)
                except Exception:
                    pass
    if min(len(T), len(P), len(W)) < 100:
        raise SystemExit(f"not enough samples (T={len(T)}, P={len(P)}, W={len(W)}); check the column names printed above")
    Tm, Pm, Wm = float(np.mean(T)), float(np.mean(P)), float(np.mean(W))
    if not (120 < Tm < 330 and 300 < Pm < 1200 and 0 <= Wm < 40):
        raise SystemExit(f"values outside Mars range (T={Tm:.0f} K, P={Pm:.0f} Pa, wind={Wm:.1f} m/s) - wrong columns/units; NOT written")
    d = prov(root, "Rodriguez-Manfredi, J. A., et al. (2023), Nature Geoscience 16, 19-28 (Mars 2020 MEDA, Jezero)", "Public Domain (NASA PDS Atmospheres)")
    d.update({"meanTempK": round(Tm, 1), "meanPressurePa": round(Pm, 1), "meanWindMs": round(Wm, 2),
              "minTempK": round(float(np.min(T)), 1), "maxTempK": round(float(np.max(T)), 1),
              "samples": {"temperature": len(T), "pressure": len(P), "wind": len(W)}, "files": csvs,
              "scopeNote": "JEZERO REFERENCE - not measured at Arcadia"})
    write("meda", d)


# --------------------------------------------------------------------------------------------------------- SPICE
@step("8/8 relay_passes  (SPICE: MRO passes over the site)")
def run_relay():
    import spiceypy as sp
    kd = "/tmp/kernels"; os.makedirs(kd, exist_ok=True)
    def dl(url):
        p = os.path.join(kd, url.split("/")[-1])
        if not os.path.exists(p):
            log("  downloading", url)
            with get(url, stream=True, timeout=600) as r, open(p, "wb") as f:
                shutil.copyfileobj(r.raw, f)
        return p
    naif = "https://naif.jpl.nasa.gov/pub/naif/"
    lsk = dl(naif + "generic_kernels/lsk/naif0012.tls")
    pck = dl(naif + "generic_kernels/pck/pck00010.tpc")
    mar = dl(naif + "generic_kernels/spk/satellites/mar097.bsp")
    spks = links(naif + "MRO/kernels/spk/", r"mro_.*\.bsp$")
    spks = [s for s in spks if re.search(r"psp|rec|ssd", s, re.I)]
    log("  MRO spk files:", len(spks))
    if not spks:
        raise SystemExit("no MRO SPK file listed")
    spk = dl(spks[len(spks) // 2])
    for k in (lsk, pck, mar, spk):
        sp.furnsh(k)
    cov = sp.spkcov(spk, -74)
    s0, e0 = cov[0], cov[1]
    t0 = (s0 + e0) / 2.0
    sol = 88775.244
    n = int(sol // 20)
    R = sp.bodvrd("MARS", "RADII", 3)[1]
    site = np.array(sp.georec(math.radians(LON_E), math.radians(LAT), 0.0, R[0], (R[0] - R[2]) / R[0]))
    up = site / np.linalg.norm(site)
    vis, el = [], []
    for k in range(n):
        et = t0 + 20.0 * k
        pos, _ = sp.spkpos("-74", et, "IAU_MARS", "NONE", "MARS")
        v = np.array(pos) - site
        e = math.degrees(math.asin(np.dot(v, up) / np.linalg.norm(v)))
        el.append(e); vis.append(e >= 10.0)
    vis = np.array(vis)
    passes, i = [], 0
    while i < n:
        if vis[i]:
            j = i
            while j < n and vis[j]: j += 1
            passes.append({"orbiter": "MRO", "startMinutes": round(i * 20 / 60, 1), "durationMin": round((j - i) * 20 / 60, 1),
                           "maxElevationDeg": round(max(el[i:j]), 1)})
            i = j
        else:
            i += 1
    log(f"  {len(passes)} passes >=10 deg in one sol, coverage {vis.mean()*100:.1f}%")
    d = prov(naif + "MRO/kernels/spk/ (+ generic_kernels mar097.bsp, naif0012.tls, pck00010.tpc)",
             "NAIF SPICE (Acton 1996); kernels: " + os.path.basename(spk), "Public Domain (NASA/JPL NAIF)")
    d.update({"orbiter": "MRO only (MAVEN and TGO not included)", "epochEtMid": float(t0), "minElevationDeg": 10.0,
              "site": {"lat": LAT, "lonEast": LON_E}, "passes": passes, "coveragePct": round(float(vis.mean() * 100), 1),
              "note": "geometric visibility only (no terrain masking, no link budget)"})
    write("relay_passes", d)


if __name__ == "__main__":
    for fn in (run_dust, run_themis, run_hirise, run_swim, run_crism, run_rad, run_meda, run_relay):
        fn()
    ok = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".json"))
    log("\n===== SUMMARY =====")
    log("written:", ok)
    log("not written:", sorted(set(["dust_tau", "themis_ti", "hirise_albedo", "swim_ice", "crism_hydration", "rad", "meda", "relay_passes"]) - set(ok)))
    with open(os.path.join(OUT, "notlar.txt"), "w") as f:
        f.write("\n".join(LOG))
    zp = "/content/marsweave_real_data.zip" if os.path.isdir("/content") else "marsweave_real_data.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for fn in os.listdir(OUT):
            z.write(os.path.join(OUT, fn), fn)
    log("zip:", zp)
    try:
        from google.colab import files
        files.download(zp)
    except Exception:
        pass
