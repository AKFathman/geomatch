# GeoMatch

Find matched test/control markets for **GeoLIFT** geo-experimentation, using public county-level data and trajectory-aware similarity.

Most existing GeoLIFT tooling matches on KPI time series alone. GeoMatch layers in **contextual similarity** — demographics, income, education, housing, employment, plus how each of those is *trending* — so the resulting test/control pairs hold up to stakeholder scrutiny on face validity, not just statistical fit.

> **Status**: Phase 1 / pre-MVP. ETL skeleton + frontend scaffold. Not yet deployed.

## Architecture

```
GitHub Actions (nightly)
        │
        ▼  pulls public APIs
   ┌─────────────────────────────┐
   │  Python ETL                 │
   │  ACS · BLS LAUS · BEA · ZRI │
   │  → feature_matrix.parquet   │
   └──────────┬──────────────────┘
              ▼
   commit refreshed parquet to repo
              ▼
   ┌─────────────────────────────┐
   │  Next.js on Vercel          │
   │  serves parquet as static   │
   │  asset; DuckDB-WASM matches │
   │  in the browser — no backend│
   └─────────────────────────────┘
```

**Build / deploy stack** (per the workflow we're following):
- **Claude Code CLI** for building
- **GitHub CLI** for version control
- **Vercel** for hosting & CDN
- **OpenAI Codex** for pre-merge code review
- Parquet output (~1.5 MB) is small enough to live in the repo — no separate object storage needed.

## Data sources (Phase 1)

| Source | What | Cadence |
|---|---|---|
| Census ACS 5-year | demographics, income, education, housing, vehicles, commute | annual |
| BLS LAUS | unemployment, labor force, employment count | monthly |
| BEA Regional CAINC1 | personal income, per-capita income | annual |
| Zillow Research | ZHVI home values, ZORI rents | monthly |

Phase 2 adds FBI crime, CDC PLACES health, FCC broadband, BLS QCEW industry employment.

## Feature engineering

For each base metric we compute four (or five for monthly) derived features:

- `__level` — z-scored most-recent value
- `__slope` — 3-year linear-regression coefficient
- `__yoy` — most recent year-over-year change
- `__vol` — std dev of YoY changes over available history
- `__seas` — seasonality strength (monthly metrics only)

This is what addresses the "trajectory" gap in standard GeoLIFT matching.

## Matching

Weighted nearest-neighbors in feature space, with optional filters on population band and geographic adjacency (to limit spillover risk). Industry presets ship with curated weight defaults; users can override. Output is a ranked list of candidate control counties plus a feature-by-feature breakdown showing *why* each matched.

## Repo layout

```
etl/                        Python ETL pipeline
  sources/                  one connector per data source
  features/transforms.py    level/slope/YoY/vol/seasonality
  pipeline.py               orchestrator
  pyproject.toml
web/                        Next.js + TS + Tailwind frontend (TBD)
data/
  presets/industries.json   curated industry weight maps
  schemas/                  JSON schemas for validation
.github/workflows/etl.yml   nightly cron
```

## Local development

```bash
# ETL
cd etl
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Set API keys
export CENSUS_API_KEY=...
export BLS_API_KEY=...
export BEA_API_KEY=...

# Run
python pipeline.py --verbose

# Or skip slow sources during dev
python pipeline.py --skip laus zillow -v
```

Frontend setup lands in the next commit.

## Roadmap

- **Phase 1** (in progress) — county-level, 4 sources, 3 industries, weighted-Euclidean matching, CSV export
- **Phase 2** — crime / health / broadband / QCEW; full 8 industries; trajectory + seasonality features; map view
- **Phase 3** — synthetic-control output, GeoLift R package export, optional KPI upload
- **Phase 4** — CBSA aggregation, shareable URLs, browser-saved configs

## License

TBD. Most likely MIT for code, with a note that downstream data carries the licenses of its respective sources (Census, BLS, BEA, Zillow Research).
