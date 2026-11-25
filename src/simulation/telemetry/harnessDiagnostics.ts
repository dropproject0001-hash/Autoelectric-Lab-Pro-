/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type {
  BenchComponent,
  DiagnosticTroubleCode,
  EcuPin,
  InjectedFault,
  WireConnection,
} from '../../types/ecu';
import type { RpmEmulatorState } from '../../utils/vehicleEcuRegistry';
import type { GaugeTransportMode } from './telemetryTypes';

export type PinDiagnosticState = 'ACTIVE' | 'WARNING' | 'FAULT' | 'STANDBY';

export interface PinMatrixEntry {
  pinId: string;
  pinNumber: number;
  label: string;
  name: string;
  category: EcuPin['category'];
  voltage: number;
  currentMa: number;
  status: PinDiagnosticState;
  signalKind: string;
  compactReadout: string;
  healthPercent: number | null;
  faultDescription?: string;
  dtcCode?: string;
}

export type HarnessFaultPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface HarnessFaultEntry {
  id: string;
  pinId?: string;
  wireId?: string;
  pinLabel: string;
  condition: string;
  priority: HarnessFaultPriority;
  timestampMs: number;
  timestampLabel: string;
  dtcCode?: string;
  source: 'PIN_FAULT' | 'WIRE_CUT' | 'SUPPLY_TRIP';
}

export type CanBusOperatingState =
  | 'PSU_OFF'
  | 'ECU_SLEEP'
  | 'BUS_OFF'
  | 'DEGRADED'
  | 'ACTIVE_SIMULATED';

export interface CanBusLoadSnapshot {
  busState: CanBusOperatingState;
  stateLabel: string;
  sourceLabel: string;
  loadPercent: number;
  bitrateKbps: number;
  differentialVoltageV: number;
  hasBusFault: boolean;
}

function deriveSignalKind(pin: EcuPin): string {
  const lbl = pin.label.toUpperCase();
  if (lbl.includes('CAN')) return 'HS-CAN DIFF';
  if (lbl.includes('INJ')) return 'PWM SINK (12V)';
  if (lbl.includes('IGN')) return '5V COIL TRIG';
  if (lbl.includes('RELAY') || lbl.includes('MRLY') || lbl.includes('FPR')) return 'LOW-SIDE DRVR';
  if (lbl.includes('VREF')) return '5V REF REG';
  if (lbl.includes('SGND') || lbl.includes('KL31')) return 'GROUND BUS';
  if (lbl.includes('KL30')) return 'KL30 BATT +';
  if (lbl.includes('KL15')) return 'KL15 IGN WAKE';
  if (lbl.includes('TPS') || lbl.includes('MAP') || lbl.includes('ECT') || lbl.includes('O2')) {
    return 'ADC SENSOR';
  }
  return pin.category.toUpperCase();
}

export function evaluatePinDiagnosticMatrix(params: {
  pins: EcuPin[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa: Record<string, number>;
  wires: WireConnection[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  isPowerOn: boolean;
  rpmEmulator?: RpmEmulatorState;
}): PinMatrixEntry[] {
  const {
    pins,
    nodeVoltages,
    wireCurrentsMa,
    wires,
    faults,
    activeDTCs,
    isPowerOn,
    rpmEmulator,
  } = params;

  const faultByPin = new Map<string, InjectedFault>();
  for (const f of faults) {
    if (f.faultType !== 'NONE') {
      faultByPin.set(f.pinId, f);
    }
  }

  return pins.map((pin) => {
    const v = nodeVoltages[pin.id] ?? 0;
    const connectedWires = wires.filter(
      (w) => w.sourcePinId === pin.id || w.targetPinId === pin.id
    );
    const hasCutWire = connectedWires.some((w) => w.isCut);
    const totalCurrentMa = connectedWires.reduce(
      (acc, w) => acc + Math.abs(wireCurrentsMa[w.id] ?? 0),
      0
    );

    const fault = faultByPin.get(pin.id);
    const matchingDtc = activeDTCs.find((d) => d.associatedPinIds.includes(pin.id));
    const signalKind = deriveSignalKind(pin);

    let status: PinDiagnosticState = 'STANDBY';
    let healthPercent: number | null = null;
    let faultDescription = fault?.description;

    if (fault) {
      const isCriticalFault =
        fault.faultType === 'SHORT_TO_GND' ||
        fault.faultType === 'SHORT_TO_VBAT' ||
        fault.faultType === 'OPEN_CIRCUIT';
      status = isCriticalFault ? 'FAULT' : 'WARNING';
      healthPercent = isCriticalFault ? 0 : 62;
    } else if (hasCutWire && isPowerOn) {
      status = 'FAULT';
      healthPercent = 0;
      faultDescription = 'Harness wire cut / open circuit';
    } else if (matchingDtc && isPowerOn) {
      status = 'FAULT';
      healthPercent = 25;
      faultDescription = matchingDtc.description;
    } else if (!isPowerOn) {
      status = 'STANDBY';
      healthPercent = null;
    } else if (pin.category === 'ground') {
      if (v > 0.35) {
        status = 'WARNING';
        healthPercent = Math.max(20, Math.round(100 - v * 28));
      } else {
        status = 'ACTIVE';
        healthPercent = 100;
      }
    } else if (pin.category === 'power' || pin.category === 'reference') {
      const minAcceptable = pin.nominalVoltage * 0.72;
      if (v < minAcceptable) {
        status = 'WARNING';
        healthPercent = Math.max(15, Math.round((v / Math.max(0.1, pin.nominalVoltage)) * 100));
      } else {
        status = 'ACTIVE';
        healthPercent = 100;
      }
    } else if (pin.category === 'communication') {
      if (v < 1.2 || v > 4.2) {
        status = 'WARNING';
        healthPercent = 45;
      } else {
        status = 'ACTIVE';
        healthPercent = 98;
      }
    } else {
      // Sensor / actuator pins
      status = v >= 0.05 || (pin.category === 'actuator_out' && isPowerOn) ? 'ACTIVE' : 'STANDBY';
      healthPercent = status === 'ACTIVE' ? 100 : null;
    }

    let compactReadout = `${v.toFixed(1)}V`;
    if (status === 'FAULT') {
      compactReadout = fault?.faultType === 'SHORT_TO_GND' ? '0V!' : 'FLT';
    } else if (!isPowerOn) {
      compactReadout = '0.0V';
    } else if (pin.id === 'ecu-pin-10' && rpmEmulator?.isActive && !rpmEmulator.ckpSignalLost) {
      const dutyPct = Math.min(82, Math.max(4, Math.round((rpmEmulator.rpm / 6500) * 55 + 4)));
      compactReadout = `${dutyPct}%`;
    } else if (v >= 10) {
      compactReadout = `${v.toFixed(1)}V`;
    } else {
      compactReadout = `${v.toFixed(2)}V`;
    }

    return {
      pinId: pin.id,
      pinNumber: pin.pinNumber,
      label: pin.label,
      name: pin.name,
      category: pin.category,
      voltage: Number(v.toFixed(2)),
      currentMa: Number(totalCurrentMa.toFixed(1)),
      status,
      signalKind,
      compactReadout,
      healthPercent,
      faultDescription,
      dtcCode: matchingDtc?.code,
    };
  });
}

function formatTimeLabel(timestampMs: number): string {
  const d = new Date(timestampMs);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toTimeString().slice(0, 8);
}

export function buildHarnessFaultEntries(params: {
  pins: EcuPin[];
  wires: WireConnection[];
  faults: InjectedFault[];
  activeDTCs: DiagnosticTroubleCode[];
  isSupplyTripped?: boolean;
}): HarnessFaultEntry[] {
  const { pins, wires, faults, activeDTCs, isSupplyTripped = false } = params;
  const entries: HarnessFaultEntry[] = [];
  const pinById = new Map(pins.map((p) => [p.id, p]));
  const nowFallback = Date.now();

  if (isSupplyTripped) {
    entries.push({
      id: 'supply-cc-trip',
      pinId: 'ecu-pin-3',
      pinLabel: 'PSU / KL30',
      condition: 'Bench PSU Overcurrent C.C. Foldback Active',
      priority: 'CRITICAL',
      timestampMs: nowFallback,
      timestampLabel: formatTimeLabel(nowFallback),
      source: 'SUPPLY_TRIP',
    });
  }

  for (const f of faults) {
    if (f.faultType === 'NONE') continue;
    const pin = pinById.get(f.pinId);
    const dtc = activeDTCs.find((d) => d.associatedPinIds.includes(f.pinId));
    const priority: HarnessFaultPriority =
      f.faultType === 'SHORT_TO_GND' ||
      f.faultType === 'SHORT_TO_VBAT' ||
      f.faultType === 'OPEN_CIRCUIT'
        ? 'CRITICAL'
        : 'HIGH';
    const ts = f.timestamp || nowFallback;
    const label = pin ? `Pin ${pin.pinNumber} (${pin.label})` : f.pinId;
    const readableType = f.faultType.replace(/_/g, ' ');
    entries.push({
      id: `fault-${f.pinId}-${f.faultType}`,
      pinId: f.pinId,
      pinLabel: label,
      condition: f.description || `${readableType} on ${label}`,
      priority,
      timestampMs: ts,
      timestampLabel: formatTimeLabel(ts),
      dtcCode: dtc?.code,
      source: 'PIN_FAULT',
    });
  }

  for (const w of wires) {
    if (!w.isCut) continue;
    const srcPin = pinById.get(w.sourcePinId);
    const dtc = activeDTCs.find(
      (d) =>
        d.associatedPinIds.includes(w.sourcePinId) ||
        d.associatedPinIds.includes(w.targetPinId)
    );
    entries.push({
      id: `wire-cut-${w.id}`,
      pinId: srcPin?.id ?? w.sourcePinId,
      wireId: w.id,
      pinLabel: srcPin ? `Pin ${srcPin.pinNumber}` : w.sourcePinId,
      condition: `Open Circuit (${w.label})`,
      priority: 'CRITICAL',
      timestampMs: nowFallback,
      timestampLabel: formatTimeLabel(nowFallback),
      dtcCode: dtc?.code,
      source: 'WIRE_CUT',
    });
  }

  return entries.sort((a, b) => {
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return rank[a.priority] - rank[b.priority];
  });
}

export function evaluateSimulatedCanBusLoad(params: {
  isPowerOn: boolean;
  nodeVoltages: Record<string, number>;
  faults: InjectedFault[];
  wires: WireConnection[];
  rpmEmulator?: RpmEmulatorState;
  transportMode?: GaugeTransportMode;
  samplePhaseRad?: number;
}): CanBusLoadSnapshot {
  const {
    isPowerOn,
    nodeVoltages,
    faults,
    wires,
    rpmEmulator,
    transportMode = 'STOPPED',
    samplePhaseRad = 0,
  } = params;

  const canH = nodeVoltages['ecu-pin-13'] ?? 0;
  const canL = nodeVoltages['ecu-pin-14'] ?? 0;
  const kl30 = nodeVoltages['ecu-pin-3'] ?? 0;
  const kl15 = nodeVoltages['ecu-pin-4'] ?? 0;
  const diffV = Number(Math.abs(canH - canL).toFixed(2));

  if (!isPowerOn) {
    return {
      busState: 'PSU_OFF',
      stateLabel: 'PSU OFF',
      sourceLabel: 'BUS POWERED DOWN',
      loadPercent: 0,
      bitrateKbps: 0,
      differentialVoltageV: 0,
      hasBusFault: false,
    };
  }

  if (kl30 < 6.5 || kl15 < 5.0) {
    return {
      busState: 'ECU_SLEEP',
      stateLabel: 'ECU SLEEP',
      sourceLabel: 'KL15 / KL30 OFF — CAN IDLE',
      loadPercent: 0,
      bitrateKbps: 0,
      differentialVoltageV: diffV,
      hasBusFault: false,
    };
  }

  const canPinFaults = faults.filter(
    (f) => (f.pinId === 'ecu-pin-13' || f.pinId === 'ecu-pin-14') && f.faultType !== 'NONE'
  );
  const canWireCut = wires.some(
    (w) =>
      w.isCut &&
      (w.sourcePinId === 'ecu-pin-13' ||
        w.targetPinId === 'ecu-pin-13' ||
        w.sourcePinId === 'ecu-pin-14' ||
        w.targetPinId === 'ecu-pin-14')
  );

  const hasSevereCanFault = canPinFaults.some(
    (f) =>
      f.faultType === 'SHORT_TO_GND' ||
      f.faultType === 'SHORT_TO_VBAT' ||
      f.faultType === 'OPEN_CIRCUIT'
  );

  if (hasSevereCanFault || canWireCut || canH < 0.8 || canL < 0.8 || diffV > 2.2) {
    return {
      busState: 'BUS_OFF',
      stateLabel: 'BUS OFF',
      sourceLabel: 'SIMULATED CAN BUS FAULT (U0001)',
      loadPercent: 0,
      bitrateKbps: 0,
      differentialVoltageV: diffV,
      hasBusFault: true,
    };
  }

  if (canPinFaults.length > 0) {
    const jitter = Math.sin(samplePhaseRad) * 2.5;
    return {
      busState: 'DEGRADED',
      stateLabel: 'DEGRADED',
      sourceLabel: 'SIMULATED CAN LOAD (RESISTANCE ERROR)',
      loadPercent: Number(Math.max(4, Math.min(28, 14 + jitter)).toFixed(1)),
      bitrateKbps: 125,
      differentialVoltageV: diffV,
      hasBusFault: true,
    };
  }

  const isRunning =
    Boolean(rpmEmulator?.isActive) &&
    !rpmEmulator?.ckpSignalLost &&
    transportMode === 'LIVE';
  const activeRpm = isRunning ? Math.max(0, rpmEmulator?.rpm ?? 0) : 0;

  // Baseline HS-CAN heartbeat (~18%) + RPM-proportional powertrain frame scheduling
  const rpmContribution = isRunning ? Math.min(54, (activeRpm / 6500) * 52 + 8) : 0;
  const frameBurstWave =
    Math.sin(samplePhaseRad) * (isRunning ? 5.5 : 1.8) +
    Math.cos(samplePhaseRad * 2.3) * (isRunning ? 2.5 : 0.7);
  const loadPercent = Number(
    Math.max(6, Math.min(94, 18 + rpmContribution + frameBurstWave)).toFixed(1)
  );

  return {
    busState: 'ACTIVE_SIMULATED',
    stateLabel: isRunning ? 'LIVE 500K' : 'IDLE 125K',
    sourceLabel: 'SIMULATED CAN LOAD',
    loadPercent,
    bitrateKbps: isRunning ? 500 : 125,
    differentialVoltageV: diffV,
    hasBusFault: false,
  };
}

export interface TopologySearchIndex {
  matchingPinIds: Set<string>;
  matchingWireIds: Set<string>;
  matchingComponentIds: Set<string>;
  totalMatches: number;
}

export function evaluateTopologySearch(params: {
  query: string;
  pins: EcuPin[];
  wires: WireConnection[];
  components: BenchComponent[];
}): TopologySearchIndex {
  const clean = params.query.trim().toLowerCase();
  if (!clean) {
    return {
      matchingPinIds: new Set(params.pins.map((p) => p.id)),
      matchingWireIds: new Set(params.wires.map((w) => w.id)),
      matchingComponentIds: new Set(params.components.map((c) => c.id)),
      totalMatches: 0,
    };
  }

  const normalizedPinQuery = clean.replace(/^pin\s*#?|^p(?=\d)/i, '');
  const matchingPinIds = new Set<string>();
  const matchingComponentIds = new Set<string>();
  const matchingWireIds = new Set<string>();

  for (const pin of params.pins) {
    const numStr = String(pin.pinNumber);
    if (
      numStr === normalizedPinQuery ||
      `pin ${numStr}`.includes(clean) ||
      pin.label.toLowerCase().includes(clean) ||
      pin.name.toLowerCase().includes(clean) ||
      pin.category.toLowerCase().includes(clean) ||
      pin.description.toLowerCase().includes(clean)
    ) {
      matchingPinIds.add(pin.id);
    }
  }

  for (const comp of params.components) {
    const compMatches =
      comp.name.toLowerCase().includes(clean) ||
      comp.type.toLowerCase().includes(clean) ||
      comp.pins.some(
        (cp) => cp.label.toLowerCase().includes(clean) || cp.id.toLowerCase().includes(clean)
      );
    if (compMatches) {
      matchingComponentIds.add(comp.id);
      for (const cp of comp.pins) {
        matchingPinIds.add(cp.id);
      }
    }
  }

  for (const wire of params.wires) {
    const wireMatches =
      wire.label.toLowerCase().includes(clean) ||
      matchingPinIds.has(wire.sourcePinId) ||
      matchingPinIds.has(wire.targetPinId);
    if (wireMatches) {
      matchingWireIds.add(wire.id);
    }
  }

  const totalMatches =
    matchingPinIds.size + matchingWireIds.size + matchingComponentIds.size;

  return {
    matchingPinIds,
    matchingWireIds,
    matchingComponentIds,
    totalMatches,
  };
}

/**
 * Pure RPM-to-angular-velocity kinematics helper for the 3D Bench Twin crankshaft 36-1 wheel.
 * Visually scaled smoothly for 60fps legibility while honestly halting on PSU OFF, standby, or CKP dropout (P0335).
 */
export function computeCrankAngularVelocityRadPerSec(params: {
  isPowerActive: boolean;
  isRpmRunning: boolean;
  ckpSignalLost: boolean;
  rpm: number;
  simulationSpeed: number;
}): number {
  const { isPowerActive, isRpmRunning, ckpSignalLost, rpm, simulationSpeed } = params;
  if (!isPowerActive || ckpSignalLost) return 0;
  const effectiveRpm = isRpmRunning ? Math.max(0, rpm) : 0;
  if (effectiveRpm <= 0) return 0;
  // Scale RPM into visually legible rotational speed without aliasing on 60Hz screens
  const clampedRadPerSec = Math.min(24, (effectiveRpm / 600) * Math.PI);
  return Number((clampedRadPerSec * Math.max(0.1, simulationSpeed)).toFixed(4));
}

// ============================================================================
// VISUAL TOPOLOGY GRAPH MODEL & NET ANALYZER
// ============================================================================

export interface TopologyGraphNodeData {
  id: string;
  label: string;
  name: string;
  kind: 'ECU_PIN' | 'COMPONENT_PIN';
  category: 'power' | 'ground' | 'sensor' | 'actuator' | 'can' | 'reference' | 'general';
  componentId?: string;
  componentName?: string;
  voltage: number;
  isEnergized: boolean;
  degree: number;
  hasFault?: boolean;
  faultType?: string;
}

export interface TopologyGraphLinkData {
  id: string;
  sourcePinId: string;
  targetPinId: string;
  color: string;
  label: string;
  isCut: boolean;
  resistance: number;
  sourceVoltage: number;
  targetVoltage: number;
  voltageDrop: number;
  isEnergized: boolean;
}

export interface TopologyElectricalNetData {
  netId: string;
  netName: string;
  category: 'power' | 'ground' | 'sensor' | 'actuator' | 'can' | 'reference' | 'general';
  nodeIds: string[];
  wireIds: string[];
  averageVoltage: number;
  isEnergized: boolean;
  hasCutWire: boolean;
}

export interface HarnessGraphTopologyResult {
  nodes: TopologyGraphNodeData[];
  links: TopologyGraphLinkData[];
  nets: TopologyElectricalNetData[];
  summary: {
    totalNodes: number;
    connectedNodes: number;
    isolatedNodes: number;
    totalWires: number;
    continuousWires: number;
    cutWires: number;
    independentNets: number;
    energizedNets: number;
  };
}

function categorizePinRole(
  pinLabel: string,
  baseCategory?: string,
  compType?: string
): TopologyGraphNodeData['category'] {
  const upper = pinLabel.toUpperCase();
  if (upper.includes('KL30') || upper.includes('KL15') || upper.includes('VBAT') || upper.includes('+12V') || baseCategory === 'power') {
    return 'power';
  }
  if (upper.includes('KL31') || upper.includes('GND') || upper.includes('SGND') || baseCategory === 'ground') {
    return 'ground';
  }
  if (upper.includes('CAN') || compType === 'bus_node') {
    return 'can';
  }
  if (upper.includes('VREF') || upper.includes('5V_REF') || baseCategory === 'reference') {
    return 'reference';
  }
  if (upper.includes('INJ') || upper.includes('IGN') || upper.includes('RELAY') || upper.includes('PUMP') || compType === 'actuator' || compType === 'relay') {
    return 'actuator';
  }
  if (upper.includes('TPS') || upper.includes('MAP') || upper.includes('ECT') || upper.includes('CKP') || upper.includes('CMP') || compType === 'sensor' || baseCategory === 'sensor_in') {
    return 'sensor';
  }
  return 'general';
}

/**
 * Deterministically constructs node, link, and electrical net data for dynamic interactive graph rendering.
 * All voltages originate directly from MNA solver output.
 */
export function computeHarnessGraphTopology(params: {
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  nodeVoltages: Record<string, number>;
  faults?: InjectedFault[];
  isPowerOn: boolean;
}): HarnessGraphTopologyResult {
  const { pins, components, wires, nodeVoltages, faults = [], isPowerOn } = params;

  const faultByPin = new Map<string, InjectedFault>();
  for (const f of faults) {
    if (f.faultType && f.faultType !== 'NONE') {
      faultByPin.set(f.pinId, f);
    }
  }

  const nodesById = new Map<string, TopologyGraphNodeData>();

  // 1. Ingest ECU pins
  for (const p of pins) {
    const v = nodeVoltages[p.id] ?? 0;
    const cat = categorizePinRole(p.label, p.category);
    const fault = faultByPin.get(p.id);

    nodesById.set(p.id, {
      id: p.id,
      label: p.label,
      name: p.name,
      kind: 'ECU_PIN',
      category: cat,
      voltage: Number(v.toFixed(3)),
      isEnergized: isPowerOn && v > 0.4,
      degree: 0,
      hasFault: Boolean(fault),
      faultType: fault?.faultType,
    });
  }

  // 2. Ingest Component terminals
  for (const comp of components) {
    for (const cp of comp.pins) {
      const v = nodeVoltages[cp.id] ?? 0;
      const cat = categorizePinRole(cp.label, cp.type, comp.type);
      const fault = faultByPin.get(cp.id);

      nodesById.set(cp.id, {
        id: cp.id,
        label: `${comp.name}: ${cp.label}`,
        name: cp.label,
        kind: 'COMPONENT_PIN',
        category: cat,
        componentId: comp.id,
        componentName: comp.name,
        voltage: Number(v.toFixed(3)),
        isEnergized: isPowerOn && v > 0.4,
        degree: 0,
        hasFault: Boolean(fault),
        faultType: fault?.faultType,
      });
    }
  }

  // 3. Ingest Wires as Links
  const links: TopologyGraphLinkData[] = [];
  const adjacency = new Map<string, Set<string>>();

  for (const nId of nodesById.keys()) {
    adjacency.set(nId, new Set<string>());
  }

  for (const w of wires) {
    const srcNode = nodesById.get(w.sourcePinId);
    const tgtNode = nodesById.get(w.targetPinId);

    const vSrc = nodeVoltages[w.sourcePinId] ?? (srcNode ? srcNode.voltage : 0);
    const vTgt = nodeVoltages[w.targetPinId] ?? (tgtNode ? tgtNode.voltage : 0);
    const vDrop = Number(Math.abs(vSrc - vTgt).toFixed(3));
    const isEnergized = isPowerOn && !w.isCut && (vSrc > 0.4 || vTgt > 0.4);

    links.push({
      id: w.id,
      sourcePinId: w.sourcePinId,
      targetPinId: w.targetPinId,
      color: w.color || '#3b82f6',
      label: w.label || 'Harness Lead',
      isCut: w.isCut,
      resistance: w.resistance ?? 0.05,
      sourceVoltage: Number(vSrc.toFixed(3)),
      targetVoltage: Number(vTgt.toFixed(3)),
      voltageDrop: vDrop,
      isEnergized,
    });

    if (srcNode) srcNode.degree += 1;
    if (tgtNode) tgtNode.degree += 1;

    // Track active electrical adjacency only if conductor is intact
    if (!w.isCut) {
      adjacency.get(w.sourcePinId)?.add(w.targetPinId);
      adjacency.get(w.targetPinId)?.add(w.sourcePinId);
    }
  }

  // 4. Compute Connected Electrical Nets (BFS over non-cut wires)
  const visited = new Set<string>();
  const nets: TopologyElectricalNetData[] = [];
  let netIndex = 1;

  for (const [nodeId, node] of nodesById.entries()) {
    if (visited.has(nodeId)) continue;
    if (node.degree === 0) {
      visited.add(nodeId);
      continue; // Skip isolated nodes from distinct net listings
    }

    const netNodes: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      netNodes.push(cur);

      const neighbors = adjacency.get(cur) || new Set<string>();
      for (const nbr of neighbors) {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          queue.push(nbr);
        }
      }
    }

    const netNodeSet = new Set(netNodes);
    const netWires = wires.filter(
      (w) => netNodeSet.has(w.sourcePinId) && netNodeSet.has(w.targetPinId)
    );

    const voltSum = netNodes.reduce((acc, id) => acc + (nodesById.get(id)?.voltage ?? 0), 0);
    const avgVolt = Number((voltSum / Math.max(1, netNodes.length)).toFixed(2));
    const isNetEnergized = isPowerOn && avgVolt > 0.4;
    const hasCut = netWires.some((w) => w.isCut);

    // Derive semantic net name from dominant pin in the net
    let dominantCat: TopologyElectricalNetData['category'] = 'general';
    let labelHint = `Net #${netIndex}`;

    for (const nid of netNodes) {
      const n = nodesById.get(nid);
      if (!n) continue;
      if (n.category === 'power') {
        dominantCat = 'power';
        labelHint = `Power KL30/KL15 Rail (${avgVolt}V)`;
        break;
      }
      if (n.category === 'ground') {
        dominantCat = 'ground';
        labelHint = `KL31 Chassis Ground Bus (${avgVolt}V)`;
        break;
      }
      if (n.category === 'can') {
        dominantCat = 'can';
        labelHint = `CAN Bus Network`;
        break;
      }
      if (n.category === 'reference') {
        dominantCat = 'reference';
        labelHint = `5V Reference Net (${avgVolt}V)`;
        break;
      }
      if (n.category === 'actuator') {
        dominantCat = 'actuator';
        labelHint = `Actuator Circuit (${n.label})`;
      } else if (n.category === 'sensor' && dominantCat !== 'actuator') {
        dominantCat = 'sensor';
        labelHint = `Sensor Circuit (${n.label})`;
      }
    }

    nets.push({
      netId: `net-${netIndex++}`,
      netName: labelHint,
      category: dominantCat,
      nodeIds: netNodes,
      wireIds: netWires.map((w) => w.id),
      averageVoltage: avgVolt,
      isEnergized: isNetEnergized,
      hasCutWire: hasCut,
    });
  }

  const nodes = Array.from(nodesById.values());
  const connectedNodes = nodes.filter((n) => n.degree > 0).length;

  return {
    nodes,
    links,
    nets,
    summary: {
      totalNodes: nodes.length,
      connectedNodes,
      isolatedNodes: nodes.length - connectedNodes,
      totalWires: wires.length,
      continuousWires: wires.filter((w) => !w.isCut).length,
      cutWires: wires.filter((w) => w.isCut).length,
      independentNets: nets.length,
      energizedNets: nets.filter((n) => n.isEnergized).length,
    },
  };
}

// ============================================================================
// WIRE OVERVIEW MAP MODEL (SEARCHABLE ACTIVE HARNESS INDEX)
// ============================================================================

export type WireEndpointGroup = 'ECU' | 'COMPONENT' | 'RAIL';
export type WireOverviewFilterMode = 'ACTIVE' | 'ALL' | 'CUT';
export type WireOverviewSortMode = 'DEFAULT' | 'RESISTANCE_DESC' | 'RESISTANCE_ASC' | 'CURRENT_DESC' | 'SOURCE_ID';

export interface WireOverviewEntry {
  wireId: string;
  wireLabel: string;
  color: string;
  resistanceOhms: number;
  resistanceFormatted: string;
  isActive: boolean;
  isCut: boolean;
  isEnergized: boolean;
  isHighResistance: boolean;
  sourcePinId: string;
  sourceDisplayName: string;
  sourceGroup: WireEndpointGroup;
  sourceVoltage: number;
  targetPinId: string;
  targetDisplayName: string;
  targetGroup: WireEndpointGroup;
  targetVoltage: number;
  voltageDropV: number;
  currentMa: number;
  orderIndex: number;
}

export interface WireOverviewMapSummary {
  totalWires: number;
  activeWires: number;
  cutWires: number;
  energizedWires: number;
  highResistanceWires: number;
}

export function formatWireResistanceOhms(resistanceOhms: number, isCut = false): string {
  if (isCut) return '∞ Ω (OPEN)';
  const r = Number.isFinite(resistanceOhms) && resistanceOhms >= 0 ? resistanceOhms : 0;
  if (r >= 1_000_000) return `${(r / 1_000_000).toFixed(2)} MΩ`;
  if (r >= 1_000) return `${(r / 1_000).toFixed(2)} kΩ`;
  if (r >= 10) return `${r.toFixed(1)} Ω`;
  return `${r.toFixed(2)} Ω`;
}

function resolveWireEndpointInfo(
  pinId: string,
  ecuPinMap: Map<string, EcuPin>,
  compPinMap: Map<string, { compName: string; pinLabel: string }>
): { displayName: string; group: WireEndpointGroup } {
  if (pinId === 'chassis-gnd') {
    return { displayName: 'Chassis GND (KL31)', group: 'RAIL' };
  }
  if (pinId === 'bench-vbat') {
    return { displayName: 'Bench +VBAT Supply', group: 'RAIL' };
  }
  const ecuPin = ecuPinMap.get(pinId);
  if (ecuPin) {
    return { displayName: `ECU #${ecuPin.pinNumber} · ${ecuPin.label}`, group: 'ECU' };
  }
  const compPin = compPinMap.get(pinId);
  if (compPin) {
    return { displayName: `${compPin.compName} · ${compPin.pinLabel}`, group: 'COMPONENT' };
  }
  return { displayName: pinId, group: 'RAIL' };
}

export function buildWireOverviewMap(params: {
  pins: EcuPin[];
  components: BenchComponent[];
  wires: WireConnection[];
  nodeVoltages: Record<string, number>;
  wireCurrentsMa?: Record<string, number>;
  isPowerOn: boolean;
}): { entries: WireOverviewEntry[]; summary: WireOverviewMapSummary } {
  const {
    pins,
    components,
    wires,
    nodeVoltages,
    wireCurrentsMa = {},
    isPowerOn,
  } = params;

  const ecuPinMap = new Map(pins.map((p) => [p.id, p]));
  const compPinMap = new Map<string, { compName: string; pinLabel: string }>();
  for (const comp of components) {
    for (const cp of comp.pins) {
      compPinMap.set(cp.id, { compName: comp.name, pinLabel: cp.label });
    }
  }

  let activeWires = 0;
  let cutWires = 0;
  let energizedWires = 0;
  let highResistanceWires = 0;

  const entries: WireOverviewEntry[] = wires.map((wire, index) => {
    const srcInfo = resolveWireEndpointInfo(wire.sourcePinId, ecuPinMap, compPinMap);
    const tgtInfo = resolveWireEndpointInfo(wire.targetPinId, ecuPinMap, compPinMap);
    const sourceVoltage = Number((nodeVoltages[wire.sourcePinId] ?? 0).toFixed(2));
    const targetVoltage = Number((nodeVoltages[wire.targetPinId] ?? 0).toFixed(2));
    const voltageDropV = Number(Math.abs(sourceVoltage - targetVoltage).toFixed(3));
    const currentMa = Number(Math.abs(wireCurrentsMa[wire.id] ?? 0).toFixed(1));
    const resistanceOhms = Number.isFinite(wire.resistance) ? wire.resistance : 0.05;
    const isActive = !wire.isCut;
    const isEnergized =
      isPowerOn && isActive && (Math.abs(sourceVoltage) > 0.4 || Math.abs(targetVoltage) > 0.4);
    const isHighResistance = isActive && resistanceOhms >= 10;

    if (isActive) activeWires += 1;
    else cutWires += 1;
    if (isEnergized) energizedWires += 1;
    if (isHighResistance) highResistanceWires += 1;

    return {
      wireId: wire.id,
      wireLabel: wire.label || wire.id,
      color: wire.color || '#64748b',
      resistanceOhms,
      resistanceFormatted: formatWireResistanceOhms(resistanceOhms, wire.isCut),
      isActive,
      isCut: wire.isCut,
      isEnergized,
      isHighResistance,
      sourcePinId: wire.sourcePinId,
      sourceDisplayName: srcInfo.displayName,
      sourceGroup: srcInfo.group,
      sourceVoltage,
      targetPinId: wire.targetPinId,
      targetDisplayName: tgtInfo.displayName,
      targetGroup: tgtInfo.group,
      targetVoltage,
      voltageDropV,
      currentMa,
      orderIndex: index,
    };
  });

  return {
    entries,
    summary: {
      totalWires: wires.length,
      activeWires,
      cutWires,
      energizedWires,
      highResistanceWires,
    },
  };
}

export function filterWireOverviewEntries(params: {
  entries: WireOverviewEntry[];
  query: string;
  filterMode?: WireOverviewFilterMode;
  sortMode?: WireOverviewSortMode;
}): WireOverviewEntry[] {
  const {
    entries,
    query,
    filterMode = 'ACTIVE',
    sortMode = 'DEFAULT',
  } = params;

  const q = query.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (filterMode === 'ACTIVE' && !entry.isActive) return false;
    if (filterMode === 'CUT' && !entry.isCut) return false;

    if (!q) return true;

    return (
      entry.wireId.toLowerCase().includes(q) ||
      entry.wireLabel.toLowerCase().includes(q) ||
      entry.sourcePinId.toLowerCase().includes(q) ||
      entry.sourceDisplayName.toLowerCase().includes(q) ||
      entry.targetPinId.toLowerCase().includes(q) ||
      entry.targetDisplayName.toLowerCase().includes(q) ||
      entry.resistanceFormatted.toLowerCase().includes(q) ||
      String(entry.resistanceOhms).includes(q)
    );
  });

  if (sortMode === 'DEFAULT') return filtered;

  return [...filtered].sort((a, b) => {
    if (sortMode === 'RESISTANCE_DESC') {
      const ra = a.isCut ? Number.POSITIVE_INFINITY : a.resistanceOhms;
      const rb = b.isCut ? Number.POSITIVE_INFINITY : b.resistanceOhms;
      return rb - ra || a.orderIndex - b.orderIndex;
    }
    if (sortMode === 'RESISTANCE_ASC') {
      const ra = a.isCut ? Number.POSITIVE_INFINITY : a.resistanceOhms;
      const rb = b.isCut ? Number.POSITIVE_INFINITY : b.resistanceOhms;
      return ra - rb || a.orderIndex - b.orderIndex;
    }
    if (sortMode === 'CURRENT_DESC') {
      return b.currentMa - a.currentMa || a.orderIndex - b.orderIndex;
    }
    if (sortMode === 'SOURCE_ID') {
      return a.sourcePinId.localeCompare(b.sourcePinId) || a.orderIndex - b.orderIndex;
    }
    return a.orderIndex - b.orderIndex;
  });
}

