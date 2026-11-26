/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

/**
 * MatrixSolver: High-performance linear equation solver for Modified Nodal Analysis (MNA).
 * Solves [A][x] = [b] using Gaussian Elimination with Partial Pivoting.
 * Designed with numerical stability checks, singular matrix detection, and SI unit fidelity.
 */

export type MatrixSolverStatus =
  | 'VALID'
  | 'UNRESOLVED'
  | 'UNSTABLE'
  | 'NON_FINITE';

export interface MatrixSolverDiagnosticsOptions {
  singularThreshold?: number;
  residualTolerance?: number;
  allowRegularization?: boolean;
}

export interface MatrixSolverDiagnosticsResult {
  solution: number[];
  /** Null for any index that is unresolved, singular, or non-finite — never silently coerced to a valid 0V reading */
  validatedSolution: Array<number | null>;
  status: MatrixSolverStatus;
  unresolvedIndices: number[];
  maxResidual: number;
  isResidualValid: boolean;
  hasNonFinite: boolean;
  conditionEstimate: number;
  warnings: string[];
}

export class MatrixSolver {
  private static readonly GMIN_REGULARIZATION = 1e-12;
  private static readonly SINGULAR_THRESHOLD = 1e-18;
  private static readonly DEFAULT_RESIDUAL_TOLERANCE = 1e-5;

  /**
   * Solves the linear system A * x = b with full numerical diagnostics:
   * - Detects floating / singular rows before Gmin regularization
   * - Detects non-finite (NaN / Infinity) inputs and outputs
   * - Validates the solution residual ||A*x - b||_inf against tolerance
   * - Never silently converts an unresolved index into a valid 0V reading in validatedSolution
   */
  public static solveWithDiagnostics(
    A: number[][],
    b: number[],
    options: MatrixSolverDiagnosticsOptions = {}
  ): MatrixSolverDiagnosticsResult {
    const n = b.length;
    if (n === 0) {
      return {
        solution: [],
        validatedSolution: [],
        status: 'VALID',
        unresolvedIndices: [],
        maxResidual: 0,
        isResidualValid: true,
        hasNonFinite: false,
        conditionEstimate: 1,
        warnings: [],
      };
    }

    if (A.length !== n || A.some((row) => !Array.isArray(row) || row.length !== n)) {
      throw new Error(`Matrix dimension mismatch: A is ${A.length}x${A[0]?.length || 0}, b is ${n}`);
    }

    const singularThreshold = options.singularThreshold ?? this.SINGULAR_THRESHOLD;
    const residualTolerance = options.residualTolerance ?? this.DEFAULT_RESIDUAL_TOLERANCE;
    const allowRegularization = options.allowRegularization ?? true;
    const warnings: string[] = [];
    const unresolvedSet = new Set<number>();

    // 0. Check for non-finite inputs or zero rows/columns (completely unreferenced floating nodes)
    let hasNonFiniteInput = false;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(b[i])) {
        hasNonFiniteInput = true;
      }
      let rowMaxAbs = 0;
      let colMaxAbs = 0;
      for (let j = 0; j < n; j++) {
        const aij = A[i][j];
        const aji = A[j][i];
        if (!Number.isFinite(aij)) {
          hasNonFiniteInput = true;
        }
        if (Math.abs(aij) > rowMaxAbs) rowMaxAbs = Math.abs(aij);
        if (Math.abs(aji) > colMaxAbs) colMaxAbs = Math.abs(aji);
      }
      if (rowMaxAbs < singularThreshold || colMaxAbs < singularThreshold) {
        unresolvedSet.add(i);
      }
    }

    if (hasNonFiniteInput) {
      return {
        solution: new Array(n).fill(NaN),
        validatedSolution: new Array(n).fill(null),
        status: 'NON_FINITE',
        unresolvedIndices: Array.from({ length: n }, (_, idx) => idx),
        maxResidual: Infinity,
        isResidualValid: false,
        hasNonFinite: true,
        conditionEstimate: Infinity,
        warnings: ['Non-finite values (NaN or Infinity) detected in input matrix A or vector b.'],
      };
    }

    // Deep copies for elimination so we can compute exact residuals against original A and b
    const M: number[][] = Array.from({ length: n }, (_, i) => [...A[i]]);
    const rhs: number[] = [...b];
    const rowPermutation: number[] = Array.from({ length: n }, (_, i) => i);

    let minPivotAbs = Infinity;
    let maxPivotAbs = 0;

    for (let k = 0; k < n; k++) {
      let maxRow = k;
      let maxVal = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(M[i][k]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      if (maxRow !== k) {
        const tempRow = M[k];
        M[k] = M[maxRow];
        M[maxRow] = tempRow;

        const tempRhs = rhs[k];
        rhs[k] = rhs[maxRow];
        rhs[maxRow] = tempRhs;

        const tempIdx = rowPermutation[k];
        rowPermutation[k] = rowPermutation[maxRow];
        rowPermutation[maxRow] = tempIdx;
      }

      const rawPivotAbs = Math.abs(M[k][k]);
      if (rawPivotAbs < singularThreshold) {
        unresolvedSet.add(rowPermutation[k]);
        unresolvedSet.add(k);
        warnings.push(
          `Singular or floating pivot detected at step ${k} (original equation ${rowPermutation[k]}, |pivot|=${rawPivotAbs.toExponential(2)}).`
        );
        if (allowRegularization) {
          M[k][k] = this.GMIN_REGULARIZATION;
        }
      } else {
        if (rawPivotAbs < minPivotAbs) minPivotAbs = rawPivotAbs;
        if (rawPivotAbs > maxPivotAbs) maxPivotAbs = rawPivotAbs;
      }

      const pivot = M[k][k];
      if (Math.abs(pivot) < singularThreshold) {
        continue;
      }

      for (let i = k + 1; i < n; i++) {
        const subVal = M[i][k];
        if (subVal !== 0) {
          const factor = subVal / pivot;
          rhs[i] -= factor * rhs[k];
          M[i][k] = 0;
          for (let j = k + 1; j < n; j++) {
            M[i][j] -= factor * M[k][j];
          }
        }
      }
    }

    // Back Substitution
    const x: number[] = new Array(n).fill(0);
    let hasNonFiniteOutput = false;
    for (let i = n - 1; i >= 0; i--) {
      let sum = rhs[i];
      for (let j = i + 1; j < n; j++) {
        sum -= M[i][j] * x[j];
      }
      const diag = M[i][i];
      if (Math.abs(diag) < singularThreshold) {
        unresolvedSet.add(i);
        x[i] = allowRegularization ? 0 : NaN;
      } else {
        x[i] = sum / diag;
      }
      if (!Number.isFinite(x[i])) {
        hasNonFiniteOutput = true;
      }
    }

    // Residual validation: ||A * x - b||_inf
    let maxResidual = 0;
    if (!hasNonFiniteOutput) {
      for (let i = 0; i < n; i++) {
        let ax = 0;
        for (let j = 0; j < n; j++) {
          ax += A[i][j] * x[j];
        }
        const res = Math.abs(ax - b[i]);
        if (!Number.isFinite(res)) {
          hasNonFiniteOutput = true;
          maxResidual = Infinity;
          break;
        }
        if (res > maxResidual) {
          maxResidual = res;
        }
      }
    } else {
      maxResidual = Infinity;
    }

    const conditionEstimate =
      minPivotAbs > 0 && Number.isFinite(minPivotAbs) && maxPivotAbs > 0
        ? maxPivotAbs / minPivotAbs
        : Infinity;

    const isResidualValid = !hasNonFiniteOutput && maxResidual <= residualTolerance;
    if (!isResidualValid && !hasNonFiniteOutput) {
      warnings.push(
        `Residual validation warning: maxResidual=${maxResidual.toExponential(3)} exceeds tolerance ${residualTolerance.toExponential(1)}.`
      );
    }

    const unresolvedIndices = Array.from(unresolvedSet).sort((a, b) => a - b);
    let status: MatrixSolverStatus = 'VALID';
    if (hasNonFiniteOutput) {
      status = 'NON_FINITE';
    } else if (unresolvedIndices.length > 0) {
      status = 'UNRESOLVED';
    } else if (!isResidualValid || conditionEstimate > 1e14) {
      status = 'UNSTABLE';
      if (conditionEstimate > 1e14) {
        warnings.push(
          `Ill-conditioned system detected (condition estimate ~${conditionEstimate.toExponential(2)}).`
        );
      }
    }

    const validatedSolution: Array<number | null> = x.map((val, idx) => {
      if (hasNonFiniteOutput || !Number.isFinite(val)) return null;
      if (unresolvedSet.has(idx)) return null;
      return val;
    });

    return {
      solution: x,
      validatedSolution,
      status,
      unresolvedIndices,
      maxResidual,
      isResidualValid,
      hasNonFinite: hasNonFiniteOutput,
      conditionEstimate,
      warnings,
    };
  }

  /**
   * Solves the linear system A * x = b without mutating the input arrays.
   * @param A Square matrix of size N x N (conductances and branch incidence)
   * @param b Right-hand side vector of size N (currents and voltage sources)
   * @returns Solution vector x of size N (node voltages and branch currents)
   */
  public static solve(A: number[][], b: number[]): number[] {
    const n = b.length;
    if (n === 0) return [];
    if (A.length !== n) {
      throw new Error(`Matrix dimension mismatch: A is ${A.length}x${A[0]?.length || 0}, b is ${n}`);
    }

    // Create deep copies to avoid mutating caller-owned input matrices
    const M: number[][] = Array.from({ length: n }, (_, i) => [...A[i]]);
    const rhs: number[] = [...b];

    return this.solveInPlace(M, rhs);
  }

  /**
   * Solves the linear system M * x = rhs in place, mutating M and rhs to avoid duplicate NxN allocations.
   */
  public static solveInPlace(M: number[][], rhs: number[]): number[] {
    const n = rhs.length;
    if (n === 0) return [];
    if (M.length !== n) {
      throw new Error(`Matrix dimension mismatch: A is ${M.length}x${M[0]?.length || 0}, b is ${n}`);
    }

    // Forward Elimination with Partial Pivoting
    for (let k = 0; k < n; k++) {
      // 1. Find pivot row with maximum absolute value in column k
      let maxRow = k;
      let maxVal = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(M[i][k]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = i;
        }
      }

      // 2. Swap rows in M and rhs BEFORE pivot regularization so regularization is never swapped out of the pivot position
      if (maxRow !== k) {
        const tempRow = M[k];
        M[k] = M[maxRow];
        M[maxRow] = tempRow;

        const tempRhs = rhs[k];
        rhs[k] = rhs[maxRow];
        rhs[maxRow] = tempRhs;
      }

      // 3. Regularize only genuinely singular / floating sub-circuits (after row swap)
      if (Math.abs(M[k][k]) < this.SINGULAR_THRESHOLD) {
        M[k][k] = this.GMIN_REGULARIZATION;
      }

      // 4. Eliminate rows below pivot
      const pivot = M[k][k];
      for (let i = k + 1; i < n; i++) {
        const subVal = M[i][k];
        if (subVal !== 0) {
          const factor = subVal / pivot;
          rhs[i] -= factor * rhs[k];
          M[i][k] = 0;
          for (let j = k + 1; j < n; j++) {
            M[i][j] -= factor * M[k][j];
          }
        }
      }
    }

    // Back Substitution
    const x: number[] = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = rhs[i];
      for (let j = i + 1; j < n; j++) {
        sum -= M[i][j] * x[j];
      }
      const diag = M[i][i];
      if (Math.abs(diag) < this.SINGULAR_THRESHOLD) {
        x[i] = 0; // Singular floating node defaults to 0V ground reference for legacy solveInPlace
      } else {
        x[i] = sum / diag;
      }
    }

    return x;
  }
}

