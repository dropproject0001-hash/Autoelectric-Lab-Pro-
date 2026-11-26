/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 RMATi- Ruben Modern Auto-motive-electrical Technology innovations
 */

import type { CircuitSolution } from './circuitSolver';
import type { EcuPin, InjectedFault, MultimeterState, PowerSupplyState, WireConnection } from '../types/ecu';
import type { VoiceCoachIntent } from '../services/ai/localVoiceBrain';
import { isLiveTelemetryQuery } from '../services/ai/voiceInteractionCache';
import type { LabTab } from './voiceCommandParser';

export type BenchPaneKey = 'INSTRUMENTS' | 'CANVAS' | 'GUIDE';

const PANE_LABELS_MAP: Record<BenchPaneKey, string> = {
  INSTRUMENTS: 'Instruments',
  CANVAS: 'Wiring Canvas',
  GUIDE: 'Diagnostic Guide',
};

export interface ResolvedPinVoltageMeasurement {
  voltage: number | null;
  status: 'VALID' | 'UNRESOLVED' | 'UNSTABLE' | 'NON_FINITE' | 'UNAVAILABLE';
}

/**
 * Resolves a pin's live simulated voltage without silently coercing unresolved,
 * floating, or non-finite MNA nodes into 0V or nominal values.
 */
export function getValidatedPinVoltage(
  circuitSolution: Pick<
    CircuitSolution,
    'nodeVoltages' | 'validatedNodeVoltages' | 'nodeMeasurementStatuses' | 'unresolvedNodes' | 'solverStatus'
  > | null | undefined,
  pinId: string | null | undefined
): ResolvedPinVoltageMeasurement {
  if (!circuitSolution || !pinId) {
    return { voltage: null, status: 'UNAVAILABLE' };
  }

  if (circuitSolution.solverStatus === 'NON_FINITE') {
    return { voltage: null, status: 'NON_FINITE' };
  }

  const nodeStatus = circuitSolution.nodeMeasurementStatuses?.[pinId];
  const isListedUnresolved = Boolean(circuitSolution.unresolvedNodes?.includes(pinId));
  const validated = circuitSolution.validatedNodeVoltages?.[pinId];

  if (nodeStatus === 'UNRESOLVED' || isListedUnresolved || validated === null) {
    return { voltage: null, status: 'UNRESOLVED' };
  }

  const rawV =
    typeof validated === 'number'
      ? validated
      : circuitSolution.nodeVoltages?.[pinId];

  if (typeof rawV === 'number' && !Number.isFinite(rawV)) {
    return { voltage: null, status: 'NON_FINITE' };
  }
  if (typeof rawV !== 'number') {
    return { voltage: null, status: 'UNAVAILABLE' };
  }

  if (nodeStatus === 'UNSTABLE' || circuitSolution.solverStatus === 'UNSTABLE') {
    return { voltage: rawV, status: 'UNSTABLE' };
  }

  return { voltage: rawV, status: 'VALID' };
}

/**
 * Formats a concise pin voltage summary for HUD/navigator badges without hiding unresolved nodes.
 */
export function formatPinScopeSummary(
  selectedPin: Pick<EcuPin, 'id' | 'pinNumber'> | null | undefined,
  circuitSolution: CircuitSolution
): string | undefined {
  if (!selectedPin) return undefined;
  const resolved = getValidatedPinVoltage(circuitSolution, selectedPin.id);
  if (resolved.status === 'UNRESOLVED') {
    return `#${selectedPin.pinNumber} · UNRESOLVED`;
  }
  if (resolved.status === 'NON_FINITE') {
    return `#${selectedPin.pinNumber} · INVALID`;
  }
  if (resolved.voltage === null) {
    return `#${selectedPin.pinNumber} · -- V`;
  }
  return `#${selectedPin.pinNumber} · ${resolved.voltage.toFixed(2)}V`;
}

export interface BenchReconciliationSnapshot {
  activeTab: LabTab;
  mobileBenchPane: BenchPaneKey;
  psuEnabled: boolean;
  voltageSettingKey: string;
  currentLimitKey: string;
  supplyCurrentDrawKey: string;
  isOcpTripped: boolean;
  dmmPowered: boolean;
  dmmMode: string;
  dmmDisplay: string;
  dmmUnit: string;
  dmmWarning: string;
  dmmEvidenceStatus: string;
  redProbePinId: string;
  redProbeLabel: string;
  blackProbePinId: string;
  blackProbeLabel: string;
  faultSignature: string;
  faultCount: number;
  latestFaultDescription: string;
  latestFaultType: string;
  cutWiresSignature: string;
  cutWireCount: number;
  wireCount: number;
  dtcCodesKey: string;
  dtcSummary: string;
  dtcCount: number;
  selectedPinId: string;
  selectedPinVoltageKey: string;
  solverStatus: string;
  signature: string;
}

export function createBenchReconciliationSnapshot(params: {
  activeTab: LabTab;
  mobileBenchPane: BenchPaneKey;
  powerSupply: PowerSupplyState;
  multimeter: MultimeterState;
  faults: InjectedFault[];
  wires: WireConnection[];
  selectedPinId: string | null;
  circuitSolution: CircuitSolution;
}): BenchReconciliationSnapshot {
  const {
    activeTab,
    mobileBenchPane,
    powerSupply,
    multimeter,
    faults,
    wires,
    selectedPinId,
    circuitSolution,
  } = params;

  const voltageSettingKey = powerSupply.voltageSetting.toFixed(2);
  const currentLimitKey = powerSupply.currentLimit.toFixed(2);
  const supplyCurrentDrawKey = circuitSolution.supplyCurrentDrawAmps.toFixed(2);
  const dmmDisplay = circuitSolution.multimeterReading.display;
  const dmmUnit = circuitSolution.multimeterReading.unit;
  const dmmWarning = circuitSolution.multimeterReading.warningMessage || '';
  const dmmEvidenceStatus = circuitSolution.multimeterReading.evidenceStatus || 'VALID';
  const redProbePinId = multimeter.redProbe.attachedToPinId || 'none';
  const blackProbePinId = multimeter.blackProbe.attachedToPinId || 'none';

  const faultSignature = faults
    .map((f) => `${f.pinId}:${f.faultType}:${f.customSeriesOhms ?? ''}`)
    .sort()
    .join(',');
  const latestFault = faults[faults.length - 1];

  const cutWireIds = wires
    .filter((w) => w.isCut)
    .map((w) => w.id)
    .sort();
  const cutWiresSignature = cutWireIds.join(',');

  const dtcCodesKey = circuitSolution.activeDTCs
    .map((d) => d.code)
    .sort()
    .join(',');
  const dtcSummary = circuitSolution.activeDTCs
    .map((d) => `${d.code} ${d.description}`)
    .join('; ');

  const resolvedSelectedPin = getValidatedPinVoltage(circuitSolution, selectedPinId);
  const selectedPinVoltageKey =
    resolvedSelectedPin.voltage !== null
      ? resolvedSelectedPin.voltage.toFixed(2)
      : resolvedSelectedPin.status;

  const solverStatus = circuitSolution.solverStatus || 'VALID';

  const signature = [
    activeTab,
    mobileBenchPane,
    powerSupply.isOutputEnabled ? '1' : '0',
    voltageSettingKey,
    currentLimitKey,
    supplyCurrentDrawKey,
    circuitSolution.isSupplyCurrentTripped ? '1' : '0',
    multimeter.isPowered ? '1' : '0',
    multimeter.mode,
    dmmDisplay,
    dmmUnit,
    dmmWarning,
    dmmEvidenceStatus,
    redProbePinId,
    blackProbePinId,
    faultSignature,
    cutWiresSignature,
    String(wires.length),
    dtcCodesKey,
    selectedPinId || 'none',
    selectedPinVoltageKey,
    solverStatus,
  ].join('|');

  return {
    activeTab,
    mobileBenchPane,
    psuEnabled: powerSupply.isOutputEnabled,
    voltageSettingKey,
    currentLimitKey,
    supplyCurrentDrawKey,
    isOcpTripped: circuitSolution.isSupplyCurrentTripped,
    dmmPowered: multimeter.isPowered,
    dmmMode: multimeter.mode,
    dmmDisplay,
    dmmUnit,
    dmmWarning,
    dmmEvidenceStatus,
    redProbePinId,
    redProbeLabel: multimeter.redProbe.attachedLabel || 'probe',
    blackProbePinId,
    blackProbeLabel: multimeter.blackProbe.attachedLabel || 'COM',
    faultSignature,
    faultCount: faults.length,
    latestFaultDescription: latestFault?.description || '',
    latestFaultType: latestFault?.faultType || '',
    cutWiresSignature,
    cutWireCount: cutWireIds.length,
    wireCount: wires.length,
    dtcCodesKey,
    dtcSummary,
    dtcCount: circuitSolution.activeDTCs.length,
    selectedPinId: selectedPinId || 'none',
    selectedPinVoltageKey,
    solverStatus,
    signature,
  };
}

export interface BenchReconciliationDiffResult {
  changed: boolean;
  faultChanged: boolean;
  probeOrMeterChanged: boolean;
  psuChanged: boolean;
  wiringChanged: boolean;
  readingChanged: boolean;
  navChanged: boolean;
  title: string;
  detail: string;
  spokenText: string;
  isSafetyAlert: boolean;
}

/**
 * Computes a complete, non-masking diff between two bench reconciliation snapshots
 * so changes to fault types, wire cuts, OCP trips, DMM readings, or probes are never dropped.
 */
export function diffBenchReconciliationSnapshots(
  prev: BenchReconciliationSnapshot,
  next: BenchReconciliationSnapshot
): BenchReconciliationDiffResult {
  if (prev.signature === next.signature) {
    return {
      changed: false,
      faultChanged: false,
      probeOrMeterChanged: false,
      psuChanged: false,
      wiringChanged: false,
      readingChanged: false,
      navChanged: false,
      title: '',
      detail: '',
      spokenText: '',
      isSafetyAlert: false,
    };
  }

  const faultChanged =
    next.dtcCodesKey !== prev.dtcCodesKey ||
    next.faultSignature !== prev.faultSignature ||
    next.isOcpTripped !== prev.isOcpTripped;

  const probeOrMeterChanged =
    next.redProbePinId !== prev.redProbePinId ||
    next.blackProbePinId !== prev.blackProbePinId ||
    next.dmmMode !== prev.dmmMode ||
    next.dmmPowered !== prev.dmmPowered;

  const psuChanged =
    next.psuEnabled !== prev.psuEnabled ||
    next.voltageSettingKey !== prev.voltageSettingKey ||
    next.currentLimitKey !== prev.currentLimitKey;

  const wiringChanged =
    next.cutWiresSignature !== prev.cutWiresSignature ||
    next.wireCount !== prev.wireCount;

  const readingChanged =
    next.dmmDisplay !== prev.dmmDisplay ||
    next.dmmUnit !== prev.dmmUnit ||
    next.dmmWarning !== prev.dmmWarning ||
    next.dmmEvidenceStatus !== prev.dmmEvidenceStatus ||
    next.supplyCurrentDrawKey !== prev.supplyCurrentDrawKey ||
    next.selectedPinVoltageKey !== prev.selectedPinVoltageKey ||
    next.solverStatus !== prev.solverStatus;

  const navChanged =
    next.activeTab !== prev.activeTab ||
    next.mobileBenchPane !== prev.mobileBenchPane;

  // Priority 1: OCP / Fault / DTC alert (includes live DMM reading so fault + reading never decouple)
  if (faultChanged) {
    if (next.isOcpTripped && !prev.isOcpTripped) {
      const msg = `PSU OCP TRIP (${next.supplyCurrentDrawKey}A / ${next.currentLimitKey}A limit) · DMM ${next.dmmDisplay} ${next.dmmUnit}`;
      return {
        changed: true,
        faultChanged,
        probeOrMeterChanged,
        psuChanged,
        wiringChanged,
        readingChanged,
        navChanged,
        title: 'OCP Safety Trip',
        detail: msg,
        spokenText: `Over current protection tripped at ${next.supplyCurrentDrawKey} amps.`,
        isSafetyAlert: true,
      };
    }

    if (next.dtcCount > 0) {
      const dtcMsg = `${next.dtcCount} Active DTC: ${next.dtcSummary} · DMM ${next.dmmDisplay} ${next.dmmUnit}`;
      return {
        changed: true,
        faultChanged,
        probeOrMeterChanged,
        psuChanged,
        wiringChanged,
        readingChanged,
        navChanged,
        title: 'Fault / DTC Alert',
        detail: dtcMsg,
        spokenText: `Fault detected. Active D T C ${next.dtcCodesKey.split(',').join(' and ')}.`,
        isSafetyAlert: true,
      };
    }

    if (next.faultCount > 0) {
      const msg = `${next.latestFaultDescription} (${next.latestFaultType}) · DMM ${next.dmmDisplay} ${next.dmmUnit} · 0 DTC`;
      return {
        changed: true,
        faultChanged,
        probeOrMeterChanged,
        psuChanged,
        wiringChanged,
        readingChanged,
        navChanged,
        title: 'Fault Injected',
        detail: msg,
        spokenText: `Fault injected: ${next.latestFaultDescription}. Multimeter reads ${next.dmmDisplay} ${next.dmmUnit}.`,
        isSafetyAlert: true,
      };
    }

    const recoveryMsg = `Nominal recovery · 0 active DTCs · PSU ${next.psuEnabled ? `${next.voltageSettingKey}V` : 'OFF'} · DMM ${next.dmmDisplay} ${next.dmmUnit}`;
    return {
      changed: true,
      faultChanged,
      probeOrMeterChanged,
      psuChanged,
      wiringChanged,
      readingChanged,
      navChanged,
      title: 'Nominal Recovery',
      detail: recoveryMsg,
      spokenText: 'All faults cleared. Nominal bench state restored.',
      isSafetyAlert: false,
    };
  }

  // Priority 2: Harness cut/wire topology change + immediate reading feedback
  if (wiringChanged) {
    const wireMsg =
      next.cutWireCount > prev.cutWireCount
        ? `Wire opened/cut (${next.cutWireCount} cut) · DMM ${next.dmmDisplay} ${next.dmmUnit}`
        : next.cutWireCount < prev.cutWireCount
          ? `Wire repaired/reconnected · DMM ${next.dmmDisplay} ${next.dmmUnit}`
          : `Harness updated (${next.wireCount} wires) · DMM ${next.dmmDisplay} ${next.dmmUnit}`;
    return {
      changed: true,
      faultChanged,
      probeOrMeterChanged,
      psuChanged,
      wiringChanged,
      readingChanged,
      navChanged,
      title: 'Harness Topology Updated',
      detail: wireMsg,
      spokenText: `${wireMsg.split('·')[0].trim()}. Multimeter reads ${next.dmmDisplay} ${next.dmmUnit}.`,
      isSafetyAlert: next.cutWireCount > prev.cutWireCount,
    };
  }

  // Priority 3: Probe or DMM mode/power update
  if (probeOrMeterChanged) {
    if (!next.dmmPowered) {
      return {
        changed: true,
        faultChanged,
        probeOrMeterChanged,
        psuChanged,
        wiringChanged,
        readingChanged,
        navChanged,
        title: `DMM · OFF`,
        detail: 'Digital Multimeter powered OFF',
        spokenText: 'Digital multimeter powered off.',
        isSafetyAlert: false,
      };
    }
    const warning = next.dmmWarning;
    const readingText = warning
      ? warning
      : `${next.redProbeLabel} (${next.dmmMode}): ${next.dmmDisplay} ${next.dmmUnit}`;
    return {
      changed: true,
      faultChanged,
      probeOrMeterChanged,
      psuChanged,
      wiringChanged,
      readingChanged,
      navChanged,
      title: `DMM · ${next.dmmMode}`,
      detail: readingText,
      spokenText: warning
        ? `Multimeter warning. ${warning}`
        : `Probe on ${next.redProbeLabel}. Reading ${next.dmmDisplay} ${next.dmmUnit}.`,
      isSafetyAlert: Boolean(warning),
    };
  }

  // Priority 4: PSU toggle / voltage / current limit change
  if (psuChanged) {
    const msg = next.psuEnabled
      ? `PSU ON · ${next.voltageSettingKey}V · ${next.supplyCurrentDrawKey}A · DMM ${next.dmmDisplay} ${next.dmmUnit}`
      : `PSU Output OFF (Key-OFF) · DMM ${next.dmmDisplay} ${next.dmmUnit}`;
    return {
      changed: true,
      faultChanged,
      probeOrMeterChanged,
      psuChanged,
      wiringChanged,
      readingChanged,
      navChanged,
      title: 'Power Supply Updated',
      detail: msg,
      spokenText: next.psuEnabled
        ? `Power supply on at ${Number(next.voltageSettingKey).toFixed(1)} volts, drawing ${next.supplyCurrentDrawKey} amps.`
        : 'Power supply output switched off.',
      isSafetyAlert: false,
    };
  }

  // Priority 5: Downstream MNA solver reading update (e.g., TPS slider, component change, unresolved node)
  if (readingChanged) {
    const msg = next.dmmWarning
      ? next.dmmWarning
      : `Live MNA Sync · DMM ${next.dmmDisplay} ${next.dmmUnit} · PSU ${next.psuEnabled ? `${next.supplyCurrentDrawKey}A` : 'OFF'}`;
    return {
      changed: true,
      faultChanged,
      probeOrMeterChanged,
      psuChanged,
      wiringChanged,
      readingChanged,
      navChanged,
      title: `Live Reading · ${next.dmmMode}`,
      detail: msg,
      spokenText: next.dmmWarning
        ? `Multimeter warning. ${next.dmmWarning}`
        : `Live reading updated to ${next.dmmDisplay} ${next.dmmUnit}.`,
      isSafetyAlert: next.solverStatus === 'UNRESOLVED' || next.solverStatus === 'NON_FINITE',
    };
  }

  // Priority 6: Workspace navigation
  const viewLabel =
    next.activeTab === 'BENCH_LAB'
      ? `Bench Lab · ${PANE_LABELS_MAP[next.mobileBenchPane]}`
      : next.activeTab.replace(/_/g, ' ');
  return {
    changed: true,
    faultChanged,
    probeOrMeterChanged,
    psuChanged,
    wiringChanged,
    readingChanged,
    navChanged,
    title: 'Workspace Navigation',
    detail: viewLabel,
    spokenText: `Focused ${viewLabel}.`,
    isSafetyAlert: false,
  };
}

/**
 * Returns true if a Voice Coach turn embeds live simulated bench measurements
 * and should auto-reconcile when `circuitSolution` / `telemetry` changes while open.
 */
export function isLiveTelemetryTurnIntent(
  intent: VoiceCoachIntent | undefined,
  transcript: string
): boolean {
  if (!intent) return false;
  if (
    intent === 'LIVE_BENCH_STATUS' ||
    intent === 'READING_EVALUATION' ||
    intent === 'DIRECT_PROBE_QUERY'
  ) {
    return true;
  }
  if (intent === 'PINOUT_OR_ECU_LOOKUP' && /\bpin\s*#?\d+\b/i.test(transcript)) {
    return true;
  }
  return isLiveTelemetryQuery(transcript, intent);
}
