/**
 * Tiny linear-algebra layer — just what the regression needs.
 * Sized for design matrices up to ~1000 obs × ~50 features. Naive
 * implementations are fine at this scale (matrix inverse is O(n³),
 * ~125k ops for n=50 — sub-millisecond).
 */

export type Matrix = number[][]; // row-major
export type Vector = number[];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function eye(n: number): Matrix {
  const M = zeros(n, n);
  for (let i = 0; i < n; i++) M[i][i] = 1;
  return M;
}

export function transpose(A: Matrix): Matrix {
  const r = A.length;
  const c = A[0]?.length ?? 0;
  const T = zeros(c, r);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) T[j][i] = A[i][j];
  }
  return T;
}

export function matMul(A: Matrix, B: Matrix): Matrix {
  const m = A.length;
  const k = A[0].length;
  const n = B[0].length;
  if (B.length !== k)
    throw new Error(`matMul shape mismatch: ${m}×${k} times ${B.length}×${n}`);
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    const rowA = A[i];
    const rowC = C[i];
    for (let p = 0; p < k; p++) {
      const aip = rowA[p];
      const rowB = B[p];
      for (let j = 0; j < n; j++) rowC[j] += aip * rowB[j];
    }
  }
  return C;
}

export function matVec(A: Matrix, x: Vector): Vector {
  const m = A.length;
  const n = A[0].length;
  if (x.length !== n) throw new Error(`matVec shape mismatch: ${m}×${n} · ${x.length}`);
  const y = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    const row = A[i];
    let s = 0;
    for (let j = 0; j < n; j++) s += row[j] * x[j];
    y[i] = s;
  }
  return y;
}

/** Element-wise A + scalar*B. */
export function addScaled(A: Matrix, B: Matrix, scalar = 1): Matrix {
  const m = A.length;
  const n = A[0].length;
  const C = zeros(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) C[i][j] = A[i][j] + scalar * B[i][j];
  }
  return C;
}

/**
 * Inverse via Gauss-Jordan with partial pivoting. Returns null on singular.
 * Adequate for our size. Not numerically stable for ill-conditioned matrices —
 * we mitigate by adding ridge regularization at the call site.
 */
export function inv(A: Matrix): Matrix | null {
  const n = A.length;
  // Augmented [A | I]
  const M = A.map((row, i) => {
    const out = row.slice();
    for (let j = 0; j < n; j++) out.push(i === j ? 1 : 0);
    return out;
  });

  for (let i = 0; i < n; i++) {
    // Partial pivot
    let pivot = i;
    let pivotVal = Math.abs(M[i][i]);
    for (let r = i + 1; r < n; r++) {
      const v = Math.abs(M[r][i]);
      if (v > pivotVal) {
        pivotVal = v;
        pivot = r;
      }
    }
    if (pivotVal < 1e-12) return null; // singular
    if (pivot !== i) [M[i], M[pivot]] = [M[pivot], M[i]];

    // Scale row to make pivot 1
    const inv = 1 / M[i][i];
    for (let j = 0; j < 2 * n; j++) M[i][j] *= inv;

    // Eliminate column i from all other rows
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = M[r][i];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= factor * M[i][j];
    }
  }

  return M.map((row) => row.slice(n));
}

/** Standard normal CDF via Abramowitz & Stegun approx (good to ~7 digits). */
export function normCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Two-sided p-value from a z-statistic. */
export function twoSidedP(z: number): number {
  return 2 * (1 - normCdf(Math.abs(z)));
}
