/**
 * Logistic regression with ridge regularization, fit by IRLS / Newton-Raphson.
 *
 *   minimize_β  -Σ [y_i log(p_i) + (1-y_i) log(1-p_i)] + (λ/2)·||β_{1:k}||²
 *   where p_i = sigmoid(x_iᵀβ)
 *
 * The intercept (column 0 of X) is not penalized.
 *
 * IRLS update:
 *   β^(t+1) = β^(t) + (XᵀWX + λI′)⁻¹ · [Xᵀ(y − p) − λI′·β^(t)]
 *   W = diag(p_i (1 − p_i))
 *
 * Used to estimate propensity scores P(T=1 | X) for the doubly-robust
 * estimator. Ridge prevents non-convergence on near-perfect-separation
 * (which is common when test/control are systematically skewed on covariates —
 * exactly our motivating use case).
 */

import { addScaled, eye, inv, matVec, transpose } from "./linalg";
import type { Matrix, Vector } from "./linalg";

export interface LogisticFit {
  coefficients: number[];
  iterations: number;
  converged: boolean;
  finalLogLik: number;
  pseudoR2: number; // McFadden's: 1 − logLikFull / logLikNull. Range typically 0–0.5.
  warnings: string[];
}

const sigmoid = (x: number): number => {
  // Guard against overflow in exp for very negative inputs
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
};

export function fitLogistic(
  X: Matrix,
  y: Vector,
  lambda = 1.0,
  maxIter = 50,
  tol = 1e-6,
): LogisticFit {
  const n = X.length;
  const k = X[0].length;
  if (y.length !== n)
    throw new Error(`fitLogistic shape mismatch: X has ${n} rows, y has ${y.length}`);

  const warnings: string[] = [];

  // Initialize: intercept at logit(ȳ), others at 0
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const yMeanClipped = Math.max(0.01, Math.min(0.99, yMean));
  const beta = new Array<number>(k).fill(0);
  beta[0] = Math.log(yMeanClipped / (1 - yMeanClipped));

  const Xt = transpose(X);
  const lambdaMat = eye(k);
  lambdaMat[0][0] = 0; // don't penalize intercept

  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    // p_i = sigmoid(x_iᵀ β)
    const eta = matVec(X, beta);
    const p = eta.map(sigmoid);

    // Working weights W = p(1-p), with a tiny floor to keep the Hessian well-conditioned
    const w = p.map((pi) => Math.max(1e-6, pi * (1 - pi)));

    // XᵀWX (compute directly to avoid intermediate diag(w) * X allocation)
    const XtWX: Matrix = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      const wi = w[i];
      for (let a = 0; a < k; a++) {
        const xia = xi[a];
        if (xia === 0) continue;
        for (let b = 0; b < k; b++) XtWX[a][b] += wi * xia * xi[b];
      }
    }
    const hessian = addScaled(XtWX, lambdaMat, lambda);

    // Score: Xᵀ(y - p) − λ · I' · β  (penalty gradient applied to non-intercept)
    const score = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      const r = y[i] - p[i];
      for (let j = 0; j < k; j++) score[j] += xi[j] * r;
    }
    for (let j = 0; j < k; j++) score[j] -= lambda * lambdaMat[j][j] * beta[j];

    const hessianInv = inv(hessian);
    if (!hessianInv) {
      warnings.push(`Hessian singular at iteration ${iter}; bailing out`);
      break;
    }

    const delta = matVec(hessianInv, score);

    // Step damping: if a Newton step would blow up the log-likelihood, halve it.
    // Bounds the step so coefficients can't fly off on a near-perfect-separation iteration.
    let stepSize = 1.0;
    let newBeta = beta.map((b, j) => b + stepSize * delta[j]);
    let newLL = computeLogLik(X, y, newBeta);
    let oldLL = computeLogLik(X, y, beta);
    let backtracks = 0;
    while (newLL < oldLL - 1e-8 && backtracks < 10) {
      stepSize *= 0.5;
      newBeta = beta.map((b, j) => b + stepSize * delta[j]);
      newLL = computeLogLik(X, y, newBeta);
      backtracks++;
    }

    const stepNorm = Math.sqrt(delta.reduce((a, d) => a + (stepSize * d) ** 2, 0));
    for (let j = 0; j < k; j++) beta[j] = newBeta[j];

    if (stepNorm < tol) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    warnings.push(`Did not converge in ${maxIter} iterations`);
  }

  const finalLogLik = computeLogLik(X, y, beta);
  const yMeanGlobal = y.reduce((a, b) => a + b, 0) / n;
  const pNull = Math.max(1e-15, Math.min(1 - 1e-15, yMeanGlobal));
  const logLikNull =
    n * (yMeanGlobal * Math.log(pNull) + (1 - yMeanGlobal) * Math.log(1 - pNull));
  const pseudoR2 = logLikNull !== 0 ? 1 - finalLogLik / logLikNull : 0;

  return {
    coefficients: beta,
    iterations: iter + 1,
    converged,
    finalLogLik,
    pseudoR2,
    warnings,
  };
}

function computeLogLik(X: Matrix, y: Vector, beta: Vector): number {
  const n = X.length;
  let ll = 0;
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    let eta = 0;
    for (let j = 0; j < xi.length; j++) eta += xi[j] * beta[j];
    const p = sigmoid(eta);
    const pSafe = Math.max(1e-15, Math.min(1 - 1e-15, p));
    ll += y[i] * Math.log(pSafe) + (1 - y[i]) * Math.log(1 - pSafe);
  }
  return ll;
}

export function predictLogistic(X: Matrix, beta: Vector): Vector {
  const out = new Array<number>(X.length);
  for (let i = 0; i < X.length; i++) {
    const xi = X[i];
    let eta = 0;
    for (let j = 0; j < xi.length; j++) eta += xi[j] * beta[j];
    out[i] = sigmoid(eta);
  }
  return out;
}
