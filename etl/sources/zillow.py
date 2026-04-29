"""Zillow Research data — county-level home values (ZHVI) and rents (ZORI).

Public CSVs, no auth required:
  https://www.zillow.com/research/data/
"""

from __future__ import annotations

import io
import logging

import pandas as pd
import requests

from .base import write_long

log = logging.getLogger(__name__)

ZHVI_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)
ZORI_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zori/"
    "County_zori_uc_sfrcondomfr_sm_month.csv"
)


def _download_csv(url: str) -> pd.DataFrame:
    log.info("download %s", url)
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    return pd.read_csv(io.StringIO(resp.text))


def _melt_zillow(df: pd.DataFrame, metric: str) -> pd.DataFrame:
    # Zillow uses StateCodeFIPS + MunicipalCodeFIPS columns
    df["fips"] = df["StateCodeFIPS"].astype(str).str.zfill(2) + df["MunicipalCodeFIPS"].astype(
        str
    ).str.zfill(3)
    date_cols = [c for c in df.columns if c[:4].isdigit() and "-" in c]
    long = df.melt(id_vars=["fips"], value_vars=date_cols, var_name="period", value_name="value")
    long = long.dropna(subset=["value"])
    long["year"] = long["period"].str[:4].astype(int)
    long["period"] = long["period"].str[:7]  # YYYY-MM
    long["metric"] = metric
    return long[["fips", "metric", "year", "period", "value"]]


def fetch() -> pd.DataFrame:
    zhvi = _melt_zillow(_download_csv(ZHVI_URL), "zhvi_home_value")
    zori = _melt_zillow(_download_csv(ZORI_URL), "zori_rent_index")
    df = pd.concat([zhvi, zori], ignore_index=True)
    write_long(df, "zillow")
    return df
