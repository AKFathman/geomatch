"""GeoMatch ETL orchestrator.

Runs nightly. Steps:
  1. Pull each source -> long-format parquet in ./cache
  2. Concatenate, then build wide feature matrix
  3. Write feature_matrix.parquet, geo_metadata.json, manifest.json to ./output

The output dir is what gets uploaded to R2 / committed to the web build.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from features.transforms import build_feature_matrix
from sources import acs, bea, laus, zillow

log = logging.getLogger("geomatch")

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def configure_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def run(skip: set[str] | None = None) -> None:
    skip = skip or set()
    pieces: list[pd.DataFrame] = []

    if "acs" not in skip:
        pieces.append(acs.fetch())
    if "bea" not in skip:
        pieces.append(bea.fetch())
    if "zillow" not in skip:
        pieces.append(zillow.fetch())
    if "laus" not in skip:
        # LAUS needs the county list; derive from ACS output
        if pieces:
            counties = sorted(pieces[0]["fips"].unique().tolist())
        else:
            counties = []
        if counties:
            pieces.append(laus.fetch(counties))
        else:
            log.warning("skipping LAUS — no county list available (run ACS first)")

    if not pieces:
        log.error("no sources fetched; aborting")
        sys.exit(1)

    long = pd.concat(pieces, ignore_index=True)
    long.to_parquet(OUTPUT_DIR / "long.parquet", index=False)
    log.info("combined long: %d rows", len(long))

    matrix = build_feature_matrix(long)
    matrix.to_parquet(OUTPUT_DIR / "feature_matrix.parquet")

    manifest = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "rows": int(matrix.shape[0]),
        "features": int(matrix.shape[1]),
        "sources": [s for s in ("acs", "bea", "zillow", "laus") if s not in skip],
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    log.info("done: %s", manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip", nargs="*", default=[], help="sources to skip")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()
    configure_logging(args.verbose)
    run(skip=set(args.skip))


if __name__ == "__main__":
    main()
