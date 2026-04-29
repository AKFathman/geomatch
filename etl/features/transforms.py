"""Compute level / slope / YoY / volatility / seasonality features per (fips, metric).

Input: long-format DataFrame with columns [fips, metric, year, period, value]
Output: wide DataFrame indexed by fips, one column per derived feature.

Derived feature names follow the pattern:
    {metric}__level    — z-scored most-recent value
    {metric}__slope    — 3y linear regression coefficient (per year)
    {metric}__yoy      — most recent year-over-year % change
    {metric}__vol      — std dev of YoY changes over available history
    {metric}__seas     — seasonality strength (only for monthly metrics)
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


def _zscore(s: pd.Series) -> pd.Series:
    mu, sd = s.mean(), s.std(ddof=0)
    return (s - mu) / sd if sd > 0 else s * 0


def _slope(years: np.ndarray, vals: np.ndarray) -> float:
    """Linear-regression slope of vals ~ years. Returns NaN if <3 points."""
    if len(years) < 3 or np.std(years) == 0:
        return np.nan
    coef = np.polyfit(years, vals, 1)[0]
    return float(coef)


def _yoy(series: pd.Series) -> float:
    """Most recent YoY % change. series indexed by year, sorted ascending."""
    if len(series) < 2:
        return np.nan
    a, b = series.iloc[-2], series.iloc[-1]
    return float((b - a) / a) if a not in (0, np.nan) else np.nan


def _volatility(series: pd.Series) -> float:
    if len(series) < 3:
        return np.nan
    pct = series.pct_change().dropna()
    return float(pct.std()) if len(pct) > 1 else np.nan


def _seasonality_strength(monthly: pd.Series) -> float:
    """Ratio of seasonal-component variance to total variance.

    `monthly` indexed by YYYY-MM string, sorted. Uses simple mean-by-month.
    Returns 0–1ish; NaN if <24 months.
    """
    if len(monthly) < 24:
        return np.nan
    months = pd.Series(monthly.index).str[5:7].astype(int).values
    vals = monthly.values
    df = pd.DataFrame({"m": months, "v": vals})
    seasonal_means = df.groupby("m")["v"].transform("mean")
    seasonal = seasonal_means - df["v"].mean()
    total_var = df["v"].var()
    if total_var == 0:
        return 0.0
    return float(seasonal.var() / total_var)


def build_feature_matrix(long: pd.DataFrame) -> pd.DataFrame:
    """Take long-format multi-source data, return wide feature matrix."""
    feats: list[pd.DataFrame] = []

    for metric, sub in long.groupby("metric"):
        is_monthly = sub["period"].str.contains("-").any()

        if is_monthly:
            # Aggregate to annual mean for level/slope/yoy/vol; keep monthly for seasonality
            annual = sub.groupby(["fips", "year"])["value"].mean().reset_index()
        else:
            annual = sub[["fips", "year", "value"]].copy()

        # Most-recent level
        latest_year = annual["year"].max()
        level = annual[annual["year"] == latest_year].set_index("fips")["value"]
        level_z = _zscore(level).rename(f"{metric}__level")

        # Slope (3y window ending at latest)
        recent = annual[annual["year"] >= latest_year - 2]
        slope = recent.groupby("fips").apply(
            lambda g: _slope(g["year"].values, g["value"].values),
            include_groups=False,
        )
        slope.name = f"{metric}__slope"

        # YoY
        yoy = annual.sort_values("year").groupby("fips")["value"].apply(_yoy)
        yoy.name = f"{metric}__yoy"

        # Volatility
        vol = annual.sort_values("year").groupby("fips")["value"].apply(_volatility)
        vol.name = f"{metric}__vol"

        out = pd.concat([level_z, slope, yoy, vol], axis=1)

        # Seasonality (only monthly metrics)
        if is_monthly:
            monthly = sub.sort_values("period").set_index("period")
            seas = monthly.groupby("fips")["value"].apply(_seasonality_strength)
            seas.name = f"{metric}__seas"
            out = out.join(seas)

        feats.append(out)

    matrix = pd.concat(feats, axis=1)
    log.info("feature matrix: %d counties × %d features", *matrix.shape)
    return matrix
