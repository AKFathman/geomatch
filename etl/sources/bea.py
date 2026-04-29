"""BEA Regional Economic Accounts — county personal income, GDP, per-capita income.

API docs: https://apps.bea.gov/api/signup/
Dataset: Regional, Tables CAINC1 (personal income) and CAGDP1 (GDP by county).
"""

from __future__ import annotations

import logging

import pandas as pd

from .base import get_json, require_env, write_long

log = logging.getLogger(__name__)

BEA_TABLES = {
    "CAINC1": {
        "1": "personal_income_total",
        "2": "population_bea",
        "3": "per_capita_personal_income",
    },
}

YEARS = list(range(2018, 2024))


def fetch() -> pd.DataFrame:
    api_key = require_env("BEA_API_KEY")
    rows: list[dict] = []

    for table, line_codes in BEA_TABLES.items():
        for line, metric in line_codes.items():
            params = {
                "UserID": api_key,
                "method": "GetData",
                "datasetname": "Regional",
                "TableName": table,
                "LineCode": line,
                "GeoFips": "COUNTY",
                "Year": ",".join(str(y) for y in YEARS),
                "ResultFormat": "JSON",
            }
            log.info("BEA %s line %s -> %s", table, line, metric)
            data = get_json("https://apps.bea.gov/api/data/", params=params)
            results = data.get("BEAAPI", {}).get("Results", {}).get("Data", [])
            for rec in results:
                fips = rec.get("GeoFips", "")
                if len(fips) != 5 or fips.endswith("000"):  # skip state/national totals
                    continue
                try:
                    val = float(str(rec["DataValue"]).replace(",", ""))
                except (ValueError, KeyError):
                    continue
                rows.append(
                    {
                        "fips": fips,
                        "metric": metric,
                        "year": int(rec["TimePeriod"]),
                        "period": "annual",
                        "value": val,
                    }
                )

    df = pd.DataFrame(rows)
    write_long(df, "bea")
    return df
