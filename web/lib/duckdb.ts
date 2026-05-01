/**
 * DuckDB-WASM loader — reads /data/feature_matrix.parquet at runtime
 * and returns a Map<fips, feature-record> for the matcher.
 *
 * Initialized lazily on first call. Single instance shared across the app.
 */

import * as duckdb from "@duckdb/duckdb-wasm";

let _db: duckdb.AsyncDuckDB | null = null;

async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (_db) return _db;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: "text/javascript" }),
  );
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);
  _db = db;
  return db;
}

export interface FeatureMatrix {
  features: Map<string, Record<string, number>>;
  featureNames: string[];
}

export async function loadFeatureMatrix(url = "/data/feature_matrix.parquet"): Promise<FeatureMatrix> {
  const db = await getDB();
  // DuckDB-WASM treats raw paths as local FS — register the URL first so
  // read_parquet() can fetch over HTTP. Resolve to an absolute URL so
  // the registration works regardless of the current page path.
  const absoluteUrl = url.startsWith("http")
    ? url
    : new URL(url, window.location.origin).toString();
  const registeredName = "feature_matrix.parquet";
  await db.registerFileURL(
    registeredName,
    absoluteUrl,
    duckdb.DuckDBDataProtocol.HTTP,
    false,
  );
  const conn = await db.connect();
  await conn.query(
    `CREATE OR REPLACE VIEW fm AS SELECT * FROM read_parquet('${registeredName}')`,
  );
  const result = await conn.query("SELECT * FROM fm");
  const rows = result.toArray().map((r) => r.toJSON()) as Array<Record<string, unknown>>;

  const features = new Map<string, Record<string, number>>();
  const featureNames: string[] = [];
  if (rows.length) {
    featureNames.push(
      ...Object.keys(rows[0]).filter((k) => k !== "fips" && k !== "__index_level_0__"),
    );
  }
  for (const row of rows) {
    const fips = String(row.fips ?? row.__index_level_0__ ?? "");
    if (!fips) continue;
    const vec: Record<string, number> = {};
    for (const f of featureNames) {
      const v = row[f];
      vec[f] = typeof v === "number" ? v : Number(v);
    }
    features.set(fips, vec);
  }
  await conn.close();
  return { features, featureNames };
}
