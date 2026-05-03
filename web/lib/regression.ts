/**
 * Ridge regression with sandwich-variance inference.
 *
 * Closed-form OLS/ridge:
 *   β = (XᵀX + λI)⁻¹ Xᵀy   (intercept column not penalized)
 *
 * Sandwich (Huber-White / heteroskedasticity-robust) standard errors,
 * with HC1 finite-sample correction:
 *   V = (n / (n - k)) · (XᵀX)⁻¹ · Xᵀ diag(ε²) X · (XᵀX)⁻¹
 *   where ε = y - Xβ are the residuals.
 *
 * The HC1 correction (n / (n - k)) matters in our regime — at n ≈ k = 30,
 * HC0 is downward-biased by ~2x. With HC1 the CIs/p-values are honest at
 * sample sizes typical of geo tests.
 *
 * For inference we ideally want the unregularized (XᵀX)⁻¹; if the matrix
 * is ill-conditioned we fall back to the ridged inverse and emit a
 * `ridgeFallback` flag so the caller can warn. We also report whether
 * an HC1 correction was applied (it can't be when n ≤ k).
 *
 * Why sandwich rather than classical SEs: geo data is cross-sectional and
 * almost certainly heteroskedastic (variance scales with population, market
 * size, etc.). Sandwich SEs are robust to this.
 */

import { addScaled, eye, inv, matMul, matVec, transpose, twoSidedP } from "./linalg";
import type { Matrix, Vector } from "./linalg";

export interface FitResult {
  coefficients: number[]; // β
  standardErrors: number[]; // robust SE per coefficient
  zScores: number[]; // β / SE
  pValues: number[]; // two-sided
  ci95: Array<[number, number]>; // β ± 1.96 SE
  r2: number; // unadjusted R² — can be negative for ridge fits with weak signal
  n: number;
  k: number; // number of predictors (incl. intercept)
  // Diagnostics
  hc1Applied: boolean; // false when n ≤ k (no DoF correction possible)
  ridgeFallback: boolean; // true if XᵀX was ill-conditioned and we used the ridged inverse for inference
  negativeVariance: number[]; // indices where the sandwich diag was negative beyond floating noise (potential bug — coerced to 0)
}

export function fitRidge(X: Matrix, y: Vector, lambda = 0.1): FitResult {
  const n = X.length;
  const k = X[0].length;
  if (y.length !== n) throw new Error(`fitRidge shape: X has ${n} rows, y has ${y.length}`);
  if (n < k) throw new Error(`fitRidge: n (${n}) must be >= k (${k}) — too few obs`);

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const Xty = matVec(Xt, y);

  // Ridge: (XᵀX + λI)⁻¹ Xᵀy. Don't penalize the intercept (column 0).
  const lambdaMat = eye(k);
  lambdaMat[0][0] = 0;
  const ridged = addScaled(XtX, lambdaMat, lambda);
  const ridgedInv = inv(ridged);
  if (!ridgedInv) {
    throw new Error("design matrix is singular even with ridge regularization");
  }
  const beta = matVec(ridgedInv, Xty);

  // Residuals
  const yHat = matVec(X, beta);
  const eps = y.map((yi, i) => yi - yHat[i]);

  // Sandwich: (XᵀX)⁻¹ · Xᵀ diag(ε²) X · (XᵀX)⁻¹
  // For the inference path, use unregularized XᵀX inverse. If ill-conditioned,
  // fall back to the ridged version and flag it — the SEs become a hybrid that
  // is conservative (slightly biased toward zero) under regularization.
  const rawInv = inv(XtX);
  const ridgeFallback = rawInv === null;
  const XtXinv = rawInv ?? ridgedInv;

  // meat = Xᵀ diag(ε²) X
  const meat = makeMeat(X, eps);
  const sandwich = matMul(matMul(XtXinv, meat), XtXinv);

  // HC1 finite-sample correction: scale by n / (n - k) to remove HC0 bias
  // when n is close to k. When n <= k this isn't possible — leave HC0.
  const hc1Applied = n > k;
  const dofScale = hc1Applied ? n / (n - k) : 1;

  // Track entries where the sandwich diagonal is negative beyond floating
  // noise — these indicate a numerical issue we should surface, not silently
  // hide behind sqrt(max(0, ...)).
  const negativeVariance: number[] = [];
  let maxAbsDiag = 0;
  for (let j = 0; j < k; j++) {
    const v = Math.abs(sandwich[j][j]);
    if (v > maxAbsDiag) maxAbsDiag = v;
  }
  const negTol = -1e-8 * Math.max(1, maxAbsDiag);

  const se = new Array<number>(k);
  for (let j = 0; j < k; j++) {
    const raw = sandwich[j][j] * dofScale;
    if (raw < negTol) negativeVariance.push(j);
    se[j] = Math.sqrt(Math.max(0, raw));
  }

  const z = beta.map((b, j) => (se[j] > 0 ? b / se[j] : 0));
  const p = z.map(twoSidedP);
  const ci95 = beta.map<[number, number]>((b, j) => [b - 1.96 * se[j], b + 1.96 * se[j]]);

  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssTot = y.reduce((a, yi) => a + (yi - yMean) ** 2, 0);
  const ssRes = eps.reduce((a, e) => a + e * e, 0);
  // Note: ridge can produce ssRes > ssTot (negative R²) when λ is large
  // relative to the signal. We return that honestly; the UI clamps at 0.
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    coefficients: beta,
    standardErrors: se,
    zScores: z,
    pValues: p,
    ci95,
    r2,
    n,
    k,
    hc1Applied,
    ridgeFallback,
    negativeVariance,
  };
}

/** Returns Xᵀ diag(ε²) X — the "meat" of the sandwich estimator. */
function makeMeat(X: Matrix, eps: Vector): Matrix {
  const n = X.length;
  const k = X[0].length;
  const M: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    const w = eps[i] * eps[i];
    for (let a = 0; a < k; a++) {
      const xia = xi[a];
      if (xia === 0) continue;
      for (let b = 0; b < k; b++) M[a][b] += w * xia * xi[b];
    }
  }
  return M;
}

/**
 * Welch's two-sample t-test on raw outcomes by treatment group.
 * Returns naive (unadjusted) lift along with its standard error and p-value.
 */
export function naiveLift(
  y: Vector,
  treatment: number[],
): { meanTreated: number; meanControl: number; absLift: number; relLift: number; se: number; p: number } {
  const tVals: number[] = [];
  const cVals: number[] = [];
  for (let i = 0; i < y.length; i++) {
    if (treatment[i] === 1) tVals.push(y[i]);
    else cVals.push(y[i]);
  }
  const meanT = mean(tVals);
  const meanC = mean(cVals);
  const varT = variance(tVals);
  const varC = variance(cVals);
  const seDiff = Math.sqrt(varT / Math.max(1, tVals.length) + varC / Math.max(1, cVals.length));
  const diff = meanT - meanC;
  const z = seDiff > 0 ? diff / seDiff : 0;
  return {
    meanTreated: meanT,
    meanControl: meanC,
    absLift: diff,
    relLift: meanC !== 0 ? diff / meanC : NaN,
    se: seDiff,
    p: twoSidedP(z),
  };
}

function mean(a: Vector): number {
  if (!a.length) return NaN;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}
function variance(a: Vector): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return s / (a.length - 1);
}
