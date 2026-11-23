import { MatrixSolver } from '../engine/MatrixSolver';

export interface ResistorBranch {
  id: string;
  nodeA: string;
  nodeB: string;
  idxA: number;
  idxB: number;
  resistanceOhms: number;
}

export interface VoltageSourceBranch {
  id: string;
  posNode: string;
  negNode: string;
  idxPos: number;
  idxNeg: number;
  voltageVolts: number;
  internalResistanceOhms: number;
}

export interface CurrentSourceBranch {
  id: string;
  fromNode: string;
  toNode: string;
  idxFrom: number;
  idxTo: number;
  currentAmps: number;
}

export interface CircuitSolutionResult {
  nodeVoltages: Record<string, number>;
  branchCurrentsAmps: Record<string, number>;
  sourceCurrentDrawAmps: number;
  isSolved: boolean;
  warnings: string[];
}

/**
 * CircuitNetwork: Topological Modified Nodal Analysis (MNA) Network.
 * Models electrical nodes, branches, grounds, and solves node voltages using Kirchhoff's laws.
 */
export class CircuitNetwork {
  private nodeMap: Map<string, number> = new Map();
  private reverseNodeMap: Map<number, string> = new Map();
  private resistors: Map<string, ResistorBranch> = new Map();
  private voltageSources: Map<string, VoltageSourceBranch> = new Map();
  private currentSources: Map<string, CurrentSourceBranch> = new Map();
  private gMin: number = 1e-9; // 1 GΩ shunt conductance to ground for numerical stability on floating nodes

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.nodeMap.clear();
    this.reverseNodeMap.clear();
    this.resistors.clear();
    this.voltageSources.clear();
    this.currentSources.clear();

    // Node 0 is always the absolute Ground reference (KL31 / Chassis Ground)
    this.nodeMap.set('0', 0);
    this.nodeMap.set('gnd', 0);
    this.nodeMap.set('chassis-gnd', 0);
    this.reverseNodeMap.set(0, 'chassis-gnd');
  }

  /**
   * Registers a node name or retrieves its integer index.
   */
  public getOrCreateNode(name: string | number): number {
    const normalized = String(name ?? '').trim().toLowerCase();
    const existing = this.nodeMap.get(normalized);
    if (existing !== undefined) {
      return existing;
    }
    const newIndex = this.nodeMap.size;
    this.nodeMap.set(normalized, newIndex);
    this.reverseNodeMap.set(newIndex, String(name));
    return newIndex;
  }

  /**
   * Adds or updates a resistor branch.
   * Supports both (id, nodeA, nodeB, resistanceOhms) and (nodeA, nodeB, resistanceOhms).
   */
  public addResistor(
    arg1: string,
    arg2: string,
    arg3: string | number,
    arg4?: number
  ): void {
    let id: string;
    let nodeA: string;
    let nodeB: string;
    let resistanceOhms: number;

    if (typeof arg3 === 'number' && arg4 === undefined) {
      // Called as addResistor(nodeA, nodeB, resistanceOhms)
      nodeA = arg1;
      nodeB = arg2;
      resistanceOhms = arg3;
      id = `res_${nodeA}_${nodeB}_${this.resistors.size}`;
    } else {
      // Called as addResistor(id, nodeA, nodeB, resistanceOhms)
      id = arg1;
      nodeA = arg2;
      nodeB = String(arg3);
      resistanceOhms = arg4 ?? 1e-4;
    }

    const validR = Math.max(1e-4, resistanceOhms);
    const idxA = this.getOrCreateNode(nodeA);
    const idxB = this.getOrCreateNode(nodeB);
    this.resistors.set(id, { id, nodeA, nodeB, idxA, idxB, resistanceOhms: validR });
  }

  /**
   * Adds or updates an independent voltage source branch.
   */
  public addVoltageSource(
    id: string,
    posNode: string,
    negNode: string,
    voltageVolts: number,
    internalResistanceOhms = 0.05
  ): void {
    const idxPos = this.getOrCreateNode(posNode);
    const idxNeg = this.getOrCreateNode(negNode);
    this.voltageSources.set(id, {
      id,
      posNode,
      negNode,
      idxPos,
      idxNeg,
      voltageVolts,
      internalResistanceOhms: Math.max(1e-4, internalResistanceOhms),
    });
  }

  /**
   * Updates an existing voltage source's EMF in-place without altering circuit topology.
   */
  public updateVoltageSource(id: string, voltageVolts: number): boolean {
    const existing = this.voltageSources.get(id);
    if (!existing) return false;
    existing.voltageVolts = voltageVolts;
    return true;
  }

  /**
   * Adds an independent current source or sink.
   */
  public addCurrentSource(id: string, fromNode: string, toNode: string, currentAmps: number): void {
    const idxFrom = this.getOrCreateNode(fromNode);
    const idxTo = this.getOrCreateNode(toNode);
    this.currentSources.set(id, { id, fromNode, toNode, idxFrom, idxTo, currentAmps });
  }

  /**
   * Solves the complete DC circuit using Modified Nodal Analysis (MNA).
   * Constructs the conductance matrix G, incidence matrices B & C, and RHS vector.
   */
  public solve(): CircuitSolutionResult {
    // Node 0 is ground, nodes 1..N are unknown node voltages
    const nonGroundNodes = this.nodeMap.size - 1;
    const numVSources = this.voltageSources.size;
    const totalUnknowns = nonGroundNodes + numVSources;

    if (nonGroundNodes <= 0) {
      return {
        nodeVoltages: { 'chassis-gnd': 0 },
        branchCurrentsAmps: {},
        sourceCurrentDrawAmps: 0,
        isSolved: true,
        warnings: [],
      };
    }

    const A: number[][] = Array.from({ length: totalUnknowns }, () => new Array(totalUnknowns).fill(0));
    const b: number[] = new Array(totalUnknowns).fill(0);

    // 1. Stamp shunt conductance to ground Gmin to prevent floating node singularity
    for (let i = 0; i < nonGroundNodes; i++) {
      A[i][i] += this.gMin;
    }

    // 2. Stamp Resistors into Conductance Matrix G (rows/cols 0..nonGroundNodes-1)
    for (const res of this.resistors.values()) {
      const idxA = res.idxA;
      const idxB = res.idxB;
      const G = 1.0 / res.resistanceOhms;

      if (idxA !== 0) {
        const rowA = idxA - 1;
        A[rowA][rowA] += G;
        if (idxB !== 0) {
          A[rowA][idxB - 1] -= G;
        }
      }

      if (idxB !== 0) {
        const rowB = idxB - 1;
        A[rowB][rowB] += G;
        if (idxA !== 0) {
          A[rowB][idxA - 1] -= G;
        }
      }
    }

    // 3. Stamp Current Sources into RHS vector b
    for (const cs of this.currentSources.values()) {
      if (cs.idxFrom !== 0) {
        b[cs.idxFrom - 1] -= cs.currentAmps;
      }
      if (cs.idxTo !== 0) {
        b[cs.idxTo - 1] += cs.currentAmps;
      }
    }

    // 4. Stamp Voltage Sources into MNA sub-matrices B and C, and RHS
    let vSourceIdx = 0;
    const vSourceEntries: { id: string; branchIdx: number }[] = [];
    for (const vs of this.voltageSources.values()) {
      const idxPos = vs.idxPos;
      const idxNeg = vs.idxNeg;
      const vEquationRow = nonGroundNodes + vSourceIdx;

      vSourceEntries.push({ id: vs.id, branchIdx: vEquationRow });

      if (idxPos !== 0) {
        const posCol = idxPos - 1;
        A[posCol][vEquationRow] += 1.0;
        A[vEquationRow][posCol] += 1.0;
      }

      if (idxNeg !== 0) {
        const negCol = idxNeg - 1;
        A[negCol][vEquationRow] -= 1.0;
        A[vEquationRow][negCol] -= 1.0;
      }

      if (vs.internalResistanceOhms > 0) {
        A[vEquationRow][vEquationRow] = -vs.internalResistanceOhms;
      }

      b[vEquationRow] = vs.voltageVolts;
      vSourceIdx++;
    }

    let x: number[];
    try {
      x = MatrixSolver.solveInPlace(A, b);
    } catch {
      return {
        nodeVoltages: {},
        branchCurrentsAmps: {},
        sourceCurrentDrawAmps: 0,
        isSolved: false,
        warnings: ['Matrix solver divergence: check for ungrounded circuits or extreme resistances.'],
      };
    }

    // Extract node voltages
    const nodeVoltages: Record<string, number> = {};
    for (const [name, index] of this.nodeMap.entries()) {
      if (index === 0) {
        nodeVoltages[name] = 0.0;
      } else {
        const v = x[index - 1] ?? 0.0;
        nodeVoltages[name] = Math.abs(v) < 1e-6 ? 0.0 : v;
      }
    }

    // Extract branch currents through resistors using integer node indices
    const branchCurrents: Record<string, number> = {};
    for (const res of this.resistors.values()) {
      const vA = res.idxA === 0 ? 0.0 : (Math.abs(x[res.idxA - 1] ?? 0.0) < 1e-6 ? 0.0 : x[res.idxA - 1] ?? 0.0);
      const vB = res.idxB === 0 ? 0.0 : (Math.abs(x[res.idxB - 1] ?? 0.0) < 1e-6 ? 0.0 : x[res.idxB - 1] ?? 0.0);
      branchCurrents[res.id] = (vA - vB) / res.resistanceOhms;
    }

    // Calculate total supply current draw
    let totalDrawAmps = 0;
    for (const entry of vSourceEntries) {
      const currentThroughVSource = Math.abs(x[entry.branchIdx] || 0);
      branchCurrents[entry.id] = currentThroughVSource;
      totalDrawAmps += currentThroughVSource;
    }

    return {
      nodeVoltages,
      branchCurrentsAmps: branchCurrents,
      sourceCurrentDrawAmps: totalDrawAmps,
      isSolved: true,
      warnings: [],
    };
  }

  /**
   * Calculates equivalent Thevenin/Norton resistance between two probe terminals.
   * Directly stamps passive conductances & de-energized voltage-source internal conductances
   * with a 1mA test injection without instantiating a shadow CircuitNetwork.
   */
  public calculateEquivalentResistance(nodeA: string | number, nodeB: string | number): number {
    const normA = String(nodeA ?? '').trim().toLowerCase();
    const normB = String(nodeB ?? '').trim().toLowerCase();
    if (normA === normB) return 0.0;

    const idxA = this.nodeMap.get(normA);
    const idxB = this.nodeMap.get(normB);
    if (idxA === undefined || idxB === undefined) {
      return Infinity;
    }

    const nonGroundNodes = this.nodeMap.size - 1;
    if (nonGroundNodes <= 0) return 0.0;

    const GMat: number[][] = Array.from({ length: nonGroundNodes }, () =>
      new Array(nonGroundNodes).fill(0)
    );
    const rhs: number[] = new Array(nonGroundNodes).fill(0);

    for (let i = 0; i < nonGroundNodes; i++) {
      GMat[i][i] += this.gMin;
    }

    // Passive resistors
    for (const res of this.resistors.values()) {
      const g = 1.0 / res.resistanceOhms;
      if (res.idxA !== 0) {
        const rowA = res.idxA - 1;
        GMat[rowA][rowA] += g;
        if (res.idxB !== 0) {
          GMat[rowA][res.idxB - 1] -= g;
        }
      }
      if (res.idxB !== 0) {
        const rowB = res.idxB - 1;
        GMat[rowB][rowB] += g;
        if (res.idxA !== 0) {
          GMat[rowB][res.idxA - 1] -= g;
        }
      }
    }

    // De-energize active voltage sources (replace with their internal resistance)
    for (const vs of this.voltageSources.values()) {
      const g = 1.0 / Math.max(1e-4, vs.internalResistanceOhms || 0.05);
      if (vs.idxPos !== 0) {
        const rowPos = vs.idxPos - 1;
        GMat[rowPos][rowPos] += g;
        if (vs.idxNeg !== 0) {
          GMat[rowPos][vs.idxNeg - 1] -= g;
        }
      }
      if (vs.idxNeg !== 0) {
        const rowNeg = vs.idxNeg - 1;
        GMat[rowNeg][rowNeg] += g;
        if (vs.idxPos !== 0) {
          GMat[rowNeg][vs.idxPos - 1] -= g;
        }
      }
    }

    // Inject 1mA test current from nodeB -> nodeA
    const iTest = 0.001;
    if (idxB !== 0) rhs[idxB - 1] -= iTest;
    if (idxA !== 0) rhs[idxA - 1] += iTest;

    let x: number[];
    try {
      x = MatrixSolver.solveInPlace(GMat, rhs);
    } catch {
      return Infinity;
    }

    const rawVA = idxA === 0 ? 0.0 : x[idxA - 1] ?? 0.0;
    const rawVB = idxB === 0 ? 0.0 : x[idxB - 1] ?? 0.0;
    const vA = Math.abs(rawVA) < 1e-6 ? 0.0 : rawVA;
    const vB = Math.abs(rawVB) < 1e-6 ? 0.0 : rawVB;
    const deltaV = Math.abs(vA - vB);

    const rEq = deltaV / iTest;
    return rEq > 1e7 ? Infinity : rEq;
  }
}
