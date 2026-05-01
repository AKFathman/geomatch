/**
 * Combined data loader — fetches manifest, geo metadata, and the feature
 * matrix (parquet via DuckDB-WASM). Returns everything the matcher needs.
 *
 * The parquet load is the slow part (~3 MB + WASM cold start, ~2 s typical).
 * Manifest and geo metadata are tiny.
 */

import { loadFeatureMatrix } from "./duckdb";

export interface Manifest {
  built_at: string;
  rows: number;
  features: number;
  sources: string[];
}

export interface Geo {
  fips: string;
  name: string;
  state: string;
  population: number | null;
}

export interface DataBundle {
  manifest: Manifest;
  geos: Map<string, Geo>;
  features: Map<string, Record<string, number>>;
  featureNames: string[];
  populations: Map<string, number>;
}

let _cached: Promise<DataBundle> | null = null;

export function loadAll(): Promise<DataBundle> {
  if (_cached) return _cached;
  _cached = (async () => {
    const [manifestRes, geoRes, fm] = await Promise.all([
      fetch("/data/manifest.json").then((r) => r.json() as Promise<Manifest>),
      fetch("/data/geo_metadata.json").then(
        (r) => r.json() as Promise<Record<string, Geo>>,
      ),
      loadFeatureMatrix("/data/feature_matrix.parquet"),
    ]);

    const geos = new Map<string, Geo>();
    for (const fips of Object.keys(geoRes)) geos.set(fips, geoRes[fips]);

    const populations = new Map<string, number>();
    for (const [fips, g] of geos) {
      if (g.population != null) populations.set(fips, g.population);
    }

    return {
      manifest: manifestRes,
      geos,
      features: fm.features,
      featureNames: fm.featureNames,
      populations,
    };
  })();
  return _cached;
}

/**
 * Expand base-metric weights (e.g. {median_household_income: 0.2}) into
 * per-feature weights by mapping each base metric to all its derivatives
 * (__level, __slope, __yoy, __vol, __seas) that actually exist in the
 * feature matrix, splitting the base weight across them.
 *
 * Currently uses a fixed split: 50% level, 20% slope, 20% yoy, 10% vol.
 * Seasonality, when present, takes from level proportionally.
 */
export function expandWeights(
  baseWeights: Record<string, number>,
  featureNames: string[],
): Record<string, number> {
  const split = { level: 0.5, slope: 0.2, yoy: 0.2, vol: 0.1, seas: 0.0 };
  const featureSet = new Set(featureNames);
  const out: Record<string, number> = {};

  for (const base of Object.keys(baseWeights)) {
    const w = baseWeights[base];
    // Find which derivatives actually exist in the matrix
    const present: Array<keyof typeof split> = [];
    for (const d of ["level", "slope", "yoy", "vol", "seas"] as const) {
      if (featureSet.has(`${base}__${d}`)) present.push(d);
    }
    if (!present.length) continue;
    // Renormalize the split among present derivatives
    const totalSplit = present.reduce((a, k) => a + split[k], 0);
    for (const d of present) {
      out[`${base}__${d}`] = (w * split[d]) / totalSplit;
    }
  }
  return out;
}
