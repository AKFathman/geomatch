"""Common helpers for source connectors.

Every source returns a long-format DataFrame with columns:
    fips    : str   — 5-digit county FIPS code
    metric  : str   — snake_case metric name
    year    : int   — year the value applies to
    period  : str   — "annual" | "YYYY-MM" | "YYYY-Qn"
    value   : float — the metric value

Trajectory features (slope/YoY/volatility/seasonality) are derived in
`features/transforms.py` from the time series of (fips, metric).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import pandas as pd
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

log = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parents[1] / "cache"
CACHE_DIR.mkdir(exist_ok=True)


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=20))
def get_json(url: str, params: dict | None = None, timeout: int = 60) -> list | dict:
    """GET a URL with retry. Raises on non-2xx after retries."""
    log.debug("GET %s params=%s", url, params)
    resp = requests.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


def cache_path(source: str, key: str) -> Path:
    return CACHE_DIR / f"{source}__{key}.parquet"


def write_long(df: pd.DataFrame, source: str) -> Path:
    """Write a tidy long-format DataFrame to the cache. Validates schema."""
    required = {"fips", "metric", "year", "period", "value"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{source} output missing columns: {missing}")
    out = CACHE_DIR / f"{source}.parquet"
    df.to_parquet(out, index=False)
    log.info("wrote %s rows to %s", len(df), out)
    return out
