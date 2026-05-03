/**
 * Doubly-robust (AIPW) estimator for the average treatment effect.
 *
 * AIPW = (1/n) Σ ψ_i,  where the influence function is
 *
 *   ψ_i = μ̂₁(x_i) − μ̂₀(x_i)
 *         + T_i  · (Y_i − μ̂₁(x_i)) / ê(x_i)
 *         − (1 − T_i) · (Y_i − μ̂₀(x_i)) / (1 − ê(x_i))
 *
 *   ê(x)  = propensity score, P(T=1 | X=x), fit by ridge logistic regression
 *   μ̂₀(x) = outcome model on control rows, fit by ridge regression
 *   μ̂₁(x) = outcome model on treated rows, fit by ridge regression
 *
 * Variance via the influence-function:
 *   Var(τ̂) = (1/n²) · Σ (ψ_i − τ̂)²
 *
 * "Doubly robust" means: τ̂ is consistent for the true ATE if EITHER the
 * outcome model OR the propensity model is correctly specified — you only
 * need one to be right. Compare to plain regression adjustment, which
 * requires the outcome model to be correct.
 *
 * Practical caveats encoded in the implementation:
 *   - Trim extreme propensities (default to [0.05, 0.95]) — extreme weights
 *     can blow up the IPW correction. Surfaced as `nTrimmed`.
 *   - Separate outcome models on test/control require ≥3 obs per arm.
 *   - With n ≈ k per arm and ridge, the outcome models are stable but biased
 *     toward zero treatment-effect heterogeneity. That's a fine trade for
 *     small-sample geo tests.
 */

import { fitRidge } from "./regression";
import { fitLogistic, predictLogistic } from "./propensity";
import { twoSidedP } from "./linalg";
import type { Matrix, Vector } from "./linalg";

export interface DrResult {
  estimate: number; // ATE in absolute (raw outcome) units
  se: number;
  ci95: [number, number];
  p: number;
  // Diagnostics
  propensityScores: number[]; // ê(x_i) post-trim, in input order
  meanPropensity: number;
  minPropensity: number;
  maxPropensity: number;
  nTrimmed: number;
  propensityR2: number; // McFadden's pseudo-R²
  outcomeR2Control: number;
  outcomeR2Treated: number;
  // Pass-through
  warnings: string[];
}

export interface DrOptions {
  /** Clip ê(x) to [trim, 1-trim] before computing the IPW correction. Default 0.05. */
  trim?: number;
  /** Ridge lambda for the propensity (logistic) model. Default 1.0. */
  lambdaProp?: number;
  /** Ridge lambda for the outcome models. Default scales with k/n. */
  lambdaOutcome?: number;
}

export function fitDr(
  Xfeat: Matrix, // design matrix WITHOUT treatment column: [intercept, ...features]
  y: Vector,
  treatment: number[], // 0/1
  options: DrOptions = {},
): DrResult {
  const n = Xfeat.length;
  if (y.length !== n) throw new Error(`fitDr: y has ${y.length} rows, X has ${n}`);
  if (treatment.length !== n)
    throw new Error(`fitDr: treatment has ${treatment.length} rows, X has ${n}`);

  const k = Xfeat[0].length;
  const trim = options.trim ?? 0.05;
  const lambdaProp = options.lambdaProp ?? 1.0;
  const lambdaOutcome = options.lambdaOutcome ?? Math.max(0.5, (k / Math.max(1, n)) * 5);
  const warnings: string[] = [];

  // --- Step 1: propensity model ---
  const propFit = fitLogistic(Xfeat, treatment, lambdaProp);
  if (!propFit.converged) {
    warnings.push("Propensity model did not converge — DR estimate unreliable");
  }
  if (propFit.warnings.length) warnings.push(...propFit.warnings);

  let pRaw = predictLogistic(Xfeat, propFit.coefficients);

  // Trim extreme propensities to [trim, 1-trim]
  let nTrimmed = 0;
  const pScores = pRaw.map((p) => {
    if (!Number.isFinite(p)) {
      nTrimmed++;
      return 0.5;
    }
    if (p < trim) {
      nTrimmed++;
      return trim;
    }
    if (p > 1 - trim) {
      nTrimmed++;
      return 1 - trim;
    }
    return p;
  });
  if (nTrimmed > n * 0.2) {
    warnings.push(
      `${nTrimmed} of ${n} propensity scores were trimmed at [${trim}, ${1 - trim}] — poor overlap between test and control covariates`,
    );
  }

  const minP = Math.min(...pScores);
  const maxP = Math.max(...pScores);
  const meanP = pScores.reduce((a, b) => a + b, 0) / n;

  // --- Step 2: separate outcome models on control / treated ---
  const controlIdx: number[] = [];
  const treatedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (treatment[i] === 1) treatedIdx.push(i);
    else controlIdx.push(i);
  }
  if (controlIdx.length < 3 || treatedIdx.length < 3) {
    throw new Error(
      `Too few obs for separate outcome models: ${controlIdx.length} control, ${treatedIdx.length} treated`,
    );
  }

  const Xc = controlIdx.map((i) => Xfeat[i]);
  const yc = controlIdx.map((i) => y[i]);
  const Xtr = treatedIdx.map((i) => Xfeat[i]);
  const ytr = treatedIdx.map((i) => y[i]);

  const fit0 = fitRidge(Xc, yc, lambdaOutcome);
  const fit1 = fitRidge(Xtr, ytr, lambdaOutcome);

  // --- Step 3: predict μ̂₀(x_i), μ̂₁(x_i) for ALL i ---
  const mu0: number[] = new Array(n);
  const mu1: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let s0 = 0;
    let s1 = 0;
    const xi = Xfeat[i];
    for (let j = 0; j < k; j++) {
      s0 += fit0.coefficients[j] * xi[j];
      s1 += fit1.coefficients[j] * xi[j];
    }
    mu0[i] = s0;
    mu1[i] = s1;
  }

  // --- Step 4: AIPW influence function and estimate ---
  const psi: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = pScores[i];
    const T = treatment[i];
    const ipw1 = T === 1 ? (y[i] - mu1[i]) / e : 0;
    const ipw0 = T === 0 ? (y[i] - mu0[i]) / (1 - e) : 0;
    psi[i] = mu1[i] - mu0[i] + ipw1 - ipw0;
  }
  const estimate = psi.reduce((a, b) => a + b, 0) / n;

  // SE: (1/n²) · Σ (ψ_i − τ̂)²
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += (psi[i] - estimate) ** 2;
  const variance = sumSq / (n * n);
  const se = Math.sqrt(Math.max(0, variance));

  const z = se > 0 ? estimate / se : 0;
  const p = twoSidedP(z);
  const ci95: [number, number] = [estimate - 1.96 * se, estimate + 1.96 * se];

  return {
    estimate,
    se,
    ci95,
    p,
    propensityScores: pScores,
    meanPropensity: meanP,
    minPropensity: minP,
    maxPropensity: maxP,
    nTrimmed,
    propensityR2: propFit.pseudoR2,
    outcomeR2Control: fit0.r2,
    outcomeR2Treated: fit1.r2,
    warnings,
  };
}
