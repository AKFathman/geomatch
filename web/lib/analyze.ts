/**
 * Top-level orchestration for the lift analyzer.
 *
 * Inputs:
 *   - parsed CSV rows (fips, group, outcome, optional exposures/channel)
 *   - feature matrix (Map<fips, Record<feat, number>>) — z-scored
 *
 * Pipeline per channel (or pooled if no channel column):
 *   1. Filter to rows whose fips is in the feature matrix
 *   2. Compute outcome variable: outcome/exposures if exposures provided, else outcome
 *   3. Compute naive lift (Welch's t-test on raw outcomes by group)
 *   4. Build design matrix X = [1, treatment, ...level features]
 *   5. Fit ridge regression
 *   6. Pull treatment coefficient + sandwich SE → CI, p-value
 *   7. Convert to relative lift using control mean
 *   8. Selection diagnostic: which features differ most between groups (Welch's t)
 *
 * We use only `__level` features (~25) rather than all 100+ to keep the
 * regression well-conditioned for typical geo-test sizes (50–200 markets).
 * Slopes/YoY/vol are still in the matcher; here we want the level snapshot.
 */

import { fitRidge, naiveLift } from "./regression";
import type { RawRow } from "./csv";
import { twoSidedP } from "./linalg";

export interface ChannelResult {
  channel: string | null; // null = pooled
  n: number;
  nTest: number;
  nControl: number;
  droppedNoFeatures: number; // rows whose fips wasn't in the matrix
  controlMean: number;
  // Naive (raw, no covariate adjustment)
  naiveAbsLift: number;
  naiveRelLift: number;
  naiveP: number;
  // Adjusted (regression with covariates)
  adjAbsLift: number;
  adjRelLift: number;
  adjAbsLiftCi95: [number, number];
  adjRelLiftCi95: [number, number];
  adjSe: number;
  adjP: number;
  r2: number;
  // Selection diagnostic
  selection: SelectionDiag[];
  // Warnings
  warnings: string[];
}

export interface SelectionDiag {
  feature: string;
  baseLabel: string;
  testMeanZ: number;
  controlMeanZ: number;
  diff: number; // testMean - controlMean
  p: number;
}

export interface AnalysisOutput {
  channels: ChannelResult[];
  totalRows: number;
  matchedRows: number;
}

const FEATURE_PREFIXES_TO_USE = ["__level"]; // only level z-scores in v2A

function selectFeatures(allFeatureNames: string[]): string[] {
  return allFeatureNames.filter((f) =>
    FEATURE_PREFIXES_TO_USE.some((suffix) => f.endsWith(suffix)),
  );
}

function meanOf(a: number[]): number {
  if (!a.length) return 0;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}
function varianceOf(a: number[]): number {
  if (a.length < 2) return 0;
  const m = meanOf(a);
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return s / (a.length - 1);
}

function selectionDiag(
  rows: { fips: string; group: "test" | "control" }[],
  features: Map<string, Record<string, number>>,
  featureNames: string[],
  topK = 8,
): SelectionDiag[] {
  const out: SelectionDiag[] = [];
  for (const f of featureNames) {
    const tVals: number[] = [];
    const cVals: number[] = [];
    for (const r of rows) {
      const vec = features.get(r.fips);
      if (!vec) continue;
      const v = vec[f];
      if (v == null || Number.isNaN(v)) continue;
      if (r.group === "test") tVals.push(v);
      else cVals.push(v);
    }
    if (tVals.length < 2 || cVals.length < 2) continue;
    const tm = meanOf(tVals);
    const cm = meanOf(cVals);
    const se = Math.sqrt(varianceOf(tVals) / tVals.length + varianceOf(cVals) / cVals.length);
    const z = se > 0 ? (tm - cm) / se : 0;
    const p = twoSidedP(z);
    const base = f.replace(/__(level|slope|yoy|vol|seas)$/, "");
    out.push({
      feature: f,
      baseLabel: base,
      testMeanZ: tm,
      controlMeanZ: cm,
      diff: tm - cm,
      p,
    });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, topK);
}

function analyzeOneChannel(
  channelRows: RawRow[],
  features: Map<string, Record<string, number>>,
  featureNames: string[],
  channel: string | null,
): ChannelResult {
  const usedFeatures = selectFeatures(featureNames);
  const warnings: string[] = [];

  // Filter to rows with a feature vector
  const total = channelRows.length;
  const kept: { fips: string; group: "test" | "control"; y: number; vec: Record<string, number> }[] = [];
  let dropped = 0;
  for (const r of channelRows) {
    const vec = features.get(r.fips);
    if (!vec) {
      dropped++;
      continue;
    }
    // Outcome: rate if exposures provided (and >0), else raw count
    const y =
      r.exposures != null && r.exposures > 0 ? r.outcome / r.exposures : r.outcome;
    if (!Number.isFinite(y)) {
      dropped++;
      continue;
    }
    kept.push({ fips: r.fips, group: r.group, y, vec });
  }

  // Single pass over kept[] for all of: nTest, nControl, yArr, tArr, controlMean,
  // and a flag for whether we observed a true-zero control mean.
  const n = kept.length;
  const yArr: number[] = new Array(n);
  const tArr: number[] = new Array(n);
  let nTest = 0;
  let nControl = 0;
  let controlSum = 0;
  for (let i = 0; i < n; i++) {
    const r = kept[i];
    yArr[i] = r.y;
    if (r.group === "test") {
      tArr[i] = 1;
      nTest++;
    } else {
      tArr[i] = 0;
      nControl++;
      controlSum += r.y;
    }
  }
  const controlMeanRaw = nControl > 0 ? controlSum / nControl : NaN;
  // If the control mean is zero (or non-finite), relative lift is undefined —
  // do NOT silently substitute 1e-12 (that produces astronomical % numbers).
  // Downstream rendering treats NaN as "—".
  const controlMean = Number.isFinite(controlMeanRaw) && controlMeanRaw !== 0 ? controlMeanRaw : NaN;

  // Naive
  const naive = naiveLift(yArr, tArr);

  // Selection diagnostic — does test/control differ on covariates?
  const selection = selectionDiag(
    kept.map((k) => ({ fips: k.fips, group: k.group })),
    features,
    usedFeatures,
  );

  // Quick guards
  if (nTest < 3 || nControl < 3) {
    warnings.push(
      `Very small sample: ${nTest} test + ${nControl} control. Adjusted estimates will be unstable.`,
    );
  }
  if (n < usedFeatures.length + 3) {
    warnings.push(
      `Few observations (${n}) vs covariates (${usedFeatures.length}). Results lean heavily on the ridge prior.`,
    );
  }

  // Adjusted regression
  let adjAbsLift = NaN;
  let adjAbsLiftCi95: [number, number] = [NaN, NaN];
  let adjSe = NaN;
  let adjP = NaN;
  let r2 = NaN;
  try {
    // Design matrix: [1, treatment, ...features]
    const X: number[][] = kept.map((k) => {
      const row = [1, k.group === "test" ? 1 : 0];
      for (const f of usedFeatures) {
        const v = k.vec[f];
        row.push(Number.isFinite(v) ? v : 0);
      }
      return row;
    });
    // Choose lambda based on n vs k — heavier shrinkage when overdetermined.
    // Floor of 0.5 protects against pathological well-conditioned cases.
    const lambda = Math.max(0.5, (usedFeatures.length / Math.max(1, n)) * 5);
    const fit = fitRidge(X, yArr, lambda);
    adjAbsLift = fit.coefficients[1]; // treatment is column 1
    adjAbsLiftCi95 = fit.ci95[1];
    adjSe = fit.standardErrors[1];
    adjP = fit.pValues[1];
    r2 = fit.r2;
    // Surface fit diagnostics so the UI can disclose them
    if (!fit.hc1Applied) {
      warnings.push(
        `n (${fit.n}) ≤ k (${fit.k}); HC1 finite-sample correction not applied — CIs may be slightly narrow.`,
      );
    }
    if (fit.ridgeFallback) {
      warnings.push(
        "XᵀX was ill-conditioned; sandwich SEs computed using the ridged inverse (slightly conservative bias).",
      );
    }
    if (fit.negativeVariance.length) {
      warnings.push(
        `Sandwich diagonal had ${fit.negativeVariance.length} negative entry(ies) beyond floating noise — coerced to 0; treat associated SEs with suspicion.`,
      );
    }
  } catch (e) {
    warnings.push(
      `Regression failed: ${e instanceof Error ? e.message : String(e)}. Showing naive estimate only.`,
    );
  }

  // Convert absolute lift to relative. If control mean is zero or non-finite,
  // the relative lift is undefined — leave as NaN, the UI renders as "—".
  const adjRelLift = Number.isFinite(controlMean) ? adjAbsLift / controlMean : NaN;
  const adjRelLiftCi95: [number, number] = Number.isFinite(controlMean)
    ? [adjAbsLiftCi95[0] / controlMean, adjAbsLiftCi95[1] / controlMean]
    : [NaN, NaN];

  return {
    channel,
    n,
    nTest,
    nControl,
    droppedNoFeatures: dropped,
    // Pass through whatever we computed (NaN if control mean was zero/missing);
    // ChannelResult consumers handle NaN appropriately.
    controlMean: Number.isFinite(controlMean) ? controlMean : 0,
    naiveAbsLift: naive.absLift,
    naiveRelLift: naive.relLift,
    naiveP: naive.p,
    adjAbsLift,
    adjRelLift,
    adjAbsLiftCi95,
    adjRelLiftCi95,
    adjSe,
    adjP,
    r2,
    selection,
    warnings,
  };
}

export function analyze(
  rows: RawRow[],
  features: Map<string, Record<string, number>>,
  featureNames: string[],
): AnalysisOutput {
  const channels = new Set<string>();
  for (const r of rows) if (r.channel) channels.add(r.channel);

  const channelResults: ChannelResult[] = [];
  if (!channels.size) {
    channelResults.push(analyzeOneChannel(rows, features, featureNames, null));
  } else {
    // Pooled first, then per-channel. analyzeOneChannel is read-only on rows;
    // no need to deep-copy.
    channelResults.push(analyzeOneChannel(rows, features, featureNames, null));
    for (const ch of Array.from(channels).sort()) {
      const subset = rows.filter((r) => r.channel === ch);
      channelResults.push(analyzeOneChannel(subset, features, featureNames, ch));
    }
  }

  const matched = channelResults[0].n;
  return {
    channels: channelResults,
    totalRows: rows.length,
    matchedRows: matched,
  };
}
