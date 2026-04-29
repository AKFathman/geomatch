/**
 * Matching algorithm — weighted nearest-neighbors in feature space.
 *
 * Inputs:
 *   - features:  Map<fips, Record<feature, number>>  — z-scored already
 *   - target:    fips of the test market
 *   - weights:   Record<feature, number>  — sums to 1.0
 *   - filters:   { popBand?: [min, max], excludeFips?: Set<string> }
 *
 * Output: ranked list of { fips, distance, contributions }.
 *
 * The contributions map shows per-feature signed deltas weighted, so the UI can
 * explain *why* a county matched (or didn't).
 */

export interface MatchFilters {
  popBand?: [number, number];
  excludeFips?: Set<string>;
  minOverlap?: number; // require at least this many non-null shared features
}

export interface MatchResult {
  fips: string;
  distance: number;
  contributions: Record<string, number>;
}

export function weightedDistance(
  target: Record<string, number>,
  candidate: Record<string, number>,
  weights: Record<string, number>,
): { distance: number; contributions: Record<string, number>; overlap: number } {
  let sum = 0;
  let overlap = 0;
  const contributions: Record<string, number> = {};
  for (const feat of Object.keys(weights)) {
    const w = weights[feat];
    const a = target[feat];
    const b = candidate[feat];
    if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) continue;
    const sq = (a - b) ** 2;
    const contrib = w * sq;
    contributions[feat] = contrib;
    sum += contrib;
    overlap += 1;
  }
  return { distance: Math.sqrt(sum), contributions, overlap };
}

export function findMatches(
  features: Map<string, Record<string, number>>,
  populations: Map<string, number>,
  targetFips: string,
  weights: Record<string, number>,
  filters: MatchFilters = {},
  topK = 25,
): MatchResult[] {
  const target = features.get(targetFips);
  if (!target) throw new Error(`unknown target fips: ${targetFips}`);
  const targetPop = populations.get(targetFips);

  const minOverlap = filters.minOverlap ?? Math.ceil(Object.keys(weights).length * 0.6);
  const results: MatchResult[] = [];

  for (const [fips, vec] of features) {
    if (fips === targetFips) continue;
    if (filters.excludeFips?.has(fips)) continue;
    if (filters.popBand && targetPop != null) {
      const pop = populations.get(fips);
      if (pop == null) continue;
      const ratio = pop / targetPop;
      if (ratio < filters.popBand[0] || ratio > filters.popBand[1]) continue;
    }
    const { distance, contributions, overlap } = weightedDistance(target, vec, weights);
    if (overlap < minOverlap) continue;
    results.push({ fips, distance, contributions });
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, topK);
}
