"""American Community Survey 5-year — county-level demographics, income, education, housing.

API docs: https://www.census.gov/data/developers/data-sets/acs-5year.html
Requires CENSUS_API_KEY.
"""

from __future__ import annotations

import logging

import pandas as pd

from .base import get_json, require_env, write_long

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


def fetch() -> pd.DataFrame:
    """Pull ACS 5-year data for all US counties across YEARS."""
    api_key = require_env("CENSUS_API_KEY")
    var_codes = ",".join(ACS_VARS.keys())
    rows: list[dict] = []

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
        for rec in records:
            fips = rec[idx["state"]] + rec[idx["county"]]
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

    df = pd.DataFrame(rows)
    # Derive education share (bachelor's+) as a single metric
    edu = df[df["metric"].isin(
        ["edu_total_25plus", "edu_bachelors", "edu_masters",
         "edu_professional", "edu_doctorate"]
    )].pivot_table(index=["fips", "year", "period"], columns="metric", values="value").reset_index()
    edu["bachelors_plus_share"] = (
        edu[["edu_bachelors", "edu_masters", "edu_professional", "edu_doctorate"]].sum(axis=1)
        / edu["edu_total_25plus"]
    )
    derived = edu[["fips", "year", "period", "bachelors_plus_share"]].rename(
        columns={"bachelors_plus_share": "value"}
    )
    derived["metric"] = "bachelors_plus_share"
    df = pd.concat([df, derived[["fips", "metric", "year", "period", "value"]]], ignore_index=True)

    return write_long(df, "acs") and df  # type: ignore[return-value]
