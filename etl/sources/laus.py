"""BLS Local Area Unemployment Statistics — monthly county unemployment & labor force.

API docs: https://www.bls.gov/developers/api_signature_v2.htm

LAUS series IDs are 20 chars: "LAUCN" + 5-digit-FIPS + 8 zeros + 2-digit measure
  e.g. LAUCN281070000000003 = Marshall County MS, unemployment rate

Measure codes:
  03 = unemployment rate
  04 = unemployment count
  05 = employment count
  06 = labor force

NOTE: BLS API limits 50 series per request, 500 requests/day with key.
We chunk requests and request only the last 5 years to stay within limits.
"""

from __future__ import annotations

import logging
from itertools import islice

import pandas as pd
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from .base import require_env, write_long

log = logging.getLogger(__name__)

LAUS_MEASURES = {
    "03": "unemployment_rate",
    "05": "employment_count",
    "06": "labor_force",
}

START_YEAR = 2020
END_YEAR = 2025


def _chunked(iterable, n):
    it = iter(iterable)
    while batch := list(islice(it, n)):
        yield batch


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=30))
def _post_bls(payload: dict) -> dict:
    resp = requests.post(
        "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def fetch(county_fips: list[str]) -> pd.DataFrame:
    """Fetch LAUS series for the given counties.

    `county_fips` should be the full county FIPS list from a geo metadata file —
    we don't enumerate them here to keep this connector geo-agnostic.
    """
    api_key = require_env("BLS_API_KEY")
    series_ids: list[str] = []
    series_to_meta: dict[str, tuple[str, str]] = {}

    for fips in county_fips:
        for code, metric in LAUS_MEASURES.items():
            # 20-char format: LAUCN + 5-digit FIPS + 8 zeros + 2-digit measure
            sid = f"LAUCN{fips}00000000{code}"
            assert len(sid) == 20, f"malformed LAUS series ID: {sid!r}"
            series_ids.append(sid)
            series_to_meta[sid] = (fips, metric)

    rows: list[dict] = []
    # BLS allows up to 50 series per request
    for batch in _chunked(series_ids, 50):
        payload = {
            "seriesid": batch,
            "startyear": str(START_YEAR),
            "endyear": str(END_YEAR),
            "registrationkey": api_key,
        }
        log.info("BLS LAUS batch of %d series", len(batch))
        data = _post_bls(payload)
        if data.get("status") != "REQUEST_SUCCEEDED":
            raise RuntimeError(f"BLS error: {data.get('message')}")
        for series in data["Results"]["series"]:
            sid = series["seriesID"]
            fips, metric = series_to_meta[sid]
            for obs in series["data"]:
                if obs["period"].startswith("M") and obs["period"] != "M13":
                    month = int(obs["period"][1:])
                    year = int(obs["year"])
                    try:
                        val = float(obs["value"])
                    except ValueError:
                        continue
                    rows.append(
                        {
                            "fips": fips,
                            "metric": metric,
                            "year": year,
                            "period": f"{year}-{month:02d}",
                            "value": val,
                        }
                    )

    if not rows:
        # BLS silently returns empty `data: []` for malformed series IDs rather
        # than raising. Make this explicit so future regressions don't crash
        # later in feature engineering with a confusing error.
        raise RuntimeError(
            f"LAUS returned 0 observations for {len(series_ids)} series IDs — "
            "check series ID format (should be LAUCN+5fips+8zeros+2measure = 20 chars)"
        )
    df = pd.DataFrame(rows)

    # Partial-success guard: BLS may recognize fewer series IDs than we sent and
    # silently return them as zero-data. Compare unique fips coverage to what we
    # asked for; warn if we lost more than 5% of counties.
    asked = len(county_fips)
    got = df["fips"].nunique()
    coverage = got / asked if asked else 0
    log.info("LAUS: %d observations / %d unique counties (asked for %d, %.1f%% coverage)",
             len(df), got, asked, coverage * 100)
    if coverage < 0.95:
        log.warning(
            "LAUS coverage is %.1f%% (%d / %d counties) — BLS dropped %d counties silently",
            coverage * 100, got, asked, asked - got,
        )

    write_long(df, "laus")
    return df
