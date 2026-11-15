/**
 * MARSWEAVE — optional REAL data products (NASA PDS / USGS / LMD / NAIF), read from data/real/*.json.
 *
 * Every product is OPTIONAL. A product is used (and its layer/instrument marked REAL NASA ARCHIVE) ONLY when its
 * JSON file exists AND passes validation here. Nothing is ever marked REAL because a file name looks right.
 * The files are written by scripts/fetch_real_products.py, run on a machine that can reach the archives.
 *
 * File name (id) -> meaning
 *   dust_tau        LMD/MCD column dust optical depth time series at the site (Montabone et al.)
 *   rad             MSL RAD dose-equivalent rate (Gale: a reference site, NOT measured at Arcadia)
 *   meda            Mars 2020 MEDA weather summary (Jezero: a reference site, NOT measured at Arcadia)
 *   themis_ti       THEMIS thermal-inertia grid (tiu) over the study window
 *   hirise_albedo   ground brightness grid over the study window (currently the USGS Viking MDIM 2.1 mosaic, 232 m)
 *   swim_ice        SWIM2 (SHARAD-derived) subsurface-ice grid, 0..100
 *   crism_hydration CRISM summary-parameter grid (e.g. BD1900), unitless
 *   space_weather   NASA DONKI CME/flare records with modelled Mars arrival (archival, MODELLED forecasts)
 *   relay_passes    NAIF SPICE computed orbiter passes (elevation angle, duration) over the site
 */
type Json = Record<string, any>;

const modules = import.meta.glob('./real/*.json', { eager: true, import: 'default' }) as Record<string, Json>;

export interface Provenance {
  source: string;
  citation: string;
  license: string;
  retrievedUtc: string;
  /** free text shown in the UI, e.g. "JEZERO REFERENCE" */
  scopeNote?: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function provenanceOk(d: Json): boolean {
  return isStr(d.source) && isStr(d.citation) && isStr(d.license) && isStr(d.retrievedUtc);
}

function gridOk(d: Json): boolean {
  if (!isNum(d.cols) || !isNum(d.rows) || !Array.isArray(d.values) || d.values.length !== d.rows) return false;
  if (d.cols < 4 || d.rows < 4) return false;
  let finite = 0, total = 0;
  for (const row of d.values) {
    if (!Array.isArray(row) || row.length !== d.cols) return false;
    for (const v of row) { total++; if (v === null) continue; if (!isNum(v)) return false; finite++; }
  }
  return finite / total >= 0.6; // at least 60 % of the window must have data
}

const VALIDATORS: Record<string, (d: Json) => boolean> = {
  dust_tau: d => Array.isArray(d.series) && d.series.length >= 5 && isNum(d.tauTypical) && isNum(d.tauMax) && d.tauMax >= d.tauTypical && d.tauTypical > 0,
  rad: d => isNum(d.doseEquivMicroSvPerH) && d.doseEquivMicroSvPerH > 1 && d.doseEquivMicroSvPerH < 1000,
  meda: d => isNum(d.meanTempK) && isNum(d.meanPressurePa) && isNum(d.meanWindMs),
  themis_ti: gridOk,
  hirise_albedo: gridOk,
  swim_ice: gridOk,
  crism_hydration: gridOk,
  space_weather: d => Array.isArray(d.events) && isNum(d.windowDays) && isNum(d.marsDirectedCount),
  relay_passes: d => Array.isArray(d.passes) && d.passes.length > 0 && isNum(d.coveragePct)
};

export type RealProductId = keyof typeof VALIDATORS;

function load(): Partial<Record<RealProductId, Json>> {
  const out: Partial<Record<RealProductId, Json>> = {};
  for (const [path, d] of Object.entries(modules)) {
    const id = (path.split('/').pop() ?? '').replace(/\.json$/, '') as RealProductId;
    const check = VALIDATORS[id];
    if (!check) { console.warn(`[MARSWEAVE] data/real/${id}.json ignored: unknown product id`); continue; }
    if (!d || !provenanceOk(d)) { console.warn(`[MARSWEAVE] data/real/${id}.json ignored: provenance fields missing`); continue; }
    if (!check(d)) { console.warn(`[MARSWEAVE] data/real/${id}.json ignored: failed validation`); continue; }
    out[id] = d;
  }
  return out;
}

export const REAL_PRODUCTS = load();
export const hasReal = (id: RealProductId): boolean => !!REAL_PRODUCTS[id];
/** True when the product holds PUBLISHED literature values (never upgraded to REAL NASA ARCHIVE). */
export const isPublished = (id: RealProductId): boolean => REAL_PRODUCTS[id]?.kind === 'published_literature';

/** Bilinear resample of a product grid to the app grid (null cells become the grid mean). */
export function resampleGrid(id: RealProductId, cols: number, rows: number): number[][] | undefined {
  const d = REAL_PRODUCTS[id];
  if (!d || !Array.isArray(d.values)) return undefined;
  const src: (number | null)[][] = d.values;
  let sum = 0, n = 0;
  for (const row of src) for (const v of row) if (v !== null) { sum += v; n++; }
  const mean = n ? sum / n : 0;
  const get = (r: number, c: number) => {
    const v = src[Math.max(0, Math.min(d.rows - 1, r))][Math.max(0, Math.min(d.cols - 1, c))];
    return v === null ? mean : v;
  };
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    const rf = (r / (rows - 1)) * (d.rows - 1);
    for (let c = 0; c < cols; c++) {
      const cf = (c / (cols - 1)) * (d.cols - 1);
      const r0 = Math.floor(rf), c0 = Math.floor(cf), fy = rf - r0, fx = cf - c0;
      row.push(
        get(r0, c0) * (1 - fx) * (1 - fy) + get(r0, c0 + 1) * fx * (1 - fy) +
        get(r0 + 1, c0) * (1 - fx) * fy + get(r0 + 1, c0 + 1) * fx * fy
      );
    }
    out.push(row);
  }
  return out;
}

/** Short label for the UI. */
export function realLabel(id: RealProductId, fallback: string): string {
  const d = REAL_PRODUCTS[id];
  if (!d) return fallback;
  if (d.kind === 'published_literature') return `PUBLISHED REFERENCE VALUE (${d.scopeNote ?? 'literature'})`;
  return d.scopeNote ? `REAL PDS TELEMETRY (${d.scopeNote})` : `REAL ARCHIVE: ${d.source}`;
}
