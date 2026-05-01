/**
 * Industry weight presets — the weights here are expressed in terms of
 * BASE metric names. The matcher expands each base weight across the
 * derived columns (level / slope / YoY / vol / seas) at compute time.
 *
 * Kept in sync with /data/presets/industries.json. Bundled as TS so the
 * frontend doesn't need an extra fetch.
 */

export interface Preset {
  id: string;
  label: string;
  weights: Record<string, number>;
}

export const PRESETS: Preset[] = [
  {
    id: "cpg_grocery",
    label: "CPG / Grocery",
    weights: {
      median_household_income: 0.2,
      avg_household_size: 0.15,
      population_total: 0.1,
      median_age: 0.1,
      per_capita_income: 0.15,
      median_home_value: 0.1,
      bachelors_plus_share: 0.1,
      median_gross_rent: 0.1,
    },
  },
  {
    id: "streaming_svod",
    label: "Streaming / SVOD",
    weights: {
      median_household_income: 0.15,
      median_age: 0.15,
      bachelors_plus_share: 0.2,
      avg_household_size: 0.1,
      population_total: 0.1,
      median_gross_rent: 0.1,
      per_capita_income: 0.1,
      median_home_value: 0.1,
    },
  },
  {
    id: "travel_hospitality",
    label: "Travel / Hospitality",
    weights: {
      per_capita_income: 0.2,
      median_household_income: 0.15,
      median_age: 0.15,
      bachelors_plus_share: 0.1,
      median_home_value: 0.1,
      population_total: 0.1,
      avg_household_size: 0.1,
      median_gross_rent: 0.1,
    },
  },
];

/** Friendly labels for base metric names, used in the weight sliders. */
export const METRIC_LABELS: Record<string, string> = {
  median_household_income: "Household income",
  per_capita_income: "Per-capita income",
  bachelors_plus_share: "Education (bachelor's+)",
  median_age: "Median age",
  population_total: "Population",
  avg_household_size: "Household size",
  median_home_value: "Home values",
  median_gross_rent: "Rent",
  total_housing_units: "Housing supply",
  vacant_units: "Vacancy",
  commute_60plus_min: "Long-commute share",
  per_capita_personal_income: "Personal income / capita",
  zhvi_home_value: "Home values (Zillow)",
  zori_rent_index: "Rent index (Zillow)",
};

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
