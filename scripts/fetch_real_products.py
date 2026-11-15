#!/usr/bin/env python3
"""
MARSWEAVE — build data/real/*.json from REAL NASA / USGS / LMD / NAIF products.

Run this on a machine that can reach the archives (the MARSWEAVE build sandbox cannot). Every output carries
source, citation, licence and retrieval time; the app refuses a file that lacks them (see data/realProducts.ts).
A product only becomes "REAL" in the app when its JSON is present and valid. Nothing here invents data.

  pip install numpy rasterio pyproj netCDF4 spiceypy      # install only what the sub-command you use needs

Sub-commands
  dust    LMD/MCD column dust optical depth (NetCDF)  -> data/real/dust_tau.json
  raster  window of a GeoTIFF/JP2 over the study area -> data/real/<product>.json
            product = themis_ti | hirise_albedo | swim_ice | crism_hydration
  table   mean of a column of a PDS ASCII/CSV table   -> data/real/rad.json  or  data/real/meda.json
  relay   orbiter passes from NAIF SPICE kernels      -> data/real/relay_passes.json
  selftest  pure-python checks (no network, no optional packages)

Study site: Arcadia Planitia 39.30 N, 171.40 W (= 188.60 E), 16 km window. Longitude arguments are WEST-positive
unless stated. See docs/REAL_DATA_HOWTO.md for where to download each input and what is and is not verified.
"""
import argparse
import csv
import json
import math
import os
import statistics
import sys
from datetime import datetime, timezone

LAT, LON_W = 39.30, 171.40
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "real")
MARS_R_M = 3396190.0
# ASSUMPTIONS (flagged in the JSON and in the app): conversion of the 9.3 um absorption optical depth to a visible
# extinction optical depth, and the atmospheric scale height used to move from the 610 Pa reference to the surface.
DEFAULT_VIS_SCALE = 2.6
SCALE_HEIGHT_KM = 10.8
REF_PRESSURE_PA = 610.0


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write(product, obj):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.normpath(os.path.join(OUT_DIR, product + ".json"))
    obj = dict(obj)
    obj["product"] = product
    obj["retrievedUtc"] = now()
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"Wrote {path}")


def need_provenance(a):
    if not (a.source_name and a.citation and a.license):
        sys.exit("--source-name, --citation and --license are required: the data must stay attributable.")


def surface_pressure_ratio(elevation_m):
    """Surface pressure / 610 Pa for a given elevation (isothermal-atmosphere ASSUMPTION)."""
    return math.exp(-(elevation_m / 1000.0) / SCALE_HEIGHT_KM)


# ------------------------------------------------------------------------------------------------------------- dust
def nearest_index(values, target):
    best, bi = None, 0
    for i, v in enumerate(values):
        d = abs(v - target)
        if best is None or d < best:
            best, bi = d, i
    return bi


def run_dust(a):
    try:
        from netCDF4 import Dataset
        import numpy as np
    except ImportError:
        sys.exit("dust needs: pip install netCDF4 numpy")
    need_provenance(a)
    ds = Dataset(a.file)
    names = list(ds.variables)
    print("Variables in file:", names)

    def pick(cands, what):
        for n in names:
            if n.lower() in cands:
                return n
        sys.exit(f"Could not find the {what} variable among {names}. Pass --{what}-var explicitly.")

    var = a.var or next((n for n in names if len(ds.variables[n].dimensions) >= 3 and any(k in n.lower() for k in ("cdod", "dust", "tau", "opacity"))), None)
    if not var:
        sys.exit(f"Could not find the optical depth variable among {names}. Pass --var.")
    lat_n = a.lat_var or pick({"latitude", "lat", "lats"}, "lat")
    lon_n = a.lon_var or pick({"longitude", "lon", "lons"}, "lon")
    lats = np.array(ds.variables[lat_n][:], dtype=float)
    lons = np.array(ds.variables[lon_n][:], dtype=float)
    lon_east = (-a.lon_west) % 360.0
    if lons.min() < 0:  # file uses -180..180
        lon_east = ((lon_east + 180) % 360) - 180
    i = nearest_index(lats, a.lat)
    j = nearest_index(lons, lon_east)
    v = ds.variables[var]
    dims = v.dimensions
    print(f"Using variable '{var}' dims={dims}; nearest cell lat={lats[i]:.2f} lon={lons[j]:.2f}")
    arr = np.ma.filled(np.ma.masked_invalid(v[:]), np.nan).astype(float)
    t_axis = next(k for k, d in enumerate(dims) if d not in (lat_n, lon_n))
    lat_axis, lon_axis = dims.index(lat_n), dims.index(lon_n)
    sl = [slice(None)] * arr.ndim
    sl[lat_axis], sl[lon_axis] = i, j
    series = arr[tuple(sl)]
    # remaining axes: keep the first as time, average any extra
    while series.ndim > 1:
        series = np.nanmean(series, axis=-1)
    ls = None
    for n in names:
        if n.lower() in ("ls", "solar_longitude", "areocentric_longitude"):
            ls = np.array(ds.variables[n][:], dtype=float)
    good = [(k, float(x)) for k, x in enumerate(series) if np.isfinite(x) and x > 0]
    if len(good) < 5:
        sys.exit("Fewer than 5 valid daily values at this site; choose another year/file or point.")
    ratio = a.pressure_ratio if a.pressure_ratio else surface_pressure_ratio(a.elevation_m)
    pts = []
    for k, x in good:
        pts.append({"sol": k, "ls": (round(float(ls[k]), 1) if ls is not None and k < len(ls) else None),
                    "tau93At610Pa": round(x, 4), "tauVisSurface": round(x * ratio * a.vis_scale, 4)})
    vis = [p["tauVisSurface"] for p in pts]
    write("dust_tau", {
        "source": a.source_name, "citation": a.citation, "license": a.license,
        "marsYear": a.my, "lat": float(lats[i]), "lonEast": float(lons[j]),
        "valueMeaning": "tauVisSurface = tau(9.3 um, 610 Pa) x surface-pressure ratio x vis scale",
        "assumptions": {"visScale": a.vis_scale, "pressureRatio": round(ratio, 3), "scaleHeightKm": SCALE_HEIGHT_KM,
                        "note": "vis scale and pressure scaling are ASSUMPTIONS, flagged in the app"},
        "tauTypical": round(statistics.median(vis), 3), "tauMax": round(max(vis), 3),
        "series": pts[:800],
    })


# ------------------------------------------------------------------------------------------------------- raster
def run_raster(a):
    try:
        import numpy as np
        import rasterio
        from rasterio.windows import Window
        from pyproj import CRS, Transformer
    except ImportError:
        sys.exit("raster needs: pip install rasterio pyproj numpy")
    need_provenance(a)
    src = a.file or a.url
    if not src:
        sys.exit("Give --file (local) or --url (remote GeoTIFF/COG).")
    path = src if a.file else "/vsicurl/" + src
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2"):
        with rasterio.open(path) as ds:
            if ds.crs is None:
                sys.exit("Raster has no CRS; cannot place the window.")
            crs = CRS.from_wkt(ds.crs.to_wkt())
            R = crs.ellipsoid.semi_major_metre if crs.ellipsoid else MARS_R_M
            tr = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
            dlat = math.degrees(a.half_km * 1000.0 / R)
            dlon = dlat / math.cos(math.radians(a.lat))
            lon_e = (-a.lon_west) % 360.0
            if ds.bounds.left < 0 or crs.is_geographic and ds.bounds.left < -1:
                lon_e = ((lon_e + 180) % 360) - 180
            corners = [(lon_e + sx * dlon, a.lat + sy * dlat) for sx in (-1, 1) for sy in (-1, 1)]
            xy = [tr.transform(x, y) for x, y in corners]
            xs, ys = [p[0] for p in xy], [p[1] for p in xy]
            left, bottom, right, top = ds.bounds
            wl, wr, wb, wt = max(min(xs), left), min(max(xs), right), max(min(ys), bottom), min(max(ys), top)
            if wl >= wr or wb >= wt:
                sys.exit("The study window is outside this raster. Pick the tile/observation that covers 39.3N 171.4W.")
            rx, ry = abs(ds.res[0]), abs(ds.res[1])
            col0, col1 = int((wl - left) / rx), int(math.ceil((wr - left) / rx))
            row0, row1 = int((top - wt) / ry), int(math.ceil((top - wb) / ry))
            if (row1 - row0) * (col1 - col0) > 40_000_000 or row1 <= row0 or col1 <= col0:
                sys.exit(f"Refusing to read {(row1-row0)}x{(col1-col0)} px; geometry looks wrong.")
            print(f"Raster {ds.width}x{ds.height}px CRS={ds.crs}; window rows {row0}:{row1} cols {col0}:{col1}")
            data = ds.read(a.band, window=Window(col0, row0, col1 - col0, row1 - row0)).astype("float64")
            nodata = ds.nodata
    if nodata is not None:
        data[data == nodata] = np.nan
    if a.valid_min is not None:
        data[data < a.valid_min] = np.nan
    if a.valid_max is not None:
        data[data > a.valid_max] = np.nan
    cover = 1.0 - float(np.isnan(data).mean())
    print(f"Valid-data coverage of the window: {cover:.0%}")
    if cover < 0.6:
        sys.exit("Less than 60 % of the window has data in this product; the app would reject it. Try another tile/observation.")
    grid = block_mean(data, a.size, a.size)
    if a.product == "swim_ice":
        vmin = 0.0 if a.vmin is None else a.vmin
        vmax = float(np.nanmax(grid)) if a.vmax is None else a.vmax
        grid = np.clip((grid - vmin) / max(1e-9, vmax - vmin) * 100.0, 0, 100)
        print(f"SWIM values rescaled linearly {vmin}..{vmax:g} -> 0..100 (documented in the JSON).")
    write(a.product, {
        "source": a.source_name, "citation": a.citation, "license": a.license, "fileUrl": a.url or a.file,
        "unit": a.unit, "cols": a.size, "rows": a.size, "windowCoverage": round(cover, 3),
        "nativePixelMeters": round(float(rx), 2),
        "rescale": ({"vmin": vmin, "vmax": vmax, "to": "0..100"} if a.product == "swim_ice" else None),
        "values": [[(None if not np.isfinite(v) else round(float(v), 4)) for v in row] for row in grid],
    })


def block_mean(arr, rows, cols):
    import numpy as np
    h, w = arr.shape
    ri = np.linspace(0, h, rows + 1).astype(int)
    ci = np.linspace(0, w, cols + 1).astype(int)
    out = np.full((rows, cols), np.nan)
    for r in range(rows):
        for c in range(cols):
            blk = arr[ri[r]:max(ri[r + 1], ri[r] + 1), ci[c]:max(ci[c + 1], ci[c] + 1)]
            if np.isfinite(blk).any():
                out[r, c] = np.nanmean(blk)
    return out


# --------------------------------------------------------------------------------------------------------- tables
def read_table(path):
    with open(path, newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t ")
        except csv.Error:
            dialect = csv.excel
        rows = list(csv.reader(f, dialect))
    rows = [[c.strip().strip('"') for c in r if c.strip() != ""] for r in rows if r]
    return rows


def column_values(rows, name):
    header = rows[0]
    if name not in header:
        sys.exit(f"Column '{name}' not found. Columns: {header}")
    k = header.index(name)
    out = []
    for r in rows[1:]:
        try:
            x = float(r[k])
        except (ValueError, IndexError):
            continue
        if math.isfinite(x):
            out.append(x)
    return out


def run_table(a):
    need_provenance(a)
    rows = read_table(a.file)
    if a.product == "rad":
        vals = column_values(rows, a.column)
        if len(vals) < 3:
            sys.exit("Fewer than 3 numeric values in that column.")
        mean = statistics.mean(vals) * a.factor
        print(f"{len(vals)} values; mean x factor = {mean:.2f} uSv/h")
        write("rad", {"source": a.source_name, "citation": a.citation, "license": a.license,
                      "doseEquivMicroSvPerH": round(mean, 2), "n": len(vals), "column": a.column, "factor": a.factor,
                      "scopeNote": "MSL RAD, GALE CRATER REFERENCE; NOT MEASURED AT ARCADIA"})
    else:
        t = column_values(rows, a.temp_col)
        p = column_values(rows, a.pressure_col)
        w = column_values(rows, a.wind_col)
        if min(len(t), len(p), len(w)) < 3:
            sys.exit("Fewer than 3 numeric values in a column.")
        write("meda", {"source": a.source_name, "citation": a.citation, "license": a.license,
                       "meanTempK": round(statistics.mean(t) * a.temp_factor + a.temp_offset, 2),
                       "minTempK": round(min(t) * a.temp_factor + a.temp_offset, 2),
                       "maxTempK": round(max(t) * a.temp_factor + a.temp_offset, 2),
                       "meanPressurePa": round(statistics.mean(p), 2), "meanWindMs": round(statistics.mean(w), 2),
                       "n": min(len(t), len(p), len(w)),
                       "scopeNote": "MARS 2020 MEDA, JEZERO REFERENCE; NOT MEASURED AT ARCADIA"})


# ---------------------------------------------------------------------------------------------------------- relay
def elevation_deg(site_xyz, sat_xyz):
    """Elevation angle of a satellite seen from a site on a sphere (both vectors from the planet centre, same frame)."""
    sx, sy, sz = site_xyz
    d = (sat_xyz[0] - sx, sat_xyz[1] - sy, sat_xyz[2] - sz)
    n = math.sqrt(sx * sx + sy * sy + sz * sz)
    dn = math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
    sin_el = (d[0] * sx + d[1] * sy + d[2] * sz) / (n * dn)
    return math.degrees(math.asin(max(-1.0, min(1.0, sin_el))))


def run_relay(a):
    try:
        import spiceypy as sp
    except ImportError:
        sys.exit("relay needs: pip install spiceypy (and the NAIF kernels listed in a meta-kernel)")
    need_provenance(a)
    sp.furnsh(a.meta_kernel)
    t0 = sp.str2et(a.start)
    step = a.step_s
    n = int(a.days * 86400 / step)
    radii = sp.bodvrd("MARS", "RADII", 3)[1]
    site = sp.georec(math.radians(-a.lon_west), math.radians(a.lat), 0.0, radii[0], (radii[0] - radii[2]) / radii[0])
    passes = []
    above_n = 0
    for sat in a.sats:
        cur = None
        for k in range(n + 1):
            et = t0 + k * step
            pos, _ = sp.spkpos(sat, et, "IAU_MARS", "NONE", "MARS")
            el = elevation_deg(tuple(site), tuple(pos))
            up = el >= a.min_elev
            if up:
                above_n += 1
            if up and cur is None:
                cur = {"sat": sat, "start": et, "max": el}
            elif up:
                cur["max"] = max(cur["max"], el)
            elif cur is not None:
                passes.append({"sat": sat, "startUtc": sp.et2utc(cur["start"], "ISOC", 0),
                               "endUtc": sp.et2utc(et, "ISOC", 0), "maxElevDeg": round(cur["max"], 1)})
                cur = None
    cover = 100.0 * above_n / ((n + 1) * len(a.sats))
    if not passes:
        sys.exit("No passes found in this interval (check kernels cover the dates).")
    write("relay_passes", {"source": a.source_name, "citation": a.citation, "license": a.license,
                           "satellites": a.sats, "windowDays": a.days, "minElevationDeg": a.min_elev,
                           "coveragePct": round(cover, 1), "passes": passes[:300],
                           "note": "Geometric visibility only (above the minimum elevation); no link budget."})


# ------------------------------------------------------------------------------------------------------- selftest
def selftest():
    assert abs(surface_pressure_ratio(0.0) - 1.0) < 1e-9
    assert 1.4 < surface_pressure_ratio(-3900) < 1.5, surface_pressure_ratio(-3900)
    assert nearest_index([0, 3, 6, 9], 7.1) == 2
    # straight overhead satellite = 90 deg, tangent = 0 deg
    assert abs(elevation_deg((MARS_R_M, 0, 0), (MARS_R_M + 300e3, 0, 0)) - 90) < 1e-6
    assert abs(elevation_deg((MARS_R_M, 0, 0), (MARS_R_M, 500e3, 0))) < 1e-6
    # block mean keeps NaNs out
    import importlib.util
    if importlib.util.find_spec("numpy"):
        import numpy as np
        a = np.arange(16, dtype=float).reshape(4, 4)
        a[0, 0] = np.nan
        out = block_mean(a, 2, 2)
        assert abs(out[0, 0] - np.nanmean(a[:2, :2])) < 1e-9
    # table column reading
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write("SOL,DOSE\n1,25\n2,27\n3,bad\n4,29\n")
    rows = read_table(f.name)
    assert column_values(rows, "DOSE") == [25.0, 27.0, 29.0]
    os.unlink(f.name)
    print("selftest OK")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--source-name"); p.add_argument("--citation"); p.add_argument("--license")
        p.add_argument("--lat", type=float, default=LAT); p.add_argument("--lon-west", type=float, default=LON_W)

    p = sub.add_parser("dust"); common(p)
    p.add_argument("--file", required=True); p.add_argument("--my", type=int, required=True, help="Mars Year of the file")
    p.add_argument("--var"); p.add_argument("--lat-var"); p.add_argument("--lon-var")
    p.add_argument("--elevation-m", type=float, default=-3900.0)
    p.add_argument("--pressure-ratio", type=float, default=None)
    p.add_argument("--vis-scale", type=float, default=DEFAULT_VIS_SCALE)
    p.set_defaults(fn=run_dust)

    p = sub.add_parser("raster"); common(p)
    p.add_argument("--product", required=True, choices=["themis_ti", "hirise_albedo", "swim_ice", "crism_hydration"])
    p.add_argument("--file"); p.add_argument("--url"); p.add_argument("--band", type=int, default=1)
    p.add_argument("--half-km", type=float, default=8.0); p.add_argument("--size", type=int, default=50)
    p.add_argument("--unit", default="")
    p.add_argument("--valid-min", type=float); p.add_argument("--valid-max", type=float)
    p.add_argument("--vmin", type=float); p.add_argument("--vmax", type=float)
    p.set_defaults(fn=run_raster)

    p = sub.add_parser("table"); common(p)
    p.add_argument("--product", required=True, choices=["rad", "meda"]); p.add_argument("--file", required=True)
    p.add_argument("--column", help="rad: dose-equivalent column"); p.add_argument("--factor", type=float, default=1.0,
                   help="rad: multiply column mean by this to get uSv/h")
    p.add_argument("--temp-col"); p.add_argument("--pressure-col"); p.add_argument("--wind-col")
    p.add_argument("--temp-factor", type=float, default=1.0); p.add_argument("--temp-offset", type=float, default=0.0)
    p.set_defaults(fn=run_table)

    p = sub.add_parser("relay"); common(p)
    p.add_argument("--meta-kernel", required=True); p.add_argument("--sats", nargs="+", default=["MRO", "MAVEN", "-143"])
    p.add_argument("--start", required=True, help='UTC start, e.g. "2026-11-14T00:00:00"')
    p.add_argument("--days", type=float, default=3.0); p.add_argument("--step-s", type=float, default=60.0)
    p.add_argument("--min-elev", type=float, default=10.0)
    p.set_defaults(fn=run_relay)

    sub.add_parser("selftest").set_defaults(fn=lambda a: selftest())
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
