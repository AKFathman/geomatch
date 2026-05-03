#!/usr/bin/env python3
"""Generate a realistic, biased synthetic geo-test dataset.

The bias is intentional: test cells skew toward bigger / wealthier / more
educated counties, which is the most common real-world failure mode of geo
test design. The naive lift estimate from this dataset will be too high
(because the test baseline is structurally higher than control); the
covariate-adjusted estimate should recover the true effect.

Channel mix mirrors a typical brand media plan with diverse expected lifts:
  - google_search: +25%  (strong intent, biggest expected effect)
  - meta:          +15%
  - ctv:           +12%
  - youtube:        +8%
  - tiktok:         +3%  (small, marginal at this n)
  - snap:           -1%  (null/slightly negative — should not be significant)

Output: scripts/synthetic_biased_geo_test.csv
Also writes a `_truth.txt` recording the ground-truth parameters.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

# Reproducible
random.seed(20260503)

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / "web" / "public" / "data" / "geo_metadata.json"
OUT_CSV = Path(__file__).resolve().parent / "synthetic_biased_geo_test.csv"
OUT_TRUTH = Path(__file__).resolve().parent / "synthetic_biased_geo_test_truth.txt"

# Configuration
N_TEST = 60
N_CONTROL = 60
TEST_RANK_RANGE = (1, 80)        # Test pool: top-80 by pop
CONTROL_RANK_RANGE = (81, 220)   # Control pool: rank 81-220

# Channel spec: (true_lift, baseline_rate, exposure_share, channel_noise_sd)
#   exposure_share: fraction of population that gets impressions for this channel
#   baseline_rate:  conversion rate at population-mean baseline
#   channel_noise_sd: log-normal SD for per-county random effect
CHANNEL_SPEC: dict[str, dict] = {
    "google_search": {"lift": 0.25, "baseline": 0.0120, "exposure_share": 0.20, "noise": 0.08},
    "meta":          {"lift": 0.15, "baseline": 0.0040, "exposure_share": 0.55, "noise": 0.10},
    "ctv":           {"lift": 0.12, "baseline": 0.0020, "exposure_share": 0.30, "noise": 0.12},
    "youtube":       {"lift": 0.08, "baseline": 0.0030, "exposure_share": 0.50, "noise": 0.10},
    "tiktok":        {"lift": 0.03, "baseline": 0.0025, "exposure_share": 0.40, "noise": 0.14},
    "snap":          {"lift": -0.01, "baseline": 0.0015, "exposure_share": 0.18, "noise": 0.18},
}


def main() -> None:
    geos = json.loads(GEO_PATH.read_text())
    by_pop = sorted(
        (g for g in geos.values() if g.get("population")),
        key=lambda g: g["population"],
        reverse=True,
    )

    test_pool = by_pop[TEST_RANK_RANGE[0] - 1 : TEST_RANK_RANGE[1]]
    ctrl_pool = by_pop[CONTROL_RANK_RANGE[0] - 1 : CONTROL_RANK_RANGE[1]]
    test_geos = random.sample(test_pool, N_TEST)
    ctrl_geos = random.sample(ctrl_pool, N_CONTROL)

    rows: list[str] = ["fips,group,period,channel,outcome,exposures"]

    def gen(group: str, geos_list: list[dict], channel: str, spec: dict) -> list[str]:
        out = []
        true_lift = spec["lift"] if group == "test" else 0.0
        for g in geos_list:
            pop = g["population"]
            # Exposures scale with population × channel-specific share, with jitter
            exposures = int(pop * spec["exposure_share"] * random.uniform(0.85, 1.20))

            # Population-correlated baseline (bigger markets convert better — urban skew)
            log_pop = math.log10(pop)
            pop_modifier = 1 + 0.20 * (log_pop - 5.5)  # +/- ~25% across the range
            true_rate = spec["baseline"] * pop_modifier * (1 + true_lift)
            true_rate = max(1e-5, true_rate)

            # Per-county log-normal random effect
            noise = math.exp(random.gauss(0, spec["noise"]))
            actual_rate = true_rate * noise

            # Sample conversions (Gaussian approx of Binomial is fine at this scale)
            mean_conv = exposures * actual_rate
            std = math.sqrt(max(1.0, mean_conv))
            conv = max(0, int(round(random.gauss(mean_conv, std))))

            out.append(f"{g['fips']},{group},2026-04,{channel},{conv},{exposures}")
        return out

    for ch, spec in CHANNEL_SPEC.items():
        rows.extend(gen("test", test_geos, ch, spec))
        rows.extend(gen("control", ctrl_geos, ch, spec))

    OUT_CSV.write_text("\n".join(rows) + "\n")

    # Truth file
    truth_lines = [
        "Synthetic biased geo-test — ground truth",
        "=" * 60,
        f"Total rows:      {len(rows) - 1}  ({(N_TEST + N_CONTROL) * len(CHANNEL_SPEC)} = "
        f"{N_TEST + N_CONTROL} counties × {len(CHANNEL_SPEC)} channels)",
        f"N test cells:    {N_TEST}",
        f"N control cells: {N_CONTROL}",
        f"Test pool:       counties ranked #{TEST_RANK_RANGE[0]}–{TEST_RANK_RANGE[1]} by pop",
        f"Control pool:    counties ranked #{CONTROL_RANK_RANGE[0]}–{CONTROL_RANK_RANGE[1]} by pop",
        "",
        "True multiplicative lifts per channel (test arm only):",
    ]
    for ch, spec in CHANNEL_SPEC.items():
        sign = "+" if spec["lift"] >= 0 else ""
        truth_lines.append(
            f"  {ch:14s}  {sign}{spec['lift'] * 100:.1f}%   "
            f"(baseline ~{spec['baseline'] * 100:.2f}%, exposure share ~{spec['exposure_share']:.0%})"
        )
    truth_lines += [
        "",
        "Expected analyzer behaviour:",
        "  - Naive lift (raw): biased UP across all channels because test cells",
        "    are larger / denser / wealthier and have a structurally higher baseline rate.",
        "  - Adjusted lift: should recover values close to the true lifts,",
        "    with 95% CIs that contain the truth on most channels.",
        "  - snap should NOT show a significant adjusted lift (true effect is ~0,",
        "    so the CI should straddle zero).",
        "  - tiktok adjusted lift may be marginal — small true effect (3%)",
        "    relative to noise; whether it lands as 'significant' depends on",
        "    the noise realisation but it should be small either way.",
        "  - Selection diagnostic should flag large positive Δ on income, education,",
        "    population, home values, broadband, etc. for test vs control.",
        "",
        "Test counties (sample of 5):",
    ]
    for g in test_geos[:5]:
        truth_lines.append(f"  {g['fips']}  {g['name']}, {g['state']}  pop={g['population']:,}")
    truth_lines.append("Control counties (sample of 5):")
    for g in ctrl_geos[:5]:
        truth_lines.append(f"  {g['fips']}  {g['name']}, {g['state']}  pop={g['population']:,}")

    OUT_TRUTH.write_text("\n".join(truth_lines) + "\n")

    print(f"wrote {OUT_CSV} ({len(rows) - 1} data rows, {len(CHANNEL_SPEC)} channels)")
    print(f"wrote {OUT_TRUTH}")


if __name__ == "__main__":
    main()
