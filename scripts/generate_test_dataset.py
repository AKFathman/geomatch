#!/usr/bin/env python3
"""Generate a realistic, biased synthetic geo-test dataset.

The bias is intentional: test cells skew toward bigger / wealthier / more
educated counties, which is the most common real-world failure mode of geo
test design. The naive lift estimate from this dataset will be too high
(because the test baseline is structurally higher than control); the
covariate-adjusted estimate should recover the true effect.

True effects:
  - meta:    +15% lift (real, detectable)
  - tiktok:  +3% lift (small, likely not significant at this n)

Output: scripts/synthetic_biased_geo_test.csv
Also writes a `_truth.txt` that records the ground-truth parameters so you
can compare them against what the analyzer recovers.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

# Reproducible
random.seed(20260502)

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / "web" / "public" / "data" / "geo_metadata.json"
OUT_CSV = Path(__file__).resolve().parent / "synthetic_biased_geo_test.csv"
OUT_TRUTH = Path(__file__).resolve().parent / "synthetic_biased_geo_test_truth.txt"

# Configuration
N_TEST = 25
N_CONTROL = 25
TRUE_LIFTS = {"meta": 0.15, "tiktok": 0.03}
CHANNELS = list(TRUE_LIFTS.keys())

# How biased? test cells are sampled from population rank 1..40,
# control cells from rank 41..120. Same overall pop range but
# test-skew clearly toward the biggest, denser markets.
TEST_RANK_RANGE = (1, 40)
CONTROL_RANK_RANGE = (41, 120)


def main() -> None:
    geos = json.loads(GEO_PATH.read_text())
    # Sort by population desc, drop counties with no population
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

    def gen(group: str, geos_list: list[dict], channel: str) -> list[str]:
        out = []
        true_lift = TRUE_LIFTS[channel] if group == "test" else 0.0
        for g in geos_list:
            pop = g["population"]
            # Exposures scale with population (impressions / spend proxy)
            # Add 5-15% jitter so it's not perfectly deterministic.
            exposures = int(pop * 0.5 * random.uniform(0.85, 1.15))

            # Baseline conversion rate ~0.5% with structural variation:
            # higher in bigger (richer/denser) markets — mirrors real urban skew
            log_pop = math.log10(pop)
            base_rate = 0.003 + 0.0006 * (log_pop - 5.0)  # ranges ~0.3% .. 0.7%
            base_rate = max(0.001, base_rate)

            # Channel-specific multiplicative noise
            channel_mult = 1.0 if channel == "meta" else 0.6  # tiktok smaller in our world
            true_rate = base_rate * channel_mult * (1 + true_lift)

            # Per-county log-normal noise (county-level random effect)
            noise = math.exp(random.gauss(0, 0.10))
            actual_rate = true_rate * noise

            # Sample conversions ~ Binomial(exposures, actual_rate) — Poisson approx is fine
            mean_conv = exposures * actual_rate
            std = math.sqrt(mean_conv)
            conv = max(0, int(round(random.gauss(mean_conv, std))))

            out.append(f"{g['fips']},{group},2026-04,{channel},{conv},{exposures}")
        return out

    for ch in CHANNELS:
        rows.extend(gen("test", test_geos, ch))
        rows.extend(gen("control", ctrl_geos, ch))

    OUT_CSV.write_text("\n".join(rows) + "\n")

    # Truth file
    truth_lines = [
        "Synthetic biased geo-test — ground truth",
        "=" * 50,
        f"N test cells:    {N_TEST}",
        f"N control cells: {N_CONTROL}",
        f"Channels:        {', '.join(CHANNELS)}",
        f"Test pool:       counties ranked #{TEST_RANK_RANGE[0]}–{TEST_RANK_RANGE[1]} by pop",
        f"Control pool:    counties ranked #{CONTROL_RANK_RANGE[0]}–{CONTROL_RANK_RANGE[1]} by pop",
        "",
        "True multiplicative lifts (test arm only):",
    ]
    for ch, lift in TRUE_LIFTS.items():
        truth_lines.append(f"  {ch:8s}  +{lift * 100:.1f}%")
    truth_lines += [
        "",
        "Expected analyzer behaviour:",
        "  - Naive lift (raw): biased UP because test cells are larger / denser /",
        "    wealthier and have a structurally higher baseline rate.",
        "  - Adjusted lift: should recover ~15% on meta and ~3% on tiktok with",
        "    95% CIs containing the truth.",
        "  - Selection diagnostic: large positive Δ on income, education, population,",
        "    home values for test vs control.",
        "",
        "Test counties (sample of 5):",
    ]
    for g in test_geos[:5]:
        truth_lines.append(f"  {g['fips']}  {g['name']}, {g['state']}  pop={g['population']:,}")
    truth_lines.append("Control counties (sample of 5):")
    for g in ctrl_geos[:5]:
        truth_lines.append(f"  {g['fips']}  {g['name']}, {g['state']}  pop={g['population']:,}")

    OUT_TRUTH.write_text("\n".join(truth_lines) + "\n")

    print(f"wrote {OUT_CSV} ({len(rows) - 1} data rows)")
    print(f"wrote {OUT_TRUTH}")


if __name__ == "__main__":
    main()
