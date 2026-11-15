#!/usr/bin/env python3
"""
Fetch a REAL Mars elevation window for MARSWEAVE and write data/arcadia_dem.json.

Source (NASA + ESA, public):
  USGS Astrogeology "Mars MGS MOLA - MEX HRSC Blended DEM Global 200m v2"
  https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m
  File: https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif
  MOLA = NASA Mars Global Surveyor (CC0); HRSC = ESA/DLR Mars Express (CC BY-SA 3.0 IGO).
  Recommended citation: Fergason, R. L., Hare, T. M., & Laura, J. (2018). HRSC and MOLA Blended
  Digital Elevation Model at 200m v2. Astrogeology PDS Annex, U.S. Geological Survey.

The file is ~11 GB, so this script does NOT download it: it reads only the requested window over
HTTP range requests (GDAL /vsicurl via rasterio). Expect a few MB of traffic.

HYPER-LOCAL MODE (recommended for a single EVA): the global DEM above is 200 m/px, which is regional.
Use a HiRISE DTM (about 1 m/px) or a CTX DEM (about 20 m/px) that covers your site instead:
  python scripts/fetch_arcadia_dem.py --dtm /path/to/DTM.tif --lat 18.45 --lon-west 282.0 \
      --half-km 2 --size 100 --source-name "HiRISE DTM <ID>" --citation "<credit>" --license "<licence>"
  (HiRISE DTMs: https://www.uahirise.org/dtm/  CTX DEMs: USGS Astrogeology. Not every site has one.)
  This mode needs pyproj as well, and expects the DTM CRS to be a Mars projected CRS in metres.
  It has not been tested against a real DTM in this repository: check the printed extent and elevations.

Usage:
  pip install rasterio numpy
  python scripts/fetch_arcadia_dem.py                       # Arcadia Planitia default, 50x50
  python scripts/fetch_arcadia_dem.py --size 100            # finer grid (see note below)
  python scripts/fetch_arcadia_dem.py --lat 39.3 --lon-west 171.4 --half-km 8 --out data/other.json
  python scripts/fetch_arcadia_dem.py --file /path/to/downloaded.tif   # use a local copy

Note: arcadiaData.ts reads GRID_COLS/GRID_ROWS from the JSON, so any --size works for the app.

Self-test of the geometry (no network, no rasterio needed):  python scripts/fetch_arcadia_dem.py --selftest
"""
import argparse
import json
import math
import sys
from datetime import datetime, timezone

DEM_URL = "https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif"
DATASET_PAGE = "https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m"
CITATION = ("Fergason, R. L., Hare, T. M., & Laura, J. (2018). HRSC and MOLA Blended Digital Elevation "
            "Model at 200m v2. Astrogeology PDS Annex, U.S. Geological Survey. "
            "MOLA (NASA/GSFC, CC0); HRSC (ESA/DLR, CC BY-SA 3.0 IGO).")


def bbox_from_center(lat, lon_west, half_km, radius_m):
    """Square-ish bounding box (in degrees) of +/- half_km around a point. Longitude is positive WEST."""
    dlat = math.degrees(half_km * 1000.0 / radius_m)
    dlon = dlat / max(math.cos(math.radians(lat)), 1e-6)
    return lat - dlat, lat + dlat, lon_west - dlon, lon_west + dlon


MARS_SPHERE_RADIUS_M = 3396190.0  # Mars 2000 sphere, used when a raster is in geographic degrees


def bounds_in_metres(bounds):
    """
    Some USGS mosaics are geographic (bounds in DEGREES, e.g. CRS ESRI:104971), others are simple-cylindrical in
    METRES. Convert degree bounds to equatorial metres on the Mars 2000 sphere so the window maths is identical.
    """
    left, bottom, right, top = bounds
    if (right - left) < 1000.0:  # a full turn is 360 in degrees but ~21 million in metres
        k = MARS_SPHERE_RADIUS_M * math.pi / 180.0
        return (left * k, bottom * k, right * k, top * k)
    return tuple(bounds)


def window_for_bbox(bounds, shape, min_lat, max_lat, min_lon_w, max_lon_w):
    """
    Map a lat/lon-west bbox onto raster (row, col) ranges for a simple-cylindrical global raster.
    bounds = (left, bottom, right, top) in metres; shape = (height, width) in pixels.
    The Mars sphere radius is recovered from the raster itself (x extent = 2*pi*R), so this works
    whether the file uses longitudes -180..180 or 0..360 as long as it spans one full turn.
    Returns (row_off, row_end, col_off, col_end, radius_m, lon_east_range).
    """
    left, bottom, right, top = bounds
    height, width = shape
    radius = (right - left) / (2.0 * math.pi)
    px_x = (right - left) / width
    px_y = (top - bottom) / height

    # longitude east in degrees, matching the raster's own convention
    lon_e_a, lon_e_b = -max_lon_w, -min_lon_w          # west-positive -> east-positive (-180..180)
    if left >= 0:                                       # raster is 0..360 east
        lon_e_a, lon_e_b = lon_e_a % 360.0, lon_e_b % 360.0
    x_a = math.radians(lon_e_a) * radius
    x_b = math.radians(lon_e_b) * radius
    y_n = math.radians(max_lat) * radius
    y_s = math.radians(min_lat) * radius

    col0, col1 = int((min(x_a, x_b) - left) / px_x), int(math.ceil((max(x_a, x_b) - left) / px_x))
    row0, row1 = int((top - y_n) / px_y), int(math.ceil((top - y_s) / px_y))
    return max(row0, 0), min(row1, height), max(col0, 0), min(col1, width), radius, (lon_e_a, lon_e_b)


def block_resample(arr, rows, cols):
    """Area-average resample of a 2-D array to (rows, cols) with numpy only (no scipy)."""
    import numpy as np
    h, w = arr.shape
    ri = np.linspace(0, h, rows + 1).astype(int)
    ci = np.linspace(0, w, cols + 1).astype(int)
    out = np.empty((rows, cols), dtype="float64")
    for r in range(rows):
        for c in range(cols):
            block = arr[ri[r]:max(ri[r + 1], ri[r] + 1), ci[c]:max(ci[c + 1], ci[c] + 1)]
            out[r, c] = np.nanmean(block)
    return out


def selftest():
    # Fake global raster: 106694 x 53347 px, 0..2*pi*R metres wide ("0..360 east") and -/+ half-height.
    R = 3396190.0
    bounds = (0.0, -math.pi * R / 2, 2 * math.pi * R, math.pi * R / 2)
    shape = (53347, 106694)
    lat, lonw = 39.3, 171.4
    b = bbox_from_center(lat, lonw, 8.0, R)
    r0, r1, c0, c1, rad, _ = window_for_bbox(bounds, shape, *b)
    px = (bounds[2] - bounds[0]) / shape[1]
    assert abs(rad - R) < 1.0, rad
    assert abs((r1 - r0) * px - 16000) < 2 * px + 1, ((r1 - r0) * px)          # ~16 km tall
    # equirectangular x spacing is equatorial metres: true ground width = x extent * cos(lat)
    assert abs((c1 - c0) * px * math.cos(math.radians(lat)) - 16000) < 4 * px, (c1 - c0) * px
    # centre pixel must map back to the requested lat/lon
    rc, cc = (r0 + r1) / 2, (c0 + c1) / 2
    lat_back = math.degrees((bounds[3] - rc * px) / R)
    lone_back = math.degrees((bounds[0] + cc * px) / R)
    assert abs(lat_back - lat) < 0.01, lat_back
    assert abs(lone_back - (-lonw) % 360) < 0.01, lone_back
    # same raster expressed in degrees must give the identical window
    deg_bounds = (0.0, -90.0, 360.0, 90.0)
    r0d, r1d, c0d, c1d, radd, _ = window_for_bbox(bounds_in_metres(deg_bounds), shape, *b)
    assert (r0d, r1d, c0d, c1d) == (r0, r1, c0, c1), ((r0d, r1d, c0d, c1d), (r0, r1, c0, c1))
    assert abs(radd - R) < 1.0, radd
    print("selftest OK: window", (r0, r1, c0, c1), "px ->", round((r1 - r0) * px / 1000, 1), "km tall")


def run_dtm(a, np, rasterio):
    """Hyper-local mode: read a window from a local projected Mars DTM (HiRISE/CTX)."""
    try:
        from pyproj import CRS, Transformer
        from rasterio.windows import Window
    except ImportError:
        sys.exit("Hyper-local mode needs: pip install pyproj rasterio numpy")
    if not (a.citation and a.license):
        sys.exit("--dtm requires --citation and --license so the data stays attributable (Space Apps rules).")
    with rasterio.open(a.dtm) as ds:
        if ds.crs is None:
            sys.exit("This DTM has no CRS; cannot map lat/lon to pixels.")
        crs = CRS.from_wkt(ds.crs.to_wkt())
        R = crs.ellipsoid.semi_major_metre if crs.ellipsoid else 3396190.0
        tr = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        dlat = math.degrees(a.half_km * 1000.0 / R)
        dlon = dlat / max(math.cos(math.radians(a.lat)), 1e-6)
        lon_e = -a.lon_west                       # planetocentric east-positive, as most Mars CRSs use
        pts = [(lon_e - dlon, a.lat - dlat), (lon_e + dlon, a.lat - dlat), (lon_e + dlon, a.lat + dlat), (lon_e - dlon, a.lat + dlat)]
        xy = [tr.transform(x, y) for x, y in pts]
        xs, ys = [p[0] for p in xy], [p[1] for p in xy]
        left, bottom, right, top = ds.bounds
        win_l = max(min(xs), left); win_r = min(max(xs), right)
        win_b = max(min(ys), bottom); win_t = min(max(ys), top)
        if win_l >= win_r or win_b >= win_t:
            sys.exit("Requested window is outside this DTM. Check --lat/--lon-west (longitude is WEST-positive).")
        col0 = int((win_l - left) / ds.res[0]); col1 = int(math.ceil((win_r - left) / ds.res[0]))
        row0 = int((top - win_t) / ds.res[1]); row1 = int(math.ceil((top - win_b) / ds.res[1]))
        data = ds.read(1, window=Window(col0, row0, col1 - col0, row1 - row0)).astype("float64")
        nodata = ds.nodata
        res_x, res_y = ds.res
    if nodata is not None:
        data[data == nodata] = np.nan
    if np.isnan(data).all():
        sys.exit("Window contains no valid data in this DTM.")
    cover = 1.0 - float(np.isnan(data).mean())
    if cover < 0.9:
        print(f"WARNING: only {cover:.0%} of the window has data; gaps are filled with the window mean.")
    data = np.where(np.isnan(data), np.nanmean(data), data)
    grid = block_resample(data, a.size, a.size)
    out = {
        "source": a.source_name or "Local Mars DTM",
        "citation": a.citation, "license": a.license, "datasetUrl": "", "fileUrl": "",
        "retrievedUtc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nativePixelMeters": round(float(res_x), 2),
        "cols": a.size, "rows": a.size,
        "minLat": round(a.lat - dlat, 5), "maxLat": round(a.lat + dlat, 5),
        "minLonWest": round(a.lon_west - dlon, 5), "maxLonWest": round(a.lon_west + dlon, 5),
        "areaWidthKm": round(data.shape[1] * res_x / 1000.0, 3), "areaHeightKm": round(data.shape[0] * res_y / 1000.0, 3),
        "elevationMinMeters": round(float(grid.min()), 1), "elevationMaxMeters": round(float(grid.max()), 1),
        "elevations": [[round(float(v), 1) for v in row] for row in grid],
    }
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {a.out}: {a.size}x{a.size} grid from {data.shape[1]}x{data.shape[0]} px at {res_x:g} m/px "
          f"({out['areaWidthKm']} x {out['areaHeightKm']} km), elevation {out['elevationMinMeters']} .. {out['elevationMaxMeters']} m")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, default=39.30, help="centre latitude, deg N (default 39.30)")
    ap.add_argument("--lon-west", type=float, default=171.40, help="centre longitude, deg WEST (default 171.40)")
    ap.add_argument("--half-km", type=float, default=8.0, help="half-width of the window in km (default 8 -> 16 km box)")
    ap.add_argument("--size", type=int, default=50, help="output grid is SIZE x SIZE cells (default 50)")
    ap.add_argument("--url", default=None, help="override the remote GeoTIFF URL (use if USGS moves the file)")
    ap.add_argument("--file", default=None, help="local GeoTIFF instead of streaming from USGS")
    ap.add_argument("--out", default="data/arcadia_dem.json", help="output JSON path")
    ap.add_argument("--dtm", default=None, help="local HiRISE/CTX DTM GeoTIFF (hyper-local mode, needs pyproj)")
    ap.add_argument("--source-name", default=None, help="source label stored in the JSON (for --dtm)")
    ap.add_argument("--citation", default=None, help="citation/credit stored in the JSON (for --dtm)")
    ap.add_argument("--license", default=None, help="licence of the source data (for --dtm)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()

    try:
        import numpy as np
        import rasterio
        from rasterio.windows import Window
    except ImportError:
        sys.exit("Missing packages. Run: pip install rasterio numpy")

    if a.dtm:
        return run_dtm(a, np, rasterio)

    src = a.file or a.url or DEM_URL
    path = src if a.file else "/vsicurl/" + src
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                      GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2"):
        with rasterio.open(path) as ds:
            bm = bounds_in_metres(tuple(ds.bounds))
            R = (bm[2] - bm[0]) / (2 * math.pi)
            bbox = bbox_from_center(a.lat, a.lon_west, a.half_km, R)
            r0, r1, c0, c1, R, lon_e = window_for_bbox(bm, (ds.height, ds.width), *bbox)
            print(f"Raster {ds.width}x{ds.height}px, CRS={ds.crs}, radius~{R/1000:.0f} km")
            print(f"Reading window rows {r0}:{r1}, cols {c0}:{c1} ({r1-r0}x{c1-c0} px)")
            if (r1 - r0) * (c1 - c0) > 25_000_000 or r1 <= r0 or c1 <= c0:
                sys.exit("Refusing to read this window (empty or larger than 25 Mpx): the geometry looks wrong. "
                         "Please send this output so it can be fixed.")
            data = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype("float64")
            nodata = ds.nodata
            px_m = (bm[2] - bm[0]) / ds.width

    if nodata is not None:
        data[data == nodata] = np.nan
    if np.isnan(data).all():
        sys.exit("Window contains no valid data - check coordinates (longitude is WEST-positive).")
    # fill rare gaps with the window mean so the grid stays finite
    data = np.where(np.isnan(data), np.nanmean(data), data)

    grid = block_resample(data, a.size, a.size)
    min_lat, max_lat, min_lonw, max_lonw = bbox
    height_km = (r1 - r0) * px_m / 1000.0
    width_km = (c1 - c0) * px_m * math.cos(math.radians(a.lat)) / 1000.0  # ground distance at this latitude
    out = {
        "source": "USGS MOLA-HRSC Blended DEM Global 200m v2",
        "citation": CITATION,
        "license": "MOLA: CC0 (NASA/GSFC). HRSC: CC BY-SA 3.0 IGO (ESA/DLR/FU Berlin). This derived file: CC BY-SA 3.0 IGO with attribution.",
        "datasetUrl": DATASET_PAGE,
        "fileUrl": a.url or DEM_URL,
        "retrievedUtc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nativePixelMeters": round(px_m, 2),
        "cols": a.size, "rows": a.size,
        "minLat": round(min_lat, 5), "maxLat": round(max_lat, 5),
        "minLonWest": round(min_lonw, 5), "maxLonWest": round(max_lonw, 5),
        "areaWidthKm": round(width_km, 3), "areaHeightKm": round(height_km, 3),
        "elevationMinMeters": round(float(grid.min()), 1), "elevationMaxMeters": round(float(grid.max()), 1),
        "elevations": [[round(float(v), 1) for v in row] for row in grid],
    }
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {a.out}: {a.size}x{a.size} grid, {width_km:.1f} x {height_km:.1f} km, "
          f"elevation {out['elevationMinMeters']} .. {out['elevationMaxMeters']} m")


if __name__ == "__main__":
    main()
