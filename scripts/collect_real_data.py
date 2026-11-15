#!/usr/bin/env python3
"""MARSWEAVE — run every real-data fetch in one go and zip the result.

Usage (on your Mac, inside the venv that has rasterio/netCDF4/spiceypy):
    python3 scripts/collect_real_data.py --init            # writes real_inputs.json template
    # edit real_inputs.json: fill "file" for each product you downloaded, leave "" for the rest
    python3 scripts/collect_real_data.py                   # runs all filled entries, makes marsweave_real_data.zip

Site (Arcadia Planitia 39.30 N, 171.40 W, 16 km window) is built into fetch_real_products.py.
Entries with an empty "file" are skipped and listed as "bulamadım" in notlar.txt, so the app
keeps their honest SIMULATED label. Nothing is invented here.
"""
import json, subprocess, sys, zipfile, datetime, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
FETCH = str(HERE / "fetch_real_products.py")
INPUTS = pathlib.Path("real_inputs.json")

TEMPLATE = {
  "dust_tau": {"file": "", "my": 36, "var": "", "source": "LMD Mars Climate Database dust climatology",
               "citation": "Montabone et al. 2015/2020, LMD/Open University", "license": "CC BY 4.0 (check LMD page)"},
  "themis_ti": {"file": "", "unit": "J m-2 K-1 s-1/2", "source": "USGS THEMIS Thermal Inertia Mosaic",
                "citation": "Edwards et al. 2011, USGS Astrogeology", "license": "Public domain (NASA/USGS)"},
  "hirise_albedo": {"file": "", "source": "MRO HiRISE RDR (observation ID: )",
                    "citation": "McEwen et al. 2007, NASA/JPL/University of Arizona", "license": "Public domain (NASA/UA)"},
  "swim_ice": {"file": "", "vmin": 0, "vmax": 1, "source": "SWIM2 subsurface water ice map (from SHARAD)",
               "citation": "Putzig et al. 2024, PDS Geosciences", "license": "Public domain (NASA PDS)"},
  "crism_hydration": {"file": "", "source": "MRO CRISM MRDR summary parameter (e.g. BD1900)",
                      "citation": "Murchie et al. 2007, NASA/JHU-APL", "license": "Public domain (NASA PDS)"},
  "rad": {"file": "", "column": "", "factor": 1.0, "source": "MSL RAD RDR (Gale reference)",
          "citation": "Hassler et al. 2014, NASA PDS PPI", "license": "Public domain (NASA PDS)"},
  "meda": {"file": "", "temp_col": "", "pressure_col": "", "wind_col": "", "source": "Mars 2020 MEDA (Jezero reference)",
           "citation": "Rodriguez-Manfredi et al. 2021, NASA PDS Atmospheres", "license": "Public domain (NASA PDS)"},
  "relay_passes": {"meta_kernel": "", "start": "2026-11-14T00:00:00", "days": 1, "sats": [],
                   "source": "NAIF SPICE (MRO/MAVEN/TGO ephemerides)", "citation": "NASA NAIF/JPL", "license": "Public domain (NASA NAIF)"},
}

def cmd_for(pid, c):
    base = [sys.executable, FETCH]
    meta = ["--source-name", c.get("source", ""), "--citation", c.get("citation", ""), "--license", c.get("license", "")]
    if pid == "dust_tau":
        a = base + ["dust", "--file", c["file"], "--my", str(c["my"])] + meta
        if c.get("var"): a += ["--var", c["var"]]
        return a
    if pid in ("themis_ti", "hirise_albedo", "swim_ice", "crism_hydration"):
        a = base + ["raster", "--product", pid, "--file", c["file"]] + meta
        if c.get("unit"): a += ["--unit", c["unit"]]
        if "vmin" in c: a += ["--vmin", str(c["vmin"]), "--vmax", str(c["vmax"])]
        return a
    if pid == "rad":
        return base + ["table", "--product", "rad", "--file", c["file"], "--column", c["column"], "--factor", str(c.get("factor", 1.0))] + meta
    if pid == "meda":
        a = base + ["table", "--product", "meda", "--file", c["file"]] + meta
        for k, f in (("temp_col", "--temp-col"), ("pressure_col", "--pressure-col"), ("wind_col", "--wind-col")):
            if c.get(k): a += [f, c[k]]
        return a
    if pid == "relay_passes":
        a = base + ["relay", "--meta-kernel", c["meta_kernel"], "--start", c["start"], "--days", str(c.get("days", 1))] + meta
        if c.get("sats"): a += ["--sats"] + [str(s) for s in c["sats"]]
        return a

def main():
    if "--init" in sys.argv:
        INPUTS.write_text(json.dumps(TEMPLATE, indent=2, ensure_ascii=False))
        print("Yazıldı:", INPUTS.resolve(), "— 'file' alanlarını doldurup tekrar çalıştırın.")
        return
    if not INPUTS.exists():
        sys.exit("real_inputs.json yok. Önce: python3 scripts/collect_real_data.py --init")
    cfg = json.loads(INPUTS.read_text())
    out = ROOT / "data" / "real"; out.mkdir(parents=True, exist_ok=True)
    notes = [f"MARSWEAVE gerçek veri çalıştırması — {datetime.datetime.now(datetime.timezone.utc).isoformat()}", ""]
    made = []
    for pid, c in cfg.items():
        key = c.get("meta_kernel") if pid == "relay_passes" else c.get("file")
        if not key:
            notes.append(f"[{pid}] bulamadım / verilmedi — SIMULATED kalacak"); continue
        a = cmd_for(pid, c)
        notes.append(f"[{pid}] $ " + " ".join(a))
        r = subprocess.run(a, capture_output=True, text=True)
        notes.append((r.stdout + r.stderr).strip() or "(çıktı yok)")
        if r.returncode == 0 and (out / f"{pid}.json").exists(): made.append(pid)
        else: notes.append(f"[{pid}] BAŞARISIZ (kod {r.returncode})")
        notes.append("")
    z = pathlib.Path("marsweave_real_data.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for pid in made: zf.write(out / f"{pid}.json", f"data/real/{pid}.json")
        zf.writestr("notlar.txt", "\n".join(notes))
    print("Üretilen:", made or "hiçbiri"); print("Zip:", z.resolve())

if __name__ == "__main__":
    main()
