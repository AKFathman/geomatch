"""American Community Survey 5-year — county-level demographics, income, education, housing.

API docs: https://www.census.gov/data/developers/data-sets/acs-5year.html
Requires CENSUS_API_KEY.

Side effect: writes a `geo_metadata.json` file (fips → name + state + population)
into the cache dir, used by the frontend to render readable labels.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd

from .base import CACHE_DIR, get_json, require_env, write_long

log = logging.getLogger(__name__)

# Curated set of ACS variables we'll pull. Each maps to one or more output metrics.
# Variable codes: https://api.census.gov/data/2022/acs/acs5/variables.html
ACS_VARS: dict[str, str] = {
    # Income
    "B19013_001E": "median_household_income",
    "B19301_001E": "per_capita_income",
    # Education (25+)
    "B15003_001E": "edu_total_25plus",
    "B15003_022E": "edu_bachelors",
    "B15003_023E": "edu_masters",
    "B15003_024E": "edu_professional",
    "B15003_025E": "edu_doctorate",
    # Population & age
    "B01003_001E": "population_total",
    "B01002_001E": "median_age",
    # Households
    "B11001_001E": "households_total",
    "B25010_001E": "avg_household_size",
    # Housing
    "B25077_001E": "median_home_value",
    "B25064_001E": "median_gross_rent",
    "B25002_003E": "vacant_units",
    "B25002_001E": "total_housing_units",
    # Vehicles
    "B25044_001E": "occupied_units_for_vehicles",
    "B25044_003E": "renter_no_vehicle",
    "B25044_010E": "owner_no_vehicle",
    # Commute
    "B08303_001E": "commute_total",
    "B08303_013E": "commute_60plus_min",
}

YEARS = list(range(2018, 2023))  # 2022 5-year is most recent stable as of 2026


def _write_geo_metadata(latest_records: dict[str, dict]) -> Path:
    """Emit geo_metadata.json keyed by fips. Used by the frontend."""
    out = CACHE_DIR.parent / "output" / "geo_metadata.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(latest_records, indent=0, sort_keys=True))
    log.info("wrote geo metadata for %d counties to %s", len(latest_records), out)
    return out


def fetch() -> pd.DataFrame:
    """Pull ACS 5-year data for all US counties across YEARS."""
    api_key = require_env("CENSUS_API_KEY")
    var_codes = ",".join(ACS_VARS.keys())
    rows: list[dict] = []
    # geo metadata uses the latest year's NAME and population
    latest_geo: dict[str, dict] = {}

    for year in YEARS:
        url = f"https://api.census.gov/data/{year}/acs/acs5"
        params = {
            "get": f"NAME,{var_codes}",
            "for": "county:*",
            "key": api_key,
        }
        log.info("fetching ACS %s", year)
        data = get_json(url, params=params)
        header, *records = data
        idx = {col: i for i, col in enumerate(header)}
        is_latest_year = year == max(YEARS)
        for rec in records:
            fips = rec[idx["state"]] + rec[idx["county"]]
            if is_latest_year:
                # NAME format: "Autauga County, Alabama"
                full_name = rec[idx["NAME"]]
                county_name, _, state_name = full_name.partition(", ")
                pop_raw = rec[idx["B01003_001E"]]
                try:
                    pop = int(float(pop_raw)) if pop_raw not in (None, "", "-") else None
                except (ValueError, TypeError):
                    pop = None
                latest_geo[fips] = {
                    "fips": fips,
                    "name": county_name,
                    "state": state_name,
                    "population": pop,
                }
            for code, metric in ACS_VARS.items():
                raw = rec[idx[code]]
                if raw in (None, "", "-"):
                    continue
                try:
                    val = float(raw)
                except ValueError:
                    continue
                rows.append(
                    {
                        "fips": fips,
                        "metric": metric,
                        "year": year,
                        "period": "annual",
                        "value": val,
                    }
                )

    _write_geo_metadata(latest_geo)

    df = pd.DataFrame(rows)
    # Derive education share (bachelor's+) as a single metric
    edu = df[df["metric"].isin(
        ["edu_total_25plus", "edu_bachelors", "edu_masters",
         "edu_professional", "edu_doctorate"]
    )].pivot_table(index=["fips", "year", "period"], columns="metric", values="value").reset_index()
    bachelors_sum = edu[["edu_bachelors", "edu_masters", "edu_professional",
                          "edu_doctorate"]].sum(axis=1)
    # Guard against zero-denominator (suppressed-data counties); inf/NaN both
    # propagate to the feature matrix and confuse the regression downstream.
    edu["bachelors_plus_share"] = bachelors_sum / edu["edu_total_25plus"].replace(0, pd.NA)
    derived = edu[["fips", "year", "period", "bachelors_plus_share"]].rename(
        columns={"bachelors_plus_share": "value"}
    ).dropna(subset=["value"])
    derived["metric"] = "bachelors_plus_share"
    df = pd.concat([df, derived[["fips", "metric", "year", "period", "value"]]], ignore_index=True)

    write_long(df, "acs")
    return df
